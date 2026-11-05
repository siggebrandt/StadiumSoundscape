import { useState } from "react";

const panelStyle = {
  position: "fixed",
  top: 164,
  right: 16,
  zIndex: 20,
  width: "min(280px, calc(100vw - 32px))",
  maxHeight: "calc(100vh - 184px)",
  overflowY: "auto",
  padding: 14,
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 12,
  background: "rgba(25, 32, 43, 0.94)",
  color: "#f8fafc",
  font: "13px system-ui, sans-serif",
  boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
};

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <label style={{ display: "grid", gap: 5, marginTop: 12 }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span>{value} m</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function MarkerTuner({
  sides,
  selectedSide,
  settings,
  onSelectSide,
  onChange,
}) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  if (!settings) return null;

  const copySettings = async () => {
    const snippet = JSON.stringify(
      {
        markerInsetMeters: settings.insetMeters,
        markerWidthMeters: settings.widthMeters,
        markerHeightRangeMeters: settings.heightRangeMeters,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch (error) {
      console.error("Could not copy marker settings:", error);
      setCopied(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="marker-adjustment-controls"
        onClick={() => setIsOpen((open) => !open)}
        style={{
          position: "fixed",
          top: 120,
          right: 16,
          zIndex: 20,
          padding: "8px 12px",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 8,
          background: "rgba(25, 32, 43, 0.94)",
          color: "#f8fafc",
          font: "600 13px system-ui, sans-serif",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.24)",
        }}
      >
        {isOpen ? "Dölj markörinställningar" : "Justera markering"}
      </button>
      {isOpen && (
        <section
          id="marker-adjustment-controls"
          style={panelStyle}
          aria-label="Marker adjustment controls"
        >
          <strong style={{ display: "block", fontSize: 14 }}>
            Justera läktarmarkering
          </strong>
          <label style={{ display: "grid", gap: 5, marginTop: 12 }}>
            <span>Kortsida</span>
            <select
              value={selectedSide}
              onChange={(event) => onSelectSide(event.target.value)}
              style={{ padding: 6, borderRadius: 5 }}
            >
              {sides.map((side) => (
                <option key={side} value={side}>
                  {side}
                </option>
              ))}
            </select>
          </label>
          <Slider
            label="Avstånd från planen"
            value={settings.insetMeters}
            min={0}
            max={24}
            step={0.5}
            onChange={(value) => onChange({ insetMeters: value })}
          />
          <Slider
            label="Markeringens bredd"
            value={settings.widthMeters}
            min={1}
            max={12}
            step={0.5}
            onChange={(value) => onChange({ widthMeters: value })}
          />
          <Slider
            label="Höjd vid innerkant"
            value={settings.heightRangeMeters[0]}
            min={0}
            max={25}
            step={0.5}
            onChange={(value) =>
              onChange({
                heightRangeMeters: [
                  value,
                  Math.max(value + 0.5, settings.heightRangeMeters[1]),
                ],
              })
            }
          />
          <Slider
            label="Höjd vid ytterkant"
            value={settings.heightRangeMeters[1]}
            min={0.5}
            max={35}
            step={0.5}
            onChange={(value) =>
              onChange({
                heightRangeMeters: [
                  Math.min(settings.heightRangeMeters[0], value - 0.5),
                  value,
                ],
              })
            }
          />
          <button
            type="button"
            onClick={copySettings}
            style={{
              width: "100%",
              marginTop: 14,
              padding: "8px 10px",
              border: 0,
              borderRadius: 6,
              background: "#38bdf8",
              color: "#082f49",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {copied
              ? "JSON-inställningar kopierade"
              : "Kopiera JSON-inställningar"}
          </button>
          <small style={{ display: "block", marginTop: 8, color: "#cbd5e1" }}>
            Klistra in fälten i kortsidans objekt i arenans JSON-fil.
          </small>
        </section>
      )}
    </>
  );
}
