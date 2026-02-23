import { DeviceType } from './types';

// ── Device-family color palettes ──
// Each device type gets a distinct color family so multiple layers are visually distinguishable.

export const DEVICE_PALETTES: Record<DeviceType, string[]> = {
  rhymes: [
    '#f87171', // Red 400
    '#fb923c', // Orange 400
    '#f59e0b', // Amber 500
    '#ef4444', // Red 500
    '#e879f9', // Fuchsia 400
    '#f472b6', // Pink 400
    '#fca5a5', // Red 300
    '#fdba74', // Orange 300
    '#fde047', // Yellow 300
    '#fda4af', // Rose 300
    '#fb7185', // Rose 400
    '#c084fc', // Purple 400
  ],
  assonance: [
    '#38bdf8', // Sky 400
    '#22d3ee', // Cyan 400
    '#2dd4bf', // Teal 400
    '#67e8f9', // Cyan 300
    '#7dd3fc', // Sky 300
    '#5eead4', // Teal 300
    '#06b6d4', // Cyan 500
    '#0ea5e9', // Sky 500
    '#a5f3fc', // Cyan 200
    '#99f6e4', // Teal 200
  ],
  alliteration: [
    '#a3e635', // Lime 400
    '#4ade80', // Green 400
    '#34d399', // Emerald 400
    '#86efac', // Green 300
    '#bef264', // Lime 300
    '#6ee7b7', // Emerald 300
    '#84cc16', // Lime 500
    '#22c55e', // Green 500
    '#10b981', // Emerald 500
    '#a7f3d0', // Emerald 200
  ],
  cascades: [
    '#c084fc', // Purple 400
    '#a78bfa', // Violet 400
    '#818cf8', // Indigo 400
    '#d8b4fe', // Purple 300
    '#c4b5fd', // Violet 300
    '#a5b4fc', // Indigo 300
    '#9333ea', // Purple 600
    '#7c3aed', // Violet 600
    '#e9d5ff', // Purple 200
    '#ddd6fe', // Violet 200
  ],
};

// Get a color for a specific group within a device type
export const getDeviceColor = (deviceType: DeviceType, groupIndex: number): string => {
  const palette = DEVICE_PALETTES[deviceType];
  return palette[groupIndex % palette.length];
};

// ── Density heatmap gradient ──
export const DENSITY_COLORS = {
  cold: '#1e293b',   // Slate 800 (no devices)
  cool: '#334155',   // Slate 700
  warm: '#f59e0b',   // Amber 500
  hot: '#ef4444',    // Red 500
};

// Interpolate density to a color  
export const getDensityColor = (density: number, maxDensity: number): string => {
  if (maxDensity === 0) return DENSITY_COLORS.cold;
  const t = Math.min(density / maxDensity, 1);
  if (t < 0.25) return DENSITY_COLORS.cold;
  if (t < 0.5) return DENSITY_COLORS.cool;
  if (t < 0.75) return DENSITY_COLORS.warm;
  return DENSITY_COLORS.hot;
};

// ── Observation type icons ──
export const OBSERVATION_ICONS: Record<string, string> = {
  regularity: '🔁',
  high_density: '🔥',
  low_density: '💤',
  parallel_assonance: '🪞',
  break: '⚡',
};

// ── Default lyrics for demo ──
export const INITIAL_LYRICS = `The cat sat on the mat
Thinking of a rat
While the rain outside
Started to slide
Drip, drop, drape
The world takes shape`;
