import React, { useState, useEffect, useMemo } from 'react';
import { LayoutEntity, ProjectMode, Dimensions, Clearances, RobotKinematics } from '../types';
import {
  X,
  Plus,
  Search,
  Filter,
  Bookmark,
  Trash2,
  Check,
  Zap,
  Shield,
  Wrench,
  Boxes,
  Copy,
  Info,
  Tag,
  Volume2,
  ArrowRight,
  Layers,
  Sparkles
} from 'lucide-react';

interface AddAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEntity: (entity: LayoutEntity) => void;
  projectMode: ProjectMode;
  existingIds: string[];
}

export interface CatalogMachineItem {
  model: string;
  category: string;
  label: string;
  description?: string;
  dimensions: { L: number; W: number; H: number };
  clearances: { front: number; back: number; left: number; right: number };
  power_kw?: number;
  noise_lw_db?: number;
  utilities?: string[];
  hazard_tags?: string[];
  sensitive_tags?: string[];
  kinematics?: RobotKinematics;
  safety_mode?: string;
  approach_speed_m_s?: number;
  typical_cost_inr?: number;
  relocation_cost_inr?: number;
  is_custom?: boolean;
}

type TabType = 'catalog' | 'create_custom' | 'my_custom';

export const AddAssetModal: React.FC<AddAssetModalProps> = ({
  isOpen,
  onClose,
  onAddEntity,
  projectMode,
  existingIds
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('catalog');

  // Catalog State
  const [catalogItems, setCatalogItems] = useState<CatalogMachineItem[]>([]);
  const [customCatalog, setCustomCatalog] = useState<CatalogMachineItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'area' | 'power'>('name');

  // Custom Form State
  const [idPrefix, setIdPrefix] = useState<string>('M');
  const [model, setModel] = useState<string>('');
  const [label, setLabel] = useState<string>('');
  const [category, setCategory] = useState<string>('vmc');
  const [description, setDescription] = useState<string>('');
  
  // Dimensions
  const [length, setLength] = useState<number>(2.5);
  const [width, setWidth] = useState<number>(2.0);
  const [height, setHeight] = useState<number>(2.0);

  // Clearances
  const [frontClearance, setFrontClearance] = useState<number>(1.2);
  const [backClearance, setBackClearance] = useState<number>(0.8);
  const [leftClearance, setLeftClearance] = useState<number>(0.6);
  const [rightClearance, setRightClearance] = useState<number>(0.6);

  // Power & Environment
  const [powerKw, setPowerKw] = useState<number>(15.0);
  const [noiseLw, setNoiseLw] = useState<number>(75.0);
  const [relocationCost, setRelocationCost] = useState<number>(150000);
  const [selectedUtilities, setSelectedUtilities] = useState<string[]>(['power_3ph', 'compressed_air']);
  const [hazardTags, setHazardTags] = useState<string>('');
  const [sensitiveTags, setSensitiveTags] = useState<string>('');

  // Robot specifics
  const [isRobot, setIsRobot] = useState<boolean>(false);
  const [rMin, setRMin] = useState<number>(0.35);
  const [rMax, setRMax] = useState<number>(1.65);
  const [axis1Speed, setAxis1Speed] = useState<number>(175);
  const [maxPayload, setMaxPayload] = useState<number>(20.0);
  const [stopTime, setStopTime] = useState<number>(0.25);
  const [reactionTime, setReactionTime] = useState<number>(0.08);
  const [safetyMode, setSafetyMode] = useState<string>('SSM');

  // Success message toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load Catalogs from Backend and LocalStorage
  const loadCatalogs = async () => {
    try {
      // 1. Fetch from backend
      const res = await fetch('http://localhost:8000/api/catalogs');
      if (res.ok) {
        const data = await res.json();
        const modeA = (data.mode_a_cms || []).map((m: any) => ({ ...m, is_custom: false }));
        const modeB = (data.mode_b_robotic || []).map((m: any) => ({ ...m, is_custom: false }));
        const serverCustom = (data.custom_machines || []).map((m: any) => ({ ...m, is_custom: true }));

        // 2. Local storage custom machines as fallback/merge
        const localSaved = localStorage.getItem('optilayout_custom_machines');
        const localCustom: CatalogMachineItem[] = localSaved ? JSON.parse(localSaved) : [];

        // Merge custom items by model name
        const customMap = new Map<string, CatalogMachineItem>();
        serverCustom.forEach((m: CatalogMachineItem) => customMap.set(m.model, m));
        localCustom.forEach((m: CatalogMachineItem) => customMap.set(m.model, { ...m, is_custom: true }));
        const combinedCustom = Array.from(customMap.values());

        setCustomCatalog(combinedCustom);
        setCatalogItems([...modeA, ...modeB, ...combinedCustom]);
        return;
      }
    } catch (err) {
      console.warn("Could not fetch remote catalog, falling back to local defaults.");
    }

    // Fallback: load from localStorage
    const localSaved = localStorage.getItem('optilayout_custom_machines');
    if (localSaved) {
      try {
        const parsed = JSON.parse(localSaved);
        setCustomCatalog(parsed);
      } catch (e) {}
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCatalogs();
      setToastMessage(null);
    }
  }, [isOpen]);

  // Sync category change to robot flag
  useEffect(() => {
    const isRob = category.startsWith('robot') || category === 'cobot';
    setIsRobot(isRob);
    if (isRob && idPrefix === 'M') {
      setIdPrefix(category === 'cobot' ? 'COBOT' : 'ROBOT');
    }
  }, [category]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Unique ID Generator
  const generateUniqueId = (prefix: string) => {
    let count = 1;
    let newId = `${prefix}_${count.toString().padStart(2, '0')}`;
    while (existingIds.includes(newId)) {
      count++;
      newId = `${prefix}_${count.toString().padStart(2, '0')}`;
    }
    return newId;
  };

  // Add an item directly to the active floorplan
  const handleAddPresetToFloorplan = (preset: CatalogMachineItem) => {
    const prefix = preset.is_custom
      ? (preset.category.toUpperCase().slice(0, 5) || 'CUST')
      : (preset.model.split('_')[0] || 'M');

    const newId = generateUniqueId(prefix);

    const newEntity: LayoutEntity = {
      id: newId,
      model: preset.model,
      category: preset.category,
      dimensions: { ...preset.dimensions },
      clearances: { ...preset.clearances },
      utilities: preset.utilities ? [...preset.utilities] : ['power_3ph'],
      noise_lw_db: preset.noise_lw_db || 70.0,
      hazard_tags: preset.hazard_tags ? [...preset.hazard_tags] : [],
      sensitive_tags: preset.sensitive_tags ? [...preset.sensitive_tags] : [],
      kinematics: preset.kinematics ? { ...preset.kinematics } : undefined,
      safety_mode: preset.safety_mode,
      approach_speed_m_s: preset.approach_speed_m_s,
      relocation_cost_inr: preset.relocation_cost_inr || 100000.0,
      x: 10.0 + (Math.random() * 4 - 2),
      y: 8.0 + (Math.random() * 4 - 2),
      theta: 0.0,
      is_pinned: false
    };

    onAddEntity(newEntity);
    showToast(`Added ${newId} (${preset.model}) to floorplan`);
  };

  // Populate Custom Form using a preset as a base template
  const handleUseAsTemplate = (item: CatalogMachineItem) => {
    setModel(`${item.model}_Custom`);
    setLabel(`${item.label || item.model} (Custom)`);
    setCategory(item.category);
    setDescription(item.description || '');
    setLength(item.dimensions.L);
    setWidth(item.dimensions.W);
    setHeight(item.dimensions.H);
    setFrontClearance(item.clearances.front);
    setBackClearance(item.clearances.back);
    setLeftClearance(item.clearances.left);
    setRightClearance(item.clearances.right);
    setPowerKw(item.power_kw || 15.0);
    setNoiseLw(item.noise_lw_db || 75.0);
    setRelocationCost(item.relocation_cost_inr || 150000);
    setSelectedUtilities(item.utilities ? [...item.utilities] : ['power_3ph']);
    setHazardTags((item.hazard_tags || []).join(', '));
    setSensitiveTags((item.sensitive_tags || []).join(', '));

    if (item.kinematics) {
      setIsRobot(true);
      setRMin(item.kinematics.r_min_m);
      setRMax(item.kinematics.r_max_m);
      setAxis1Speed(item.kinematics.axis1_deg_s);
      setMaxPayload(item.kinematics.max_payload_kg || 20.0);
      setStopTime(item.kinematics.stop_time_s || 0.25);
      setReactionTime(item.kinematics.reaction_time_s || 0.08);
      setSafetyMode(item.safety_mode || 'SSM');
    } else {
      setIsRobot(false);
    }

    setActiveTab('create_custom');
  };

  // Construct Custom Machine Object from Form
  const buildCustomMachineObject = (): CatalogMachineItem => {
    const finalModel = model.trim() || `Custom_${Date.now().toString().slice(-4)}`;
    const finalLabel = label.trim() || finalModel;

    const hazList = hazardTags.split(',').map(s => s.trim()).filter(Boolean);
    const sensList = sensitiveTags.split(',').map(s => s.trim()).filter(Boolean);

    let kin: RobotKinematics | undefined = undefined;
    if (isRobot) {
      kin = {
        r_min_m: rMin,
        r_max_m: rMax,
        axis1_deg_s: axis1Speed,
        stop_time_s: stopTime,
        reaction_time_s: reactionTime,
        max_payload_kg: maxPayload
      };
    }

    return {
      model: finalModel,
      category,
      label: finalLabel,
      description: description.trim() || 'Custom plant equipment defined by user.',
      dimensions: { L: length, W: width, H: height },
      clearances: { front: frontClearance, back: backClearance, left: leftClearance, right: rightClearance },
      power_kw: powerKw,
      noise_lw_db: noiseLw,
      utilities: selectedUtilities,
      hazard_tags: hazList,
      sensitive_tags: sensList,
      kinematics: kin,
      safety_mode: isRobot ? safetyMode : undefined,
      relocation_cost_inr: relocationCost,
      is_custom: true
    };
  };

  // Save to persistent Custom Catalog
  const handleSaveToCatalog = async () => {
    const newMachine = buildCustomMachineObject();

    // 1. Save to local storage
    const updatedCustom = [...customCatalog.filter(m => m.model !== newMachine.model), newMachine];
    setCustomCatalog(updatedCustom);
    setCatalogItems(prev => [...prev.filter(m => m.model !== newMachine.model), newMachine]);
    localStorage.setItem('optilayout_custom_machines', JSON.stringify(updatedCustom));

    // 2. Persist to backend API if reachable
    try {
      await fetch('http://localhost:8000/api/catalogs/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMachine)
      });
    } catch (e) {
      console.warn("Could not persist custom machine to server; saved to localStorage.");
    }

    showToast(`Saved "${newMachine.label}" to Custom Catalog`);
    setActiveTab('my_custom');
  };

  // Add custom machine directly to floorplan
  const handleAddCustomToFloorplan = () => {
    const newMachine = buildCustomMachineObject();
    handleAddPresetToFloorplan(newMachine);
    onClose();
  };

  // Save and add in one click
  const handleSaveAndAdd = async () => {
    await handleSaveToCatalog();
    const newMachine = buildCustomMachineObject();
    handleAddPresetToFloorplan(newMachine);
    onClose();
  };

  // Delete from Custom Catalog
  const handleDeleteCustomMachine = async (modelName: string) => {
    const updated = customCatalog.filter(m => m.model !== modelName);
    setCustomCatalog(updated);
    setCatalogItems(catalogItems.filter(m => m.model !== modelName));
    localStorage.setItem('optilayout_custom_machines', JSON.stringify(updated));

    try {
      await fetch(`http://localhost:8000/api/catalogs/custom/${modelName}`, {
        method: 'DELETE'
      });
    } catch (e) {}

    showToast(`Deleted ${modelName} from catalog.`);
  };

  // Filter & Search Logic
  const filteredCatalog = useMemo(() => {
    let list = activeTab === 'my_custom' ? customCatalog : catalogItems;

    // Filter by category
    if (selectedCategory !== 'all') {
      if (selectedCategory === 'cnc') {
        list = list.filter(m => ['vmc', 'vmc_5axis', 'hmc', 'cnc_turning', 'swiss_lathe'].includes(m.category));
      } else if (selectedCategory === 'robotics') {
        list = list.filter(m => ['robot_6axis', 'cobot', 'robot_scara', 'robot_delta'].includes(m.category));
      } else if (selectedCategory === 'ev_battery') {
        list = list.filter(m => ['battery_equipment', 'feeder', 'welder', 'inspection'].includes(m.category));
      } else if (selectedCategory === 'grinding') {
        list = list.filter(m => ['grinder', 'manual_station'].includes(m.category));
      } else if (selectedCategory === 'forming') {
        list = list.filter(m => ['forming', 'cutting', 'saw'].includes(m.category));
      } else if (selectedCategory === 'metrology') {
        list = list.filter(m => ['cmm', 'optical_inspection'].includes(m.category));
      } else if (selectedCategory === 'logistics') {
        list = list.filter(m => ['logistics', 'storage', 'conveyor'].includes(m.category));
      } else if (selectedCategory === 'human') {
        list = list.filter(m => ['human_station', 'manual'].includes(m.category));
      } else if (selectedCategory === 'custom') {
        list = list.filter(m => m.is_custom);
      }
    }

    // Filter by text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(m =>
        m.model.toLowerCase().includes(q) ||
        (m.label && m.label.toLowerCase().includes(q)) ||
        (m.description && m.description.toLowerCase().includes(q)) ||
        m.category.toLowerCase().includes(q)
      );
    }

    // Sort
    return [...list].sort((a, b) => {
      if (sortBy === 'area') {
        return (b.dimensions.L * b.dimensions.W) - (a.dimensions.L * a.dimensions.W);
      } else if (sortBy === 'power') {
        return (b.power_kw || 0) - (a.power_kw || 0);
      }
      return (a.label || a.model).localeCompare(b.label || b.model);
    });
  }, [catalogItems, customCatalog, activeTab, selectedCategory, searchQuery, sortBy]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1c1f24] border border-[#2d3239] rounded-lg shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col text-slate-200">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#2d3239] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Boxes className="w-4 h-4 text-orange-400" />
            <div>
              <h3 className="text-sm font-semibold tracking-wide uppercase text-white">
                Equipment Catalog & Machine Builder
              </h3>
              <div className="text-[10px] text-slate-400 font-mono">
                Verified Industrial OEM Library | User-Defined Equipment Specification
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#282c34]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-[#2d3239] bg-[#16181d] px-5 text-xs">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center space-x-1.5 py-2.5 px-3 font-medium border-b-2 transition-colors ${
                activeTab === 'catalog'
                  ? 'border-orange-500 text-white bg-[#1c1f24]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Full Machine Catalog ({catalogItems.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('create_custom')}
              className={`flex items-center space-x-1.5 py-2.5 px-3 font-medium border-b-2 transition-colors ${
                activeTab === 'create_custom'
                  ? 'border-orange-500 text-white bg-[#1c1f24]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-orange-400" />
              <span>Create Custom Machine</span>
            </button>

            <button
              onClick={() => setActiveTab('my_custom')}
              className={`flex items-center space-x-1.5 py-2.5 px-3 font-medium border-b-2 transition-colors ${
                activeTab === 'my_custom'
                  ? 'border-orange-500 text-white bg-[#1c1f24]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-400" />
              <span>My Custom Library ({customCatalog.length})</span>
            </button>
          </div>

          {toastMessage && (
            <div className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2.5 py-1 rounded flex items-center space-x-1">
              <Check className="w-3 h-3" />
              <span>{toastMessage}</span>
            </div>
          )}
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1 text-xs">
          {/* TAB 1 & TAB 3: BROWSE CATALOG OR MY CUSTOM */}
          {(activeTab === 'catalog' || activeTab === 'my_custom') && (
            <div className="space-y-4">
              {/* Search, Filter Pills & Sort Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#16181d] p-3 rounded border border-[#2d3239]">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search machines by name, model, category, or specs..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-[#1c1f24] border border-[#2d3239] rounded pl-8 pr-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-orange-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Sort Option */}
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Sort:</span>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white text-[11px] font-mono"
                  >
                    <option value="name">Name (A-Z)</option>
                    <option value="area">Footprint Area (Largest)</option>
                    <option value="power">Power Load (kW)</option>
                  </select>
                </div>
              </div>

              {/* Category Pills (Catalog View) */}
              {activeTab === 'catalog' && (
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'all', label: 'All Equipment' },
                    { id: 'cnc', label: 'CNC Machining & Turning' },
                    { id: 'defense_special', label: 'Defense & Armament Processes' },
                    { id: 'grinding', label: 'Grinding & Finishing' },
                    { id: 'forming', label: 'Forming & Forging' },
                    { id: 'metrology', label: 'Metrology & AS9100D Quality' },
                    { id: 'robotics', label: 'Material Handling Automation' },
                    { id: 'logistics', label: 'Logistics & Buffers' },
                    { id: 'human', label: 'Human Workstations' },
                    { id: 'custom', label: 'User Custom' }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        selectedCategory === cat.id
                          ? 'bg-orange-600 text-white'
                          : 'bg-[#16181d] text-slate-400 hover:text-white border border-[#2d3239]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Machine Cards Grid */}
              {filteredCatalog.length === 0 ? (
                <div className="p-12 text-center bg-[#16181d] border border-[#2d3239] rounded-lg text-slate-400">
                  <Boxes className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <div className="font-semibold text-white text-sm">No machines match current criteria</div>
                  <div className="text-xs text-slate-400 mt-1">Try clearing your search query or category filters.</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredCatalog.map((item, idx) => {
                    const footprintArea = (item.dimensions.L * item.dimensions.W).toFixed(2);
                    return (
                      <div
                        key={idx}
                        className="bg-[#16181d] border border-[#2d3239] hover:border-orange-500/70 rounded-lg p-3.5 flex flex-col justify-between transition-colors shadow-sm space-y-2.5"
                      >
                        <div>
                          {/* Top Tag & Title */}
                          <div className="flex items-start justify-between gap-1">
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <span className="font-semibold text-white text-xs leading-tight">
                                  {item.label || item.model}
                                </span>
                                {item.is_custom && (
                                  <span className="font-mono text-[9px] bg-amber-950/60 border border-amber-800 text-amber-300 px-1 py-0.2 rounded">
                                    CUSTOM
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                Model: {item.model} | Category: {item.category}
                              </div>
                            </div>
                          </div>

                          {/* Description */}
                          {item.description && (
                            <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}

                          {/* Technical Specifications Grid */}
                          <div className="mt-2.5 p-2 bg-[#1c1f24] rounded border border-[#2d3239] grid grid-cols-2 gap-1.5 font-mono text-[10px] text-slate-300">
                            <div>
                              <span className="text-slate-500">Footprint: </span>
                              <span>{item.dimensions.L}×{item.dimensions.W}m</span>
                              <span className="text-slate-400 text-[9px] block">({footprintArea} m²)</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Height: </span>
                              <span>{item.dimensions.H}m</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Front Clr: </span>
                              <span>{item.clearances.front}m</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Noise: </span>
                              <span>{item.noise_lw_db} dB</span>
                            </div>

                            {/* Robot specific reach details */}
                            {item.kinematics && (
                              <div className="col-span-2 text-orange-400 pt-1 border-t border-[#252930]">
                                Reach: {item.kinematics.r_min_m}–{item.kinematics.r_max_m}m | Payload: {item.kinematics.max_payload_kg || 10}kg ({item.safety_mode || 'SSM'})
                              </div>
                            )}
                          </div>

                          {/* Utilities Chips */}
                          {item.utilities && item.utilities.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {item.utilities.map((u, uIdx) => (
                                <span
                                  key={uIdx}
                                  className="px-1.5 py-0.2 bg-[#282c34] text-slate-300 border border-[#3e444e] rounded font-mono text-[9px]"
                                >
                                  {u}
                                </span>
                              ))}
                              {item.power_kw && (
                                <span className="px-1.5 py-0.2 bg-[#282c34] text-amber-300 border border-[#3e444e] rounded font-mono text-[9px]">
                                  {item.power_kw} kW
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-2 border-t border-[#2d3239] flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => handleUseAsTemplate(item)}
                            className="flex items-center space-x-1 text-[10px] text-slate-400 hover:text-white"
                            title="Open in Custom Machine Builder to modify specifications"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Customize</span>
                          </button>

                          <div className="flex items-center space-x-1.5">
                            {item.is_custom && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomMachine(item.model)}
                                className="p-1 text-slate-400 hover:text-red-400"
                                title="Remove from custom catalog"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleAddPresetToFloorplan(item)}
                              className="flex items-center space-x-1 px-2.5 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded font-medium text-[11px] shadow transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              <span>+ Add to Hall</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CREATE CUSTOM MACHINE FORM */}
          {activeTab === 'create_custom' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="bg-[#16181d] p-3 rounded border border-[#2d3239] flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Define Your Own Custom Industrial Machine</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Configure physical footprints, maintenance access envelopes, utilities, and kinematics. Save to library or place immediately.
                  </div>
                </div>
              </div>

              <div className="space-y-4 bg-[#16181d] p-4 rounded-lg border border-[#2d3239]">
                {/* 1. Identification */}
                <div>
                  <span className="font-semibold text-white uppercase text-[11px] tracking-wider block mb-2 text-orange-400">
                    1. Identity & Classification
                  </span>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Model / Part No.</label>
                      <input
                        type="text"
                        placeholder="e.g. Makino_PS105"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:border-orange-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Display Label</label>
                      <input
                        type="text"
                        placeholder="e.g. Makino PS105 (VMC)"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2.5 py-1.5 text-white text-xs focus:border-orange-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Category</label>
                      <select
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1.5 text-white text-xs focus:border-orange-500 focus:outline-none"
                      >
                        <option value="vmc">Vertical Machining Center (VMC)</option>
                        <option value="vmc_5axis">5-Axis Machining Center</option>
                        <option value="hmc">Horizontal Machining Center (HMC)</option>
                        <option value="cnc_turning">CNC Turning Center / Lathe</option>
                        <option value="swiss_lathe">Swiss-Type Lathe</option>
                        <option value="grinder">Grinding / Finishing Machine</option>
                        <option value="forming">Press Brake / Stamping Press</option>
                        <option value="cutting">Fiber Laser / Plasma Cutter</option>
                        <option value="saw">Band Saw / Billet Cutter</option>
                        <option value="cmm">CMM Metrology</option>
                        <option value="optical_inspection">Vision / Optical Inspection</option>
                        <option value="robot_6axis">Articulated 6-Axis Robot</option>
                        <option value="cobot">Collaborative Robot (Cobot)</option>
                        <option value="robot_scara">SCARA Assembly Robot</option>
                        <option value="gun_drill">Deep-Hole Gun Drill / Rifling</option>
                        <option value="heat_treat">Vacuum Heat Treatment Furnace</option>
                        <option value="defense_special">Defense Special Process / NDT Bunker</option>
                        <option value="feeder">Parts Feeder / Tray Unloader</option>
                        <option value="welder">Laser / Resistance Welder</option>
                        <option value="logistics">AMR Dock / Conveyor</option>
                        <option value="storage">Storage / Kanban Rack</option>
                        <option value="human_station">Manual Human Station</option>
                        <option value="general_machinery">General Custom Machine</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-2">
                    <label className="block text-[10px] text-slate-400 mb-1">Description (Optional)</label>
                    <input
                      type="text"
                      placeholder="Brief industrial description, tooling capacity, and operational use..."
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2.5 py-1 text-white text-xs focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 2. Footprint & Clearances */}
                <div className="pt-2 border-t border-[#252930]">
                  <span className="font-semibold text-white uppercase text-[11px] tracking-wider block mb-2 text-orange-400">
                    2. Physical Dimensions & Clearances (Meters)
                  </span>
                  <div className="grid grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Length L (m)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={length}
                        onChange={e => setLength(parseFloat(e.target.value) || 1.0)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Width W (m)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={width}
                        onChange={e => setWidth(parseFloat(e.target.value) || 1.0)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Height H (m)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={height}
                        onChange={e => setHeight(parseFloat(e.target.value) || 1.0)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Footprint Area</label>
                      <div className="bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 font-mono text-orange-300">
                        {(length * width).toFixed(2)} m²
                      </div>
                    </div>
                  </div>

                  {/* Asymmetric Clearances */}
                  <div className="grid grid-cols-4 gap-2.5 mt-2.5">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Front Clearance (Operator)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={frontClearance}
                        onChange={e => setFrontClearance(parseFloat(e.target.value) || 0.0)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Rear Clearance (Cabinet)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={backClearance}
                        onChange={e => setBackClearance(parseFloat(e.target.value) || 0.0)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Left Clearance</label>
                      <input
                        type="number"
                        step="0.1"
                        value={leftClearance}
                        onChange={e => setLeftClearance(parseFloat(e.target.value) || 0.0)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Right Clearance (Conveyor)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={rightClearance}
                        onChange={e => setRightClearance(parseFloat(e.target.value) || 0.0)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Utilities, Power & Environmental */}
                <div className="pt-2 border-t border-[#252930]">
                  <span className="font-semibold text-white uppercase text-[11px] tracking-wider block mb-2 text-orange-400">
                    3. Utilities, Power & Acoustic Emissions
                  </span>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Electrical Power (kW)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={powerKw}
                        onChange={e => setPowerKw(parseFloat(e.target.value) || 0.0)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Sound Power Lw (dB)</label>
                      <input
                        type="number"
                        step="1"
                        value={noiseLw}
                        onChange={e => setNoiseLw(parseFloat(e.target.value) || 60.0)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Relocation Cost (INR)</label>
                      <input
                        type="number"
                        step="10000"
                        value={relocationCost}
                        onChange={e => setRelocationCost(parseFloat(e.target.value) || 50000)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Utility Requirements Selection */}
                  <div className="mt-2.5">
                    <label className="block text-[10px] text-slate-400 mb-1.5">Required Utility Drops</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'power_3ph', label: '415V 3-Phase Power' },
                        { id: 'compressed_air', label: 'Compressed Air (6-8 bar)' },
                        { id: 'chiller', label: 'Chiller Water Loop' },
                        { id: 'exhaust', label: 'Fume / Dust Exhaust' },
                        { id: 'inert_gas', label: 'Inert Shielding Gas' },
                        { id: 'clean_room_air', label: 'HEPA Cleanroom Air' }
                      ].map(util => {
                        const isChecked = selectedUtilities.includes(util.id);
                        return (
                          <button
                            key={util.id}
                            type="button"
                            onClick={() => {
                              if (isChecked) {
                                setSelectedUtilities(selectedUtilities.filter(u => u !== util.id));
                              } else {
                                setSelectedUtilities([...selectedUtilities, util.id]);
                              }
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors ${
                              isChecked
                                ? 'bg-orange-600/30 border-orange-500 text-orange-200'
                                : 'bg-[#1c1f24] border-[#2d3239] text-slate-400 hover:text-white'
                            }`}
                          >
                            {isChecked ? '✓ ' : '+ '}
                            {util.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 4. Robot Kinematics (If Robotic) */}
                {isRobot && (
                  <div className="pt-2 border-t border-[#252930]">
                    <span className="font-semibold text-white uppercase text-[11px] tracking-wider block mb-2 text-orange-400">
                      4. Robot Kinematics & ISO 10218 Safety Parameters
                    </span>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Dead-Zone Reach Rmin (m)</label>
                        <input
                          type="number"
                          step="0.05"
                          value={rMin}
                          onChange={e => setRMin(parseFloat(e.target.value) || 0.2)}
                          className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Max Reach Radius Rmax (m)</label>
                        <input
                          type="number"
                          step="0.05"
                          value={rMax}
                          onChange={e => setRMax(parseFloat(e.target.value) || 1.5)}
                          className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Axis-1 Speed (°/s)</label>
                        <input
                          type="number"
                          step="5"
                          value={axis1Speed}
                          onChange={e => setAxis1Speed(parseFloat(e.target.value) || 150)}
                          className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Payload (kg)</label>
                        <input
                          type="number"
                          step="0.5"
                          value={maxPayload}
                          onChange={e => setMaxPayload(parseFloat(e.target.value) || 10)}
                          className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Braking Stop Time (s)</label>
                        <input
                          type="number"
                          step="0.05"
                          value={stopTime}
                          onChange={e => setStopTime(parseFloat(e.target.value) || 0.2)}
                          className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">ISO 10218 Safety Mode</label>
                        <select
                          value={safetyMode}
                          onChange={e => setSafetyMode(e.target.value)}
                          className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 text-white text-xs"
                        >
                          <option value="SSM">Speed and Separation Monitoring (SSM)</option>
                          <option value="PFL">Power and Force Limiting (PFL Cobot)</option>
                          <option value="ENCLOSED">Guarded Enclosure / Safety Fence</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Hazard & Sensitivity Tags */}
                <div className="pt-2 border-t border-[#252930]">
                  <span className="font-semibold text-white uppercase text-[11px] tracking-wider block mb-2 text-orange-400">
                    5. Hazard & Sensitivity Tags
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Hazard Tags Generated (comma-separated)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. coolant_mist, dust, vibration, laser_class4"
                        value={hazardTags}
                        onChange={e => setHazardTags(e.target.value)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2.5 py-1 text-white font-mono text-xs focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Sensitive Tags Required (comma-separated)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. vibration_sensitive, dust_sensitive, noise_max_70dB"
                        value={sensitiveTags}
                        onChange={e => setSensitiveTags(e.target.value)}
                        className="w-full bg-[#1c1f24] border border-[#2d3239] rounded px-2.5 py-1 text-white font-mono text-xs focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('catalog')}
                  className="px-3 py-1.5 bg-[#282c34] hover:bg-[#323842] text-slate-300 rounded font-medium"
                >
                  Back to Catalog
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleSaveToCatalog}
                    className="flex items-center space-x-1 px-3.5 py-1.5 bg-[#282c34] hover:bg-[#323842] border border-[#3e444e] rounded text-slate-200 font-medium"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                    <span>Save to Catalog</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddCustomToFloorplan}
                    className="flex items-center space-x-1 px-3.5 py-1.5 bg-[#282c34] hover:bg-[#323842] border border-[#3e444e] rounded text-slate-200 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add to Hall Only</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAndAdd}
                    className="flex items-center space-x-1.5 px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded shadow transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save & Add to Hall</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
