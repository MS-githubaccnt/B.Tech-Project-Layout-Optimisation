# Technical Design Document: Dual-Mode AI Facility Layout Optimization Platform

**Project Title:** AI-Driven Intelligent Facility Layout Planning and Optimization Platform  
**Supported Modes:** Mode A — Cellular Manufacturing Systems (CMS) | Mode B — Robotic & EV Battery Collaborative Workcells  
**Department:** Mechanical & Industrial Engineering  
**Team:** Samyak Jain (23119039), Lakshya Yadav (23119017), Maheep Singh (23119018), Shourya Aggarwal (23119043)  
**Supervisor:** Prof. Inderdeep Singh  
**Document Version:** 2.0 (November 2026)

---

## 1. Executive Summary & Architectural Strategy

Traditional academic facility layout problem (FLP) solvers treat shop floors as generic grids of featureless rectangles, ignoring physical clearances, aisle kinematics, utility infrastructure, and industry safety standards. Conversely, commercial industrial layout and simulation suites (AutoCAD Plant 3D, FlexSim, Visual Components) carry high licensing costs and steep simulation expertise requirements that place them out of reach for small and medium enterprises (SMEs).

This platform bridges that gap by delivering a domain-focused, polygon-based AI optimization and validation system tailored to **two high-value manufacturing layout archetypes**:

1. **Mode A — Cellular Manufacturing System (CMS) Layout:** Targets mid-volume, mid-variety precision machining SMEs (e.g., Tier-1/Tier-2 automotive component suppliers). Jointly solves machine-part cell formation and hierarchical spatial floor layout inside irregular industrial halls.
2. **Mode B — Robotic & EV Battery Collaborative Workcell Layout:** Targets automated and Human-Robot Collaborative (HRC) assembly cells (e.g., EV battery module/pack assembly or robotic CNC machine tending). Embeds annular reach kinematics, ISO 10218-2:2025 collaborative safety zones, and cycle-time optimization directly into the spatial solver.

To deliver both domains cleanly within a 5-month engineering window without duplicating codebase effort, the system is engineered around a **Shared Spatial-Optimization Core** paired with two modular **Domain Plugins**.

---

## 2. High-Level System Architecture

```text
+-----------------------------------------------------------------------------+
|                    INTERACTIVE WEB PLATFORM (React + Konva)                 |
|  Plot Editor | Pin/Drag Co-Design | Pareto Explorer | Heatmaps | 2.5D View  |
+--------------------------------------+--------------------------------------+
                                       | REST / WebSockets (FastAPI + Celery)
+--------------------------------------v--------------------------------------+
|                          UNIFIED ORCHESTRATION API                          |
|  Pydantic v2 Validator | Async Job Queue | DXF (ezdxf) & PDF (WeasyPrint)   |
+--------------------+-------------------------------------+------------------+
                     |                                     |
         +-----------v-----------+             +-----------v-----------+
         |   MODE A PLUGIN: CMS  |             | MODE B PLUGIN: ROBOT  |
         | - Cell Formation (GE) |             | - Reach Annuli & IK   |
         | - Intra-Cell Topology |             | - ISO 10218-2:2025    |
         | - Forklift vs. Manual |             | - SSM / PFL Safety    |
         | - CORELAP/ALDEP Seed  |             | - EV Thermal Zoning   |
         +-----------+-----------+             +-----------+-----------+
                     |                                     |
+--------------------v-------------------------------------v------------------+
|                         SHARED COMPUTATIONAL CORE                           |
|  1. Geometry Engine     : Shapely 2.x (STRtree, Minkowski, Isovists, Noise) |
|  2. Routing & Utilities : NetworkX (A* Free-Space Paths, Steiner Utilities) |
|  3. Metaheuristic Core  : pymoo NSGA-II + Force-Directed Repair Operator    |
|  4. ML / GNN Layer      : PyTorch Geometric (GATv2 Surrogate & Graph Init)  |
|  5. Simulation Engine   : SimPy Discrete-Event Simulation (DES)             |
|  6. Compliance Auditor  : Fire Egress, Forklift Swept-Path, ISO Safety      |
+-----------------------------------------------------------------------------+
```

### 2.1 Polymorphic Spatial Abstraction (`LayoutEntity`)
Every physical asset placed on a floorplan—whether a CNC Vertical Machining Center, a 6-axis articulated robot, a human kitting desk, or a battery welding station—inherits from a single geometric base schema:

* `base_footprint` (`shapely.Polygon`): Exact physical structural base ($L \times W$ rectangle, arbitrary polygon, or circular robot pedestal of radius $r$).
* `clearance_envelope` (`shapely.Polygon`): Asymmetric buffer capturing operator standing area (front), maintenance access (rear/sides), and door-swing/chip-conveyor clearance.
* `interaction_zones` (`dict[str, shapely.Polygon]`): Domain-specific active geometries (e.g., cell internal walkways in Mode A; annular reach envelopes, dexterous sweet-spot rings, and ISO safety scanner zones in Mode B).
* `io_ports` (`list[Port]`): Local coordinates $(p_x, p_y, \text{port\_type})$ transformed via rigid-body affine transformation $T(x_i, y_i, \theta_i)$ so material distances and robot targets reference exact loading/unloading points rather than geometric centroids.
* `physical_attributes`: Equipment mass ($\text{kg}$), electrical load ($\text{kW}$), utility requirements (compressed air, exhaust, coolant, inert gas), acoustic sound power level $L_w$ ($\text{dB}$), hazard/sensitivity tags, `is_pinned` boolean, and `relocation_cost` (for brownfield re-layout).

---

## 3. Mode A Deep-Dive: Cellular Manufacturing System (CMS) Layout

**Target Industrial Context:** Tier-1/Tier-2 automotive precision component SMEs machining gear shafts, brake discs, transmission housings, and EV motor casings across 12–35 machines inside irregular leased or owned industrial sheds.

### 3.1 Stage 1: Machine-Part Cell Formation (MPCF)
Before solving 2D spatial coordinates, Stage 1 partitions $M$ machine types and $P$ part types into $K$ manufacturing cells using the machine-part routing incidence matrix $A = [a_{mp}]$ and annual part demand volumes $D_p$.

