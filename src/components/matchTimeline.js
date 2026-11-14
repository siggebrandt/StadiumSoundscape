export function parsePlaybackTime(value) {
  const match = /^(?:(\d+):([0-5]\d)|(\d+)):([0-5]\d(?:\.\d+)?)$/.exec(
    String(value),
  );
  if (!match) return null;
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? match[3]) * 60 +
    Number(match[4])
  );
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

export function getMatchEnd(match) {
  const segments = getTimelineSegments(match);
  const fullTime = segments.find((segment) => segment.type === "full-time");
  return fullTime ? fullTime.end : null;
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
  const matchMinute =
    segment.clockStart + progress * (segment.clockEnd - segment.clockStart);

  if (segment.type === "added-time") {
    return `${segment.clockStart}+${Math.floor(matchMinute - segment.clockStart)}'`;
  }
  return `${Math.floor(matchMinute)}'`;
}

export function getMatchClock(time, segments) {
  const label = formatMatchMinute(time, segments);
  if (label === "HT" || label === "FT" || label === "—") return { label };

  const segment = segments.find(
    (item) =>
      ["regular", "added-time"].includes(item.type) &&
      time >= item.start &&
      time < item.end,
  );
  const duration = segment.end - segment.start;
  const progress =
    duration > 0 ? Math.min(Math.max((time - segment.start) / duration, 0), 1) : 0;
  const elapsed = Math.floor(
    progress * (segment.clockEnd - segment.clockStart) * 60,
  );
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  if (segment.type === "added-time") {
    return { minutes: `${segment.clockStart}+${minutes}`, seconds };
  }
  return { minutes: segment.clockStart + minutes, seconds };
}

export function getTimelineTicks(segments) {
  const firstHalf = segments.find((segment) => segment.id === "firstHalf");
  const halftime = segments.find((segment) => segment.type === "halftime");
  const secondHalf = segments.find((segment) => segment.id === "secondHalf");
  const fullTime = segments.find((segment) => segment.type === "full-time");

  return [
    firstHalf && {
      time: firstHalf.start,
      label: `${firstHalf.clockStart}'`,
      kind: "major",
    },
    firstHalf &&
      firstHalf.end !== halftime?.start && {
        time: firstHalf.end,
        label: `${firstHalf.clockEnd}'`,
        kind: "major",
      },
    secondHalf &&
      secondHalf.end !== fullTime?.start && {
        time: secondHalf.end,
        label: `${secondHalf.clockEnd}'`,
        kind: "major",
      },
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
      for (
        let minute = segment.clockStart + 1;
        minute < segment.clockEnd;
        minute++
      ) {
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

// Greedy lane assignment so labels never overlap; -1 means "no room, hide label".
export function assignLabelLanes(items, laneCount, gap = 6) {
  const lanes = new Array(items.length).fill(-1);
  const laneEnds = new Array(laneCount).fill(-Infinity);
  items
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => a.left - b.left)
    .forEach(({ left, right, index }) => {
      const lane = laneEnds.findIndex((end) => left >= end + gap);
      if (lane === -1) return;
      laneEnds[lane] = right;
      lanes[index] = lane;
    });
  return lanes;
}

export function layoutEventLabels(items, timelineWidth, laneCount = 3, gap = 8) {
  const lanes = Array.from({ length: laneCount }, () => []);
  const layout = new Array(items.length);
  const ordered = items
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => a.center - b.center);

  ordered.forEach((item) => {
    const width = Math.min(item.width, Math.max(timelineWidth - 12, 24));
    const preferredSides =
      item.center <= timelineWidth / 2 ? ["right", "left"] : ["left", "right"];
    let placement = null;

    for (let lane = 0; lane < laneCount && !placement; lane++) {
      for (const side of preferredSides) {
        const left = side === "right" ? item.center + 7 : item.center - width - 7;
        const right = left + width;
        if (left < 2 || right > timelineWidth - 2) continue;
        const clear = lanes[lane].every(
          (placed) => right + gap <= placed.left || left >= placed.right + gap,
        );
        if (clear) {
          placement = { lane, left, right, side, width };
          break;
        }
      }
    }

    if (placement) {
      lanes[placement.lane].push(placement);
      layout[item.index] = {
        lane: placement.lane,
        offset: placement.left - item.center,
        width: placement.width,
        side: placement.side,
      };
    } else {
      layout[item.index] = { lane: -1, offset: 0, width: 0, side: "right" };
    }
  });

  return layout;
}

// Nudges markers sideways so they keep at least minGap between their centres.
export function spreadPositions(positions, minGap) {
  const order = positions
    .map((position, index) => ({ position, index }))
    .sort((a, b) => a.position - b.position);
  const result = order.map(({ position }) => position);
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < result.length; i++) {
      const overlap = minGap - (result[i] - result[i - 1]);
      if (overlap > 0) {
        result[i - 1] -= overlap / 2;
        result[i] += overlap / 2;
      }
    }
  }
  const output = new Array(positions.length);
  order.forEach(({ index }, i) => {
    output[index] = result[i];
  });
  return output;
}
