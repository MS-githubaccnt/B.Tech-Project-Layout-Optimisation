from __future__ import annotations

import math
import random
from typing import Any, Dict, List, Optional, Tuple
import numpy as np


class CellFormationResult:
    def __init__(
        self,
        algorithm: str,
        grouping_efficacy: float,
        weighted_efficacy: float,
        num_cells: int,
        machine_cell_map: Dict[str, int],
        part_cell_map: Dict[str, int],
        exceptional_elements: int,
        intra_cell_voids: int,
        reordered_matrix: List[List[int]],
        row_names: List[str],
        col_names: List[str],
        cell_boundaries: List[Dict[str, int]],
        duplicated_machines: Optional[List[Dict[str, Any]]] = None
    ):
        self.algorithm = algorithm
        self.grouping_efficacy = grouping_efficacy
        self.weighted_efficacy = weighted_efficacy
        self.num_cells = num_cells
        self.machine_cell_map = machine_cell_map
        self.part_cell_map = part_cell_map
        self.exceptional_elements = exceptional_elements
        self.intra_cell_voids = intra_cell_voids
        self.reordered_matrix = reordered_matrix
        self.row_names = row_names
        self.col_names = col_names
        self.cell_boundaries = cell_boundaries
        self.duplicated_machines = duplicated_machines or []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "algorithm": self.algorithm,
            "grouping_efficacy": round(self.grouping_efficacy, 4),
            "weighted_efficacy": round(self.weighted_efficacy, 4),
            "num_cells": self.num_cells,
            "machine_cell_map": self.machine_cell_map,
            "part_cell_map": self.part_cell_map,
            "exceptional_elements": self.exceptional_elements,
            "intra_cell_voids": self.intra_cell_voids,
            "reordered_matrix": self.reordered_matrix,
            "row_names": self.row_names,
            "col_names": self.col_names,
            "cell_boundaries": self.cell_boundaries,
            "duplicated_machines": self.duplicated_machines
        }


def compute_grouping_efficacy(
    matrix: np.ndarray,
    machine_cell_assign: np.ndarray,
    part_cell_assign: np.ndarray,
    num_cells: int,
    demands: Optional[np.ndarray] = None
) -> Tuple[float, float, int, int]:
    """
    Computes Grouping Efficacy:
    Gamma = (e - e0) / (e + ev)
    where:
    e = total 1s in matrix
    e0 = exceptional elements (1s outside assigned cell block)
    ev = voids (0s inside assigned cell block)
    """
    M, P = matrix.shape
    total_e = int(np.sum(matrix))
    if total_e == 0:
        return 0.0, 0.0, 0, 0

    e0 = 0
    ev = 0
    weighted_e0 = 0.0
    total_weighted_e = 0.0

    weight_vec = demands if demands is not None else np.ones(P)

    for m in range(M):
        c_m = machine_cell_assign[m]
        for p in range(P):
            c_p = part_cell_assign[p]
            is_same_cell = (c_m == c_p)
            val = matrix[m, p]
            w = weight_vec[p]

            if val == 1:
                total_weighted_e += w
                if not is_same_cell:
                    e0 += 1
                    weighted_e0 += w
            else:
                if is_same_cell:
                    ev += 1

    denom = total_e + ev
    gamma = (total_e - e0) / denom if denom > 0 else 0.0
    
    # Demand-weighted efficacy
    weighted_denom = total_weighted_e + (ev * np.mean(weight_vec))
    weighted_gamma = (total_weighted_e - weighted_e0) / weighted_denom if weighted_denom > 0 else 0.0

    return float(gamma), float(weighted_gamma), e0, ev


def assign_parts_optimally(
    matrix: np.ndarray,
    machine_cell_assign: np.ndarray,
    num_cells: int
) -> np.ndarray:
    """
    Given machine-to-cell assignments, assigns each part to the cell
    that contains the maximum number of required machines for that part.
    """
    M, P = matrix.shape
    part_assign = np.zeros(P, dtype=int)

    for p in range(P):
        best_cell = 0
        best_ops = -1
        for k in range(num_cells):
            # Count 1s in this cell for part p
            machines_in_k = (machine_cell_assign == k)
            ops = np.sum(matrix[machines_in_k, p])
            if ops > best_ops:
                best_ops = ops
                best_cell = k
        part_assign[p] = best_cell

    return part_assign


