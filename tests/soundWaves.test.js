import assert from "node:assert/strict";
import test from "node:test";
import createSoundFlow from "../src/components/createSoundFlow.js";

test("sound energy creates subtle wavefronts across the stand and pause fades them out", async () => {
  const original = {
    Audio: globalThis.Audio,
    HTMLMediaElement: globalThis.HTMLMediaElement,
    window: globalThis.window,
  };
  let energy = 0;
  class MockAudio extends EventTarget {
    pause() {}
    play() { return Promise.resolve(); }
  }
  class MockContext {
    createAnalyser() {
      return {
        frequencyBinCount: 256,
        connect() {},
        getByteFrequencyData(data) { data.fill(energy); },
      };
    }
    createMediaElementSource() { return { connect() {} }; }
    resume() { return Promise.resolve(); }
    close() {}
  }
  globalThis.Audio = MockAudio;
  globalThis.HTMLMediaElement = { HAVE_METADATA: 1 };
  globalThis.window = { AudioContext: MockContext };
  const emitters = Array.from({ length: 30 }, (_, i) => ({
    x: i * 4,
    y: 0,
    heightOffset: 4,
    directionX: 0,
    directionY: 1,
    colorIndex: i % 2,
  }));
  const flow = createSoundFlow({
    colors: ["#0057b8", "#ffffff"],
    emitters,
    markerVertices: [0, 0, 0, 120, 0, 0, 120, 4, 0, 0, 4, 0],
  });
  const sharedFlow = createSoundFlow({
    emitters,
    markerVertices: [0, 0, 0, 120, 0, 0, 120, 4, 0, 0, 4, 0],
  });
  try {
    await flow.play();
    sharedFlow.shareAudioAnalysis(flow);
    sharedFlow.setEmissionEnabled(true);
    const geometry = flow.group.children[0].geometry;
    const opacity = geometry.getAttribute("aOpacity").array;
    const position = geometry.getAttribute("position").array;
    for (let frame = 0; frame <= 20; frame++) flow.update(frame / 10);
    assert.ok(opacity.every((value) => value === 0), "silence must not create waves");

    energy = 200;
    for (let frame = 21; frame <= 32; frame++) {
      flow.update(frame / 10);
      sharedFlow.update(frame / 10);
    }
    const visible = Array.from(opacity, (alpha, index) => ({ alpha, index }))
      .filter(({ alpha }) => alpha > 0);
    assert.ok(visible.length >= 100, "multiple wavefronts should be visible");
    const x = visible.map(({ index }) => position[index * 3]);
    const y = visible.map(({ index }) => position[index * 3 + 1]);
    assert.ok(Math.max(...x) - Math.min(...x) > 100, "waves cover the whole stand");
    assert.ok(Math.max(...y) - Math.min(...y) > 5, "distinct fronts travel outward");
    assert.ok(Math.max(...visible.map(({ alpha }) => alpha)) <= 0.53, "particles remain translucent");
    const sharedOpacity = sharedFlow.group.children[0].geometry.getAttribute("aOpacity").array;
    assert.ok(sharedOpacity.some((value) => value > 0), "shared audio drives other stands");

    flow.pause();
    for (let frame = 33; frame <= 65; frame++) flow.update(frame / 10);
    assert.ok(opacity.every((value) => value === 0), "waves fade after pause");

    energy = 0;
    sharedFlow.update(6.5);
    assert.ok(sharedOpacity.every((value) => value === 0), "silence and a long frame expire existing waves");
  } finally {
    flow.dispose();
    sharedFlow.dispose();
    Object.assign(globalThis, original);
  }
});
