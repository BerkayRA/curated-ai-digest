import * as React from 'react';
import { color } from '@mega-bulten/brand';

/**
 * BukaDotMotif — inline SVG rendering of the Buka chameleon dot-dissolve treatment.
 *
 * Implemented as a deterministic dot field to avoid external image requests (which
 * email clients block by default). The pattern suggests the dissolve effect via
 * concentric fade rings of Process Blue, teal, orange, and magenta dots at varying
 * opacities — referencing the Buka multicolor particle motif from the brand guide.
 *
 * Purely decorative: aria-hidden="true", role="presentation".
 */

interface DotSpec {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  opacity: number;
}

/** Generate the dot field deterministically — no randomness (stable server render). */
function buildDotField(): readonly DotSpec[] {
  const dots: DotSpec[] = [];

  // Primary palette: brand blue dominates, accents dissolve outward
  const palette: ReadonlyArray<{ fill: string; weight: number }> = [
    { fill: color.brand, weight: 5 },        // Process Blue — densest
    { fill: color.brandDark, weight: 3 },
    { fill: color.accentTeal, weight: 3 },   // teal accent
    { fill: color.accentOrange, weight: 2 }, // orange accent
    { fill: color.accentMagenta, weight: 2 },// magenta accent
    { fill: '#FFFFFF', weight: 4 },           // white — creates airy dissolve feel
  ];

  // Deterministic grid with gentle jitter encoded as fixed offsets
  // Row-col positions with hand-tuned offsets to create organic clustering
  const positions: ReadonlyArray<[number, number]> = [
    // Core dense cluster — upper-left (suggests chameleon head dissolving)
    [18, 14], [26, 10], [34, 16], [42, 10], [50, 18],
    [22, 22], [30, 18], [38, 24], [46, 16], [56, 22],
    [14, 28], [26, 30], [34, 26], [44, 30], [54, 28],
    // Mid dissolve — particles scatter rightward
    [62, 14], [70, 20], [78, 12], [86, 24], [92, 16],
    [64, 28], [72, 32], [82, 26], [90, 30], [100, 22],
    [68, 38], [76, 36], [86, 40], [96, 36], [108, 32],
    // Outer dissolve — sparse, fading
    [112, 18], [122, 26], [132, 14], [142, 22], [152, 28],
    [116, 36], [128, 40], [138, 34], [148, 42], [158, 30],
    [120, 46], [134, 48], [146, 50], [162, 40], [170, 22],
    // Edge wisps
    [172, 34], [178, 16], [182, 44], [186, 28], [190, 38],
    [174, 52], [180, 56], [186, 50], [192, 44], [196, 30],
  ];

  // Palette cycling with position-based deterministic selection
  const paletteFlat: string[] = [];
  for (const { fill, weight } of palette) {
    for (let i = 0; i < weight; i++) paletteFlat.push(fill);
  }

  positions.forEach(([cx, cy], i) => {
    const fill = paletteFlat[i % paletteFlat.length] ?? color.brand;
    // Opacity decreases as x increases (dissolve rightward)
    const distanceFactor = Math.min(cx / 200, 1);
    const opacity = Math.round((0.9 - distanceFactor * 0.65) * 10) / 10;
    // Radius varies slightly for organic feel
    const r = i % 5 === 0 ? 3.5 : i % 3 === 0 ? 2.5 : 2;
    dots.push({ cx, cy, r, fill, opacity: Math.max(opacity, 0.08) });
  });

  return dots;
}

const DOT_FIELD = buildDotField();

interface BukaDotMotifProps {
  /** Total width of the header band (email container width). Default 600. */
  readonly width?: number;
  /** Height of the motif band. Default 64. */
  readonly height?: number;
}

export function BukaDotMotif({ width = 600, height = 64 }: BukaDotMotifProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 200 ${Math.round((height / width) * 200 * 10)}`}
      role="presentation"
      aria-hidden="true"
      style={{ display: 'block', maxWidth: '100%' }}
    >
      {DOT_FIELD.map((dot, i) => (
        <circle
          key={i}
          cx={dot.cx}
          cy={dot.cy}
          r={dot.r}
          fill={dot.fill}
          opacity={dot.opacity}
        />
      ))}
    </svg>
  );
}