# ---------------------------------------------------------------------------
# 1. Rank Order Clustering (ROC)
# ---------------------------------------------------------------------------
def run_roc(
    matrix: np.ndarray,
    machine_names: List[str],
    part_names: List[str],
    num_cells: int = 3,
    demands: Optional[np.ndarray] = None
) -> CellFormationResult:
    """King's Rank Order Clustering Algorithm."""
    M, P = matrix.shape
    mat = matrix.copy()
    row_idx = list(range(M))
    col_idx = list(range(P))

    max_iter = 20
    for _ in range(max_iter):
        # 1. Calculate column weights & sort
        col_weights = []
        for j in range(P):
            w = 0.0
            for i in range(M):
                w += mat[i, j] * (2 ** (M - 1 - i))
            col_weights.append((w, j))
        col_weights.sort(key=lambda x: x[0], reverse=True)
        new_col_order = [x[1] for x in col_weights]
        mat = mat[:, new_col_order]
        col_idx = [col_idx[j] for j in new_col_order]

        # 2. Calculate row weights & sort
        row_weights = []
        for i in range(M):
            w = 0.0
            for j in range(P):
                w += mat[i, j] * (2 ** (P - 1 - j))
            row_weights.append((w, i))
        row_weights.sort(key=lambda x: x[0], reverse=True)
        new_row_order = [x[1] for x in row_weights]
        mat = mat[new_row_order, :]
        row_idx = [row_idx[i] for i in new_row_order]

    # Partition rows and columns evenly into num_cells
    m_per_cell = math.ceil(M / num_cells)
    p_per_cell = math.ceil(P / num_cells)

    m_assign_orig = np.zeros(M, dtype=int)
    for pos, orig_i in enumerate(row_idx):
        cell = min(num_cells - 1, pos // m_per_cell)
        m_assign_orig[orig_i] = cell

    p_assign_orig = assign_parts_optimally(matrix, m_assign_orig, num_cells)

    gamma, w_gamma, e0, ev = compute_grouping_efficacy(
        matrix, m_assign_orig, p_assign_orig, num_cells, demands
    )

    machine_cell_map = {machine_names[i]: int(m_assign_orig[i]) for i in range(M)}
    part_cell_map = {part_names[j]: int(p_assign_orig[j]) for j in range(P)}

    # Cell boundaries in sorted view
    boundaries = []
    for k in range(num_cells):
        rows_k = [i for i, orig_i in enumerate(row_idx) if m_assign_orig[orig_i] == k]
        cols_k = [j for j, orig_j in enumerate(col_idx) if p_assign_orig[orig_j] == k]
        if rows_k and cols_k:
            boundaries.append({
                "cell_id": k,
                "row_start": min(rows_k),
                "row_end": max(rows_k),
                "col_start": min(cols_k),
                "col_end": max(cols_k)
            })

    return CellFormationResult(
        algorithm="ROC",
        grouping_efficacy=gamma,
        weighted_efficacy=w_gamma,
        num_cells=num_cells,
        machine_cell_map=machine_cell_map,
        part_cell_map=part_cell_map,
        exceptional_elements=e0,
        intra_cell_voids=ev,
        reordered_matrix=mat.tolist(),
        row_names=[machine_names[i] for i in row_idx],
        col_names=[part_names[j] for j in col_idx],
        cell_boundaries=boundaries
    )


# ---------------------------------------------------------------------------
# 2. Bond Energy Algorithm (BEA)
# ---------------------------------------------------------------------------
def run_bea(
    matrix: np.ndarray,
    machine_names: List[str],
    part_names: List[str],
    num_cells: int = 3,
    demands: Optional[np.ndarray] = None
) -> CellFormationResult:
    """McCormick's Bond Energy Algorithm for block diagonal clustering."""
    M, P = matrix.shape
    mat = matrix.copy()

    # Column ordering by bond energy
    col_order = [0, 1] if P > 1 else [0]
    for i in range(2, P):
        best_pos = 0
        best_me = -1e9
        for pos in range(i + 1):
            temp_order = col_order[:pos] + [i] + col_order[pos:]
            # Calculate column ME
            submat = mat[:, temp_order]
            me = 0.0
            for c in range(len(temp_order) - 1):
                me += np.dot(submat[:, c], submat[:, c + 1])
            if me > best_me:
                best_me = me
                best_pos = pos
        col_order.insert(best_pos, i)

    mat = mat[:, col_order]

    # Row ordering by bond energy
    row_order = [0, 1] if M > 1 else [0]
    for i in range(2, M):
        best_pos = 0
        best_me = -1e9
        for pos in range(i + 1):
            temp_order = row_order[:pos] + [i] + row_order[pos:]
            submat = mat[temp_order, :]
            me = 0.0
            for r in range(len(temp_order) - 1):
                me += np.dot(submat[r, :], submat[r + 1, :])
            if me > best_me:
                best_me = me
                best_pos = pos
        row_order.insert(best_pos, i)

    mat = mat[row_order, :]

    m_per_cell = math.ceil(M / num_cells)
    m_assign_orig = np.zeros(M, dtype=int)
    for pos, orig_i in enumerate(row_order):
        cell = min(num_cells - 1, pos // m_per_cell)
        m_assign_orig[orig_i] = cell

    p_assign_orig = assign_parts_optimally(matrix, m_assign_orig, num_cells)
    gamma, w_gamma, e0, ev = compute_grouping_efficacy(
        matrix, m_assign_orig, p_assign_orig, num_cells, demands
    )

    machine_cell_map = {machine_names[i]: int(m_assign_orig[i]) for i in range(M)}
    part_cell_map = {part_names[j]: int(p_assign_orig[j]) for j in range(P)}

    boundaries = []
    for k in range(num_cells):
        rows_k = [i for i, orig_i in enumerate(row_order) if m_assign_orig[orig_i] == k]
        cols_k = [j for j, orig_j in enumerate(col_order) if p_assign_orig[orig_j] == k]
        if rows_k and cols_k:
            boundaries.append({
                "cell_id": k,
                "row_start": min(rows_k),
                "row_end": max(rows_k),
                "col_start": min(cols_k),
                "col_end": max(cols_k)
            })

    return CellFormationResult(
        algorithm="BEA",
        grouping_efficacy=gamma,
        weighted_efficacy=w_gamma,
        num_cells=num_cells,
        machine_cell_map=machine_cell_map,
        part_cell_map=part_cell_map,
        exceptional_elements=e0,
        intra_cell_voids=ev,
        reordered_matrix=mat.tolist(),
        row_names=[machine_names[i] for i in row_order],
        col_names=[part_names[j] for j in col_order],
        cell_boundaries=boundaries
    )


# ---------------------------------------------------------------------------
# 3. Hybrid Genetic Algorithm (Gonçalves & Resende paradigm)
# ---------------------------------------------------------------------------
def run_hybrid_ga(
    matrix: np.ndarray,
    machine_names: List[str],
    part_names: List[str],
    num_cells: int = 3,
    pop_size: int = 40,
    generations: int = 40,
    demands: Optional[np.ndarray] = None,
    allow_duplication: bool = False,
    capital_budget_inr: float = 0.0,
    machine_costs: Optional[Dict[str, float]] = None
) -> CellFormationResult:
    """
    Hybrid Genetic Algorithm with 1-swap local search to maximize Grouping Efficacy.
    Guarantees non-singleton cells and optional machine duplication under capital budget.
    """
    M, P = matrix.shape

    # Seed initial population with random + ROC + BEA solutions
    population: List[np.ndarray] = []
    
    # Add ROC and BEA as elite seeds
    roc_res = run_roc(matrix, machine_names, part_names, num_cells, demands)
    bea_res = run_bea(matrix, machine_names, part_names, num_cells, demands)
    
    seed_roc = np.array([roc_res.machine_cell_map[m] for m in machine_names])
    seed_bea = np.array([bea_res.machine_cell_map[m] for m in machine_names])
    population.append(seed_roc)
    population.append(seed_bea)

    for _ in range(pop_size - len(population)):
        ind = np.random.randint(0, num_cells, size=M)
        # Ensure all cells have at least 2 machines
        for k in range(num_cells):
            if np.sum(ind == k) < 2:
                # Reassign random machines
                for _ in range(2):
                    idx = np.random.randint(0, M)
                    ind[idx] = k
        population.append(ind)

    best_gamma = -1.0
    best_chrom = population[0].copy()

    for gen in range(generations):
        # Evaluate fitness
        fitness_scores = []
        for chrom in population:
            p_assign = assign_parts_optimally(matrix, chrom, num_cells)
            g, _, _, _ = compute_grouping_efficacy(matrix, chrom, p_assign, num_cells, demands)
            fitness_scores.append(g)
            if g > best_gamma:
                best_gamma = g
                best_chrom = chrom.copy()

        # Selection: Tournament
        new_pop = [best_chrom.copy()]  # Elitism
        while len(new_pop) < pop_size:
            # Tournament 1
            i1, i2 = random.sample(range(pop_size), 2)
            p1 = population[i1] if fitness_scores[i1] >= fitness_scores[i2] else population[i2]
            # Tournament 2
            i3, i4 = random.sample(range(pop_size), 2)
            p2 = population[i3] if fitness_scores[i3] >= fitness_scores[i4] else population[i4]

            # Uniform Crossover
            mask = np.random.rand(M) > 0.5
            child = np.where(mask, p1, p2)

            # Mutation: Reassign machine to another cell
            if random.random() < 0.2:
                mut_idx = random.randint(0, M - 1)
                child[mut_idx] = random.randint(0, num_cells - 1)

            # Local 1-Swap Refinement on 15% of children
            if random.random() < 0.15:
                curr_p = assign_parts_optimally(matrix, child, num_cells)
                curr_g, _, _, _ = compute_grouping_efficacy(matrix, child, curr_p, num_cells, demands)
                for test_m in range(min(M, 8)):
                    orig_c = child[test_m]
                    for target_c in range(num_cells):
                        if target_c != orig_c:
                            child[test_m] = target_c
                            tp = assign_parts_optimally(matrix, child, num_cells)
                            tg, _, _, _ = compute_grouping_efficacy(matrix, child, tp, num_cells, demands)
                            if tg > curr_g:
                                curr_g = tg
                                orig_c = target_c
                            else:
                                child[test_m] = orig_c

            new_pop.append(child)

        population = new_pop

    # Machine Duplication Module
    duplicated = []
    if allow_duplication and capital_budget_inr > 0 and machine_costs:
        rem_budget = capital_budget_inr
        # Find which machines generate the most exceptional elements
        final_p = assign_parts_optimally(matrix, best_chrom, num_cells)
        m_except_counts = []
        for m in range(M):
            c_m = best_chrom[m]
            count = 0
            for p in range(P):
                if matrix[m, p] == 1 and final_p[p] != c_m:
                    count += 1
            m_except_counts.append((count, m))
        m_except_counts.sort(key=lambda x: x[0], reverse=True)

        for count, m in m_except_counts:
            cost = machine_costs.get(machine_names[m], 200000.0)
            if count >= 2 and cost <= rem_budget:
                rem_budget -= cost
                duplicated.append({
                    "machine_name": machine_names[m],
                    "cost_inr": cost,
                    "target_cells": [int(final_p[p]) for p in range(P) if matrix[m, p] == 1 and final_p[p] != best_chrom[m]],
                    "exceptional_saved": count
                })

    final_p = assign_parts_optimally(matrix, best_chrom, num_cells)
    gamma, w_gamma, e0, ev = compute_grouping_efficacy(matrix, best_chrom, final_p, num_cells, demands)

    machine_cell_map = {machine_names[i]: int(best_chrom[i]) for i in range(M)}
    part_cell_map = {part_names[j]: int(final_p[j]) for j in range(P)}

    # Sort rows and cols grouped by assigned cell
    row_order = sorted(range(M), key=lambda i: best_chrom[i])
    col_order = sorted(range(P), key=lambda j: final_p[j])
    sorted_mat = matrix[row_order, :][:, col_order]

    boundaries = []
    for k in range(num_cells):
        rows_k = [pos for pos, orig_i in enumerate(row_order) if best_chrom[orig_i] == k]
        cols_k = [pos for pos, orig_j in enumerate(col_order) if final_p[orig_j] == k]
        if rows_k and cols_k:
            boundaries.append({
                "cell_id": k,
                "row_start": min(rows_k),
                "row_end": max(rows_k),
                "col_start": min(cols_k),
                "col_end": max(cols_k)
            })

    return CellFormationResult(
        algorithm="Hybrid GA",
        grouping_efficacy=gamma,
        weighted_efficacy=w_gamma,
        num_cells=num_cells,
        machine_cell_map=machine_cell_map,
        part_cell_map=part_cell_map,
        exceptional_elements=e0,
        intra_cell_voids=ev,
        reordered_matrix=sorted_mat.tolist(),
        row_names=[machine_names[i] for i in row_order],
        col_names=[part_names[j] for j in col_order],
        cell_boundaries=boundaries,
        duplicated_machines=duplicated
    )


def extract_incidence_matrix_from_config(
    entities: List[Any],
    part_routings: List[Any]
) -> Tuple[np.ndarray, List[str], List[str], np.ndarray]:
    """
    Constructs the M x P binary incidence matrix from active machine footprints and part routings.
    """
    machine_names = [getattr(e, 'id', str(e)) for e in entities]
    part_names = [getattr(p, 'part_id', str(p)) for p in part_routings]
    if not machine_names or not part_names:
        return np.zeros((max(1, len(machine_names)), max(1, len(part_names))), dtype=int), machine_names, part_names, np.array([1.0])

    M = len(machine_names)
    P = len(part_names)
    mat = np.zeros((M, P), dtype=int)
    demands = np.array([max(1.0, float(getattr(p, 'annual_demand', 1000))) for p in part_routings], dtype=float)

    for p_idx, routing in enumerate(part_routings):
        seq = getattr(routing, 'sequence', [])
        for op in seq:
            m_type = getattr(op, 'machine_type', str(op))
            for m_idx, e in enumerate(entities):
                e_id = getattr(e, 'id', '')
                e_model = getattr(e, 'model', '') or ''
                e_cat = getattr(e, 'category', '') or ''
                if e_id == m_type or e_model == m_type or e_cat == m_type:
                    mat[m_idx, p_idx] = 1

    return mat, machine_names, part_names, demands
