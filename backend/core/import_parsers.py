from __future__ import annotations

import io
import csv
import math
from typing import Any, Dict, List, Optional, Tuple
import ezdxf
from shapely.geometry import Polygon, Point, box

from backend.core.models import (
    ProjectConfig,
    ProjectMode,
    PlotSchema,
    LayoutEntity,
    Dimensions,
    Clearances,
    Port,
    NoGoZone,
    Dock,
    EmergencyExit,
    PartRouting,
    SafetyRule
)


def parse_csv_layout(
    machines_csv: str,
    routings_csv: Optional[str] = None,
    plot_width: float = 35.0,
    plot_length: float = 25.0,
    project_mode: ProjectMode = ProjectMode.CELLULAR_CMS,
    project_name: str = "Imported Plant Layout"
) -> ProjectConfig:
    """
    Parses standard CSV equipment and routing tables into a valid ProjectConfig.
    
    machines_csv columns:
    id, name, category, length, width, height, clear_front, clear_back, clear_left, clear_right, noise_db, x, y, theta, fixed
    
    routings_csv columns (optional):
    part_id, annual_demand, batch_size, sequence (separated by ->, >, or comma)
    """
    reader = csv.DictReader(io.StringIO(machines_csv.strip()))
    entities: List[LayoutEntity] = []

    # Default grid positioning if x,y omitted
    curr_x = 3.0
    curr_y = 3.0

    for idx, row in enumerate(reader):
        ent_id = row.get("id") or f"M_{idx+1:02d}"
        model = row.get("name") or row.get("model") or ent_id
        cat = row.get("category") or "general_machinery"

        l = float(row.get("length") or row.get("L") or 2.5)
        w = float(row.get("width") or row.get("W") or 2.0)
        h = float(row.get("height") or row.get("H") or 2.0)

        cf = float(row.get("clear_front") or 1.0)
        cb = float(row.get("clear_back") or 0.8)
        cl = float(row.get("clear_left") or 0.6)
        cr = float(row.get("clear_right") or 0.6)

        noise = float(row.get("noise_db") or row.get("noise_lw_db") or 75.0)

        # Optional initial positions
        x = float(row.get("x")) if row.get("x") not in (None, "") else curr_x
        y = float(row.get("y")) if row.get("y") not in (None, "") else curr_y
        theta = float(row.get("theta") or 0.0)
        is_fixed = str(row.get("fixed", "false")).strip().lower() in ("true", "1", "yes")

        # Auto stagger next machine if coordinate wasn't provided
        if row.get("x") in (None, ""):
            curr_x += l + 2.0
            if curr_x > plot_width - 5.0:
                curr_x = 3.0
                curr_y += w + 2.5

        entities.append(
            LayoutEntity(
                id=ent_id,
                model=model,
                category=cat,
                dimensions=Dimensions(L=l, W=w, H=h),
                clearances=Clearances(front=cf, back=cb, left=cl, right=cr),
                x=x,
                y=y,
                theta=theta,
                noise_lw_db=noise,
                fixed=is_fixed,
                utilities=["power_3ph"]
            )
        )

    # Parse routings if provided
    part_routings: List[PartRouting] = []
    if routings_csv and routings_csv.strip():
        r_reader = csv.DictReader(io.StringIO(routings_csv.strip()))
        for r_row in r_reader:
            pid = r_row.get("part_id") or f"P_{len(part_routings)+1}"
            demand = int(float(r_row.get("annual_demand") or 10000))
            batch = int(float(r_row.get("batch_size") or 50))
            seq_raw = r_row.get("sequence", "")

            # Normalize delimiters: "->", ">", ","
            seq_clean = seq_raw.replace("->", ",").replace(">", ",").split(",")
            sequence = []
            for item in seq_clean:
                s = item.strip()
                if s:
                    sequence.append({"machine_type": s, "cycle_min": 3.0})

            if sequence:
                part_routings.append(
                    PartRouting(
                        part_id=pid,
                        annual_demand=demand,
                        batch_size=batch,
                        sequence=sequence
                    )
                )

    # Construct standard plot perimeter
    boundary = [
        [0.0, 0.0],
        [plot_width, 0.0],
        [plot_width, plot_length],
        [0.0, plot_length]
    ]

    docks = [
        Dock(id="Dock_Receiving", point=[0.0, plot_length / 2.0], type="receiving"),
        Dock(id="Dock_Shipping", point=[plot_width, plot_length / 2.0], type="shipping")
    ]

    exits = [
        EmergencyExit(id="Exit_North", point=[plot_width / 2.0, plot_length]),
        EmergencyExit(id="Exit_South", point=[plot_width / 2.0, 0.0])
    ]

    return ProjectConfig(
        project_name=project_name,
        project_mode=project_mode,
        plot=PlotSchema(
            boundary=boundary,
            no_go_zones=[],
            docks=docks,
            emergency_exits=exits,
            min_aisle_width_m=3.0
        ),
        entities=entities,
        part_routings=part_routings
    )


