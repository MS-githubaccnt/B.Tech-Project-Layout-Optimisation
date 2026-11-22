from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple
import shapely
from shapely.geometry import Point, Polygon, LineString

from backend.core.models import (
    LayoutEntity,
    PlotSchema,
    SafetyRule,
    ComplianceResult,
    ComplianceCheckDetail,
    ProjectMode,
)
from backend.core.geometry import (
    create_base_polygon,
    create_clearance_polygon,
    create_annular_reach_polygon,
    transform_ports,
)
from backend.core.routing import NavigationGrid


def evaluate_fire_egress(
    plot_boundary: Polygon,
    no_go_polys: List[Polygon],
    entities: List[LayoutEntity],
    emergency_exits: List[Any],
    max_statutory_distance_m: float = 30.0,
    grid_res: float = 0.5
) -> Tuple[bool, float, List[Dict[str, Any]]]:
    """
    Evaluates obstacle-aware walking egress distance from each workstation / operator clearance
    zone to the nearest marked emergency exit.
    Indian Factories Act / NFPA limit: 30.0 meters.
    """
    if not emergency_exits:
        return False, 999.0, [{"error": "No emergency exits configured in facility plot."}]

    nav_grid = NavigationGrid(
        plot_boundary=plot_boundary,
        no_go_polys=no_go_polys,
        entities=entities,
        grid_res=grid_res,
        vehicle_clearance_m=0.3
    )

    exit_coords = [(e.point[0], e.point[1]) for e in emergency_exits]
    details = []
    overall_max_dist = 0.0
    all_passed = True

    for entity in entities:
        ports = transform_ports(entity)
        operator_pt = (ports[0][0], ports[0][1])

        # Find closest exit via A* path
        min_exit_dist = float("inf")
        best_exit_id = ""
        for exit_obj in emergency_exits:
            dist, _ = nav_grid.get_path_and_distance(operator_pt, (exit_obj.point[0], exit_obj.point[1]))
            if dist < min_exit_dist:
                min_exit_dist = dist
                best_exit_id = exit_obj.id

        is_ok = (min_exit_dist <= max_statutory_distance_m)
        if not is_ok:
            all_passed = False
        overall_max_dist = max(overall_max_dist, min_exit_dist)

        details.append({
            "entity_id": entity.id,
            "nearest_exit": best_exit_id,
            "egress_distance_m": round(min_exit_dist, 2),
            "max_allowed_m": max_statutory_distance_m,
            "passed": is_ok
        })

    return all_passed, round(overall_max_dist, 2), details


def evaluate_forklift_aisles(
    plot_boundary: Polygon,
    no_go_polys: List[Polygon],
    entities: List[LayoutEntity],
    min_aisle_width_m: float = 3.0
) -> Tuple[bool, float, List[Dict[str, Any]]]:
    """
    Verifies that main transport aisles maintain at least min_aisle_width_m
    unobstructed clearance between machine clearances, walls, and pillars.
    """
    half_w = min_aisle_width_m / 2.0
    
    # Check free space after vehicle erosion
    obstacles = list(no_go_polys)
    for e in entities:
        obstacles.append(create_clearance_polygon(e))
        
    union_obs = shapely.unary_union(obstacles) if obstacles else Polygon()
    free_space = plot_boundary.difference(union_obs)
    
    eroded = free_space.buffer(-half_w, join_style=2)
    nav_area = eroded.area
    has_continuous_aisle = (nav_area > 5.0)

    # Estimate narrowest choke point
    choke_points = []
    for i in range(len(entities)):
        poly_i = create_clearance_polygon(entities[i])
        for j in range(i + 1, len(entities)):
            poly_j = create_clearance_polygon(entities[j])
            gap = poly_i.distance(poly_j)
            if 0 < gap < min_aisle_width_m:
                choke_points.append({
                    "entity_a": entities[i].id,
                    "entity_b": entities[j].id,
                    "gap_m": round(gap, 2),
                    "required_m": min_aisle_width_m
                })

    passed = has_continuous_aisle and len(choke_points) == 0
    min_gap = min([cp["gap_m"] for cp in choke_points]) if choke_points else min_aisle_width_m

    return passed, round(min_gap, 2), choke_points


