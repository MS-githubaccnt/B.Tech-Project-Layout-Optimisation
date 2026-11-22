import React, { useState } from 'react';
import { PlotSchema, NoGoZone, Dock, EmergencyExit, UtilityDrop } from '../types';
import { X, Sliders, Plus, Trash2, Shield, Zap, DoorOpen, Truck } from 'lucide-react';

interface FacilitySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  plot: PlotSchema;
  onUpdatePlot: (updatedPlot: PlotSchema) => void;
}

export const FacilitySettingsModal: React.FC<FacilitySettingsModalProps> = ({
  isOpen,
  onClose,
  plot,
  onUpdatePlot
}) => {
  // Approximate length & width from current bounding box
  const xs = plot.boundary.map(p => p[0]);
  const ys = plot.boundary.map(p => p[1]);
  const currentW = Math.max(...xs) - Math.min(...xs);
  const currentH = Math.max(...ys) - Math.min(...ys);

  const [hallLength, setHallLength] = useState<number>(currentW || 30.0);
  const [hallWidth, setHallWidth] = useState<number>(currentH || 20.0);
  const [minAisleWidth, setMinAisleWidth] = useState<number>(plot.min_aisle_width_m || 3.0);

  const [pillars, setPillars] = useState<NoGoZone[]>(plot.no_go_zones || []);
  const [docks, setDocks] = useState<Dock[]>(plot.docks || []);
  const [exits, setExits] = useState<EmergencyExit[]>(plot.emergency_exits || []);
  const [utilityDrops, setUtilityDrops] = useState<UtilityDrop[]>(plot.utility_drops || []);

  if (!isOpen) return null;

  const handleSave = () => {
    // Reconstruct rectangular or preserve boundary shape
    const newBoundary: [number, number][] = [
      [0.0, 0.0],
      [hallLength, 0.0],
      [hallLength, hallWidth],
      [0.0, hallWidth]
    ];

    const updated: PlotSchema = {
      boundary: newBoundary,
      no_go_zones: pillars,
      docks: docks,
      emergency_exits: exits,
      utility_drops: utilityDrops,
      min_aisle_width_m: minAisleWidth
    };

    onUpdatePlot(updated);
    onClose();
  };

  const addPillar = () => {
    const pIdx = pillars.length + 1;
    const px = Math.round(hallLength * 0.4);
    const py = Math.round(hallWidth * 0.5);
    const sz = 0.8;
    const newPillar: NoGoZone = {
      id: `Pillar_${pIdx}`,
      polygon: [
        [px, py],
        [px + sz, py],
        [px + sz, py + sz],
        [px, py + sz]
      ]
    };
    setPillars([...pillars, newPillar]);
  };

  const removePillar = (idx: number) => {
    setPillars(pillars.filter((_, i) => i !== idx));
  };

  const addDock = () => {
    const dIdx = docks.length + 1;
    const newDock: Dock = {
      id: `Dock_${dIdx}`,
      point: [0.0, Math.round(hallWidth * 0.5)],
      type: 'receiving'
    };
    setDocks([...docks, newDock]);
  };

  const removeDock = (idx: number) => {
    setDocks(docks.filter((_, i) => i !== idx));
  };

  const addExit = () => {
    const eIdx = exits.length + 1;
    const newExit: EmergencyExit = {
      id: `Exit_${eIdx}`,
      point: [Math.round(hallLength * 0.5), hallWidth]
    };
    setExits([...exits, newExit]);
  };

  const removeExit = (idx: number) => {
    setExits(exits.filter((_, i) => i !== idx));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1c1f24] border border-[#2d3239] rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col text-slate-200">
        <div className="px-5 py-3.5 border-b border-[#2d3239] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold tracking-wide uppercase text-white">
              Facility Hall Geometry & Civil Infrastructure
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#282c34]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5 text-xs">
          {/* Hall Dimensions */}
          <div className="p-3 bg-[#16181d] border border-[#2d3239] rounded-md space-y-3">
            <div className="font-semibold text-white uppercase text-[11px] tracking-wider">
              1. Shop Floor Perimeter Boundaries
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Hall Length X (m)</label>
                <input
                  type="number"
                  step="0.5"
                  value={hallLength}
                  onChange={e => setHallLength(Number(e.target.value))}
                  className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Hall Width Y (m)</label>
                <input
                  type="number"
                  step="0.5"
                  value={hallWidth}
                  onChange={e => setHallWidth(Number(e.target.value))}
                  className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Min Forklift Aisle (m)</label>
                <input
                  type="number"
                  step="0.2"
                  value={minAisleWidth}
                  onChange={e => setMinAisleWidth(Number(e.target.value))}
                  className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2.5 py-1.5 text-white font-mono"
                />
              </div>
            </div>
            <div className="text-[11px] text-slate-400">
              Total usable floor area: <b className="text-white">{(hallLength * hallWidth).toFixed(1)} m²</b>
            </div>
          </div>

          {/* Structural Columns / Pillars */}
          <div className="p-3 bg-[#16181d] border border-[#2d3239] rounded-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white uppercase text-[11px] tracking-wider">
                2. Structural Columns / No-Go Pillars ({pillars.length})
              </span>
              <button
                type="button"
                onClick={addPillar}
                className="flex items-center space-x-1 px-2 py-1 bg-[#282c34] hover:bg-[#323842] text-slate-200 rounded text-[11px]"
              >
                <Plus className="w-3 h-3" />
                <span>Add Column</span>
              </button>
            </div>

            {pillars.length === 0 ? (
              <div className="text-slate-400 text-[11px]">No structural columns defined.</div>
            ) : (
              <div className="space-y-2">
                {pillars.map((pil, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-[#1c1f24] p-2 rounded border border-[#2d3239]">
                    <span className="font-mono text-white">{pil.id}</span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      Pos: ({pil.polygon[0][0].toFixed(1)}m, {pil.polygon[0][1].toFixed(1)}m)
                    </span>
                    <button
                      type="button"
                      onClick={() => removePillar(idx)}
                      className="p-1 text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Docks & Emergency Doors */}
          <div className="p-3 bg-[#16181d] border border-[#2d3239] rounded-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white uppercase text-[11px] tracking-wider">
                3. Material Docks & NFPA Emergency Exits
              </span>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={addDock}
                  className="flex items-center space-x-1 px-2 py-1 bg-[#282c34] hover:bg-[#323842] text-slate-200 rounded text-[11px]"
                >
                  <Truck className="w-3 h-3" />
                  <span>+ Dock</span>
                </button>
                <button
                  type="button"
                  onClick={addExit}
                  className="flex items-center space-x-1 px-2 py-1 bg-[#282c34] hover:bg-[#323842] text-slate-200 rounded text-[11px]"
                >
                  <DoorOpen className="w-3 h-3 text-emerald-400" />
                  <span>+ Exit</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Docks ({docks.length})</span>
                {docks.map((d, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-[#1c1f24] p-1.5 rounded border border-[#2d3239]">
                    <span className="font-mono">{d.id}</span>
                    <span className="text-[10px] text-slate-400">({d.point[0]}m, {d.point[1]}m)</span>
                    <button onClick={() => removeDock(idx)} className="text-slate-400 hover:text-red-400 p-0.5">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Emergency Exits ({exits.length})</span>
                {exits.map((ex, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-[#1c1f24] p-1.5 rounded border border-[#2d3239]">
                    <span className="font-mono text-emerald-400">{ex.id}</span>
                    <span className="text-[10px] text-slate-400">({ex.point[0]}m, {ex.point[1]}m)</span>
                    <button onClick={() => removeExit(idx)} className="text-slate-400 hover:text-red-400 p-0.5">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[#2d3239] flex justify-end space-x-2 bg-[#16181d]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-[#282c34] hover:bg-[#323842] text-slate-300 rounded font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded"
          >
            Apply Layout Changes
          </button>
        </div>
      </div>
    </div>
  );
};
