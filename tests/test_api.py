import os
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.core.models import ProjectMode

client = TestClient(app)


def test_api_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert "CELLULAR_CMS" in data["supported_modes"]


def test_api_catalogs():
    resp = client.get("/api/catalogs")
    assert resp.status_code == 200
    data = resp.json()
    assert "mode_a_cms" in data
    assert "mode_b_robotic" in data
    assert len(data["mode_a_cms"]) >= 10
    assert len(data["mode_b_robotic"]) >= 10

    # Test adding a custom machine to the catalog
    custom_machine = {
        "model": "Test_Custom_Press",
        "category": "forming",
        "label": "Test 150T Press",
        "dimensions": {"L": 3.0, "W": 2.0, "H": 2.5},
        "clearances": {"front": 1.5, "back": 0.8, "left": 0.5, "right": 0.5},
        "utilities": ["power_3ph"],
        "noise_lw_db": 82.0
    }
    post_resp = client.post("/api/catalogs/custom", json=custom_machine)
    assert post_resp.status_code == 200
    assert post_resp.json()["status"] == "success"

    # Verify custom machine appears
    resp_updated = client.get("/api/catalogs")
    assert any(m["model"] == "Test_Custom_Press" for m in resp_updated.json().get("custom_machines", []))

    # Test deleting custom machine
    del_resp = client.delete("/api/catalogs/custom/Test_Custom_Press")
    assert del_resp.status_code == 200


def test_api_benchmarks():
    resp = client.get("/api/benchmarks")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["scenarios"]) >= 2

    # Load Scenario A
    resp_a = client.get("/api/benchmarks/scenario_a_cms")
    assert resp_a.status_code == 200
    sc_a = resp_a.json()
    assert sc_a["project_mode"] == "CELLULAR_CMS"
    assert len(sc_a["entities"]) >= 8

    # Load Scenario B
    resp_b = client.get("/api/benchmarks/scenario_b_ev")
    assert resp_b.status_code == 200
    sc_b = resp_b.json()
    assert sc_b["project_mode"] == "ROBOTIC_WORKCELL"


def test_api_evaluate():
    sc_a = client.get("/api/benchmarks/scenario_a_cms").json()
    payload = {
        "config": sc_a,
        "entities": sc_a["entities"],
        "compute_noise": True
    }
    resp = client.post("/api/evaluate", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "z1_score" in data
    assert "z2_score" in data
    assert "noise_field" in data
    assert data["calc_time_ms"] < 200


def test_api_cell_formation():
    payload = {
        "matrix": [
            [1, 0, 1, 0],
            [0, 1, 0, 1],
            [1, 0, 1, 0],
            [0, 1, 0, 1]
        ],
        "machine_names": ["M1", "M2", "M3", "M4"],
        "part_names": ["P1", "P2", "P3", "P4"],
        "num_cells": 2,
        "algorithm": "GA"
    }
    resp = client.post("/api/cell-formation", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["grouping_efficacy"] > 0.5
    assert len(data["cell_boundaries"]) == 2


def test_api_optimize_and_exports():
    sc_b = client.get("/api/benchmarks/scenario_b_ev").json()
    opt_payload = {
        "config": sc_b,
        "population_size": 10,
        "generations": 5,
        "enable_local_repair": True
    }
    resp = client.post("/api/optimize", json=opt_payload)
    assert resp.status_code == 200
    res_data = resp.json()
    assert len(res_data["pareto_front"]) >= 1

    candidate = res_data["pareto_front"][0]

    # Test Compliance API
    comp_resp = client.post("/api/compliance", json={"config": sc_b, "entities": candidate["entities"]})
    assert comp_resp.status_code == 200
    assert comp_resp.json()["overall_score"] >= 0.0

    # Test Simulation API
    sim_resp = client.post("/api/simulate", json={"config": sc_b, "entities": candidate["entities"], "sim_hours": 1.0})
    assert sim_resp.status_code == 200
    assert sim_resp.json()["throughput_per_hour"] >= 0.0

    # Test Brownfield ROI API
    roi_resp = client.post("/api/brownfield/roi", json={"config": sc_b, "unoptimized_z1": 50000.0, "max_k_relocate": 5})
    assert roi_resp.status_code == 200
    assert len(roi_resp.json()["roi_curve"]) == 6

    # Test DXF Export API
    dxf_resp = client.post("/api/export/dxf", json={"config": sc_b, "candidate": candidate})
    assert dxf_resp.status_code == 200
    assert len(dxf_resp.content) > 1000

    # Test PDF Export API
    pdf_resp = client.post("/api/export/pdf", json={"config": sc_b, "candidate": candidate})
    assert pdf_resp.status_code == 200
    assert len(pdf_resp.content) > 1000


def test_api_import_csv_and_dxf():
    # 1. Test CSV Import
    csv_payload = {
        "machines_csv": "id,name,category,length,width,height,clear_front,clear_back,clear_left,clear_right,noise_db,x,y,theta,fixed\nM01,CNC,cnc,3.0,2.0,2.0,1.0,0.8,0.5,0.5,75,5,5,0,false\nM02,VMC,vmc,2.5,2.0,2.5,1.0,0.8,0.5,0.5,78,12,5,0,false",
        "routings_csv": "part_id,annual_demand,batch_size,sequence\nP1,5000,50,M01->M02",
        "plot_width": 30.0,
        "plot_length": 20.0
    }
    resp = client.post("/api/layout/import-csv", json=csv_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["entities"]) == 2
    assert len(data["part_routings"]) == 1

    # 2. Test Templates
    tmpl_resp = client.get("/api/layout/templates/json")
    assert tmpl_resp.status_code == 200
    assert "plot" in tmpl_resp.json()

    csv_tmpl_resp = client.get("/api/layout/templates/machines_csv")
    assert csv_tmpl_resp.status_code == 200
    assert b"clear_front" in csv_tmpl_resp.content
