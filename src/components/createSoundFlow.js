import * as THREE from "three";
import createCrowd from "./createCrowd.js";
import { BAND_COUNT, createAudioFeatureExtractor } from "./audioFeatures.js";

const PARTICLE_COUNT = 2400;
const DEFAULT_AUDIO_VOLUME = 0.35;
const FLOW_WIDTH = 3.5;
const SOUND_SPEED = 16;
const WAVE_LIFETIME = 2.5;
const STRIPE_COUNT = 10;
const EMPTY_FEATURES = {
  silent: true,
  absolute: 0,
  loudness: 0,
  centroid: 0.5,
  flatness: 0,
  onset: false,
  onsetStrength: 0,
  bands: new Float32Array(BAND_COUNT),
};
const DEFAULT_EMITTER = { x: 0, y: 0 };

function createParticleGeometry(baseColor, emitters) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const opacities = new Float32Array(PARTICLE_COUNT);
  const sizes = new Float32Array(PARTICLE_COUNT);
  const baseSizes = new Float32Array(PARTICLE_COUNT);
  const emitterX = new Float32Array(PARTICLE_COUNT);
  const emitterY = new Float32Array(PARTICLE_COUNT);
  const emitterZ = new Float32Array(PARTICLE_COUNT);
  const directionX = new Float32Array(PARTICLE_COUNT);
  const directionY = new Float32Array(PARTICLE_COUNT);
  const normalX = new Float32Array(PARTICLE_COUNT);
  const normalY = new Float32Array(PARTICLE_COUNT);
  const ages = new Float32Array(PARTICLE_COUNT);
  const colorIndex = new Uint8Array(PARTICLE_COUNT);
  const lifetimes = new Float32Array(PARTICLE_COUNT);
  const birthEnergy = new Float32Array(PARTICLE_COUNT);
  const lateralOffsets = new Float32Array(PARTICLE_COUNT);
  const forwardOffsets = new Float32Array(PARTICLE_COUNT);
  const intensityOffsets = new Float32Array(PARTICLE_COUNT);
  const speeds = new Float32Array(PARTICLE_COUNT);
  const wobblePhases = new Float32Array(PARTICLE_COUNT);
  const wobbleRates = new Float32Array(PARTICLE_COUNT);
  const bandMix = new Float32Array(PARTICLE_COUNT);
  const turbulence = new Float32Array(PARTICLE_COUNT);
  const sourcePositions = emitters.length ? emitters : [DEFAULT_EMITTER];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const index = i * 3;
    positions[index + 2] = 0;
    colors[index] = 0;
    colors[index + 1] = 0;
    colors[index + 2] = 0;
    opacities[i] = 0;
    sizes[i] = 1;
    ages[i] = -1;
  }

  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);

  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("color", colorAttribute);

  const opacityAttribute = new THREE.BufferAttribute(opacities, 1);
  opacityAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aOpacity", opacityAttribute);

  const sizeAttribute = new THREE.BufferAttribute(sizes, 1);
  sizeAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aSize", sizeAttribute);

  return {
    geometry,
    opacities,
    sizes,
    baseSizes,
    emitterX,
    emitterY,
    emitterZ,
    directionX,
    directionY,
    normalX,
    normalY,
    ages,
    colorIndex,
    lifetimes,
    birthEnergy,
    lateralOffsets,
    forwardOffsets,
    intensityOffsets,
    speeds,
    wobblePhases,
    wobbleRates,
    bandMix,
    turbulence,
    sourcePositions,
    baseColor,
  };
}

