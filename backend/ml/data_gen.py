from __future__ import annotations

import math
import random
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from backend.core.models import (
    LayoutEntity,
    PlotSchema,
    NoGoZone,
    Dock,
    EmergencyExit,
    UtilityDrop,
    ProjectConfig,
    ProjectMode,
    PartRouting,
    PartOperation,
    RobotTask,
    RobotTaskStep,
    Dimensions,
    Clearances,
    RobotKinematics
)
from backend.core.geometry import force_directed_repair, compute_layout_overlaps, compute_boundary_violations


def generate_parametric_plot(plot_type: str = "rect", width: float = 30.0, height: float = 20.0) -> PlotSchema:
    """Generates synthetic rectangular, L-shaped, or U-shaped factory hall boundary with pillars."""
    if plot_type == "rect":
        boundary = [[0.0, 0.0], [width, 0.0], [width, height], [0.0, height]]
    elif plot_type == "L_shape":
        cut_w = width * 0.4
        cut_h = height * 0.4
        boundary = [
            [0.0, 0.0], [width, 0.0], [width, height - cut_h],
            [width - cut_w, height - cut_h], [width - cut_w, height], [0.0, height]
        ]
    else:  # U_shape
        cut_w = width * 0.35
        cut_h = height * 0.45
        boundary = [
            [0.0, 0.0], [width, 0.0], [width, height],
            [width - cut_w, height], [width - cut_w, cut_h],
            [cut_w, cut_h], [cut_w, height], [0.0, height]
        ]

    # Add 2-4 structural pillars
    no_go_zones = []
    num_pillars = random.randint(2, 4)
    for p_idx in range(num_pillars):
        px = random.uniform(width * 0.2, width * 0.8)
        py = random.uniform(height * 0.2, height * 0.8)
        sz = random.uniform(0.6, 0.9)
        no_go_zones.append(NoGoZone(
            id=f"Pillar_{p_idx + 1}",
            polygon=[[px, py], [px + sz, py], [px + sz, py + sz], [px, py + sz]]
        ))

    docks = [
        Dock(id="Dock_Recv", point=[0.0, height * 0.25], type="receiving"),
        Dock(id="Dock_Ship", point=[width, height * 0.75], type="shipping")
    ]
    emergency_exits = [
        EmergencyExit(id="Exit_1", point=[width * 0.5, height]),
        EmergencyExit(id="Exit_2", point=[0.0, height * 0.8])
    ]
    utility_drops = [
        UtilityDrop(id="Power_Drop", point=[0.0, height * 0.5], utility="power_3ph"),
        UtilityDrop(id="Air_Drop", point=[width * 0.5, 0.0], utility="compressed_air")
    ]

    return PlotSchema(
        boundary=boundary,
        no_go_zones=no_go_zones,
        docks=docks,
        emergency_exits=emergency_exits,
        utility_drops=utility_drops,
        min_aisle_width_m=3.0
    )


