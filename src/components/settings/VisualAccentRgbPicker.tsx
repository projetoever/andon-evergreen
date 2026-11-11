import { useEffect, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ui } from "@/i18n/translate";
import {
  accentForTheme,
  isCustomVisualHex,
  type VisualAccent,
} from "@/theme/andonVisualPalette";
import {
  hexToHsv, hexToRgb, hsvToHex, rgbToHex, type HsvColor,
} from "@/theme/colorPickerMath";

type RgbChannel = "r" | "g" | "b";
const channels: readonly RgbChannel[] = ["r", "g", "b"];
const clamp = (number: number, min: number, max: number) => Math.min(max, Math.max(min, number));

/**
 * Spectrum color picker, close to the classic Windows Colors panel:
 * x selects the hue, y selects saturation, the lower slider controls value
 * (brightness). HEX and numeric RGB inputs remain exact and validated.
 *
 * Only non-critical ANDON palette accents are exposed here. Alarm danger
 * and warning colors are protected separately by the semantic UI.
 */
export function VisualAccentRgbPicker({
  label, value, disabled, onChange,
}: {
  label: string;
  value: VisualAccent;
  disabled: boolean;
  onChange: (value: VisualAccent) => void;
}) {
  const currentHex = accentForTheme(value, "dark");
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(currentHex));
  const [hexInput, setHexInput] = useState(currentHex);
  const [rgbInputs, setRgbInputs] = useState(() => {
    const rgb = hexToRgb(currentHex);
    return { r: String(rgb.r), g: String(rgb.g), b: String(rgb.b) };
  });

  useEffect(() => {
    const incoming = hexToHsv(currentHex);
    // Black has no defined hue; keep the last selected hue for the slider.
    setHsv(previous => incoming.v === 0
      ? { h: previous.h, s: previous.s, v: 0 }
      : incoming);
    setHexInput(currentHex);
    const rgb = hexToRgb(currentHex);
    setRgbInputs({ r: String(rgb.r), g: String(rgb.g), b: String(rgb.b) });
  }, [currentHex]);

  const applyHsv = (next: HsvColor) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };

  const chooseAt = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    applyHsv({ h: x * 359.99, s: 1 - y, v: hsv.v });
  };

  const onSpectrumKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key))
      return;
    event.preventDefault();
    if (key === "Home") return applyHsv({ ...hsv, h: 0 });
    if (key === "End") return applyHsv({ ...hsv, h: 359.99 });
    const h = clamp(hsv.h + (key === "ArrowLeft" ? -5 : key === "ArrowRight" ? 5 : 0), 0, 359.99);
    const s = clamp(hsv.s + (key === "ArrowUp" ? 0.04 : key === "ArrowDown" ? -0.04 : 0), 0, 1);
    applyHsv({ ...hsv, h, s });
  };

  const updateHex = (raw: string) => {
    setHexInput(raw);
    const normalized = raw.trim().toUpperCase();
    if (isCustomVisualHex(normalized)) onChange(normalized);
  };

  const commitRgb = (channel: RgbChannel) => {
    const raw = rgbInputs[channel].trim();
    const original = hexToRgb(currentHex);
    if (!/^\d{1,3}$/.test(raw) || Number(raw) > 255) {
      setRgbInputs({
        r: String(original.r), g: String(original.g), b: String(original.b),
      });
      return;
    }
    onChange(rgbToHex({ ...original, [channel]: Number(raw) }));
  };

  const fullBrightness = hsvToHex({ ...hsv, v: 1 });
  const rgb = hexToRgb(currentHex);

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-xl border border-border bg-background/40 p-3">
      <legend className="px-1 text-sm font-semibold text-foreground">{ui(label)}</legend>
      <div className="flex min-w-0 items-stretch gap-2">
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={ui("Painel multicolorido de {0}", { 0: ui(label) })}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          aria-valuetext={`H ${Math.round(hsv.h)}°, S ${Math.round(hsv.s * 100)}%, RGB ${rgb.r}, ${rgb.g}, ${rgb.b}`}
          onPointerDown={event => {
            if (disabled) return;
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            chooseAt(event);
          }}
          onPointerMove={event => {
            if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) chooseAt(event);
          }}
          onPointerUp={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onKeyDown={event => { if (!disabled) onSpectrumKeyDown(event); }}
          className="relative aspect-square min-w-0 flex-1 cursor-crosshair touch-none overflow-hidden rounded-md border border-border shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            backgroundImage: "linear-gradient(to top, #FFFFFF, rgba(255,255,255,0)), linear-gradient(to right, #FF0000 0%, #FFFF00 16.67%, #00FF00 33.33%, #00FFFF 50%, #0000FF 66.67%, #FF00FF 83.33%, #FF0000 100%)",
          }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute h-4 w-4 rounded-full border-2 border-slate-950 bg-white/20 shadow-[0_0_0_2px_#fff,0_0_6px_#000]"
            style={{
              left: `${(hsv.h / 360) * 100}%`,
              top: `${(1 - hsv.s) * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        </div>
        <div
          aria-label={ui("Cor atual de {0}", { 0: ui(label) })}
          role="img"
          className="w-9 shrink-0 rounded-md border border-border shadow-inner"
          style={{ backgroundColor: currentHex }}
        />
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-semibold text-muted-foreground">{ui("Brilho")}</span>
        <input
          type="range"
          aria-label={ui("Brilho de {0}", { 0: ui(label) })}
          min={0} max={100} step={1}
          value={Math.round(hsv.v * 100)}
          onChange={event => applyHsv({ ...hsv, v: Number(event.target.value) / 100 })}
          className="h-3 w-full cursor-pointer accent-foreground"
          style={{ background: `linear-gradient(to right, #000000, ${fullBrightness})` }}
        />
      </label>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
        <span className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-bold text-foreground">RGB</span>
        <label className="block">
          <span className="sr-only">{ui("Código HEX de {0}", { 0: ui(label) })}</span>
          <input
            type="text"
            aria-label={ui("Código HEX de {0}", { 0: ui(label) })}
            maxLength={7}
            spellCheck={false}
            value={hexInput}
            onChange={event => updateHex(event.target.value)}
            onBlur={() => setHexInput(currentHex)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>
      <div className="grid gap-1.5" aria-label={ui("Canais RGB")}>
        {channels.map(channel => (
          <label key={channel} className="grid grid-cols-[minmax(0,112px)_1fr] items-center gap-3 text-xs font-semibold text-muted-foreground">
            <input
              type="number"
              aria-label={`${ui(label)} · ${channel.toUpperCase()}`}
              inputMode="numeric"
              min={0} max={255} step={1}
              value={rgbInputs[channel]}
              onChange={event => setRgbInputs(previous => ({ ...previous, [channel]: event.target.value }))}
              onBlur={() => commitRgb(channel)}
              onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
              className="h-9 w-full rounded-md border border-border bg-background px-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span>{ui(channel === "r" ? "Vermelho" : channel === "g" ? "Verde" : "Azul")}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
