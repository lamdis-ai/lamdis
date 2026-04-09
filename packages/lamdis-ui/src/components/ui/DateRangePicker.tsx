"use client";
import React from 'react';

type Preset = { value: string; label: string };

type Props = {
  presetValue: string;
  onPresetChange: (value: string) => void;
  from?: string;
  to?: string;
  onFromChange?: (value: string) => void;
  onToChange?: (value: string) => void;
  presets?: Preset[];
  className?: string;
};

const defaultPresets: Preset[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Custom…" },
];

export function DateRangePicker({
  presetValue,
  onPresetChange,
  from,
  to,
  onFromChange,
  onToChange,
  presets = defaultPresets,
  className,
}: Props) {
  const preset = presets.find((p) => p.value === presetValue)?.value ?? presets[0]?.value ?? "7d";

  return (
    <div className={className ?? "flex flex-col md:flex-row md:items-end gap-3"}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Date range</span>
        <select
          className="bg-slate-950/60 border border-slate-800/70 rounded px-2 py-1 text-sm text-slate-100"
          value={preset}
          onChange={(e) => onPresetChange(e.target.value)}
        >
          {presets.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span>From</span>
          <input
            type="date"
            className="bg-slate-950/60 border border-slate-800/70 rounded px-2 py-1 text-sm text-slate-100"
            value={from || ""}
            onChange={(e) => onFromChange?.(e.target.value)}
          />
          <span>to</span>
          <input
            type="date"
            className="bg-slate-950/60 border border-slate-800/70 rounded px-2 py-1 text-sm text-slate-100"
            value={to || ""}
            onChange={(e) => onToChange?.(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
