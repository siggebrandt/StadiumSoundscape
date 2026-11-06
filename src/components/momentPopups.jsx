import { useEffect, useRef } from "react";

export default function MomentPopups({
  popups,
  currentTime,
  playbackMode,
  getStandScreenPoint,
}) {
  const elementsRef = useRef(new Map());
  const getPointRef = useRef(getStandScreenPoint);
  const activeRef = useRef([]);

  const active =
    playbackMode === "paused"
      ? []
      : popups
          .map((popup) => ({ popup }))
          .filter(
            ({ popup }) =>
              currentTime >= popup.mediaStart && currentTime < popup.mediaEnd,
          );
  const activeKey = active.map(({ popup }) => popup.id).join("|");

  useEffect(() => {
    getPointRef.current = getStandScreenPoint;
    activeRef.current = active;
  });

  // Följer läktaren varje bildruta så att popupen sitter fast när kameran rörs.
  useEffect(() => {
    if (!activeKey) return undefined;
    let frame;
    const update = () => {
      activeRef.current.forEach(({ popup }) => {
        const el = elementsRef.current.get(popup.id);
        if (!el) return;
        const point = getPointRef.current?.(popup.position);
        const visible =
          point &&
          point.x >= 0 &&
          point.x <= window.innerWidth &&
          point.y >= 0 &&
          point.y <= window.innerHeight;
        if (!visible) {
          el.style.visibility = "hidden";
          return;
        }
        el.style.visibility = "visible";
        el.style.left = `${point.x}px`;
        el.style.top = `${point.y}px`;
      });
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [activeKey]);

  return (
    <div className="moment-popups" aria-live="polite">
      {active.map(({ popup }) => (
        <div
          key={popup.id}
          ref={(el) => {
            if (el) elementsRef.current.set(popup.id, el);
            else elementsRef.current.delete(popup.id);
          }}
          className="moment-popup"
          style={{ visibility: "hidden" }}
        >
          <span
            className="moment-popup__text"
            style={{
              animationDuration: `${Math.max(popup.mediaEnd - popup.mediaStart, 1)}s`,
            }}
          >
            {popup.text}
          </span>
        </div>
      ))}
    </div>
  );
}
