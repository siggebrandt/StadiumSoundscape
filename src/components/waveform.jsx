import { useMemo } from "react";

function binWaveform(values, start, end, bars) {
  if (!values?.length || end <= start || bars <= 0) return [];
  const span = (end - start) / bars;
  const bins = Array.from({ length: bars }, (_, index) => {
    const from = Math.floor(start + index * span);
    const to = Math.max(from + 1, Math.ceil(start + (index + 1) * span));
    let peak = 0;
    for (let i = from; i < to && i < values.length; i++) peak = Math.max(peak, values[i] ?? 0);
    return peak;
  });
  const max = Math.max(...bins, 0.001);
  return bins.map((value) => Math.max(Math.pow(value / max, 0.7), 0.06));
}

export default function Waveform({ values, start, end, progress, bars = 120, className = "" }) {
  const bins = useMemo(() => binWaveform(values, start, end, bars), [values, start, end, bars]);
  if (!bins.length) return null;
  return (
    <div className={`waveform ${className}`} aria-hidden="true">
      {bins.map((height, index) => (
        <span
          key={index}
          className={`waveform__bar${((index + 0.5) / bins.length) * 100 <= progress ? " waveform__bar--played" : ""}`}
          style={{ height: `${height * 100}%` }}
        />
      ))}
    </div>
  );
}