* **Decision Variables:**
  * Binary machine-to-cell assignment $x_{mk} \in \{0, 1\}$.
  * Binary part-to-family assignment $y_{pk} \in \{0, 1\}$.
  * Optional integer machine duplication vector $n_m \in \{1, \dots, n_m^{\max}\}$ constrained by capital acquisition budget $\sum_m (n_m - 1) C_m^{\text{buy}} \le B_{\text{cap}}$, allowing low-cost bottleneck machines (e.g., drill presses or deburring benches) to be duplicated across cells to eliminate inter-cell transfers.
* **Primary Objective — Maximize Grouping Efficacy ($\Gamma$):**
  $$\max \Gamma = \frac{e - e_0}{e + e_v}$$
  where $e = \sum_{m=1}^{M} \sum_{p=1}^{P} a_{mp}$ is total operations, $e_0$ is the number of exceptional elements (inter-cell transfers outside diagonal cell blocks), and $e_v$ is the number of intra-cell voids (unused machine-part slots inside cell blocks). Grouping Efficacy is strictly superior to legacy Grouping Efficiency because it resists degenerate single-cell or high-void solutions.
* **Demand-Weighted Industrial Extension:** In practical SME mode, weight each exceptional element by actual annual batch trips $T_p = \lceil D_p / Q_p \rceil$ (where $Q_p$ is transfer batch size) and enforce non-singleton cells ($\sum_m x_{mk} \ge 2$).
* **Solver Suite:**
  * *Deterministic Baselines:* Rank Order Clustering (ROC) and Bond Energy Algorithm (BEA) for instant comparison benchmarks.
  * *Core Optimizer:* Hybrid Genetic Algorithm with local 1-swap row/column refinement (following the Gonçalves & Resende GA + local search paradigm).

### 3.2 Stage 2: Hierarchical Spatial Floor Layout (Intra-Cell + Inter-Cell)
Optimizing unconstrained $(x, y, \theta)$ coordinates for 25+ machines in a flat GA converges slowly and yields fragmented, unnavigable shop floors. Mode A uses a **two-level hierarchical spatial encoding**:

1. **Intra-Cell Layout Templates:** Within each formed cell $k \in \{1, \dots, K\}$, machines are ordered along the dominant forward part routing sequence (minimizing backtracking) and compiled into one of three parameterized industrial cell topologies:
   * **U-Shaped Cell:** Minimizes walking loop for 1–2 multi-machine operators and places Cell Entry and Cell Exit adjacent to the main forklift aisle.
   * **Linear (I-Shaped) Cell:** Optimal for long bar-feed/transfer lines or narrow shop strips along exterior walls.
   * **Double-Row (Back-to-Back) Cell:** High machine density sharing a central operator walkway and a unified rear utility spine.
   Each cell resolves into a composite `shapely.Polygon` $C_k$ with a verified internal operator walkway and external Pickup/Dropoff (P/D) ports $(p_k^{\text{in}}, p_k^{\text{out}})$.

2. **Inter-Cell Floor Placement (Multi-Objective NSGA-II):**
   * **Chromosome Representation:** For each cell $k$:
     $$\mathbf{g}_k = \left(x_k, y_k, \theta_k \in \{0^\circ, 90^\circ, 180^\circ, 270^\circ\}, \tau_k \in \{\text{U}, \text{Linear}, \text{Double}\}, \pi_k\right)$$
     where $\pi_k$ encodes the intra-cell machine permutation.
   * **Warm-Start Seeding (Retaining MTE Heuristics):** Apply **CORELAP** (Total Closeness Rating placement) and **ALDEP** (sweep-width strip placement) at the *macro cell level* to seed 20% of the initial NSGA-II population, combining classic Systematic Layout Planning (SLP) intuition with irregular polygon flexibility.
   * **Objective 1 — Total Material Handling Cost ($Z_1$):** Distinguishes low-cost intra-cell manual/chute handling ($c_{\text{intra}}$) from high-cost inter-cell and dock-to-cell forklift batch transport ($c_{\text{inter}}$, where $c_{\text{intra}} \ll c_{\text{inter}}$):
     $$Z_1 = \sum_{k=1}^{K} \sum_{i,j \in k} f_{ij}^{\text{intra}} d_{ij}^{\text{walk}} c_{\text{intra}} + \sum_{k_1 \neq k_2} f_{k_1 k_2}^{\text{inter}} d_{k_1 k_2}^{\text{aisle}} c_{\text{inter}} + \sum_{k=1}^{K} \left(f_{\text{in}, k} d_{\text{in}, k}^{\text{aisle}} + f_{k, \text{out}} d_{k, \text{out}}^{\text{aisle}}\right) c_{\text{inter}}$$
   * **Objective 2 — Compactness, SLP Adjacency, Hazard Separation & Utility Cost ($Z_2$):**
     $$Z_2 = w_a \cdot \frac{\text{Area}\left(\text{ConvexHull}\left(\bigcup_{k=1}^{K} C_k\right)\right)}{\text{Area}(P_{\text{plot}})} - w_{\text{rel}} \sum_{i<j} r_{ij} \cdot \text{Adj}(i,j) + w_{\text{haz}} \sum_{(i,j) \in \mathcal{H}} \max(0, d_{ij}^{\text{safe}} - d_{ij}) + w_{\text{util}} \cdot L_{\text{Steiner}}$$
     where $r_{ij}$ maps Muther's SLP closeness codes (`A` $= 4$, `E` $= 3$, `I` $= 2$, `O` $= 1$, `U` $= 0$, `X` $= -5$), $\mathcal{H}$ denotes incompatible pairs (e.g., cylindrical grinder dust/vibration vs. CMM precision metrology room), and $L_{\text{Steiner}}$ is total overhead utility routing length.
   * **Hard Feasibility Constraints:** Zero clearance overlap between cells/machines, 100% containment inside $P_{\text{plot}}$, zero intersection with columns/no-go zones, and a connected obstacle-free forklift aisle (minimum width $W_{\text{aisle}}$, typically $3.0\text{ m}$) linking Receiving Dock, all Cell I/O ports, and Shipping Dock.

---

## 4. Mode B Deep-Dive: Robotic & EV Battery Collaborative Workcell

**Target Industrial Context:** Automated and Human-Robot Collaborative (HRC) EV battery module/pack assembly workcells (cell unloading, OCV/ACIR testing & sorting, module stacking, busbar laser welding, thermal interface material dispensing, BMS fastening, and vision end-of-line inspection) as well as robotic CNC machine-tending cells.

