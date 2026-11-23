import os
import pytest
import numpy as np
from shapely.geometry import Polygon, Point

from backend.core.models import (
    LayoutEntity,
    PlotSchema,
    NoGoZone,
    Dock,
    EmergencyExit,
    UtilityDrop,
    ProjectConfig,
    ProjectMode,
    PartRouting,
    PartOperation,
    RobotTask,
    RobotTaskStep,
    Dimensions,
    Clearances,
    RobotKinematics,
    OptimizationRequest
)
from backend.core.geometry import (
    create_base_polygon,
    create_clearance_polygon,
    create_annular_reach_polygon,
    create_sweet_spot_annulus,
    compute_layout_overlaps,
    compute_boundary_violations,
    compute_noise_field_grid,
    compute_scanner_isovist,
    force_directed_repair,
    transform_ports
)
from backend.core.routing import NavigationGrid, compute_steiner_utility_network
from backend.core.compliance import run_compliance_audit
from backend.core.simulation import run_cms_simulation, run_robotic_simulation
from backend.core.optimizer import run_nsga2_optimization
from backend.plugins.cms.cell_formation import run_roc, run_bea, run_hybrid_ga
from backend.plugins.cms.cell_templates import build_cell_layout, CellTemplateType
from backend.ml.graph_builder import build_layout_graph
from backend.ml.gnn_surrogate import LayoutGATv2Surrogate, SurrogateManager
from backend.export.dxf_exporter import export_layout_to_dxf
from backend.export.pdf_report import generate_executive_pdf_report


@pytest.fixture
def sample_config():
    plot = PlotSchema(
        boundary=[[0, 0], [25, 0], [25, 18], [0, 18]],
        no_go_zones=[NoGoZone(id="Pillar1", polygon=[[8, 8], [9, 8], [9, 9], [8, 9]])],
        docks=[
            Dock(id="Dock_In", point=[0, 4], type="receiving"),
            Dock(id="Dock_Out", point=[25, 14], type="shipping")
        ],
        emergency_exits=[EmergencyExit(id="Exit1", point=[12, 18])],
        utility_drops=[UtilityDrop(id="PowerDrop", point=[0, 10], utility="power_3ph")],
        min_aisle_width_m=3.0
    )

    entities = [
        LayoutEntity(
            id="VMC_01",
            model="Haas_VF2",
            category="vmc",
            dimensions=Dimensions(L=2.5, W=2.2, H=2.5),
            clearances=Clearances(front=1.2, back=0.8, left=0.6, right=0.6),
            utilities=["power_3ph"],
            noise_lw_db=78.0,
            x=5.0, y=5.0, theta=0.0
        ),
        LayoutEntity(
            id="CNC_01",
            model="Haas_ST20",
            category="cnc_turning",
            dimensions=Dimensions(L=3.0, W=2.0, H=2.0),
            clearances=Clearances(front=1.2, back=0.8, left=0.6, right=1.0),
            utilities=["power_3ph"],
            noise_lw_db=76.0,
            x=12.0, y=5.0, theta=0.0
        ),
        LayoutEntity(
            id="Grinder_01",
            model="Grinder_Cyl",
            category="grinder",
            dimensions=Dimensions(L=2.4, W=1.8, H=1.8),
            hazard_tags=["dust"],
            noise_lw_db=85.0,
            x=18.0, y=5.0, theta=0.0
        ),
        LayoutEntity(
            id="CMM_01",
            model="Mitutoyo_CMM",
            category="cmm",
            dimensions=Dimensions(L=2.0, W=1.8, H=2.0),
            sensitive_tags=["dust_sensitive"],
            noise_lw_db=62.0,
            x=18.0, y=14.0, theta=0.0
        )
    ]

    routings = [
        PartRouting(
            part_id="Shaft_A",
            annual_demand=12000,
            batch_size=50,
            sequence=[
                PartOperation(machine_type="Haas_VF2", cycle_min=3.0),
                PartOperation(machine_type="Haas_ST20", cycle_min=2.5),
                PartOperation(machine_type="Grinder_Cyl", cycle_min=2.0)
            ]
        )
    ]

    return ProjectConfig(
        project_name="Test CMS Layout",
        project_mode=ProjectMode.CELLULAR_CMS,
        plot=plot,
        entities=entities,
        part_routings=routings,
        safety_rules=[{"tag_a": "dust", "tag_b": "dust_sensitive", "min_distance_m": 5.0}]
    )


