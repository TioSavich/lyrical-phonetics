// ── Color Utilities ──

export const hexToRgba = (hex: string, opacity: number): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// Legacy aliases (used by old code)
export const getColorForIndex = (index: number): string => {
  const palette = [
    '#fca5a5', '#fdba74', '#fde047', '#86efac',
    '#67e8f9', '#93c5fd', '#c4b5fd', '#f0abfc',
  ];
  return palette[index % palette.length];
};

export const getHexWithOpacity = hexToRgba;
