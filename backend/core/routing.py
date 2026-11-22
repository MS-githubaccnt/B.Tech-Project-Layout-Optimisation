from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple, Set
import numpy as np
import networkx as nx
import shapely
from shapely.geometry import Point, LineString, Polygon, MultiPolygon

from backend.core.models import LayoutEntity, PlotSchema, UtilityDrop, Dock, EmergencyExit
from backend.core.geometry import create_base_polygon, transform_ports


class NavigationGrid:
    """
    Constructs an obstacle-aware orthogonal 2D grid graph over floor free-space
    for exact A* shortest-path material handling and fire egress calculation.
    """
    def __init__(
        self,
        plot_boundary: Polygon,
        no_go_polys: List[Polygon],
        entities: List[LayoutEntity],
        grid_res: float = 0.5,
        vehicle_clearance_m: float = 0.5
    ):
        self.plot_boundary = plot_boundary
        self.grid_res = grid_res
        self.vehicle_clearance = vehicle_clearance_m
        
        # Build composite obstacle union
        obs_list = list(no_go_polys)
        for e in entities:
            # Entities with buffer for clearance
            obs_list.append(create_base_polygon(e).buffer(vehicle_clearance_m))
            
        self.obstacles = shapely.unary_union(obs_list) if obs_list else Polygon()
        shapely.prepare(self.plot_boundary)
        if self.obstacles:
            shapely.prepare(self.obstacles)

        self.graph = nx.Graph()
        self.minx, self.miny, self.maxx, self.maxy = plot_boundary.bounds
        self._build_grid()

    def _build_grid(self):
        """Discretizes plot and connects 8-connected or 4-connected neighbor nodes in free space."""
        xs = np.arange(self.minx + self.grid_res / 2.0, self.maxx, self.grid_res)
        ys = np.arange(self.miny + self.grid_res / 2.0, self.maxy, self.grid_res)
        
        valid_nodes: Set[Tuple[float, float]] = set()
        for x in xs:
            for y in ys:
                pt = Point(x, y)
                if self.plot_boundary.contains(pt):
                    if not self.obstacles or not self.obstacles.intersects(pt):
                        rx, ry = round(float(x), 2), round(float(y), 2)
                        valid_nodes.add((rx, ry))
                        self.graph.add_node((rx, ry), pos=(rx, ry))

        # Add edges between adjacent grid cells (orthogonal + diagonal)
        moves = [
            (self.grid_res, 0.0, self.grid_res),
            (-self.grid_res, 0.0, self.grid_res),
            (0.0, self.grid_res, self.grid_res),
            (0.0, -self.grid_res, self.grid_res),
            (self.grid_res, self.grid_res, self.grid_res * 1.414),
            (-self.grid_res, self.grid_res, self.grid_res * 1.414),
            (self.grid_res, -self.grid_res, self.grid_res * 1.414),
            (-self.grid_res, -self.grid_res, self.grid_res * 1.414),
        ]

        for u in valid_nodes:
            for dx, dy, weight in moves:
                v = (round(u[0] + dx, 2), round(u[1] + dy, 2))
                if v in valid_nodes:
                    self.graph.add_edge(u, v, weight=weight)

    def find_nearest_node(self, pt: Tuple[float, float]) -> Optional[Tuple[float, float]]:
        """Maps an arbitrary 2D coordinate to the closest valid free-space grid node."""
        if not self.graph.nodes:
            return None
        px, py = pt
        # Snap to grid
        target_rx = round(round((px - self.minx) / self.grid_res) * self.grid_res + self.minx, 2)
        target_ry = round(round((py - self.miny) / self.grid_res) * self.grid_res + self.miny, 2)
        
        if (target_rx, target_ry) in self.graph:
            return (target_rx, target_ry)

        # Fallback search within local neighborhood
        best_node = None
        best_dist = float("inf")
        for node in self.graph.nodes:
            d = (node[0] - px)**2 + (node[1] - py)**2
            if d < best_dist:
                best_dist = d
                best_node = node
                if d < (self.grid_res * 1.5)**2:
                    break
        return best_node

    def get_path_and_distance(
        self,
        start_pt: Tuple[float, float],
        end_pt: Tuple[float, float]
    ) -> Tuple[float, List[Tuple[float, float]]]:
        """Calculates obstacle-aware A* path and distance between two points."""
        n_start = self.find_nearest_node(start_pt)
        n_end = self.find_nearest_node(end_pt)
        
        if not n_start or not n_end:
            euclid = math.hypot(start_pt[0] - end_pt[0], start_pt[1] - end_pt[1])
            return euclid * 1.4, [start_pt, end_pt]

        if n_start == n_end:
            return 0.0, [start_pt, end_pt]

        try:
            def heuristic(u, v):
                return math.hypot(u[0] - v[0], u[1] - v[1])

            path = nx.astar_path(self.graph, n_start, n_end, heuristic=heuristic, weight="weight")
            length = nx.astar_path_length(self.graph, n_start, n_end, heuristic=heuristic, weight="weight")
            full_path = [start_pt] + path + [end_pt]
            return float(length), full_path
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            # Fallback if disconnected: Manhattan distance with obstacle detour penalty
            manhattan = abs(start_pt[0] - end_pt[0]) + abs(start_pt[1] - end_pt[1])
            return manhattan * 1.8, [start_pt, end_pt]


