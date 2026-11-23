from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field, ConfigDict


class ProjectMode(str, Enum):
    CELLULAR_CMS = "CELLULAR_CMS"
    ROBOTIC_WORKCELL = "ROBOTIC_WORKCELL"


class CellTemplateType(str, Enum):
    U_SHAPED = "U"
    LINEAR = "LINEAR"
    DOUBLE_ROW = "DOUBLE_ROW"


class Port(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    
    x: float
    y: float
    port_type: str = Field(default="pd_combined", description="pd_combined, input, output, transfer")


class Dimensions(BaseModel):
    L: float = Field(gt=0, description="Length / X dimension in meters")
    W: float = Field(gt=0, description="Width / Y dimension in meters")
    H: float = Field(default=2.0, gt=0, description="Height / Z dimension in meters")


class Clearances(BaseModel):
    front: float = Field(default=1.2, ge=0, description="Operator standing / access zone (meters)")
    back: float = Field(default=0.8, ge=0, description="Rear maintenance access (meters)")
    left: float = Field(default=0.6, ge=0, description="Left side clearance (meters)")
    right: float = Field(default=0.6, ge=0, description="Right side clearance (meters)")


class RobotKinematics(BaseModel):
    r_min_m: float = Field(default=0.35, ge=0, description="Inner dead-zone radius (m)")
    r_max_m: float = Field(default=1.65, gt=0, description="Max reach radius (m)")
    axis1_deg_s: float = Field(default=175.0, gt=0, description="Base axis max angular speed (deg/s)")
    stop_time_s: float = Field(default=0.25, ge=0, description="Braking stop time (s)")
    reaction_time_s: float = Field(default=0.08, ge=0, description="Sensor & processing reaction time (s)")
    max_payload_kg: float = Field(default=20.0, ge=0, description="Max wrist payload (kg)")
    rail_length_m: Optional[float] = Field(default=0.0, ge=0, description="7th-axis linear track length (m)")


class LayoutEntity(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: Optional[str] = None
    model: Optional[str] = None
    category: str = Field(default="machine", description="vmc, cnc_turning, grinder, cmm, robot_6axis, human_station, fixture, feeder, welder, inspection")
    dimensions: Dimensions
    clearances: Clearances = Field(default_factory=Clearances)
    io_ports: List[Port] = Field(default_factory=list)
    utilities: List[str] = Field(default_factory=list, description="power_3ph, compressed_air, exhaust, chiller, inert_gas")
    noise_lw_db: float = Field(default=75.0, description="Acoustic sound power level Lw in dB")
    hazard_tags: List[str] = Field(default_factory=list, description="coolant_mist, dust, vibration, laser_class4, thermal_risk")
    sensitive_tags: List[str] = Field(default_factory=list, description="dust_sensitive, vibration_sensitive, noise_max_70dB")
    is_pinned: bool = Field(default=False, description="Pin entity in place during optimization")
    relocation_cost_inr: float = Field(default=50000.0, ge=0, description="Cost in INR to move machine (for brownfield re-layout)")
    
    # Mode B Robotics / Safety specifics
    kinematics: Optional[RobotKinematics] = None
    safety_mode: Optional[str] = Field(default=None, description="SSM, PFL, ENCLOSED, NONE")
    approach_speed_m_s: float = Field(default=1.6, ge=0, description="Human approach speed per ISO 13855 (m/s)")

    # Defense & Statutory Specifics (DGQA, PESO, AERB, IS 6922)
    net_explosive_weight_kg: float = Field(default=0.0, ge=0, description="Net Explosive Quantity (NEQ/NEW) in kg TNT equivalent")
    is_mrb_bonded: bool = Field(default=False, description="AS9100D / DGQA locked quarantine cage / bonded store")
    is_aerb_radiological: bool = Field(default=False, description="AERB industrial radiography NDT bunker")
    vibration_class: Optional[str] = Field(default=None, description="HEAVY_FORGE, SUB_MICRON_CMM, 5AXIS_MILL")

    # Placement state
    x: float = Field(default=0.0, description="Centroid X in meters")
    y: float = Field(default=0.0, description="Centroid Y in meters")
    theta: float = Field(default=0.0, description="Orientation angle in degrees (0, 90, 180, 270)")
    cell_id: Optional[int] = Field(default=None, description="Assigned cell ID in Mode A")
    cell_template: Optional[CellTemplateType] = Field(default=None, description="Template type in Mode A")
    color: Optional[str] = None


class NoGoZone(BaseModel):
    id: str
    polygon: List[List[float]] = Field(description="List of [x, y] coordinates forming closed polygon")


class Dock(BaseModel):
    id: str
    point: List[float] = Field(description="[x, y] coordinate of dock")
    type: str = Field(default="receiving", description="receiving, shipping, pd")


class EmergencyExit(BaseModel):
    id: str
    point: List[float] = Field(description="[x, y] coordinate of exit")


class UtilityDrop(BaseModel):
    id: str
    point: List[float] = Field(description="[x, y] coordinate on wall/floor")
    utility: str = Field(description="power_3ph, compressed_air, exhaust, chiller")


class PlotSchema(BaseModel):
    boundary: List[List[float]] = Field(description="Outer hall perimeter polygon [[x1, y1], [x2, y2], ...]")
    no_go_zones: List[NoGoZone] = Field(default_factory=list)
    docks: List[Dock] = Field(default_factory=list)
    emergency_exits: List[EmergencyExit] = Field(default_factory=list)
    utility_drops: List[UtilityDrop] = Field(default_factory=list)
    min_aisle_width_m: float = Field(default=3.0, ge=1.0)


class PartOperation(BaseModel):
    machine_type: str
    cycle_min: float = Field(default=1.0, gt=0)


class PartRouting(BaseModel):
    part_id: str
    annual_demand: int = Field(default=10000, gt=0)
    batch_size: int = Field(default=50, gt=0)
    sequence: List[PartOperation]


class SafetyRule(BaseModel):
    tag_a: str
    tag_b: str
    min_distance_m: float = Field(gt=0)


class RobotTaskStep(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_entity: str = Field(alias="from")
    to_entity: str = Field(alias="to")
    process_s: float = Field(default=2.0, ge=0)


class RobotTask(BaseModel):
    robot_id: str
    sequence: List[RobotTaskStep]


class ProjectConfig(BaseModel):
    project_name: str = "Dual-Mode AI Facility Layout"
    project_mode: ProjectMode = ProjectMode.CELLULAR_CMS
    target_takt_time_s: Optional[float] = Field(default=45.0, ge=0)
    plot: PlotSchema
    entities: List[LayoutEntity]
    part_routings: List[PartRouting] = Field(default_factory=list)
    safety_rules: List[SafetyRule] = Field(default_factory=list)
    robot_tasks: List[RobotTask] = Field(default_factory=list)
    capital_budget_inr: float = Field(default=1500000.0, ge=0)
    
    # Cost & weighting hyperparameters
    intra_handling_cost_per_m: float = 1.0
    inter_handling_cost_per_m: float = 15.0
    fence_cost_per_m: float = 120.0
    utility_cost_per_m: float = 85.0
    weight_compactness: float = 0.25
    weight_adjacency: float = 0.35
    weight_hazard: float = 0.25
    weight_utility: float = 0.15


class OptimizationRequest(BaseModel):
    config: ProjectConfig
    population_size: int = Field(default=40, ge=10, le=200)
    generations: int = Field(default=40, ge=5, le=300)
    seed_method: str = Field(default="hybrid", description="random, corelap, aldep, hybrid, gnn")
    enable_local_repair: bool = True
    enable_surrogate: bool = True
    pinned_entity_ids: List[str] = Field(default_factory=list)


class ComplianceCheckDetail(BaseModel):
    check_name: str
    passed: bool
    status: str
    value: float
    threshold: float
    message: str


class ComplianceResult(BaseModel):
    overall_passed: bool = True
    overall_score: float = 100.0
    fire_egress_passed: bool = True
    fire_egress_max_dist_m: float = 0.0
    forklift_aisle_passed: bool = True
    forklift_aisle_min_width_m: float = 0.0
    iso_safety_passed: bool = True
    hazard_separation_passed: bool = True
    
    # Indian Defense & Statutory Audit Results (DGQA, PESO, AERB, NBC 2016, IS 6922)
    dgqa_custody_passed: bool = True
    peso_qd_passed: bool = True
    aerb_radiation_passed: bool = True
    nbc_group_j_egress_passed: bool = True
    is6922_vibration_isolation_passed: bool = True

    violations: List[str] = Field(default_factory=list)
    details: List[ComplianceCheckDetail] = Field(default_factory=list)


class SimulationMetrics(BaseModel):
    mode: ProjectMode
    throughput_per_hour: float = 0.0
    avg_flow_time_min: Optional[float] = None
    wip_average: Optional[float] = None
    forklift_utilization_pct: Optional[float] = None
    forklift_queue_wait_min: Optional[float] = None
    robot_utilization_pct: Optional[float] = None
    robot_safety_stopped_pct: Optional[float] = None
    human_idle_time_pct: Optional[float] = None
    bottleneck_cycle_time_s: Optional[float] = None
    takt_time_s: Optional[float] = None
    takt_met: bool = True
    summary: str = ""


class SolutionCandidate(BaseModel):
    candidate_id: str
    rank: int = 1
    crowding_distance: float = 0.0
    z1_score: float
    z2_score: float
    z1_label: str
    z2_label: str
    is_feasible: bool = True
    overlap_area: float = 0.0
    boundary_violation_area: float = 0.0
    entities: List[LayoutEntity]
    compliance: Optional[ComplianceResult] = None
    simulation: Optional[SimulationMetrics] = None
    relocation_cost_inr: float = 0.0
    generation: int = 0
    seed_type: str = "random"


class OptimizationResponse(BaseModel):
    project_mode: ProjectMode
    total_generations: int
    population_size: int
    pareto_front: List[SolutionCandidate]
    convergence_history: List[Dict[str, Any]]
    run_time_seconds: float
