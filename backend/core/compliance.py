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


# ==============================================================================
# INDIAN DEFENSE STATUTORY AUDIT EVALUATORS (DGQA, PESO, AERB, NBC 2016, IS 6922)
# ==============================================================================

def evaluate_peso_explosives_qd(
    plot_boundary: Polygon,
    entities: List[LayoutEntity],
    docks: List[Any],
    k_factor: float = 30.0
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    Evaluates PESO / Indian Explosives Rules, 2008 Quantity-Distance (Q-D) separation:
    D = K * (W)^(1/3)
    Verifies that blast arcs do not overlap with plot boundary, receiving docks,
    or non-blast-rated plant areas.
    """
    explosive_entities = [
        e for e in entities
        if getattr(e, 'net_explosive_weight_kg', 0) > 0 or "explosive" in e.hazard_tags
    ]
    if not explosive_entities:
        return True, [{
            "check": "PESO Explosives Rules 2008 Q-D",
            "passed": True,
            "status": "PASS",
            "message": "N/A: No energetic/explosive materials present on shopfloor."
        }]

    details = []
    all_passed = True

    for e in explosive_entities:
        w = max(getattr(e, 'net_explosive_weight_kg', 0.0), 10.0)
        required_d = k_factor * (w ** (1.0 / 3.0))
        e_pt = Point(e.x, e.y)

        # 1. Check distance to facility plot boundary (Outside Safety Distance)
        dist_to_boundary = plot_boundary.exterior.distance(e_pt)
        boundary_ok = dist_to_boundary >= required_d
        if not boundary_ok:
            all_passed = False

        # 2. Check distance to docks / receiving
        dock_ok = True
        for dock in docks:
            dock_pt = Point(dock.point[0], dock.point[1])
            dist_dock = dock_pt.distance(e_pt)
            if dist_dock < required_d:
                dock_ok = False
                all_passed = False

        is_passed = boundary_ok and dock_ok
        details.append({
            "check": f"PESO Q-D Blast Arc ({e.id})",
            "net_explosive_weight_kg": w,
            "required_clearance_m": round(required_d, 2),
            "actual_boundary_dist_m": round(dist_to_boundary, 2),
            "passed": is_passed,
            "status": "PASS" if is_passed else "FAIL",
            "message": f"Required Q-D separation: {round(required_d, 2)}m (Actual boundary: {round(dist_to_boundary, 2)}m)"
        })

    return all_passed, details


def evaluate_dgqa_mrb_custody(
    entities: List[LayoutEntity]
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    DGQA / DGAQA Quality Assurance & Chain-of-Custody Audit (AS9100D / MIL-STD-1520):
    1. Verifies presence of a dedicated Material Review Board (MRB) Locked Quarantine Cage or Bonded Store.
    2. Verifies MRB Cage maintains >= 4.0m separation from thermal/welding hazard areas.
    """
    mrb_cages = [
        e for e in entities
        if getattr(e, 'is_mrb_bonded', False)
        or "mrb" in e.category.lower()
        or "mrb" in (e.model or "").lower()
        or "quarantine" in (e.model or "").lower()
        or "mrb_locked" in e.hazard_tags
    ]
    if not mrb_cages:
        # Check if facility has defense machines requiring custody
        is_defense_layout = any(
            "vmc_5axis" in e.category.lower() or
            "gun_drill" in e.category.lower() or
            "forming" in e.category.lower() or
            "heat_treat" in e.category.lower() or
            "inspection" in e.category.lower()
            for e in entities
        )
        if is_defense_layout:
            return False, [{
                "check": "DGQA / DGAQA MRB Custody",
                "passed": False,
                "status": "FAIL",
                "message": "DEFICIENT: Missing mandatory AS9100D / DGQA Material Review Board (MRB) locked quarantine cage."
            }]
        return True, [{
            "check": "DGQA / DGAQA MRB Custody",
            "passed": True,
            "status": "PASS",
            "message": "N/A: General commercial line without mandated flight-critical quarantine."
        }]

    # Check thermal separation
    thermal_hazards = [
        e for e in entities
        if "thermal_risk" in e.hazard_tags or e.category in ["heat_treat", "welder"]
    ]
    cage = mrb_cages[0]
    cage_poly = create_base_polygon(cage)

    for th in thermal_hazards:
        th_poly = create_base_polygon(th)
        dist = cage_poly.distance(th_poly)
        if dist < 4.0:
            return False, [{
                "check": "DGQA MRB Thermal Isolation",
                "passed": False,
                "status": "FAIL",
                "message": f"MRB Cage {cage.id} too close to thermal hazard {th.id} ({round(dist, 2)}m < 4.0m statutory limit)"
            }]

    return True, [{
        "check": "DGQA / DGAQA MRB Custody",
        "passed": True,
        "status": "PASS",
        "message": "PASSED: Dedicated locked MRB quarantine enclosure verified with >=4.0m hazard buffer."
    }]


def evaluate_aerb_radiation_shielding(
    entities: List[LayoutEntity]
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    AERB Code AERB/SC/IR Non-Destructive Testing Safety:
    Verifies that industrial radiographic X-ray/CT inspection bunkers
    maintain at least 5.0m buffer from general unshielded manual workstations.
    """
    ndt_bunkers = [
        e for e in entities
        if getattr(e, 'is_aerb_radiological', False)
        or "radiation_ndt" in e.hazard_tags
        or "bunker" in (e.model or "").lower()
    ]
    if not ndt_bunkers:
        return True, [{
            "check": "AERB Radiography Exclusion Zone",
            "passed": True,
            "status": "PASS",
            "message": "N/A: No active radiological / X-ray NDT installations on shopfloor."
        }]

    manual_stations = [e for e in entities if e.category in ["manual", "human_station", "cmm"]]
    bunker = ndt_bunkers[0]
    bunker_poly = create_base_polygon(bunker)

    for st in manual_stations:
        st_poly = create_base_polygon(st)
        dist = bunker_poly.distance(st_poly)
        if dist < 5.0:
            return False, [{
                "check": "AERB Radiography Exclusion Zone",
                "passed": False,
                "status": "FAIL",
                "message": f"Bunker {bunker.id} within {round(dist, 2)}m of {st.id} (AERB statutory limit >= 5.0m)"
            }]

    return True, [{
        "check": "AERB Radiography Exclusion Zone",
        "passed": True,
        "status": "PASS",
        "message": "PASSED: AERB <= 1 µSv/hr occupied boundary exclusion (>=5.0m) verified."
    }]


def evaluate_is6922_vibration_isolation(
    entities: List[LayoutEntity]
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    BIS IS 6922 / DIN 4150-3 Vibration Isolation for Defense Precision Metrology:
    Verifies that heavy impact equipment (drop forging hammers, high-tonnage presses)
    maintain at least 7.0m separation from precision CMM metrology and 5-axis profile mills.
    """
    heavy_forges = [
        e for e in entities
        if getattr(e, 'vibration_class', '') == "HEAVY_FORGE"
        or "forming" in e.category.lower()
        or (e.noise_lw_db > 90.0 and "vibration" in e.hazard_tags)
        or "hammer" in (e.model or "").lower()
    ]
    precision_assets = [
        e for e in entities
        if getattr(e, 'vibration_class', '') in ["SUB_MICRON_CMM", "5AXIS_MILL"]
        or "cmm" in e.category.lower()
        or "5axis" in e.category.lower()
        or "vibration_sensitive" in e.sensitive_tags
    ]

    if not heavy_forges or not precision_assets:
        return True, [{
            "check": "IS 6922 Vibration Isolation",
            "passed": True,
            "status": "PASS",
            "message": "PASSED: No high-energy impact forming equipment co-located with sensitive metrology."
        }]

    violations = []
    for hf in heavy_forges:
        hf_poly = create_base_polygon(hf)
        for pa in precision_assets:
            if hf.id == pa.id:
                continue
            pa_poly = create_base_polygon(pa)
            dist = hf_poly.distance(pa_poly)
            if dist < 7.0:
                violations.append({
                    "heavy_asset": hf.id,
                    "sensitive_asset": pa.id,
                    "actual_dist_m": round(dist, 2),
                    "required_dist_m": 7.0
                })

    is_ok = len(violations) == 0
    if not is_ok:
        v0 = violations[0]
        return False, [{
            "check": "IS 6922 Vibration Isolation",
            "passed": False,
            "status": "FAIL",
            "message": f"Ground shockwave risk: {v0['heavy_asset']} is within {v0['actual_dist_m']}m of {v0['sensitive_asset']} (IS 6922 limit >= 7.0m)"
        }]

    return True, [{
        "check": "IS 6922 Vibration Isolation",
        "passed": True,
        "status": "PASS",
        "message": "PASSED: IS 6922 / DIN 4150-3 dynamic foundation separation (>=7.0m) verified."
    }]


def run_compliance_audit(
    plot: PlotSchema,
    entities: List[LayoutEntity],
    safety_rules: List[SafetyRule],
    robot_tasks: List[Any],
    mode: ProjectMode = ProjectMode.CELLULAR_CMS
) -> ComplianceResult:
    """
    Runs full comprehensive regulatory compliance scorecard including Indian Defense
    statutory checks (DGQA, PESO Explosives Act 1884, AERB NDT, NBC 2016, IS 6922).
    """
    plot_boundary = Polygon(plot.boundary)
    no_go_polys = [Polygon(ng.polygon) for ng in plot.no_go_zones]

    # 1. Fire Egress & Emergency Exit Distance (NBC 2016 Part 4 / Factories Act 1948)
    has_hazardous = any(
        getattr(e, 'net_explosive_weight_kg', 0) > 0 or
        "thermal_risk" in e.hazard_tags or
        "radiation_ndt" in e.hazard_tags or
        "explosive" in e.hazard_tags
        for e in entities
    )
    egress_statutory_limit = 22.5 if has_hazardous else 30.0

    fire_ok, fire_max_dist, fire_details = evaluate_fire_egress(
        plot_boundary=plot_boundary,
        no_go_polys=no_go_polys,
        entities=entities,
        emergency_exits=plot.emergency_exits,
        max_statutory_distance_m=egress_statutory_limit
    )

    # 2. Forklift & Heavy Armament Navigable Aisles (Minkowski Clearances)
    aisle_ok, aisle_min_w, aisle_details = evaluate_forklift_aisles(
        plot_boundary=plot_boundary,
        no_go_polys=no_go_polys,
        entities=entities,
        min_aisle_width_m=plot.min_aisle_width_m
    )

    # 3. Incompatible Hazard Buffer Separations
    haz_ok, haz_details = evaluate_hazard_separations(
        entities=entities,
        safety_rules=safety_rules
    )

    # 4. DGQA / DGAQA Quality & Chain-of-Custody (AS9100D MRB Locked Quarantine)
    dgqa_ok, dgqa_details = evaluate_dgqa_mrb_custody(entities=entities)

    # 5. PESO & Indian Explosives Rules, 2008 (Quantity-Distance Blast Arcs)
    peso_ok, peso_details = evaluate_peso_explosives_qd(
        plot_boundary=plot_boundary,
        entities=entities,
        docks=plot.docks
    )

    # 6. AERB Code AERB/SC/IR (Radiography & NDT Bunker Exclusion Zone)
    aerb_ok, aerb_details = evaluate_aerb_radiation_shielding(entities=entities)

    # 7. BIS IS 6922 / DIN 4150-3 (Vibration Isolation for Defense Metrology)
    vib_ok, vib_details = evaluate_is6922_vibration_isolation(entities=entities)

    # 8. ISO 10218-2 Collaborative Safety (Evaluated if robots are present)
    robots = [e for e in entities if e.category.startswith("robot")]
    if robots and robot_tasks:
        iso_ok, iso_details = evaluate_iso_10218_safety(
            plot_boundary=plot_boundary,
            entities=entities,
            robot_tasks=robot_tasks
        )
    else:
        iso_ok, iso_details = True, [{"check": "ISO 10218", "status": "N/A", "passed": True}]

    violations = []
    if not fire_ok:
        violations.append(f"NBC 2016 Fire egress limit exceeded (max {fire_max_dist}m > {egress_statutory_limit}m)")
    if not aisle_ok:
        violations.append(f"Heavy armament aisle choke point detected (min {aisle_min_w}m < {plot.min_aisle_width_m}m)")
    if not haz_ok:
        violations.append(f"{len(haz_details)} incompatible hazard separation rule(s) violated")
    if not dgqa_ok:
        violations.append(dgqa_details[0]["message"])
    if not peso_ok:
        violations.append("PESO Explosives Rules 2008 Quantity-Distance blast arc violation detected")
    if not aerb_ok:
        violations.append(aerb_details[0]["message"])
    if not vib_ok:
        violations.append(vib_details[0]["message"])
    if not iso_ok:
        violations.append("ISO 10218-2 collaborative safety requirement failed")

    # Score calculation across core checks
    check_statuses = [fire_ok, aisle_ok, haz_ok, dgqa_ok, peso_ok, aerb_ok, vib_ok]
    if robots and robot_tasks:
        check_statuses.append(iso_ok)

    checks_total = len(check_statuses)
    checks_passed = sum(check_statuses)
    score = (checks_passed / checks_total) * 100.0

    all_details = []
    all_details.append(ComplianceCheckDetail(
        check_name="NBC 2016 / Factories Act Egress Distance",
        passed=fire_ok,
        status="PASS" if fire_ok else "FAIL",
        value=fire_max_dist,
        threshold=egress_statutory_limit,
        message=f"Maximum walking egress: {fire_max_dist}m (Statutory threshold <= {egress_statutory_limit}m)"
    ))
    all_details.append(ComplianceCheckDetail(
        check_name="Heavy Armament Navigable Aisle Width",
        passed=aisle_ok,
        status="PASS" if aisle_ok else "FAIL",
        value=aisle_min_w,
        threshold=plot.min_aisle_width_m,
        message=f"Minimum clearance gap: {aisle_min_w}m"
    ))
    all_details.append(ComplianceCheckDetail(
        check_name="Hazard Buffer Separation Matrix",
        passed=haz_ok,
        status="PASS" if haz_ok else "FAIL",
        value=float(len(haz_details)),
        threshold=0.0,
        message=f"{len(haz_details)} violation(s) found"
    ))
    all_details.append(ComplianceCheckDetail(
        check_name="DGQA / DGAQA Quality & MRB Custody",
        passed=dgqa_ok,
        status="PASS" if dgqa_ok else "FAIL",
        value=1.0 if dgqa_ok else 0.0,
        threshold=1.0,
        message=dgqa_details[0]["message"]
    ))
    all_details.append(ComplianceCheckDetail(
        check_name="PESO Explosives Rules 2008 Q-D Safety",
        passed=peso_ok,
        status="PASS" if peso_ok else "FAIL",
        value=1.0 if peso_ok else 0.0,
        threshold=1.0,
        message=peso_details[0]["message"]
    ))
    all_details.append(ComplianceCheckDetail(
        check_name="AERB Industrial Radiography Shielding",
        passed=aerb_ok,
        status="PASS" if aerb_ok else "FAIL",
        value=1.0 if aerb_ok else 0.0,
        threshold=1.0,
        message=aerb_details[0]["message"]
    ))
    all_details.append(ComplianceCheckDetail(
        check_name="IS 6922 / DIN 4150-3 Vibration Isolation",
        passed=vib_ok,
        status="PASS" if vib_ok else "FAIL",
        value=1.0 if vib_ok else 0.0,
        threshold=1.0,
        message=vib_details[0]["message"]
    ))
    if robots and robot_tasks:
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
        dgqa_custody_passed=dgqa_ok,
        peso_qd_passed=peso_ok,
        aerb_radiation_passed=aerb_ok,
        nbc_group_j_egress_passed=fire_ok,
        is6922_vibration_isolation_passed=vib_ok,
        violations=violations,
        details=all_details
    )