def parse_dxf_layout(
    dxf_content: bytes | str,
    project_mode: ProjectMode = ProjectMode.CELLULAR_CMS,
    project_name: str = "Imported CAD DXF Layout"
) -> ProjectConfig:
    """
    Parses standard multi-layer AutoCAD/LibreCAD DXF files.
    Layer conventions:
    - BOUNDARY: 2D Closed Polyline of facility outer hall
    - OBSTACLES / COLUMNS: Closed polylines of pillars or forbidden zones
    - MACHINES / EQUIPMENT: Closed polylines or rectangles representing machine footprints
    - DOCKS: Points or text labels for receiving/shipping
    - EXITS: Points or text labels for emergency fire exits
    """
    if isinstance(dxf_content, str):
        doc = ezdxf.readfile(dxf_content)
    else:
        stream = io.StringIO(dxf_content.decode("utf-8", errors="ignore"))
        doc = ezdxf.read(stream)

    msp = doc.modelspace()

    boundary: List[List[float]] = []
    no_go_zones: List[NoGoZone] = []
    entities: List[LayoutEntity] = []
    docks: List[Dock] = []
    exits: List[EmergencyExit] = []

    # Map layer names case-insensitively
    layer_entities = {}
    for ent in msp:
        layer = ent.dxf.layer.upper()
        layer_entities.setdefault(layer, []).append(ent)

    # 1. Parse BOUNDARY
    boundary_layers = ["BOUNDARY", "WALLS", "HULL", "PERIMETER"]
    for bl in boundary_layers:
        if bl in layer_entities:
            for item in layer_entities[bl]:
                if item.dxftype() in ("LWPOLYLINE", "POLYLINE"):
                    pts = [[float(p[0]), float(p[1])] for p in item.get_points()]
                    # Remove closing duplicate if present
                    if len(pts) > 2:
                        if abs(pts[0][0] - pts[-1][0]) < 1e-3 and abs(pts[0][1] - pts[-1][1]) < 1e-3:
                            pts.pop()
                        boundary = pts
                        break
            if boundary:
                break

    # Fallback boundary if not found
    if not boundary or len(boundary) < 3:
        boundary = [[0.0, 0.0], [30.0, 0.0], [30.0, 20.0], [0.0, 20.0]]

    # 2. Parse OBSTACLES
    obstacle_layers = ["OBSTACLES", "COLUMNS", "PILLARS", "NO_GO", "NO-GO"]
    pillar_idx = 1
    for ol in obstacle_layers:
        if ol in layer_entities:
            for item in layer_entities[ol]:
                if item.dxftype() in ("LWPOLYLINE", "POLYLINE"):
                    pts = [[float(p[0]), float(p[1])] for p in item.get_points()]
                    if len(pts) > 2:
                        no_go_zones.append(
                            NoGoZone(id=f"Pillar_{pillar_idx:02d}", polygon=pts)
                        )
                        pillar_idx += 1
                elif item.dxftype() == "CIRCLE":
                    cx, cy = float(item.dxf.center[0]), float(item.dxf.center[1])
                    r = float(item.dxf.radius)
                    # Approximate circle as 8-point polygon
                    poly = [
                        [round(cx + r * math.cos(math.radians(a)), 3), round(cy + r * math.sin(math.radians(a)), 3)]
                        for a in range(0, 360, 45)
                    ]
                    no_go_zones.append(NoGoZone(id=f"Column_{pillar_idx:02d}", polygon=poly))
                    pillar_idx += 1

    # 3. Parse MACHINES / EQUIPMENT
    machine_layers = ["MACHINES", "EQUIPMENT", "ASSETS"]
    ent_idx = 1
    for ml in machine_layers:
        if ml in layer_entities:
            for item in layer_entities[ml]:
                if item.dxftype() in ("LWPOLYLINE", "POLYLINE"):
                    pts = [Point(float(p[0]), float(p[1])) for p in item.get_points()]
                    if len(pts) >= 4:
                        poly = Polygon(pts)
                        centroid = poly.centroid
                        bounds = poly.bounds  # minx, miny, maxx, maxy
                        length = round(max(0.5, bounds[2] - bounds[0]), 2)
                        width = round(max(0.5, bounds[3] - bounds[1]), 2)

                        entities.append(
                            LayoutEntity(
                                id=f"M_{ent_idx:02d}",
                                model=f"Machine_{ent_idx:02d}",
                                category="general_machinery",
                                dimensions=Dimensions(L=length, W=width, H=2.0),
                                clearances=Clearances(front=1.0, back=0.8, left=0.6, right=0.6),
                                x=round(centroid.x, 2),
                                y=round(centroid.y, 2),
                                theta=0.0,
                                noise_lw_db=78.0,
                                utilities=["power_3ph"]
                            )
                        )
                        ent_idx += 1

    # 4. Parse DOCKS & EXITS
    if "DOCKS" in layer_entities:
        for idx, item in enumerate(layer_entities["DOCKS"]):
            pt = item.dxf.location if hasattr(item.dxf, 'location') else item.dxf.insert
            docks.append(
                Dock(
                    id=f"Dock_{idx+1}",
                    point=[round(float(pt[0]), 2), round(float(pt[1]), 2)],
                    type="receiving" if idx == 0 else "shipping"
                )
            )

    if not docks:
        docks = [
            Dock(id="Dock_Receiving", point=[0.0, 10.0], type="receiving"),
            Dock(id="Dock_Shipping", point=[30.0, 10.0], type="shipping")
        ]

    if "EXITS" in layer_entities:
        for idx, item in enumerate(layer_entities["EXITS"]):
            pt = item.dxf.location if hasattr(item.dxf, 'location') else item.dxf.insert
            exits.append(
                EmergencyExit(
                    id=f"Exit_{idx+1}",
                    point=[round(float(pt[0]), 2), round(float(pt[1]), 2)]
                )
            )

    if not exits:
        exits = [EmergencyExit(id="Exit_North", point=[15.0, 20.0])]

    return ProjectConfig(
        project_name=project_name,
        project_mode=project_mode,
        plot=PlotSchema(
            boundary=boundary,
            no_go_zones=no_go_zones,
            docks=docks,
            emergency_exits=exits,
            min_aisle_width_m=3.0
        ),
        entities=entities,
        part_routings=[]
    )


