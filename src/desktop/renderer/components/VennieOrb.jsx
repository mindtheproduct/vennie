import React, { useRef, useEffect } from 'react';

/**
 * Vennie AI Orb — layered luminous energy with inner structure.
 * Multiple drifting blobs at different scales create a rich, high-definition
 * glow with visible internal motion. Chill and breathing, but detailed.
 *
 * Props:
 *   size   — 'sm' (28px) | 'md' (44px) | 'lg' (200px)
 *   state  — 'idle' | 'breathing' | 'thinking'
 */

const SIZES = { sm: 28, md: 44, lg: 200 };
const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
const TAU = Math.PI * 2;

export default function VennieOrb({ size = 'sm', state = 'idle' }) {
  const canvasRef = useRef(null);
  const px = SIZES[size] || SIZES.sm;
  const canvasPx = Math.round(px * 2.8);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvasPx * DPR;
    const h = canvasPx * DPR;
    canvas.width = w;
    canvas.height = h;

    const cx = w / 2;
    const cy = h / 2;
    const R = px * 0.4 * DPR;

    let raf;

    // Layer 1: Large background masses (soft, slow)
    const bgBlobs = [
      { color: [0, 180, 230],  r: 1.6, orbit: 0.12, speed: 0.18,  phase: 0,   alpha: 0.22 },
      { color: [0, 200, 245],  r: 1.4, orbit: 0.15, speed: -0.15, phase: 3.1, alpha: 0.20 },
      { color: [10, 190, 235], r: 1.5, orbit: 0.10, speed: 0.12,  phase: 1.5, alpha: 0.18 },
    ];

    // Layer 2: Mid-size blobs (medium drift, more visible motion)
    const midBlobs = [
      { color: [0, 230, 255],  r: 1.0,  orbit: 0.30, speed: 0.40,  phase: 0,    alpha: 0.40 },
      { color: [0, 215, 250],  r: 0.90, orbit: 0.25, speed: -0.35, phase: 2.1,  alpha: 0.38 },
      { color: [40, 245, 250], r: 0.95, orbit: 0.22, speed: 0.48,  phase: 4.2,  alpha: 0.35 },
      { color: [20, 220, 240], r: 0.85, orbit: 0.32, speed: -0.42, phase: 5.5,  alpha: 0.30 },
      // Violet accents
      { color: [100, 180, 255], r: 0.75, orbit: 0.28, speed: 0.55,  phase: 1.0, alpha: 0.18 },
      { color: [140, 160, 255], r: 0.70, orbit: 0.24, speed: -0.50, phase: 3.8, alpha: 0.14 },
    ];

    // Layer 3: Small bright detail blobs (faster, tighter, high contrast)
    const detailBlobs = [
      { color: [100, 255, 255], r: 0.35, orbit: 0.40, speed: 0.70,  phase: 0.5,  alpha: 0.55 },
      { color: [120, 255, 250], r: 0.30, orbit: 0.35, speed: -0.65, phase: 2.8,  alpha: 0.50 },
      { color: [80, 250, 255],  r: 0.38, orbit: 0.30, speed: 0.80,  phase: 4.8,  alpha: 0.45 },
      { color: [160, 220, 255], r: 0.28, orbit: 0.45, speed: -0.55, phase: 1.5,  alpha: 0.40 },
      { color: [60, 255, 245],  r: 0.32, orbit: 0.38, speed: 0.60,  phase: 3.2,  alpha: 0.48 },
      { color: [180, 200, 255], r: 0.25, orbit: 0.42, speed: -0.72, phase: 5.8,  alpha: 0.35 },
    ];

    function drawBlob(bx, by, br, color, alpha) {
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      const [r, g, b] = color;
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      grad.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, ${alpha * 0.65})`);
      grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, ${alpha * 0.25})`);
      grad.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${alpha * 0.06})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TAU);
      ctx.fill();
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      const s = t / 1000;

      const spd = state === 'thinking' ? 2.2 : state === 'breathing' ? 0.8 : 0.4;
      const pulse = state === 'thinking'
        ? 1 + 0.06 * Math.sin(s * 5) + 0.025 * Math.sin(s * 11)
        : state === 'breathing'
          ? 1 + 0.035 * Math.sin(s * 1.8) + 0.015 * Math.sin(s * 4.2)
          : 1 + 0.012 * Math.sin(s * 1.0) + 0.006 * Math.sin(s * 2.6);

      ctx.globalCompositeOperation = 'lighter';

      // ── Outer glow haze ─────────────────────────────────
      const hazeR = R * 2.4 * pulse;
      const gHaze = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, hazeR);
      gHaze.addColorStop(0, `rgba(0, 200, 250, ${state === 'thinking' ? 0.05 : 0.025})`);
      gHaze.addColorStop(0.5, 'rgba(0, 180, 240, 0.008)');
      gHaze.addColorStop(1, 'rgba(0, 150, 220, 0)');
      ctx.fillStyle = gHaze;
      ctx.beginPath();
      ctx.arc(cx, cy, hazeR, 0, TAU);
      ctx.fill();

      // ── Background masses ───────────────────────────────
      for (const b of bgBlobs) {
        const angle = b.phase + s * b.speed * spd;
        const drift = R * b.orbit * pulse;
        drawBlob(
          cx + Math.cos(angle) * drift,
          cy + Math.sin(angle) * drift * 0.8,
          R * b.r * pulse,
          b.color, b.alpha
        );
      }

      // ── Mid blobs ───────────────────────────────────────
      for (const b of midBlobs) {
        const angle = b.phase + s * b.speed * spd;
        const drift = R * b.orbit * pulse;
        drawBlob(
          cx + Math.cos(angle) * drift,
          cy + Math.sin(angle) * drift * 0.75,
          R * b.r * pulse,
          b.color, b.alpha
        );
      }

      // ── Detail blobs (inner structure) ──────────────────
      for (const b of detailBlobs) {
        const angle = b.phase + s * b.speed * spd;
        const drift = R * b.orbit * pulse;
        // Slightly wobbly orbits for organic feel
        const wobble = 1 + 0.15 * Math.sin(s * 1.2 + b.phase);
        drawBlob(
          cx + Math.cos(angle) * drift * wobble,
          cy + Math.sin(angle) * drift * 0.7 * wobble,
          R * b.r * pulse,
          b.color, b.alpha
        );
      }

      // ── Luminous core (soft, no hard dot) ───────────────
      const coreR = R * 0.55 * pulse;
      const cWobble = 1 + 0.03 * Math.sin(s * spd * 2.2) + 0.015 * Math.sin(s * spd * 5.5);

      // Broad bright wash
      const g0 = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * cWobble * 1.5);
      g0.addColorStop(0, 'rgba(180, 255, 255, 0.45)');
      g0.addColorStop(0.2, 'rgba(120, 248, 255, 0.30)');
      g0.addColorStop(0.45, 'rgba(60, 230, 255, 0.12)');
      g0.addColorStop(0.7, 'rgba(20, 200, 250, 0.03)');
      g0.addColorStop(1, 'rgba(0, 180, 240, 0)');
      ctx.fillStyle = g0;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * cWobble * 1.5, 0, TAU);
      ctx.fill();

      // Tighter bright inner
      const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * cWobble * 0.6);
      g1.addColorStop(0, 'rgba(220, 255, 255, 0.6)');
      g1.addColorStop(0.3, 'rgba(160, 250, 255, 0.35)');
      g1.addColorStop(0.6, 'rgba(80, 235, 255, 0.12)');
      g1.addColorStop(1, 'rgba(0, 210, 255, 0)');
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * cWobble * 0.6, 0, TAU);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [px, canvasPx, size, state]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: canvasPx,
        height: canvasPx,
        margin: -(canvasPx - px) / 2,
      }}
      className="shrink-0 pointer-events-none"
    />
  );
}
