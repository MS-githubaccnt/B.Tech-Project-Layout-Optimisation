from __future__ import annotations

import math
import random
from typing import Any, Dict, List, Optional, Tuple
import torch
import torch.nn as nn
import torch.nn.functional as F

from backend.ml.graph_builder import LayoutGraphData, build_layout_graph
from backend.core.models import LayoutEntity, ProjectConfig, ProjectMode


class EdgeConditionedGATv2Layer(nn.Module):
    """
    Multi-Head Edge-Conditioned Graph Attention Network Layer (GATv2):
    Calculates dynamic attention coefficients conditioned on source node, target node,
    and connecting flow/spatial edge attributes.
    """
    def __init__(self, in_features: int, edge_features: int, out_features: int, heads: int = 4):
        super().__init__()
        self.in_features = in_features
        self.out_features = out_features
        self.heads = heads
        self.head_dim = out_features // heads

        self.lin_src = nn.Linear(in_features, out_features, bias=False)
        self.lin_dst = nn.Linear(in_features, out_features, bias=False)
        self.lin_edge = nn.Linear(edge_features, out_features, bias=False)

        self.attn = nn.Parameter(torch.Tensor(1, heads, self.head_dim))
        self.bias = nn.Parameter(torch.zeros(out_features))
        self.norm = nn.LayerNorm(out_features)

        nn.init.xavier_uniform_(self.attn)

    def forward(
        self,
        h: torch.Tensor,
        edge_index: torch.Tensor,
        edge_attr: torch.Tensor
    ) -> torch.Tensor:
        N = h.size(0)
        h_src = self.lin_src(h).view(N, self.heads, self.head_dim)
        h_dst = self.lin_dst(h).view(N, self.heads, self.head_dim)

        if edge_index.size(1) == 0:
            return self.norm(h_src.view(N, -1))

        src, dst = edge_index[0], edge_index[1]
        e_proj = self.lin_edge(edge_attr).view(-1, self.heads, self.head_dim)

        # GATv2 scoring: a^T * LeakyReLU(W_src * h_i + W_dst * h_j + W_e * e_ij)
        edge_val = F.leaky_relu(h_src[src] + h_dst[dst] + e_proj, negative_slope=0.2)
        alpha = (edge_val * self.attn).sum(dim=-1)  # [E, heads]

        # Softmax over incoming edges
        alpha = torch.exp(alpha - alpha.max(dim=0, keepdim=True)[0])
        denom = torch.zeros(N, self.heads, device=h.device).scatter_add_(0, dst.unsqueeze(-1).expand(-1, self.heads), alpha) + 1e-6
        alpha = alpha / denom[dst]

        # Message aggregation
        msg = (h_src[src] + e_proj) * alpha.unsqueeze(-1)
        out = torch.zeros(N, self.heads, self.head_dim, device=h.device)
        out.scatter_add_(0, dst.view(-1, 1, 1).expand(-1, self.heads, self.head_dim), msg)
        out = out.view(N, -1) + self.bias

        # Residual skip connection if dimensions match
        if self.in_features == self.out_features:
            out = out + h
        return self.norm(out)


class LayoutGATv2Surrogate(nn.Module):
    """
    Heterogeneous Spatial-Flow GNN Surrogate Model:
    Evaluates candidate factory layouts in < 20 ms.
    Predicts (Z1: Flow / Cycle Cost, Z2: Spatial / Safety Penalty).
    """
    def __init__(self, node_dim: int = 14, edge_dim: int = 5, hidden_dim: int = 64, heads: int = 4):
        super().__init__()
        self.node_proj = nn.Linear(node_dim, hidden_dim)
        
        self.layer1 = EdgeConditionedGATv2Layer(hidden_dim, edge_dim, hidden_dim, heads=heads)
        self.layer2 = EdgeConditionedGATv2Layer(hidden_dim, edge_dim, hidden_dim, heads=heads)
        self.layer3 = EdgeConditionedGATv2Layer(hidden_dim, edge_dim, hidden_dim, heads=heads)

        # Readout: Global MeanPool + MaxPool (2 * hidden_dim) + global context (4)
        pool_dim = hidden_dim * 2 + 4
        
        # Multi-head predictor for Z1 and Z2
        self.mlp_head = nn.Sequential(
            nn.Linear(pool_dim, 128),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(128, 64),
            nn.GELU(),
            nn.Linear(64, 2)
        )

    def forward(self, graph: LayoutGraphData) -> torch.Tensor:
        h = F.gelu(self.node_proj(graph.node_features))
        h = self.layer1(h, graph.edge_index, graph.edge_attr)
        h = self.layer2(h, graph.edge_index, graph.edge_attr)
        h = self.layer3(h, graph.edge_index, graph.edge_attr)

        # Graph-level pooling
        mean_pool = h.mean(dim=0)
        max_pool = h.max(dim=0)[0]
        graph_emb = torch.cat([mean_pool, max_pool, graph.global_context], dim=-1)

        scores = self.mlp_head(graph_emb.unsqueeze(0))
        return scores.squeeze(0)  # [2] -> [Z1, Z2]


class SurrogateManager:
    """
    Surrogate-Assisted Evolutionary Algorithm (SAEA) Manager:
    - Maintains pretrained or dynamically fine-tuned GNN model
    - Rapidly screens population in < 20 ms
    - Filters elite candidates for exact physics evaluation
    """
    def __init__(self, mode: ProjectMode = ProjectMode.CELLULAR_CMS):
        self.mode = mode
        self.model = LayoutGATv2Surrogate()
        self.model.eval()
        self.training_buffer: List[Tuple[LayoutGraphData, torch.Tensor]] = []
        self.optimizer = torch.optim.AdamW(self.model.parameters(), lr=1e-3, weight_decay=1e-4)
        self.huber_loss = nn.SmoothL1Loss()
        self.ranking_loss = nn.MarginRankingLoss(margin=0.1)

    def predict_candidate(self, config: ProjectConfig, entities: List[LayoutEntity]) -> Tuple[float, float]:
        """Runs fast sub-20ms surrogate forward pass on candidate layout."""
        graph = build_layout_graph(config, entities)
        with torch.no_grad():
            scores = self.model(graph)
            z1 = max(1.0, float(scores[0]))
            z2 = max(1.0, float(scores[1]))
            return z1, z2

    def record_ground_truth(self, config: ProjectConfig, entities: List[LayoutEntity], true_z1: float, true_z2: float):
        """Records ground truth physics evaluation into training buffer."""
        graph = build_layout_graph(config, entities)
        target = torch.tensor([true_z1, true_z2], dtype=torch.float32)
        self.training_buffer.append((graph, target))

        # Online fine-tuning if enough samples
        if len(self.training_buffer) >= 32 and len(self.training_buffer) % 16 == 0:
            self._train_step()

    def _train_step(self):
        self.model.train()
        batch_samples = random.sample(self.training_buffer, min(32, len(self.training_buffer)))
        total_loss = 0.0

        for graph, target in batch_samples:
            self.optimizer.zero_grad()
            pred = self.model(graph)
            loss = self.huber_loss(pred, target)
            loss.backward()
            self.optimizer.step()
            total_loss += float(loss)

        self.model.eval()
