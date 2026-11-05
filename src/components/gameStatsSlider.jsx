import { useState } from "react";
import "./gameStatsSlider.css";

function parsePlaybackTime(value) {
  const match = /^(\d+):([0-5]\d)$/.exec(String(value));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatPlaybackTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function getTimePosition(time, duration) {
  if (duration <= 0) return 0;
  return Math.min(Math.max((time / duration) * 100, 0), 100);
}

function getTimelineSegments(match) {
  return match.timelineSegments
    .map((segment) => ({
      ...segment,
      start: parsePlaybackTime(segment.startTime),
      end: parsePlaybackTime(segment.endTime),
    }))
    .filter(
      (segment) =>
        segment.start !== null &&
        segment.end !== null &&
        segment.end >= segment.start,
    );
}

function formatMatchMinute(time, segments) {
  const halftime = segments.find((segment) => segment.type === "halftime");
  if (halftime && time >= halftime.start && time < halftime.end) return "HT";

  const fullTime = segments.find((segment) => segment.type === "full-time");
  if (fullTime && time >= fullTime.start) return "FT";

  const segment = segments.find(
    (item) =>
      ["regular", "added-time"].includes(item.type) &&
      time >= item.start &&
      time < item.end,
  );
  if (!segment) return "—";

  const segmentDuration = segment.end - segment.start;
  const matchMinuteDuration = segment.clockEnd - segment.clockStart;
  const progress =
    segmentDuration > 0
      ? Math.min(Math.max((time - segment.start) / segmentDuration, 0), 1)
      : 0;
  const matchMinute = segment.clockStart + progress * matchMinuteDuration;

  if (segment.type === "added-time") {
    return `${segment.clockStart}+${Math.floor(matchMinute - segment.clockStart)}'`;
  }
  return `${Math.floor(matchMinute)}'`;
}

function getTimelineTicks(segments) {
  const firstHalf = segments.find((segment) => segment.id === "firstHalf");
  const halftime = segments.find((segment) => segment.type === "halftime");
  const secondHalf = segments.find((segment) => segment.id === "secondHalf");
  const fullTime = segments.find((segment) => segment.type === "full-time");

  return [
    firstHalf && { time: firstHalf.start, label: "0'", kind: "major" },
    firstHalf && { time: firstHalf.end, label: "45'", kind: "major" },
    halftime && { time: halftime.start, label: "HT", kind: "halftime" },
    secondHalf && { time: secondHalf.end, label: "90'", kind: "major" },
    fullTime && { time: fullTime.start, label: "FT", kind: "major" },
  ].filter((tick) => tick && tick.time !== null && tick.time >= 0);
}

export default function GameStatsSlider({
  currentTime,
  duration,
  playbackMode,
  match,
  onSeek,
  onTogglePlayback,
}) {
  const [draftTime, setDraftTime] = useState(currentTime);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const displayTime = Math.min(
    Math.max(isScrubbing ? draftTime : currentTime, 0),
    Math.max(duration, 0),
  );
  const progress = getTimePosition(displayTime, duration);
  const segments = getTimelineSegments(match);
  const ticks = getTimelineTicks(segments);
  const events = match.events
    .map((event) => ({
      ...event,
      start: parsePlaybackTime(event.startTime),
      end: parsePlaybackTime(event.endTime),
    }))
    .filter(
      (event) =>
        event.start !== null && event.end !== null && event.end >= event.start,
    );

  const seek = (value) => {
    const time = Math.min(Math.max(Number(value), 0), Math.max(duration, 0));
    setDraftTime(time);
    onSeek(time);
  };

  const seekToTimelinePosition = (time) => {
    if (duration <= 0) return;
    seek(time);
  };

  return (
    <div className="match-overlay">
      <header className="match-scoreboard">
        <div className="match-scoreboard__meta">{match.competition}</div>
        <div className="match-scoreboard__teams">
          {match.teams.map((team, index) => (
            <div
              className={`match-team match-team--${index === 0 ? "home" : "away"}`}
              key={team.id}
            >
              <img src={team.logo} alt="" className="match-team__logo" />
              <div className="match-team__details">
                <span className="match-team__name">{team.name}</span>
              </div>
              <strong className="match-team__score">{team.score}</strong>
            </div>
          ))}
          <span className="match-scoreboard__separator">—</span>
        </div>
        <div className="match-scoreboard__clock">
          {formatMatchMinute(displayTime, segments)}
        </div>
      </header>

      <div className="audio-controls">
        <button
          className="audio-player__button"
          type="button"
          onClick={onTogglePlayback}
          disabled={duration <= 0}
          aria-label={
            playbackMode === "all" ? "Pausa alla ljud" : "Spela alla ljud"
          }
        >
          {playbackMode === "all" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5h3v14H8zM15 5h3v14h-3z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m8 5 12 7-12 7z" />
            </svg>
          )}
        </button>

        <section className="audio-player" aria-label="Ljuduppspelning">
          <div className="audio-player__timeline">
            <div className="audio-player__time-row">
              <span>{formatPlaybackTime(displayTime)}</span>
              <span className="audio-player__match-clock">
                {formatMatchMinute(displayTime, segments)}
              </span>
              <span>{formatPlaybackTime(duration)}</span>
            </div>
            <div className="audio-timeline">
              <div className="audio-timeline__scale">
                <div
                  className="audio-timeline__track"
                  style={{ "--timeline-progress": `${progress}%` }}
                />
                {segments
                  .filter((segment) => segment.type === "added-time")
                  .map((segment) => {
                    if (segment.end <= segment.start) return null;
                    const startPosition = getTimePosition(
                      segment.start,
                      duration,
                    );
                    const endPosition = getTimePosition(segment.end, duration);
                    return (
                      <span
                        className="audio-timeline__added-time"
                        key={segment.id}
                        title={segment.label}
                        style={{
                          left: `${startPosition}%`,
                          width: `${endPosition - startPosition}%`,
                        }}
                      />
                    );
                  })}
                {segments
                  .filter((segment) => segment.type === "halftime")
                  .map((segment) => {
                    if (segment.end <= segment.start) return null;
                    const startPosition = getTimePosition(
                      segment.start,
                      duration,
                    );
                    const endPosition = getTimePosition(segment.end, duration);
                    return (
                      <span
                        className="audio-timeline__halftime"
                        key={segment.id}
                        title={segment.label}
                        style={{
                          left: `${startPosition}%`,
                          width: `${endPosition - startPosition}%`,
                        }}
                      />
                    );
                  })}
                <div className="audio-timeline__ticks" aria-hidden="true">
                  {ticks.map((tick) => (
                    <span
                      className={`audio-timeline__tick audio-timeline__tick--${tick.kind}`}
                      key={`${tick.time}-${tick.label}`}
                      style={{
                        left: `${getTimePosition(tick.time, duration)}%`,
                      }}
                    >
                      {tick.label && (
                        <span
                          className={`audio-timeline__tick-label${tick.kind === "added" ? " audio-timeline__tick-label--added" : ""}`}
                        >
                          {tick.label}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
                {events.map((event, index) => {
                  const startPosition = getTimePosition(event.start, duration);
                  const endPosition = getTimePosition(event.end, duration);
                  return (
                    <span
                      key={`${event.startTime}-${event.endTime}-${event.label}`}
                    >
                      <span
                        className="audio-timeline__event-range"
                        aria-hidden="true"
                        style={{
                          left: `${startPosition}%`,
                          width: `${endPosition - startPosition}%`,
                        }}
                      />
                      <button
                        className={`audio-timeline__event${index % 2 === 0 ? " audio-timeline__event--above" : " audio-timeline__event--below"}`}
                        type="button"
                        style={{ left: `${startPosition}%` }}
                        title={`${event.startTime}–${event.endTime} · ${event.label}`}
                        aria-label={`Hoppa till ${event.label}, ${event.startTime} till ${event.endTime}`}
                        onPointerDown={(pointerEvent) =>
                          pointerEvent.stopPropagation()
                        }
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          seekToTimelinePosition(event.start);
                        }}
                      >
                        <span className="audio-timeline__event-label">
                          {event.label}
                        </span>
                        <span className="audio-timeline__event-stem" />
                        <span className="audio-timeline__event-dot" />
                      </button>
                    </span>
                  );
                })}
                <input
                  aria-label="Hoppa i ljud och match"
                  type="range"
                  min={0}
                  max={Math.max(duration, 0)}
                  step={0.1}
                  value={Math.min(displayTime, duration)}
                  disabled={duration <= 0}
                  onBlur={() => setIsScrubbing(false)}
                  onPointerDown={() => {
                    setDraftTime(currentTime);
                    setIsScrubbing(true);
                  }}
                  onKeyDown={() => setIsScrubbing(true)}
                  onKeyUp={() => setIsScrubbing(false)}
                  onPointerUp={() => setIsScrubbing(false)}
                  onPointerCancel={() => setIsScrubbing(false)}
                  onChange={(event) => seek(event.target.value)}
                  className="audio-timeline__range"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
