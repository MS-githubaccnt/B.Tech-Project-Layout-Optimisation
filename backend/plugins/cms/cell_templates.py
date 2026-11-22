from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple
import shapely
from shapely.geometry import Polygon, Point, box
from shapely import affinity

from backend.core.models import LayoutEntity, CellTemplateType, Port


class CellPlacementResult:
    def __init__(
        self,
        cell_id: int,
        template_type: CellTemplateType,
        placed_entities: List[LayoutEntity],
        composite_boundary: Polygon,
        operator_walkway: Polygon,
        input_port: Tuple[float, float],
        output_port: Tuple[float, float],
        width: float,
        length: float
    ):
        self.cell_id = cell_id
        self.template_type = template_type
        self.placed_entities = placed_entities
        self.composite_boundary = composite_boundary
        self.operator_walkway = operator_walkway
        self.input_port = input_port
        self.output_port = output_port
        self.width = width
        self.length = length


def build_u_shaped_cell(
    cell_id: int,
    entities: List[LayoutEntity],
    cell_origin: Tuple[float, float] = (0.0, 0.0),
    rotation_deg: float = 0.0,
    walkway_width: float = 1.8
) -> CellPlacementResult:
    """
    Arranges machines in a U-shape:
    - Left column: incoming operations
    - Bottom row: apex operations
    - Right column: outgoing operations
    - Center: operator walkway
    - Ports: entry & exit at the open top of the U
    """
    n = len(entities)
    placed: List[LayoutEntity] = []
    
    if n == 1:
        # Fallback to single machine
        e = entities[0].model_copy(deep=True)
        e.cell_id = cell_id
        e.cell_template = CellTemplateType.U_SHAPED
        e.x, e.y, e.theta = cell_origin[0], cell_origin[1], rotation_deg
        placed.append(e)
        poly = box(cell_origin[0] - 2, cell_origin[1] - 2, cell_origin[0] + 2, cell_origin[1] + 2)
        return CellPlacementResult(
            cell_id=cell_id,
            template_type=CellTemplateType.U_SHAPED,
            placed_entities=placed,
            composite_boundary=poly,
            operator_walkway=poly,
            input_port=cell_origin,
            output_port=cell_origin,
            width=4.0,
            length=4.0
        )

    # Partition entities into Left wing, Bottom apex, Right wing
    left_count = math.ceil(n / 3.0)
    right_count = math.ceil(n / 3.0)
    bottom_count = n - left_count - right_count
    if bottom_count == 0 and n >= 3:
        bottom_count = 1
        left_count = max(1, left_count - 1)

    left_entities = entities[:left_count]
    bottom_entities = entities[left_count:left_count + bottom_count]
    right_entities = entities[left_count + bottom_count:]

    # Calculate layout bounds in local coordinates
    max_m_len = max(e.dimensions.L for e in entities)
    max_m_wid = max(e.dimensions.W for e in entities)

    left_spacing = max(e.dimensions.W + 0.6 for e in left_entities) if left_entities else max_m_wid
    right_spacing = max(e.dimensions.W + 0.6 for e in right_entities) if right_entities else max_m_wid
    bottom_spacing = max(e.dimensions.L + 0.6 for e in bottom_entities) if bottom_entities else max_m_len

    u_inner_w = max(walkway_width, max(len(bottom_entities) * bottom_spacing, 2.5))
    u_depth = max(len(left_entities) * left_spacing, len(right_entities) * right_spacing, 3.5)

    # Local coordinates (U opens towards +Y):
    # Left wing: x = -u_inner_w/2 - max_m_len/2, y descends from u_depth to 0, facing +X (theta = 90)
    curr_y = u_depth
    for e_orig in left_entities:
        e = e_orig.model_copy(deep=True)
        e.cell_id = cell_id
        e.cell_template = CellTemplateType.U_SHAPED
        e.theta = 90.0
        e.x = -u_inner_w / 2.0 - e.dimensions.L / 2.0
        e.y = curr_y - e.dimensions.W / 2.0
        curr_y -= (e.dimensions.W + 0.8)
        placed.append(e)

    # Bottom apex: y = -max_m_wid/2, x moves from left to right, facing +Y (theta = 0)
    if bottom_entities:
        start_x = -u_inner_w / 2.0 + 0.5
        x_step = u_inner_w / max(1, len(bottom_entities))
        for idx, e_orig in enumerate(bottom_entities):
            e = e_orig.model_copy(deep=True)
            e.cell_id = cell_id
            e.cell_template = CellTemplateType.U_SHAPED
            e.theta = 0.0
            e.x = start_x + (idx + 0.5) * x_step
            e.y = -e.dimensions.W / 2.0
            placed.append(e)

    # Right wing: x = +u_inner_w/2 + max_m_len/2, y ascends towards open top, facing -X (theta = 270)
    curr_y = 0.0 if not bottom_entities else 0.8
    for e_orig in right_entities:
        e = e_orig.model_copy(deep=True)
        e.cell_id = cell_id
        e.cell_template = CellTemplateType.U_SHAPED
        e.theta = 270.0
        e.x = u_inner_w / 2.0 + e.dimensions.L / 2.0
        e.y = curr_y + e.dimensions.W / 2.0
        curr_y += (e.dimensions.W + 0.8)
        placed.append(e)

    # Walkway polygon in local coordinates
    local_walkway = box(-u_inner_w / 2.0, 0.0, u_inner_w / 2.0, u_depth + 1.0)
    
    # Cell bounding envelope
    min_x = min(e.x - e.dimensions.L for e in placed) - 0.5
    max_x = max(e.x + e.dimensions.L for e in placed) + 0.5
    min_y = min(e.y - e.dimensions.W for e in placed) - 0.5
    max_y = max(e.y + e.dimensions.W for e in placed) + 0.5
    local_composite = box(min_x, min_y, max_x, max_y)

    local_in_port = (-u_inner_w / 2.0, u_depth)
    local_out_port = (u_inner_w / 2.0, u_depth)

    # Rigid transformation to (cell_origin, rotation_deg)
    rad = math.radians(rotation_deg)
    cos_t, sin_t = math.cos(rad), math.sin(rad)
    ox, oy = cell_origin

    def transform_pt(px: float, py: float) -> Tuple[float, float]:
        return (ox + px * cos_t - py * sin_t, oy + px * sin_t + py * cos_t)

    # Transform all placed entities
    for e in placed:
        # Update theta
        e.theta = (e.theta + rotation_deg) % 360.0
        wx, wy = transform_pt(e.x, e.y)
        e.x, e.y = wx, wy

    # Transform polygons
    rot_comp = affinity.rotate(local_composite, rotation_deg, origin=(0, 0))
    trans_comp = affinity.translate(rot_comp, ox, oy)
    
    rot_walk = affinity.rotate(local_walkway, rotation_deg, origin=(0, 0))
    trans_walk = affinity.translate(rot_walk, ox, oy)

    in_world = transform_pt(local_in_port[0], local_in_port[1])
    out_world = transform_pt(local_out_port[0], local_out_port[1])

    return CellPlacementResult(
        cell_id=cell_id,
        template_type=CellTemplateType.U_SHAPED,
        placed_entities=placed,
        composite_boundary=trans_comp,
        operator_walkway=trans_walk,
        input_port=in_world,
        output_port=out_world,
        width=max_x - min_x,
        length=max_y - min_y
    )


