from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple
import shapely
from shapely.geometry import Point, Polygon, LineString

from backend.core.models import LayoutEntity, RobotKinematics


def compute_ssm_separation_distance(
    robot: LayoutEntity,
    human: LayoutEntity,
    robot_speed_m_s: float = 1.0,
    intrusion_allowance_c_m: float = 0.2,
    sensor_uncertainty_z_m: float = 0.1
) -> float:
    """
    Computes ISO 10218-2:2025 Normative Annex L Minimum Protective Separation Distance Sp:
    Sp = v_h * (T_r + T_s) + v_r * T_r + 0.5 * v_r * T_s + C + Z_d + Z_r
    """
    k = robot.kinematics
    t_r = k.reaction_time_s if k else 0.08
    t_s = k.stop_time_s if k else 0.25
    v_h = human.approach_speed_m_s or 1.6
    v_r = robot_speed_m_s

    s_h = v_h * (t_r + t_s)
    s_r = v_r * t_r
    s_s = 0.5 * v_r * t_s
    s_p = s_h + s_r + s_s + intrusion_allowance_c_m + sensor_uncertainty_z_m
    return float(s_p)


def generate_ssm_safety_zones(
    robot: LayoutEntity,
    human_entities: List[LayoutEntity]
) -> Dict[str, Polygon]:
    """
    Generates Red Stop Zone and Yellow Warning Zone polygons around robot base:
    - Red Zone: S_p at reduced speed (<= 250 mm/s)
    - Yellow Zone: S_p at full operational speed (1.2 m/s)
    """
    center = Point(robot.x, robot.y)
    
    # Use first human or default 1.6 m/s
    h = human_entities[0] if human_entities else LayoutEntity(
        id="dummy_human",
        dimensions={"L": 0.8, "W": 0.8, "H": 1.7},
        approach_speed_m_s=1.6
    )

    sp_red = compute_ssm_separation_distance(robot, h, robot_speed_m_s=0.25)
    sp_yellow = compute_ssm_separation_distance(robot, h, robot_speed_m_s=1.2)

    return {
        "red_stop_zone": center.buffer(sp_red),
        "yellow_warning_zone": center.buffer(sp_yellow)
    }


def compute_ssm_speed_derating(
    robot: LayoutEntity,
    task_fixture_pos: Tuple[float, float],
    human_entities: List[LayoutEntity]
) -> float:
    """
    Evaluates SSM speed-derating factor gamma_SSM for a task segment.
    If a human station is inside Yellow zone, derates robot speed (gamma > 1).
    """
    zones = generate_ssm_safety_zones(robot, human_entities)
    yellow_zone = zones["yellow_warning_zone"]
    red_zone = zones["red_stop_zone"]

    gamma = 1.0
    for h in human_entities:
        h_pt = Point(h.x, h.y)
        if red_zone.contains(h_pt):
            # Human in Red stop zone -> heavy penalty / stopped
            return 3.5
        elif yellow_zone.contains(h_pt):
            # Human in Yellow warning zone -> derate to 250 mm/s (factor ~ 1.8)
            gamma = max(gamma, 1.8)
            
    return gamma


def detect_pinch_points(
    robot: LayoutEntity,
    fixed_fixtures: List[LayoutEntity],
    pinch_threshold_m: float = 0.5
) -> Tuple[int, List[Dict[str, Any]]]:
    """
    Detects ISO 13854 / Annex M quasi-static clamping pinch points
    where clearance between robot reach envelope / tool and fixed rigid table < 500 mm.
    """
    k = robot.kinematics
    if not k:
        return 0, []

    robot_base = Point(robot.x, robot.y)
    outer_envelope = robot_base.buffer(k.r_max_m)
    
    pinch_points = []
    for f in fixed_fixtures:
        f_pt = Point(f.x, f.y)
        dist = f_pt.distance(robot_base)
        # If fixture is right on the periphery of reach, creating a pinch wedge
        gap = abs(dist - k.r_max_m)
        if gap < pinch_threshold_m:
            pinch_points.append({
                "robot_id": robot.id,
                "fixture_id": f.id,
                "clearance_m": round(gap, 2),
                "threshold_m": pinch_threshold_m
            })

    return len(pinch_points), pinch_points
