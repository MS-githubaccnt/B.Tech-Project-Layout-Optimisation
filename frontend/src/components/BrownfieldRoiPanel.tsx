import React, { useState, useEffect } from 'react';
import { ProjectConfig } from '../types';
import { TrendingUp } from 'lucide-react';

interface BrownfieldRoiPanelProps {
  config: ProjectConfig;
  currentZ1: number;
}

export const BrownfieldRoiPanel: React.FC<BrownfieldRoiPanelProps> = ({ config, currentZ1 }) => {
  const [roiData, setRoiData] = useState<any[]>([]);
  const [selectedK, setSelectedK] = useState<number>(3);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchRoi = async () => {
      setLoading(true);
      try {
        const resp = await fetch('/api/brownfield/roi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: config,
            unoptimized_z1: currentZ1 > 0 ? currentZ1 : 65000.0,
            max_k_relocate: Math.min(8, config.entities.length)
          })
        });
        const data = await resp.json();
        setRoiData(data.roi_curve || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchRoi();
  }, [config, currentZ1]);

  const activeRow = roiData.find(d => d.relocated_count === selectedK) || roiData[Math.min(3, roiData.length - 1)];

  return (
    <div className="p-4 bg-[#1c1f24] text-slate-200 text-xs space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-[#2d3239]">
        <div>
          <h4 className="font-semibold text-white uppercase text-xs tracking-wider flex items-center space-x-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
            <span>Brownfield Minimal-Disruption Tradeoff Curve</span>
          </h4>
          <span className="text-[10px] text-slate-400 font-mono">
            Annual Handling Savings vs. Relocation Capital Downtime
          </span>
        </div>
      </div>

      {activeRow && (
        <div className="grid grid-cols-3 gap-2 font-mono">
          <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239]">
            <span className="text-slate-400 text-[10px] block">Relocated (K)</span>
            <span className="text-white font-bold text-base mt-0.5 block">
              {activeRow.relocated_count} of {config.entities.length}
            </span>
          </div>

          <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239]">
            <span className="text-slate-400 text-[10px] block">Annual OPEX Savings</span>
            <span className="text-emerald-400 font-bold text-base mt-0.5 block">
              ₹{activeRow.annual_savings_inr.toLocaleString()}
            </span>
          </div>

          <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239]">
            <span className="text-slate-400 text-[10px] block">Payback Period</span>
            <span className="text-amber-400 font-bold text-base mt-0.5 block">
              {activeRow.roi_payback_months.toFixed(1)} mo
            </span>
          </div>
        </div>
      )}

      {roiData.length > 0 && (
        <div className="p-2 bg-[#121417] rounded border border-[#2d3239]">
          <svg className="w-full h-32" viewBox="0 0 350 110">
            <line x1="40" y1="10" x2="40" y2="90" stroke="#374151" strokeWidth="1" />
            <line x1="40" y1="90" x2="330" y2="90" stroke="#374151" strokeWidth="1" />

            <polyline
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              points={roiData
                .map((d, idx) => {
                  const maxSavings = roiData[roiData.length - 1].annual_savings_inr || 1;
                  const x = 50 + (idx / Math.max(1, roiData.length - 1)) * 260;
                  const y = 85 - (d.annual_savings_inr / maxSavings) * 70;
                  return `${x},${y}`;
                })
                .join(' ')}
            />

            {roiData.map((d, idx) => {
              const maxSavings = roiData[roiData.length - 1].annual_savings_inr || 1;
              const x = 50 + (idx / Math.max(1, roiData.length - 1)) * 260;
              const y = 85 - (d.annual_savings_inr / maxSavings) * 70;
              const isSelected = d.relocated_count === selectedK;

              return (
                <g key={idx} onClick={() => setSelectedK(d.relocated_count)} className="cursor-pointer">
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 5 : 3.5}
                    fill={isSelected ? '#f97316' : '#10b981'}
                    stroke="#ffffff"
                    strokeWidth={isSelected ? 1.5 : 0.8}
                  />
                  <text x={x} y={103} fill="#9ca3af" fontSize="8" textAnchor="middle">
                    K={d.relocated_count}
                  </text>
                </g>
              );
            })}

            <text x="45" y="15" fill="#10b981" fontSize="8" font-family="monospace">
              Annual Savings (INR) →
            </text>
          </svg>
        </div>
      )}
    </div>
  );
};
