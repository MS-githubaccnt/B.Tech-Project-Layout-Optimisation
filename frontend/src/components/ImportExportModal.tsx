import React, { useState } from 'react';
import { ProjectConfig } from '../types';
import { DEFAULT_CMS_CONFIG, DEFAULT_ROBOTIC_CONFIG } from '../defaultData';
import {
  X,
  FileCode,
  Download,
  Upload,
  Check,
  Table,
  FileSpreadsheet,
  Info,
  Layers,
  ArrowRight,
  AlertCircle
} from 'lucide-react';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ProjectConfig;
  onImportConfig: (newConfig: ProjectConfig) => void;
}

type TabType = 'json' | 'csv' | 'dxf' | 'spec_guide';

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  config,
  onImportConfig
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('json');

  // JSON Tab State
  const [jsonText, setJsonText] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // CSV Tab State
  const [machinesCsv, setMachinesCsv] = useState<string>(
    "id,name,category,length,width,height,clear_front,clear_back,clear_left,clear_right,noise_db,x,y,theta,fixed\n" +
    "VMC_01,Haas_VF2,vmc,2.57,2.24,2.57,1.20,0.90,0.60,0.60,78.0,6.0,5.0,0.0,false\n" +
    "VMC_02,Haas_VF2,vmc,2.57,2.24,2.57,1.20,0.90,0.60,0.60,78.0,6.0,10.0,0.0,false\n" +
    "CNC_01,Haas_ST20,cnc_turning,3.18,1.96,1.98,1.20,0.80,0.60,1.20,76.0,14.0,5.0,0.0,false\n" +
    "Grinder_01,Grinder_Cyl,grinder,2.40,1.80,1.80,1.00,0.80,0.50,0.50,86.0,24.0,5.0,0.0,false\n" +
    "CMM_01,Mitutoyo_CMM,cmm,2.00,1.80,2.20,1.20,0.80,0.80,0.80,62.0,20.0,18.0,0.0,false"
  );
  const [routingsCsv, setRoutingsCsv] = useState<string>(
    "part_id,annual_demand,batch_size,sequence\n" +
    "Gear_Shaft_A1,18000,50,CNC_01 -> VMC_01 -> Grinder_01 -> CMM_01\n" +
    "Brake_Disc_B2,24000,80,CNC_01 -> Grinder_01\n" +
    "Motor_Housing_C3,12000,40,VMC_02 -> CMM_01"
  );
  const [plotW, setPlotW] = useState<number>(35.0);
  const [plotL, setPlotL] = useState<number>(25.0);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [isCsvLoading, setIsCsvLoading] = useState<boolean>(false);

  // DXF Tab State
  const [dxfText, setDxfText] = useState<string>('');
  const [dxfFileName, setDxfFileName] = useState<string>('');
  const [dxfError, setDxfError] = useState<string | null>(null);
  const [isDxfLoading, setIsDxfLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  // JSON Export Handlers
  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `unit_layout_${config.project_mode.toLowerCase()}.json`);
    dlAnchorElem.click();
  };

  const handleDownloadJsonTemplate = () => {
    fetch('http://localhost:8000/api/layout/templates/json')
      .then(r => r.json())
      .then(data => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "standard_facility_template.json");
        dlAnchorElem.click();
      })
      .catch(() => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(DEFAULT_CMS_CONFIG, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "standard_facility_template.json");
        dlAnchorElem.click();
      });
  };

  const handleDownloadCsvTemplates = () => {
    // Machines template
    const mStr = "data:text/csv;charset=utf-8," + encodeURIComponent(machinesCsv);
    const mElem = document.createElement('a');
    mElem.setAttribute("href", mStr);
    mElem.setAttribute("download", "machines_template.csv");
    mElem.click();

    // Routings template
    const rStr = "data:text/csv;charset=utf-8," + encodeURIComponent(routingsCsv);
    const rElem = document.createElement('a');
    rElem.setAttribute("href", rStr);
    rElem.setAttribute("download", "routings_template.csv");
    rElem.click();
  };

  // JSON Import Submit
  const handleImportJsonSubmit = () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.plot || !parsed.entities) {
        throw new Error("Invalid schema: JSON must contain 'plot' and 'entities' attributes.");
      }
      onImportConfig(parsed);
      onClose();
    } catch (e: any) {
      setJsonError(e.message || "Failed to parse JSON specification.");
    }
  };

  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          setJsonText(event.target.result);
        }
      };
    }
  };

  // CSV Import Submit
  const handleImportCsvSubmit = async () => {
    setCsvError(null);
    setIsCsvLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/layout/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machines_csv: machinesCsv,
          routings_csv: routingsCsv,
          plot_width: plotW,
          plot_length: plotL,
          project_mode: config.project_mode,
          project_name: "Imported CSV Shopfloor"
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to parse CSV layout.");
      }

      const importedConfig: ProjectConfig = await response.json();
      onImportConfig(importedConfig);
      onClose();
    } catch (e: any) {
      setCsvError(e.message || "Error importing CSV.");
    } finally {
      setIsCsvLoading(false);
    }
  };

  // DXF Import Submit
  const handleDxfFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDxfError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setDxfFileName(file.name);
      const reader = new FileReader();
      reader.readAsText(file, "UTF-8");
      reader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          setDxfText(event.target.result);
        }
      };
    }
  };

  const handleImportDxfSubmit = async () => {
    if (!dxfText.trim()) return;
    setDxfError(null);
    setIsDxfLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/layout/import-dxf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dxf_text: dxfText,
          project_mode: config.project_mode,
          project_name: dxfFileName || "Imported AutoCAD Layout"
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to parse DXF drawing.");
      }

      const importedConfig: ProjectConfig = await response.json();
      onImportConfig(importedConfig);
      onClose();
    } catch (e: any) {
      setDxfError(e.message || "Error parsing DXF drawing. Ensure layers BOUNDARY and MACHINES exist.");
    } finally {
      setIsDxfLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1c1f24] border border-[#2d3239] rounded-lg shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col text-slate-200">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#2d3239] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileCode className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold tracking-wide uppercase text-white">
              Unit Layout Specification & Import Center
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#282c34]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 px-5 pt-3 border-b border-[#2d3239] bg-[#16181d] text-xs">
          <button
            onClick={() => setActiveTab('json')}
            className={`flex items-center space-x-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'json'
                ? 'border-orange-500 text-white bg-[#1c1f24]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Standard JSON Specification</span>
          </button>

          <button
            onClick={() => setActiveTab('csv')}
            className={`flex items-center space-x-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'csv'
                ? 'border-orange-500 text-white bg-[#1c1f24]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Tabular CSV (Excel / MES)</span>
          </button>

          <button
            onClick={() => setActiveTab('dxf')}
            className={`flex items-center space-x-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'dxf'
                ? 'border-orange-500 text-white bg-[#1c1f24]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>AutoCAD DXF Layers</span>
          </button>

          <button
            onClick={() => setActiveTab('spec_guide')}
            className={`flex items-center space-x-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'spec_guide'
                ? 'border-orange-500 text-white bg-[#1c1f24]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Format Standard Guide</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* TAB 1: JSON SPECIFICATION */}
          {activeTab === 'json' && (
            <div className="space-y-4">
              <div className="bg-[#16181d] p-3 rounded border border-[#2d3239] flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Full Digital Twin Layout Schema</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Defines shopfloor polygon boundary, columns, docks, equipment footprints, clearances, and process flows.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadJsonTemplate}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-[#282c34] hover:bg-[#323842] border border-[#3e444e] rounded text-slate-200 text-xs font-medium"
                >
                  <Download className="w-3 h-3 text-orange-400" />
                  <span>Download JSON Template</span>
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Upload .json File
                </label>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleJsonFileUpload}
                  className="block w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:bg-[#282c34] file:text-slate-200 hover:file:bg-[#323842]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Or Paste JSON Schema
                </label>
                <textarea
                  rows={8}
                  placeholder="Paste { 'project_name': ..., 'plot': { 'boundary': [...] }, 'entities': [...] } here..."
                  value={jsonText}
                  onChange={e => setJsonText(e.target.value)}
                  className="w-full bg-[#16181d] border border-[#2d3239] rounded p-2.5 text-white font-mono text-[11px] focus:outline-none focus:border-orange-500"
                />
                {jsonError && (
                  <div className="mt-1.5 p-2 bg-red-950/40 border border-red-800/60 rounded text-red-300 text-[11px] flex items-center space-x-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{jsonError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#282c34] hover:bg-[#323842] border border-[#3e444e] rounded text-slate-300"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Active Layout (.json)</span>
                </button>

                <button
                  type="button"
                  onClick={handleImportJsonSubmit}
                  disabled={!jsonText.trim()}
                  className="flex items-center space-x-1.5 px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold rounded shadow"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Load JSON Layout</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: CSV TABULAR */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              <div className="bg-[#16181d] p-3 rounded border border-[#2d3239] flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Standard Industrial Equipment & Routing Tables</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Import equipment list (dimensions, clearances, noise) and process sequence routings from Excel or ERP.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadCsvTemplates}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-[#282c34] hover:bg-[#323842] border border-[#3e444e] rounded text-slate-200 text-xs font-medium"
                >
                  <Download className="w-3 h-3 text-orange-400" />
                  <span>Download Starter CSVs</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono text-slate-300 mb-1">Hall Width (m)</label>
                  <input
                    type="number"
                    value={plotW}
                    onChange={e => setPlotW(parseFloat(e.target.value) || 30.0)}
                    className="w-full bg-[#16181d] border border-[#2d3239] rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-300 mb-1">Hall Length (m)</label>
                  <input
                    type="number"
                    value={plotL}
                    onChange={e => setPlotL(parseFloat(e.target.value) || 20.0)}
                    className="w-full bg-[#16181d] border border-[#2d3239] rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  1. Equipment Master Table (machines.csv)
                </label>
                <div className="text-[10px] text-slate-400 mb-1.5 font-mono">
                  Columns: id, name, category, length, width, height, clear_front, clear_back, clear_left, clear_right, noise_db, x, y, theta, fixed
                </div>
                <textarea
                  rows={4}
                  value={machinesCsv}
                  onChange={e => setMachinesCsv(e.target.value)}
                  className="w-full bg-[#16181d] border border-[#2d3239] rounded p-2 text-white font-mono text-[10px] focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  2. Part Routing Sequences (routings.csv - Optional for Mode A)
                </label>
                <div className="text-[10px] text-slate-400 mb-1.5 font-mono">
                  Columns: part_id, annual_demand, batch_size, sequence (separated by -&gt;)
                </div>
                <textarea
                  rows={3}
                  value={routingsCsv}
                  onChange={e => setRoutingsCsv(e.target.value)}
                  className="w-full bg-[#16181d] border border-[#2d3239] rounded p-2 text-white font-mono text-[10px] focus:outline-none focus:border-orange-500"
                />
              </div>

              {csvError && (
                <div className="p-2 bg-red-950/40 border border-red-800/60 rounded text-red-300 text-[11px] flex items-center space-x-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{csvError}</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleImportCsvSubmit}
                  disabled={isCsvLoading || !machinesCsv.trim()}
                  className="flex items-center space-x-1.5 px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold rounded shadow"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{isCsvLoading ? 'Parsing...' : 'Parse & Load CSV Layout'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DXF IMPORT */}
          {activeTab === 'dxf' && (
            <div className="space-y-4">
              <div className="bg-[#16181d] p-3 rounded border border-[#2d3239]">
                <div className="font-semibold text-white">AutoCAD / LibreCAD DXF Layer Standard</div>
                <div className="text-[11px] text-slate-400 mt-1 space-y-1">
                  <div>Ensure your 2D CAD floorplan organizes geometry onto the following designated layers:</div>
                  <ul className="list-disc list-inside font-mono text-[10px] text-slate-300 pl-1 space-y-0.5">
                    <li><strong className="text-orange-400">BOUNDARY</strong>: Closed Polyline outlining shopfloor outer perimeter.</li>
                    <li><strong className="text-orange-400">OBSTACLES</strong>: Polylines or Circles for building pillars, stairwells, and no-go zones.</li>
                    <li><strong className="text-orange-400">MACHINES</strong>: Rectangles or Polylines for equipment structural footprints.</li>
                    <li><strong className="text-orange-400">DOCKS</strong>: Points or inserts for inbound/outbound material docks.</li>
                    <li><strong className="text-orange-400">EXITS</strong>: Points for emergency fire egress doors.</li>
                  </ul>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Select AutoCAD .dxf File
                </label>
                <input
                  type="file"
                  accept=".dxf"
                  onChange={handleDxfFileUpload}
                  className="block w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:bg-[#282c34] file:text-slate-200 hover:file:bg-[#323842]"
                />
                {dxfFileName && (
                  <div className="mt-1 text-[11px] text-emerald-400 flex items-center space-x-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>Loaded: {dxfFileName}</span>
                  </div>
                )}
              </div>

              {dxfError && (
                <div className="p-2 bg-red-950/40 border border-red-800/60 rounded text-red-300 text-[11px] flex items-center space-x-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{dxfError}</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleImportDxfSubmit}
                  disabled={isDxfLoading || !dxfText.trim()}
                  className="flex items-center space-x-1.5 px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold rounded shadow"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{isDxfLoading ? 'Processing CAD Layers...' : 'Extract & Load CAD Layout'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: FORMAT STANDARD GUIDE */}
          {activeTab === 'spec_guide' && (
            <div className="space-y-4">
              <div className="bg-[#16181d] p-3 rounded border border-[#2d3239]">
                <div className="font-semibold text-white uppercase text-[11px] tracking-wider mb-1">
                  Standard Unit Layout Data Model Specification
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  The optimization engine models the physical factory unit as a continuous 2D/3D topological space with geometric, acoustic, material handling, and safety constraints. Below is the specification reference:
                </p>
              </div>

              <div className="border border-[#2d3239] rounded overflow-hidden">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-[#16181d] text-slate-300 border-b border-[#2d3239]">
                    <tr>
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Type / Units</th>
                      <th className="py-2 px-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2d3239] text-slate-300">
                    <tr>
                      <td className="py-1.5 px-3 text-orange-300">plot.boundary</td>
                      <td className="py-1.5 px-3 text-slate-400">[[x,y], ...] (m)</td>
                      <td className="py-1.5 px-3">Convex or non-convex polygon vertices of the facility boundary.</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-orange-300">plot.no_go_zones</td>
                      <td className="py-1.5 px-3 text-slate-400">Array of Polygons</td>
                      <td className="py-1.5 px-3">Building columns, vertical pillars, stairs, and forbidden corridors.</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-orange-300">plot.docks</td>
                      <td className="py-1.5 px-3 text-slate-400">Array of Points</td>
                      <td className="py-1.5 px-3">Inbound raw material receiving bays and outbound shipping docks.</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-orange-300">plot.emergency_exits</td>
                      <td className="py-1.5 px-3 text-slate-400">Array of Points</td>
                      <td className="py-1.5 px-3">Fire egress exit doors evaluated for ≤30m OSHA / NBC compliance.</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-orange-300">entities.dimensions</td>
                      <td className="py-1.5 px-3 text-slate-400">L, W, H (meters)</td>
                      <td className="py-1.5 px-3">Machine footprint dimensions.</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-orange-300">entities.clearances</td>
                      <td className="py-1.5 px-3 text-slate-400">front, back, left, right (m)</td>
                      <td className="py-1.5 px-3">Asymmetric operator access and maintenance swing zones.</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-orange-300">entities.utilities</td>
                      <td className="py-1.5 px-3 text-slate-400">List[str]</td>
                      <td className="py-1.5 px-3">Required drops: power_3ph, compressed_air, exhaust, chiller.</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-orange-300">entities.noise_lw_db</td>
                      <td className="py-1.5 px-3 text-slate-400">Float (dB Sound Power)</td>
                      <td className="py-1.5 px-3">Acoustic power for continuous 2D hemispherical sound propagation.</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-orange-300">entities.kinematics</td>
                      <td className="py-1.5 px-3 text-slate-400">r_min, r_max, speed</td>
                      <td className="py-1.5 px-3">For robots: inner reach limit, max reach radius, and ISO 10218 SSM.</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-3 text-orange-300">part_routings</td>
                      <td className="py-1.5 px-3 text-slate-400">Part & Machine list</td>
                      <td className="py-1.5 px-3">Annual demand, batch size, and operational sequence (Mode A CMS).</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="h-px bg-[#2d3239]" />

          {/* Quick Presets */}
          <div>
            <div className="font-semibold text-white uppercase text-[10px] tracking-wider mb-2">
              Standard Factory Benchmark Datasets
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { onImportConfig(DEFAULT_CMS_CONFIG); onClose(); }}
                className="p-2.5 bg-[#16181d] border border-[#2d3239] hover:border-orange-500 rounded text-left transition-colors"
              >
                <div className="font-semibold text-white flex items-center space-x-1.5">
                  <span className="font-mono text-[9px] bg-black/40 px-1 py-0.2 rounded text-orange-200">A</span>
                  <span>Tier-2 Automotive SME (CMS)</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">18 machines, 35×25m L-shaped hall, 3 cells</div>
              </button>

              <button
                type="button"
                onClick={() => { onImportConfig(DEFAULT_ROBOTIC_CONFIG); onClose(); }}
                className="p-2.5 bg-[#16181d] border border-[#2d3239] hover:border-orange-500 rounded text-left transition-colors"
              >
                <div className="font-semibold text-white flex items-center space-x-1.5">
                  <span className="font-mono text-[9px] bg-black/40 px-1 py-0.2 rounded text-orange-200">B</span>
                  <span>EV Battery Collaborative Cell</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">3 robots, 2 human stations, ISO 10218 SSM</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
