/** Color picker conversions for the configurable non-critical ANDON accents. */
export type HsvColor = Readonly<{ h: number; s: number; v: number }>;
export type RgbColor = Readonly<{ r: number; g: number; b: number }>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function hexToRgb(hex: string): RgbColor {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error("invalid_hex_color");
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: RgbColor): `#${string}` {
  const components = [r, g, b];
  if (components.some(value => !Number.isInteger(value) || value < 0 || value > 255))
    throw new Error("invalid_rgb_channel");
  return `#${components.map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const [red, green, blue] = [r, g, b].map(channel => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hexToHsv(hex: string): HsvColor {
  return rgbToHsv(hexToRgb(hex));
}

export function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const hue = ((Number.isFinite(h) ? h : 0) % 360 + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const value = clamp(v, 0, 1);
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = value - chroma;
  const part = hue < 60 ? [chroma, x, 0] :
    hue < 120 ? [x, chroma, 0] :
    hue < 180 ? [0, chroma, x] :
    hue < 240 ? [0, x, chroma] :
    hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return {
    r: Math.round((part[0] + match) * 255),
    g: Math.round((part[1] + match) * 255),
    b: Math.round((part[2] + match) * 255),
  };
}

export function hsvToHex(color: HsvColor): `#${string}` {
  return rgbToHex(hsvToRgb(color));
}
