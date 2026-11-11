import { useEffect, useState } from "react";
import { ui } from "@/i18n/translate";
import {
  accentForTheme,
  isCustomVisualHex,
  type VisualAccent,
} from "@/theme/andonVisualPalette";

type RgbChannel = 0 | 1 | 2;

function hexChannels(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function channelsHex(channels: readonly number[]): `#${string}` {
  return `#${channels.map(channel => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * Native browser color wheel plus exact HEX and R/G/B controls.
 * Store only validated #RRGGBB, never user-supplied CSS or alpha colors.
 * The field's named legacy preset is preserved until the user edits it.
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
  const [hexInput, setHexInput] = useState(currentHex);
  const [rgbInput, setRgbInput] = useState<[string, string, string]>(
    () => hexChannels(currentHex).map(String) as [string, string, string],
  );

  useEffect(() => {
    setHexInput(currentHex);
    setRgbInput(hexChannels(currentHex).map(String) as [string, string, string]);
  }, [currentHex]);

  function commitHex(raw: string) {
    const normalized = raw.trim().toUpperCase();
    if (isCustomVisualHex(normalized)) onChange(normalized);
  }

  function commitChannel(channel: RgbChannel) {
    const raw = rgbInput[channel].trim();
    if (!/^\d{1,3}$/.test(raw)) {
      setRgbInput(hexChannels(currentHex).map(String) as [string, string, string]);
      return;
    }
    const number = Number(raw);
    if (!Number.isInteger(number) || number < 0 || number > 255) {
      setRgbInput(hexChannels(currentHex).map(String) as [string, string, string]);
      return;
    }
    const channels = hexChannels(currentHex);
    channels[channel] = number;
    onChange(channelsHex(channels));
  }

  return (
    <fieldset disabled={disabled} className="space-y-2 rounded-lg border border-border bg-background/40 p-3">
      <legend className="px-1 text-sm font-semibold text-foreground">{ui(label)}</legend>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={ui("Selecionar cor de {0}", { 0: ui(label) })}
          title={ui("Abrir seletor multicolorido")}
          value={currentHex}
          onChange={event => onChange(event.target.value.toUpperCase() as VisualAccent)}
          className="h-12 w-16 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
        />
        <span className="h-10 flex-1 rounded-md border border-border" style={{ backgroundColor: currentHex }}
          aria-hidden="true" />
      </div>
      <label className="block space-y-1 text-xs font-semibold text-muted-foreground">
        {ui("Código HEX")}
        <input
          aria-label={ui("Código HEX de {0}", { 0: ui(label) })}
          type="text"
          inputMode="text"
          maxLength={7}
          spellCheck={false}
          value={hexInput}
          onChange={event => {
            const raw = event.target.value;
            setHexInput(raw);
            commitHex(raw);
          }}
          onBlur={() => setHexInput(currentHex)}
          className="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <div className="grid grid-cols-3 gap-2" aria-label={ui("Canais RGB")}>
        {(["R", "G", "B"] as const).map((channelName, index) => (
          <label key={channelName} className="block space-y-1 text-xs font-semibold text-muted-foreground">
            {channelName}
            <input
              aria-label={`${ui(label)} · ${channelName}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={255}
              step={1}
              value={rgbInput[index]}
              onChange={event => setRgbInput(previous => previous.map((value, i) =>
                i === index ? event.target.value : value) as [string, string, string])}
              onBlur={() => commitChannel(index as RgbChannel)}
              onKeyDown={event => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="h-10 w-full rounded-md border border-border bg-background px-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
