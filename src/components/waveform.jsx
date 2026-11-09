import { useMemo } from "react";

function binWaveform(values, start, end, bars) {
  if (!values?.length || end <= start || bars <= 0) return [];
  const span = (end - start) / bars;
  const bins = Array.from({ length: bars }, (_, index) => {
    const from = Math.floor(start + index * span);
    const to = Math.max(from + 1, Math.ceil(start + (index + 1) * span));
    let sum = 0;
    let count = 0;
    for (let i = from; i < to && i < values.length; i++) {
      sum += values[i] ?? 0;
      count++;
    }
    return count ? sum / count : 0;
  });
  // Normalisera mot ett percentilspann i stället för maxvärdet så att
  // ständigt höga nivåer inte ger en platt, fullt utslagen kurva.
  const sorted = [...bins].sort((x, y) => x - y);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const low = at(0.1);
  const high = Math.max(at(0.98), low + 0.001);
  const smoothed = bins.map((_, i) => {
    const window = bins.slice(Math.max(0, i - 2), i + 3);
    return window.reduce((sum, v) => sum + v, 0) / window.length;
  });
  return smoothed.map((value) => {
    const level = Math.min(Math.max((value - low) / (high - low), 0), 1);
    return 0.08 + Math.pow(level, 1.4) * 0.92;
  });
}

export default function Waveform({
  values,
  start,
  end,
  progress,
  bars = 120,
  className = "",
}) {
  const bins = useMemo(
    () => binWaveform(values, start, end, bars),
    [values, start, end, bars],
  );
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