def get_standard_machines_csv_template() -> str:
    """Returns a ready-to-use CSV template for machines."""
    return (
        "id,name,category,length,width,height,clear_front,clear_back,clear_left,clear_right,noise_db,x,y,theta,fixed\n"
        "VMC_01,Haas_VF2,vmc,2.57,2.24,2.57,1.20,0.90,0.60,0.60,78.0,6.0,5.0,0.0,false\n"
        "VMC_02,Haas_VF2,vmc,2.57,2.24,2.57,1.20,0.90,0.60,0.60,78.0,6.0,10.0,0.0,false\n"
        "CNC_01,Haas_ST20,cnc_turning,3.18,1.96,1.98,1.20,0.80,0.60,1.20,76.0,14.0,5.0,0.0,false\n"
        "CNC_02,Haas_ST20,cnc_turning,3.18,1.96,1.98,1.20,0.80,0.60,1.20,76.0,14.0,12.0,0.0,false\n"
        "Grinder_01,Grinder_Cyl,grinder,2.40,1.80,1.80,1.00,0.80,0.50,0.50,86.0,24.0,5.0,0.0,false\n"
        "Grinder_02,Grinder_Cyl,grinder,2.40,1.80,1.80,1.00,0.80,0.50,0.50,86.0,24.0,10.0,0.0,false\n"
        "CMM_01,Mitutoyo_CMM,cmm,2.00,1.80,2.20,1.20,0.80,0.80,0.80,62.0,20.0,18.0,0.0,false\n"
        "Deburr_01,Deburr_Bench,manual_station,2.00,1.20,1.60,0.80,0.60,0.40,0.40,70.0,12.0,18.0,0.0,false\n"
    )


def get_standard_routings_csv_template() -> str:
    """Returns a ready-to-use CSV template for part manufacturing routings."""
    return (
        "part_id,annual_demand,batch_size,sequence\n"
        "Gear_Shaft_A1,18000,50,CNC_01 -> VMC_01 -> Grinder_01 -> CMM_01\n"
        "Brake_Disc_B2,24000,80,CNC_02 -> Grinder_02 -> Deburr_01\n"
        "Motor_Housing_C3,12000,40,VMC_02 -> Deburr_01 -> CMM_01\n"
    )


