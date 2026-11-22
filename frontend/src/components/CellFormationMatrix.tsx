import React, { useState } from 'react';
import { Grid, Sparkles, ArrowRightLeft } from 'lucide-react';

interface CellFormationMatrixProps {
  onApplyCellAssignment?: (machineCellMap: Record<string, number>) => void;
}

export const CellFormationMatrix: React.FC<CellFormationMatrixProps> = ({ onApplyCellAssignment }) => {
  const [algorithm, setAlgorithm] = useState<'GA' | 'ROC' | 'BEA'>('GA');
  const [numCells, setNumCells] = useState<number>(3);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any | null>(null);

  const [matrixData, setMatrixData] = useState({
    machine_names: ['Haas_VF2_1', 'Haas_VF2_2', 'Haas_ST20_1', 'Haas_ST20_2', 'Grinder_1', 'Grinder_2', 'Mitutoyo_CMM', 'Saw_01'],
    part_names: ['Shaft_A', 'Shaft_B', 'Disc_C', 'Disc_D', 'Housing_E', 'Housing_F', 'Pin_G', 'Arm_H', 'Hub_I', 'Flange_J'],
    matrix: [
      [1, 0, 0, 1, 0, 1, 0, 0, 1, 0],
      [1, 1, 0, 0, 0, 1, 0, 0, 1, 0],
      [0, 1, 1, 0, 1, 0, 1, 0, 0, 1],
      [0, 0, 1, 0, 1, 0, 1, 1, 0, 1],
      [0, 1, 1, 0, 0, 0, 1, 1, 0, 0],
      [0, 0, 1, 1, 0, 0, 0, 1, 0, 0],
      [1, 0, 0, 0, 1, 1, 0, 0, 1, 0],
      [1, 1, 0, 1, 0, 0, 0, 0, 0, 0]
    ]
  });

  const runClustering = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/cell-formation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matrix: matrixData.matrix,
          machine_names: matrixData.machine_names,
          part_names: matrixData.part_names,
          num_cells: numCells,
          algorithm: algorithm,
          allow_duplication: true,
          capital_budget_inr: 1000000
        })
      });
      const data = await resp.json();
      setResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-[#1c1f24] text-slate-200 text-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#2d3239]">
        <div>
          <h4 className="font-semibold text-white uppercase text-xs tracking-wider flex items-center space-x-1.5">
            <Grid className="w-3.5 h-3.5 text-orange-400" />
            <span>Stage 1: Machine-Part Cell Formation (MPCF)</span>
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
            <option value="GA">Hybrid Genetic Algorithm</option>
            <option value="ROC">Rank Order Clustering (King)</option>
            <option value="BEA">Bond Energy Algorithm (McCormick)</option>
          </select>

          <input
            type="number"
            min={2}
            max={5}
            value={numCells}
            onChange={e => setNumCells(Math.max(2, Math.min(5, parseInt(e.target.value) || 2)))}
            className="w-12 bg-[#16181d] border border-[#2d3239] rounded px-1.5 py-1 text-xs text-white text-center font-mono"
            title="Number of Cells (K)"
          />

          <button
            onClick={runClustering}
            disabled={loading}
            className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded font-medium"
          >
            {loading ? 'Clustering...' : 'Form Cells'}
          </button>
        </div>
      </div>

      {result ? (
        <div className="space-y-3">
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
              <span className="text-slate-400 text-[10px] block">Formed Cells</span>
              <span className="text-white font-bold text-base">{result.num_cells}</span>
            </div>
          </div>

          <div className="overflow-x-auto bg-[#121417] p-2 rounded border border-[#2d3239]">
            <table className="text-[11px] border-collapse font-mono w-full">
              <thead>
                <tr>
                  <th className="p-1 text-left text-slate-400 border border-[#2d3239] bg-[#1a1d21]">Machine</th>
                  {result.col_names.map((col: string, idx: number) => (
                    <th key={idx} className="p-1 text-center text-slate-300 border border-[#2d3239] bg-[#1a1d21]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.reordered_matrix.map((row: number[], r_idx: number) => (
                  <tr key={r_idx}>
                    <td className="p-1 font-semibold text-slate-300 border border-[#2d3239] bg-[#16181d]">
                      {result.row_names[r_idx]}
                    </td>
                    {row.map((val: number, c_idx: number) => {
                      const inCell = result.cell_boundaries.find(
                        (b: any) =>
                          r_idx >= b.row_start &&
                          r_idx <= b.row_end &&
                          c_idx >= b.col_start &&
                          c_idx <= b.col_end
                      );

                      let cellClass = 'bg-[#121417] text-slate-700';
                      if (val === 1 && inCell) {
                        cellClass = 'bg-emerald-950/60 text-emerald-400 font-bold border border-emerald-800';
                      } else if (val === 1 && !inCell) {
                        cellClass = 'bg-red-950/70 text-red-400 font-bold border border-red-800';
                      } else if (val === 0 && inCell) {
                        cellClass = 'bg-amber-950/20 text-amber-500/30';
                      }

                      return (
                        <td key={c_idx} className={`p-1 text-center border border-[#23272e] ${cellClass}`}>
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
        <div className="p-4 bg-[#16181d] rounded border border-[#2d3239] text-[11px] text-slate-400">
          Click <b>"Form Cells"</b> to partition machines and parts into cellular manufacturing blocks.
        </div>
      )}
    </div>
  );
};