def test_geometry_and_clearances(sample_config):
    e = sample_config.entities[0]
    base_poly = create_base_polygon(e)
    clear_poly = create_clearance_polygon(e)

    assert base_poly.is_valid
    assert clear_poly.is_valid
    assert clear_poly.area > base_poly.area
    assert clear_poly.contains(base_poly.centroid)

    # I/O Port transformation
    ports = transform_ports(e)
    assert len(ports) >= 1
    wx, wy, ptype = ports[0]
    assert isinstance(wx, float) and isinstance(wy, float)


def test_robot_reach_kinematics():
    robot = LayoutEntity(
        id="Robot_UR10e",
        category="robot_6axis",
        dimensions=Dimensions(L=0.4, W=0.4, H=1.3),
        kinematics=RobotKinematics(r_min_m=0.25, r_max_m=1.30, axis1_deg_s=120.0),
        x=5.0, y=5.0
    )
    reach_poly = create_annular_reach_polygon(robot)
    sweet_poly = create_sweet_spot_annulus(robot)

    assert reach_poly is not None
    assert sweet_poly is not None
    assert reach_poly.area > sweet_poly.area

    # Test point at 0.8m is within sweet spot
    p_sweet = Point(5.8, 5.0)
    assert reach_poly.contains(p_sweet)
    assert sweet_poly.contains(p_sweet)

    # Test point at 0.1m is inside dead-zone
    p_dead = Point(5.1, 5.0)
    assert not reach_poly.contains(p_dead)


def test_force_directed_repair(sample_config):
    # Artificially overlap two entities
    test_ents = [e.model_copy(deep=True) for e in sample_config.entities]
    test_ents[0].x = 5.0
    test_ents[0].y = 5.0
    test_ents[1].x = 5.2  # Heavy overlap
    test_ents[1].y = 5.0

    overlap_before, _ = compute_layout_overlaps(test_ents, use_clearances=True)
    assert overlap_before > 0.5

    plot_poly = Polygon(sample_config.plot.boundary)
    repaired = force_directed_repair(test_ents, plot_poly, [], iterations=8, step_size=0.3)
    overlap_after, _ = compute_layout_overlaps(repaired, use_clearances=True)

    assert overlap_after < overlap_before


def test_routing_and_navigation(sample_config):
    plot_poly = Polygon(sample_config.plot.boundary)
    nav_grid = NavigationGrid(plot_poly, [], sample_config.entities, grid_res=1.0)
    
    start_pt = (2.0, 2.0)
    end_pt = (22.0, 15.0)
    dist, path = nav_grid.get_path_and_distance(start_pt, end_pt)

    assert dist > 0.0
    assert len(path) >= 2


def test_steiner_utility_routing(sample_config):
    plot_poly = Polygon(sample_config.plot.boundary)
    total_len, segments = compute_steiner_utility_network(
        plot_poly, sample_config.plot.utility_drops, sample_config.entities, "power_3ph"
    )
    assert total_len > 0.0
    assert len(segments) >= 1