def build_linear_cell(
    cell_id: int,
    entities: List[LayoutEntity],
    cell_origin: Tuple[float, float] = (0.0, 0.0),
    rotation_deg: float = 0.0,
    walkway_width: float = 1.8
) -> CellPlacementResult:
    """
    Arranges machines in a straight single row along dominant routing flow:
    - Machines ordered linearly
    - Front operator walkway
    - Rear service clearance
    """
    placed: List[LayoutEntity] = []
    curr_x = 0.0

    for idx, e_orig in enumerate(entities):
        e = e_orig.model_copy(deep=True)
        e.cell_id = cell_id
        e.cell_template = CellTemplateType.LINEAR
        e.theta = 0.0
        e.x = curr_x + e.dimensions.L / 2.0
        e.y = 0.0
        curr_x += (e.dimensions.L + 1.0)
        placed.append(e)

    total_len = curr_x
    max_w = max(e.dimensions.W for e in entities) if entities else 2.0

    local_walkway = box(0.0, max_w / 2.0, total_len, max_w / 2.0 + walkway_width)
    local_composite = box(-0.5, -max_w / 2.0 - 0.8, total_len + 0.5, max_w / 2.0 + walkway_width + 0.5)

    local_in = (0.0, max_w / 2.0)
    local_out = (total_len, max_w / 2.0)

    # Rigid transform
    rad = math.radians(rotation_deg)
    cos_t, sin_t = math.cos(rad), math.sin(rad)
    ox, oy = cell_origin

    def transform_pt(px: float, py: float) -> Tuple[float, float]:
        return (ox + px * cos_t - py * sin_t, oy + px * sin_t + py * cos_t)

    for e in placed:
        e.theta = (e.theta + rotation_deg) % 360.0
        wx, wy = transform_pt(e.x, e.y)
        e.x, e.y = wx, wy

    rot_comp = affinity.rotate(local_composite, rotation_deg, origin=(0, 0))
    trans_comp = affinity.translate(rot_comp, ox, oy)

    rot_walk = affinity.rotate(local_walkway, rotation_deg, origin=(0, 0))
    trans_walk = affinity.translate(rot_walk, ox, oy)

    return CellPlacementResult(
        cell_id=cell_id,
        template_type=CellTemplateType.LINEAR,
        placed_entities=placed,
        composite_boundary=trans_comp,
        operator_walkway=trans_walk,
        input_port=transform_pt(local_in[0], local_in[1]),
        output_port=transform_pt(local_out[0], local_out[1]),
        width=total_len,
        length=max_w + walkway_width + 1.0
    )


