export function parsePlaybackTime(value) {
  const match = /^(?:(\d+):([0-5]\d)|(\d+)):([0-5]\d(?:\.\d+)?)$/.exec(String(value));
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? match[3]) * 60 + Number(match[4]);
}

export function getMatchScores(teams, incidents, time) {
  const scores = Object.fromEntries(teams.map((team) => [team.id, 0]));
  for (const incident of incidents) {
    if (
      incident.type === "goal" &&
      incident.mediaTime <= time &&
      Object.hasOwn(scores, incident.teamId)
    ) {
      scores[incident.teamId] += 1;
    }
  }
  return scores;
}

export function getTimelineSegments(match) {
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

export function getMatchStart(match) {
  const firstHalf = getTimelineSegments(match).find(
    (segment) => segment.id === "firstHalf",
  );
  if (!firstHalf) {
    throw new Error("Match timeline requires a valid firstHalf segment.");
  }
  return firstHalf.start;
}

export function formatMatchMinute(time, segments) {
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
  const progress =
    segmentDuration > 0
      ? Math.min(Math.max((time - segment.start) / segmentDuration, 0), 1)
      : 0;
  const matchMinute = segment.clockStart +
    progress * (segment.clockEnd - segment.clockStart);

  if (segment.type === "added-time") {
    return `${segment.clockStart}+${Math.floor(matchMinute - segment.clockStart)}'`;
  }
  return `${Math.floor(matchMinute)}'`;
}

export function getTimelineTicks(segments) {
  const firstHalf = segments.find((segment) => segment.id === "firstHalf");
  const halftime = segments.find((segment) => segment.type === "halftime");
  const secondHalf = segments.find((segment) => segment.id === "secondHalf");
  const fullTime = segments.find((segment) => segment.type === "full-time");

  return [
    firstHalf && { time: firstHalf.start, label: `${firstHalf.clockStart}'`, kind: "major" },
    firstHalf && firstHalf.end !== halftime?.start && { time: firstHalf.end, label: `${firstHalf.clockEnd}'`, kind: "major" },
    secondHalf && secondHalf.end !== fullTime?.start && { time: secondHalf.end, label: `${secondHalf.clockEnd}'`, kind: "major" },
    fullTime && { time: fullTime.start, label: "FT", kind: "major" },
  ].filter((tick) => tick && tick.time !== null && tick.time >= 0);
}

export function getMinuteTicks(segments) {
  const ticks = [];
  segments
    .filter((segment) => segment.type === "regular")
    .forEach((segment) => {
      const span = segment.clockEnd - segment.clockStart;
      if (span <= 0) return;
      for (let minute = segment.clockStart + 1; minute < segment.clockEnd; minute++) {
        const progress = (minute - segment.clockStart) / span;
        let kind = "minute";
        let label = null;
        if (minute % 15 === 0) {
          kind = "quarter";
          label = `${minute}'`;
        } else if (minute % 5 === 0) {
          kind = "five";
        }
        ticks.push({
          time: segment.start + progress * (segment.end - segment.start),
          kind,
          label,
        });
      }
    });
  return ticks;
}
