import { useEffect, useRef, useState } from "react";
import Waveform from "./waveform";
import {
  layoutEventLabels,
  spreadPositions,
  formatMatchMinute,
  getMatchClock,
  getMatchScores,
  getMinuteTicks,
  getTimelineSegments,
  getTimelineTicks,
  parsePlaybackTime,
} from "./matchTimeline";
import goalIcon from "../assets/icons/events/goal.png";
import substitutionIcon from "../assets/icons/events/substitution.png";
import penaltyIcon from "../assets/icons/events/penalty.png";
import yellowCardIcon from "../assets/icons/events/yellow-card.svg";
import redCardIcon from "../assets/icons/events/red-card.svg";
import "./gameStatsSlider.css";

function getTimePosition(time, duration, start = 0) {
  if (duration <= start) return 0;
  return Math.min(
    Math.max(((time - start) / (duration - start)) * 100, 0),
    100,
  );
}

function formatAudioTime(time) {
  const seconds = Math.floor(Math.max(time, 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const INCIDENT_ICONS = {
  goal: goalIcon,
  "yellow-card": yellowCardIcon,
  "red-card": redCardIcon,
  substitution: substitutionIcon,
  penalty: penaltyIcon,
};

let eventLabelContext;

function measureEventLabel(label) {
  if (typeof document === "undefined") return label.length * 5.5 + 14;
  eventLabelContext ??= document.createElement("canvas").getContext("2d");
  if (!eventLabelContext) return label.length * 5.5 + 14;
  eventLabelContext.font = "600 9px system-ui";
  return Math.ceil(eventLabelContext.measureText(label).width);
}

function IncidentIcon({ type }) {
  if (type === "medical") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M8.3 4.5h3.4v3.8h3.8v3.4h-3.8v3.8H8.3v-3.8H4.5V8.3h3.8z" fill="var(--red)" />
      </svg>
    );
  }
  const src = INCIDENT_ICONS[type];
  return src ? <img src={src} alt="" data-type={type} draggable="false" /> : null;
}

function MatchClock({ time, segments }) {
  const clock = getMatchClock(time, segments);
  if (clock.label) {
    const text =
      clock.label === "HT"
        ? "Halftime"
        : clock.label === "FT"
          ? "Full time"
          : clock.label;
    return <span className="audio-player__clock-minutes">{text}</span>;
  }
  return (
    <>
      <span className="audio-player__clock-minutes">{clock.minutes}</span>
      <span className="audio-player__clock-seconds">
        :{String(clock.seconds).padStart(2, "0")}
      </span>
    </>
  );
}

export default function GameStatsSlider({
  currentTime,
  duration: audioDuration,
  playbackMode,
  match,
  listeningMode,
  waveform,
  ambienceStart,
  matchStart,
  hasPlaybackAudio,
  onSeek,
  onTogglePlayback,
}) {
  const [draftTime, setDraftTime] = useState(currentTime);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [timelinePx, setTimelinePx] = useState(640);
  const scaleRef = useRef(null);
  useEffect(() => {
    const el = scaleRef.current;
    if (!el) return undefined;
    const update = () => setTimelinePx(el.clientWidth || 640);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  });
  const matchSegments = getTimelineSegments(match);
  const fullTimeEnd = matchSegments.find(
    (segment) => segment.type === "full-time",
  )?.end;
  const duration =
    listeningMode === "match" && fullTimeEnd != null
      ? fullTimeEnd
      : audioDuration;
  const timelineStart = listeningMode === "match" ? matchStart : 0;
  const displayTime = Math.min(
    Math.max(isScrubbing ? draftTime : currentTime, timelineStart),
    Math.max(duration, timelineStart),
  );
  const progress = getTimePosition(displayTime, duration, timelineStart);
  const segments = matchSegments;
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
      return time === null ? null : { ...incident, mediaTime: time };
    })
    .filter((incident) => incident && incident.mediaTime >= timelineStart);

  useEffect(() => {
    const teamIds = new Set(match.teams.map((team) => team.id));
    for (const incident of match.incidents ?? []) {
      if (
        incident.type === "goal" &&
        (parsePlaybackTime(incident.time) === null ||
          !teamIds.has(incident.teamId))
      ) {
        console.error(
          "Invalid goal incident: expected an audio timestamp and a matching teamId.",
          incident,
        );
      }
    }
  }, [match]);

  const TIMELINE_PX = timelinePx;
  const eventLabelLayout = layoutEventLabels(
    events.map((event) => {
      const pos = getTimePosition(event.mediaStart, duration, timelineStart);
      const center = (pos / 100) * TIMELINE_PX;
      return {
        center,
        width: measureEventLabel(event.shortLabel ?? event.label),
      };
    }),
    TIMELINE_PX,
  );
  const incidentOffsets = spreadPositions(
    incidents.map(
      (incident) =>
        (getTimePosition(incident.mediaTime, duration, timelineStart) / 100) *
        TIMELINE_PX,
    ),
    20,
  );
  const matchDate = match.date
    ? new Date(`${match.date}T12:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const attendance = match.attendance
    ? Number(match.attendance).toLocaleString("en-GB")
    : null;
  const scores = getMatchScores(match.teams, incidents, displayTime);

  const seek = (value) => {
    const lowerBound =
      listeningMode === "match" ? Math.min(matchStart, duration) : 0;
    const time = Math.min(
      Math.max(Number(value), lowerBound),
      Math.max(duration, 0),
    );
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
            title={
              !hasPlaybackAudio && playbackMode === "paused"
                ? "Add an audio file for the play button"
                : undefined
            }
            aria-label={
              playbackMode !== "paused" ? "Pause audio" : "Play audio"
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
          <section
            className="audio-player audio-player--ambience"
            aria-label="Ambience audio"
          >
            <div className="audio-player__ambience-heading">
              <span>Ambience</span>
              <span>
                {available
                  ? `${formatAudioTime(ambienceTime)} / ${formatAudioTime(ambienceDuration)}`
                  : "Ambience audio unavailable"}
              </span>
            </div>
            <div className="audio-timeline audio-timeline--ambience">
              <div className="audio-timeline__scale">
                <Waveform
                  values={waveform?.values}
                  start={ambienceStart}
                  end={ambienceStart + ambienceDuration}
                  progress={getTimePosition(ambienceTime, ambienceDuration)}
                  bars={90}
                  curve={waveform?.displayCurve}
                />
                <div
                  className="audio-timeline__track"
                  style={{
                    "--timeline-progress": `${getTimePosition(ambienceTime, ambienceDuration)}%`,
                  }}
                />
                <input
                  aria-label="Seek ambience audio"
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
                  onChange={(event) =>
                    seek(ambienceStart + Number(event.target.value))
                  }
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
        <div className="match-scoreboard__meta">
          <span>{match.competition}</span>
          {matchDate && <span>{matchDate}</span>}
        </div>
        <div className="match-scoreboard__teams">
          <div className="match-team match-team--home" key={match.teams[0].id}>
            <img src={match.teams[0].logo} alt="" className="match-team__logo" />
            <span className="match-team__name">{match.teams[0].name}</span>
          </div>
          <div className="match-scoreboard__score">
            <strong>{scores[match.teams[0].id]}</strong>
            <span className="match-scoreboard__separator">–</span>
            <strong>{scores[match.teams[1].id]}</strong>
          </div>
          <div className="match-team match-team--away" key={match.teams[1].id}>
            <img src={match.teams[1].logo} alt="" className="match-team__logo" />
            <span className="match-team__name">{match.teams[1].name}</span>
          </div>
        </div>
        {attendance && (
          <div className="match-scoreboard__attendance">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="7" cy="7" r="2.6" />
              <circle cx="14" cy="8" r="2.1" />
              <path d="M2 16c0-3 2.2-4.8 5-4.8s5 1.8 5 4.8zM12 12.2c.7-.3 1.3-.4 2-.4 2.4 0 4 1.5 4 4.2h-4.6c0-1.4-.5-2.9-1.4-3.8z" />
            </svg>
            {attendance} spectators
          </div>
        )}
      </header>

      <div className="audio-controls">
        <button
          className="audio-player__button"
          type="button"
          onClick={onTogglePlayback}
          disabled={!canTogglePlayback}
          title={
            !hasPlaybackAudio && playbackMode === "paused"
              ? "Add an audio file for the play button"
              : undefined
          }
          aria-label={playbackMode !== "paused" ? "Pause audio" : "Play audio"}
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
              Audio file for the play button is missing
            </span>
          )}
          <div className="audio-player__clock" aria-live="off">
            <span className="audio-player__clock-caption">Match time</span>
            <strong className="audio-player__clock-value">
              <MatchClock time={displayTime} segments={segments} />
            </strong>
          </div>
          <div className="audio-player__timeline">
            <div className="audio-timeline">
              <div className="audio-timeline__scale" ref={scaleRef}>
                <Waveform
                  values={waveform?.values}
                  start={timelineStart}
                  end={duration}
                  progress={progress}
                  bars={Math.max(40, Math.floor(timelinePx / 4))}
                  curve={waveform?.displayCurve}
                />
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
                      timelineStart,
                    );
                    const endPosition = getTimePosition(
                      segment.end,
                      duration,
                      timelineStart,
                    );
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
                          +{Math.round(segment.clockEnd - segment.clockStart)}'
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
                      duration,
                      timelineStart,
                    );
                    const endPosition = getTimePosition(
                      segment.end,
                      duration,
                      timelineStart,
                    );
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
                        <span className="audio-timeline__halftime-label">
                          Halftime
                        </span>
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
                {events.map((event, eventIndex) => {
                  const labelLayout = eventLabelLayout[eventIndex];
                  const lane = labelLayout.lane;
                  const mediaStart = event.mediaStart;
                  const mediaEnd = event.mediaEnd;
                  const startPosition = getTimePosition(
                    mediaStart,
                    duration,
                    timelineStart,
                  );
                  const endPosition = getTimePosition(
                    mediaEnd,
                    duration,
                    timelineStart,
                  );
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
                        className={`audio-timeline__event audio-timeline__event--lane-${Math.max(lane, 0)}${lane === -1 ? " audio-timeline__event--compact" : ""}${labelLayout.side === "left" ? " audio-timeline__event--label-left" : ""}`}
                        type="button"
                        style={{
                          left: `${startPosition}%`,
                          "--event-label-offset": `${labelLayout.offset}px`,
                          "--event-label-width": `${labelLayout.width}px`,
                        }}
                        title={`${event.startTime}–${event.endTime} · ${event.label}`}
                        aria-label={`Jump to ${event.label}, ${event.startTime} to ${event.endTime}`}
                        onPointerDown={(pointerEvent) =>
                          pointerEvent.stopPropagation()
                        }
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          const targetTime =
                            mediaStart >= duration - 1
                              ? Math.max(timelineStart, duration - 10)
                              : mediaStart;
                          seekToTimelinePosition(targetTime);
                        }}
                      >
                        <span className="audio-timeline__event-label">
                          {event.shortLabel ?? event.label}
                        </span>
                        <span className="audio-timeline__event-stem" />
                        <span className="audio-timeline__event-dot" />
                      </button>
                    </span>
                  );
                })}
                {incidents.map((incident, incidentIndex) => (
                  <button
                    key={`${incident.type}-${incident.time}`}
                    className={`audio-timeline__incident audio-timeline__incident--${incident.type}`}
                    type="button"
                    style={{
                      left: `${(incidentOffsets[incidentIndex] / TIMELINE_PX) * 100}%`,
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
                  aria-label="Seek audio and match"
                  type="range"
                  min={Math.min(matchStart, Math.max(duration, 0))}
                  max={Math.max(duration, 0)}
                  step={0.1}
                  value={Math.min(
                    Math.max(displayTime, matchStart),
                    Math.max(duration, 0),
                  )}
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
