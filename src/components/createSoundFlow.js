import * as THREE from "three";
import createCrowd from "./createCrowd";

const PARTICLE_COUNT = 1200;
const DEFAULT_AUDIO_VOLUME = 0.35;
const FLOW_WIDTH = 3.5;
const SOUND_SPEED = 16;
const WAVE_LIFETIME = 2.5;
const STRIPE_COUNT = 10;
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
          float alpha = clamp(vOpacity * max(softEdge * 0.9, brightCore), 0.0, 0.96);
          gl_FragColor = vec4(vColor, alpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: false,
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
    ? createCrowd(markerVertices, crowdColors?.length ? crowdColors : (colors?.length ? colors : [color]))
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
  let currentVolume = 0;
  let currentMidEnergy = 0;
  let currentBassEnergy = 0;
  let lastUpdateTime = null;
  let timeSinceWave = 1;
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
    analyser.fftSize = 512;
    analyser.minDecibels = -75;
    analyser.maxDecibels = -18;
    analyser.smoothingTimeConstant = 0.65;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const source = audioContext.createMediaElementSource(sound);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
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

  function emitParticle(index, source, energy) {
    flow.emitterX[index] = source.x;
    flow.emitterY[index] = source.y;
    flow.emitterZ[index] = source.heightOffset;
    flow.directionX[index] = source.directionX;
    flow.directionY[index] = source.directionY;
    flow.normalX[index] = -source.directionY;
    flow.normalY[index] = source.directionX;
    flow.ages[index] = 0;
    flow.opacities[index] = 0;
    flow.colorIndex[index] = source.colorIndex ?? 0;
    flow.lifetimes[index] = WAVE_LIFETIME;
    flow.birthEnergy[index] = energy;
    flow.lateralOffsets[index] = (Math.random() - 0.5) * 2.4;
    flow.forwardOffsets[index] = (Math.random() - 0.5) * 1.2;
    flow.intensityOffsets[index] = 0.65 + Math.random() * 0.35;
    flow.baseSizes[index] = 4 + Math.random() * 1.5;
  }

  function emitWave(energy) {
    const sources = flow.sourcePositions;
    const count = Math.min(sources.length * 2, Math.floor(PARTICLE_COUNT / 5));
    for (let i = 0; i < count; i++) {
      const source = sources[Math.floor(i * sources.length / count)];
      emitParticle(nextParticleIndex, source, energy);
      nextParticleIndex = (nextParticleIndex + 1) % PARTICLE_COUNT;
    }
  }

  function update(timeSeconds) {
    const deltaTime =
      lastUpdateTime === null
        ? 0
        : Math.max(0, timeSeconds - lastUpdateTime);
    lastUpdateTime = timeSeconds;

    let midEnergy = 0;
    let bassEnergy = 0;
    let volume = 0;
    const activeAnalyser = sharedAnalysis?.analyser ?? analyser;
    const activeFrequencyData = sharedAnalysis?.frequencyData ?? frequencyData;
    if (activeAnalyser && activeFrequencyData) {
      activeAnalyser.getByteFrequencyData(activeFrequencyData);
      const bassBandEnd = Math.min(4, activeFrequencyData.length);
      const lowBandEnd = Math.min(12, activeFrequencyData.length);
      const midBandEnd = Math.min(36, activeFrequencyData.length);
      let totalEnergy = 0;
      for (let i = 0; i < activeFrequencyData.length; i++) {
        totalEnergy += activeFrequencyData[i];
      }
      for (let i = 1; i < bassBandEnd; i++) {
        bassEnergy += activeFrequencyData[i];
      }
      for (let i = lowBandEnd; i < midBandEnd; i++) {
        midEnergy += activeFrequencyData[i];
      }
      volume = totalEnergy / (activeFrequencyData.length * 255);
      bassEnergy /= Math.max(1, bassBandEnd - 1) * 255;
      midEnergy /= Math.max(1, midBandEnd - lowBandEnd) * 255;
    }
    const smoothing = 1 - (1 - 0.18) ** (deltaTime * 60);
    const bassSmoothing = 1 - (1 - 0.22) ** (deltaTime * 60);
    currentVolume = THREE.MathUtils.lerp(currentVolume, volume, smoothing);
    currentBassEnergy = THREE.MathUtils.lerp(currentBassEnergy, bassEnergy, bassSmoothing);
    currentMidEnergy = THREE.MathUtils.lerp(currentMidEnergy, midEnergy, smoothing);

    const canEmit = Boolean(markerVertices) && (playing || emissionEnabled);
    const energy = Math.max(currentVolume, currentMidEnergy * 0.8, currentBassEnergy * 0.55);
    crowd?.update(timeSeconds, (playing || emissionEnabled) ? energy : 0);
    const inputEnergy = Math.max(volume, midEnergy * 0.8, bassEnergy * 0.55);
    timeSinceWave += deltaTime;
    const interval = THREE.MathUtils.lerp(1.05, 0.55, Math.min(energy * 2, 1));
    const positions = geometry.attributes.position.array;
    const colors = geometry.attributes.color.array;
    const opacities = flow.opacities;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const index = i * 3;
      if (flow.ages[i] < 0) continue;

      flow.ages[i] += deltaTime;
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

      const distance = SOUND_SPEED * flow.ages[i] + flow.forwardOffsets[i];
      const width = flow.lateralOffsets[i] * (1 + progress * 0.7);
      const archHeight = (2 + flow.birthEnergy[i] * 4) * Math.sin(progress * Math.PI);
      const fadeIn = Math.min(progress * 10, 1);
      const fadeOut = (1 - progress) ** 1.3;
      const intensity =
        flow.intensityOffsets[i] *
        (0.22 + Math.min(flow.birthEnergy[i] * 0.65, 0.3)) *
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
      colors[index] = particleColor.r;
      colors[index + 1] = particleColor.g;
      colors[index + 2] = particleColor.b;
      opacities[i] = intensity;
      flow.sizes[i] = flow.baseSizes[i];
    }
    if (canEmit && inputEnergy > 0.025 && energy > 0.025 && timeSinceWave >= interval) {
      emitWave(energy);
      timeSinceWave = 0;
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
