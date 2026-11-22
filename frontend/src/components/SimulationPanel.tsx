import React from 'react';
import { SimulationMetrics, ProjectMode } from '../types';
import { Play, Activity, Clock, Box, Gauge, Check, AlertCircle } from 'lucide-react';

interface SimulationPanelProps {
  metrics?: SimulationMetrics;
  onRunSimulation: () => void;
  loading: boolean;
  projectMode: ProjectMode;
}

export const SimulationPanel: React.FC<SimulationPanelProps> = ({
  metrics,
  onRunSimulation,
  loading,
  projectMode
}) => {
  return (
    <div className="p-4 bg-[#1c1f24] text-slate-200 text-xs space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-[#2d3239]">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-orange-400" />
          <span className="font-semibold text-white uppercase text-xs tracking-wider">
            Discrete-Event Operational Simulation (SimPy)
          </span>
        </div>
        <button
          onClick={onRunSimulation}
          disabled={loading}
          className="flex items-center space-x-1.5 px-3 py-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded font-medium transition-colors"
        >
          <Play className="w-3 h-3 fill-white" />
          <span>{loading ? 'Simulating...' : 'Run Shift Simulation'}</span>
        </button>
      </div>

      {metrics ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {projectMode === 'CELLULAR_CMS' ? (
              <>
                <div className="p-2.5 bg-[#16181d] border border-[#2d3239] rounded">
                  <div className="text-slate-400 text-[10px] uppercase font-mono">Shift Throughput</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">
                    {metrics.throughput_per_hour.toFixed(1)} <span className="text-xs font-normal text-slate-400">parts/hr</span>
                  </div>
                </div>

                <div className="p-2.5 bg-[#16181d] border border-[#2d3239] rounded">
                  <div className="text-slate-400 text-[10px] uppercase font-mono">Average Lead Time</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">
                    {metrics.avg_flow_time_min?.toFixed(1) || '0.0'} <span className="text-xs font-normal text-slate-400">min</span>
                  </div>
                </div>

                <div className="p-2.5 bg-[#16181d] border border-[#2d3239] rounded">
                  <div className="text-slate-400 text-[10px] uppercase font-mono">Forklift Queue Wait</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">
                    {metrics.forklift_queue_wait_min?.toFixed(2) || '0.00'} <span className="text-xs font-normal text-slate-400">min</span>
                  </div>
                </div>

                <div className="p-2.5 bg-[#16181d] border border-[#2d3239] rounded">
                  <div className="text-slate-400 text-[10px] uppercase font-mono">Average WIP Stock</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">
                    {metrics.wip_average?.toFixed(1) || '0.0'} <span className="text-xs font-normal text-slate-400">batches</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="p-2.5 bg-[#16181d] border border-[#2d3239] rounded">
                  <div className="text-slate-400 text-[10px] uppercase font-mono">Bottleneck Cycle Time</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">
                    {metrics.bottleneck_cycle_time_s?.toFixed(1) || '0.0'}s{' '}
                    <span className="text-[10px] text-slate-400 font-normal">/ {metrics.takt_time_s}s Takt</span>
                  </div>
                  <div className="text-[9px] mt-0.5 font-mono">
                    {metrics.takt_met ? (
                      <span className="text-emerald-400">Takt Time Requirement Met</span>
                    ) : (
                      <span className="text-red-400">Exceeds Target Takt Time</span>
                    )}
                  </div>
                </div>

                <div className="p-2.5 bg-[#16181d] border border-[#2d3239] rounded">
                  <div className="text-slate-400 text-[10px] uppercase font-mono">Pack Output Rate</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">
                    {metrics.throughput_per_hour.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-400">packs/hr</span>
                  </div>
                </div>

                <div className="p-2.5 bg-[#16181d] border border-[#2d3239] rounded">
                  <div className="text-slate-400 text-[10px] uppercase font-mono">Robot Utilization</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">
                    {metrics.robot_utilization_pct?.toFixed(1) || '0.0'}%
                  </div>
                </div>

                <div className="p-2.5 bg-[#16181d] border border-[#2d3239] rounded">
                  <div className="text-slate-400 text-[10px] uppercase font-mono">SSM Safety Slowdown</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">
                    {metrics.robot_safety_stopped_pct?.toFixed(1) || '0.0'}%
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="p-2 bg-[#16181d] rounded border border-[#2d3239] text-[11px] text-slate-400 font-mono">
            {metrics.summary}
          </div>
        </div>
      ) : (
        <div className="p-4 bg-[#16181d] rounded border border-[#2d3239] text-[11px] text-slate-400">
          Click <b>"Run Shift Simulation"</b> to execute SimPy stochastic event tracing over 8 operating hours.
        </div>
      )}
    </div>
  );
};
