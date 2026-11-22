from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import shapely
from shapely.geometry import Polygon, Point, MultiPolygon, LineString, box
from shapely import affinity
from shapely.strtree import STRtree

from backend.core.models import LayoutEntity, PlotSchema, Clearances, Port


def create_base_polygon(entity: LayoutEntity) -> Polygon:
    """Creates the physical base footprint polygon of an entity transformed to (x, y, theta)."""
    L, W = entity.dimensions.L, entity.dimensions.W
    # Base rectangle centered at origin
    raw_poly = box(-L / 2.0, -W / 2.0, L / 2.0, W / 2.0)
    # Rotate around origin then translate
    rot_poly = affinity.rotate(raw_poly, entity.theta, origin=(0, 0))
    trans_poly = affinity.translate(rot_poly, entity.x, entity.y)
    return trans_poly


def create_clearance_polygon(entity: LayoutEntity) -> Polygon:
    """
    Creates the asymmetric clearance envelope:
    front: operator standing zone (forward / +Y)
    back: rear maintenance access (-Y)
    left: left clearance (-X)
    right: right clearance (+X)
    """
    L, W = entity.dimensions.L, entity.dimensions.W
    c = entity.clearances
    minx = -L / 2.0 - c.left
    maxx = L / 2.0 + c.right
    miny = -W / 2.0 - c.back
    maxy = W / 2.0 + c.front
    raw_clearance = box(minx, miny, maxx, maxy)
    rot_clearance = affinity.rotate(raw_clearance, entity.theta, origin=(0, 0))
    trans_clearance = affinity.translate(rot_clearance, entity.x, entity.y)
    return trans_clearance


def create_annular_reach_polygon(entity: LayoutEntity) -> Optional[Polygon]:
    """Generates the annular reach polygon for a robot: Buffer(Rmax) - Buffer(Rmin)."""
    if not entity.kinematics:
        return None
    k = entity.kinematics
    center = Point(entity.x, entity.y)
    outer = center.buffer(k.r_max_m)
    inner = center.buffer(k.r_min_m)
    annulus = outer.difference(inner)
    
    # If base rotation is restricted, intersect with angular wedge
    if k.axis1_deg_s and hasattr(k, "axis1_limit_deg") and getattr(k, "axis1_limit_deg", 360) < 360:
        limit = getattr(k, "axis1_limit_deg")
        # Build circular sector
        pts = [[entity.x, entity.y]]
        start_ang = math.radians(entity.theta - limit / 2.0)
        end_ang = math.radians(entity.theta + limit / 2.0)
        num_pts = 30
        for i in range(num_pts + 1):
            ang = start_ang + (end_ang - start_ang) * (i / num_pts)
            pts.append([entity.x + (k.r_max_m + 0.1) * math.cos(ang), entity.y + (k.r_max_m + 0.1) * math.sin(ang)])
        pts.append([entity.x, entity.y])
        wedge = Polygon(pts)
        annulus = annulus.intersection(wedge)
    return annulus


def create_sweet_spot_annulus(entity: LayoutEntity) -> Optional[Polygon]:
    """Computes the high-manipulability sweet-spot ring [1.15 * Rmin, 0.85 * Rmax]."""
    if not entity.kinematics:
        return None
    k = entity.kinematics
    center = Point(entity.x, entity.y)
    r_opt_max = 0.85 * k.r_max_m
    r_opt_min = 1.15 * k.r_min_m
    if r_opt_max <= r_opt_min:
        return center.buffer(k.r_max_m * 0.7).difference(center.buffer(k.r_max_m * 0.4))
    outer = center.buffer(r_opt_max)
    inner = center.buffer(r_opt_min)
    return outer.difference(inner)


