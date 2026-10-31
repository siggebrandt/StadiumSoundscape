const ARENA_LIST = [
  { id: "ullevi", label: "GAMLA ULLEVI" },
  { id: "eleda", label: "ELEDA STADION" },
];

export default function Navigation({ activeArena, onSelectArena }) {
  return (
    <div
      className="navigation"
      style={{
        position: "absolute",
        top: "50%",
        left: "20px",
        zIndex: "2",
      }}
    >
      <div
        style={{
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {ARENA_LIST.map(({ id, label }) => {
          const isActive = activeArena === id;
          return (
            <div
              key={id}
              onClick={() => onSelectArena(id)}
              style={{
                color: isActive ? "#2563eb" : "#000",
                fontWeight: isActive ? "700" : "400",
                cursor: "pointer",
                transition: "color 0.15s ease, font-weight 0.15s ease",
              }}
            >
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
