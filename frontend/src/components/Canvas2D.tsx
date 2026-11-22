import React, { useRef, useState, useEffect } from 'react';
import { LayoutEntity, PlotSchema, ProjectConfig, ProjectMode } from '../types';
import { RotateCw, Pin, PinOff, ZoomIn, ZoomOut, Maximize2, AlertTriangle, Shield, Crosshair } from 'lucide-react';

interface Canvas2DProps {
  config: ProjectConfig;
  entities: LayoutEntity[];
  onEntitiesChange: (entities: LayoutEntity[]) => void;
  selectedEntityId: string | null;
  onSelectEntity: (id: string | null) => void;
  noiseFieldData?: any;
  overlappingPairs?: [string, string, number][];
  showClearances: boolean;
  showReachZones: boolean;
  showSafetySSM: boolean;
  showFlows: boolean;
  showUtilities: boolean;
  showNoiseHeatmap: boolean;
}

export const Canvas2D: React.FC<Canvas2DProps> = ({
  config,
  entities,
  onEntitiesChange,
  selectedEntityId,
  onSelectEntity,
  noiseFieldData,
  overlappingPairs = [],
  showClearances,
  showReachZones,
  showSafetySSM,
  showFlows,
  showUtilities,
  showNoiseHeatmap
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport pan & zoom state
  const [scale, setScale] = useState<number>(26.0); // pixels per meter
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 80, y: 80 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Dragging state
  const [draggingEntityId, setDraggingEntityId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Overlapping set for fast lookup
  const overlappingEntityIds = new Set<string>();
  overlappingPairs.forEach(([id1, id2]) => {
    overlappingEntityIds.add(id1);
    overlappingEntityIds.add(id2);
  });

  // Calculate plot bounding box
  const plotBounds = React.useMemo(() => {
    const xs = config.plot.boundary.map(p => p[0]);
    const ys = config.plot.boundary.map(p => p[1]);
    const minx = Math.min(...xs, 0);
    const maxx = Math.max(...xs, 20);
    const miny = Math.min(...ys, 0);
    const maxy = Math.max(...ys, 15);
    return { minx, maxx, miny, maxy, width: maxx - minx, height: maxy - miny };
  }, [config.plot.boundary]);

  // Transform world (meters) to canvas screen coords (pixels)
  const worldToScreen = (wx: number, wy: number) => {
    const sx = pan.x + (wx - plotBounds.minx) * scale;
    const sy = pan.y + (plotBounds.maxy - wy) * scale;
    return { x: sx, y: sy };
  };

  // Transform canvas screen coords to world (meters)
  const screenToWorld = (sx: number, sy: number) => {
    const wx = (sx - pan.x) / scale + plotBounds.minx;
    const wy = plotBounds.maxy - (sy - pan.y) / scale;
    return { x: wx, y: wy };
  };

  // Fit plot in view
  const fitToView = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const padding = 80;
    const availableW = canvas.width - padding * 2;
    const availableH = canvas.height - padding * 2;
    const scaleX = availableW / Math.max(1, plotBounds.width);
    const scaleY = availableH / Math.max(1, plotBounds.height);
    const newScale = Math.min(scaleX, scaleY, 45);
    setScale(newScale);
    setPan({
      x: padding + (availableW - plotBounds.width * newScale) / 2,
      y: padding + (availableH - plotBounds.height * newScale) / 2
    });
  };

  useEffect(() => {
    fitToView();
  }, [config.plot.boundary]);

  // Main Canvas Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // 1. Technical CAD Background
    ctx.fillStyle = '#121417';
    ctx.fillRect(0, 0, w, h);

    // 2. High-Precision Technical Grid
    ctx.lineWidth = 1;
    const meterStep = scale >= 22 ? 1 : 2;
    for (let mx = Math.floor(plotBounds.minx - 5); mx <= Math.ceil(plotBounds.maxx + 5); mx += meterStep) {
      const p1 = worldToScreen(mx, plotBounds.miny - 5);
      const p2 = worldToScreen(mx, plotBounds.maxy + 5);
      ctx.strokeStyle = mx === 0 ? '#374151' : '#1f242c';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Coordinate tick labels on bottom axis
      if (mx >= plotBounds.minx && mx <= plotBounds.maxx && mx % 5 === 0) {
        ctx.fillStyle = '#4b5563';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${mx}m`, p1.x, worldToScreen(mx, plotBounds.miny).y + 14);
      }
    }

    for (let my = Math.floor(plotBounds.miny - 5); my <= Math.ceil(plotBounds.maxy + 5); my += meterStep) {
      const p1 = worldToScreen(plotBounds.minx - 5, my);
      const p2 = worldToScreen(plotBounds.maxx + 5, my);
      ctx.strokeStyle = my === 0 ? '#374151' : '#1f242c';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      if (my >= plotBounds.miny && my <= plotBounds.maxy && my % 5 === 0) {
        ctx.fillStyle = '#4b5563';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${my}m`, worldToScreen(plotBounds.minx, my).x - 6, p1.y + 3);
      }
    }

    // 3. Acoustic Noise Heatmap Overlay
    if (showNoiseHeatmap && noiseFieldData && noiseFieldData.values) {
      const values = noiseFieldData.values;
      const res = noiseFieldData.grid_res;
      const minX = noiseFieldData.minx;
      const minY = noiseFieldData.miny;

      for (let i = 0; i < values.length; i++) {
        for (let j = 0; j < values[i].length; j++) {
          const db = values[i][j];
          const gx = minX + j * res;
          const gy = minY + i * res;
          const sp = worldToScreen(gx, gy + res);
          const cellW = res * scale;
          const cellH = res * scale;

          let alpha = 0.2;
          let r = 34, g = 197, b = 94;
          if (db > 70 && db <= 80) {
            r = 217; g = 119; b = 6; // technical amber
            alpha = 0.3;
          } else if (db > 80) {
            r = 220; g = 38; b = 38; // technical red
            alpha = 0.45;
          }

          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          ctx.fillRect(sp.x, sp.y, cellW, cellH);
        }
      }
    }

    // 4. Shop Floor Perimeter Boundary
    if (config.plot.boundary.length > 2) {
      ctx.beginPath();
      config.plot.boundary.forEach((pt, idx) => {
        const sp = worldToScreen(pt[0], pt[1]);
        if (idx === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(26, 29, 36, 0.7)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#4b5563';
      ctx.stroke();
    }

    // 5. Structural Columns / No-Go Pillars
    config.plot.no_go_zones.forEach(ng => {
      if (ng.polygon.length > 2) {
        ctx.beginPath();
        ng.polygon.forEach((pt, idx) => {
          const sp = worldToScreen(pt[0], pt[1]);
          if (idx === 0) ctx.moveTo(sp.x, sp.y);
          else ctx.lineTo(sp.x, sp.y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(220, 38, 38, 0.15)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#dc2626';
        ctx.stroke();

        const center = worldToScreen(
          (ng.polygon[0][0] + ng.polygon[2][0]) / 2,
          (ng.polygon[0][1] + ng.polygon[2][1]) / 2
        );
        ctx.fillStyle = '#ef4444';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ng.id, center.x, center.y);
      }
    });

    // 6. Docks & Emergency Exits
    config.plot.docks.forEach(dock => {
      const sp = worldToScreen(dock.point[0], dock.point[1]);
      ctx.beginPath();
      ctx.rect(sp.x - 10, sp.y - 10, 20, 20);
      ctx.fillStyle = dock.type === 'receiving' ? '#0284c7' : '#059669';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(dock.id, sp.x, sp.y - 14);
    });

    config.plot.emergency_exits.forEach(ex => {
      const sp = worldToScreen(ex.point[0], ex.point[1]);
      ctx.beginPath();
      ctx.rect(sp.x - 8, sp.y - 8, 16, 16);
      ctx.fillStyle = '#16a34a';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.fillStyle = '#22c55e';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`EXIT: ${ex.id}`, sp.x, sp.y - 12);
    });

    // 7. Mode A: Part Flow Spaghetti Arcs
    if (showFlows && config.part_routings && config.part_routings.length > 0) {
      config.part_routings.forEach((routing, r_idx) => {
        const flowColors = ['#0284c7', '#ea580c', '#059669', '#ca8a04'];
        const flowColor = flowColors[r_idx % flowColors.length];

        for (let s = 0; s < routing.sequence.length - 1; s++) {
          const m1 = entities.find(e => e.id === routing.sequence[s].machine_type || e.model === routing.sequence[s].machine_type || e.category === routing.sequence[s].machine_type);
          const m2 = entities.find(e => e.id === routing.sequence[s + 1].machine_type || e.model === routing.sequence[s + 1].machine_type || e.category === routing.sequence[s + 1].machine_type);
          if (m1 && m2) {
            const p1 = worldToScreen(m1.x, m1.y);
            const p2 = worldToScreen(m2.x, m2.y);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2 - 25;

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);
            ctx.strokeStyle = flowColor;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      });
    }

    // 8. Mode B: Robot Cyclic Task Trajectories (High-Visibility Vector Flow)
    if (showFlows && config.robot_tasks && config.robot_tasks.length > 0) {
      config.robot_tasks.forEach(task => {
        task.sequence.forEach(step => {
          const fromEnt = entities.find(e => e.id === step.from);
          const toEnt = entities.find(e => e.id === step.to);
          if (fromEnt && toEnt) {
            const p1 = worldToScreen(fromEnt.x, fromEnt.y);
            const p2 = worldToScreen(toEnt.x, toEnt.y);

            // Vector arrow from pick to place
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = '#ea580c'; // Industrial Safety Orange
            ctx.lineWidth = 2.0;
            ctx.setLineDash([6, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Arrow head
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            ctx.beginPath();
            ctx.moveTo(p2.x, p2.y);
            ctx.lineTo(p2.x - 10 * Math.cos(angle - Math.PI / 6), p2.y - 10 * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(p2.x - 10 * Math.cos(angle + Math.PI / 6), p2.y - 10 * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fillStyle = '#ea580c';
            ctx.fill();

            // Task time tag
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            ctx.fillStyle = '#fed7aa';
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.fillText(`${step.process_s}s`, midX, midY - 6);
          }
        });
      });
    }

    // 9. Steiner Overhead Utility Networks
    if (showUtilities && config.plot.utility_drops) {
      config.plot.utility_drops.forEach(drop => {
        const sp_drop = worldToScreen(drop.point[0], drop.point[1]);
        const targetEntities = entities.filter(e => e.utilities && e.utilities.includes(drop.utility));

        targetEntities.forEach(ent => {
          const sp_ent = worldToScreen(ent.x, ent.y);
          const corner = { x: sp_drop.x, y: sp_ent.y };

          ctx.beginPath();
          ctx.moveTo(sp_drop.x, sp_drop.y);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(sp_ent.x, sp_ent.y);
          ctx.strokeStyle = drop.utility === 'power_3ph' ? '#d97706' : '#0284c7';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      });
    }

    // 10. Mode B: Robot Kinematic Reach Annuli & ISO 10218-2 SSM Zones
    entities.forEach(entity => {
      const sp = worldToScreen(entity.x, entity.y);

      if (entity.kinematics && showReachZones) {
        const k = entity.kinematics;
        const rMaxPx = k.r_max_m * scale;
        const rMinPx = k.r_min_m * scale;
        const rOptMaxPx = 0.85 * k.r_max_m * scale;
        const rOptMinPx = 1.15 * k.r_min_m * scale;

        // Reach Envelope Outer (Radar Arc)
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rMaxPx, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(234, 88, 12, 0.08)'; // Safety Orange tint
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#f97316';
        ctx.stroke();

        // Dexterous Sweet-Spot Annulus (Optimal manipulability)
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rOptMaxPx, 0, Math.PI * 2);
        ctx.arc(sp.x, sp.y, rOptMinPx, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.12)'; // Emerald sweet spot
        ctx.fill();

        // Inner Dead-Zone Circle
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rMinPx, 0, Math.PI * 2);
        ctx.fillStyle = '#121417';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#dc2626';
        ctx.stroke();
      }

      // ISO 10218-2 Speed and Separation Monitoring (SSM) Rings
      if (entity.kinematics && showSafetySSM) {
        // Red Stop Zone (S_p at reduced speed) ~ 1.8m
        const rRed = 1.8 * scale;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rRed, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220, 38, 38, 0.12)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#dc2626';
        ctx.stroke();

        // Yellow Warning / Speed-Deration Zone (S_p at full speed) ~ 2.8m
        const rYellow = 2.8 * scale;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rYellow, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(217, 119, 6, 0.06)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#d97706';
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // 11. Draw Equipment (Clearances & Base Footprints)
    entities.forEach(entity => {
      const isSelected = entity.id === selectedEntityId;
      const isOverlapping = overlappingEntityIds.has(entity.id);
      const sp = worldToScreen(entity.x, entity.y);
      const rad = (-entity.theta * Math.PI) / 180.0;

      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(rad);

      const halfL = (entity.dimensions.L / 2) * scale;
      const halfW = (entity.dimensions.W / 2) * scale;

      // Asymmetric Operator & Maintenance Clearances
      if (showClearances) {
        const c = entity.clearances;
        const clX = -halfL - c.left * scale;
        const clY = -halfW - c.back * scale;
        const clW = (entity.dimensions.L + c.left + c.right) * scale;
        const clH = (entity.dimensions.W + c.front + c.back) * scale;

        ctx.strokeStyle = isOverlapping ? '#dc2626' : '#475569';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(clX, clY, clW, clH);
        ctx.setLineDash([]);
      }

      // Base Footprint Box
      ctx.beginPath();
      ctx.rect(-halfL, -halfW, halfL * 2, halfW * 2);

      // Industrial standard equipment color coding:
      // Machining: Steel/Slate (#2d3748)
      // Robots: Safety Orange (#ea580c)
      // Cobots: Cyan / Aluminum (#0284c7)
      // Human Station: Safety Teal (#0d9488)
      // Class-4 Laser Welder: Dark Amber with hazard border
      let fillColor = '#2d3748';
      let borderColor = '#4a5568';

      if (entity.category === 'robot_6axis') {
        if (entity.model?.includes('UR') || entity.safety_mode === 'PFL') {
          fillColor = '#0369a1'; // Cobot Blue
          borderColor = '#38bdf8';
        } else {
          fillColor = '#c2410c'; // Industrial Robot Orange
          borderColor = '#ea580c';
        }
      } else if (entity.category === 'human_station') {
        fillColor = '#0f766e'; // Safety Teal
        borderColor = '#14b8a6';
      } else if (entity.category === 'welder') {
        fillColor = '#78350f'; // Laser Amber
        borderColor = '#f59e0b';
      } else if (entity.category === 'grinder') {
        fillColor = '#854d0e'; // Grinder Yellow-Brown
        borderColor = '#eab308';
      } else if (entity.category === 'cmm') {
        fillColor = '#155e75'; // CMM Metrology Cyan
        borderColor = '#06b6d4';
      }

      ctx.fillStyle = fillColor;
      ctx.fill();

      // Border stroke
      ctx.lineWidth = isSelected ? 2.5 : isOverlapping ? 2.5 : 1.2;
      ctx.strokeStyle = isSelected ? '#ffffff' : isOverlapping ? '#dc2626' : borderColor;
      ctx.stroke();

      // Front orientation notch (+Y direction)
      ctx.beginPath();
      ctx.moveTo(-4, -halfW);
      ctx.lineTo(4, -halfW);
      ctx.lineTo(0, -halfW + 6);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Entity ID Label
      ctx.rotate(-rad);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(entity.id, 0, -3);

      if (entity.model) {
        ctx.font = '8px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(entity.model, 0, 8);
      }

      // Pinned status dot
      if (entity.is_pinned) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(halfL - 5, -halfW + 5, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });

  }, [
    scale, pan, entities, config, selectedEntityId, overlappingEntityIds,
    noiseFieldData, showClearances, showReachZones, showSafetySSM, showFlows, showUtilities, showNoiseHeatmap
  ]);

  // Pointer event handlers for drag and pan
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPt = screenToWorld(sx, sy);

    const clickedEntity = [...entities].reverse().find(entity => {
      const halfL = entity.dimensions.L / 2;
      const halfW = entity.dimensions.W / 2;
      return (
        worldPt.x >= entity.x - halfL &&
        worldPt.x <= entity.x + halfL &&
        worldPt.y >= entity.y - halfW &&
        worldPt.y <= entity.y + halfW
      );
    });

    if (clickedEntity) {
      onSelectEntity(clickedEntity.id);
      if (!clickedEntity.is_pinned) {
        setDraggingEntityId(clickedEntity.id);
        setDragOffset({
          x: worldPt.x - clickedEntity.x,
          y: worldPt.y - clickedEntity.y
        });
      }
    } else {
      onSelectEntity(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingEntityId) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const worldPt = screenToWorld(sx, sy);

      const updated = entities.map(entity => {
        if (entity.id === draggingEntityId) {
          const clampedX = Math.max(plotBounds.minx + 0.5, Math.min(plotBounds.maxx - 0.5, worldPt.x - dragOffset.x));
          const clampedY = Math.max(plotBounds.miny + 0.5, Math.min(plotBounds.maxy - 0.5, worldPt.y - dragOffset.y));
          return {
            ...entity,
            x: Math.round(clampedX * 10) / 10,
            y: Math.round(clampedY * 10) / 10
          };
        }
        return entity;
      });
      onEntitiesChange(updated);
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setDraggingEntityId(null);
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.max(10, Math.min(100, scale * zoomFactor));
    setScale(newScale);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#121417] select-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair block"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Floating Canvas Controls */}
      <div className="absolute top-3 left-3 flex items-center space-x-1.5 bg-[#1c1f24] border border-[#2d3239] rounded px-2 py-1 shadow-md text-slate-300">
        <button
          onClick={() => setScale(s => Math.min(100, s * 1.2))}
          className="p-1 hover:bg-[#282c34] rounded text-slate-300 hover:text-white"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setScale(s => Math.max(10, s * 0.8))}
          className="p-1 hover:bg-[#282c34] rounded text-slate-300 hover:text-white"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={fitToView}
          className="p-1 hover:bg-[#282c34] rounded text-slate-300 hover:text-white"
          title="Fit to Window"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <div className="h-3 w-px bg-[#3e444e] mx-1" />
        <span className="text-[10px] font-mono text-slate-400">{Math.round(scale)} px/m</span>
      </div>
    </div>
  );
};