def get_standard_json_template() -> Dict[str, Any]:
    """Returns a documented, production-grade JSON layout schema template."""
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Industrial Unit Layout Specification",
        "project_name": "Standard Industrial Facility Layout Template",
        "project_mode": "CELLULAR_CMS",
        "plot": {
            "boundary": [
                [0.0, 0.0],
                [35.0, 0.0],
                [35.0, 20.0],
                [0.0, 20.0]
            ],
            "no_go_zones": [
                {
                    "id": "Pillar_Grid_1",
                    "polygon": [[10.0, 9.5], [10.8, 9.5], [10.8, 10.3], [10.0, 10.3]]
                },
                {
                    "id": "Pillar_Grid_2",
                    "polygon": [[22.0, 9.5], [22.8, 9.5], [22.8, 10.3], [22.0, 10.3]]
                }
            ],
            "docks": [
                {"id": "Dock_Inbound_Receiving", "point": [0.0, 10.0], "type": "receiving"},
                {"id": "Dock_Outbound_Shipping", "point": [35.0, 10.0], "type": "shipping"}
            ],
            "emergency_exits": [
                {"id": "Fire_Exit_North", "point": [17.5, 20.0]},
                {"id": "Fire_Exit_South", "point": [17.5, 0.0]}
            ],
            "utility_drops": [
                {"id": "Panel_415V_Main", "point": [0.0, 15.0], "utility": "power_3ph"},
                {"id": "Air_Drop_Header", "point": [0.0, 5.0], "utility": "compressed_air"}
            ],
            "min_aisle_width_m": 3.0
        },
        "entities": [
            {
                "id": "VMC_01",
                "model": "Haas_VF2",
                "category": "vmc",
                "dimensions": {"L": 2.57, "W": 2.24, "H": 2.57},
                "clearances": {"front": 1.20, "back": 0.90, "left": 0.60, "right": 0.60},
                "utilities": ["power_3ph", "compressed_air"],
                "noise_lw_db": 78.0,
                "hazard_tags": ["coolant_mist"],
                "sensitive_tags": [],
                "x": 6.0, "y": 6.0, "theta": 0.0,
                "relocation_cost_inr": 250000.0,
                "fixed": False
            },
            {
                "id": "CNC_01",
                "model": "Haas_ST20",
                "category": "cnc_turning",
                "dimensions": {"L": 3.18, "W": 1.96, "H": 1.98},
                "clearances": {"front": 1.20, "back": 0.80, "left": 0.60, "right": 1.20},
                "utilities": ["power_3ph", "compressed_air"],
                "noise_lw_db": 76.0,
                "hazard_tags": ["coolant_mist"],
                "sensitive_tags": [],
                "x": 14.0, "y": 6.0, "theta": 0.0,
                "relocation_cost_inr": 220000.0,
                "fixed": False
            },
            {
                "id": "CMM_Quality",
                "model": "Mitutoyo_CMM",
                "category": "cmm",
                "dimensions": {"L": 2.00, "W": 1.80, "H": 2.20},
                "clearances": {"front": 1.20, "back": 0.80, "left": 0.80, "right": 0.80},
                "utilities": ["power_3ph", "clean_room_air"],
                "noise_lw_db": 62.0,
                "hazard_tags": [],
                "sensitive_tags": ["dust_sensitive", "vibration_sensitive"],
                "x": 26.0, "y": 14.0, "theta": 0.0,
                "relocation_cost_inr": 350000.0,
                "fixed": False
            }
        ],
        "part_routings": [
            {
                "part_id": "Precision_Flange_F1",
                "annual_demand": 20000,
                "batch_size": 60,
                "sequence": [
                    {"machine_type": "Haas_ST20", "cycle_min": 4.5},
                    {"machine_type": "Haas_VF2", "cycle_min": 6.2},
                    {"machine_type": "Mitutoyo_CMM", "cycle_min": 2.5}
                ]
            }
        ],
        "safety_rules": [
            {"tag_a": "dust", "tag_b": "dust_sensitive", "min_distance_m": 6.0},
            {"tag_a": "vibration", "tag_b": "vibration_sensitive", "min_distance_m": 6.0}
        ],
        "capital_budget_inr": 1500000.0
    }
