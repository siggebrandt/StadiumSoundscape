import * as THREE from "three";

const PARTICLE_COUNT = 1200;
const DEFAULT_AUDIO_VOLUME = 0.35;
const FLOW_WIDTH = 3.5;
const SOUND_SPEED = 22;
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
  const birthRadius = new Float32Array(PARTICLE_COUNT);
  const vortexAngles = new Float32Array(PARTICLE_COUNT);
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
    birthRadius,
    vortexAngles,
    intensityOffsets,
    sourcePositions,
    baseColor,
  };
}

export default function createSoundFlow({
  color = "#38bdf8",
  colors,
  emitters = [DEFAULT_EMITTER],
  markerVertices,
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
  function setMarkerUv() {
    hitGeometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
    );
  }
  if (markerVertices) setMarkerUv();
  function setMarkerVertices(vertices) {
    const position = hitGeometry.getAttribute("position");
    if (!position || position.array.length !== vertices.length) {
      hitGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      hitGeometry.setIndex([0, 1, 2, 0, 2, 3]);
      setMarkerUv();
    } else {
      position.array.set(vertices);
      position.needsUpdate = true;
    }
    hitGeometry.computeVertexNormals();
    hitGeometry.computeBoundingSphere();
  }
  function setEmitters(emitters) {
    flow.sourcePositions = emitters.length ? emitters : [DEFAULT_EMITTER];
  }
  const hit = new THREE.Mesh(
    hitGeometry,
    markerVertices
      ? new THREE.ShaderMaterial({
          uniforms: {
            colorA: { value: teamColors[0] },
            colorB: { value: teamColors[1] ?? teamColors[0] },
            stripes: { value: STRIPE_COUNT },
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
            varying vec2 vUv;
            void main() {
              float stripe = mod(floor(vUv.x * stripes), 2.0);
              gl_FragColor = vec4(mix(colorA, colorB, stripe), 0.95);
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

  let audio;
  let audioContext;
  let analyser;
  let sharedAnalysis;
  let frequencyData;
  let audioVolume = DEFAULT_AUDIO_VOLUME;
  let disposed = false;
  let playing = false;
  let emissionEnabled = false;
  let currentVolume = 0;
  let currentMidEnergy = 0;
  let currentHighFrequency = 0;
  let currentBassEnergy = 0;
  let currentTransient = 0;
  let previousFrequencyData;
  let lastUpdateTime = null;
  let emissionRemainder = 0;
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
    previousFrequencyData = new Uint8Array(analyser.frequencyBinCount);
    const source = audioContext.createMediaElementSource(sound);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
  }

  async function play() {
    sharedAnalysis = null;
    const sound = initializeAudio();
    initializeAnalyser(sound);
    await audioContext.resume();
    await sound.play();
    playing = true;
    onAudioStateChange();
  }

  function pause() {
    if (!audio) return;
    audio.pause();
    playing = false;
    onAudioStateChange();
  }

  function seek(timeSeconds) {
    const sound = initializeAudio();
    const seekToAvailablePosition = () => {
      const duration = sound.duration;
      sound.currentTime = Number.isFinite(duration)
        ? THREE.MathUtils.clamp(timeSeconds, 0, duration)
        : Math.max(0, timeSeconds);
    };

    if (sound.readyState >= HTMLMediaElement.HAVE_METADATA) {
      seekToAvailablePosition();
    } else {
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

  function emitParticle(index) {
    const source =
      flow.sourcePositions[
        Math.floor(Math.random() * flow.sourcePositions.length)
      ];
    flow.emitterX[index] = source.x;
    flow.emitterY[index] = source.y;
    flow.emitterZ[index] = source.heightOffset;
    flow.directionX[index] = source.directionX;
    flow.directionY[index] = source.directionY;
    flow.normalX[index] = -source.directionY;
    flow.normalY[index] = source.directionX;
    flow.ages[index] = 0;
    flow.colorIndex[index] = source.colorIndex ?? 0;
    flow.lifetimes[index] = 1.6 + currentBassEnergy * 2.4;
    flow.birthEnergy[index] = currentVolume;
    flow.birthRadius[index] = FLOW_WIDTH * (0.45 + currentBassEnergy * 1.8);
    flow.vortexAngles[index] = Math.random() * Math.PI * 2;
    flow.intensityOffsets[index] = 0.6 + Math.random() * 0.4;
    flow.baseSizes[index] = 7 + currentTransient * 7;
  }

  function update(timeSeconds) {
    const deltaTime =
      lastUpdateTime === null
        ? 0
        : THREE.MathUtils.clamp(timeSeconds - lastUpdateTime, 0, 0.1);
    lastUpdateTime = timeSeconds;

    let midEnergy = 0;
    let bassEnergy = 0;
    let highFrequency = 0;
    let transient = 0;
    const activeAnalyser = sharedAnalysis?.analyser ?? analyser;
    const activeFrequencyData = sharedAnalysis?.frequencyData ?? frequencyData;
    if (activeAnalyser && activeFrequencyData) {
      activeAnalyser.getByteFrequencyData(activeFrequencyData);
      const bassBandEnd = Math.min(4, activeFrequencyData.length);
      const lowBandEnd = Math.min(12, activeFrequencyData.length);
      const midBandEnd = Math.min(36, activeFrequencyData.length);
      const highBandStart = Math.max(0, activeFrequencyData.length - 10);
      let totalEnergy = 0;
      for (let i = 0; i < activeFrequencyData.length; i++) {
        totalEnergy += activeFrequencyData[i];
        transient += Math.max(
          0,
          activeFrequencyData[i] - previousFrequencyData[i],
        );
      }
      for (let i = 1; i < bassBandEnd; i++) {
        bassEnergy += activeFrequencyData[i];
      }
      for (let i = lowBandEnd; i < midBandEnd; i++) {
        midEnergy += activeFrequencyData[i];
      }
      for (let i = highBandStart; i < activeFrequencyData.length; i++) {
        highFrequency += activeFrequencyData[i];
      }
      currentVolume = THREE.MathUtils.lerp(
        currentVolume,
        totalEnergy / (activeFrequencyData.length * 255),
        0.18,
      );
      bassEnergy /= Math.max(1, bassBandEnd - 1) * 255;
      midEnergy /= Math.max(1, midBandEnd - lowBandEnd) * 255;
      highFrequency /=
        Math.max(1, activeFrequencyData.length - highBandStart) * 255;
      transient /= activeFrequencyData.length * 255;
      for (let i = 0; i < activeFrequencyData.length; i++) {
        previousFrequencyData[i] = activeFrequencyData[i];
      }
    }
    currentTransient = THREE.MathUtils.lerp(currentTransient, transient, 0.28);
    currentBassEnergy = THREE.MathUtils.lerp(currentBassEnergy, bassEnergy, 0.22);
    currentMidEnergy = THREE.MathUtils.lerp(currentMidEnergy, midEnergy, 0.18);
    currentHighFrequency = THREE.MathUtils.lerp(
      currentHighFrequency,
      highFrequency,
      0.18,
    );

    // Tillfälligt avstängt: sidor utan 3D-markering (öst/väst) släpper inga partiklar.
    // Ta bort `Boolean(markerVertices) &&` för att slå på dem igen.
    const canEmit = Boolean(markerVertices) && (playing || emissionEnabled);
    const emissionRate = canEmit
      ? 58 + currentVolume * 120 + currentTransient * 100
      : 0;
    emissionRemainder += canEmit ? deltaTime * emissionRate : 0;
    const positions = geometry.attributes.position.array;
    const colors = geometry.attributes.color.array;
    const opacities = flow.opacities;

    while (emissionRemainder >= 1) {
      emitParticle(nextParticleIndex);
      nextParticleIndex = (nextParticleIndex + 1) % PARTICLE_COUNT;
      emissionRemainder -= 1;
    }

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

      const distance = SOUND_SPEED * flow.ages[i];
      const bassRadius = FLOW_WIDTH * (0.45 + currentBassEnergy * 1.8);
      const radius =
        THREE.MathUtils.lerp(
          flow.birthRadius[i],
          bassRadius,
          Math.min(progress * 2, 1),
        ) *
        (0.35 + progress * 0.65);
      const vortexAngle =
        flow.vortexAngles[i] +
        flow.ages[i] * (1.5 + currentHighFrequency * 12);
      const width = Math.cos(vortexAngle) * radius;
      const verticalVortex = Math.sin(vortexAngle) * radius * 0.35;
      const archHeight =
        (6 + currentMidEnergy * 16) * 2 * progress * (1 - progress);
      const fadeIn = Math.min(progress * 8, 1);
      const fadeOut = (1 - progress) ** 1.2;
      const intensity =
        flow.intensityOffsets[i] *
        Math.min(1, 0.92 + flow.birthEnergy[i] * 4) *
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
      positions[index + 2] =
        flow.emitterZ[i] +
        archHeight +
        verticalVortex;

      const particleColor = teamColors[flow.colorIndex[i] % teamColors.length];
      colors[index] = particleColor.r;
      colors[index + 1] = particleColor.g;
      colors[index + 2] = particleColor.b;
      opacities[i] = intensity;
      flow.sizes[i] = flow.baseSizes[i];
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.aOpacity.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
  }

  function dispose() {
    disposed = true;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    audioContext?.close();
    geometry.dispose();
    hit.geometry.dispose();
    points.material.dispose();
    hit.material.dispose();
  }

  return {
    group,
    hit,
    hasMarker: Boolean(markerVertices),
    setMarkerVertices,
    setEmitters,
    prepareAudio: initializeAudio,
    play,
    pause,
    seek,
    getCurrentTime,
    getDuration,
    getAudioUrl: () => audioUrl,
    shareAudioAnalysis(sourceFlow) {
      sharedAnalysis = sourceFlow.getAudioAnalysis();
      previousFrequencyData = new Uint8Array(
        sharedAnalysis.frequencyData.length,
      );
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
