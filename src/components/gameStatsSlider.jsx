import { useState } from "react";
import "./gameStatsSlider.css";

function formatPlaybackTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function getTimelineConfig(match) {
  const halfDuration = match.durationMinutes / 2;
  const secondHalfOffset = match.halftimePosition - halfDuration;
  return {
    halfDuration,
    secondHalfOffset,
    secondHalfEnd: match.durationMinutes + secondHalfOffset,
  };
}

function formatMatchMinute(position, match) {
  const { halfDuration, secondHalfOffset, secondHalfEnd } =
    getTimelineConfig(match);
  if (position < halfDuration) return `${Math.floor(position)}'`;
  if (position < match.halftimePosition) {
    return `${halfDuration}+${Math.floor(position - halfDuration)}'`;
  }
  if (position < match.halftimePosition + 1) return "HT";
  if (position <= secondHalfEnd) {
    return `${Math.floor(position - secondHalfOffset)}'`;
  }
  return `${match.durationMinutes}+${Math.floor(position - secondHalfEnd)}'`;
}

function getEventPosition(event, match) {
  const { halfDuration, secondHalfOffset, secondHalfEnd } =
    getTimelineConfig(match);
  const [minuteText, addedTimeText = "0"] = String(event.minute).split("+");
  const minute = Number(minuteText);
  const addedTime = Number(addedTimeText);
  if (!Number.isFinite(minute) || !Number.isFinite(addedTime)) return 0;
  if (minute <= halfDuration) return minute + addedTime;
  if (minute >= match.durationMinutes) return secondHalfEnd + addedTime;
  return minute + secondHalfOffset + addedTime;
}

function createTimelineTicks(match) {
  const { halfDuration, secondHalfOffset, secondHalfEnd } =
    getTimelineConfig(match);
  const ticks = [];
  for (let position = 0; position <= match.timelineMinutes; position++) {
    if (position === match.halftimePosition) {
      ticks.push({ position, label: "HALVLEK", kind: "halftime" });
      continue;
    }

    let matchMinute;
    if (position <= halfDuration) matchMinute = position;
    else if (position < match.halftimePosition)
      matchMinute = position - halfDuration;
    else if (position <= secondHalfEnd)
      matchMinute = position - secondHalfOffset;
    else matchMinute = position - secondHalfEnd;

    const isAddedTime =
      (position > halfDuration && position < match.halftimePosition) ||
      position > secondHalfEnd;
    if (!isAddedTime && matchMinute % 5 !== 0) continue;

    const isMajor =
      !isAddedTime &&
      (position === 0 ||
        position === halfDuration ||
        [15, 30].includes(position) ||
        [60, 75, 90].includes(matchMinute));
    const isMedium = !isAddedTime && !isMajor && matchMinute % 5 === 0;
    const label =
      position === 0 ||
      position === 15 ||
      position === 30 ||
      position === halfDuration
        ? `${position}'`
        : [60, 75, 90].includes(matchMinute)
          ? `${matchMinute}'`
          : position === halfDuration + 1
            ? `${halfDuration}+x`
            : position === secondHalfEnd + 1
              ? `${match.durationMinutes}+x`
              : null;

    ticks.push({
      position,
      label,
      kind: isAddedTime
        ? "added"
        : isMajor
          ? "major"
          : isMedium
            ? "medium"
            : "minor",
    });
  }
  return ticks;
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
  const displayTime = isScrubbing ? draftTime : currentTime;
  const timelinePosition =
    duration > 0
      ? Math.min(
          (displayTime / duration) * match.timelineMinutes,
          match.timelineMinutes,
        )
      : 0;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const ticks = createTimelineTicks(match);

  const seek = (value) => {
    const time = Number(value);
    setDraftTime(time);
    onSeek(time);
  };

  const seekToTimelinePosition = (position) => {
    if (duration <= 0) return;
    seek((position / match.timelineMinutes) * duration);
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
          {formatMatchMinute(timelinePosition, match)}
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
                {formatMatchMinute(timelinePosition, match)}
              </span>
              <span>{formatPlaybackTime(duration)}</span>
            </div>
            <div className="audio-timeline">
              <div className="audio-timeline__scale">
                <div
                  className="audio-timeline__track"
                  style={{ "--timeline-progress": `${progress}%` }}
                />
                <div className="audio-timeline__ticks" aria-hidden="true">
                  {ticks.map((tick) => (
                    <span
                      className={`audio-timeline__tick audio-timeline__tick--${tick.kind}`}
                      key={tick.position}
                      style={{ left: `${tick.position}%` }}
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
                {match.events.map((event, index) => (
                  <button
                    className={`audio-timeline__event${index % 2 === 0 ? " audio-timeline__event--above" : " audio-timeline__event--below"}`}
                    key={`${event.minute}-${event.label}`}
                    type="button"
                    style={{
                      left: `${getEventPosition(event, match)}%`,
                    }}
                    title={`${event.minute}' · ${event.label}`}
                    aria-label={`Hoppa till ${event.minute}', ${event.label}`}
                    onPointerDown={(pointerEvent) =>
                      pointerEvent.stopPropagation()
                    }
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      seekToTimelinePosition(getEventPosition(event, match));
                    }}
                  >
                    <span className="audio-timeline__event-label">
                      {event.label}
                    </span>
                    <span className="audio-timeline__event-stem" />
                    <span className="audio-timeline__event-dot" />
                  </button>
                ))}
                <input
                  aria-label="Hoppa i ljud och match"
                  type="range"
                  min={0}
                  max={Math.max(duration, 0)}
                  step={0.1}
                  value={Math.min(displayTime, duration)}
                  disabled={duration <= 0}
                  onFocus={() => setIsScrubbing(true)}
                  onBlur={() => setIsScrubbing(false)}
                  onPointerDown={() => {
                    setDraftTime(currentTime);
                    setIsScrubbing(true);
                  }}
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
