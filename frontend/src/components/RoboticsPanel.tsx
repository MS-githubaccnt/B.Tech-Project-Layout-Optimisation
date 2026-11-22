import React from 'react';
import { ProjectConfig, LayoutEntity } from '../types';
import { Shield, Check, AlertTriangle, ArrowRight, Eye } from 'lucide-react';

interface RoboticsPanelProps {
  config: ProjectConfig;
  entities: LayoutEntity[];
}

export const RoboticsPanel: React.FC<RoboticsPanelProps> = ({ config, entities }) => {
  const robots = entities.filter(e => e.category.startsWith('robot'));
  const humans = entities.filter(e => e.category.startsWith('human'));
  const tasks = config.robot_tasks || [];

  return (
    <div className="p-4 bg-[#1c1f24] text-slate-200 text-xs space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-[#2d3239]">
        <div className="flex items-center space-x-2">
          <Shield className="w-4 h-4 text-orange-400" />
          <span className="font-semibold text-white uppercase text-xs tracking-wider">
            Mode B: Robot Reach & ISO 10218-2 Safety Audit
          </span>
        </div>
      </div>

      {robots.length === 0 ? (
        <div className="p-4 bg-[#16181d] rounded border border-[#2d3239] text-slate-400">
          No robotic manipulators placed in current layout.
        </div>
      ) : (
        <div className="space-y-3">
          {robots.map(r => {
            const k = r.kinematics;
            const rTasks = tasks.filter(t => t.robot_id === r.id);

            // Fixtures in reach analysis
            const fixtureTargets = rTasks.flatMap(t => t.sequence.map(s => s.to));
            const uniqueTargets = Array.from(new Set(fixtureTargets));

            return (
              <div key={r.id} className="p-3 bg-[#16181d] rounded border border-[#2d3239] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-mono">
                    <span className="font-bold text-white text-sm">{r.id}</span>
                    <span className="text-[10px] text-slate-400">({r.model || '6-Axis Robot'})</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-950/40 text-orange-400 border border-orange-800">
                    {r.safety_mode || 'SSM'}
                  </span>
                </div>

                {k && (
                  <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-slate-400 bg-[#121417] p-2 rounded border border-[#23272e]">
                    <span>R_min: {k.r_min_m}m</span>
                    <span>R_max: {k.r_max_m}m</span>
                    <span>Axis-1: {k.axis1_deg_s}°/s</span>
                  </div>
                )}

                {/* Fixture Reachability Verification */}
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                    Fixture Target Reachability:
                  </span>
                  {uniqueTargets.length === 0 ? (
                    <span className="text-slate-400 text-[11px]">No target fixtures mapped in cyclic tasks.</span>
                  ) : (
                    <div className="space-y-1">
                      {uniqueTargets.map(tId => {
                        const targetEnt = entities.find(e => e.id === tId);
                        if (!targetEnt) return null;
                        const dist = Math.hypot(targetEnt.x - r.x, targetEnt.y - r.y);
                        const isReachable = k ? dist >= k.r_min_m && dist <= k.r_max_m : true;
                        const isSweet = k ? dist >= 1.15 * k.r_min_m && dist <= 0.85 * k.r_max_m : false;

                        return (
                          <div key={tId} className="flex items-center justify-between bg-[#1c1f24] p-1.5 rounded border border-[#2d3239] font-mono text-[11px]">
                            <span className="text-white">{tId} ({dist.toFixed(2)}m)</span>
                            {isSweet ? (
                              <span className="text-emerald-400 text-[10px] font-bold">SWEET-SPOT</span>
                            ) : isReachable ? (
                              <span className="text-blue-400 text-[10px]">REACHABLE</span>
                            ) : (
                              <span className="text-red-400 text-[10px] font-bold">OUT OF REACH</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ISO 10218-2 SSM Proximity Check with Humans */}
                {humans.length > 0 && (
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                      ISO 10218-2 Annex L Protective Separation:
                    </span>
                    {humans.map(h => {
                      const dist = Math.hypot(h.x - r.x, h.y - r.y);
                      // Sp calculation
                      const v_h = h.approach_speed_m_s || 1.6;
                      const t_r = k?.reaction_time_s || 0.08;
                      const t_s = k?.stop_time_s || 0.25;
                      const sp = v_h * (t_r + t_s) + 1.0 * t_r + 0.5 * 1.0 * t_s + 0.3;
                      const isSafe = dist >= sp;

                      return (
                        <div key={h.id} className="flex items-center justify-between bg-[#1c1f24] p-1.5 rounded border border-[#2d3239] font-mono text-[11px]">
                          <span>{h.id} (Dist: {dist.toFixed(2)}m | Sp: {sp.toFixed(2)}m)</span>
                          <span className={`text-[10px] font-bold ${isSafe ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isSafe ? 'SSM SAFE' : 'SSM WARNING'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
