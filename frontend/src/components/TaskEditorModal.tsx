import React, { useState, useEffect } from 'react';
import { ProjectConfig, PartRouting, RobotTask, RobotTaskStep, PartOperation, LayoutEntity } from '../types';
import {
  X,
  ArrowRight,
  Plus,
  Trash2,
  GitBranch,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Clock,
  Edit2,
  Check,
  Layers,
  Sparkles
} from 'lucide-react';

interface TaskEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ProjectConfig;
  onUpdateTasksAndRoutings: (partRoutings: PartRouting[], robotTasks: RobotTask[], targetTaktTime?: number) => void;
}

export const TaskEditorModal: React.FC<TaskEditorModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateTasksAndRoutings
}) => {
  const [routings, setRoutings] = useState<PartRouting[]>([]);
  const [tasks, setTasks] = useState<RobotTask[]>([]);
  const [taktTime, setTaktTime] = useState<number>(config.target_takt_time_s || 45.0);

  // Quick text edit state for Mode A parts: partIndex -> boolean
  const [quickEditIdx, setQuickEditIdx] = useState<number | null>(null);
  const [quickEditText, setQuickEditText] = useState<string>('');

  // Form state for adding robot task step (Mode B)
  const [newRobotId, setNewRobotId] = useState<string>('');
  const [newFromEntity, setNewFromEntity] = useState<string>('');
  const [newToEntity, setNewToEntity] = useState<string>('');
  const [newProcessTime, setNewProcessTime] = useState<number>(3.0);

  // Synchronize internal state whenever modal opens or active configuration changes
  useEffect(() => {
    if (isOpen) {
      setRoutings(JSON.parse(JSON.stringify(config.part_routings || [])));
      setTasks(JSON.parse(JSON.stringify(config.robot_tasks || [])));
      setTaktTime(config.target_takt_time_s || 45.0);
      setQuickEditIdx(null);

      // Pre-select first robot if available
      const robots = config.entities.filter(e => e.category.startsWith('robot'));
      if (robots.length > 0 && !newRobotId) {
        setNewRobotId(robots[0].id);
      }
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const robots = config.entities.filter(e => e.category.startsWith('robot'));
  const fixtures = config.entities.filter(e => !e.category.startsWith('robot'));
  const machines = config.entities;

  // List of candidate equipment identifiers for Mode A machine selectors
  const candidateMachines = Array.from(
    new Set([
      ...machines.map(m => m.id),
      ...machines.map(m => m.model).filter(Boolean),
      ...machines.map(m => m.category).filter(Boolean)
    ])
  );

  // --- MODE A: PART ROUTINGS HANDLERS ---
  const handleAddPart = () => {
    const newId = `Part_${String.fromCharCode(65 + (routings.length % 26))}${routings.length + 1}`;
    const defaultMachine = candidateMachines[0] || 'VMC_01';
    const newPart: PartRouting = {
      part_id: newId,
      annual_demand: 15000,
      batch_size: 50,
      sequence: [
        { machine_type: defaultMachine, cycle_min: 3.5 }
      ]
    };
    setRoutings([...routings, newPart]);
  };

  const handleDeletePart = (partIdx: number) => {
    setRoutings(routings.filter((_, idx) => idx !== partIdx));
    if (quickEditIdx === partIdx) setQuickEditIdx(null);
  };

  const handleUpdatePartMeta = (partIdx: number, field: keyof PartRouting, value: any) => {
    setRoutings(routings.map((p, idx) => (idx === partIdx ? { ...p, [field]: value } : p)));
  };

  const handleAddOperation = (partIdx: number) => {
    const defaultMachine = candidateMachines[routings[partIdx].sequence.length % candidateMachines.length] || 'Haas_VF2';
    const newOp: PartOperation = {
      machine_type: defaultMachine,
      cycle_min: 3.0
    };
    setRoutings(routings.map((p, idx) => {
      if (idx === partIdx) {
        return { ...p, sequence: [...p.sequence, newOp] };
      }
      return p;
    }));
  };

  const handleUpdateOperation = (partIdx: number, opIdx: number, field: keyof PartOperation, value: any) => {
    setRoutings(routings.map((p, pIdx) => {
      if (pIdx === partIdx) {
        const updatedSeq = p.sequence.map((op, oIdx) => (oIdx === opIdx ? { ...op, [field]: value } : op));
        return { ...p, sequence: updatedSeq };
      }
      return p;
    }));
  };

  const handleRemoveOperation = (partIdx: number, opIdx: number) => {
    setRoutings(routings.map((p, pIdx) => {
      if (pIdx === partIdx) {
        return { ...p, sequence: p.sequence.filter((_, oIdx) => oIdx !== opIdx) };
      }
      return p;
    }));
  };

  const handleMoveOperation = (partIdx: number, opIdx: number, direction: 'left' | 'right') => {
    setRoutings(routings.map((p, pIdx) => {
      if (pIdx === partIdx) {
        const seq = [...p.sequence];
        const targetIdx = direction === 'left' ? opIdx - 1 : opIdx + 1;
        if (targetIdx < 0 || targetIdx >= seq.length) return p;
        const temp = seq[opIdx];
        seq[opIdx] = seq[targetIdx];
        seq[targetIdx] = temp;
        return { ...p, sequence: seq };
      }
      return p;
    }));
  };

  const handleStartQuickEdit = (partIdx: number) => {
    const text = routings[partIdx].sequence.map(op => `${op.machine_type}`).join(' -> ');
    setQuickEditText(text);
    setQuickEditIdx(partIdx);
  };

  const handleApplyQuickEdit = (partIdx: number) => {
    const tokens = quickEditText
      .replace(/->/g, ',')
      .replace(/>/g, ',')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const existingSeq = routings[partIdx].sequence;
    const newSeq: PartOperation[] = tokens.map((token, idx) => {
      const match = existingSeq.find(op => op.machine_type.toLowerCase() === token.toLowerCase());
      return {
        machine_type: token,
        cycle_min: match ? match.cycle_min : 3.0
      };
    });

    if (newSeq.length > 0) {
      setRoutings(routings.map((p, idx) => (idx === partIdx ? { ...p, sequence: newSeq } : p)));
    }
    setQuickEditIdx(null);
  };

  // --- MODE B: ROBOT TASKS HANDLERS ---
  const handleAddRobotTaskStep = () => {
    if (!newRobotId || !newFromEntity || !newToEntity) return;

    const existingTask = tasks.find(t => t.robot_id === newRobotId);
    const newStep: RobotTaskStep = {
      from: newFromEntity,
      to: newToEntity,
      process_s: newProcessTime
    };

    if (existingTask) {
      setTasks(tasks.map(t =>
        t.robot_id === newRobotId ? { ...t, sequence: [...t.sequence, newStep] } : t
      ));
    } else {
      setTasks([...tasks, { robot_id: newRobotId, sequence: [newStep] }]);
    }
  };

  const handleUpdateRobotStep = (robotId: string, stepIdx: number, field: keyof RobotTaskStep, value: any) => {
    setTasks(tasks.map(t => {
      if (t.robot_id === robotId) {
        const updatedSeq = t.sequence.map((s, idx) => (idx === stepIdx ? { ...s, [field]: value } : s));
        return { ...t, sequence: updatedSeq };
      }
      return t;
    }));
  };

  const handleMoveRobotStep = (robotId: string, stepIdx: number, direction: 'up' | 'down') => {
    setTasks(tasks.map(t => {
      if (t.robot_id === robotId) {
        const seq = [...t.sequence];
        const targetIdx = direction === 'up' ? stepIdx - 1 : stepIdx + 1;
        if (targetIdx < 0 || targetIdx >= seq.length) return t;
        const temp = seq[stepIdx];
        seq[stepIdx] = seq[targetIdx];
        seq[targetIdx] = temp;
        return { ...t, sequence: seq };
      }
      return t;
    }));
  };

  const handleRemoveRobotTaskStep = (robotId: string, stepIdx: number) => {
    setTasks(tasks.map(t => {
      if (t.robot_id === robotId) {
        return { ...t, sequence: t.sequence.filter((_, idx) => idx !== stepIdx) };
      }
      return t;
    }).filter(t => t.sequence.length > 0));
  };

  const handleDeleteRobotTask = (robotId: string) => {
    setTasks(tasks.filter(t => t.robot_id !== robotId));
  };

  const handleSave = () => {
    onUpdateTasksAndRoutings(routings, tasks, taktTime);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1c1f24] border border-[#2d3239] rounded-lg shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col text-slate-200">
        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-[#2d3239] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <GitBranch className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold tracking-wide uppercase text-white">
              {config.project_mode === 'CELLULAR_CMS'
                ? 'Manufacturing Part Routings & Operational Sequences'
                : 'Cyclic Robot Tasks & Collaborative Sequences'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#282c34]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 text-xs">
          {config.project_mode === 'CELLULAR_CMS' ? (
            /* ============================================================ */
            /* MODE A: FULLY INTERACTIVE PART ROUTINGS & OPERATIONS PIPELINE */
            /* ============================================================ */
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-[#16181d] p-3 rounded border border-[#2d3239]">
                <div>
                  <div className="font-semibold text-white">Part Catalog & Production Sequence Pipeline</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Define operational steps, machine assignments, and cycle times. Sequences dictate material handling flow ($z_1$) and grouping efficacy ($\Gamma$).
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddPart}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded shadow transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Part Routing</span>
                </button>
              </div>

              {routings.length === 0 ? (
                <div className="p-8 text-center bg-[#16181d] border border-[#2d3239] rounded-lg text-slate-400">
                  <Layers className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <div className="font-semibold text-white text-sm">No Part Routings Configured</div>
                  <div className="text-xs text-slate-400 mt-1">Click "+ Add Part Routing" above to add parts and operational sequences.</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {routings.map((part, pIdx) => (
                    <div key={pIdx} className="p-3.5 bg-[#16181d] border border-[#2d3239] hover:border-[#3e444e] rounded-lg space-y-3 transition-colors">
                      {/* Part Header: ID, Demand, Batch, Quick Edit Toggle, Delete */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252930] pb-2.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-[10px] bg-orange-950/60 border border-orange-800/60 text-orange-400 px-1.5 py-0.5 rounded font-bold">
                            #{pIdx + 1}
                          </span>
                          <input
                            type="text"
                            value={part.part_id}
                            onChange={e => handleUpdatePartMeta(pIdx, 'part_id', e.target.value)}
                            placeholder="Part ID / Name"
                            className="bg-[#1c1f24] border border-[#2d3239] focus:border-orange-500 rounded px-2 py-1 font-mono font-bold text-white text-xs w-44"
                          />
                        </div>

                        <div className="flex items-center space-x-3 text-[11px]">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-slate-400">Demand:</span>
                            <input
                              type="number"
                              value={part.annual_demand}
                              onChange={e => handleUpdatePartMeta(pIdx, 'annual_demand', parseInt(e.target.value) || 0)}
                              className="bg-[#1c1f24] border border-[#2d3239] rounded px-1.5 py-0.5 w-20 text-white font-mono text-right"
                            />
                            <span className="text-slate-400">/yr</span>
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <span className="text-slate-400">Batch:</span>
                            <input
                              type="number"
                              value={part.batch_size}
                              onChange={e => handleUpdatePartMeta(pIdx, 'batch_size', parseInt(e.target.value) || 1)}
                              className="bg-[#1c1f24] border border-[#2d3239] rounded px-1.5 py-0.5 w-16 text-white font-mono text-right"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => (quickEditIdx === pIdx ? setQuickEditIdx(null) : handleStartQuickEdit(pIdx))}
                            className={`p-1 rounded border transition-colors ${
                              quickEditIdx === pIdx
                                ? 'bg-orange-600 border-orange-500 text-white'
                                : 'bg-[#282c34] border-[#3e444e] text-slate-300 hover:text-white'
                            }`}
                            title="Edit sequence as text (M1 -> M2 -> M3)"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeletePart(pIdx)}
                            className="p-1 text-slate-400 hover:text-red-400 rounded hover:bg-[#282c34]"
                            title="Delete part routing"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Quick Syntax Editor */}
                      {quickEditIdx === pIdx && (
                        <div className="p-2 bg-[#1c1f24] border border-orange-500/50 rounded-md space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>Quick Syntax Editor (e.g. CNC_01 -&gt; VMC_01 -&gt; Grinder_01 -&gt; CMM_01)</span>
                            <span className="font-mono text-orange-400">Delimiter: -&gt; or comma</span>
                          </div>
                          <div className="flex space-x-1.5">
                            <input
                              type="text"
                              value={quickEditText}
                              onChange={e => setQuickEditText(e.target.value)}
                              className="flex-1 bg-[#16181d] border border-[#2d3239] rounded px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-orange-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleApplyQuickEdit(pIdx)}
                              className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded font-medium flex items-center space-x-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Apply Text</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Interactive Sequence Steps Chain */}
                      <div>
                        <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-2 flex items-center space-x-2">
                          <span>Operational Sequence Chain ({part.sequence.length} operations)</span>
                          <span className="text-slate-500">· Use arrows to re-order sequence</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {part.sequence.map((op, oIdx) => (
                            <div key={oIdx} className="flex items-center">
                              {/* Step Card */}
                              <div className="bg-[#1c1f24] border border-[#2d3239] hover:border-orange-500/60 rounded p-2 flex flex-col space-y-1.5 shadow-sm min-w-[155px]">
                                <div className="flex items-center justify-between border-b border-[#2d3239] pb-1">
                                  <div className="flex items-center space-x-1 font-mono text-[10px] text-slate-400">
                                    <span>Step {oIdx + 1}</span>
                                  </div>
                                  {/* Step Reorder & Delete */}
                                  <div className="flex items-center space-x-0.5">
                                    <button
                                      type="button"
                                      disabled={oIdx === 0}
                                      onClick={() => handleMoveOperation(pIdx, oIdx, 'left')}
                                      className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 rounded"
                                      title="Move step earlier in sequence"
                                    >
                                      <ChevronLeft className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={oIdx === part.sequence.length - 1}
                                      onClick={() => handleMoveOperation(pIdx, oIdx, 'right')}
                                      className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 rounded"
                                      title="Move step later in sequence"
                                    >
                                      <ChevronRight className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveOperation(pIdx, oIdx)}
                                      className="p-0.5 text-slate-400 hover:text-red-400 rounded ml-1"
                                      title="Remove operation"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                {/* Machine Selector */}
                                <div>
                                  <input
                                    type="text"
                                    list={`machines-list-${pIdx}-${oIdx}`}
                                    value={op.machine_type}
                                    onChange={e => handleUpdateOperation(pIdx, oIdx, 'machine_type', e.target.value)}
                                    placeholder="Machine / Type"
                                    className="w-full bg-[#16181d] border border-[#2d3239] rounded px-1.5 py-1 text-white font-mono text-[11px] focus:outline-none focus:border-orange-500"
                                  />
                                  <datalist id={`machines-list-${pIdx}-${oIdx}`}>
                                    {candidateMachines.map((m, mIdx) => (
                                      <option key={mIdx} value={m} />
                                    ))}
                                  </datalist>
                                </div>

                                {/* Cycle Time Input */}
                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                  <div className="flex items-center space-x-1">
                                    <Clock className="w-3 h-3 text-orange-400" />
                                    <span>Cycle:</span>
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={op.cycle_min}
                                      onChange={e => handleUpdateOperation(pIdx, oIdx, 'cycle_min', parseFloat(e.target.value) || 0.1)}
                                      className="w-12 bg-[#16181d] border border-[#2d3239] rounded px-1 py-0.5 text-right font-mono text-white text-[10px]"
                                    />
                                    <span>min</span>
                                  </div>
                                </div>
                              </div>

                              {/* Pipeline arrow separator */}
                              {oIdx < part.sequence.length - 1 && (
                                <ArrowRight className="w-4 h-4 text-slate-500 mx-1.5 shrink-0" />
                              )}
                            </div>
                          ))}

                          {/* + Add Step to Sequence */}
                          <button
                            type="button"
                            onClick={() => handleAddOperation(pIdx)}
                            className="flex items-center space-x-1 px-3 py-2 bg-[#282c34] hover:bg-[#323842] border border-dashed border-[#3e444e] hover:border-orange-500 rounded text-slate-300 hover:text-white transition-colors h-[86px]"
                            title="Add next operation to this sequence"
                          >
                            <Plus className="w-4 h-4 text-orange-400" />
                            <span className="text-[11px] font-medium">+ Operation</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ============================================================ */
            /* MODE B: FULLY INTERACTIVE ROBOT CYCLIC TASKS & STEPS PIPELINE */
            /* ============================================================ */
            <div className="space-y-4">
              {/* Takt Time & Quick Add Header */}
              <div className="p-3.5 bg-[#16181d] border border-[#2d3239] rounded-md space-y-3">
                <div className="flex items-center justify-between border-b border-[#2d3239] pb-2">
                  <span className="font-semibold text-white uppercase text-[11px] tracking-wider">
                    Add Cyclic Robot Pick-and-Place Trajectory
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-400 text-[11px]">Cell Target Takt Time:</span>
                    <input
                      type="number"
                      step="1"
                      value={taktTime}
                      onChange={e => setTaktTime(parseFloat(e.target.value) || 45.0)}
                      className="w-16 bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-0.5 text-white font-mono text-right"
                    />
                    <span className="text-slate-400 text-[11px]">s</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Assigned Robot</label>
                    <select
                      value={newRobotId}
                      onChange={e => setNewRobotId(e.target.value)}
                      className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1.5 text-white"
                    >
                      <option value="">Select Robot</option>
                      {robots.map(r => (
                        <option key={r.id} value={r.id}>{r.id} ({r.model || 'Robot'})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Pick Target (From)</label>
                    <select
                      value={newFromEntity}
                      onChange={e => setNewFromEntity(e.target.value)}
                      className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1.5 text-white"
                    >
                      <option value="">Select Target</option>
                      {fixtures.map(f => (
                        <option key={f.id} value={f.id}>{f.id} ({f.model || f.category})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Place Target (To)</label>
                    <select
                      value={newToEntity}
                      onChange={e => setNewToEntity(e.target.value)}
                      className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1.5 text-white"
                    >
                      <option value="">Select Target</option>
                      {fixtures.map(f => (
                        <option key={f.id} value={f.id}>{f.id} ({f.model || f.category})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Process Time (s)</label>
                    <div className="flex space-x-1.5">
                      <input
                        type="number"
                        step="0.5"
                        value={newProcessTime}
                        onChange={e => setNewProcessTime(Number(e.target.value))}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1.5 text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleAddRobotTaskStep}
                        disabled={!newRobotId || !newFromEntity || !newToEntity}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded font-bold transition-colors shrink-0"
                      >
                        + Add Step
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Configured Robot Sequences */}
              <div className="space-y-3">
                <span className="font-semibold text-white uppercase text-[11px] tracking-wider block">
                  Configured Robot Task Sequences ({tasks.length})
                </span>

                {tasks.length === 0 ? (
                  <div className="p-8 text-center bg-[#16181d] border border-[#2d3239] rounded-lg text-slate-400">
                    <Layers className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                    <div className="font-semibold text-white text-sm">No Robot Sequences Configured</div>
                    <div className="text-xs text-slate-400 mt-1">Select a robot and pick/place targets above to configure cyclic tasks.</div>
                  </div>
                ) : (
                  tasks.map((task, tIdx) => {
                    const totalTime = task.sequence.reduce((acc, s) => acc + (s.process_s || 0), 0);
                    return (
                      <div key={tIdx} className="p-3.5 bg-[#16181d] border border-[#2d3239] rounded-md space-y-2.5">
                        <div className="flex items-center justify-between border-b border-[#252930] pb-2">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-orange-400 font-mono text-xs">
                              Robot: {task.robot_id}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 bg-[#1c1f24] px-2 py-0.5 rounded border border-[#2d3239]">
                              Total Process: {totalTime.toFixed(1)}s / cycle
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteRobotTask(task.robot_id)}
                            className="text-slate-400 hover:text-red-400 text-xs flex items-center space-x-1"
                            title="Delete entire robot sequence"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Sequence</span>
                          </button>
                        </div>

                        {/* List of Steps in Robot Sequence */}
                        <div className="space-y-2">
                          {task.sequence.map((step, sIdx) => (
                            <div
                              key={sIdx}
                              className="flex items-center justify-between bg-[#1c1f24] px-3 py-2 rounded border border-[#2d3239] hover:border-[#3e444e] transition-colors"
                            >
                              <div className="flex items-center space-x-3 font-mono text-[11px] flex-1">
                                <span className="text-slate-400 font-bold w-5">#{sIdx + 1}</span>

                                {/* Pick (From) dropdown */}
                                <select
                                  value={step.from}
                                  onChange={e => handleUpdateRobotStep(task.robot_id, sIdx, 'from', e.target.value)}
                                  className="bg-[#16181d] border border-[#2d3239] rounded px-2 py-1 text-white font-mono text-xs"
                                >
                                  {fixtures.map(f => (
                                    <option key={f.id} value={f.id}>{f.id}</option>
                                  ))}
                                </select>

                                <ArrowRight className="w-4 h-4 text-orange-400 shrink-0" />

                                {/* Place (To) dropdown */}
                                <select
                                  value={step.to}
                                  onChange={e => handleUpdateRobotStep(task.robot_id, sIdx, 'to', e.target.value)}
                                  className="bg-[#16181d] border border-[#2d3239] rounded px-2 py-1 text-white font-mono text-xs"
                                >
                                  {fixtures.map(f => (
                                    <option key={f.id} value={f.id}>{f.id}</option>
                                  ))}
                                </select>

                                {/* Process Time */}
                                <div className="flex items-center space-x-1 pl-2">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <input
                                    type="number"
                                    step="0.5"
                                    value={step.process_s}
                                    onChange={e => handleUpdateRobotStep(task.robot_id, sIdx, 'process_s', parseFloat(e.target.value) || 0.1)}
                                    className="w-14 bg-[#16181d] border border-[#2d3239] rounded px-1.5 py-0.5 text-right text-white font-mono text-xs"
                                  />
                                  <span className="text-slate-400 text-[10px]">s</span>
                                </div>
                              </div>

                              {/* Reorder and Delete Step */}
                              <div className="flex items-center space-x-1">
                                <button
                                  type="button"
                                  disabled={sIdx === 0}
                                  onClick={() => handleMoveRobotStep(task.robot_id, sIdx, 'up')}
                                  className="p-1 text-slate-400 hover:text-white disabled:opacity-20 rounded"
                                  title="Move step up"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={sIdx === task.sequence.length - 1}
                                  onClick={() => handleMoveRobotStep(task.robot_id, sIdx, 'down')}
                                  className="p-1 text-slate-400 hover:text-white disabled:opacity-20 rounded"
                                  title="Move step down"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRobotTaskStep(task.robot_id, sIdx)}
                                  className="p-1 text-slate-400 hover:text-red-400 rounded ml-1"
                                  title="Remove step"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#2d3239] flex items-center justify-between bg-[#16181d]">
          <div className="text-[11px] text-slate-400">
            Applying sequences updates material flow lines, cell grouping efficacy, and discrete-event simulation live.
          </div>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-[#282c34] hover:bg-[#323842] text-slate-300 rounded font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded shadow transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Sequences</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