def transform_ports(entity: LayoutEntity) -> List[Tuple[float, float, str]]:
    """Transforms entity relative I/O ports to absolute world coordinates."""
    rad = math.radians(entity.theta)
    cos_t = math.cos(rad)
    sin_t = math.sin(rad)
    transformed = []
    
    # If no explicit io_ports are given, default to front-center of machine
    ports_to_use = entity.io_ports
    if not ports_to_use:
        ports_to_use = [Port(x=0.0, y=entity.dimensions.W / 2.0, port_type="pd_combined")]

    for p in ports_to_use:
        wx = entity.x + p.x * cos_t - p.y * sin_t
        wy = entity.y + p.x * sin_t + p.y * cos_t
        transformed.append((wx, wy, p.port_type))
    return transformed


def compute_layout_overlaps(entities: List[LayoutEntity], use_clearances: bool = True) -> Tuple[float, List[Tuple[str, str, float]]]:
    """
    Computes pairwise overlap area between entities using STRtree indexing.
    Returns (total_overlap_area, list_of_pairs_with_area).
    """
    n = len(entities)
    if n <= 1:
        return 0.0, []

    polys = [create_clearance_polygon(e) if use_clearances else create_base_polygon(e) for e in entities]
    tree = STRtree(polys)
    
    total_overlap = 0.0
    overlapping_pairs: List[Tuple[str, str, float]] = []
    
    # Query potential collisions
    for i, poly_i in enumerate(polys):
        potential_matches = tree.query(poly_i)
        for match_idx in potential_matches:
            if match_idx > i:  # Avoid self and duplicate checks
                poly_j = polys[match_idx]
                if poly_i.intersects(poly_j):
                    inter = poly_i.intersection(poly_j)
                    area = inter.area
                    if area > 1e-4:
                        total_overlap += area
                        overlapping_pairs.append((entities[i].id, entities[match_idx].id, area))
    return total_overlap, overlapping_pairs


def compute_boundary_violations(
    plot_boundary: Polygon,
    no_go_polygons: List[Polygon],
    entities: List[LayoutEntity],
    use_clearances: bool = True
) -> Tuple[float, float]:
    """
    Computes:
    1. Area of entities lying outside the plot boundary
    2. Area of entities penetrating no-go obstacle zones
    """
    outside_area = 0.0
    obstacle_penetration = 0.0
    
    shapely.prepare(plot_boundary)
    for ng in no_go_polygons:
        shapely.prepare(ng)

    for e in entities:
        poly = create_clearance_polygon(e) if use_clearances else create_base_polygon(e)
        # Check boundary containment
        if not plot_boundary.contains(poly):
            diff = poly.difference(plot_boundary)
            outside_area += diff.area
            
        # Check no-go obstacle intersections
        for ng in no_go_polygons:
            if poly.intersects(ng):
                inter = poly.intersection(ng)
                obstacle_penetration += inter.area

    return outside_area, obstacle_penetration


def compute_free_space(
    plot_boundary: Polygon,
    no_go_polygons: List[Polygon],
    entities: List[LayoutEntity],
    transporter_width_m: float = 3.0
) -> Tuple[Polygon, Polygon]:
    """
    Computes free floor space F = Plot - Obstacles - Entities
    and navigable forklift aisle space F_nav = F.buffer(-W_veh / 2).
    """
    obstacles = list(no_go_polygons)
    for e in entities:
        obstacles.append(create_base_polygon(e))
        
    union_obstacles = shapely.unary_union(obstacles) if obstacles else Polygon()
    free_space = plot_boundary.difference(union_obstacles)
    
    half_w = transporter_width_m / 2.0
    # Minkowski erosion
    nav_space = free_space.buffer(-half_w, join_style=2)
    return free_space, nav_space