### 4.1 Kinematic & Workspace Modeling in Shapely
Robotic cells are governed by annular reach physics and joint kinematics rather than simple aisle adjacency:

* **Annular Reach Envelope:** For an articulated robot $r$ placed at $(x_r, y_r, \theta_r)$ with inner dead-zone radius $R_r^{\min}$ and payload-derated maximum horizontal reach $R_r^{\max}$:
  $$\mathcal{W}_r = \text{Buffer}(p_r, R_r^{\max}) \setminus \text{Buffer}(p_r, R_r^{\min})$$
  * *Angular Axis-1 Limits:* If base rotation is restricted (e.g., $\pm 170^\circ$ due to cable dress packs), intersect $\mathcal{W}_r$ with a Shapely angular sector polygon.
  * *Linear 7th-Axis Rail:* For track-mounted robots on a rail segment $\overline{AB}$, compute the swept reach stadium $\mathcal{W}_r^{\text{rail}} = \text{Buffer}(\overline{AB}, R_r^{\max}) \setminus \text{Buffer}(\overline{AB}, R_r^{\min})$.
* **Dexterous Sweet-Spot Zone:** Near $R_r^{\max}$ (outer 10% reach) or $R_r^{\min}$, 6-axis manipulators lose manipulability and encounter wrist/elbow singularities. Define an optimal annulus:
  $$\mathcal{W}_r^{\text{opt}} = \text{Buffer}(p_r, 0.85 R_r^{\max}) \setminus \text{Buffer}(p_r, 1.15 R_r^{\min})$$
  Reward placing pick, place, and weld targets strictly inside $\mathcal{W}_r^{\text{opt}}$.
* **Hard Reachability & Collision Sweeps:** Every assigned fixture target $q_{r,t}$ must satisfy $q_{r,t} \in \mathcal{W}_r$, and the swept arm transfer corridor connecting sequential targets $(q_a, q_b)$ must not intersect structural columns, safety fencing, or non-assigned tall equipment.

### 4.2 Embedded Safety Engineering: ISO 10218-2:2025 & ISO 13854/13855
ISO 10218-2:2025 (superseding ISO 10218-2:2011 and directly integrating ISO/TS 15066 collaborative specifications into Clause 5.14 and Normative Annexes L and M) provides deterministic mathematical rules embedded directly into the spatial evaluator:

* **Speed and Separation Monitoring (SSM — Normative Annex L):** Whenever human operators work in proximity to active robots (e.g., manual BMS wiring or kitting adjacent to a stacking robot), maintain the minimum protective separation distance $S_p$:
  $$S_p(t_0) = S_h + S_r + S_s + C + Z_d + Z_r$$
  where:
  * $S_h = v_h \cdot (T_r + T_s)$ is human approach distance during sensing reaction time $T_r$ and robot stopping time $T_s$ ($v_h = 1.6\text{ m/s}$ for body walking, $2.0\text{ m/s}$ for arm reach-in per EN ISO 13855).
  * $S_r = v_r \cdot T_r$ is robot travel distance during reaction time $T_r$.
  * $S_s$ is robot braking distance from operating velocity $v_r$ to full stop.
  * $C$ is intrusion distance before the safety laser scanner or light curtain triggers.
  * $Z_d + Z_r$ are sensor and robot position measurement uncertainties.
  * **Spatial Enforcement:** Generate two concentric Shapely safety polygons around each collaborative robot: a **Red Protective Stop Zone** ($R_{\text{stop}} = S_p$ at reduced speed $\le 250\text{ mm/s}$) and a **Yellow Speed-Reduction Zone** ($R_{\text{warn}} = S_p$ at full speed). If a human station intersects the Yellow zone, the cycle-time evaluator automatically applies a speed-derating multiplier $\gamma_{\text{SSM}} > 1$.
* **Anti-Crushing & Clamping Clearances (ISO 13854 / Annex M PFL):**
  * Enforce a mandatory $\ge 500\text{ mm}$ whole-body clearance between the outer swept envelope of any moving robot arm/workpiece and rigid fixed structures (walls, safety fences, control cabinets) wherever human entry is possible.
  * Detect and penalize **quasi-static clamping pinch points** between cobot end-effectors and rigid fixture tables (where permissible Power and Force Limiting contact forces drop by roughly 50% compared to transient free-space contact).
* **EV Battery-Specific Thermal & Optical Zoning:**
  * Isolate **Class-4 Busbar Laser Welding** stations (requiring light-tight interlocked enclosures) and **Thermal Runaway Quarantine / EOL Charging Bays** from manual assembly stations with mandatory thermal buffer clearances and unobstructed emergency egress paths.

### 4.3 Mode B Multi-Objective Optimization Formulation

* **Chromosome Representation:**
  * Robot base poses $(x_r, y_r, \theta_r)$ (plus rail position $s_r$ if rail-mounted).
  * Peripheral station/fixture/conveyor poses $(x_f, y_f, \theta_f)$ (cell feeders, OCV/ACIR testers, weld jigs, human kitting desks).
  * Safety perimeter polygon offsets and laser-scanner mounting poses $(x_{\text{scan}}, y_{\text{scan}}, \phi_{\text{scan}})$ optimized via Shapely raycasting to eliminate blind spots.
* **Objective 1 — Minimize Bottleneck Cycle Time ($Z_1$):**
  For each robot $r$ executing cyclic task graph $\mathcal{T}_r = (q_1 \to q_2 \to \dots \to q_m \to q_1)$:
  $$T_{\text{cycle}}(r) = \sum_{e=(a,b) \in \mathcal{T}_r} \left(\hat{t}_{\text{move}}(r, q_a, q_b) \cdot \gamma_{\text{SSM}}(r, e) + t_{\text{process}}(b)\right)$$
  During fast search iterations, $\hat{t}_{\text{move}}$ is estimated via dominant-axis joint slewing $\max_j \frac{|\Delta \theta_j|}{\omega_j^{\max}} + t_{\text{accel}}$; during surrogate-assisted refinement and final verification, it is evaluated using the GNN/MLP Inverse-Kinematics Surrogate and exact 6-DOF IK (`ikpy` / `robotics-toolbox-python`). Minimize $\max_r T_{\text{cycle}}(r)$ with a steep penalty if bottleneck cycle time exceeds target **Takt Time** $C_T$.