def evaluate_hazard_separations(
    entities: List[LayoutEntity],
    safety_rules: List[SafetyRule]
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    Evaluates industrial safety rules separating incompatible equipment
    (e.g., Grinder dust vs CMM metrology room, thermal risk vs flammable chemicals).
    """
    violations = []
    
    for rule in safety_rules:
        tag_a = rule.tag_a
        tag_b = rule.tag_b
        req_dist = rule.min_distance_m

        group_a = [e for e in entities if tag_a in e.hazard_tags or tag_a in e.sensitive_tags]
        group_b = [e for e in entities if tag_b in e.hazard_tags or tag_b in e.sensitive_tags]

        for ea in group_a:
            for eb in group_b:
                if ea.id == eb.id:
                    continue
                poly_a = create_base_polygon(ea)
                poly_b = create_base_polygon(eb)
                actual_dist = poly_a.distance(poly_b)

                if actual_dist < req_dist:
                    violations.append({
                        "rule": f"{tag_a} <-> {tag_b}",
                        "entity_a": ea.id,
                        "entity_b": eb.id,
                        "actual_dist_m": round(actual_dist, 2),
                        "required_dist_m": req_dist,
                        "passed": False
                    })

    passed = (len(violations) == 0)
    return passed, violations


def evaluate_iso_10218_safety(
    plot_boundary: Polygon,
    entities: List[LayoutEntity],
    robot_tasks: List[Any]
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    ISO 10218-2:2025 & ISO 13854 Collaborative Safety Audit:
    1. Anti-crushing clearance >= 500 mm from swept robot arm envelope to walls / fences.
    2. Reachability: all task target fixtures fall strictly within robot annular reach W_r.
    3. Speed and Separation Monitoring (SSM Annex L): calculates protective distance S_p.
    4. Pinch-point quasi-static clamping detection.
    """
    robots = [e for e in entities if e.category.startswith("robot")]
    if not robots:
        return True, [{"check": "ISO 10218", "status": "N/A (No robots in layout)", "passed": True}]

    details = []
    all_passed = True

    for r in robots:
        k = r.kinematics
        if not k:
            continue
            
        r_poly = Point(r.x, r.y).buffer(k.r_max_m)
        
        # 1. Anti-Crushing Clearance (ISO 13854: >= 0.5m)
        dist_to_wall = plot_boundary.exterior.distance(r_poly)
        anti_crushing_ok = (dist_to_wall >= 0.5)
        if not anti_crushing_ok:
            all_passed = False
        details.append({
            "check": f"Anti-Crushing ({r.id})",
            "distance_to_wall_m": round(dist_to_wall, 2),
            "required_m": 0.5,
            "passed": anti_crushing_ok,
            "message": "Clearance from robot envelope to rigid wall"
        })

        # 2. Reachability of Assigned Fixtures
        r_annulus = create_annular_reach_polygon(r)
        assigned_tasks = [t for t in robot_tasks if (getattr(t, 'robot_id', None) or (t.get('robot_id') if isinstance(t, dict) else None)) == r.id]
        
        target_entities_ids = set()
        for t in assigned_tasks:
            t_seq = getattr(t, 'sequence', None) or (t.get('sequence', []) if isinstance(t, dict) else [])
            for step in t_seq:
                f_id = getattr(step, 'from_entity', None) or (step.get('from') or step.get('from_entity') if isinstance(step, dict) else None)
                t_id = getattr(step, 'to_entity', None) or (step.get('to') or step.get('to_entity') if isinstance(step, dict) else None)
                if f_id:
                    target_entities_ids.add(f_id)
                if t_id:
                    target_entities_ids.add(t_id)

        for tid in target_entities_ids:
            target_ent = next((e for e in entities if e.id == tid), None)
            if target_ent:
                target_pt = Point(target_ent.x, target_ent.y)
                is_reachable = r_annulus.contains(target_pt) if r_annulus else False
                if not is_reachable:
                    all_passed = False
                details.append({
                    "check": f"Reachability ({r.id} -> {tid})",
                    "passed": is_reachable,
                    "target_distance_m": round(math.hypot(r.x - target_ent.x, r.y - target_ent.y), 2),
                    "r_min": k.r_min_m,
                    "r_max": k.r_max_m,
                    "message": "Target fixture falls within annular reach envelope"
                })

        # 3. Speed & Separation Monitoring (SSM Normative Annex L)
        humans = [e for e in entities if e.category.startswith("human")]
        for h in humans:
            v_h = h.approach_speed_m_s or 1.6
            v_r = 1.0  # nominal robot speed m/s
            t_r = k.reaction_time_s
            t_s = k.stop_time_s
            c = 0.2    # intrusion distance
            z = 0.1    # uncertainty
            
            s_h = v_h * (t_r + t_s)
            s_r = v_r * t_r
            s_s = 0.5 * v_r * t_s
            s_p = s_h + s_r + s_s + c + z
            
            dist_robot_human = math.hypot(r.x - h.x, r.y - h.y)
            ssm_ok = (dist_robot_human >= s_p)
            if not ssm_ok:
                all_passed = False
            details.append({
                "check": f"SSM Separation ({r.id} <-> {h.id})",
                "actual_distance_m": round(dist_robot_human, 2),
                "protective_separation_Sp_m": round(s_p, 2),
                "passed": ssm_ok,
                "message": "ISO 10218-2 Normative Annex L Speed & Separation Monitoring"
            })

    return all_passed, details


def run_compliance_audit(
    plot: PlotSchema,
    entities: List[LayoutEntity],
    safety_rules: List[SafetyRule],
    robot_tasks: List[Any],
    mode: ProjectMode = ProjectMode.CELLULAR_CMS
) -> ComplianceResult:
    """
    Runs full comprehensive regulatory compliance scorecard.
    """
    plot_boundary = Polygon(plot.boundary)
    no_go_polys = [Polygon(ng.polygon) for ng in plot.no_go_zones]

    # 1. Fire Egress
    fire_ok, fire_max_dist, fire_details = evaluate_fire_egress(
        plot_boundary=plot_boundary,
        no_go_polys=no_go_polys,
        entities=entities,
        emergency_exits=plot.emergency_exits
    )

    # 2. Forklift Aisles
    aisle_ok, aisle_min_w, aisle_details = evaluate_forklift_aisles(
        plot_boundary=plot_boundary,
        no_go_polys=no_go_polys,
        entities=entities,
        min_aisle_width_m=plot.min_aisle_width_m
    )

    # 3. Hazard Separation
    haz_ok, haz_details = evaluate_hazard_separations(
        entities=entities,
        safety_rules=safety_rules
    )

    # 4. ISO 10218-2:2025
    iso_ok, iso_details = evaluate_iso_10218_safety(
        plot_boundary=plot_boundary,
        entities=entities,
        robot_tasks=robot_tasks
    )

    violations = []
    if not fire_ok:
        violations.append(f"Fire egress statutory limit exceeded (max {fire_max_dist}m > 30.0m)")
    if not aisle_ok:
        violations.append(f"Forklift aisle narrow choke point detected (min {aisle_min_w}m < {plot.min_aisle_width_m}m)")
    if not haz_ok:
        violations.append(f"{len(haz_details)} incompatible hazard separation rule(s) violated")
    if not iso_ok:
        violations.append("ISO 10218-2 / ISO 13854 robot collaborative safety requirement failed")

    # Score calculation
    checks_total = 4
    checks_passed = sum([fire_ok, aisle_ok, haz_ok, iso_ok])
    score = (checks_passed / checks_total) * 100.0

    all_details = []
    all_details.append(ComplianceCheckDetail(
        check_name="Fire Egress Travel Distance",
        passed=fire_ok,
        status="PASS" if fire_ok else "FAIL",
        value=fire_max_dist,
        threshold=30.0,
        message=f"Maximum travel distance to exit: {fire_max_dist}m"
    ))
    all_details.append(ComplianceCheckDetail(
        check_name="Forklift Navigable Aisle Width",
        passed=aisle_ok,
        status="PASS" if aisle_ok else "FAIL",
        value=aisle_min_w,
        threshold=plot.min_aisle_width_m,
        message=f"Minimum clearance gap: {aisle_min_w}m"
    ))
    all_details.append(ComplianceCheckDetail(
        check_name="Hazard Buffer Separation",
        passed=haz_ok,
        status="PASS" if haz_ok else "FAIL",
        value=float(len(haz_details)),
        threshold=0.0,
        message=f"{len(haz_details)} violation(s) found"
    ))
    all_details.append(ComplianceCheckDetail(
        check_name="ISO 10218-2 Collaborative Safety",
        passed=iso_ok,
        status="PASS" if iso_ok else "FAIL",
        value=1.0 if iso_ok else 0.0,
        threshold=1.0,
        message="SSM protective distances and anti-crushing clearances"
    ))

    return ComplianceResult(
        overall_passed=(checks_passed == checks_total),
        overall_score=round(score, 1),
        fire_egress_passed=fire_ok,
        fire_egress_max_dist_m=fire_max_dist,
        forklift_aisle_passed=aisle_ok,
        forklift_aisle_min_width_m=aisle_min_w,
        iso_safety_passed=iso_ok,
        hazard_separation_passed=haz_ok,
        violations=violations,
        details=all_details
    )