export default function createSoundFlow({
  color = "#38bdf8",
  colors,
  crowdColors,
  emitters = [DEFAULT_EMITTER],
  markerVertices,
  markerOpacity = 0.95,
  stripeCount = STRIPE_COUNT,
  audioUrl = "sound/soundEffects.mp3",
  onAudioStateChange = () => {},
  onEnded = () => {},
  makeupGain = 1,
}) {
  const group = new THREE.Group();
  const standbyColor = new THREE.Color(color);
  const teamColors = (colors?.length ? colors : [color]).map(
    (value) => new THREE.Color(value),
  );
  const sourcePositions = emitters.length ? emitters : [DEFAULT_EMITTER];
  const flow = createParticleGeometry(standbyColor, sourcePositions);
  const { geometry } = flow;
  const points = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader: `
        attribute float aOpacity;
        attribute float aSize;
        attribute vec3 color;
        varying float vOpacity;
        varying vec3 vColor;
        void main() {
          vOpacity = aOpacity;
          vColor = color;
          gl_PointSize = aSize;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vOpacity;
        varying vec3 vColor;
        void main() {
          float radius = length(gl_PointCoord - vec2(0.5));
          float softEdge = 1.0 - smoothstep(0.18, 0.5, radius);
          float brightCore = 1.0 - smoothstep(0.0, 0.22, radius);
          float alpha = clamp(vOpacity * max(softEdge, brightCore), 0.0, 1.0);
          gl_FragColor = vec4(vColor, alpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  points.frustumCulled = false;

  const hitOrigin = sourcePositions.reduce(
    (sum, emitter) => ({
      x: sum.x + emitter.x / sourcePositions.length,
      y: sum.y + emitter.y / sourcePositions.length,
    }),
    { x: 0, y: 0 },
  );
  const hitDirection = new THREE.Vector2(
    sourcePositions.reduce(
      (sum, emitter) => sum + emitter.directionX / sourcePositions.length,
      0,
    ),
    sourcePositions.reduce(
      (sum, emitter) => sum + emitter.directionY / sourcePositions.length,
      0,
    ),
  );
  const hitLength = 36;
  if (hitDirection.length() > 0) hitDirection.normalize();
  else hitDirection.set(1, 0);

  const hitGeometry = markerVertices
    ? new THREE.BufferGeometry()
    : new THREE.BoxGeometry(FLOW_WIDTH * 4, hitLength, 3);
  if (markerVertices) {
    hitGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(markerVertices, 3),
    );
    hitGeometry.setIndex([0, 1, 2, 0, 2, 3]);
    hitGeometry.computeVertexNormals();
  }
  if (markerVertices) {
    hitGeometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
    );
  }
  const hit = new THREE.Mesh(
    hitGeometry,
    markerVertices
      ? new THREE.ShaderMaterial({
          uniforms: {
            colorA: { value: teamColors[0] },
            colorB: { value: teamColors[1] ?? teamColors[0] },
            stripes: { value: stripeCount },
            opacity: { value: markerOpacity },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 colorA;
            uniform vec3 colorB;
            uniform float stripes;
            uniform float opacity;
            varying vec2 vUv;
            void main() {
              float stripe = mod(floor(vUv.x * stripes), 2.0);
              gl_FragColor = vec4(mix(colorA, colorB, stripe), opacity);
              #include <colorspace_fragment>
            }
          `,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: true,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
          toneMapped: false,
        })
      : new THREE.MeshBasicMaterial({ visible: false }),
  );
  if (!markerVertices) {
    hit.rotation.z = Math.atan2(hitDirection.y, hitDirection.x) - Math.PI / 2;
    hit.position.set(
      hitOrigin.x + hitDirection.x * hitLength * 0.5,
      hitOrigin.y + hitDirection.y * hitLength * 0.5,
      0.5,
    );
  }
  group.add(points, hit);
  const crowd = markerVertices
    ? createCrowd(
        markerVertices,
        crowdColors?.length ? crowdColors : colors?.length ? colors : [color],
      )
    : null;
  if (crowd) group.add(crowd.points);

  let audio;
  let audioContext;
  let analyser;
  let sharedAnalysis;
  let frequencyData;
  let audioVolume = DEFAULT_AUDIO_VOLUME;
  let disposed = false;
  let playing = false;
  let playRequest = 0;
  let pendingSeek = null;
  let emissionEnabled = false;
  let lastUpdateTime = null;
  let timeSinceWave = 1;
  let extractor = null;
  let extractorSource = null;
  let features = EMPTY_FEATURES;
  let nextParticleIndex = 0;

  function initializeAudio() {
    if (!audio) {
      audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.preload = "metadata";
      audio.volume = audioVolume;
      audio.src = audioUrl;
      audio.addEventListener("loadedmetadata", onAudioStateChange);
      audio.addEventListener("durationchange", onAudioStateChange);
      audio.addEventListener("timeupdate", onAudioStateChange);
      audio.addEventListener("error", () => {
        if (!disposed) {
          console.error("Ljudet kunde inte laddas:", audio.src, audio.error);
        }
      });
      audio.addEventListener("ended", () => {
        playing = false;
        onAudioStateChange();
        onEnded();
      });
    }
    return audio;
  }

  function initializeAnalyser(sound) {
    if (audioContext) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported in this browser.");
    }

    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.minDecibels = -75;
    analyser.maxDecibels = -18;
    analyser.smoothingTimeConstant = 0.5;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const source = audioContext.createMediaElementSource(sound);
    source.connect(analyser);
    if (makeupGain > 1) {
      // Lifts quiet passages (ambience) while the compressor keeps loud peaks from clipping.
      const gainNode = audioContext.createGain();
      gainNode.gain.value = makeupGain;
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -26;
      compressor.knee.value = 20;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.25;
      analyser.connect(gainNode);
      gainNode.connect(compressor);
      compressor.connect(audioContext.destination);
    } else {
      analyser.connect(audioContext.destination);
    }
  }

  async function play() {
    const request = ++playRequest;
    sharedAnalysis = null;
    const sound = initializeAudio();
    initializeAnalyser(sound);
    await audioContext.resume();
    if (request !== playRequest || disposed) {
      throw new DOMException("Playback interrupted", "AbortError");
    }
    await sound.play();
    if (request !== playRequest || disposed) {
      throw new DOMException("Playback interrupted", "AbortError");
    }
    playing = true;
    onAudioStateChange();
  }

  function pause() {
    playRequest++;
    if (!audio) return;
    audio.pause();
    playing = false;
    onAudioStateChange();
  }

  function seek(timeSeconds) {
    const sound = initializeAudio();
    const seekToAvailablePosition = () => {
      if (pendingSeek === null || disposed) return;
      const duration = sound.duration;
      sound.currentTime = Number.isFinite(duration)
        ? THREE.MathUtils.clamp(pendingSeek, 0, duration)
        : Math.max(0, pendingSeek);
      pendingSeek = null;
    };

    const wasPending = pendingSeek !== null;
    pendingSeek = timeSeconds;
    if (sound.readyState >= HTMLMediaElement.HAVE_METADATA) {
      seekToAvailablePosition();
    } else if (!wasPending) {
      sound.addEventListener("loadedmetadata", seekToAvailablePosition, {
        once: true,
      });
    }
    onAudioStateChange();
  }

  function getCurrentTime() {
    return audio?.currentTime ?? 0;
  }

  function getDuration() {
    return Number.isFinite(audio?.duration) ? audio.duration : 0;
  }

  function setVolume(volume) {
    audioVolume = THREE.MathUtils.clamp(volume, 0, 1);
    if (audio) audio.volume = audioVolume;
  }

  function emitParticle(index, source, energy, band, burst) {
    const pitch = band / (BAND_COUNT - 1);
    flow.emitterX[index] = source.x;
    flow.emitterY[index] = source.y;
    flow.emitterZ[index] =
      source.heightOffset +
      Math.random() ** 1.5 * (3 + Math.min(energy, 1) * 12) +
      pitch * 3 +
      features.centroid * 6;
    flow.directionX[index] = source.directionX;
    flow.directionY[index] = source.directionY;
    flow.normalX[index] = -source.directionY;
    flow.normalY[index] = source.directionX;
    flow.ages[index] = 0;
    flow.opacities[index] = 0;
    flow.colorIndex[index] = source.colorIndex ?? 0;
    flow.lifetimes[index] =
      WAVE_LIFETIME *
      (0.35 + Math.min(energy, 1) * 0.9 + Math.random() * 0.9) *
      (1.6 - pitch * 0.5);
    flow.birthEnergy[index] = energy;
    flow.lateralOffsets[index] =
      (Math.random() - 0.5) * (1.4 + Math.min(energy, 1) * 2.4);
    flow.forwardOffsets[index] = (Math.random() - 0.5) * 1.2;
    flow.intensityOffsets[index] = 0.65 + Math.random() * 0.35;
    flow.baseSizes[index] =
      (6 + Math.random() * 3 + Math.min(energy, 1) * 4) * (1.2 - pitch * 0.5);
    flow.speeds[index] =
      SOUND_SPEED *
      (0.8 + Math.random() * 0.7 + pitch * 0.4) *
      (0.85 + features.centroid * 0.5) *
      (1 + burst * 0.5);
    flow.turbulence[index] = 0.5 + features.flatness * 2;
    flow.wobblePhases[index] = Math.random() * Math.PI * 2;
    flow.wobbleRates[index] = 1 + pitch * 2.5 + Math.random();
    flow.bandMix[index] = pitch;
  }

  function emitWave(burst) {
    const sources = flow.sourcePositions;
    const gain = (0.35 + features.loudness * 2.2) * (1 + burst * 1.2);
    for (let i = 0; i < sources.length; i++) {
      const band = Math.min(
        BAND_COUNT - 1,
        Math.floor((i / sources.length) * BAND_COUNT),
      );
      const level = Math.min(
        1,
        Math.max(features.bands[band], features.absolute * 0.3),
      );
      const spawn = (level * level * 3 + level * 0.6) * gain;
      let amount = Math.floor(spawn) + (Math.random() < spawn % 1 ? 1 : 0);
      while (amount-- > 0) {
        emitParticle(
          nextParticleIndex,
          sources[i],
          Math.min(1, level + burst * 0.25),
          band,
          burst,
        );
        nextParticleIndex = (nextParticleIndex + 1) % PARTICLE_COUNT;
      }
    }
  }

  function update(timeSeconds) {
    const deltaTime =
      lastUpdateTime === null ? 0 : Math.max(0, timeSeconds - lastUpdateTime);
    lastUpdateTime = timeSeconds;

    const activeAnalyser = sharedAnalysis?.analyser ?? analyser;
    if (activeAnalyser && extractorSource !== activeAnalyser) {
      extractor = createAudioFeatureExtractor(activeAnalyser);
      extractorSource = activeAnalyser;
    }
    features = extractor ? extractor.analyze(deltaTime) : EMPTY_FEATURES;

    const canEmit = Boolean(markerVertices) && (playing || emissionEnabled);
    const energy = Math.min(
      1,
      features.loudness * 0.55 + features.absolute * 0.55,
    );
    crowd?.update(timeSeconds, energy, playing || emissionEnabled);
    timeSinceWave += deltaTime;
    const positions = geometry.attributes.position.array;
    const colors = geometry.attributes.color.array;
    const opacities = flow.opacities;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const index = i * 3;
      if (flow.ages[i] < 0) continue;

      flow.ages[i] += canEmit && !features.silent ? deltaTime : deltaTime * 3;
      const progress = flow.ages[i] / flow.lifetimes[i];
      if (progress >= 1) {
        flow.ages[i] = -1;
        positions[index] = flow.emitterX[i];
        positions[index + 1] = flow.emitterY[i];
        positions[index + 2] = 0;
        colors[index] = 0;
        colors[index + 1] = 0;
        colors[index + 2] = 0;
        opacities[i] = 0;
        continue;
      }

      const age = flow.ages[i];
      const distance =
        flow.speeds[i] * age * (1 - 0.45 * progress) + flow.forwardOffsets[i];
      const wobble = Math.sin(age * flow.wobbleRates[i] + flow.wobblePhases[i]);
      const width =
        flow.lateralOffsets[i] * (1 + progress * 0.7) +
        wobble *
          (0.3 + flow.birthEnergy[i] * 0.8) *
          flow.turbulence[i] *
          progress +
        Math.sin(
          progress * Math.PI * (0.8 + flow.bandMix[i] * 1.4) +
            flow.wobblePhases[i],
        ) *
          (2 + flow.birthEnergy[i] * 5) *
          Math.sin(progress * Math.PI);
      const archHeight =
        (1 + flow.birthEnergy[i] * 8) * Math.sin(progress * Math.PI) +
        progress * flow.bandMix[i] * 4 +
        Math.cos(age * flow.wobbleRates[i] * 0.8 + flow.wobblePhases[i]) *
          flow.birthEnergy[i] *
          0.6 *
          progress;
      const fadeIn = Math.min(progress * 10, 1);
      const fadeOut = (1 - progress) ** 1.3;
      const intensity =
        flow.intensityOffsets[i] *
        (0.55 + Math.min(flow.birthEnergy[i] * 0.6, 0.4)) *
        fadeIn *
        fadeOut;

      positions[index] =
        flow.emitterX[i] +
        flow.directionX[i] * distance +
        flow.normalX[i] * width;
      positions[index + 1] =
        flow.emitterY[i] +
        flow.directionY[i] * distance +
        flow.normalY[i] * width;
      positions[index + 2] = flow.emitterZ[i] + archHeight;

      const particleColor = teamColors[flow.colorIndex[i] % teamColors.length];
      const shine = Math.min(
        1,
        flow.bandMix[i] * flow.birthEnergy[i] * 0.6 + features.centroid * 0.15,
      );
      colors[index] = particleColor.r + (1 - particleColor.r) * shine;
      colors[index + 1] = particleColor.g + (1 - particleColor.g) * shine;
      colors[index + 2] = particleColor.b + (1 - particleColor.b) * shine;
      opacities[i] = Math.min(1, intensity * (0.5 + Math.min(energy * 2.5, 1)));
      flow.sizes[i] = flow.baseSizes[i] * (0.75 + Math.min(energy * 1.5, 0.6));
    }
    if (canEmit && !features.silent) {
      if (features.onset) {
        emitWave(features.onsetStrength);
        timeSinceWave = 0;
      } else if (timeSinceWave >= 0.3 - features.loudness * 0.15) {
        emitWave(0);
        timeSinceWave = 0;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.aOpacity.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
  }

  function dispose() {
    disposed = true;
    playRequest++;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    audioContext?.close();
    geometry.dispose();
    hit.geometry.dispose();
    points.material.dispose();
    hit.material.dispose();
    crowd?.dispose();
  }

  return {
    group,
    hit,
    hasMarker: Boolean(markerVertices),
    prepareAudio: initializeAudio,
    play,
    pause,
    seek,
    getCurrentTime,
    getDuration,
    getAudioUrl: () => audioUrl,
    shareAudioAnalysis(sourceFlow) {
      sharedAnalysis = sourceFlow.getAudioAnalysis();
    },
    getAudioAnalysis: () => ({ analyser, frequencyData }),
    setVolume,
    setEmissionEnabled: (enabled) => {
      emissionEnabled = enabled;
    },
    update,
    isPlaying: () => playing,
    dispose,
  };
}