* **Objective 2 — Minimize Cell Footprint, Guarding Cost & Safety Risk ($Z_2$):**
  $$Z_2 = w_1 \cdot \text{Area}(\text{GuardPolygon}) + w_2 \cdot \text{Perimeter}(\text{GuardPolygon}) \cdot c_{\text{fence}} + w_3 \cdot \text{PinchPointScore} + w_4 \cdot \text{SingularityPenalty}$$

---

## 5. Shared Computational Core: Implementation Blueprint

### 5.1 High-Performance Geometry Engine (`Shapely 2.x` + `NetworkX`)
Naive pairwise polygon intersection checks scale as $O(N^2)$ and throttle metaheuristic generations. The core geometry engine uses four acceleration techniques:

1. **Spatial Indexing & Prepared Geometries:** Build a `shapely.STRtree` R-tree index for every candidate layout and compile static plot/obstacle boundaries with `shapely.prepare(geom)`, reducing collision query latency by 5x–15x.
2. **Vectorized NumPy Geometry Operations:** Leverage Shapely 2.x array operations (`shapely.intersects`, `shapely.area`, `shapely.distance`) across batches of machine polygons.
3. **Minkowski Erosion & A* Obstacle-Aware Routing (`NetworkX`):**
   * Compute free space: $F = P_{\text{plot}} \setminus \left(\bigcup P_{\text{nogo}} \cup \bigcup P_{\text{entity}}^{\text{body}}\right)$.
   * Erode $F$ by half the transporter/operator width ($W_{\text{veh}}/2$, e.g., $1.5\text{ m}$ for a counterbalance forklift or $0.45\text{ m}$ for an operator):
     $$F_{\text{nav}} = F.\text{buffer}\left(-\frac{W_{\text{veh}}}{2}, \text{join\_style}=\text{'mitre'}\right)$$
     Any disconnected polygon component in $F_{\text{nav}}$ immediately flags an unreachable P/D port or blocked aisle.
   * Construct a lightweight orthogonal grid graph ($0.5\text{ m}$ resolution) or Reduced Visibility Graph over $F_{\text{nav}}$ and evaluate exact shortest-path distances via `networkx.astar_path_length`.
4. **Geometric Sightlines (Isovists):** Cast $N = 180$ `LineString` rays from safety laser scanners (Mode B) or supervisor/quality desks (Mode A) against obstacle polygons to quantify shadow blind-spot area in under $5\text{ ms}$.

### 5.2 Hybrid Metaheuristic Engine (`pymoo` NSGA-II + Force-Directed Repair)
Built on **`pymoo`** using custom mixed-variable crossover/mutation operators and an explicit **Feasibility Repair Operator**:

* **Why Pure Penalty GAs Stall on Irregular Plots:** Inside tight L-shaped or pillar-heavy halls, over 90% of randomly mutated offspring violate boundary or overlap constraints.
* **Force-Directed Local Repair Operator:** Executed on offspring prior to fitness evaluation (5–10 fast iterations):
  1. For each overlapping entity pair $(i, j)$, compute the Minimum Translation Vector (MTV) along the centroid axis scaled by overlap penetration and push non-pinned entities apart.
  2. For any entity extending outside $P_{\text{plot}}$ or intersecting a no-go column, project it inward along the nearest boundary normal via `shapely.ops.nearest_points`.
  3. Residual micro-violations receive a dynamic generation-scaled penalty:
     $$\lambda(g) = \lambda_0 \cdot \left(1 + \frac{g}{G_{\max}}\right)^2$$

### 5.3 Pragmatic Machine Learning & GNN Layer (`PyTorch Geometric`)
Graph Neural Networks are integrated where they solve genuine computational bottlenecks rather than attempting unconstrained coordinate generation:

#### Role 1: Surrogate-Assisted Evaluation (SAEA) via Heterogeneous `GATv2`
* **Problem Solved:** Running exact obstacle-aware A* routing + congestion estimation (Mode A) or 6-DOF collision-free IK sweeps (Mode B) across 20,000 GA evaluations requires 15–45 minutes. A trained `PyG` GNN evaluates a batch of 128 candidate layouts in $< 20\text{ ms}$.
* **Unified Spatial-Flow Graph Representation $G = (V, E_{\text{flow}}, E_{\text{spatial}})$:**
  * *Node Features ($\mathbf{h}_i \in \mathbb{R}^{14}$):* Normalized coordinates $(x_i/W, y_i/H)$, normalized dimensions $(L_i/W, W_i/H)$, $(\sin\theta_i, \cos\theta_i)$, entity-category embedding, total inflow/outflow volume (or cyclic task count), reach radius $R_{\max}$ ($0$ for non-robots), hazard score, clearance ratio, and distance to nearest wall/obstacle.
  * *Flow / Task Edges ($E_{\text{flow}}$):* Material volume $f_{ij}$ (Mode A) or robot pick-to-place transition rate (Mode B), unit cost, Euclidean & Manhattan P/D distance, and direct line-of-sight obstacle-crossing indicator.
  * *Spatial Proximity Edges ($E_{\text{spatial}}$):* $k$-nearest geometric neighbors ($k = 4$), signed clearance gap, overlap area, and safety-zone intersection ratio.
* **Model Architecture (`PyTorch Geometric`):**
  1. Type-specific linear encoders $\to$ 3 layers of **`GATv2Conv`** (edge-conditioned graph attention, hidden dim $= 64$, 4 heads, residual skip connections, `LayerNorm`).
  2. Global `MeanPool || MaxPool` concatenated with global plot context features (area fill ratio, plot aspect ratio, obstacle density, aisle width).
  3. Multi-head MLP regressor predicting:
     * *Mode A Heads:* Exact A* obstacle-aware material handling cost $\hat{Z}_1^{\text{A*}}$ and predicted forklift wait delay $\hat{T}_{\text{wait}}$.
     * *Mode B Heads:* Collision-free IK bottleneck cycle time $\hat{T}_{\text{cycle}}$ and SSM speed-derating penalty $\hat{\gamma}_{\text{SSM}}$.
