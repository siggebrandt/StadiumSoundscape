import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assignLabelLanes,
  spreadPositions,
  formatMatchMinute,
  getMatchStart,
  getMatchScores,
  getMinuteTicks,
  getTimelineSegments,
  getTimelineTicks,
  parsePlaybackTime,
} from "../src/components/matchTimeline.js";

test("scores follow goal timestamps in either seek direction", () => {
  const teams = [{ id: "home" }, { id: "away" }];
  const incidents = [
    { type: "goal", teamId: "away", mediaTime: 20 },
    { type: "yellow-card", teamId: "home", mediaTime: 5 },
    { type: "goal", teamId: "home", mediaTime: 10.5 },
    { type: "goal", teamId: "home", mediaTime: 20 },
    { type: "goal", teamId: "unknown", mediaTime: 1 },
  ];
  assert.deepEqual(getMatchScores(teams, incidents, 0), { home: 0, away: 0 });
  assert.deepEqual(getMatchScores(teams, incidents, 10.499), { home: 0, away: 0 });
  assert.deepEqual(getMatchScores(teams, incidents, 10.5), { home: 1, away: 0 });
  assert.deepEqual(getMatchScores(teams, incidents, 20), { home: 2, away: 1 });
  assert.deepEqual(getMatchScores(teams, incidents, 5), { home: 0, away: 0 });
});

test("parses audio timestamps, including fractional seconds", () => {
  assert.equal(parsePlaybackTime("01:30"), 90);
  assert.equal(parsePlaybackTime("01:30.500"), 90.5);
  assert.equal(parsePlaybackTime("120:59.125"), 7259.125);
  assert.equal(parsePlaybackTime("01:00:09"), 3609);
  assert.equal(parsePlaybackTime("2:34:20"), 9260);
  assert.equal(parsePlaybackTime("02:45:33.500"), 9933.5);
  assert.equal(parsePlaybackTime("02:60:00"), null);
  assert.equal(parsePlaybackTime("02:34:2"), null);
  assert.equal(parsePlaybackTime("01:60"), null);
  assert.equal(parsePlaybackTime("1:2"), null);
});

test("segment positions and match clock use the configured audio times", () => {
  const segments = getTimelineSegments({
    timelineSegments: [
      { id: "firstHalf", type: "regular", startTime: "00:00", endTime: "01:00", clockStart: 0, clockEnd: 45 },
      { id: "added", type: "added-time", startTime: "01:00", endTime: "01:05", clockStart: 45, clockEnd: 50 },
      { id: "halftime", type: "halftime", startTime: "01:05", endTime: "01:35" },
      { id: "secondHalf", type: "regular", startTime: "01:35", endTime: "02:35", clockStart: 45, clockEnd: 90 },
      { id: "fullTime", type: "full-time", startTime: "02:35", endTime: "02:35" },
    ],
  });
  assert.equal(segments[2].start, 65);
  assert.equal(segments[2].end, 95);
  assert.equal(formatMatchMinute(30, segments), "22'");
  assert.equal(formatMatchMinute(62, segments), "45+2'");
  assert.equal(formatMatchMinute(65, segments), "HT");
  assert.equal(formatMatchMinute(94.9, segments), "HT");
  assert.equal(formatMatchMinute(95, segments), "45'");
  assert.equal(formatMatchMinute(155, segments), "FT");
  assert.equal(getMinuteTicks(segments).find((tick) => tick.label === "60'").time, 115);
  assert.equal(getTimelineTicks(segments).find((tick) => tick.label === "FT").time, 155);
});

test("match start comes from a valid first half", () => {
  const firstHalf = (startTime) => ({
    timelineSegments: [{ id: "firstHalf", startTime, endTime: "01:00" }],
  });
  assert.equal(getMatchStart(firstHalf("00:00")), 0);
  assert.equal(getMatchStart(firstHalf("00:30")), 30);
  assert.throws(() => getMatchStart(firstHalf("invalid")), /firstHalf/);
});

for (const stadium of ["ullevi", "eleda"]) {
  test(`${stadium} timeline timestamps and goal teams are valid`, () => {
    const data = JSON.parse(readFileSync(new URL(`../src/assets/json/${stadium}.json`, import.meta.url)));
    const { timelineSegments, events, incidents, popups } = data.match;
    const teamIds = new Set(data.match.teams.map((team) => team.id));
    for (const goal of incidents.filter((incident) => incident.type === "goal")) {
      assert.ok(teamIds.has(goal.teamId), `invalid goal teamId: ${goal.teamId}`);
    }
    for (const [entries, fields] of [
      [timelineSegments, ["startTime", "endTime"]],
      [events, ["startTime", "endTime"]],
      [incidents, ["time"]],
      [popups, ["timeStart", "timeEnd"]],
    ]) {
      for (const entry of entries) {
        for (const field of fields) {
          const time = parsePlaybackTime(entry[field]);
          assert.notEqual(time, null, `${field}: ${entry[field]}`);
          if (stadium === "eleda") assert.ok(time <= 162.2, `${field}: ${entry[field]}`);
        }
      }
    }
    if (stadium === "eleda") assert.equal(getTimelineSegments(data.match).find((segment) => segment.id === "fullTime").start, 162.2);
  });
}

test("Ullevi timing and score follow the supplied recording", () => {
  const { match } = JSON.parse(readFileSync(new URL("../src/assets/json/ullevi.json", import.meta.url)));
  const segments = getTimelineSegments(match);
  assert.equal(getMatchStart(match), 1828);
  const incidents = match.incidents.map((incident) => ({
    ...incident,
    mediaTime: parsePlaybackTime(incident.time),
  }));
  assert.equal(formatMatchMinute(parsePlaybackTime("00:30:27"), segments), "—");
  assert.equal(formatMatchMinute(parsePlaybackTime("00:30:28"), segments), "0'");
  assert.equal(formatMatchMinute(parsePlaybackTime("01:20:41"), segments), "HT");
  assert.equal(formatMatchMinute(parsePlaybackTime("01:35:58"), segments), "45'");
  assert.equal(formatMatchMinute(parsePlaybackTime("02:24:32"), segments), "FT");
  assert.deepEqual(getMatchScores(match.teams, incidents, parsePlaybackTime("01:01:32")), { 8222: 0, 2556: 0 });
  assert.deepEqual(getMatchScores(match.teams, incidents, parsePlaybackTime("01:01:33")), { 8222: 1, 2556: 0 });
  assert.deepEqual(getMatchScores(match.teams, incidents, parsePlaybackTime("02:02:30")), { 8222: 1, 2556: 1 });
  assert.deepEqual(getTimelineTicks(segments).map((tick) => tick.label), ["0'", "45'", "90'", "FT"]);
  const findEvent = (label) => match.events.find((event) => event.label === label);
  assert.equal(findEvent("GAIS sub no. 9").endTime, "02:10:51");
  assert.equal(findEvent("Mic 18 drops"), undefined);
});

test("label lanes avoid overlap and markers are spread apart", () => {
  const lanes = assignLabelLanes(
    [{ left: 0, right: 40 }, { left: 10, right: 50 }, { left: 20, right: 60 }],
    2,
  );
  assert.deepEqual(lanes, [0, 1, -1]);
  const spread = spreadPositions([100, 106, 300], 18);
  assert.ok(spread[1] - spread[0] >= 18 - 1e-9);
  assert.equal(spread[2], 300);
});
