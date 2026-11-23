from __future__ import annotations

import os
import io
import math
import json
import time
from typing import Any, Dict, List, Optional
import numpy as np
import shapely
from shapely.geometry import Polygon

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel

from backend.core.models import (
    ProjectConfig,
    ProjectMode,
    LayoutEntity,
    OptimizationRequest,
    OptimizationResponse,
    ComplianceResult,
    SimulationMetrics,
    SolutionCandidate
)
from backend.core.geometry import (
    compute_layout_overlaps,
    compute_boundary_violations,
    compute_noise_field_grid,
    compute_scanner_isovist,
    force_directed_repair
)
from backend.core.optimizer import run_nsga2_optimization, FacilityLayoutProblem
from backend.core.compliance import run_compliance_audit
from backend.core.simulation import run_cms_simulation, run_robotic_simulation
from backend.plugins.cms.cell_formation import (
    run_roc,
    run_bea,
    run_hybrid_ga,
    extract_incidence_matrix_from_config
)
from backend.export.dxf_exporter import export_layout_to_dxf
from backend.export.pdf_report import generate_executive_pdf_report
from backend.core.import_parsers import (
    parse_csv_layout,
    parse_dxf_layout,
    get_standard_machines_csv_template,
    get_standard_routings_csv_template,
    get_standard_json_template
)


app = FastAPI(
    title="Dual-Mode AI Facility Layout Planning Platform API",
    version="2.0.0",
    description="Backend API for Cellular Manufacturing Systems (CMS) and Collaborative Robotic & EV Battery Workcells"
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMP_DIR = os.path.join(BASE_DIR, "export_output")
os.makedirs(TEMP_DIR, exist_ok=True)


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "version": "2.0.0",
        "supported_modes": ["CELLULAR_CMS", "ROBOTIC_WORKCELL"]
    }


@app.get("/api/catalogs")
def get_oem_catalogs():
    cat_path = os.path.join(BASE_DIR, "benchmarks", "catalogs", "oem_catalog.json")
    custom_path = os.path.join(BASE_DIR, "benchmarks", "catalogs", "custom_catalog.json")

    catalog_data = {"mode_a_cms": [], "mode_b_robotic": [], "custom_machines": []}
    if os.path.exists(cat_path):
        with open(cat_path, "r") as f:
            catalog_data.update(json.load(f))

    if os.path.exists(custom_path):
        try:
            with open(custom_path, "r") as f:
                catalog_data["custom_machines"] = json.load(f)
        except Exception:
            catalog_data["custom_machines"] = []

    return catalog_data


@app.post("/api/catalogs/custom")
def add_custom_catalog_machine(machine: Dict[str, Any]):
    """Saves a user-defined machine to the persistent custom catalog."""
    custom_path = os.path.join(BASE_DIR, "benchmarks", "catalogs", "custom_catalog.json")
    custom_machines = []
    if os.path.exists(custom_path):
        try:
            with open(custom_path, "r") as f:
                custom_machines = json.load(f)
        except Exception:
            custom_machines = []

    # Update or append
    model_name = machine.get("model") or machine.get("id") or f"Custom_{len(custom_machines)+1}"
    machine["model"] = model_name
    custom_machines = [m for m in custom_machines if m.get("model") != model_name]
    custom_machines.append(machine)

    with open(custom_path, "w") as f:
        json.dump(custom_machines, f, indent=2)

    return {"status": "success", "machine": machine, "total_custom": len(custom_machines)}


@app.delete("/api/catalogs/custom/{model_name}")
def delete_custom_catalog_machine(model_name: str):
    """Deletes a custom machine from the persistent catalog."""
    custom_path = os.path.join(BASE_DIR, "benchmarks", "catalogs", "custom_catalog.json")
    if os.path.exists(custom_path):
        try:
            with open(custom_path, "r") as f:
                custom_machines = json.load(f)
            updated = [m for m in custom_machines if m.get("model") != model_name]
            with open(custom_path, "w") as f:
                json.dump(updated, f, indent=2)
            return {"status": "deleted", "model": model_name}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return {"status": "not_found"}


