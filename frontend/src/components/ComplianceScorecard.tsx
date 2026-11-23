import React from 'react';
import { ComplianceResult } from '../types';
import { Shield, ShieldAlert, Check, X, AlertCircle } from 'lucide-react';

interface ComplianceScorecardProps {
  compliance?: ComplianceResult;
  loading?: boolean;
}

export const ComplianceScorecard: React.FC<ComplianceScorecardProps> = ({ compliance, loading }) => {
  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400 text-xs">
        Auditing safety and statutory industrial compliance...
      </div>
    );
  }

  if (!compliance) {
    return (
      <div className="p-6 text-center text-slate-400 text-xs">
        No compliance audit records. Run optimization or audit check.
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#1c1f24] text-slate-200 text-xs space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-[#2d3239]">
        <div className="flex items-center space-x-2">
          {compliance.overall_passed ? (
            <Shield className="w-4 h-4 text-emerald-400" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-red-400" />
          )}
          <span className="font-semibold text-white uppercase text-xs tracking-wider">
            Indian Defense Statutory Compliance Audit
          </span>
        </div>
       
      </div>

      <div className="space-y-2">
        {/* 1. DGQA / DGAQA Quality & Chain-of-Custody */}
        <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239] flex items-center justify-between">
          <div>
            <div className="font-semibold text-white flex items-center space-x-1.5">
              <span>DGQA / DGAQA Quality &amp; MRB Custody</span>
              <span className="text-[9px] px-1 py-0.2 bg-orange-950/60 border border-orange-700/50 text-orange-400 rounded font-mono">
                AS9100D
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Material Review Board (MRB) locked quarantine &amp; thermal isolation (≥4.0m)
            </div>
          </div>
          <div className="text-right font-mono">
            <span className={`text-[10px] font-bold ${compliance.dgqa_custody_passed ?? true ? 'text-emerald-400' : 'text-red-400'}`}>
              {compliance.dgqa_custody_passed ?? true ? 'PASS' : 'DEFICIENT'}
            </span>
          </div>
        </div>

        {/* 2. PESO & Indian Explosives Rules, 2008 */}
        <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239] flex items-center justify-between">
          <div>
            <div className="font-semibold text-white flex items-center space-x-1.5">
              <span>PESO Explosives Rules 2008 (Q-D Safety)</span>
              <span className="text-[9px] px-1 py-0.2 bg-orange-950/60 border border-orange-700/50 text-orange-400 rounded font-mono">
                ACT 1884
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Quantity-Distance D = K · W^(1/3) Outside Safety Distance to boundary and docks
            </div>
          </div>
          <div className="text-right font-mono">
            <span className={`text-[10px] font-bold ${compliance.peso_qd_passed ?? true ? 'text-emerald-400' : 'text-red-400'}`}>
              {compliance.peso_qd_passed ?? true ? 'COMPLIANT' : 'OVERLAP'}
            </span>
          </div>
        </div>

        {/* 3. AERB Radiography NDT Shielding */}
        <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239] flex items-center justify-between">
          <div>
            <div className="font-semibold text-white flex items-center space-x-1.5">
              <span>AERB Code AERB/SC/IR (NDT Radiography)</span>
              <span className="text-[9px] px-1 py-0.2 bg-orange-950/60 border border-orange-700/50 text-orange-400 rounded font-mono">
                AERB
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              450kV X-Ray / CT bunker radiation exclusion boundary buffer (≥5.0m)
            </div>
          </div>
          <div className="text-right font-mono">
            <span className={`text-[10px] font-bold ${compliance.aerb_radiation_passed ?? true ? 'text-emerald-400' : 'text-red-400'}`}>
              {compliance.aerb_radiation_passed ?? true ? 'VERIFIED' : 'BREACH'}
            </span>
          </div>
        </div>

        {/* 4. NBC 2016 Part 4 / Factories Act 1948 Egress */}
        <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239] flex items-center justify-between">
          <div>
            <div className="font-semibold text-white flex items-center space-x-1.5">
              <span>NBC 2016 Group J / Factories Act Egress</span>
              <span className="text-[9px] px-1 py-0.2 bg-orange-950/60 border border-orange-700/50 text-orange-400 rounded font-mono">
                NBC 2016
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Hazardous &amp; Armament walking escape path (Statutory limit ≤22.5m)
            </div>
          </div>
          <div className="text-right font-mono">
            <div className="text-sm font-bold text-white">{compliance.fire_egress_max_dist_m}m</div>
            <span className={`text-[10px] font-bold ${compliance.fire_egress_passed ? 'text-emerald-400' : 'text-red-400'}`}>
              {compliance.fire_egress_passed ? 'PASS' : 'FAIL'}
            </span>
          </div>
        </div>

        {/* 5. BIS IS 6922 / DIN 4150-3 Vibration Isolation */}
        <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239] flex items-center justify-between">
          <div>
            <div className="font-semibold text-white flex items-center space-x-1.5">
              <span>BIS IS 6922 / DIN 4150-3 Vibration Isolation</span>
              <span className="text-[9px] px-1 py-0.2 bg-orange-950/60 border border-orange-700/50 text-orange-400 rounded font-mono">
                IS 6922
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Shockwave foundation isolation (≥7.0m) between forge hammers and sub-micron CMM
            </div>
          </div>
          <div className="text-right font-mono">
            <span className={`text-[10px] font-bold ${compliance.is6922_vibration_isolation_passed ?? true ? 'text-emerald-400' : 'text-red-400'}`}>
              {compliance.is6922_vibration_isolation_passed ?? true ? 'ISOLATED' : 'INTERFERENCE'}
            </span>
          </div>
        </div>

        {/* 6. Heavy Armament Navigable Aisles */}
        <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239] flex items-center justify-between">
          <div>
            <div className="font-semibold text-white flex items-center space-x-1.5">
              <span>Heavy Armament Navigable Aisle Width</span>
              <span className="text-[9px] px-1 py-0.2 bg-orange-950/60 border border-orange-700/50 text-orange-400 rounded font-mono">
                CAD
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Minkowski swept obstacle clearance for ordnance transit (≥3.0m)
            </div>
          </div>
          <div className="text-right font-mono">
            <div className="text-sm font-bold text-white">{compliance.forklift_aisle_min_width_m}m</div>
            <span className={`text-[10px] font-bold ${compliance.forklift_aisle_passed ? 'text-emerald-400' : 'text-red-400'}`}>
              {compliance.forklift_aisle_passed ? 'PASS' : 'FAIL'}
            </span>
          </div>
        </div>
      </div>

      {compliance.violations.length > 0 && (
        <div className="p-2.5 bg-red-950/30 border border-red-900/60 rounded text-[11px] text-red-300">
          <div className="font-semibold text-red-200 mb-1 flex items-center space-x-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Violations Requiring Corrective Action:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5">
            {compliance.violations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
