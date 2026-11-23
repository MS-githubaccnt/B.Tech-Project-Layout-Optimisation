export type ProjectMode = 'CELLULAR_CMS' | 'ROBOTIC_WORKCELL';

export interface Dimensions {
  L: number;
  W: number;
  H: number;
}

export interface Clearances {
  front: number;
  back: number;
  left: number;
  right: number;
}

export interface RobotKinematics {
  r_min_m: number;
  r_max_m: number;
  axis1_deg_s: number;
  stop_time_s: number;
  reaction_time_s: number;
  max_payload_kg?: number;
}

export interface Port {
  x: number;
  y: number;
  port_type: string;
}

export interface LayoutEntity {
  id: string;
  name?: string;
  model?: string;
  category: string;
  dimensions: Dimensions;
  clearances: Clearances;
  io_ports?: Port[];
  utilities?: string[];
  noise_lw_db?: number;
  hazard_tags?: string[];
  sensitive_tags?: string[];
  is_pinned?: boolean;
  relocation_cost_inr?: number;
  kinematics?: RobotKinematics;
  safety_mode?: string;
  approach_speed_m_s?: number;
  net_explosive_weight_kg?: number;
  is_mrb_bonded?: boolean;
  is_aerb_radiological?: boolean;
  vibration_class?: string;
  x: number;
  y: number;
  theta: number;
  cell_id?: number;
  cell_template?: string;
  color?: string;
}

export interface NoGoZone {
  id: string;
  polygon: [number, number][];
}

export interface Dock {
  id: string;
  point: [number, number];
  type: string;
}

export interface EmergencyExit {
  id: string;
  point: [number, number];
}

export interface UtilityDrop {
  id: string;
  point: [number, number];
  utility: string;
}

export interface PlotSchema {
  boundary: [number, number][];
  no_go_zones: NoGoZone[];
  docks: Dock[];
  emergency_exits: EmergencyExit[];
  utility_drops: UtilityDrop[];
  min_aisle_width_m: number;
}

export interface PartOperation {
  machine_type: string;
  cycle_min: number;
}

export interface PartRouting {
  part_id: string;
  annual_demand: number;
  batch_size: number;
  sequence: PartOperation[];
}

export interface SafetyRule {
  tag_a: string;
  tag_b: string;
  min_distance_m: number;
}

export interface RobotTaskStep {
  from: string;
  to: string;
  process_s: number;
}

export interface RobotTask {
  robot_id: string;
  sequence: RobotTaskStep[];
}

export interface ProjectConfig {
  project_name: string;
  project_mode: ProjectMode;
  target_takt_time_s?: number;
  plot: PlotSchema;
  entities: LayoutEntity[];
  part_routings: PartRouting[];
  safety_rules: SafetyRule[];
  robot_tasks: RobotTask[];
  capital_budget_inr?: number;
}

export interface ComplianceCheckDetail {
  check_name: string;
  passed: boolean;
  status: string;
  value: number;
  threshold: number;
  message: string;
}

export interface ComplianceResult {
  overall_passed: boolean;
  overall_score: number;
  fire_egress_passed: boolean;
  fire_egress_max_dist_m: number;
  forklift_aisle_passed: boolean;
  forklift_aisle_min_width_m: number;
  iso_safety_passed: boolean;
  hazard_separation_passed: boolean;
  dgqa_custody_passed?: boolean;
  peso_qd_passed?: boolean;
  aerb_radiation_passed?: boolean;
  nbc_group_j_egress_passed?: boolean;
  is6922_vibration_isolation_passed?: boolean;
  violations: string[];
  details: ComplianceCheckDetail[];
}

export interface SimulationMetrics {
  mode: ProjectMode;
  throughput_per_hour: number;
  avg_flow_time_min?: number;
  wip_average?: number;
  forklift_utilization_pct?: number;
  forklift_queue_wait_min?: number;
  robot_utilization_pct?: number;
  robot_safety_stopped_pct?: number;
  human_idle_time_pct?: number;
  bottleneck_cycle_time_s?: number;
  takt_time_s?: number;
  takt_met?: boolean;
  summary: string;
}

export interface SolutionCandidate {
  candidate_id: string;
  rank: number;
  crowding_distance: number;
  z1_score: number;
  z2_score: number;
  z1_label: string;
  z2_label: string;
  is_feasible: boolean;
  overlap_area: number;
  boundary_violation_area: number;
  entities: LayoutEntity[];
  compliance?: ComplianceResult;
  simulation?: SimulationMetrics;
  relocation_cost_inr: number;
  generation: number;
  seed_type: string;
}

export interface OptimizationResponse {
  project_mode: ProjectMode;
  total_generations: number;
  population_size: number;
  pareto_front: SolutionCandidate[];
  convergence_history: {
    generation: number;
    min_z1: number;
    avg_z1: number;
    min_z2: number;
    feasible_count: number;
  }[];
  run_time_seconds: number;
}
