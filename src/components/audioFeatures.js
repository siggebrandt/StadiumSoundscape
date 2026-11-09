export const BAND_COUNT = 12;

const MIN_HZ = 40;
const MAX_HZ = 12000;

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const follow = (current, target, dt, attack, release) =>
  current +
  (target - current) *
    (1 - Math.exp(-dt * (target > current ? attack : release)));

// Reads an AnalyserNode each frame and returns musical features that describe
// how the sound actually behaves (level, onsets, brightness, noisiness, bands).
export function createAudioFeatureExtractor(analyser) {
  const binCount = analyser.frequencyBinCount;
  const fftSize = analyser.fftSize ?? binCount * 2;
  const sampleRate = analyser.context?.sampleRate ?? 44100;
  const binHz = sampleRate / fftSize;
  const lastBin = Math.min(
    binCount - 1,
    Math.max(2, Math.floor(MAX_HZ / binHz)),
  );
  const spectrum = new Uint8Array(binCount);
  const wave = analyser.getByteTimeDomainData ? new Uint8Array(fftSize) : null;
  const previous = new Float32Array(binCount);
  const edges = Array.from({ length: BAND_COUNT + 1 }, (_, index) =>
    Math.max(
      1,
      Math.round((MIN_HZ * (MAX_HZ / MIN_HZ) ** (index / BAND_COUNT)) / binHz),
    ),
  );
  for (let index = 1; index < edges.length; index++) {
    edges[index] = Math.min(
      Math.max(edges[index], edges[index - 1] + 1),
      lastBin + 1,
    );
  }

  const bandAverage = new Float32Array(BAND_COUNT);
  const features = {
    silent: true,
    rms: 0,
    absolute: 0,
    loudness: 0,
    bands: new Float32Array(BAND_COUNT),
    bass: 0,
    mid: 0,
    treble: 0,
    centroid: 0.5,
    flatness: 0,
    flux: 0,
    onset: false,
    onsetStrength: 0,
  };
  let peak = 0.05;
  let fluxAverage = 0;
  let sinceOnset = 1;
  let smoothedRms = 0;
  let smoothedCentroid = 0.5;
  let smoothedFlatness = 0;

  function analyze(dt = 1 / 60) {
    dt = Math.min(Math.max(dt, 0.001), 0.25);
    analyser.getByteFrequencyData(spectrum);

    let rms = 0;
    if (wave) {
      analyser.getByteTimeDomainData(wave);
      let sum = 0;
      for (let i = 0; i < wave.length; i++) {
        const sample = (wave[i] - 128) / 128;
        sum += sample * sample;
      }
      rms = Math.sqrt(sum / wave.length);
    }

    let flux = 0;
    let weighted = 0;
    let total = 0;
    let logSum = 0;
    const logRange = Math.log(MAX_HZ / MIN_HZ);
    for (let i = 1; i <= lastBin; i++) {
      const magnitude = spectrum[i] / 255;
      flux += Math.max(0, magnitude - previous[i]);
      previous[i] = magnitude;
      const position = clamp(
        Math.log(Math.max(i * binHz, MIN_HZ) / MIN_HZ) / logRange,
      );
      weighted += magnitude * position;
      total += magnitude;
      logSum += Math.log(magnitude + 0.002);
    }
    const bins = lastBin;
    flux /= bins;
    if (!wave) rms = (total / bins) * 0.6;
    const arithmetic = total / bins + 0.002;
    const flatness = clamp(Math.exp(logSum / bins) / arithmetic);
    const centroid = total > 0.01 ? weighted / total : 0.5;

    for (let band = 0; band < BAND_COUNT; band++) {
      let sum = 0;
      for (let i = edges[band]; i < edges[band + 1]; i++) sum += spectrum[i];
      const raw = sum / ((edges[band + 1] - edges[band]) * 255);
      bandAverage[band] = follow(bandAverage[band], raw, dt, 0.8, 0.8);
      const target = clamp(
        raw * 0.5 + Math.max(0, raw - bandAverage[band] * 0.7) * 1.4,
      );
      features.bands[band] = follow(features.bands[band], target, dt, 14, 4);
    }

    smoothedRms = follow(smoothedRms, rms, dt, 12, 4);
    peak = Math.max(smoothedRms, 0.05, peak * (1 - dt * 0.03));
    features.rms = smoothedRms;
    features.absolute = clamp(smoothedRms * 3);
    features.loudness = follow(
      features.loudness,
      clamp(smoothedRms / peak) ** 1.5,
      dt,
      6,
      2,
    );
    smoothedCentroid = follow(smoothedCentroid, centroid, dt, 4, 4);
    smoothedFlatness = follow(smoothedFlatness, flatness, dt, 4, 4);
    features.centroid = smoothedCentroid;
    features.flatness = smoothedFlatness;
    const mean = (from, to) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += features.bands[i];
      return sum / (to - from);
    };
    features.bass = mean(0, 3);
    features.mid = mean(3, 8);
    features.treble = mean(8, BAND_COUNT);

    sinceOnset += dt;
    const ratio = flux / (fluxAverage + 0.002);
    features.flux = flux;
    features.onset = ratio > 1.6 && flux > 0.004 && sinceOnset > 0.12;
    features.onsetStrength = features.onset
      ? clamp((ratio - 1.6) / 2.4 + 0.3, 0.3, 1)
      : 0;
    if (features.onset) sinceOnset = 0;
    fluxAverage = follow(fluxAverage, flux, dt, 1.5, 1.5);
    features.silent = rms < 0.008 && total / bins < 0.02;
    return features;
  }

  return { analyze, features };
}