def compute_material_handling_distances(
    nav_grid: Optional[NavigationGrid],
    entities: List[LayoutEntity],
    docks: List[Dock],
    inter_cell_pairs: List[Tuple[str, str]]
) -> Dict[Tuple[str, str], float]:
    """
    Computes exact material handling distances between entity P/D ports.
    If nav_grid is provided, uses A* routing; otherwise uses Manhattan/Euclidean approximation.
    """
    port_dict: Dict[str, Tuple[float, float]] = {}
    for e in entities:
        ports = transform_ports(e)
        port_dict[e.id] = (ports[0][0], ports[0][1])

    for d in docks:
        port_dict[d.id] = (d.point[0], d.point[1])

    dist_map: Dict[Tuple[str, str], float] = {}

    for src_id, dst_id in inter_cell_pairs:
        if src_id not in port_dict or dst_id not in port_dict:
            continue
        p1 = port_dict[src_id]
        p2 = port_dict[dst_id]

        if nav_grid:
            dist, _ = nav_grid.get_path_and_distance(p1, p2)
        else:
            # Rectilinear Manhattan distance + 15% turning allowance
            dist = (abs(p1[0] - p2[0]) + abs(p1[1] - p2[1])) * 1.15
            
        dist_map[(src_id, dst_id)] = dist

    return dist_map


def compute_steiner_utility_network(
    plot_boundary: Polygon,
    utility_drops: List[UtilityDrop],
    entities: List[LayoutEntity],
    utility_type: str = "power_3ph",
    grid_spacing: float = 2.0
) -> Tuple[float, List[LineString]]:
    """
    Computes overhead rectilinear Steiner-Tree routing for a specific utility type
    (e.g., 415V 3-phase power busbar, compressed air manifold, or fume exhaust header).
    Returns (total_length_meters, list_of_linestring_segments).
    """
    # 1. Identify drops and entities requiring this utility
    target_drops = [d for d in utility_drops if d.utility == utility_type]
    target_entities = [e for e in entities if utility_type in e.utilities]

    if not target_drops or not target_entities:
        return 0.0, []

    # 2. Collect terminal coordinates
    terminals = [(d.point[0], d.point[1]) for d in target_drops] + [(e.x, e.y) for e in target_entities]

    # If small number of terminals, use minimal spanning tree over rectilinear grid
    all_x = sorted(list(set([t[0] for t in terminals])))
    all_y = sorted(list(set([t[1] for t in terminals])))

    # Build rectilinear routing graph
    G = nx.Graph()
    snap_radius = 0.5
    
    # Add terminals
    terminal_nodes = []
    for idx, (tx, ty) in enumerate(terminals):
        tnode = (round(tx, 2), round(ty, 2))
        G.add_node(tnode, terminal=True)
        terminal_nodes.append(tnode)

    # Add Hanan grid nodes (intersections of all X and Y terminal lines)
    for x in all_x:
        for y in all_y:
            node = (round(x, 2), round(y, 2))
            if Point(node).within(plot_boundary.buffer(1.0)):
                G.add_node(node, terminal=(node in terminal_nodes))

    # Connect grid horizontally and vertically
    for x in all_x:
        for i in range(len(all_y) - 1):
            n1 = (round(x, 2), round(all_y[i], 2))
            n2 = (round(x, 2), round(all_y[i + 1], 2))
            if n1 in G and n2 in G:
                dist = abs(all_y[i + 1] - all_y[i])
                G.add_edge(n1, n2, weight=dist)

    for y in all_y:
        for i in range(len(all_x) - 1):
            n1 = (round(all_x[i], 2), round(y, 2))
            n2 = (round(all_x[i + 1], 2), round(y, 2))
            if n1 in G and n2 in G:
                dist = abs(all_x[i + 1] - all_x[i])
                G.add_edge(n1, n2, weight=dist)

    # Calculate Steiner Minimal Tree approximation
    try:
        # Use NetworkX steiner_tree approximation
        st_tree = nx.algorithms.approximation.steiner_tree(G, terminal_nodes, weight="weight")
        total_length = sum(data["weight"] for _, _, data in st_tree.edges(data=True))
        
        segments = []
        for u, v in st_tree.edges():
            segments.append(LineString([u, v]))
        return float(total_length), segments
    except Exception:
        # Fallback: Minimum Spanning Tree over direct Manhattan distances
        complete_g = nx.Graph()
        for i in range(len(terminals)):
            for j in range(i + 1, len(terminals)):
                t1, t2 = terminals[i], terminals[j]
                m_dist = abs(t1[0] - t2[0]) + abs(t1[1] - t2[1])
                complete_g.add_edge(i, j, weight=m_dist)
        mst = nx.minimum_spanning_tree(complete_g)
        mst_len = sum(data["weight"] for _, _, data in mst.edges(data=True))
        
        segments = []
        for i, j in mst.edges():
            t1, t2 = terminals[i], terminals[j]
            # Rectilinear corner: (t1[0], t1[1]) -> (t2[0], t1[1]) -> (t2[0], t2[1])
            segments.append(LineString([t1, (t2[0], t1[1])]))
            segments.append(LineString([(t2[0], t1[1]), t2]))
            
        return float(mst_len), segments
