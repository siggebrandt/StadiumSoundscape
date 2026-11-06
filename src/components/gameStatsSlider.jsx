import { useEffect, useState } from "react";
import MomentPopups from "./momentPopups";
import {
  formatMatchMinute,
  getMatchScores,
  getMinuteTicks,
  getTimelineSegments,
  getTimelineTicks,
  parsePlaybackTime,
} from "./matchTimeline";
import "./gameStatsSlider.css";

function getTimePosition(time, duration, start = 0) {
  if (duration <= start) return 0;
  return Math.min(Math.max(((time - start) / (duration - start)) * 100, 0), 100);
}

function formatAudioTime(time) {
  const seconds = Math.floor(Math.max(time, 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function IncidentIcon({ type }) {
  switch (type) {
    case "goal":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="6.4" fill="#f7f8fb" />
          <path d="m10 6.3 2.3 1.7-.9 2.7H8.6L7.7 8z" fill="#17212b" />
          <path d="M10 6.3V4m2.3 4 2.2-.7m-3.1 3.4 1.4 1.9m-4.2-1.9-1.4 1.9M7.7 8l-2.2-.7" fill="none" stroke="#17212b" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );
    case "yellow-card":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="6.3" y="4.2" width="7.4" height="11.6" rx="1.1" fill="#f6ce48" stroke="#fff1b1" strokeWidth=".8" transform="rotate(10 10 10)" />
        </svg>
      );
    case "red-card":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="6.3" y="4.2" width="7.4" height="11.6" rx="1.1" fill="#ef5a5a" stroke="#ffc2be" strokeWidth=".8" transform="rotate(10 10 10)" />
        </svg>
      );
    case "substitution":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4.5 7h10m-3-3 3 3-3 3" fill="none" stroke="#65ddb1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15.5 13h-10m3 3-3-3 3-3" fill="none" stroke="#f18585" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

export default function GameStatsSlider({
  currentTime,
  duration,
  playbackMode,
  match,
  listeningMode,
  ambienceStart,
  matchStart,
  hasPlaybackAudio,
  onSeek,
  onTogglePlayback,
  getStandScreenPoint,
}) {
  const [draftTime, setDraftTime] = useState(currentTime);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const timelineStart = listeningMode === "match" ? matchStart : 0;
  const displayTime = Math.min(
    Math.max(isScrubbing ? draftTime : currentTime, timelineStart),
    Math.max(duration, timelineStart),
  );
  const progress = getTimePosition(displayTime, duration, timelineStart);
  const segments = getTimelineSegments(match);
  const ticks = duration > 0 ? getTimelineTicks(segments) : [];
  const minuteTicks = duration > 0 ? getMinuteTicks(segments) : [];
  const events = match.events
    .map((event) => ({
      ...event,
      mediaStart: parsePlaybackTime(event.startTime),
      mediaEnd: parsePlaybackTime(event.endTime),
    }))
    .filter(
      (event) =>
        event.mediaStart !== null &&
        event.mediaEnd !== null &&
        event.mediaEnd >= event.mediaStart &&
        event.mediaEnd >= timelineStart,
    );
  const incidents = (match.incidents ?? [])
    .map((incident) => {
      const time = parsePlaybackTime(incident.time);
      return time === null
        ? null
        : { ...incident, mediaTime: time };
    })
    .filter((incident) => incident && incident.mediaTime >= timelineStart);

  useEffect(() => {
    const teamIds = new Set(match.teams.map((team) => team.id));
    for (const incident of match.incidents ?? []) {
      if (
        incident.type === "goal" &&
        (parsePlaybackTime(incident.time) === null || !teamIds.has(incident.teamId))
      ) {
        console.error("Invalid goal incident: expected an audio timestamp and a matching teamId.", incident);
      }
    }
  }, [match]);

  const scores = getMatchScores(match.teams, incidents, displayTime);

  const popups = (match.popups ?? [])
    .map((popup, index) => {
      const start = parsePlaybackTime(popup.timeStart);
      const end = parsePlaybackTime(popup.timeEnd);
      return start === null || end === null || end <= start
        ? null
        : {
            ...popup,
            id: `${index}-${popup.timeStart}-${popup.position}`,
            mediaStart: start,
            mediaEnd: end,
          };
    })
    .filter(Boolean);

  const seek = (value) => {
    const lowerBound = listeningMode === "match" ? Math.min(matchStart, duration) : 0;
    const time = Math.min(Math.max(Number(value), lowerBound), Math.max(duration, 0));
    setDraftTime(time);
    onSeek(time);
  };

  const seekToTimelinePosition = (time) => {
    if (duration <= 0) return;
    seek(time);
  };

  const canTogglePlayback =
    playbackMode !== "paused" || (hasPlaybackAudio && duration > 0);

  if (listeningMode === "ambience") {
    const available = ambienceStart !== null && duration > ambienceStart;
    const ambienceDuration = available ? duration - ambienceStart : 0;
    const ambienceTime = available
      ? Math.min(Math.max(displayTime - ambienceStart, 0), ambienceDuration)
      : 0;
    return (
      <div className="match-overlay">
        <div className="audio-controls">
          <button
            className="audio-player__button"
            type="button"
            onClick={onTogglePlayback}
            disabled={!canTogglePlayback || !available}
            title={!hasPlaybackAudio && playbackMode === "paused" ? "Lägg till en ljudfil för play-knappen" : undefined}
            aria-label={playbackMode !== "paused" ? "Pausa ljud" : "Spela ljud"}
          >
            {playbackMode !== "paused" ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5h3v14H8zM15 5h3v14h-3z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m8 5 12 7-12 7z" />
              </svg>
            )}
          </button>
          <section className="audio-player audio-player--ambience" aria-label="Ambience-ljud">
            <div className="audio-player__ambience-heading">
              <span>Ambience</span>
              <span>
                {available
                  ? `${formatAudioTime(ambienceTime)} / ${formatAudioTime(ambienceDuration)}`
                  : "Ambience-ljud inte tillgängligt"}
              </span>
            </div>
            <div className="audio-timeline audio-timeline--ambience">
              <div className="audio-timeline__scale">
                <div
                  className="audio-timeline__track"
                  style={{ "--timeline-progress": `${getTimePosition(ambienceTime, ambienceDuration)}%` }}
                />
                <input
                  aria-label="Hoppa i ambience-ljudet"
                  type="range"
                  min={0}
                  max={ambienceDuration}
                  step={0.1}
                  value={ambienceTime}
                  disabled={!available}
                  onBlur={() => setIsScrubbing(false)}
                  onPointerDown={() => {
                    setDraftTime(currentTime);
                    setIsScrubbing(true);
                  }}
                  onKeyDown={() => setIsScrubbing(true)}
                  onKeyUp={() => setIsScrubbing(false)}
                  onPointerUp={() => setIsScrubbing(false)}
                  onPointerCancel={() => setIsScrubbing(false)}
                  onChange={(event) => seek(ambienceStart + Number(event.target.value))}
                  className="audio-timeline__range"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

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
              <strong className="match-team__score">{scores[team.id]}</strong>
            </div>
          ))}
          <span className="match-scoreboard__separator">—</span>
        </div>
        <div className="match-scoreboard__clock">
          {formatMatchMinute(displayTime, segments)}
        </div>
      </header>

      <MomentPopups
        popups={popups}
        currentTime={currentTime}
        playbackMode={playbackMode}
        getStandScreenPoint={getStandScreenPoint}
      />

      <div className="audio-controls">
        <button
          className="audio-player__button"
          type="button"
          onClick={onTogglePlayback}
          disabled={!canTogglePlayback}
          title={!hasPlaybackAudio && playbackMode === "paused" ? "Lägg till en ljudfil för play-knappen" : undefined}
          aria-label={
            playbackMode !== "paused" ? "Pausa ljud" : "Spela ljud"
          }
        >
          {playbackMode !== "paused" ? (
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
          {!hasPlaybackAudio && (
            <span className="audio-player__missing-source" role="status">
              Ljudfil för play-knappen saknas
            </span>
          )}
          <div className="audio-player__timeline">
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
                      duration, timelineStart,
                    );
                    const endPosition = getTimePosition(segment.end, duration, timelineStart);
                    return (
                      <span
                        className="audio-timeline__added-time"
                        key={segment.id}
                        title={segment.label}
                        style={{
                          left: `${startPosition}%`,
                          width: `${endPosition - startPosition}%`,
                        }}
                      >
                        <span className="audio-timeline__added-time-label">
                          +{segment.clockEnd - segment.clockStart}'
                        </span>
                      </span>
                    );
                  })}
                {segments
                  .filter((segment) => segment.type === "halftime")
                  .map((segment) => {
                    if (segment.end <= segment.start) return null;
                    const startPosition = getTimePosition(
                      segment.start,
                      duration, timelineStart,
                    );
                    const endPosition = getTimePosition(segment.end, duration, timelineStart);
                    return (
                      <span
                        className="audio-timeline__halftime"
                        key={segment.id}
                        title={segment.label}
                        style={{
                          left: `${startPosition}%`,
                          width: `${endPosition - startPosition}%`,
                        }}
                      >
                        <span className="audio-timeline__halftime-label">HT</span>
                      </span>
                    );
                  })}
                <div className="audio-timeline__ticks" aria-hidden="true">
                  {minuteTicks.map((tick) => (
                    <span
                      className={`audio-timeline__tick audio-timeline__tick--${tick.kind}`}
                      key={`m-${tick.time}`}
                      style={{
                        left: `${getTimePosition(tick.time, duration, timelineStart)}%`,
                      }}
                    >
                      {tick.label && (
                        <span className="audio-timeline__tick-label">
                          {tick.label}
                        </span>
                      )}
                    </span>
                  ))}
                  {ticks.map((tick) => (
                    <span
                      className={`audio-timeline__tick audio-timeline__tick--${tick.kind}`}
                      key={`${tick.time}-${tick.label}`}
                      style={{
                        left: `${getTimePosition(tick.time, duration, timelineStart)}%`,
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
                {events.map((event) => {
                  const mediaStart = event.mediaStart;
                  const mediaEnd = event.mediaEnd;
                  const startPosition = getTimePosition(mediaStart, duration, timelineStart);
                  const endPosition = getTimePosition(mediaEnd, duration, timelineStart);
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
                        className={`audio-timeline__event`}
                        type="button"
                        style={{ left: `${startPosition}%` }}
                        title={`${event.startTime}–${event.endTime} · ${event.label}`}
                        aria-label={`Hoppa till ${event.label}, ${event.startTime} till ${event.endTime}`}
                        onPointerDown={(pointerEvent) =>
                          pointerEvent.stopPropagation()
                        }
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          seekToTimelinePosition(mediaStart);
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
                {incidents.map((incident) => (
                  <button
                    key={`${incident.type}-${incident.time}`}
                    className={`audio-timeline__incident audio-timeline__incident--${incident.type}`}
                    type="button"
                    style={{
                      left: `${getTimePosition(incident.mediaTime, duration, timelineStart)}%`,
                    }}
                    title={`${formatMatchMinute(incident.mediaTime, segments)} · ${incident.label}`}
                    aria-label={`${incident.label}, ${formatMatchMinute(incident.mediaTime, segments)}`}
                    onPointerDown={(pointerEvent) =>
                      pointerEvent.stopPropagation()
                    }
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      seekToTimelinePosition(incident.mediaTime);
                    }}
                  >
                    <IncidentIcon type={incident.type} />
                  </button>
                ))}
                <input
                  aria-label="Hoppa i ljud och match"
                  type="range"
                  min={Math.min(matchStart, Math.max(duration, 0))}
                  max={Math.max(duration, 0)}
                  step={0.1}
                  value={Math.min(Math.max(displayTime, matchStart), Math.max(duration, 0))}
                  disabled={duration <= matchStart}
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
