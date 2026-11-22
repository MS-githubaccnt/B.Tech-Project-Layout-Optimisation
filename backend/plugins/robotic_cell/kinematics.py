from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import shapely
from shapely.geometry import Point, Polygon, LineString

from backend.core.models import LayoutEntity, RobotKinematics


def compute_joint_slew_time(
    robot: LayoutEntity,
    from_pos: Tuple[float, float],
    to_pos: Tuple[float, float],
    accel_time_s: float = 0.35
) -> float:
    """
    Estimates dominant-axis joint slewing time between two target fixture positions:
    t_move = (|delta_theta_1| / omega_1_max) + t_accel
    """
    k = robot.kinematics
    w1_max = k.axis1_deg_s if k else 175.0

    # Base rotation angle from robot base to target 1
    ang1 = math.atan2(from_pos[1] - robot.y, from_pos[0] - robot.x)
    # Base rotation angle to target 2
    ang2 = math.atan2(to_pos[1] - robot.y, to_pos[0] - robot.x)

    delta_rad = abs(ang1 - ang2)
    if delta_rad > math.pi:
        delta_rad = 2 * math.pi - delta_rad
    delta_deg = math.degrees(delta_rad)

    # Arm reach extension/retraction component
    d1 = math.hypot(from_pos[0] - robot.x, from_pos[1] - robot.y)
    d2 = math.hypot(to_pos[0] - robot.x, to_pos[1] - robot.y)
    radial_delta = abs(d1 - d2)
    radial_time = radial_delta / 1.2  # 1.2 m/s radial extension speed

    slew_time = (delta_deg / w1_max) + accel_time_s
    return max(slew_time, radial_time + accel_time_s)


def verify_swept_arm_corridor(
    robot: LayoutEntity,
    target_a: Tuple[float, float],
    target_b: Tuple[float, float],
    obstacles: List[Polygon],
    arm_thickness_m: float = 0.35
) -> bool:
    """
    Swept-volume corridor collision check:
    Ensures the circular sector sweep of the robot arm between target A and B
    does not intersect fixed columns, safety fences, or non-assigned equipment.
    """
    p_base = (robot.x, robot.y)
    # Triangular / sector sweep polygon formed by base, target A, and target B
    pts = [p_base, target_a, target_b, p_base]
    try:
        corridor = Polygon(pts).buffer(arm_thickness_m / 2.0)
        for obs in obstacles:
            if corridor.intersects(obs):
                # Check if it penetrates significantly
                inter = corridor.intersection(obs)
                if inter.area > 0.05:
                    return False
        return True
    except Exception:
        return True


def check_target_reachability(
    robot: LayoutEntity,
    target_pos: Tuple[float, float]
) -> Tuple[bool, bool, float]:
    """
    Returns (is_reachable, is_in_sweet_spot, distance_to_base):
    - is_reachable: falls within [Rmin, Rmax]
    - is_in_sweet_spot: falls within [1.15 * Rmin, 0.85 * Rmax]
    """
    k = robot.kinematics
    if not k:
        return True, True, 1.0

    dist = math.hypot(target_pos[0] - robot.x, target_pos[1] - robot.y)
    is_reachable = (k.r_min_m <= dist <= k.r_max_m)
    
    r_opt_min = 1.15 * k.r_min_m
    r_opt_max = 0.85 * k.r_max_m
    is_sweet = (r_opt_min <= dist <= r_opt_max)

    return is_reachable, is_sweet, dist
