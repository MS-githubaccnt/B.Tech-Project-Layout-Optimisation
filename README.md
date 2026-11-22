# Dual-Mode AI Facility Layout Planning & Optimization Platform

**Department:** Mechanical & Industrial Engineering  
**Supervisor:** Prof. Inderdeep Singh  
**Project Team:**  
- Samyak Jain (23119039) — Geometry Engine, Safety Auditing & CAD Exporter  
- Lakshya Yadav (23119017) — NSGA-II Optimizer, Mode B Kinematics & SimPy DES  
- Maheep Singh (23119018) — GNN Surrogate Layer, Mode A MPCF & Benchmark Data  
- Shourya Aggarwal (23119043) — Interactive React Vector Canvas, API & Reports  

---

## 1. Executive Summary

This platform delivers a domain-focused, polygon-based AI optimization, validation, and co-design system tailored to two high-value manufacturing layout archetypes:

1. **Mode A — Cellular Manufacturing System (CMS) Layout:**  
   Targets mid-volume, mid-variety precision machining SMEs. Jointly solves machine-part cell formation (MPCF) using Grouping Efficacy ($\Gamma$) and hierarchical spatial floor layout inside irregular halls with A* forklift aisles and rectilinear Steiner utilities.
2. **Mode B — Robotic & EV Battery Collaborative Workcell Layout:**  
   Targets automated and Human-Robot Collaborative (HRC) battery module assembly cells. Embeds annular reach kinematics, ISO 10218-2:2025 collaborative Speed and Separation Monitoring (SSM Annex L), anti-crushing clearance ($\ge 500\text{mm}$ per ISO 13854), and bottleneck cycle-time optimization directly into the spatial solver.

---

## 2. System Architecture

```text
facility-layout-ai/
├── backend/
│   ├── core/
│   │   ├── models.py            # Pydantic v2 unified schemas & LayoutEntity polymorphic base
│   │   ├── geometry.py          # Shapely 2.x STRtree, Minkowski aisles, isovists, noise grid, Force-Directed Repair
│   │   ├── routing.py           # NetworkX A* free-space pathfinding & Steiner utility trees
│   │   ├── optimizer.py         # pymoo NSGA-II multi-objective engine + Brownfield minimal disruption
│   │   ├── compliance.py        # Fire egress (≤30m), forklift swept-path, ISO 10218-2:2025 audit scorecard
│   │   └── simulation.py        # SimPy DES engine (CMS forklift queues & HRC SSM slowdown models)
│   ├── plugins/
│   │   ├── cms/
│   │   │   ├── cell_formation.py  # ROC, BEA, Hybrid GA Grouping Efficacy + machine duplication
│   │   │   ├── cell_templates.py  # U-shaped, Linear, Double-row composite cell builders
│   │   │   └── heuristics.py      # Macro-level CORELAP & ALDEP warm-start seeders
│   │   └── robotic_cell/
│   │       ├── kinematics.py      # Annular reach polygons, joint slewing & swept corridor collision
│   │       ├── safety_iso.py      # ISO 10218-2 SSM zones, ISO 13854 anti-crushing, pinch-point checks
│   │       └── thermal_zoning.py  # EV battery laser/quarantine clearance & scanner coverage
│   ├── ml/
│   │   ├── data_gen.py          # Parametric synthetic layout generator (Mode A & Mode B)
│   │   ├── graph_builder.py     # Heterogeneous spatial-flow PyG/PyTorch graph constructor (14 node features)
│   │   └── gnn_surrogate.py     # Multi-Head Edge-Conditioned GATv2 surrogate & SAEA online manager
│   ├── export/
│   │   ├── dxf_exporter.py      # Multi-layer ezdxf AutoCAD/LibreCAD export
│   │   └── pdf_report.py        # ReportLab executive engineering & compliance report generator
│   └── api/
│       └── main.py              # FastAPI REST endpoints + WebSocket streaming
├── frontend/                    # React 18 + TypeScript + Vite + Tailwind CSS + 2D Vector Canvas + 2.5D Isometric
├── benchmarks/                  # Academic literature matrices, OEM catalogs (Haas/ABB/UR), Scenarios A & B
└── tests/                       # Pytest test suite for geometry, optimization, simulation, exports, API
```

---

## 3. Quick Start & Execution

### 3.1 Prerequisites
- Python 3.12+ (CPython)
- Node.js v20+ & npm

### 3.2 Automated Startup
Run both the FastAPI backend and Vite React frontend with a single command:
```bash
./start.sh
```

- **Interactive Web UI:** [http://localhost:5173](http://localhost:5173)
- **FastAPI Interactive Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

### 3.3 Running Automated Tests
Run the comprehensive test suite verifying geometry, kinematics, compliance, simulation, optimization, surrogate, exports, and REST APIs:
```bash
PYTHONPATH=. .venv/bin/pytest -v
```

---

## 4. Key Functional Features

1. **Sub-50ms "Pin, Drag & Auto-Heal" Co-Design:**  
   Plant engineers can interactively drag, rotate (0°, 90°, 180°, 270°), or pin equipment. Clearance overlaps, material flow costs, and 2D acoustic noise propagate in real time.
2. **Force-Directed Local Repair Operator:**  
   Resolves overlap and boundary containment violations within 5–10 fast iterations before evaluation, eliminating the infeasible GA convergence stalling common in irregular halls.
3. **Multi-Objective NSGA-II Pareto Frontier:**  
   Simultaneously optimizes primary handling cost / cycle time ($Z_1$) and spatial compactness / safety risk ($Z_2$). Users can click any frontier point to visualize the layout on canvas.
4. **Automated Regulatory Compliance Scorecard:**  
   Audits statutory Fire Egress walking paths ($\le 30\text{m}$ NFPA / Indian Factories Act), minimum forklift aisle widths ($\ge 3.0\text{m}$), and ISO 10218-2:2025 Speed and Separation Monitoring (SSM).
5. **SimPy Discrete-Event Simulation:**  
   Transforms static layout blueprints into dynamic operational KPIs: shift throughput, dock-to-dock batch lead times, WIP inventory, and forklift queue congestion.
6. **CAD & PDF Report Export:**  
   One-click download of multi-layer AutoCAD `.dxf` files (`BOUNDARY`, `OBSTACLES`, `MACHINES`, `CLEARANCES`, `REACH_ZONES`, `AISLES`, `UTILITIES`) and executive PDF audit reports.