def compute_noise_field_grid(
    plot_boundary: Polygon,
    entities: List[LayoutEntity],
    grid_res: float = 0.5
) -> Dict[str, Any]:
    """
    Computes continuous 2D acoustic noise field Lp(g) in dB(A).
    Lp(g) = 10 * log10( sum_i 10^((Lw,i - 20*log10(rig) - 11) / 10) )
    """
    minx, miny, maxx, maxy = plot_boundary.bounds
    xs = np.arange(minx, maxx + grid_res, grid_res)
    ys = np.arange(miny, maxy + grid_res, grid_res)
    
    X, Y = np.meshgrid(xs, ys)
    grid_shape = X.shape
    
    # Collect sound sources (entities with noise_lw_db > 40)
    sources = [(e.x, e.y, e.noise_lw_db) for e in entities if e.noise_lw_db > 40.0]
    
    if not sources:
        noise_matrix = np.full(grid_shape, 45.0)  # Baseline ambient
    else:
        # Vectorized sound pressure accumulation
        power_sum = np.zeros(grid_shape)
        for sx, sy, lw in sources:
            dist = np.sqrt((X - sx)**2 + (Y - sy)**2)
            dist = np.maximum(dist, 0.5)  # Avoid singularity near machine center
            lp_source = lw - 20.0 * np.log10(dist) - 11.0
            power_sum += 10.0 ** (lp_source / 10.0)
            
        noise_matrix = 10.0 * np.log10(np.maximum(power_sum, 1e-5))

    # Mask points outside plot boundary
    mask = np.zeros(grid_shape, dtype=bool)
    for i in range(grid_shape[0]):
        for j in range(grid_shape[1]):
            pt = Point(X[i, j], Y[i, j])
            if plot_boundary.contains(pt):
                mask[i, j] = True

    max_db = float(np.max(noise_matrix[mask])) if np.any(mask) else 50.0
    avg_db = float(np.mean(noise_matrix[mask])) if np.any(mask) else 50.0
    
    # Check sensitive stations (e.g. CMM or desks) violating 70 dB(A) or 85 dB(A)
    sensitive_violations = []
    for e in entities:
        if "dust_sensitive" in e.sensitive_tags or "noise_max_70dB" in e.sensitive_tags or e.category == "cmm":
            # Sample noise at entity location
            ix = int(np.clip((e.x - minx) / grid_res, 0, grid_shape[1] - 1))
            iy = int(np.clip((e.y - miny) / grid_res, 0, grid_shape[0] - 1))
            val = float(noise_matrix[iy, ix])
            if val > 70.0:
                sensitive_violations.append({
                    "entity_id": e.id,
                    "measured_db": round(val, 1),
                    "threshold_db": 70.0
                })

    return {
        "minx": float(minx),
        "miny": float(miny),
        "maxx": float(maxx),
        "maxy": float(maxy),
        "grid_res": grid_res,
        "shape": list(grid_shape),
        "values": [[round(val, 1) for val in row] for row in noise_matrix],
        "mask": mask.tolist(),
        "max_db": round(max_db, 1),
        "avg_db": round(avg_db, 1),
        "sensitive_violations": sensitive_violations
    }


def compute_scanner_isovist(
    scanner_pos: Tuple[float, float],
    obstacle_polys: List[Polygon],
    max_range: float = 10.0,
    num_rays: int = 180
) -> Polygon:
    """
    Renders geometric sightline isovist from a safety laser scanner or workstation.
    Returns the visible polygon and blind-spot coverage.
    """
    sx, sy = scanner_pos
    scanner_point = Point(sx, sy)
    max_circle = scanner_point.buffer(max_range)
    
    # Cast radial line segments
    visible_points = []
    union_obs = shapely.unary_union(obstacle_polys) if obstacle_polys else Polygon()
    
    for angle_deg in np.linspace(0, 360, num_rays, endpoint=False):
        rad = math.radians(angle_deg)
        target_x = sx + max_range * math.cos(rad)
        target_y = sy + max_range * math.sin(rad)
        ray = LineString([(sx, sy), (target_x, target_y)])
        
        if union_obs and ray.intersects(union_obs):
            inter = ray.intersection(union_obs)
            # Find closest intersection point to scanner
            if inter.geom_type == 'Point':
                visible_points.append((inter.x, inter.y))
            elif inter.geom_type == 'MultiPoint':
                closest = min(inter.geoms, key=lambda p: scanner_point.distance(p))
                visible_points.append((closest.x, closest.y))
            elif inter.geom_type in ('LineString', 'MultiLineString'):
                # Extract boundary points
                pts = list(inter.coords) if hasattr(inter, 'coords') else []
                if pts:
                    closest_pt = min([Point(p) for p in pts], key=lambda p: scanner_point.distance(p))
                    visible_points.append((closest_pt.x, closest_pt.y))
                else:
                    visible_points.append((target_x, target_y))
            else:
                visible_points.append((target_x, target_y))
        else:
            visible_points.append((target_x, target_y))

    if len(visible_points) >= 3:
        try:
            isovist_poly = Polygon(visible_points).buffer(0)
            return isovist_poly.intersection(max_circle)
        except Exception:
            return max_circle
    return max_circle