def build_double_row_cell(
    cell_id: int,
    entities: List[LayoutEntity],
    cell_origin: Tuple[float, float] = (0.0, 0.0),
    rotation_deg: float = 0.0,
    walkway_width: float = 2.0
) -> CellPlacementResult:
    """
    Arranges machines in two opposing rows sharing a central operator walkway:
    - Row 1: faces +Y (towards center)
    - Row 2: faces -Y (towards center)
    - Center aisle: operator walkway
    """
    placed: List[LayoutEntity] = []
    n = len(entities)
    half = math.ceil(n / 2.0)
    row1 = entities[:half]
    row2 = entities[half:]

    curr_x1 = 0.0
    for e_orig in row1:
        e = e_orig.model_copy(deep=True)
        e.cell_id = cell_id
        e.cell_template = CellTemplateType.DOUBLE_ROW
        e.theta = 0.0
        e.x = curr_x1 + e.dimensions.L / 2.0
        e.y = -walkway_width / 2.0 - e.dimensions.W / 2.0
        curr_x1 += (e.dimensions.L + 0.8)
        placed.append(e)

    curr_x2 = 0.0
    for e_orig in row2:
        e = e_orig.model_copy(deep=True)
        e.cell_id = cell_id
        e.cell_template = CellTemplateType.DOUBLE_ROW
        e.theta = 180.0
        e.x = curr_x2 + e.dimensions.L / 2.0
        e.y = walkway_width / 2.0 + e.dimensions.W / 2.0
        curr_x2 += (e.dimensions.L + 0.8)
        placed.append(e)

    total_len = max(curr_x1, curr_x2, 3.0)
    local_walkway = box(0.0, -walkway_width / 2.0, total_len, walkway_width / 2.0)
    
    min_y = min(e.y - e.dimensions.W / 2.0 for e in placed) - 0.5
    max_y = max(e.y + e.dimensions.W / 2.0 for e in placed) + 0.5
    local_composite = box(-0.5, min_y, total_len + 0.5, max_y)

    local_in = (0.0, 0.0)
    local_out = (total_len, 0.0)

    # Rigid transform
    rad = math.radians(rotation_deg)
    cos_t, sin_t = math.cos(rad), math.sin(rad)
    ox, oy = cell_origin

    def transform_pt(px: float, py: float) -> Tuple[float, float]:
        return (ox + px * cos_t - py * sin_t, oy + px * sin_t + py * cos_t)

    for e in placed:
        e.theta = (e.theta + rotation_deg) % 360.0
        wx, wy = transform_pt(e.x, e.y)
        e.x, e.y = wx, wy

    rot_comp = affinity.rotate(local_composite, rotation_deg, origin=(0, 0))
    trans_comp = affinity.translate(rot_comp, ox, oy)

    rot_walk = affinity.rotate(local_walkway, rotation_deg, origin=(0, 0))
    trans_walk = affinity.translate(rot_walk, ox, oy)

    return CellPlacementResult(
        cell_id=cell_id,
        template_type=CellTemplateType.DOUBLE_ROW,
        placed_entities=placed,
        composite_boundary=trans_comp,
        operator_walkway=trans_walk,
        input_port=transform_pt(local_in[0], local_in[1]),
        output_port=transform_pt(local_out[0], local_out[1]),
        width=total_len,
        length=max_y - min_y
    )


def build_cell_layout(
    cell_id: int,
    template_type: CellTemplateType,
    entities: List[LayoutEntity],
    cell_origin: Tuple[float, float] = (0.0, 0.0),
    rotation_deg: float = 0.0,
    walkway_width: float = 1.8
) -> CellPlacementResult:
    """Dispatches cell builder according to selected template type."""
    if template_type == CellTemplateType.U_SHAPED:
        return build_u_shaped_cell(cell_id, entities, cell_origin, rotation_deg, walkway_width)
    elif template_type == CellTemplateType.LINEAR:
        return build_linear_cell(cell_id, entities, cell_origin, rotation_deg, walkway_width)
    elif template_type == CellTemplateType.DOUBLE_ROW:
        return build_double_row_cell(cell_id, entities, cell_origin, rotation_deg, walkway_width)
    else:
        return build_u_shaped_cell(cell_id, entities, cell_origin, rotation_deg, walkway_width)
