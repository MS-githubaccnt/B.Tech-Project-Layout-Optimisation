import React, { useRef, useEffect } from 'react';
import { LayoutEntity, PlotSchema, ProjectConfig, ProjectMode } from '../types';
import { Box } from 'lucide-react';

interface ThreeDViewProps {
  config: ProjectConfig;
  entities: LayoutEntity[];
}

export const ThreeDView: React.FC<ThreeDViewProps> = ({ config, entities }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = '#121417';
    ctx.fillRect(0, 0, w, h);

    const isoScale = Math.min(w / 45, h / 35);
    const originX = w / 2;
    const originY = h * 0.35;

    const cos30 = Math.cos(Math.PI / 6);
    const sin30 = Math.sin(Math.PI / 6);

    const toIso = (x: number, y: number, z: number) => {
      const sx = originX + (x - y) * cos30 * isoScale;
      const sy = originY + (x + y) * sin30 * isoScale - z * isoScale * 1.5;
      return { x: sx, y: sy };
    };

    // 1. Draw Floor Slab
    const boundary = config.plot.boundary;
    if (boundary.length > 2) {
      ctx.beginPath();
      boundary.forEach((pt, idx) => {
        const iso = toIso(pt[0], pt[1], 0);
        if (idx === 0) ctx.moveTo(iso.x, iso.y);
        else ctx.lineTo(iso.x, iso.y);
      });
      ctx.closePath();
      ctx.fillStyle = '#1e2126';
      ctx.fill();
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Sort entities from back to front in isometric depth (x + y)
    const sorted = [...entities].sort((a, b) => (a.x + a.y) - (b.x + b.y));

    // 2. Extrude Entities as 3D Prisms
    sorted.forEach(ent => {
      const L = ent.dimensions.L;
      const W = ent.dimensions.W;
      const H = ent.dimensions.H || 2.0;

      const x0 = ent.x - L / 2;
      const x1 = ent.x + L / 2;
      const y0 = ent.y - W / 2;
      const y1 = ent.y + W / 2;

      const b0 = toIso(x0, y0, 0);
      const b1 = toIso(x1, y0, 0);
      const b2 = toIso(x1, y1, 0);
      const b3 = toIso(x0, y1, 0);

      const t0 = toIso(x0, y0, H);
      const t1 = toIso(x1, y0, H);
      const t2 = toIso(x1, y1, H);
      const t3 = toIso(x0, y1, H);

      let topColor = '#3b4351';
      let sideColor1 = '#282c34';
      let sideColor2 = '#1e2229';

      if (ent.category.startsWith('robot')) {
        topColor = '#ea580c'; // Industrial Orange
        sideColor1 = '#c2410c';
        sideColor2 = '#9a3412';
      } else if (ent.category.startsWith('human')) {
        topColor = '#0d9488'; // Safety Teal
        sideColor1 = '#0f766e';
        sideColor2 = '#115e59';
      } else if (ent.category === 'grinder') {
        topColor = '#a16207';
        sideColor1 = '#854d0e';
        sideColor2 = '#713f12';
      } else if (ent.category === 'cmm') {
        topColor = '#0284c7';
        sideColor1 = '#0369a1';
        sideColor2 = '#075985';
      }

      // Top Face
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.closePath();
      ctx.fillStyle = topColor;
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Right Face (x1 edge)
      ctx.beginPath();
      ctx.moveTo(b1.x, b1.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.closePath();
      ctx.fillStyle = sideColor1;
      ctx.fill();
      ctx.stroke();

      // Left Face (y1 edge)
      ctx.beginPath();
      ctx.moveTo(b2.x, b2.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.lineTo(b3.x, b3.y);
      ctx.closePath();
      ctx.fillStyle = sideColor2;
      ctx.fill();
      ctx.stroke();

      // Label on top
      const centerTop = toIso(ent.x, ent.y, H);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ent.id, centerTop.x, centerTop.y - 2);

      // Translucent Reach Hemisphere if robot
      if (ent.kinematics) {
        const rMax = ent.kinematics.r_max_m;
        const sphereCenter = toIso(ent.x, ent.y, H * 0.7);
        const rPx = rMax * isoScale;

        ctx.beginPath();
        ctx.arc(sphereCenter.x, sphereCenter.y, rPx, 0, Math.PI, true);
        ctx.fillStyle = 'rgba(234, 88, 12, 0.08)';
        ctx.fill();
        ctx.strokeStyle = '#ea580c';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

  }, [config, entities]);

  return (
    <div className="relative w-full h-full bg-[#121417] flex flex-col items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute top-3 left-3 flex items-center space-x-1.5 bg-[#1c1f24] border border-[#2d3239] rounded px-2.5 py-1 text-[11px] text-slate-300">
        <Box className="w-3.5 h-3.5 text-orange-400" />
        <span className="font-mono">2.5D Isometric Extrusion View</span>
      </div>
    </div>
  );
};