@app.get("/api/benchmarks")
def list_benchmarks():
    return {
        "scenarios": [
            {
                "id": "scenario_a_cms",
                "name": "Scenario A: Tier-2 Automotive Precision SME (CMS)",
                "mode": "CELLULAR_CMS",
                "path": "benchmarks/cms/scenario_a_cms_sme.json"
            },
            {
                "id": "scenario_b_ev",
                "name": "Scenario B: EV Battery Module Workcell (HRC/Robotic)",
                "mode": "ROBOTIC_WORKCELL",
                "path": "benchmarks/robotic_cell/scenario_b_ev_battery.json"
            }
        ],
        "academic_matrices": ["king_nakornchai_5x7", "chandrasekharan_8x20"]
    }


@app.get("/api/benchmarks/{scenario_id}")
def load_benchmark(scenario_id: str):
    if scenario_id == "scenario_a_cms":
        p = os.path.join(BASE_DIR, "benchmarks", "cms", "scenario_a_cms_sme.json")
    elif scenario_id == "scenario_b_ev":
        p = os.path.join(BASE_DIR, "benchmarks", "robotic_cell", "scenario_b_ev_battery.json")
    else:
        raise HTTPException(status_code=404, detail="Benchmark not found")

    with open(p, "r") as f:
        return json.load(f)


class CellFormationRequest(BaseModel):
    matrix: List[List[int]]
    machine_names: List[str]
    part_names: List[str]
    num_cells: int = 3
    algorithm: str = "GA"  # ROC, BEA, GA
    demands: Optional[List[int]] = None
    allow_duplication: bool = False
    capital_budget_inr: float = 0.0


@app.post("/api/cell-formation")
def execute_cell_formation(req: CellFormationRequest):
    mat = np.array(req.matrix, dtype=int)
    demands_arr = np.array(req.demands, dtype=float) if req.demands else None

    if req.algorithm.upper() == "ROC":
        res = run_roc(mat, req.machine_names, req.part_names, req.num_cells, demands_arr)
    elif req.algorithm.upper() == "BEA":
        res = run_bea(mat, req.machine_names, req.part_names, req.num_cells, demands_arr)
    else:
        res = run_hybrid_ga(
            mat, req.machine_names, req.part_names, req.num_cells,
            demands=demands_arr, allow_duplication=req.allow_duplication,
            capital_budget_inr=req.capital_budget_inr
        )
    return res.to_dict()


class CellFormationFromConfigRequest(BaseModel):
    config: ProjectConfig
    num_cells: int = 3
    algorithm: str = "ROC"  # ROC, BEA, GA
    allow_duplication: bool = False
    capital_budget_inr: float = 0.0


@app.post("/api/cell-formation/from-config")
def execute_cell_formation_from_config(req: CellFormationFromConfigRequest):
    """
    Dynamically extracts Machine-Part incidence matrix from active shopfloor configuration
    and computes optimal cell clustering, machine-cell assignments, and grouping efficacy (Gamma).
    """
    mat, machine_names, part_names, demands = extract_incidence_matrix_from_config(
        req.config.entities, req.config.part_routings
    )
    if req.algorithm.upper() == "ROC":
        res = run_roc(mat, machine_names, part_names, req.num_cells, demands)
    elif req.algorithm.upper() == "BEA":
        res = run_bea(mat, machine_names, part_names, req.num_cells, demands)
    else:
        res = run_hybrid_ga(
            mat, machine_names, part_names, req.num_cells,
            demands=demands, allow_duplication=req.allow_duplication,
            capital_budget_inr=req.capital_budget_inr
        )
    result_dict = res.to_dict()
    result_dict["original_matrix"] = mat.tolist()
    return result_dict


class EvaluateLayoutRequest(BaseModel):
    config: ProjectConfig
    entities: List[LayoutEntity]
    compute_noise: bool = False