* **Synthetic Training Data Pipeline (Self-Contained):**
  * Generate **6,000–10,000 parametric layouts per mode** across varied rectangular, L-shaped, U-shaped, and pillar-obstructed plots.
  * Label offline using the exact slow evaluators (A* + `SimPy` for Mode A; `ikpy` 6-DOF IK + swept collision check for Mode B).
  * Train using composite **Huber Loss + Pairwise Margin Ranking Loss** (`MarginRankingLoss`), because NSGA-II tournament selection depends primarily on preserving exact relative candidate rankings.
* **Surrogate Management Strategy:** Every generation, score all offspring with the GNN surrogate, promote the **top 20% elite + 5% random diverse offspring** to exact Shapely/A*/IK evaluation, fine-tune the surrogate buffer periodically, and verify 100% of the final Pareto front using exact physics.

#### Role 2: GNN Graph Embedding Warm-Start
Feed the relational workflow graph (machine-part routing in Mode A; robot-fixture task graph in Mode B) into a lightweight Graph Autoencoder / Spectral-GNN to produce 2D force-clustered latent embeddings $(u_i, v_i)$, then project them into $P_{\text{plot}}$ as an additional high-quality initial population seed alongside CORELAP/ALDEP.

### 5.4 Discrete-Event Validation Engine (`SimPy`)
Run automated **`SimPy`** discrete-event simulations on the **top 3–5 Pareto-optimal layouts** to convert static spatial geometry into dynamic operational KPIs:

* **Mode A (CMS Validation):** Simulates part batch arrivals, machine setup/cycle times, finite operator pools inside each U-cell, and a shared fleet of $N_{\text{fork}}$ forklifts traveling along exact A* aisle lengths ($1.5\text{ m/s}$ + load/unload time). Reports **Average Flow Time (Lead Time), Shift Throughput, WIP Inventory, Machine Utilization (%), and Forklift Queue Wait Time (aisle congestion)**.
* **Mode B (Robotic Workcell Validation):** Simulates cyclic robot motions synchronized with conveyor pallet arrivals and stochastic human collaborative task times (log-normal distribution). Whenever a human enters a shared fixture's Yellow/Red SSM zone, `SimPy` dynamically reduces robot segment velocity or triggers a monitored stop per ISO 10218-2:2025. Reports **Effective Cycle Time vs. Takt Time, Robot Active vs. Safety-Stopped Time (%), Human Idle/Wait Time, and Hourly Module Output**.

---

## 6. Advanced Engineering Modules (Beyond MTE Baseline)

Four specialized engineering modules elevate the platform from a textbook optimization prototype into a practical industrial decision-support tool:

### 6.1 Brownfield "Minimal-Disruption" Re-Layout Optimizer
Most real factories already operate on an existing floor and cannot relocate bolted heavy machinery without high downtime.
* **Mechanism:** Users load an existing layout and tag each entity with a `relocation_cost` (e.g., INR 20,000 for an inspection bench vs. INR 4,00,000 for a 6-ton CNC press requiring foundation grouting) and an optional `is_pinned` lock.
* **Formulation:** Introduces a relocation objective (or budget $\epsilon$-constraint):
  $$Z_{\text{move}} = \sum_{i} c_i^{\text{move}} \cdot \mathbb{I}\left(\|p_i - p_i^{\text{orig}}\|_2 > \epsilon\right)$$
* **Output:** Generates an **ROI Tradeoff Curve** plotting *Annual Operating Cost Savings vs. Number of Relocated Assets ($K = 1, 2, \dots, N$)* so plant managers can identify the highest-ROI minimal disruption (e.g., moving 3 machines captures 70% of full greenfield savings).

### 6.2 Utility & Infrastructure Co-Optimization (Steiner-Tree Routing)
Pure material-flow optimization often scatters high-power or high-exhaust assets across opposite corners of a plant, inflating installation CAPEX.
* **Mechanism:** Users anchor wall utility drops (415V 3-phase busbar panel, compressed air manifold, fume extraction header, laser chiller).
* **Algorithm:** Computes an approximate **Rectilinear Steiner Tree** (`networkx.algorithms.approximation.steiner_tree`) over the overhead grid linking all entities requiring each utility type.
* **Output:** Incorporates total utility cabling/piping cost into $Z_2$ and exports color-coded utility runs as toggleable CAD layers (`UTIL_POWER`, `UTIL_AIR`, `UTIL_EXHAUST`).

### 6.3 Continuous 2D Environmental & Safety Field Heatmaps
* **Acoustic Noise Propagation Field (Mode A):** Discretizes the plot into a $0.5\text{ m} \times 0.5\text{ m}$ grid. For every noise-emitting machine $i$ with sound power level $L_{w,i}$ ($\text{dB}$), computes combined sound pressure at grid cell $g$:
  $$L_p(g) = 10 \log_{10} \left(\sum_{i} 10^{\left(L_{w,i} - 20\log_{10}(r_{ig}) - 11\right)/10}\right)$$
  Penalizes placing sensitive zones (CMM metrology room, supervisor desk, manual inspection) where $L_p(g) > 85\text{ dB(A)}$ (or stricter $70\text{ dB(A)}$ lab threshold).
* **Safety, Reach & Blind-Spot Overlays (Mode B):** Renders translucent layers showing overlapping robot reach annuli, dexterous sweet spots, ISO 10218-2 Red/Yellow SSM rings, and raycasted laser-scanner shadow blind spots.

### 6.4 Automated Regulatory Compliance Auditor (Pass/Fail Scorecard)
A deterministic post-optimization verification suite embedded directly into the UI and PDF engineering report:
* **Fire Egress Audit (Both Modes):** Evaluates obstacle-aware A* walking distance from every workstation/operator position to the nearest marked Emergency Exit, flagging any path exceeding statutory limits (e.g., $30\text{ m}$ under Indian Factories Act / NFPA guidelines).
* **Forklift Swept-Path Verification (Mode A):** Validates turning-radius clearance at all $90^\circ$ aisle junctions using Shapely Minkowski buffering.
* **ISO 10218-2:2025 & ISO 13854 Audit (Mode B):** Automatically verifies (1) $\ge 500\text{ mm}$ anti-crushing clearance around swept robot envelopes, (2) 100% fixture reachability within derated reach annuli, (3) E-Stop accessibility along perimeter guarding, and (4) SSM protective separation $S_p$ compliance.

