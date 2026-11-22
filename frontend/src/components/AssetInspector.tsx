import React from 'react';
import { LayoutEntity } from '../types';
import { RotateCw, Pin, PinOff, Trash2, Sliders, Shield, Zap, AlertTriangle } from 'lucide-react';

interface AssetInspectorProps {
  entity: LayoutEntity | null;
  onUpdateEntity: (updated: LayoutEntity) => void;
  onDeleteEntity: (id: string) => void;
  onDeselect: () => void;
}

export const AssetInspector: React.FC<AssetInspectorProps> = ({
  entity,
  onUpdateEntity,
  onDeleteEntity,
  onDeselect
}) => {
  if (!entity) return null;

  const handleCoordChange = (field: 'x' | 'y' | 'theta', val: number) => {
    onUpdateEntity({ ...entity, [field]: val });
  };

  const handleDimChange = (dim: 'L' | 'W' | 'H', val: number) => {
    onUpdateEntity({
      ...entity,
      dimensions: { ...entity.dimensions, [dim]: val }
    });
  };

  const rotate90 = () => {
    const newTheta = (entity.theta + 90) % 360;
    onUpdateEntity({ ...entity, theta: newTheta });
  };

  const togglePin = () => {
    onUpdateEntity({ ...entity, is_pinned: !entity.is_pinned });
  };

  return (
    <div className="p-3.5 bg-[#16181d] border-b border-[#2d3239] text-xs text-slate-200">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center space-x-2">
          <span className="font-mono font-bold text-white text-sm">{entity.id}</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#282c34] text-slate-300 border border-[#3e444e]">
            {entity.model || entity.category}
          </span>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={togglePin}
            className={`p-1.5 rounded border transition-colors ${
              entity.is_pinned
                ? 'bg-amber-950/50 border-amber-600 text-amber-400'
                : 'bg-[#282c34] border-[#3e444e] text-slate-300 hover:text-white'
            }`}
            title={entity.is_pinned ? "Asset Pinned in Place" : "Pin Asset"}
          >
            {entity.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={rotate90}
            disabled={entity.is_pinned}
            className="p-1.5 rounded border border-[#3e444e] bg-[#282c34] text-slate-300 hover:text-white disabled:opacity-40"
            title="Rotate 90 deg"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDeleteEntity(entity.id)}
            className="p-1.5 rounded border border-red-900/50 bg-red-950/30 text-red-400 hover:bg-red-950/60"
            title="Delete from Floorplan"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Coordinate & Orientation Inputs */}
      <div className="grid grid-cols-3 gap-2 mb-2 font-mono">
        <div>
          <span className="text-[10px] text-slate-400">Centroid X (m)</span>
          <input
            type="number"
            step="0.1"
            value={entity.x}
            disabled={entity.is_pinned}
            onChange={e => handleCoordChange('x', Number(e.target.value))}
            className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white disabled:opacity-50"
          />
        </div>
        <div>
          <span className="text-[10px] text-slate-400">Centroid Y (m)</span>
          <input
            type="number"
            step="0.1"
            value={entity.y}
            disabled={entity.is_pinned}
            onChange={e => handleCoordChange('y', Number(e.target.value))}
            className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white disabled:opacity-50"
          />
        </div>
        <div>
          <span className="text-[10px] text-slate-400">Theta (deg)</span>
          <select
            value={entity.theta}
            disabled={entity.is_pinned}
            onChange={e => handleCoordChange('theta', Number(e.target.value))}
            className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white disabled:opacity-50"
          >
            <option value={0}>0° (Facing +Y)</option>
            <option value={90}>90° (Facing +X)</option>
            <option value={180}>180° (Facing -Y)</option>
            <option value={270}>270° (Facing -X)</option>
          </select>
        </div>
      </div>

      {/* Kinematics Specs if Robot */}
      {entity.kinematics && (
        <div className="p-2 bg-[#1c1f24] rounded border border-orange-500/40 text-[11px] mb-2 font-mono">
          <div className="text-orange-400 font-semibold mb-0.5">ISO 10218 Kinematics Specs:</div>
          <div className="grid grid-cols-2 gap-1 text-slate-300">
            <span>R_min: {entity.kinematics.r_min_m}m</span>
            <span>R_max: {entity.kinematics.r_max_m}m</span>
            <span>Speed: {entity.kinematics.axis1_deg_s}°/s</span>
            <span>Stop Time: {entity.kinematics.stop_time_s}s</span>
          </div>
        </div>
      )}

      {/* Dimensions & Clearances */}
      <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
        <span>Dim: {entity.dimensions.L}×{entity.dimensions.W}×{entity.dimensions.H}m</span>
        <span>Clearances: F:{entity.clearances.front}m B:{entity.clearances.back}m</span>
      </div>
    </div>
  );
};
