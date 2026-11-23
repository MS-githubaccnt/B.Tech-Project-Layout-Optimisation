import React, { useState, useEffect } from 'react';
import { Grid, Sparkles, Check, ArrowRight, Layers, Sliders } from 'lucide-react';
import { ProjectConfig, LayoutEntity } from '../types';

interface CellFormationMatrixProps {
  config: ProjectConfig;
  entities: LayoutEntity[];
  onApplyCellAssignment?: (machineCellMap: Record<string, number>) => void;
}

export const CellFormationMatrix: React.FC<CellFormationMatrixProps> = ({
  config,
  entities,
  onApplyCellAssignment
}) => {
  const [algorithm, setAlgorithm] = useState<'GA' | 'ROC' | 'BEA'>('ROC');
  const [numCells, setNumCells] = useState<number>(3);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any | null>(null);
  const [applied, setApplied] = useState<boolean>(false);

  const runClustering = async () => {
    setLoading(true);
    setApplied(false);
    try {
      const resp = await fetch('/api/cell-formation/from-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...config, entities },
          num_cells: numCells,
          algorithm: algorithm,
          allow_duplication: true,
          capital_budget_inr: 1000000
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        setResult(data);
      }
    } catch (e) {
      console.error('Cell formation error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Automatically compute on initial load
  useEffect(() => {
    if (entities && entities.length > 0 && config.part_routings && config.part_routings.length > 0) {
      runClustering();
    }
  }, [config.project_name, entities.length]);

  const handleApply = () => {
    if (result && result.machine_cell_map && onApplyCellAssignment) {
      onApplyCellAssignment(result.machine_cell_map);
      setApplied(true);
      setTimeout(() => setApplied(false), 3000);
    }
  };

  // Group machines by cell for easy inspection
  const cellsOverview: Record<number, string[]> = {};
  if (result && result.machine_cell_map) {
    Object.entries(result.machine_cell_map).forEach(([mId, cIdx]) => {
      const cNum = (cIdx as number) + 1;
      if (!cellsOverview[cNum]) cellsOverview[cNum] = [];
      cellsOverview[cNum].push(mId);
    });
  }

  const cellColors = [
    { border: 'border-emerald-600', text: 'text-emerald-400', bg: 'bg-emerald-950/30' },
    { border: 'border-sky-600', text: 'text-sky-400', bg: 'bg-sky-950/30' },
    { border: 'border-amber-600', text: 'text-amber-400', bg: 'bg-amber-950/30' },
    { border: 'border-purple-600', text: 'text-purple-400', bg: 'bg-purple-950/30' },
    { border: 'border-rose-600', text: 'text-rose-400', bg: 'bg-rose-950/30' },
  ];

  return (
    <div className="p-4 bg-[#1c1f24] text-slate-200 text-xs space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#2d3239]">
        <div>
          <h4 className="font-semibold text-white uppercase text-xs tracking-wider flex items-center space-x-1.5">
            <Grid className="w-3.5 h-3.5 text-orange-400" />
            <span>Stage 1: Machine-Part Cell Formation</span>
          </h4>
          <span className="text-[10px] text-slate-400 font-mono">
            Part Family Grouping Efficacy (Γ) Optimization
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={algorithm}
            onChange={e => setAlgorithm(e.target.value as any)}
            className="bg-[#16181d] border border-[#2d3239] rounded px-2 py-1 text-xs text-white"
          >
            <option value="ROC">King's Rank Order Clustering (ROC)</option>
            <option value="GA">Hybrid Genetic Algorithm</option>
            <option value="BEA">McCormick Bond Energy (BEA)</option>
          </select>

          <div className="flex items-center space-x-1">
            <span className="text-[10px] text-slate-400">Cells:</span>
            <input
              type="number"
              min={2}
              max={5}
              value={numCells}
              onChange={e => setNumCells(Math.max(2, Math.min(5, parseInt(e.target.value) || 2)))}
              className="w-10 bg-[#16181d] border border-[#2d3239] rounded px-1.5 py-1 text-xs text-white text-center font-mono"
              title="Number of Manufacturing Cells"
            />
          </div>

          <button
            onClick={runClustering}
            disabled={loading}
            className="px-2.5 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded font-medium flex items-center space-x-1"
          >
            <Sparkles className="w-3 h-3" />
            <span>{loading ? 'Clustering...' : 'Form Cells'}</span>
          </button>
        </div>
      </div>

      {result ? (
        <div className="space-y-4">
          {/* Key Metrics HUD */}
          <div className="grid grid-cols-4 gap-2 font-mono">
            <div className="p-2 bg-[#16181d] rounded border border-[#2d3239]">
              <span className="text-slate-400 text-[10px] block">Grouping Efficacy (Γ)</span>
              <span className="text-emerald-400 font-bold text-base">
                {(result.grouping_efficacy * 100).toFixed(1)}%
              </span>
            </div>
            <div className="p-2 bg-[#16181d] rounded border border-[#2d3239]">
              <span className="text-slate-400 text-[10px] block">Inter-Cell Trips (e₀)</span>
              <span className="text-red-400 font-bold text-base">{result.exceptional_elements}</span>
            </div>
            <div className="p-2 bg-[#16181d] rounded border border-[#2d3239]">
              <span className="text-slate-400 text-[10px] block">Intra-Cell Voids (eᵥ)</span>
              <span className="text-amber-400 font-bold text-base">{result.intra_cell_voids}</span>
            </div>
            <div className="p-2 bg-[#16181d] rounded border border-[#2d3239]">
              <span className="text-slate-400 text-[10px] block">Active Cells</span>
              <span className="text-white font-bold text-base">{result.num_cells}</span>
            </div>
          </div>

          {/* Formed Cellular Workcells Breakdown */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-1">
                <Layers className="w-3 h-3 text-orange-400" />
                <span>Formed Physical Workcells ({Object.keys(cellsOverview).length})</span>
              </span>

              {onApplyCellAssignment && (
                <button
                  onClick={handleApply}
                  className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-colors ${
                    applied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                  }`}
                  title="Assign these cells to machines and draw visual boundary hulls on canvas"
                >
                  {applied ? <Check className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
                  <span>{applied ? 'Applied to Layout!' : 'Apply to Layout'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2">
              {Object.entries(cellsOverview).map(([cellNum, machineList]) => {
                const cIdx = parseInt(cellNum) - 1;
                const style = cellColors[cIdx % cellColors.length];
                return (
                  <div
                    key={cellNum}
                    className={`p-2 rounded border ${style.border} ${style.bg} flex items-center justify-between font-mono`}
                  >
                    <div>
                      <span className={`font-bold ${style.text} mr-2`}>
                        CELL {cellNum}:
                      </span>
                      <span className="text-slate-200 text-[11px]">
                        {machineList.join(', ')}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                      {machineList.length} Units
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reordered Block-Diagonal Incidence Matrix */}
          <div>
            <div className="flex items-center justify-between mb-1.5 text-slate-400 text-[10px] font-mono">
              <span>BLOCK-DIAGONAL REORDERED INCIDENCE MATRIX [M × P]</span>
              <span className="text-emerald-400">Green = Intra-Cell • Red = Exceptional Flow</span>
            </div>

            <div className="overflow-x-auto bg-[#121417] p-2 rounded border border-[#2d3239]">
              <table className="text-[11px] border-collapse font-mono w-full">
                <thead>
                  <tr>
                    <th className="p-1 text-left text-slate-400 border border-[#2d3239] bg-[#1a1d21]">
                      Machine \ Part
                    </th>
                    {result.col_names.map((col: string, idx: number) => (
                      <th
                        key={idx}
                        className="p-1 text-center text-slate-300 border border-[#2d3239] bg-[#1a1d21] whitespace-nowrap"
                        title={col}
                      >
                        {col.length > 12 ? `${col.substring(0, 10)}...` : col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.reordered_matrix.map((row: number[], r_idx: number) => (
                    <tr key={r_idx}>
                      <td className="p-1 font-semibold text-slate-300 border border-[#2d3239] bg-[#16181d] whitespace-nowrap">
                        {result.row_names[r_idx]}
                      </td>
                      {row.map((val: number, c_idx: number) => {
                        const inCell = result.cell_boundaries?.find(
                          (b: any) =>
                            r_idx >= b.row_start &&
                            r_idx <= b.row_end &&
                            c_idx >= b.col_start &&
                            c_idx <= b.col_end
                        );

                        let cellClass = 'bg-[#121417] text-slate-700';
                        if (val === 1 && inCell) {
                          cellClass = 'bg-emerald-950/70 text-emerald-400 font-bold border border-emerald-700';
                        } else if (val === 1 && !inCell) {
                          cellClass = 'bg-red-950/70 text-red-400 font-bold border border-red-700';
                        } else if (val === 0 && inCell) {
                          cellClass = 'bg-amber-950/20 text-amber-500/30';
                        }

                        return (
                          <td
                            key={c_idx}
                            className={`p-1 text-center border border-[#23272e] ${cellClass}`}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Machine Duplication Section */}
          {result.duplicated_machines && result.duplicated_machines.length > 0 && (
            <div className="p-2.5 bg-[#16181d] rounded border border-orange-500/30 text-[11px]">
              <span className="font-semibold text-orange-400 block mb-1">
                Machine Duplication Recommendation:
              </span>
              {result.duplicated_machines.map((dm: any, idx: number) => (
                <div key={idx} className="text-slate-300 font-mono">
                  Duplicating {dm.machine_name} (₹{dm.cost_inr.toLocaleString()}) saves {dm.exceptional_saved} exceptional trips.
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 bg-[#16181d] rounded border border-[#2d3239] text-center text-slate-400 text-xs">
          {loading ? 'Executing cellular partitioning algorithms...' : 'Click "Form Cells" to partition machines and parts into cellular manufacturing blocks.'}
        </div>
      )}
    </div>
  );
};
