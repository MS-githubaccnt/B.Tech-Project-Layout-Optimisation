import { ProjectConfig } from './types';

export const DEFAULT_CMS_CONFIG: ProjectConfig = {
  project_name: "Missile Actuator & Armament Machining Facility (AS9100D Compliant)",
  project_mode: "CELLULAR_CMS",
  plot: {
    boundary: [
      [0.0, 0.0],
      [35.0, 0.0],
      [35.0, 16.0],
      [22.0, 16.0],
      [22.0, 25.0],
      [0.0, 25.0]
    ],
    no_go_zones: [
      { id: "Pillar_1", polygon: [[10.0, 8.0], [10.8, 8.0], [10.8, 8.8], [10.0, 8.8]] },
      { id: "Pillar_2", polygon: [[24.0, 8.0], [24.8, 8.0], [24.8, 8.8], [24.0, 8.8]] },
      { id: "Pillar_3", polygon: [[10.0, 18.0], [10.8, 18.0], [10.8, 18.8], [10.0, 18.8]] }
    ],
    docks: [
      { id: "Dock_Receiving", point: [0.0, 5.0], type: "receiving" },
      { id: "Dock_Shipping", point: [35.0, 10.0], type: "shipping" }
    ],
    emergency_exits: [
      { id: "Exit_North", point: [11.0, 25.0] },
      { id: "Exit_South", point: [18.0, 0.0] }
    ],
    utility_drops: [
      { id: "Power_Panel_415V", point: [0.0, 18.0], utility: "power_3ph" },
      { id: "Air_Compressor_Manifold", point: [0.0, 12.0], utility: "compressed_air" }
    ],
    min_aisle_width_m: 3.0
  },
  entities: [
    {
      id: "VMC_5AXIS_01",
      model: "DMG_Mori_DMU50",
      category: "vmc_5axis",
      dimensions: { L: 2.85, W: 2.45, H: 2.70 },
      clearances: { front: 1.40, back: 1.00, left: 0.80, right: 0.80 },
      io_ports: [{ x: 1.42, y: 0.0, port_type: "pd_combined" }],
      utilities: ["power_3ph", "compressed_air", "chiller"],
      noise_lw_db: 79.0,
      hazard_tags: ["coolant_mist"],
      sensitive_tags: ["vibration_sensitive"],
      x: 8.5, y: 5.0, theta: 0.0,
      cell_id: 1,
      relocation_cost_inr: 450000.0
    },
    {
      id: "VMC_5AXIS_02",
      model: "DMG_Mori_DMU50",
      category: "vmc_5axis",
      dimensions: { L: 2.85, W: 2.45, H: 2.70 },
      clearances: { front: 1.40, back: 1.00, left: 0.80, right: 0.80 },
      io_ports: [{ x: 1.42, y: 0.0, port_type: "pd_combined" }],
      utilities: ["power_3ph", "compressed_air", "chiller"],
      noise_lw_db: 79.0,
      hazard_tags: ["coolant_mist"],
      sensitive_tags: ["vibration_sensitive"],
      x: 8.5, y: 10.5, theta: 0.0,
      cell_id: 1,
      relocation_cost_inr: 450000.0
    },
    {
      id: "CNC_01",
      model: "Haas_ST20",
      category: "cnc_turning",
      dimensions: { L: 3.18, W: 1.96, H: 1.98 },
      clearances: { front: 1.20, back: 0.80, left: 0.60, right: 1.20 },
      io_ports: [{ x: 1.59, y: 0.0, port_type: "pd_combined" }],
      utilities: ["power_3ph", "compressed_air"],
      noise_lw_db: 76.0,
      hazard_tags: ["coolant_mist"],
      sensitive_tags: [],
      x: 3.5, y: 10.5, theta: 0.0,
      cell_id: 1,
      relocation_cost_inr: 220000.0
    },
    {
      id: "GUN_DRILL_01",
      model: "TBT_Gun_Drill",
      category: "gun_drill",
      dimensions: { L: 5.80, W: 1.90, H: 2.10 },
      clearances: { front: 1.40, back: 1.00, left: 1.50, right: 1.50 },
      io_ports: [{ x: 2.90, y: 0.0, port_type: "pd_combined" }],
      utilities: ["power_3ph", "compressed_air"],
      noise_lw_db: 84.0,
      hazard_tags: ["coolant_mist", "vibration"],
      sensitive_tags: [],
      x: 22.0, y: 5.0, theta: 0.0,
      cell_id: 2,
      relocation_cost_inr: 750000.0
    },
    {
      id: "GRIND_01",
      model: "Grinder_Cyl",
      category: "grinder",
      dimensions: { L: 2.40, W: 1.80, H: 1.80 },
      clearances: { front: 1.00, back: 0.80, left: 0.50, right: 0.50 },
      utilities: ["power_3ph", "exhaust"],
      noise_lw_db: 86.0,
      hazard_tags: ["dust", "vibration"],
      sensitive_tags: [],
      x: 30.5, y: 5.0, theta: 0.0,
      cell_id: 2,
      relocation_cost_inr: 150000.0
    },
    {
      id: "VAC_FURNACE_01",
      model: "Ipsen_Vacuum_Furnace",
      category: "heat_treat",
      dimensions: { L: 4.20, W: 3.20, H: 3.00 },
      clearances: { front: 1.80, back: 1.20, left: 1.00, right: 1.00 },
      utilities: ["power_3ph", "cooling_water"],
      noise_lw_db: 68.0,
      hazard_tags: ["thermal_risk"],
      sensitive_tags: [],
      x: 26.5, y: 11.5, theta: 0.0,
      cell_id: 2,
      relocation_cost_inr: 950000.0
    },
    {
      id: "CMM_ZEISS_01",
      model: "Zeiss_Prismo_Nav",
      category: "cmm",
      dimensions: { L: 2.40, W: 2.00, H: 2.60 },
      clearances: { front: 1.20, back: 0.80, left: 0.80, right: 0.80 },
      utilities: ["power_3ph", "compressed_air"],
      noise_lw_db: 56.0,
      hazard_tags: [],
      sensitive_tags: ["dust_sensitive", "vibration_sensitive", "noise_max_70dB"],
      x: 5.0, y: 20.0, theta: 0.0,
      cell_id: 3,
      relocation_cost_inr: 350000.0
    },
    {
      id: "SAW_01",
      model: "Band_Saw",
      category: "machine",
      dimensions: { L: 2.20, W: 1.40, H: 1.50 },
      clearances: { front: 1.00, back: 0.60, left: 1.20, right: 1.20 },
      utilities: ["power_3ph"],
      noise_lw_db: 82.0,
      hazard_tags: ["dust"],
      sensitive_tags: [],
      x: 3.5, y: 5.0, theta: 0.0,
      cell_id: 1,
      relocation_cost_inr: 60000.0
    },
    {
      id: "NDT_XRAY_01",
      model: "Waygate_NDT_Bunker",
      category: "inspection",
      dimensions: { L: 3.80, W: 3.20, H: 2.80 },
      clearances: { front: 1.50, back: 0.80, left: 0.80, right: 0.80 },
      utilities: ["power_3ph", "chiller"],
      noise_lw_db: 52.0,
      hazard_tags: ["radiation_ndt"],
      sensitive_tags: ["vibration_sensitive"],
      x: 11.5, y: 20.0, theta: 0.0,
      cell_id: 3,
      relocation_cost_inr: 650000.0
    },
    {
      id: "MRB_CAGE_01",
      model: "MRB_Quarantine_Cage",
      category: "storage",
      dimensions: { L: 3.00, W: 2.00, H: 2.40 },
      clearances: { front: 1.50, back: 0.40, left: 0.40, right: 0.40 },
      utilities: ["power_3ph"],
      noise_lw_db: 42.0,
      hazard_tags: ["mrb_locked"],
      sensitive_tags: [],
      x: 18.0, y: 20.0, theta: 0.0,
      cell_id: 3,
      relocation_cost_inr: 65000.0
    }
  ],
  part_routings: [
    {
      part_id: "Missile_Fin_Titanium",
      annual_demand: 3600,
      batch_size: 30,
      sequence: [
        { machine_type: "Band_Saw", cycle_min: 2.0 },
        { machine_type: "DMG_Mori_DMU50", cycle_min: 12.5 },
        { machine_type: "Grinder_Cyl", cycle_min: 4.0 },
        { machine_type: "Waygate_NDT_Bunker", cycle_min: 3.5 },
        { machine_type: "Zeiss_Prismo_Nav", cycle_min: 3.0 }
      ]
    },
    {
      part_id: "Artillery_Breech_Maraging",
      annual_demand: 2400,
      batch_size: 20,
      sequence: [
        { machine_type: "Band_Saw", cycle_min: 3.0 },
        { machine_type: "Haas_ST20", cycle_min: 8.5 },
        { machine_type: "TBT_Gun_Drill", cycle_min: 15.0 },
        { machine_type: "DMG_Mori_DMU50", cycle_min: 9.0 },
        { machine_type: "Ipsen_Vacuum_Furnace", cycle_min: 25.0 },
        { machine_type: "Zeiss_Prismo_Nav", cycle_min: 4.0 }
      ]
    },
    {
      part_id: "Propulsion_Casing_Inconel",
      annual_demand: 1800,
      batch_size: 15,
      sequence: [
        { machine_type: "Haas_ST20", cycle_min: 10.0 },
        { machine_type: "DMG_Mori_DMU50", cycle_min: 14.0 },
        { machine_type: "Waygate_NDT_Bunker", cycle_min: 4.5 },
        { machine_type: "MRB_Quarantine_Cage", cycle_min: 2.0 }
      ]
    }
  ],
  safety_rules: [
    { tag_a: "dust", tag_b: "dust_sensitive", min_distance_m: 6.0 },
    { tag_a: "vibration", tag_b: "vibration_sensitive", min_distance_m: 7.0 },
    { tag_a: "radiation_ndt", tag_b: "human_station", min_distance_m: 5.0 },
    { tag_a: "thermal_risk", tag_b: "mrb_locked", min_distance_m: 4.0 }
  ],
  robot_tasks: [],
  capital_budget_inr: 5000000.0
};