def test_cell_formation_algorithms():
    mat = np.array([
        [1, 0, 1, 0],
        [0, 1, 0, 1],
        [1, 0, 1, 0],
        [0, 1, 0, 1]
    ])
    machines = ["M1", "M2", "M3", "M4"]
    parts = ["P1", "P2", "P3", "P4"]

    roc_res = run_roc(mat, machines, parts, num_cells=2)
    bea_res = run_bea(mat, machines, parts, num_cells=2)
    ga_res = run_hybrid_ga(mat, machines, parts, num_cells=2, pop_size=10, generations=5)

    assert roc_res.grouping_efficacy > 0.5
    assert bea_res.grouping_efficacy > 0.5
    assert ga_res.grouping_efficacy > 0.5


def test_cell_templates():
    ents = [
        LayoutEntity(id=f"M_{i}", dimensions=Dimensions(L=2.0, W=1.5, H=2.0))
        for i in range(4)
    ]
    u_cell = build_cell_layout(1, CellTemplateType.U_SHAPED, ents, (10, 10))
    lin_cell = build_cell_layout(2, CellTemplateType.LINEAR, ents, (10, 10))
    dbl_cell = build_cell_layout(3, CellTemplateType.DOUBLE_ROW, ents, (10, 10))

    assert len(u_cell.placed_entities) == 4
    assert len(lin_cell.placed_entities) == 4
    assert len(dbl_cell.placed_entities) == 4
    assert u_cell.composite_boundary.is_valid


def test_compliance_audit(sample_config):
    res = run_compliance_audit(
        sample_config.plot,
        sample_config.entities,
        sample_config.safety_rules,
        [],
        mode=sample_config.project_mode
    )
    assert isinstance(res.overall_passed, bool)
    assert res.overall_score >= 0.0
    assert len(res.details) >= 7
    assert hasattr(res, 'dgqa_custody_passed')
    assert hasattr(res, 'peso_qd_passed')
    assert hasattr(res, 'aerb_radiation_passed')
    assert hasattr(res, 'nbc_group_j_egress_passed')
    assert hasattr(res, 'is6922_vibration_isolation_passed')


def test_indian_defense_compliance_audits(sample_config):
    from backend.core.compliance import (
        evaluate_peso_explosives_qd,
        evaluate_dgqa_mrb_custody,
        evaluate_aerb_radiation_shielding,
        evaluate_is6922_vibration_isolation
    )
    from shapely.geometry import Polygon

    # 1. DGQA MRB Custody Check
    mrb_entity = LayoutEntity(
        id="MRB_01", category="storage", model="MRB_Quarantine_Cage",
        dimensions=Dimensions(L=3.0, W=2.0, H=2.4), x=10.0, y=10.0, is_mrb_bonded=True
    )
    passed_mrb, details_mrb = evaluate_dgqa_mrb_custody([mrb_entity])
    assert passed_mrb is True

    # 2. PESO Q-D Explosive Separation
    large_ordnance_plot = Polygon([[0, 0], [250, 0], [250, 250], [0, 250]])
    warhead_bay = LayoutEntity(
        id="Warhead_Bay", category="machine", dimensions=Dimensions(L=2.0, W=2.0, H=2.0),
        x=125.0, y=125.0, net_explosive_weight_kg=25.0
    )
    # Required D = 30 * (25)^(1/3) = ~87.7m. Distance to boundary is 125m > 87.7m -> PASS
    passed_peso, details_peso = evaluate_peso_explosives_qd(large_ordnance_plot, [warhead_bay], [])
    assert passed_peso is True

    # In a compact plot (40x30m), warhead at (20, 15) has 15m to boundary < 87.7m -> FAIL
    small_poly = Polygon([[0, 0], [40, 0], [40, 30], [0, 30]])
    compact_warhead = LayoutEntity(
        id="Warhead_Compact", category="machine", dimensions=Dimensions(L=2.0, W=2.0, H=2.0),
        x=20.0, y=15.0, net_explosive_weight_kg=25.0
    )
    failed_peso, _ = evaluate_peso_explosives_qd(small_poly, [compact_warhead], [])
    assert failed_peso is False

    # 3. AERB Radiography NDT Bunker Exclusion
    ndt_bunker = LayoutEntity(
        id="NDT_01", category="inspection", model="Waygate_NDT_Bunker",
        dimensions=Dimensions(L=3.8, W=3.2, H=2.8), x=5.0, y=5.0, is_aerb_radiological=True
    )
    operator_st = LayoutEntity(
        id="Op_01", category="human_station", dimensions=Dimensions(L=1.0, W=1.0, H=1.0),
        x=7.0, y=5.0  # within 5m
    )
    aerb_fail, _ = evaluate_aerb_radiation_shielding([ndt_bunker, operator_st])
    assert aerb_fail is False

    # 4. IS 6922 Vibration Isolation (Forge vs CMM)
    hammer = LayoutEntity(
        id="Hammer_01", category="forming", dimensions=Dimensions(L=4.0, W=4.0, H=4.0),
        x=5.0, y=5.0, vibration_class="HEAVY_FORGE", noise_lw_db=96.0
    )
    cmm = LayoutEntity(
        id="CMM_01", category="cmm", dimensions=Dimensions(L=2.0, W=2.0, H=2.0),
        x=8.0, y=5.0, vibration_class="SUB_MICRON_CMM"  # 3m < 7m
    )
    vib_fail, _ = evaluate_is6922_vibration_isolation([hammer, cmm])
    assert vib_fail is False