def force_directed_repair(
    entities: List[LayoutEntity],
    plot_boundary: Polygon,
    no_go_polygons: List[Polygon],
    iterations: int = 8,
    step_size: float = 0.3
) -> List[LayoutEntity]:
    """
    Force-Directed Local Repair Operator:
    1. Computes repulsive Minimum Translation Vectors (MTV) between overlapping pairs.
    2. Projects out-of-bounds or obstacle-intersecting entities back into plot free-space.
    3. Respects pinned entity constraints.
    """
    repaired = [e.model_copy(deep=True) for e in entities]
    minx, miny, maxx, maxy = plot_boundary.bounds

    for it in range(iterations):
        moved_any = False
        
        # 1. Pairwise Repulsion for Overlaps
        polys = [create_clearance_polygon(e) for e in repaired]
        tree = STRtree(polys)
        
        for i, poly_i in enumerate(polys):
            if repaired[i].is_pinned:
                continue
                
            matches = tree.query(poly_i)
            for j in matches:
                if i != j and polys[i].intersects(polys[j]):
                    inter = polys[i].intersection(polys[j])
                    if inter.area > 0.01:
                        # Centroid repulsive direction
                        dx = repaired[i].x - repaired[j].x
                        dy = repaired[i].y - repaired[j].y
                        dist = math.hypot(dx, dy)
                        if dist < 1e-4:
                            dx, dy = 1.0, 0.0
                            dist = 1.0
                            
                        overlap_penetration = math.sqrt(inter.area)
                        push = min(overlap_penetration * step_size, 0.8)
                        
                        repaired[i].x += (dx / dist) * push
                        repaired[i].y += (dy / dist) * push
                        moved_any = True

        # 2. Boundary and Obstacle Containment
        for i, e in enumerate(repaired):
            if e.is_pinned:
                continue
            poly_e = create_clearance_polygon(e)
            
            # Boundary push-in
            if not plot_boundary.contains(poly_e):
                # Clamp centroid within bounds margin
                margin_x = e.dimensions.L / 2.0 + e.clearances.left
                margin_y = e.dimensions.W / 2.0 + e.clearances.back
                new_x = np.clip(repaired[i].x, minx + margin_x, maxx - margin_x)
                new_y = np.clip(repaired[i].y, miny + margin_y, maxy - margin_y)
                if abs(new_x - repaired[i].x) > 1e-3 or abs(new_y - repaired[i].y) > 1e-3:
                    repaired[i].x = float(new_x)
                    repaired[i].y = float(new_y)
                    moved_any = True

            # Obstacle push-out
            poly_e = create_clearance_polygon(repaired[i])
            for ng in no_go_polygons:
                if poly_e.intersects(ng):
                    cx, cy = ng.centroid.x, ng.centroid.y
                    dx = repaired[i].x - cx
                    dy = repaired[i].y - cy
                    dist = math.hypot(dx, dy)
                    if dist < 1e-4:
                        dx, dy = 1.0, 0.0
                        dist = 1.0
                    repaired[i].x += (dx / dist) * 0.4
                    repaired[i].y += (dy / dist) * 0.4
                    moved_any = True

        if not moved_any:
            break

    return repaired
