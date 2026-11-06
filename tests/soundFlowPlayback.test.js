import assert from "node:assert/strict";
import test from "node:test";
import createSoundFlow from "../src/components/createSoundFlow.js";

test("pending seeks use the latest time and paused pending playback does not start", async () => {
  const original = {
    Audio: globalThis.Audio,
    HTMLMediaElement: globalThis.HTMLMediaElement,
    window: globalThis.window,
  };
  let resume;
  class MockAudio extends EventTarget {
    readyState = 0;
    duration = 10000;
    currentTime = 0;
    plays = 0;
    pause() {}
    play() { this.plays++; return Promise.resolve(); }
  }
  class MockContext {
    createAnalyser() { return { frequencyBinCount: 256, connect() {} }; }
    createMediaElementSource() { return { connect() {} }; }
    resume() { return new Promise((resolve) => { resume = resolve; }); }
    close() {}
  }
  globalThis.Audio = MockAudio;
  globalThis.HTMLMediaElement = { HAVE_METADATA: 1 };
  globalThis.window = { AudioContext: MockContext };
  const flow = createSoundFlow({ audioUrl: "test.ogg" });
  try {
    const audio = flow.prepareAudio();
    flow.seek(100);
    flow.seek(200);
    audio.readyState = 1;
    audio.dispatchEvent(new Event("loadedmetadata"));
    assert.equal(audio.currentTime, 200);
    const pending = flow.play();
    flow.pause();
    resume();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(audio.plays, 0);
    assert.equal(flow.isPlaying(), false);
  } finally {
    flow.dispose();
    Object.assign(globalThis, original);
  }
});
