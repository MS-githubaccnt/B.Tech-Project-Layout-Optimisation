from __future__ import annotations

import os
import sys
import time
import math
import random
from typing import List, Tuple
import torch
import torch.nn as nn
import numpy as np

from backend.ml.data_gen import generate_synthetic_cms_scenario, generate_synthetic_robotic_scenario
from backend.ml.graph_builder import build_layout_graph, LayoutGraphData
from backend.ml.gnn_surrogate import LayoutGATv2Surrogate
from backend.core.optimizer import FacilityLayoutProblem
from backend.core.models import ProjectMode, ProjectConfig


def generate_labeled_dataset(num_samples: int = 150) -> List[Tuple[LayoutGraphData, torch.Tensor]]:
    """
    Generates synthetic parametric layouts across Mode A and Mode B,
    labeled with ground-truth physics evaluations (Z1, Z2).
    """
    dataset = []
    print(f"Generating and labeling {num_samples} layout samples with exact physics...")
    start_t = time.time()

    for idx in range(num_samples):
        # 50% Mode A, 50% Mode B
        if idx % 2 == 0:
            cfg = generate_synthetic_cms_scenario(
                num_machines=random.randint(8, 16),
                num_parts=random.randint(3, 8)
            )
            prob = FacilityLayoutProblem(cfg, enable_repair=False)
            z1, z2 = prob._eval_cms(cfg.entities)
        else:
            cfg = generate_synthetic_robotic_scenario(
                num_robots=random.randint(2, 4),
                num_stations=random.randint(3, 6)
            )
            prob = FacilityLayoutProblem(cfg, enable_repair=False)
            z1, z2 = prob._eval_robotic(cfg.entities)

        # Build heterogeneous graph
        graph = build_layout_graph(cfg, cfg.entities)

        # Scale targets into log space for numerical stability
        log_z1 = math.log10(max(1.0, z1))
        log_z2 = math.log10(max(1.0, z2))
        target = torch.tensor([log_z1, log_z2], dtype=torch.float32)

        dataset.append((graph, target))

        if (idx + 1) % 50 == 0:
            print(f"  Processed {idx + 1}/{num_samples} layouts (Elapsed: {time.time() - start_t:.1f}s)")

    print(f"Dataset generated in {time.time() - start_t:.1f}s.")
    return dataset


def train_surrogate_model(
    num_samples: int = 200,
    epochs: int = 40,
    lr: float = 1e-3,
    save_path: str = "backend/ml/gnn_surrogate_weights.pt"
) -> LayoutGATv2Surrogate:
    """
    Trains the LayoutGATv2Surrogate using Huber regression loss + Margin Ranking Loss.
    """
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Using training device: {device}")

    dataset = generate_labeled_dataset(num_samples)
    random.shuffle(dataset)

    split = int(0.85 * len(dataset))
    train_data = dataset[:split]
    val_data = dataset[split:]

    model = LayoutGATv2Surrogate().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    huber_loss = nn.SmoothL1Loss()
    ranking_loss = nn.MarginRankingLoss(margin=0.05)

    best_val_loss = float('inf')

    print(f"Beginning training across {epochs} epochs (Train: {len(train_data)}, Val: {len(val_data)})...")

    for epoch in range(1, epochs + 1):
        model.train()
        total_train_loss = 0.0

        for i, (graph, target) in enumerate(train_data):
            graph.node_features = graph.node_features.to(device)
            graph.edge_index = graph.edge_index.to(device)
            graph.edge_attr = graph.edge_attr.to(device)
            graph.global_context = graph.global_context.to(device)
            target = target.to(device)

            optimizer.zero_grad()
            pred = model(graph)
            loss_reg = huber_loss(pred, target)

            # Pairwise ranking loss with a random peer sample
            peer_idx = (i + 1) % len(train_data)
            peer_graph, peer_target = train_data[peer_idx]
            peer_graph.node_features = peer_graph.node_features.to(device)
            peer_graph.edge_index = peer_graph.edge_index.to(device)
            peer_graph.edge_attr = peer_graph.edge_attr.to(device)
            peer_graph.global_context = peer_graph.global_context.to(device)
            with torch.no_grad():
                peer_pred = model(peer_graph)

            # Target 1 (Z1) ranking
            y_rank = torch.tensor([1.0 if target[0] > peer_target[0] else -1.0], device=device)
            loss_rank = ranking_loss(pred[0].unsqueeze(0), peer_pred[0].unsqueeze(0), y_rank)

            total_loss = loss_reg + 0.3 * loss_rank
            total_loss.backward()
            optimizer.step()

            total_train_loss += float(total_loss.detach().cpu())

        avg_train_loss = total_train_loss / len(train_data)

        # Validation
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for graph, target in val_data:
                graph.node_features = graph.node_features.to(device)
                graph.edge_index = graph.edge_index.to(device)
                graph.edge_attr = graph.edge_attr.to(device)
                graph.global_context = graph.global_context.to(device)
                target = target.to(device)
                pred = model(graph)
                val_loss += float(huber_loss(pred, target))

        avg_val_loss = val_loss / max(1, len(val_data))

        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            # Save checkpoint
            torch.save(model.state_dict(), save_path)

        if epoch % 10 == 0 or epoch == epochs:
            print(f"Epoch {epoch:02d}/{epochs:02d} | Train Loss: {avg_train_loss:.4f} | Val Loss: {avg_val_loss:.4f} (Best: {best_val_loss:.4f})")

    print(f"Training complete. Weights saved to {save_path}")
    return model


if __name__ == "__main__":
    train_surrogate_model(num_samples=160, epochs=30)