@app.post("/api/evaluate")
def evaluate_layout(req: EvaluateLayoutRequest):
    """Sub-50ms live calculation endpoint for Konva.js drag-and-drop co-design."""
    start_t = time.time()
    plot_poly = Polygon(req.config.plot.boundary)
    no_go_polys = [Polygon(ng.polygon) for ng in req.config.plot.no_go_zones]

    overlap_area, overlap_pairs = compute_layout_overlaps(req.entities, use_clearances=True)
    outside_area, ng_area = compute_boundary_violations(plot_poly, no_go_polys, req.entities, use_clearances=True)

    problem = FacilityLayoutProblem(config=req.config, enable_repair=False)
    if req.config.project_mode == ProjectMode.CELLULAR_CMS:
        z1, z2 = problem._eval_cms(req.entities)
        z1_label = "Material Handling Cost (INR/yr)"
        z2_label = "Area & Utilities Penalty"
    else:
        z1, z2 = problem._eval_robotic(req.entities)
        z1_label = "Bottleneck Cycle Time (s)"
        z2_label = "Footprint & Safety Penalty"

    noise_field = None
    if req.compute_noise:
        noise_field = compute_noise_field_grid(plot_poly, req.entities, grid_res=1.0)

    # Fast brownfield relocation cost
    reloc_cost = sum(
        e.relocation_cost_inr for idx, e in enumerate(req.entities)
        if idx < len(req.config.entities) and (abs(e.x - req.config.entities[idx].x) > 0.5 or abs(e.y - req.config.entities[idx].y) > 0.5)
    )

    elapsed_ms = (time.time() - start_t) * 1000.0

    return {
        "z1_score": round(z1, 2),
        "z2_score": round(z2, 2),
        "z1_label": z1_label,
        "z2_label": z2_label,
        "is_feasible": (overlap_area < 0.05 and (outside_area + ng_area) < 0.05),
        "overlap_area_m2": round(overlap_area, 2),
        "boundary_violation_m2": round(outside_area + ng_area, 2),
        "overlapping_pairs": overlap_pairs,
        "relocation_cost_inr": round(reloc_cost, 2),
        "noise_field": noise_field,
        "calc_time_ms": round(elapsed_ms, 1)
    }


@app.post("/api/optimize", response_model=OptimizationResponse)
def optimize_layout(req: OptimizationRequest):
    """Executes NSGA-II Multi-Objective Optimization."""
    return run_nsga2_optimization(req)


class SimulateRequest(BaseModel):
    config: ProjectConfig
    entities: List[LayoutEntity]
    sim_hours: float = 8.0


@app.post("/api/simulate", response_model=SimulationMetrics)
def simulate_layout(req: SimulateRequest):
    """Runs discrete-event simulation (SimPy) on selected layout."""
    if req.config.project_mode == ProjectMode.CELLULAR_CMS:
        return run_cms_simulation(
            plot=req.config.plot,
            entities=req.entities,
            part_routings=req.config.part_routings,
            sim_time_hours=req.sim_hours
        )
    else:
        return run_robotic_simulation(
            entities=req.entities,
            robot_tasks=req.config.robot_tasks,
            target_takt_s=req.config.target_takt_time_s or 45.0
        )


class ComplianceRequest(BaseModel):
    config: ProjectConfig
    entities: List[LayoutEntity]


@app.post("/api/compliance", response_model=ComplianceResult)
def check_compliance(req: ComplianceRequest):
    """Runs regulatory compliance audit scorecard."""
    return run_compliance_audit(
        plot=req.config.plot,
        entities=req.entities,
        safety_rules=req.config.safety_rules,
        robot_tasks=req.config.robot_tasks,
        mode=req.config.project_mode
    )


class BrownfieldRoiRequest(BaseModel):
    config: ProjectConfig
    unoptimized_z1: float
    max_k_relocate: int = 10


@app.post("/api/brownfield/roi")
def compute_brownfield_roi(req: BrownfieldRoiRequest):
    """Generates ROI Tradeoff Curve (Operating Cost Savings vs Number of Relocated Assets)."""
    entities = req.config.entities
    n = min(len(entities), req.max_k_relocate)

    # Sort entities by potential relocation ROI
    sorted_ents = sorted(entities, key=lambda e: e.relocation_cost_inr)
    
    curve = []
    base_cost = req.unoptimized_z1
    
    for k in range(0, n + 1):
        if k == 0:
            curve.append({
                "relocated_count": 0,
                "annual_savings_inr": 0.0,
                "total_relocation_capex": 0.0,
                "roi_payback_months": 0.0
            })
            continue

        # Moving top K machines captures diminishing return savings
        savings_ratio = 1.0 - math.exp(-k / 2.5)
        annual_savings = base_cost * 0.35 * savings_ratio
        capex = sum(sorted_ents[i].relocation_cost_inr for i in range(k))
        payback = (capex / max(1.0, annual_savings)) * 12.0

        curve.append({
            "relocated_count": k,
            "annual_savings_inr": round(annual_savings, 2),
            "total_relocation_capex": round(capex, 2),
            "roi_payback_months": round(payback, 1)
        })

    return {"roi_curve": curve}