export const DEFENSE_ORDNANCE_CONFIG: ProjectConfig = {
  project_name: "Artillery Shell & Armament Heavy Forging Facility",
  project_mode: "CELLULAR_CMS",
  plot: {
    boundary: [
      [0.0, 0.0],
      [40.0, 0.0],
      [40.0, 22.0],
      [0.0, 22.0]
    ],
    no_go_zones: [
      { id: "Pillar_A", polygon: [[12.0, 10.0], [12.8, 10.0], [12.8, 10.8], [12.0, 10.8]] },
      { id: "Pillar_B", polygon: [[26.0, 10.0], [26.8, 10.0], [26.8, 10.8], [26.0, 10.8]] }
    ],
    docks: [
      { id: "Dock_Raw_Ingot", point: [0.0, 10.0], type: "receiving" },
      { id: "Dock_Finished_Shells", point: [40.0, 10.0], type: "shipping" }
    ],
    emergency_exits: [
      { id: "Exit_North", point: [20.0, 22.0] },
      { id: "Exit_South", point: [20.0, 0.0] }
    ],
    utility_drops: [
      { id: "Substation_11kV_415V", point: [0.0, 18.0], utility: "power_3ph" },
      { id: "Hydraulic_Power_Pack", point: [0.0, 6.0], utility: "hydraulic_power" }
    ],
    min_aisle_width_m: 3.5
  },
  entities: [
    {
      id: "HAMMER_FORGE_01",
      model: "Banning_Forging_Hammer",
      category: "forming",
      dimensions: { L: 4.80, W: 3.60, H: 4.20 },
      clearances: { front: 2.00, back: 1.50, left: 1.50, right: 1.50 },
      io_ports: [{ x: 2.40, y: 0.0, port_type: "pd_combined" }],
      utilities: ["power_3ph", "hydraulic_power"],
      noise_lw_db: 96.0,
      hazard_tags: ["vibration", "noise_hazard", "thermal_risk"],
      sensitive_tags: [],
      x: 8.0, y: 7.0, theta: 0.0,
      relocation_cost_inr: 2500000.0
    },
    {
      id: "GUN_DRILL_01",
      model: "TBT_Gun_Drill",
      category: "gun_drill",
      dimensions: { L: 5.80, W: 1.90, H: 2.10 },
      clearances: { front: 1.40, back: 1.00, left: 1.50, right: 1.50 },
      io_ports: [{ x: 2.90, y: 0.0, port_type: "pd_combined" }],
      utilities: ["power_3ph", "compressed_air"],
      noise_lw_db: 84.0,
      hazard_tags: ["coolant_mist", "vibration"],
      sensitive_tags: [],
      x: 20.0, y: 6.0, theta: 0.0,
      relocation_cost_inr: 750000.0
    },
    {
      id: "CNC_HEAVY_01",
      model: "Haas_ST20",
      category: "cnc_turning",
      dimensions: { L: 3.18, W: 1.96, H: 1.98 },
      clearances: { front: 1.20, back: 0.80, left: 0.60, right: 1.20 },
      io_ports: [{ x: 1.59, y: 0.0, port_type: "pd_combined" }],
      utilities: ["power_3ph", "compressed_air"],
      noise_lw_db: 76.0,
      hazard_tags: ["coolant_mist"],
      sensitive_tags: [],
      x: 8.0, y: 15.0, theta: 0.0,
      relocation_cost_inr: 320000.0
    },
    {
      id: "VAC_FURNACE_01",
      model: "Ipsen_Vacuum_Furnace",
      category: "heat_treat",
      dimensions: { L: 4.20, W: 3.20, H: 3.00 },
      clearances: { front: 1.80, back: 1.20, left: 1.00, right: 1.00 },
      utilities: ["power_3ph", "cooling_water"],
      noise_lw_db: 68.0,
      hazard_tags: ["thermal_risk"],
      sensitive_tags: [],
      x: 20.0, y: 15.0, theta: 0.0,
      relocation_cost_inr: 950000.0
    },
    {
      id: "NDT_BUNKER_01",
      model: "Waygate_NDT_Bunker",
      category: "inspection",
      dimensions: { L: 3.80, W: 3.20, H: 2.80 },
      clearances: { front: 1.50, back: 0.80, left: 0.80, right: 0.80 },
      utilities: ["power_3ph", "chiller"],
      noise_lw_db: 52.0,
      hazard_tags: ["radiation_ndt"],
      sensitive_tags: ["vibration_sensitive"],
      x: 32.0, y: 7.0, theta: 0.0,
      relocation_cost_inr: 650000.0
    },
    {
      id: "CMM_ZEISS_01",
      model: "Zeiss_Prismo_Nav",
      category: "cmm",
      dimensions: { L: 2.40, W: 2.00, H: 2.60 },
      clearances: { front: 1.20, back: 0.80, left: 0.80, right: 0.80 },
      utilities: ["power_3ph", "compressed_air"],
      noise_lw_db: 56.0,
      hazard_tags: [],
      sensitive_tags: ["dust_sensitive", "vibration_sensitive"],
      x: 32.0, y: 16.0, theta: 0.0,
      relocation_cost_inr: 350000.0
    },
    {
      id: "MRB_CAGE_01",
      model: "MRB_Quarantine_Cage",
      category: "storage",
      dimensions: { L: 3.00, W: 2.00, H: 2.40 },
      clearances: { front: 1.50, back: 0.40, left: 0.40, right: 0.40 },
      utilities: ["power_3ph"],
      noise_lw_db: 42.0,
      hazard_tags: ["mrb_locked"],
      sensitive_tags: [],
      x: 32.0, y: 1.0, theta: 0.0,
      relocation_cost_inr: 65000.0
    }
  ],
  part_routings: [
    {
      part_id: "Artillery_Shell_155mm_HE",
      annual_demand: 4800,
      batch_size: 50,
      sequence: [
        { machine_type: "Banning_Forging_Hammer", cycle_min: 5.0 },
        { machine_type: "Haas_ST20", cycle_min: 12.0 },
        { machine_type: "Ipsen_Vacuum_Furnace", cycle_min: 30.0 },
        { machine_type: "Waygate_NDT_Bunker", cycle_min: 6.0 },
        { machine_type: "Zeiss_Prismo_Nav", cycle_min: 4.0 }
      ]
    },
    {
      part_id: "Howitzer_Barrel_155mm",
      annual_demand: 800,
      batch_size: 10,
      sequence: [
        { machine_type: "Banning_Forging_Hammer", cycle_min: 15.0 },
        { machine_type: "TBT_Gun_Drill", cycle_min: 45.0 },
        { machine_type: "Haas_ST20", cycle_min: 20.0 },
        { machine_type: "Ipsen_Vacuum_Furnace", cycle_min: 40.0 },
        { machine_type: "Waygate_NDT_Bunker", cycle_min: 10.0 }
      ]
    }
  ],
  safety_rules: [
    { tag_a: "vibration", tag_b: "vibration_sensitive", min_distance_m: 8.0 },
    { tag_a: "radiation_ndt", tag_b: "human_station", min_distance_m: 6.0 },
    { tag_a: "noise_hazard", tag_b: "dust_sensitive", min_distance_m: 6.0 }
  ],
  robot_tasks: [],
  capital_budget_inr: 8000000.0
};

