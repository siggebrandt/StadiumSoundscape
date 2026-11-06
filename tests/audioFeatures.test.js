import assert from "node:assert/strict";
import test from "node:test";
import { createAudioFeatureExtractor } from "../src/components/audioFeatures.js";

function fakeAnalyser({ spectrum, amplitude }) {
  return {
    fftSize: 2048,
    frequencyBinCount: 1024,
    context: { sampleRate: 44100 },
    getByteFrequencyData(data) { spectrum(data); },
    getByteTimeDomainData(data) {
      for (let i = 0; i < data.length; i++) data[i] = 128 + Math.sin(i / 5) * amplitude() * 127;
    },
  };
}

test("detects silence, loudness, onsets and brightness from the analyser", () => {
  let level = 0;
  let from = 1;
  let to = 40;
  const extractor = createAudioFeatureExtractor(fakeAnalyser({
    spectrum: (data) => {
      data.fill(0);
      for (let i = from; i < to; i++) data[i] = level * 255;
    },
    amplitude: () => level,
  }));
  for (let i = 0; i < 30; i++) extractor.analyze(1 / 60);
  assert.equal(extractor.features.silent, true);
  assert.equal(extractor.features.onset, false);

  level = 0.8;
  let sawOnset = false;
  for (let i = 0; i < 30; i++) {
    const { onset } = extractor.analyze(1 / 60);
    sawOnset = sawOnset || onset;
  }
  assert.equal(sawOnset, true);
  assert.equal(extractor.features.silent, false);
  assert.ok(extractor.features.absolute > 0.5);
  const lowCentroid = extractor.features.centroid;
  assert.ok(extractor.features.bands[0] > extractor.features.bands[11]);

  from = 300;
  to = 500;
  for (let i = 0; i < 120; i++) extractor.analyze(1 / 60);
  assert.ok(extractor.features.centroid > lowCentroid);
  assert.ok(extractor.features.bands[11] > extractor.features.bands[0]);
});
