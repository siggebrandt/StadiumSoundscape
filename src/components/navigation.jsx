import selectedIcon from "../assets/vector/selected.svg";
import unselectedIcon from "../assets/vector/unSelected.svg";
import "./navigation.css";

const ARENA_LIST = [
  { id: "ullevi", label: "Gamla Ullevi", city: "Göteborg" },
  { id: "eleda", label: "Eleda Stadion", city: "Malmö" },
];

export default function Navigation({
  activeArena,
  onSelectArena,
  listeningMode,
  onSelectMode,
}) {
  return (
    <nav className="navigation" aria-label="Välj arena">
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
              <img
                className="navigation__indicator"
                src={isActive ? selectedIcon : unselectedIcon}
                alt=""
              />
              <span className="navigation__details">
                <span className="navigation__name">{label}</span>
                <span className="navigation__city">{city}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div
        className="navigation__modes"
        role="group"
        aria-label="Välj ljudläge"
      >
        {[
          { id: "match", label: "Match" },
          { id: "ambience", label: "Ambience" },
        ].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`navigation__mode${listeningMode === id ? " navigation__mode--active" : ""}`}
            aria-pressed={listeningMode === id}
            onClick={() => onSelectMode(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
