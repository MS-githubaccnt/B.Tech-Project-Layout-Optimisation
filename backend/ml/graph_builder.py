from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import torch
from shapely.geometry import Point, Polygon

from backend.core.models import LayoutEntity, PlotSchema, ProjectConfig, ProjectMode
from backend.core.geometry import create_base_polygon, create_clearance_polygon


class LayoutGraphData:
    def __init__(
        self,
        node_features: torch.Tensor,       # [N, 14]
        edge_index: torch.Tensor,          # [2, E]
        edge_attr: torch.Tensor,           # [E, 5]
        global_context: torch.Tensor,      # [4]
        entity_ids: List[str]
    ):
        self.node_features = node_features
        self.edge_index = edge_index
        self.edge_attr = edge_attr
        self.global_context = global_context
        self.entity_ids = entity_ids


def build_layout_graph(
    config: ProjectConfig,
    entities: List[LayoutEntity]
) -> LayoutGraphData:
    """
    Constructs a heterogeneous spatial-flow graph representation G = (V, E_flow, E_spatial)
    with 14 node features, flow edges, and k-NN spatial proximity edges.
    """
    plot_boundary = Polygon(config.plot.boundary)
    minx, miny, maxx, maxy = plot_boundary.bounds
    pw = max(1.0, maxx - minx)
    ph = max(1.0, maxy - miny)
    n = len(entities)

    category_map = {
        "vmc": 1.0, "cnc_turning": 2.0, "grinder": 3.0, "cmm": 4.0,
        "robot_6axis": 5.0, "human_station": 6.0, "fixture": 7.0,
        "feeder": 8.0, "welder": 9.0, "inspection": 10.0
    }

    # 1. Compute Node Features [N, 14]
    nodes = []
    for e in entities:
        norm_x = (e.x - minx) / pw
        norm_y = (e.y - miny) / ph
        norm_l = e.dimensions.L / pw
        norm_w = e.dimensions.W / ph
        
        rad = math.radians(e.theta)
        sin_t = math.sin(rad)
        cos_t = math.cos(rad)
        
        cat_code = category_map.get(e.category, 0.0) / 10.0
        
        # Calculate inflow/outflow
        flow_vol = 0.0
        for routing in config.part_routings:
            for step in routing.sequence:
                if step.machine_type == e.model or step.machine_type == e.category:
                    flow_vol += routing.annual_demand / 1000.0

        r_max = e.kinematics.r_max_m / 5.0 if e.kinematics else 0.0
        haz_score = len(e.hazard_tags) * 0.5
        
        base_a = e.dimensions.L * e.dimensions.W
        clear_a = (e.dimensions.L + e.clearances.left + e.clearances.right) * (e.dimensions.W + e.clearances.front + e.clearances.back)
        clear_ratio = clear_a / max(0.1, base_a)

        # Distance to nearest wall
        pt = Point(e.x, e.y)
        wall_dist = float(plot_boundary.exterior.distance(pt)) / max(pw, ph)

        # Distance to primary dock
        d_pt = config.plot.docks[0].point if config.plot.docks else [minx, miny]
        dock_dist = math.hypot(e.x - d_pt[0], e.y - d_pt[1]) / max(pw, ph)

        is_pinned_val = 1.0 if e.is_pinned else 0.0

        feat = [
            norm_x, norm_y, norm_l, norm_w, sin_t, cos_t,
            cat_code, flow_vol, r_max, haz_score, clear_ratio,
            wall_dist, dock_dist, is_pinned_val
        ]
        nodes.append(feat)

    # 2. Compute Edges (Flow + Spatial k-NN)
    src_nodes = []
    dst_nodes = []
    edge_attrs = []

    # Pairwise geometric calculations
    for i in range(n):
        # Find 4 nearest neighbors for spatial edges
        dists = []
        for j in range(n):
            if i != j:
                d = math.hypot(entities[i].x - entities[j].x, entities[i].y - entities[j].y)
                dists.append((d, j))
        dists.sort(key=lambda x: x[0])

        # Add k-NN spatial edges (k=4)
        for d, j in dists[:min(4, len(dists))]:
            src_nodes.append(i)
            dst_nodes.append(j)

            # Edge attributes: [flow, euclid_dist, manhattan_dist, is_same_cell, overlap_area]
            euclid = d / max(pw, ph)
            manhattan = (abs(entities[i].x - entities[j].x) + abs(entities[i].y - entities[j].y)) / max(pw, ph)
            same_cell = 1.0 if (entities[i].cell_id is not None and entities[i].cell_id == entities[j].cell_id) else 0.0
            
            # Check overlap
            poly_i = create_base_polygon(entities[i])
            poly_j = create_base_polygon(entities[j])
            overlap = poly_i.intersection(poly_j).area if poly_i.intersects(poly_j) else 0.0

            edge_attrs.append([0.0, euclid, manhattan, same_cell, overlap])

    # Add Flow Edges from part routings
    for routing in config.part_routings:
        vol = (routing.annual_demand / 1000.0)
        seq = routing.sequence
        for s in range(len(seq) - 1):
            t1, t2 = seq[s].machine_type, seq[s + 1].machine_type
            i1 = next((idx for idx, e in enumerate(entities) if e.model == t1 or e.category == t1), None)
            i2 = next((idx for idx, e in enumerate(entities) if e.model == t2 or e.category == t2), None)
            if i1 is not None and i2 is not None and i1 != i2:
                src_nodes.append(i1)
                dst_nodes.append(i2)
                d_e = math.hypot(entities[i1].x - entities[i2].x, entities[i1].y - entities[i2].y) / max(pw, ph)
                d_m = (abs(entities[i1].x - entities[i2].x) + abs(entities[i1].y - entities[i2].y)) / max(pw, ph)
                edge_attrs.append([vol, d_e, d_m, 1.0, 0.0])

    # Global Plot Context: [area_fill_ratio, plot_aspect_ratio, obstacle_density, aisle_width_ratio]
    total_m_area = sum(e.dimensions.L * e.dimensions.W for e in entities)
    fill_ratio = total_m_area / max(1.0, plot_boundary.area)
    aspect_ratio = pw / ph
    obs_density = len(config.plot.no_go_zones) / 10.0
    aisle_ratio = config.plot.min_aisle_width_m / pw
    global_ctx = [fill_ratio, aspect_ratio, obs_density, aisle_ratio]

    return LayoutGraphData(
        node_features=torch.tensor(nodes, dtype=torch.float32),
        edge_index=torch.tensor([src_nodes, dst_nodes], dtype=torch.long) if src_nodes else torch.zeros((2, 0), dtype=torch.long),
        edge_attr=torch.tensor(edge_attrs, dtype=torch.float32) if edge_attrs else torch.zeros((0, 5), dtype=torch.float32),
        global_context=torch.tensor(global_ctx, dtype=torch.float32),
        entity_ids=[e.id for e in entities]
    )
