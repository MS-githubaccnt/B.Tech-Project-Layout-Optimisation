from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple
import ezdxf
from shapely.geometry import Polygon, Point, LineString

from backend.core.models import LayoutEntity, PlotSchema, ProjectConfig, ProjectMode
from backend.core.geometry import (
    create_base_polygon,
    create_clearance_polygon,
    create_annular_reach_polygon,
    create_sweet_spot_annulus
)
from backend.core.routing import compute_steiner_utility_network


def export_layout_to_dxf(
    config: ProjectConfig,
    entities: List[LayoutEntity],
    output_path: str
) -> str:
    """
    Exports the facility layout to a multi-layer AutoCAD/LibreCAD .dxf file:
    Layers:
    - BOUNDARY: Plot perimeter (White/Black)
    - OBSTACLES: Pillars & no-go zones (Red)
    - MACHINES: Equipment structural base footprints (Blue)
    - CLEARANCES: Operator & maintenance clearances (Cyan, dashed)
    - REACH_ZONES: Robot reach annuli & sweet spots (Magenta)
    - AISLES: Forklift transport corridors (Green)
    - UTILITIES: Power, air, exhaust Steiner networks (Orange/Cyan)
    - DOCKS_EXITS: Material docks and emergency exits (Yellow)
    """
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    # Define CAD Layers
    layers = [
        ("BOUNDARY", 7, "CONTINUOUS"),       # White
        ("OBSTACLES", 1, "CONTINUOUS"),      # Red
        ("MACHINES", 5, "CONTINUOUS"),       # Blue
        ("CLEARANCES", 4, "DASHED"),         # Cyan
        ("REACH_ZONES", 6, "CONTINUOUS"),    # Magenta
        ("AISLES", 3, "CENTER"),             # Green
        ("UTILITIES_POWER", 40, "CONTINUOUS"),
        ("UTILITIES_AIR", 130, "CONTINUOUS"),
        ("DOCKS_EXITS", 2, "CONTINUOUS"),    # Yellow
        ("LABELS", 7, "CONTINUOUS")
    ]

    for name, color, linetype in layers:
        if name not in doc.layers:
            doc.layers.add(name=name, color=color, linetype=linetype)

    # 1. BOUNDARY
    boundary_pts = [(p[0], p[1]) for p in config.plot.boundary]
    if boundary_pts:
        boundary_pts.append(boundary_pts[0])  # Close loop
        msp.add_lwpolyline(boundary_pts, dxfattribs={"layer": "BOUNDARY"})

    # 2. OBSTACLES
    for ng in config.plot.no_go_zones:
        ng_pts = [(p[0], p[1]) for p in ng.polygon]
        if ng_pts:
            ng_pts.append(ng_pts[0])
            msp.add_lwpolyline(ng_pts, dxfattribs={"layer": "OBSTACLES"})
            msp.add_text(ng.id, dxfattribs={"layer": "OBSTACLES", "height": 0.4}).set_placement(
                (ng_pts[0][0], ng_pts[0][1])
            )

    # 3. MACHINES & CLEARANCES
    for e in entities:
        # Base Footprint
        base_poly = create_base_polygon(e)
        if hasattr(base_poly, 'exterior'):
            b_coords = list(base_poly.exterior.coords)
            msp.add_lwpolyline(b_coords, dxfattribs={"layer": "MACHINES"})

        # Clearances
        clear_poly = create_clearance_polygon(e)
        if hasattr(clear_poly, 'exterior'):
            c_coords = list(clear_poly.exterior.coords)
            msp.add_lwpolyline(c_coords, dxfattribs={"layer": "CLEARANCES"})

        # Machine Label & Dimensions
        msp.add_text(e.id, dxfattribs={"layer": "LABELS", "height": 0.35}).set_placement((e.x - 0.5, e.y))
        if e.model:
            msp.add_text(e.model, dxfattribs={"layer": "LABELS", "height": 0.25}).set_placement((e.x - 0.5, e.y - 0.3))

        # Mode B Robot Reach Envelopes
        if e.kinematics:
            k = e.kinematics
            msp.add_circle((e.x, e.y), k.r_max_m, dxfattribs={"layer": "REACH_ZONES"})
            msp.add_circle((e.x, e.y), k.r_min_m, dxfattribs={"layer": "REACH_ZONES"})
            # Sweet spot
            msp.add_circle((e.x, e.y), k.r_max_m * 0.85, dxfattribs={"layer": "REACH_ZONES"})

    # 4. DOCKS & EXITS
    for d in config.plot.docks:
        msp.add_circle((d.point[0], d.point[1]), 0.6, dxfattribs={"layer": "DOCKS_EXITS"})
        msp.add_text(d.id, dxfattribs={"layer": "DOCKS_EXITS", "height": 0.4}).set_placement(
            (d.point[0] + 0.8, d.point[1])
        )

    for ex in config.plot.emergency_exits:
        msp.add_circle((ex.point[0], ex.point[1]), 0.5, dxfattribs={"layer": "DOCKS_EXITS"})
        msp.add_text(f"EXIT: {ex.id}", dxfattribs={"layer": "DOCKS_EXITS", "height": 0.35}).set_placement(
            (ex.point[0] + 0.6, ex.point[1])
        )

    # 5. UTILITIES STEINER NETWORKS
    plot_poly = Polygon(config.plot.boundary)
    power_len, power_segs = compute_steiner_utility_network(plot_poly, config.plot.utility_drops, entities, "power_3ph")
    for seg in power_segs:
        coords = list(seg.coords)
        msp.add_lwpolyline(coords, dxfattribs={"layer": "UTILITIES_POWER"})

    air_len, air_segs = compute_steiner_utility_network(plot_poly, config.plot.utility_drops, entities, "compressed_air")
    for seg in air_segs:
        coords = list(seg.coords)
        msp.add_lwpolyline(coords, dxfattribs={"layer": "UTILITIES_AIR"})

    doc.saveas(output_path)
    return output_path