### 6.5 Human-in-the-Loop "Pin, Drag & Auto-Heal" Co-Design
Real plant engineers possess tacit site knowledge (floor slopes, overhead crane limits, monsoon leakage zones) that cannot always be encoded upfront.
* **Workflow:** Inside the interactive Konva.js canvas, engineers can click to **pin/lock** specific assets, draw custom temporary no-go zones, or **drag/rotate** any machine manually while watching spaghetti flow lines, reach rings, overlap highlights, and exact cost deltas recalculate in under $50\text{ ms}$—then click **"Re-Optimize Around Pinned Entities"** to let NSGA-II heal overlaps and re-balance unpinned equipment.

---

## 7. Interactive Web Platform & CAD Export Stack

| Layer | Technology Stack | Engineering Responsibility |
| :--- | :--- | :--- |
| **Frontend UI & 2D CAD Canvas** | **React (Vite) + TypeScript + `Konva.js` (`react-konva`)** | 60 FPS pan/zoom vector canvas, polygon plot & obstacle editor, draggable/rotatable machines, live reach-ring & heatmap overlays, interactive Plotly Pareto scatter explorer. |
| **2.5D Extruded Preview (Optional)** | **`Three.js` (`@react-three/fiber`)** | Extrudes 2D machine footprints by equipment height $H_i$ and renders translucent robot reach hemispheres and perimeter safety fencing for executive reviews. |
| **Backend API & Live Streaming** | **Python `FastAPI` + `Pydantic v2` + WebSockets** | Schema validation, sub-50ms drag-and-drop geometry recalculation endpoint, real-time streaming of NSGA-II convergence curves and generation snapshots. |
| **Async Task Processing** | **`Celery` + `Redis`** (or `ProcessPoolExecutor` locally) | Non-blocking execution of multi-generation NSGA-II runs, PyTorch Geometric batch inference, and `SimPy` validation rollouts. |
| **CAD & Engineering Report Export** | **`ezdxf` + `WeasyPrint` / `ReportLab`** | Multi-layer AutoCAD/LibreCAD `.dxf` (`BOUNDARY`, `OBSTACLES`, `MACHINES`, `CLEARANCES`, `REACH_ZONES`, `SAFETY_SSM`, `AISLES`, `UTILITIES`, `FLOW_ARROWS`) and structured PDF Engineering Audit Report. |

---

## 8. Data Strategy, Unified Schemas & Validation Protocol

### 8.1 Pre-Populated Real OEM Equipment Catalog
Embedding verified physical specifications from public manufacturer datasheets eliminates manual data-entry friction and ensures physical defensibility during evaluation:

* **Mode A — Sample Automotive Component SME Catalog:**
  * **Haas VF-2 (VMC):** Base $2.57 \times 2.24\text{ m}$, front operator clearance $1.20\text{ m}$, rear service $0.90\text{ m}$, $22.4\text{ kW}$, $78\text{ dB(A)}$.
  * **Haas ST-20 (CNC Turning Center):** Base $3.18 \times 1.96\text{ m}$, chip-conveyor side clearance $1.20\text{ m}$, $14.9\text{ kW}$, $76\text{ dB(A)}$.
  * **Cylindrical/Surface Grinder:** Base $2.40 \times 1.80\text{ m}$, hazard tags `["dust", "vibration"]`, $86\text{ dB(A)}$.
  * **Mitutoyo Coordinate Measuring Machine (CMM):** Base $2.00 \times 1.80\text{ m}$, sensitive tags `["vibration_sensitive", "dust_sensitive", "noise_max_70dB"]`.
* **Mode B — Sample Robotic & EV Battery Workcell Catalog:**
  * **Universal Robots UR10e (Collaborative 6-Axis Cobot):** Base $\varnothing 190\text{ mm}$, max reach $1300\text{ mm}$, payload $12.5\text{ kg}$, joint speeds $120^\circ\text{--}180^\circ/\text{s}$, repeatability $\pm 0.05\text{ mm}$, $615\text{ W}$, ISO 10218-1 compliant (ideal for BMS fastening, cell sorting, kitting).
  * **ABB IRB 2600-20/1.65 (Medium Industrial 6-Axis):** Compact base $0.65 \times 0.65\text{ m}$, max reach $1650\text{ mm}$, payload $20\text{ kg}$, repeatability $\pm 0.04\text{ mm}$, Axis-1 speed $175^\circ/\text{s}$ (ideal for busbar laser welding, TIM dispensing, CNC tending).
  * **ABB IRB 6700-200/2.60 (Heavy-Duty 6-Axis):** Max reach $2600\text{ mm}$, payload $200\text{ kg}$ (ideal for full EV battery module lifting and pack enclosure placement).
  * **EV Battery Workcell Peripherals:** Automated Cell Feeder & OCV/ACIR Tester ($1.40 \times 0.90\text{ m}$), Module Stacking Fixture ($1.20 \times 0.80\text{ m}$), Class-4 Busbar Laser Welding Enclosure ($2.20 \times 1.80\text{ m}$), Vision EOL Inspection Bench ($1.20 \times 0.80\text{ m}$).

### 8.2 Unified Input JSON Schema

#### Mode A Example (`CELLULAR_CMS`)
```json
{
  "project_mode": "CELLULAR_CMS",
  "plot": {
    "boundary": [[0, 0], [35, 0], [35, 16], [22, 16], [22, 25], [0, 25]],
    "no_go_zones": [
      {"id": "Pillar_1", "polygon": [[10.0, 8.0], [10.6, 8.0], [10.6, 8.6], [10.0, 8.6]]}
    ],
    "docks": [
      {"id": "Recv_Dock", "point": [0, 4.0], "type": "receiving"},
      {"id": "Ship_Dock", "point": [35, 12.0], "type": "shipping"}
    ],
    "emergency_exits": [{"id": "Exit_North", "point": [11.0, 25.0]}],
    "utility_drops": [
      {"id": "Power_415V", "point": [0, 20.0], "utility": "power_3ph"},
      {"id": "Air_Header", "point": [0, 18.0], "utility": "compressed_air"}
    ],
    "min_aisle_width_m": 3.0
  },
  "entities": [
    {
      "id": "VMC_01",
      "model": "Haas_VF2",
      "dimensions": {"L": 2.57, "W": 2.24, "H": 2.57},
      "clearances": {"front": 1.2, "back": 0.9, "left": 0.6, "right": 0.6},
      "io_ports": [{"x": 1.28, "y": 0.0, "type": "pd_combined"}],
      "utilities": ["power_3ph", "compressed_air"],
      "noise_lw_db": 78.0,
      "hazard_tags": ["coolant_mist"],
      "is_pinned": false,
      "relocation_cost_inr": 250000
    }
  ],
  "part_routings": [
    {
      "part_id": "Gear_Shaft_A1",
      "annual_demand": 18000,
      "batch_size": 50,
      "sequence": [
        {"machine_type": "Band_Saw", "cycle_min": 1.5},
        {"machine_type": "Haas_ST20", "cycle_min": 4.2},
        {"machine_type": "Haas_VF2", "cycle_min": 6.0},
        {"machine_type": "Grinder_Cyl", "cycle_min": 3.5},
        {"machine_type": "Mitutoyo_CMM", "cycle_min": 2.0}
      ]
    }
  ],
  "safety_rules": [
    {"tag_a": "dust", "tag_b": "dust_sensitive", "min_distance_m": 6.0}
  ]
}
```