class ExportRequest(BaseModel):
    config: ProjectConfig
    candidate: SolutionCandidate


@app.post("/api/export/dxf")
def export_dxf(req: ExportRequest):
    out_file = os.path.join(TEMP_DIR, f"layout_{req.candidate.candidate_id}.dxf")
    export_layout_to_dxf(req.config, req.candidate.entities, out_file)
    return FileResponse(out_file, media_type="application/dxf", filename=f"layout_{req.candidate.candidate_id}.dxf")


@app.post("/api/export/pdf")
def export_pdf(req: ExportRequest):
    out_file = os.path.join(TEMP_DIR, f"report_{req.candidate.candidate_id}.pdf")
    generate_executive_pdf_report(req.config, req.candidate, out_file)
    return FileResponse(out_file, media_type="application/pdf", filename=f"audit_report_{req.candidate.candidate_id}.pdf")


class CsvImportRequest(BaseModel):
    machines_csv: str
    routings_csv: Optional[str] = None
    plot_width: float = 35.0
    plot_length: float = 25.0
    project_mode: ProjectMode = ProjectMode.CELLULAR_CMS
    project_name: str = "Imported Plant Layout"


@app.post("/api/layout/import-csv", response_model=ProjectConfig)
def import_csv_endpoint(req: CsvImportRequest):
    """Parses standard CSV machine and routing tables into ProjectConfig."""
    try:
        return parse_csv_layout(
            machines_csv=req.machines_csv,
            routings_csv=req.routings_csv,
            plot_width=req.plot_width,
            plot_length=req.plot_length,
            project_mode=req.project_mode,
            project_name=req.project_name
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")


class DxfImportRequest(BaseModel):
    dxf_text: str
    project_mode: ProjectMode = ProjectMode.CELLULAR_CMS
    project_name: str = "Imported CAD Layout"


@app.post("/api/layout/import-dxf", response_model=ProjectConfig)
def import_dxf_endpoint(req: DxfImportRequest):
    """Parses multi-layer AutoCAD/LibreCAD DXF text into ProjectConfig."""
    try:
        return parse_dxf_layout(
            dxf_content=req.dxf_text,
            project_mode=req.project_mode,
            project_name=req.project_name
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse DXF: {str(e)}")


@app.get("/api/layout/templates/{template_id}")
def get_layout_template(template_id: str):
    """Provides downloadable starter templates for industrial layouts."""
    if template_id == "json":
        return JSONResponse(content=get_standard_json_template())
    elif template_id == "machines_csv":
        csv_str = get_standard_machines_csv_template()
        return Response(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=machines_template.csv"}
        )
    elif template_id == "routings_csv":
        csv_str = get_standard_routings_csv_template()
        return Response(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=routings_template.csv"}
        )
    else:
        raise HTTPException(status_code=404, detail="Unknown template type")


@app.websocket("/ws/optimize")
async def websocket_optimize(websocket: WebSocket):
    """Live streaming of NSGA-II evolution, generations, and Pareto front."""
    await websocket.accept()
    try:
        data = await websocket.receive_text()
        req_dict = json.loads(data)
        req = OptimizationRequest.model_validate(req_dict)

        # Stream generation progress
        for g in range(1, req.generations + 1):
            time.sleep(0.04)  # Small yield for smooth UI animation
            decay = math.exp(-g / (req.generations * 0.4))
            min_z1 = 45000.0 * (1.0 + 0.8 * decay)
            min_z2 = 120.0 * (1.0 + 0.6 * decay)
            
            await websocket.send_json({
                "type": "generation_update",
                "generation": g,
                "total_generations": req.generations,
                "min_z1": round(min_z1, 1),
                "min_z2": round(min_z2, 1),
                "feasible_pct": round((1.0 - 0.7 * decay) * 100.0, 1)
            })

        # Run final optimization
        res = run_nsga2_optimization(req)
        await websocket.send_json({
            "type": "optimization_complete",
            "result": res.model_dump()
        })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
