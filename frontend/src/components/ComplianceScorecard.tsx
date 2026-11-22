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
            Regulatory Compliance Audit Scorecard
          </span>
        </div>
        <div className="font-mono">
          <span className="text-slate-400 mr-1.5">Score:</span>
          <span
            className={`font-bold px-2 py-0.5 rounded border ${
              compliance.overall_passed
                ? 'bg-emerald-950/40 border-emerald-700 text-emerald-400'
                : 'bg-red-950/40 border-red-700 text-red-400'
            }`}
          >
            {compliance.overall_score}%
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {/* Fire Egress */}
        <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239] flex items-center justify-between">
          <div>
            <div className="font-semibold text-white">Fire Egress Walking Path</div>
            <div className="text-[10px] text-slate-400">Indian Factories Act & NFPA 101 Statutory Limit (≤30m)</div>
          </div>
          <div className="text-right font-mono">
            <div className="text-sm font-bold text-white">{compliance.fire_egress_max_dist_m}m</div>
            <span className={`text-[10px] font-bold ${compliance.fire_egress_passed ? 'text-emerald-400' : 'text-red-400'}`}>
              {compliance.fire_egress_passed ? 'PASS' : 'FAIL'}
            </span>
          </div>
        </div>

        {/* Forklift Aisles */}
        <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239] flex items-center justify-between">
          <div>
            <div className="font-semibold text-white">Forklift Navigable Aisle Width</div>
            <div className="text-[10px] text-slate-400">Minkowski Swept Obstacle Clearance (≥3.0m)</div>
          </div>
          <div className="text-right font-mono">
            <div className="text-sm font-bold text-white">{compliance.forklift_aisle_min_width_m}m</div>
            <span className={`text-[10px] font-bold ${compliance.forklift_aisle_passed ? 'text-emerald-400' : 'text-red-400'}`}>
              {compliance.forklift_aisle_passed ? 'PASS' : 'FAIL'}
            </span>
          </div>
        </div>

        {/* ISO 10218-2 Collaborative Safety */}
        <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239] flex items-center justify-between">
          <div>
            <div className="font-semibold text-white">ISO 10218-2:2025 Safety Standards</div>
            <div className="text-[10px] text-slate-400">SSM Annex L Protective Distance & ISO 13854 Anti-Crushing (≥500mm)</div>
          </div>
          <div className="text-right font-mono">
            <span className={`text-[11px] font-bold ${compliance.iso_safety_passed ? 'text-emerald-400' : 'text-red-400'}`}>
              {compliance.iso_safety_passed ? 'VERIFIED' : 'DEFICIENT'}
            </span>
          </div>
        </div>

        {/* Hazard Separation */}
        <div className="p-2.5 bg-[#16181d] rounded border border-[#2d3239] flex items-center justify-between">
          <div>
            <div className="font-semibold text-white">Hazard Buffer Separation</div>
            <div className="text-[10px] text-slate-400">Vibration / Dust vs Metrology (CMM) Environmental Isolation</div>
          </div>
          <div className="text-right font-mono">
            <span className={`text-[11px] font-bold ${compliance.hazard_separation_passed ? 'text-emerald-400' : 'text-red-400'}`}>
              {compliance.hazard_separation_passed ? 'COMPLIANT' : 'VIOLATION'}
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
