import React from 'react';
import { SolutionCandidate, ProjectMode } from '../types';
import { Layers, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface ParetoExplorerProps {
  candidates: SolutionCandidate[];
  selectedCandidateId: string | null;
  onSelectCandidate: (candidate: SolutionCandidate) => void;
  projectMode: ProjectMode;
}

export const ParetoExplorer: React.FC<ParetoExplorerProps> = ({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  projectMode
}) => {
  if (candidates.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 text-xs">
        <Layers className="w-6 h-6 text-slate-400 mx-auto mb-2" />
        No optimization results generated. Click <b className="text-white">"Run NSGA-II Optimizer"</b> to generate the non-dominated Pareto front.
      </div>
    );
  }

  const z1Values = candidates.map(c => c.z1_score);
  const z2Values = candidates.map(c => c.z2_score);
  const minZ1 = Math.min(...z1Values);
  const maxZ1 = Math.max(...z1Values, minZ1 + 1);
  const minZ2 = Math.min(...z2Values);
  const maxZ2 = Math.max(...z2Values, minZ2 + 1);

  const z1Label = projectMode === 'CELLULAR_CMS' ? 'Handling Cost (INR/yr)' : 'Cycle Time (s)';
  const z2Label = projectMode === 'CELLULAR_CMS' ? 'Footprint & Utilities' : 'Safety Risk & Guarding';

  return (
    <div className="flex flex-col h-full bg-[#1c1f24] text-slate-200 text-xs">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2d3239] flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-orange-400" />
            <span>Multi-Objective Pareto Frontier</span>
          </h4>
          <span className="text-[10px] text-slate-400 font-mono">
            {candidates.length} Non-Dominated Solutions
          </span>
        </div>
      </div>

      {/* 2D Scatter Plot */}
      <div className="p-3 border-b border-[#2d3239]">
        <div className="relative w-full h-40 bg-[#121417] rounded border border-[#2d3239] p-2 overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 300 130">
            {/* Axis */}
            <line x1="35" y1="15" x2="35" y2="105" stroke="#374151" strokeWidth="1" />
            <line x1="35" y1="105" x2="285" y2="105" stroke="#374151" strokeWidth="1" />

            {/* Frontier Line */}
            {candidates.length > 1 && (
              <polyline
                fill="none"
                stroke="#f97316"
                strokeWidth="1.5"
                strokeDasharray="3 2"
                points={candidates
                  .slice()
                  .sort((a, b) => a.z1_score - b.z1_score)
                  .map(c => {
                    const x = 40 + ((c.z1_score - minZ1) / (maxZ1 - minZ1 || 1)) * 230;
                    const y = 100 - ((c.z2_score - minZ2) / (maxZ2 - minZ2 || 1)) * 80;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />
            )}

            {/* Scatter Points */}
            {candidates.map(cand => {
              const x = 40 + ((cand.z1_score - minZ1) / (maxZ1 - minZ1 || 1)) * 230;
              const y = 100 - ((cand.z2_score - minZ2) / (maxZ2 - minZ2 || 1)) * 80;
              const isSelected = cand.candidate_id === selectedCandidateId;

              return (
                <g key={cand.candidate_id} onClick={() => onSelectCandidate(cand)} className="cursor-pointer">
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 5 : 3.5}
                    fill={isSelected ? '#f97316' : cand.is_feasible ? '#10b981' : '#ef4444'}
                    stroke="#ffffff"
                    strokeWidth={isSelected ? 1.5 : 0.8}
                  />
                  {isSelected && (
                    <circle cx={x} cy={y} r={9} fill="none" stroke="#f97316" strokeWidth="1" opacity="0.7" />
                  )}
                </g>
              );
            })}

            <text x="35" y="10" fill="#6b7280" fontSize="8" textAnchor="start">
              Z2: {z2Label}
            </text>
            <text x="285" y="120" fill="#6b7280" fontSize="8" textAnchor="end">
              Z1: {z1Label}
            </text>
          </svg>
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400 font-mono">
          <span>Green = Feasible</span>
          <span>Orange = Selected</span>
        </div>
      </div>

      {/* Candidate Solutions List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {candidates.map((cand, idx) => {
          const isSelected = cand.candidate_id === selectedCandidateId;

          return (
            <div
              key={cand.candidate_id}
              onClick={() => onSelectCandidate(cand)}
              className={`p-2.5 rounded border transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#282c34] border-orange-500'
                  : 'bg-[#16181d] border-[#2d3239] hover:bg-[#22262d]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-1.5 font-mono font-bold text-white">
                  <span>{cand.candidate_id}</span>
                  {cand.is_feasible ? (
                    <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-800/50">
                      FEASIBLE
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-red-400 bg-red-950/40 px-1.5 py-0.2 rounded border border-red-800/50">
                      VIOLATIONS
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Rank #{idx + 1}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase">Z1 ({cand.z1_label})</span>
                  <span className="text-white font-semibold">{cand.z1_score.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase">Z2 (Penalty)</span>
                  <span className="text-white font-semibold">{cand.z2_score.toLocaleString()}</span>
                </div>
              </div>

              {cand.compliance && (
                <div className="mt-1.5 pt-1.5 border-t border-[#2d3239] flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>Compliance: {cand.compliance.overall_score}%</span>
                  <span>Overlap: {cand.overlap_area}m²</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