export const DEFAULT_ROBOTIC_CONFIG: ProjectConfig = {
  project_name: "EV Battery Module Collaborative Assembly Workcell",
  project_mode: "ROBOTIC_WORKCELL",
  target_takt_time_s: 45.0,
  plot: {
    boundary: [
      [0.0, 0.0],
      [14.0, 0.0],
      [14.0, 10.0],
      [0.0, 10.0]
    ],
    no_go_zones: [],
    docks: [
      { id: "Infeed_Pallet_Conv", point: [0.0, 5.0], type: "receiving" },
      { id: "Outfeed_Module_Conv", point: [14.0, 5.0], type: "shipping" }
    ],
    emergency_exits: [
      { id: "EStop_Gate_West", point: [7.0, 0.0] }
    ],
    utility_drops: [
      { id: "Power_Panel_415V", point: [0.0, 8.5], utility: "power_3ph" },
      { id: "Laser_Chiller_Drop", point: [14.0, 8.5], utility: "chiller" }
    ],
    min_aisle_width_m: 2.5
  },
  entities: [
    {
      id: "Robot_Stacking",
      model: "ABB_IRB_2600_20_165",
      category: "robot_6axis",
      dimensions: { L: 0.65, W: 0.65, H: 1.65 },
      clearances: { front: 0.0, back: 0.0, left: 0.0, right: 0.0 },
      kinematics: {
        r_min_m: 0.35,
        r_max_m: 1.65,
        axis1_deg_s: 175.0,
        stop_time_s: 0.25,
        reaction_time_s: 0.08,
        max_payload_kg: 20.0
      },
      safety_mode: "SSM",
      x: 4.5, y: 5.0, theta: 0.0,
      relocation_cost_inr: 180000.0
    },
    {
      id: "Cobot_BMS_Fastener",
      model: "UR10e",
      category: "robot_6axis",
      dimensions: { L: 0.35, W: 0.35, H: 1.30 },
      clearances: { front: 0.0, back: 0.0, left: 0.0, right: 0.0 },
      kinematics: {
        r_min_m: 0.20,
        r_max_m: 1.30,
        axis1_deg_s: 120.0,
        stop_time_s: 0.20,
        reaction_time_s: 0.05,
        max_payload_kg: 12.5
      },
      safety_mode: "PFL",
      x: 9.5, y: 5.0, theta: 0.0,
      relocation_cost_inr: 90000.0
    },
    {
      id: "Cell_Feeder_OCV",
      model: "Cell_Feeder_OCV",
      category: "feeder",
      dimensions: { L: 1.50, W: 1.00, H: 1.20 },
      clearances: { front: 0.60, back: 0.40, left: 0.40, right: 0.40 },
      x: 2.5, y: 5.0, theta: 0.0,
      relocation_cost_inr: 120000.0
    },
    {
      id: "Module_Stack_Fixture",
      model: "Stack_Jig_Fixture",
      category: "fixture",
      dimensions: { L: 1.20, W: 0.90, H: 1.00 },
      clearances: { front: 0.50, back: 0.40, left: 0.40, right: 0.40 },
      x: 6.5, y: 5.0, theta: 0.0,
      relocation_cost_inr: 80000.0
    },
    {
      id: "Laser_Busbar_Welder",
      model: "Busbar_Laser_Welder",
      category: "welder",
      dimensions: { L: 2.20, W: 1.80, H: 2.20 },
      clearances: { front: 0.80, back: 0.60, left: 0.60, right: 0.60 },
      hazard_tags: ["laser_class4"],
      x: 6.5, y: 8.0, theta: 0.0,
      relocation_cost_inr: 450000.0
    },
    {
      id: "Human_BMS_Kitting",
      model: "Human_BMS_Wiring_Station",
      category: "human_station",
      dimensions: { L: 1.40, W: 0.90, H: 1.10 },
      clearances: { front: 1.00, back: 0.40, left: 0.40, right: 0.40 },
      approach_speed_m_s: 1.6,
      x: 9.5, y: 2.0, theta: 0.0,
      relocation_cost_inr: 40000.0
    },
    {
      id: "Vision_Inspection_EOL",
      model: "Vision_EOL_Inspection",
      category: "inspection",
      dimensions: { L: 1.40, W: 0.90, H: 1.30 },
      clearances: { front: 0.80, back: 0.50, left: 0.40, right: 0.40 },
      x: 12.0, y: 5.0, theta: 0.0,
      relocation_cost_inr: 90000.0
    }
  ],
  part_routings: [],
  robot_tasks: [
    {
      robot_id: "Robot_Stacking",
      sequence: [
        { from: "Cell_Feeder_OCV", to: "Module_Stack_Fixture", process_s: 4.5 },
        { from: "Module_Stack_Fixture", to: "Cell_Feeder_OCV", process_s: 1.5 }
      ]
    },
    {
      robot_id: "Cobot_BMS_Fastener",
      sequence: [
        { from: "Module_Stack_Fixture", to: "Vision_Inspection_EOL", process_s: 6.0 },
        { from: "Vision_Inspection_EOL", to: "Module_Stack_Fixture", process_s: 2.0 }
      ]
    }
  ],
  safety_rules: [
    { tag_a: "laser_class4", tag_b: "human_station", min_distance_m: 3.0 }
  ],
  capital_budget_inr: 2000000.0
};
