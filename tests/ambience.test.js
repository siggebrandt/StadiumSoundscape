import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getMatchStart, parsePlaybackTime } from "../src/components/matchTimeline.js";

test("ambience uses the configured recording segment without match UI", async () => {
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const { default: GameStatsSlider } = await server.ssrLoadModule(
      "/src/components/gameStatsSlider.jsx",
    );
    const data = JSON.parse(readFileSync(new URL("../src/assets/json/ullevi.json", import.meta.url)));
    assert.equal(data.playbackAudioUrl, "https://pub-1d96cb4be0404635bd64f97cb3396c02.r2.dev/ullevi/everything.ogg");
    const start = parsePlaybackTime(data.ambience.startTime);
    const render = (listeningMode, currentTime, duration, hasPlaybackAudio = true, playbackMode = "paused") => renderToStaticMarkup(
      React.createElement(GameStatsSlider, {
        currentTime,
        duration,
        playbackMode,
        match: data.match,
        listeningMode,
        ambienceStart: start,
        matchStart: getMatchStart(data.match),
        hasPlaybackAudio,
        onSeek: () => {},
        onTogglePlayback: () => {},
        getStandScreenPoint: () => null,
      }),
    );
    assert.equal(start, 9218);
    const ambience = render("ambience", start + 10, 9933.5, false);
    assert.match(ambience, /0:10 \/ 11:55/);
    assert.match(ambience, /aria-label="Hoppa i ambience-ljudet"/);
    assert.match(ambience, /max="715.5"/);
    assert.match(ambience, /Lägg till en ljudfil för play-knappen/);
    assert.match(ambience, /<button[^>]*disabled=""/);
    const availableAmbience = render("ambience", start, 9933.5, Boolean(data.playbackAudioUrl));
    assert.doesNotMatch(availableAmbience, /<button[^>]*disabled=""/);
    const playingAmbience = render("ambience", start + 10, 9933.5, false, "solo");
    assert.match(playingAmbience, /aria-label="Pausa ljud"/);
    assert.doesNotMatch(playingAmbience, /<button[^>]*disabled=""/);
    assert.doesNotMatch(ambience, /match-scoreboard|GAIS mål på straff|audio-timeline__incident/);
    assert.match(render("ambience", 0, 0, false), /Ambience-ljud inte tillgängligt/);
    const match = render("match", 0, 9933.5);
    assert.match(match, /match-scoreboard/);
    assert.match(match, /aria-label="Hoppa i ljud och match"[^>]*min="1828"[^>]*value="1828"/);
    assert.match(match, /audio-timeline__tick--major"[^>]*left:0%/);
    assert.match(match, /match-scoreboard__clock">0&#x27;/);
    const available = render("match", start, 9933.5, Boolean(data.playbackAudioUrl));
    assert.doesNotMatch(available, /Ljudfil för play-knappen saknas/);
    assert.doesNotMatch(available, /<button[^>]*disabled=""/);
    const missing = render("match", start, 9933.5, false);
    assert.match(missing, /Ljudfil för play-knappen saknas/);
    assert.match(missing, /<button[^>]*disabled=""/);

    const eleda = JSON.parse(readFileSync(new URL("../src/assets/json/eleda.json", import.meta.url)));
    assert.equal(parsePlaybackTime(eleda.ambience.startTime), start);
  } finally {
    await server.close();
  }
});
