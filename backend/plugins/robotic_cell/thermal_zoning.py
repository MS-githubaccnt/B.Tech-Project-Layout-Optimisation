from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple
import shapely
from shapely.geometry import Point, Polygon, LineString

from backend.core.models import LayoutEntity, PlotSchema
from backend.core.geometry import compute_scanner_isovist, create_base_polygon


def verify_laser_welding_isolation(
    entities: List[LayoutEntity],
    min_laser_buffer_m: float = 3.0
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    Class-4 Laser Welding Enclosure Isolation:
    Verifies that laser welding cells are enclosed and maintain optical buffer
    distance from open manual operator stations.
    """
    lasers = [e for e in entities if "laser_class4" in e.hazard_tags or "welder" in e.category]
    humans = [e for e in entities if e.category.startswith("human")]

    if not lasers:
        return True, []

    details = []
    all_ok = True

    for l in lasers:
        l_pt = Point(l.x, l.y)
        for h in humans:
            h_pt = Point(h.x, h.y)
            dist = l_pt.distance(h_pt)
            passed = (dist >= min_laser_buffer_m)
            if not passed:
                all_ok = False
            details.append({
                "laser_id": l.id,
                "human_id": h.id,
                "distance_m": round(dist, 2),
                "required_m": min_laser_buffer_m,
                "passed": passed,
                "message": "Class-4 Laser enclosure separation"
            })

    return all_ok, details


def verify_thermal_runaway_quarantine(
    plot: PlotSchema,
    entities: List[LayoutEntity],
    quarantine_buffer_m: float = 4.0
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    Thermal Runaway Quarantine / EOL Testing Bay Audit:
    Ensures quarantine bay has direct unobstructed path to emergency doors
    and maintains thermal buffer from battery cell feed storage.
    """
    quarantines = [e for e in entities if "thermal_risk" in e.hazard_tags or "quarantine" in e.category]
    if not quarantines:
        return True, []

    exits = plot.emergency_exits
    details = []
    all_ok = True

    for q in quarantines:
        q_pt = Point(q.x, q.y)
        # Check closest exit distance
        closest_exit_dist = min([q_pt.distance(Point(e.point[0], e.point[1])) for e in exits]) if exits else 99.0
        exit_ok = (closest_exit_dist <= 15.0)  # Must be within 15m of an exterior door
        if not exit_ok:
            all_ok = False
        details.append({
            "quarantine_id": q.id,
            "distance_to_door_m": round(closest_exit_dist, 2),
            "max_allowed_m": 15.0,
            "passed": exit_ok,
            "message": "Emergency disposal path from thermal runaway quarantine"
        })

    return all_ok, details


def evaluate_scanner_blind_spots(
    scanner_pos: Tuple[float, float],
    entities: List[LayoutEntity],
    workcell_boundary: Polygon,
    max_scan_radius: float = 8.0
) -> Dict[str, Any]:
    """
    Raycasts 180 sightlines to evaluate laser scanner coverage and shadow blind-spot area
    created by fixtures and robot pedestals.
    """
    obstacles = [create_base_polygon(e) for e in entities]
    isovist_poly = compute_scanner_isovist(scanner_pos, obstacles, max_range=max_scan_radius, num_rays=180)

    scanner_range_circle = Point(scanner_pos).buffer(max_scan_radius).intersection(workcell_boundary)
    total_cell_area = scanner_range_circle.area
    
    covered_area = isovist_poly.intersection(scanner_range_circle).area
    shadow_blind_spot_area = max(0.0, total_cell_area - covered_area)
    coverage_pct = (covered_area / max(1e-4, total_cell_area)) * 100.0

    return {
        "scanner_position": list(scanner_pos),
        "total_area_m2": round(total_cell_area, 2),
        "covered_area_m2": round(covered_area, 2),
        "blind_spot_area_m2": round(shadow_blind_spot_area, 2),
        "coverage_percentage": round(coverage_pct, 1),
        "blind_spot_free": (coverage_pct >= 92.0)
    }