#### Mode B Example (`ROBOTIC_WORKCELL`)
```json
{
  "project_mode": "ROBOTIC_WORKCELL",
  "target_takt_time_s": 45.0,
  "plot": {
    "boundary": [[0, 0], [12, 0], [12, 8], [0, 8]],
    "no_go_zones": [],
    "docks": [
      {"id": "Infeed_Conv", "point": [0, 4.0], "type": "receiving"},
      {"id": "Outfeed_Conv", "point": [12, 4.0], "type": "shipping"}
    ],
    "emergency_exits": [{"id": "Gate_EStop_1", "point": [6.0, 0.0]}],
    "utility_drops": [{"id": "Power_415V", "point": [0, 7.5], "utility": "power_3ph"}]
  },
  "entities": [
    {
      "id": "Robot_Stack",
      "category": "robot_6axis",
      "model": "ABB_IRB_2600_20_165",
      "dimensions": {"L": 0.65, "W": 0.65, "H": 1.70},
      "kinematics": {
        "r_min_m": 0.35,
        "r_max_m": 1.65,
        "axis1_deg_s": 175.0,
        "stop_time_s": 0.25,
        "reaction_time_s": 0.08
      },
      "safety_mode": "SSM",
      "is_pinned": false,
      "relocation_cost_inr": 180000
    },
    {
      "id": "Human_BMS_Kitting",
      "category": "human_station",
      "dimensions": {"L": 1.40, "W": 0.90, "H": 1.10},
      "approach_speed_m_s": 1.6
    }
  ],
  "robot_tasks": [
    {
      "robot_id": "Robot_Stack",
      "sequence": [
        {"from": "Cell_Feeder", "to": "OCV_Tester", "process_s": 3.5},
        {"from": "OCV_Tester", "to": "Stack_Jig", "process_s": 4.0},
        {"from": "Stack_Jig", "to": "Cell_Feeder", "process_s": 1.0}
      ]
    }
  ]
}
```

### 8.3 Three-Tier Validation & Benchmarking Protocol

1. **Tier 1 — Published Academic Benchmarks (Algorithmic Proof):**
   * *CMS Cell Formation:* Evaluate Stage 1 on the 35 standard literature test matrices compiled by Gonçalves & Resende (2004) (spanning King & Nakornchai, Chandrasekharan & Rajagopalan, and Boctor up to $40 \times 100$) comparing achieved Grouping Efficacy $\Gamma$ against best-known published values.
   * *Spatial Unequal-Area FLP:* Benchmark Stage 2 on Bozer & Meller (1997) (`O7`, `O8`, `O9`, `VC10`) and Armour & Buffa (1963) (`AB20`) to quantify percentage gap from published optima.
   * *Controlled GNN Ablation Study:* Compare **(1) Pure NSGA-II**, **(2) CORELAP/ALDEP-Seeded NSGA-II**, and **(3) GNN-Surrogate-Assisted NSGA-II** across both modes, reporting wall-clock runtime speedup, Kendall's $\tau$ rank correlation of the surrogate, and final exact objective scores.
2. **Tier 2 — Full-Scale Realistic Industrial Scenarios (OEM Specs):**
   * *Scenario A (CMS):* 18-machine, 25-part Tier-2 Automotive Precision Machining SME inside an L-shaped $35\text{ m} \times 25\text{ m}$ floor with 4 structural pillars.
   * *Scenario B (EV Workcell):* 3-robot + 2-human collaborative EV Battery Module Assembly Workcell inside a $12\text{ m} \times 8\text{ m}$ bay targeting a $45\text{ s}$ Takt time under ISO 10218-2:2025 SSM constraints.
3. **Tier 3 — Local Physical Case Study (High-Impact Differentiator):**
   * Digitize the university's Mechanical/Production Engineering workshop or one local Tier-2/3 SME machine shop via basic floor measurements and supervisor routing interviews, then run **Brownfield Minimal-Disruption Mode** to present an actionable "Current vs. Optimized" travel-distance and cost reduction study.

---

## 9. Repository Layout, Roadmap & Risk Management

### 9.1 Modular Monorepo Structure
```text
facility-layout-ai/
├── backend/
│   ├── core/
│   │   ├── models.py            # Pydantic v2 unified schemas & LayoutEntity base class
│   │   ├── geometry.py          # Shapely 2.x STRtree, Minkowski aisles, isovists, noise grid
│   │   ├── routing.py           # NetworkX A* free-space pathfinding & Steiner utilities
│   │   ├── optimizer.py         # pymoo NSGA-II + Force-Directed Local Repair Operator
│   │   ├── compliance.py        # Fire egress, forklift swept-path, ISO 10218-2:2025 audit
│   │   └── simulation.py        # SimPy DES engine (CMS forklift & HRC SSM slowdown models)
│   ├── plugins/
│   │   ├── cms/
│   │   │   ├── cell_formation.py  # ROC, BEA, GA Grouping Efficacy + machine duplication
│   │   │   ├── cell_templates.py  # U-shaped, Linear, Double-row composite cell builders
│   │   │   └── heuristics.py      # Macro-level CORELAP & ALDEP warm-start seeders
│   │   └── robotic_cell/
│   │       ├── kinematics.py      # Annular reach polygons, joint slew & ikpy validation
│   │       ├── safety_iso.py      # ISO 10218-2 SSM zones, ISO 13854 gaps, pinch-point check
│   │       └── thermal_zoning.py  # EV battery laser/quarantine clearance & scanner coverage
│   ├── ml/
│   │   ├── data_gen.py          # Parametric synthetic layout generator (Mode A & Mode B)
│   │   ├── graph_builder.py     # Heterogeneous spatial-flow PyG Data constructor
│   │   └── gnn_surrogate.py     # PyG GATv2 surrogate model, ranking loss & online manager
│   ├── export/
│   │   ├── dxf_exporter.py      # Multi-layer ezdxf AutoCAD/LibreCAD export
│   │   └── pdf_report.py        # WeasyPrint executive engineering & compliance report
│   └── api/
│       ├── main.py              # FastAPI REST endpoints + WebSocket streaming
│       └── worker.py            # Celery async optimization & simulation tasks
├── frontend/                    # React + TypeScript + Konva.js + Plotly + optional Three.js
├── benchmarks/                  # 35 CMS matrices, UA-FLP instances, OEM catalog JSONs
└── docker-compose.yml           # Containerized API, Redis, Celery worker, and React frontend
```

