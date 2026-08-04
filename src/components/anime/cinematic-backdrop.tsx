"use client";

import { useMemo } from "react";

/**
 * CinematicBackdrop — shared fixed-position background system for the
 * Landing and Guide pages. Deep navy gradient wash, slow-rotating light
 * rays, drifting particles, vignette, and fine grain. No glassmorphism,
 * no purple, no gold — see .ltv-cine-* rules in globals.css.
 *
 * Deterministic particle field (seeded, not Math.random on every render)
 * so it doesn't reshuffle on re-render.
 */
interface Particle {
  x: number; y: number; size: number; dur: number; delay: number; blue: boolean;
}

function makeParticles(count: number, seed: number): Particle[] {
  const particles: Particle[] = [];
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    particles.push({
      x: rand() * 100,
      y: rand() * 100,
      size: 2 + rand() * 3,
      dur: 10 + rand() * 12,
      delay: rand() * 14,
      blue: rand() > 0.45,
    });
  }
  return particles;
}

export default function CinematicBackdrop({ particleCount = 34 }: { particleCount?: number }) {
  const particles = useMemo(() => makeParticles(particleCount, 42), [particleCount]);

  return (
    <div className="ltv-cine-backdrop" aria-hidden="true">
      <div className="ltv-cine-rays" />
      {particles.map((p, i) => (
        <span
          key={i}
          className="ltv-cine-particle"
          style={{
            ["--px" as any]: `${p.x}%`,
            ["--py" as any]: `${p.y}%`,
            ["--psize" as any]: `${p.size}px`,
            ["--pdur" as any]: `${p.dur}s`,
            ["--pdelay" as any]: `${p.delay}s`,
            ["--pcolor" as any]: p.blue ? "rgba(72,166,255,0.55)" : "rgba(220,230,247,0.45)",
          }}
        />
      ))}
      <div className="ltv-cine-grain" />
      <div className="ltv-cine-vignette" />
    </div>
  );
}
