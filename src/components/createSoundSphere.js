import * as THREE from "three";

const PARTICLE_COUNT = 4500;

function createParticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;

  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.45, "rgba(255, 255, 255, 0.9)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);

  return new THREE.CanvasTexture(canvas);
}

function createParticleGeometry(baseColor) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const originalPositions = new Float32Array(PARTICLE_COUNT * 3);
  const randomOffsets = new Float32Array(PARTICLE_COUNT);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const y = 1 - (i / (PARTICLE_COUNT - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const angle = goldenAngle * i;
    const x = Math.cos(angle) * radiusAtY;
    const z = Math.sin(angle) * radiusAtY;
    const index = i * 3;

    positions[index] = x;
    positions[index + 1] = y;
    positions[index + 2] = z;
    originalPositions[index] = x;
    originalPositions[index + 1] = y;
    originalPositions[index + 2] = z;
    colors[index] = baseColor.r;
    colors[index + 1] = baseColor.g;
    colors[index + 2] = baseColor.b;
    randomOffsets[i] = Math.random() * Math.PI * 2;
  }

  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);

  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("color", colorAttribute);

  return { geometry, originalPositions, randomOffsets };
}

function isInsideRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const crosses =
      a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function reflectIntoBoundary(x, y, boundaries) {
  for (const boundary of boundaries) {
    const ring = boundary?.rings?.[0];
    if (!ring?.length) continue;

    if (
      x >= boundary.minX &&
      x <= boundary.maxX &&
      y >= boundary.minY &&
      y <= boundary.maxY &&
      isInsideRing(x, y, ring)
    ) {
      continue;
    }

    let nearestX = 0;
    let nearestY = 0;
    let nearestDistanceSquared = Infinity;

    for (let i = 0; i < ring.length; i++) {
      const start = ring[i];
      const end = ring[(i + 1) % ring.length];
      const segmentX = end.x - start.x;
      const segmentY = end.y - start.y;
      const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
      const projection =
        segmentLengthSquared === 0
          ? 0
          : THREE.MathUtils.clamp(
              ((x - start.x) * segmentX + (y - start.y) * segmentY) /
                segmentLengthSquared,
              0,
              1,
            );
      const pointX = start.x + projection * segmentX;
      const pointY = start.y + projection * segmentY;
      const distanceSquared = (x - pointX) ** 2 + (y - pointY) ** 2;

      if (distanceSquared < nearestDistanceSquared) {
        nearestX = pointX;
        nearestY = pointY;
        nearestDistanceSquared = distanceSquared;
      }
    }

    if (nearestDistanceSquared < Infinity) {
      return { x: nearestX * 2 - x, y: nearestY * 2 - y };
    }
  }

  return null;
}

export default function createSoundSphere({
  color = "#38bdf8",
  radius = 6,
  soundName = "soundEffects.mp3",
  onAudioStateChange = () => {},
  onEnded = () => {},
}) {
  const group = new THREE.Group();
  group.scale.setScalar(radius);

  const standbyColor = new THREE.Color(color);
  const { geometry, originalPositions, randomOffsets } =
    createParticleGeometry(standbyColor);
  const particleTexture = createParticleTexture();
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xffffff,
      vertexColors: true,
      map: particleTexture,
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.95,
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );

  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 12, 12),
    new THREE.MeshBasicMaterial({ visible: false }),
  );

  group.add(points, hit);

  let audio;
  let playing = false;
  let currentVolume = 0;
  let currentState = 0;
  let rotationSpeed = 0.08;

  function initializeAudio() {
    if (!audio) {
      audio = new Audio(`${import.meta.env.BASE_URL}sound/${soundName}`);
      audio.crossOrigin = "anonymous";
      audio.preload = "metadata";
      audio.volume = 0.35;
      audio.addEventListener("loadedmetadata", onAudioStateChange);
      audio.addEventListener("durationchange", onAudioStateChange);
      audio.addEventListener("timeupdate", onAudioStateChange);
      audio.addEventListener("error", () =>
        console.error("Ljudet kunde inte laddas:", audio.src, audio.error),
      );
      audio.addEventListener("ended", () => {
        playing = false;
        onAudioStateChange();
        onEnded();
      });
    }
    return audio;
  }

  async function play() {
    const sound = initializeAudio();
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

  function toggle() {
    if (playing) pause();
    else play().catch(console.error);
  }

  function getCurrentTime() {
    return audio?.currentTime ?? 0;
  }

  function getDuration() {
    return Number.isFinite(audio?.duration) ? audio.duration : 0;
  }

  function update(timeSeconds, collision = null) {
    const volume = playing ? 0.18 : 0;

    currentVolume = THREE.MathUtils.lerp(currentVolume, volume, 0.12);
    const targetState = playing ? 1 : 0;
    currentState = THREE.MathUtils.lerp(currentState, targetState, 0.05);

    const waveSpeed = THREE.MathUtils.lerp(2, 4.5, currentState);
    const waveAmplitude = THREE.MathUtils.lerp(0.12, 0.35, currentState);
    const pulseForce = THREE.MathUtils.lerp(0.8, 2.5, currentState);
    const positions = geometry.attributes.position.array;
    const boundaries = Array.isArray(collision?.boundaries)
      ? collision.boundaries
      : [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const index = i * 3;
      const wave =
        Math.sin(timeSeconds * waveSpeed + randomOffsets[i]) * waveAmplitude;
      const factor = 1 + wave + currentVolume * pulseForce;

      positions[index] = originalPositions[index] * factor;
      positions[index + 1] = originalPositions[index + 1] * factor;
      positions[index + 2] = originalPositions[index + 2] * factor;

      if (boundaries.length > 0) {
        const rotation = collision.rotation ?? 0;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const rotatedX = positions[index] * cos - positions[index + 1] * sin;
        const rotatedY = positions[index] * sin + positions[index + 1] * cos;
        const worldX = collision.centerX + rotatedX * radius;
        const worldY = collision.centerY + rotatedY * radius;
        const reflected = reflectIntoBoundary(worldX, worldY, boundaries);

        if (reflected) {
          const reflectedX = (reflected.x - collision.centerX) / radius;
          const reflectedY = (reflected.y - collision.centerY) / radius;
          positions[index] = reflectedX * cos + reflectedY * sin;
          positions[index + 1] = -reflectedX * sin + reflectedY * cos;
        }
      }
    }
    geometry.attributes.position.needsUpdate = true;

    const targetRotationSpeed = THREE.MathUtils.lerp(0.08, 0.35, currentState);
    rotationSpeed = THREE.MathUtils.lerp(
      rotationSpeed,
      targetRotationSpeed,
      0.05,
    );
    points.rotation.z += rotationSpeed * 0.02;
  }

  function dispose() {
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    geometry.dispose();
    particleTexture.dispose();
    hit.geometry.dispose();
    points.material.dispose();
    hit.material.dispose();
  }

  return {
    group,
    hit,
    toggle,
    prepareAudio: initializeAudio,
    play,
    pause,
    seek,
    getCurrentTime,
    getDuration,
    update,
    isPlaying: () => playing,
    dispose,
  };
}