def generate_synthetic_cms_scenario(num_machines: int = 15, num_parts: int = 12) -> ProjectConfig:
    """Generates a synthetic Mode A CMS scenario with realistic machines and routings."""
    plot = generate_parametric_plot("L_shape", width=35.0, height=22.0)
    
    machine_catalog = [
        ("Haas_VF2", "vmc", 2.57, 2.24, 78.0, ["coolant_mist"]),
        ("Haas_ST20", "cnc_turning", 3.18, 1.96, 76.0, []),
        ("Grinder_Cyl", "grinder", 2.40, 1.80, 86.0, ["dust", "vibration"]),
        ("Mitutoyo_CMM", "cmm", 2.00, 1.80, 65.0, []),
        ("Band_Saw", "machine", 2.20, 1.50, 82.0, ["dust"]),
        ("Deburring_Bench", "manual", 1.80, 1.20, 72.0, [])
    ]

    entities = []
    minx, miny, maxx, maxy = 0.0, 0.0, 35.0, 22.0

    for i in range(num_machines):
        m_model, m_cat, l, w, noise, haz = machine_catalog[i % len(machine_catalog)]
        e = LayoutEntity(
            id=f"{m_model}_{i + 1:02d}",
            model=m_model,
            category=m_cat,
            dimensions=Dimensions(L=l, W=w, H=2.2),
            clearances=Clearances(front=1.2, back=0.8, left=0.6, right=0.6),
            utilities=["power_3ph", "compressed_air"],
            noise_lw_db=noise,
            hazard_tags=haz,
            sensitive_tags=["dust_sensitive", "vibration_sensitive"] if m_cat == "cmm" else [],
            x=random.uniform(minx + 3.0, maxx - 3.0),
            y=random.uniform(miny + 3.0, maxy - 3.0),
            theta=random.choice([0.0, 90.0, 180.0, 270.0]),
            relocation_cost_inr=random.choice([50000.0, 150000.0, 300000.0])
        )
        entities.append(e)

    # Synthetic part routings
    routings = []
    for p in range(num_parts):
        seq_len = random.randint(3, 5)
        seq_machines = random.sample([m[0] for m in machine_catalog], seq_len)
        ops = [PartOperation(machine_type=m_name, cycle_min=random.uniform(1.0, 6.0)) for m_name in seq_machines]
        routings.append(PartRouting(
            part_id=f"Part_{p + 1:02d}",
            annual_demand=random.randint(5000, 30000),
            batch_size=random.choice([25, 50, 100]),
            sequence=ops
        ))

    return ProjectConfig(
        project_name="Synthetic CMS SME Facility",
        project_mode=ProjectMode.CELLULAR_CMS,
        plot=plot,
        entities=entities,
        part_routings=routings,
        safety_rules=[
            {"tag_a": "dust", "tag_b": "dust_sensitive", "min_distance_m": 5.0},
            {"tag_a": "vibration", "tag_b": "vibration_sensitive", "min_distance_m": 6.0}
        ]
    )


def generate_synthetic_robotic_scenario(num_robots: int = 3, num_stations: int = 4) -> ProjectConfig:
    """Generates a synthetic Mode B Robotic Workcell scenario."""
    plot = generate_parametric_plot("rect", width=14.0, height=10.0)

    robots = []
    robot_types = [
        ("ABB_IRB_2600_20_165", "robot_6axis", 0.65, 0.65, 1.65, 0.35, 1.65, 175.0, 20.0, "SSM"),
        ("UR10e", "robot_6axis", 0.35, 0.35, 1.30, 0.20, 1.30, 120.0, 12.5, "PFL")
    ]

    for r_idx in range(num_robots):
        rt = robot_types[r_idx % len(robot_types)]
        robots.append(
            LayoutEntity(
                id=f"Robot_{r_idx + 1:02d}",
                model=rt[0],
                category=rt[1],
                dimensions=Dimensions(L=rt[2], W=rt[3], H=rt[4]),
                clearances=Clearances(front=0.0, back=0.0, left=0.0, right=0.0),
                kinematics=RobotKinematics(
                    r_min_m=rt[5], r_max_m=rt[6], axis1_deg_s=rt[7],
                    stop_time_s=0.25, reaction_time_s=0.08, max_payload_kg=rt[8]
                ),
                safety_mode=rt[9],
                x=random.uniform(3.0, 11.0),
                y=random.uniform(3.0, 7.0),
                theta=0.0,
                relocation_cost_inr=150000.0
            )
        )

    fixtures = [
        LayoutEntity(
            id=f"Station_{idx + 1:02d}",
            model="Workstation",
            category="fixture" if idx % 2 == 0 else "human_station",
            dimensions=Dimensions(L=1.4, W=1.0, H=1.2),
            clearances=Clearances(front=0.8, back=0.4, left=0.4, right=0.4),
            approach_speed_m_s=1.6 if idx % 2 != 0 else 0.0,
            x=random.uniform(1.5, 12.5),
            y=random.uniform(1.5, 8.5),
            theta=0.0,
            relocation_cost_inr=60000.0
        )
        for idx in range(num_stations)
    ]

    all_entities = robots + fixtures

    # Robot tasks
    tasks = []
    for r in robots:
        steps = []
        for _ in range(random.randint(2, 4)):
            f_from = random.choice(fixtures).id
            f_to = random.choice([f.id for f in fixtures if f.id != f_from] or [f_from])
            steps.append(RobotTaskStep(from_entity=f_from, to_entity=f_to, process_s=random.uniform(2.0, 5.0)))
        tasks.append(RobotTask(robot_id=r.id, sequence=steps))

    return ProjectConfig(
        project_name="Synthetic EV Battery Cell",
        project_mode=ProjectMode.ROBOTIC_WORKCELL,
        target_takt_time_s=45.0,
        plot=plot,
        entities=all_entities,
        robot_tasks=tasks
    )
