from __future__ import annotations

import math
import random
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from shapely.geometry import Polygon, Point, box

from backend.core.models import LayoutEntity, CellTemplateType, PlotSchema
from backend.plugins.cms.cell_templates import build_cell_layout, CellPlacementResult


def compute_inter_cell_flow(
    cell_assignment: Dict[str, int],
    part_routings: List[Any],
    num_cells: int
) -> np.ndarray:
    """Computes inter-cell material flow trip matrix F[k1, k2]."""
    F = np.zeros((num_cells, num_cells))

    for routing in part_routings:
        trips = math.ceil(routing.annual_demand / max(1, routing.batch_size))
        seq = routing.sequence
        for s in range(len(seq) - 1):
            m1 = seq[s].machine_type
            m2 = seq[s + 1].machine_type
            c1 = cell_assignment.get(m1, -1)
            c2 = cell_assignment.get(m2, -1)
            if c1 != -1 and c2 != -1 and c1 != c2:
                F[c1, c2] += trips
                F[c2, c1] += trips
    return F


def run_corelap_seeding(
    plot_boundary: Polygon,
    cell_groups: Dict[int, List[LayoutEntity]],
    flow_matrix: np.ndarray,
    slp_matrix: Optional[np.ndarray] = None
) -> List[Tuple[int, Tuple[float, float], float, CellTemplateType]]:
    """
    CORELAP (Computerized Relationship Layout Planning):
    1. Computes Total Closeness Rating (TCR) for each cell.
    2. Places the most critical cell at the plot center / dock proximity.
    3. Places subsequent cells adjacent to already-placed cells to maximize closeness.
    Returns list of (cell_id, (center_x, center_y), rotation_deg, template_type).
    """
    num_cells = len(cell_groups)
    minx, miny, maxx, maxy = plot_boundary.bounds
    cx, cy = (minx + maxx) / 2.0, (miny + maxy) / 2.0

    # 1. Calculate TCR (Total Closeness Rating)
    if slp_matrix is not None:
        rel_mat = slp_matrix
    else:
        # Normalize flow matrix to SLP-like ratings (0 to 10)
        max_f = np.max(flow_matrix) if np.max(flow_matrix) > 0 else 1.0
        rel_mat = (flow_matrix / max_f) * 10.0

    tcrs = [float(np.sum(rel_mat[k])) for k in range(num_cells)]
    unplaced = list(range(num_cells))
    
    # 2. Pick cell with highest TCR first
    first_cell = int(np.argmax(tcrs))
    unplaced.remove(first_cell)
    
    placements = []
    # Place first cell in center
    placements.append((first_cell, (cx, cy), 0.0, CellTemplateType.U_SHAPED))
    placed = [first_cell]

    # Slot positions around center
    radius = max((maxx - minx), (maxy - miny)) * 0.28
    slot_angles = [0.0, 90.0, 180.0, 270.0, 45.0, 135.0, 225.0, 315.0]

    while unplaced:
        # Find unplaced cell with highest total relationship to placed cells
        best_candidate = unplaced[0]
        best_rel = -1.0
        for cand in unplaced:
            rel_sum = sum(rel_mat[cand, p] for p in placed)
            if rel_sum > best_rel:
                best_rel = rel_sum
                best_candidate = cand

        slot_idx = len(placed) - 1
        angle_deg = slot_angles[slot_idx % len(slot_angles)]
        rad = math.radians(angle_deg)
        pos_x = cx + radius * math.cos(rad)
        pos_y = cy + radius * math.sin(rad)
        
        # Clamp within plot
        pos_x = float(np.clip(pos_x, minx + 4.0, maxx - 4.0))
        pos_y = float(np.clip(pos_y, miny + 4.0, maxy - 4.0))

        # Rotate cell towards center
        rot = (angle_deg + 180.0) % 360.0
        rot = round(rot / 90.0) * 90.0  # Snap to 90 deg increments

        placements.append((best_candidate, (pos_x, pos_y), rot, CellTemplateType.U_SHAPED))
        placed.append(best_candidate)
        unplaced.remove(best_candidate)

    return placements


def run_aldep_seeding(
    plot_boundary: Polygon,
    cell_groups: Dict[int, List[LayoutEntity]],
    flow_matrix: np.ndarray,
    sweep_width_m: float = 8.0
) -> List[Tuple[int, Tuple[float, float], float, CellTemplateType]]:
    """
    ALDEP (Automated Layout Design Program):
    Places macro cells in serpentine vertical/horizontal strips across the hall.
    """
    num_cells = len(cell_groups)
    minx, miny, maxx, maxy = plot_boundary.bounds
    w = maxx - minx
    h = maxy - miny

    # Serpentine strip layout
    placements = []
    cols = max(1, math.ceil(math.sqrt(num_cells)))
    rows = math.ceil(num_cells / cols)

    cell_w = w / cols
    cell_h = h / rows

    cell_ids = list(cell_groups.keys())
    # Order cells by interaction strength
    cell_order = sorted(cell_ids, key=lambda k: np.sum(flow_matrix[k]), reverse=True)

    idx = 0
    for r in range(rows):
        # Serpentine: even rows left->right, odd rows right->left
        c_range = range(cols) if r % 2 == 0 else range(cols - 1, -1, -1)
        for c in c_range:
            if idx >= len(cell_order):
                break
            cell_id = cell_order[idx]
            px = minx + (c + 0.5) * cell_w
            py = miny + (r + 0.5) * cell_h
            rot = 0.0 if r % 2 == 0 else 180.0
            
            tmpl = CellTemplateType.U_SHAPED if len(cell_groups[cell_id]) >= 3 else CellTemplateType.LINEAR
            placements.append((cell_id, (px, py), rot, tmpl))
            idx += 1

    return placements