def test_simulations(sample_config):
    # Mode A SimPy DES
    sim_a = run_cms_simulation(sample_config.plot, sample_config.entities, sample_config.part_routings, sim_time_hours=1.0)
    assert sim_a.throughput_per_hour >= 0.0

    # Mode B SimPy DES
    robot_ent = LayoutEntity(
        id="R1", category="robot_6axis", dimensions=Dimensions(L=0.5, W=0.5, H=1.5),
        kinematics=RobotKinematics(r_min_m=0.3, r_max_m=1.5), x=3.0, y=3.0
    )
    f1 = LayoutEntity(id="F1", category="fixture", dimensions=Dimensions(L=1.0, W=1.0, H=1.0), x=2.0, y=3.0)
    f2 = LayoutEntity(id="F2", category="fixture", dimensions=Dimensions(L=1.0, W=1.0, H=1.0), x=4.0, y=3.0)
    task = RobotTask(robot_id="R1", sequence=[RobotTaskStep(**{"from": "F1", "to": "F2", "process_s": 0.5})])
    
    sim_b = run_robotic_simulation([robot_ent, f1, f2], [task], target_takt_s=10.0, sim_cycles=5)
    assert sim_b.bottleneck_cycle_time_s is not None


def test_gnn_surrogate(sample_config):
    graph = build_layout_graph(sample_config, sample_config.entities)
    assert graph.node_features.shape == (len(sample_config.entities), 14)
    assert graph.edge_attr.shape[1] == 5

    model = LayoutGATv2Surrogate()
    out = model(graph)
    assert out.shape == (2,)

    mgr = SurrogateManager()
    z1, z2 = mgr.predict_candidate(sample_config, sample_config.entities)
    assert z1 > 0.0 and z2 > 0.0


def test_dxf_and_pdf_exports(sample_config, tmp_path):
    # Optimization
    req = OptimizationRequest(config=sample_config, population_size=10, generations=5)
    resp = run_nsga2_optimization(req)
    assert len(resp.pareto_front) >= 1

    best_sol = resp.pareto_front[0]

    # DXF Export
    dxf_path = os.path.join(tmp_path, "test_layout.dxf")
    export_layout_to_dxf(sample_config, best_sol.entities, dxf_path)
    assert os.path.exists(dxf_path)
    assert os.path.getsize(dxf_path) > 1000

    # PDF Export
    pdf_path = os.path.join(tmp_path, "test_report.pdf")
    generate_executive_pdf_report(sample_config, best_sol, pdf_path)
    assert os.path.exists(pdf_path)
    assert os.path.getsize(pdf_path) > 2000