### 9.2 Phased 4-Member Execution Plan (Late Nov 2026 – Apr 2027)

| Phase | Samyak Jain *(Geometry, Safety & CAD)* | Lakshya Yadav *(NSGA-II, Mode B Kinematics & SimPy)* | Maheep Singh *(GNN Surrogate, Mode A Cell Formation & Data)* | Shourya Aggarwal *(Frontend Canvas, API & Reports)* |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1: Core & Mode A Base** *(Late Nov – Dec 2026)* | Implement `core/geometry.py` (Shapely 2.x `STRtree`, irregular plots, asymmetric clearances, annular reach polygons) + Force-Directed Repair operator. | Implement shared `pymoo` NSGA-II engine + Mode A intra-cell U/Linear/Double templates + CORELAP/ALDEP warm start. | Implement Mode A Stage 1 Cell Formation (ROC, BEA, GA Grouping Efficacy) + curate OEM catalogs (Haas/ABB/UR) & benchmark parsers. | Scaffold FastAPI + React/Konva.js 2D canvas editor with Mode A/B switcher, polygon/obstacle drawing, and JSON/CSV uploader. |
| **Phase 2: Routing, Safety & Mode B** *(Jan 2027)* | Build `core/routing.py` (Minkowski aisles, A* paths, Steiner utilities) and `core/compliance.py` (Fire Egress + ISO 10218-2:2025 / ISO 13854). | Build Mode B robotic cycle-time evaluator (joint slewing + `ikpy` validation + SSM derating) + Brownfield minimal-disruption objective. | Build parametric synthetic dataset generators (6,000+ layouts each for Mode A & B) and train baseline `PyG` `GATv2` surrogates. | Wire WebSocket live convergence streaming, interactive Pareto front scatter selector, and spaghetti-diagram / reach-ring layer toggles. |
| **Phase 3: ML Surrogate, SimPy & Co-Design** *(Feb 2027)* | Add continuous 2D Noise dB fields, raycasted scanner isovists, and multi-layer `ezdxf` CAD exporter. | Build `SimPy` DES wrappers for Mode A (forklift contention) and Mode B (human-robot SSM Takt simulation) + Surrogate-Assisted NSGA-II. | Tune `GATv2` with Pairwise Margin Ranking Loss, integrate online surrogate refresh, and run full 3-way ablation studies. | Build "Pin, Drag & Auto-Heal" live co-design mode (sub-50ms recalculation), translucent heatmap overlays, and Compliance Scorecard UI. |
| **Phase 4: Validation & Export** *(Mar 2027)* | Run geometric stress tests (concave halls, dense columns, tight EV cells) and verify `.dxf` exports in AutoCAD/LibreCAD. | Execute 35 CMS + UA-FLP academic benchmarks, EV Battery Workcell case study, and optional local workshop brownfield study. | Compile GNN speedup/Kendall-$\tau$ accuracy charts, sensitivity analyses, and error-mode diagnostics for thesis. | Implement `WeasyPrint` PDF Audit Report generator, optional `Three.js` 2.5D preview toggle, and Docker Compose deployment. |
| **Phase 5: Final Delivery** *(Apr 2027)* | *All Members:* End-to-end integration testing, comparative result visualizations, B.Tech thesis writing, and live demo preparation. | *All Members* | *All Members* | *All Members* |

### 9.3 Scope Guardrails (Staged Milestone Gates)
1. **Milestone Gate 1 (End of Jan 2027):** Complete **Mode A (CMS)** end-to-end (Stage 1 + Stage 2 NSGA-II + A* aisles + Konva UI + DXF export) before activating Mode B in the UI.
2. **Milestone Gate 2 (End of Feb 2027):** Activate **Mode B (Robotic/EV Workcell)** on top of the exact same `core/` infrastructure, adding only `plugins/robotic_cell/`, ISO 10218-2:2025 audit rules, and reach-ring canvas rendering.
3. **Milestone Gate 3 (Mid-Mar 2027):** Integrate high-impact differentiators in strict priority order: **(1) GNN Surrogate**, **(2) SimPy DES Validation**, **(3) Brownfield ROI Mode & Compliance Scorecard**, **(4) Utility Steiner Routing & Acoustic/Isovist Heatmaps**, and **(5) 2.5D Three.js Preview** as final polish.

### 9.4 Technical Risks & Mitigations

| Risk | Likelihood | Mitigation Strategy |
| :--- | :--- | :--- |
| **GA stalls in infeasible (overlapping) regions on concave plots** | High | Run the 5–10 step Force-Directed Local Repair Operator on every offspring before evaluation rather than relying solely on soft penalties. |
| **GNN surrogate ranking errors misguide NSGA-II evolution** | Medium | Never evaluate solely with the surrogate. Train with Pairwise Margin Ranking Loss, evaluate top 20% elite + 5% random offspring with exact physics every generation, and verify 100% of the final Pareto front exactly. |
| **6-DOF Inverse Kinematics slows down Mode B offline labeling** | Medium | Use fast analytical joint-slew heuristics inside fast inner loops and reserve full `ikpy` / numerical IK sweeps for offline dataset generation and top-Pareto exact verification. |
| **Dual-mode scope creep threatens April deadline** | Medium | Enforce Milestone Gate 1 (Mode A complete first) and isolate all domain logic strictly behind the `plugins/` interface so core bugs are fixed once for both modes. |