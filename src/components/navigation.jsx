import "./navigation.css";

const ARENA_LIST = [
  { id: "ullevi", label: "Gamla Ullevi", city: "Göteborg" },
  { id: "eleda", label: "Eleda Stadion", city: "Malmö" },
];

const MODE_LIST = [
  { id: "match", label: "Match" },
  { id: "ambience", label: "Ambience" },
];

export default function Navigation({
  activeArena,
  onSelectArena,
  listeningMode,
  onSelectMode,
}) {
  return (
    <nav className="navigation" aria-label="Välj arena">
      <section>
        <h2 className="navigation__heading">Choose stadium</h2>
        <div className="navigation__list">
          {ARENA_LIST.map(({ id, label, city }) => {
            const isActive = activeArena === id;
            return (
              <button
                key={id}
                type="button"
                className={`navigation__arena${isActive ? " navigation__arena--active" : ""}`}
                aria-pressed={isActive}
                onClick={() => onSelectArena(id)}
              >
                <span className="navigation__details">
                  <span className="navigation__name">{label}</span>
                  <span className="navigation__city">{city}</span>
                </span>
                <svg
                  className="navigation__chevron"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
                </svg>
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <h2 className="navigation__heading">Listen to</h2>
        <div
          className="navigation__modes"
          role="group"
          aria-label="Välj ljudläge"
        >
          {MODE_LIST.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`navigation__mode${listeningMode === id ? " navigation__mode--active" : ""}`}
              aria-pressed={listeningMode === id}
              onClick={() => onSelectMode(id)}
            >
              <span className="navigation__mode-label">{label}</span>
            </button>
          ))}
        </div>
      </section>
    </nav>
  );
}
