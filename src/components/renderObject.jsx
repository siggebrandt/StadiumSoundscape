import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { useEffect, useId } from "react";
import { useMap } from "react-map-gl/mapbox";
import createSoundSphere from "./createSoundSphere";

function getRingBounds(ring) {
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };
  ring.forEach(({ x, y }) => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  });
  return bounds;
}

function cross(origin, a, b) {
  return (
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
  );
}

function createFieldBoundary(spots, origin, meterScale, marginMeters) {
  const points = Object.values(spots)
    .map((spot) => {
      const point = mapboxgl.MercatorCoordinate.fromLngLat(
        [spot.longitude, spot.latitude],
        0,
      );
      return {
        x: (point.x - origin.x) / meterScale,
        y: -(point.y - origin.y) / meterScale,
      };
    })
    .sort((a, b) => a.x - b.x || a.y - b.y);

  const lower = [];
  points.forEach((point) => {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  });

  const upper = [];
  [...points].reverse().forEach((point) => {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  });

  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  const center = hull.reduce(
    (sum, point) => ({
      x: sum.x + point.x / hull.length,
      y: sum.y + point.y / hull.length,
    }),
    { x: 0, y: 0 },
  );
  const expandedHull = hull.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const scale = (distance + marginMeters) / distance;
    return { x: center.x + dx * scale, y: center.y + dy * scale };
  });

  return {
    rings: [expandedHull],
    ...getRingBounds(expandedHull),
  };
}

function createLayer({
  id,
  spots,
  color,
  altitude,
  radius,
  boundaryMarginMeters,
  soundDirectory,
  onAudioStateChange,
  onPlaybackModeChange,
  onPlaybackEnded,
  map,
}) {
  const list = Object.values(spots);

  // Första spoten är lagrets origin, övriga räknas i meter relativt den
  const origin = mapboxgl.MercatorCoordinate.fromLngLat(
    [list[0].longitude, list[0].latitude],
    0,
  );
  const meterScale = origin.meterInMercatorCoordinateUnits();

  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  const raycaster = new THREE.Raycaster();
  const spheres = [];
  let renderer;
  let playbackSequence = 0;
  let playbackMode = "paused";
  let activeSphere = null;
  let timelinePosition = 0;
  const fieldBoundary = createFieldBoundary(
    spots,
    origin,
    meterScale,
    boundaryMarginMeters,
  );

  function notifyAudioState() {
    onAudioStateChange(
      Math.max(...spheres.map((sphere) => sphere.getDuration()), 0),
      getCurrentTime(),
    );
  }

  function getCurrentTime() {
    const playingSpheres = spheres.filter((sphere) => sphere.isPlaying());
    if (playingSpheres.length) {
      timelinePosition = Math.max(
        ...playingSpheres.map((sphere) => sphere.getCurrentTime()),
      );
    }
    return timelinePosition;
  }

  return {
    id,
    type: "custom",
    renderingMode: "3d",
    slot: "middle",

    onAdd(m, gl) {
      renderer = new THREE.WebGLRenderer({
        canvas: m.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;

      list.forEach((spot) => {
        const sphere = createSoundSphere({
          color: spot.color ?? color,
          radius: spot.radius ?? radius,
          soundName: soundDirectory
            ? `${soundDirectory}/${spot.id}.mp3`
            : spot.soundName,
          onAudioStateChange: notifyAudioState,
          onEnded: () => {
            if (spheres.every((item) => !item.isPlaying())) {
              timelinePosition = Math.max(
                ...spheres.map((item) => item.getDuration()),
                0,
              );
              playbackMode = "paused";
              activeSphere = null;
              onPlaybackEnded();
            }
          },
        });
        sphere.prepareAudio();

        const p = mapboxgl.MercatorCoordinate.fromLngLat(
          [spot.longitude, spot.latitude],
          0,
        );
        sphere.group.position.set(
          (p.x - origin.x) / meterScale,
          -(p.y - origin.y) / meterScale,
          0,
        );
        sphere.anchor = {
          longitude: spot.longitude,
          latitude: spot.latitude,
          altitude: spot.altitude ?? altitude,
          ground: 0,
        };

        scene.add(sphere.group);
        spheres.push(sphere);
      });
      notifyAudioState();
    },

    render(gl, matrix) {
      const m = new THREE.Matrix4().fromArray(matrix);
      const l = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale));
      camera.projectionMatrix = m.multiply(l);

      const t = performance.now() / 1000;
      spheres.forEach((s) => {
        const a = s.anchor;
        const g = map.queryTerrainElevation([a.longitude, a.latitude]);
        if (g != null) a.ground = g; // behåll senaste värdet om terrängen inte är laddad
        s.group.position.z = a.ground + a.altitude;
        s.update(t, {
          boundaries: [fieldBoundary],
          centerX: s.group.position.x,
          centerY: s.group.position.y,
          rotation: s.group.children[0].rotation.z,
        });
      });

      renderer.resetState();
      renderer.render(scene, camera);

      map.triggerRepaint();
    },

    onRemove() {
      spheres.forEach((s) => s.dispose());
    },

    playAll() {
      const request = ++playbackSequence;
      const duration = Math.max(
        ...spheres.map((sphere) => sphere.getDuration()),
        0,
      );
      const startTime =
        duration > 0 && timelinePosition >= duration ? 0 : timelinePosition;
      timelinePosition = startTime;
      spheres.forEach((sphere) => sphere.pause());
      spheres.forEach((sphere) => sphere.seek(startTime));
      return Promise.allSettled(spheres.map((sphere) => sphere.play())).then(
        (results) => {
          if (
            request === playbackSequence &&
            results.some((result) => result.status === "fulfilled")
          ) {
            playbackMode = "all";
            activeSphere = null;
            onPlaybackModeChange("all");
          }
          return results;
        },
      );
    },

    playSolo(selectedSphere) {
      if (
        playbackMode === "solo" &&
        activeSphere === selectedSphere &&
        selectedSphere.isPlaying()
      ) {
        playbackSequence++;
        timelinePosition = getCurrentTime();
        selectedSphere.pause();
        playbackMode = "paused";
        activeSphere = null;
        onPlaybackModeChange("paused");
        return;
      }

      const request = ++playbackSequence;
      const currentTime = getCurrentTime();
      playbackMode = "solo";
      activeSphere = selectedSphere;
      onPlaybackModeChange("solo");
      spheres.forEach((sphere) => {
        if (sphere !== selectedSphere) sphere.pause();
      });
      selectedSphere.seek(currentTime);
      selectedSphere.play().then(
        () => {
          if (request === playbackSequence) {
            playbackMode = "solo";
            onPlaybackModeChange("solo");
          }
        },
        (error) => {
          if (request === playbackSequence) {
            playbackMode = "paused";
            activeSphere = null;
            onPlaybackModeChange("paused");
          }
          console.error(error);
        },
      );
    },

    pauseAll() {
      playbackSequence++;
      timelinePosition = getCurrentTime();
      spheres.forEach((sphere) => sphere.pause());
      playbackMode = "paused";
      activeSphere = null;
    },

    seekAll(timeSeconds) {
      timelinePosition = timeSeconds;
      spheres.forEach((sphere) => sphere.seek(timeSeconds));
    },

    getCurrentTime,

    // Vilket klot ligger under skärmpunkten? (point i CSS-pixlar)
    pick(point) {
      const { width, height } = map.getCanvas().getBoundingClientRect();
      const x = (point.x / width) * 2 - 1;
      const y = 1 - (point.y / height) * 2;

      const inv = camera.projectionMatrix.clone().invert();
      const near = new THREE.Vector3(x, y, -1).applyMatrix4(inv);
      const far = new THREE.Vector3(x, y, 1).applyMatrix4(inv);
      raycaster.set(near, far.sub(near).normalize());

      const hits = raycaster.intersectObjects(
        spheres.map((s) => s.hit),
        false,
      );
      return hits.length ? spheres.find((s) => s.hit === hits[0].object) : null;
    },
  };
}

export default function RenderObject({
  spots,
  color = "#38bdf8",
  altitude = 5,
  radius = 6,
  boundaryMarginMeters = 8,
  soundDirectory,
  onAudioStateChange,
  onPlaybackModeChange,
  onPlaybackEnded,
  controlsRef,
}) {
  const { current: mapRef } = useMap();
  const layerId = useId();

  useEffect(() => {
    if (!mapRef || !Object.keys(spots).length) return;
    const map = mapRef.getMap();
    let layer = null;
    let down = null;

    const add = () => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      layer = createLayer({
        id: layerId,
        spots,
        color,
        altitude,
        radius,
        boundaryMarginMeters,
        soundDirectory,
        onAudioStateChange,
        onPlaybackModeChange,
        onPlaybackEnded,
        map,
      });
      controlsRef.current = layer;
      map.addLayer(layer);
    };

    // Ignorera klick som egentligen var en drag (rotation)
    const onDown = (e) => (down = e.point);
    const onClick = (e) => {
      if (!layer) return;
      if (down && Math.hypot(e.point.x - down.x, e.point.y - down.y) > 5)
        return;
      const hit = layer.pick(e.point);
      if (hit) {
        layer.playSolo(hit);
        map.triggerRepaint();
      }
    };
    const onMove = (e) => {
      if (!layer) return;
      map.getCanvas().style.cursor = layer.pick(e.point) ? "pointer" : "";
    };

    if (map.loaded()) add();
    else map.once("idle", add);

    map.on("mousedown", onDown);
    map.on("click", onClick);
    map.on("mousemove", onMove);

    return () => {
      map.off("idle", add);
      map.off("mousedown", onDown);
      map.off("click", onClick);
      map.off("mousemove", onMove);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (controlsRef.current === layer) controlsRef.current = null;
    };
  }, [
    mapRef,
    layerId,
    spots,
    color,
    altitude,
    radius,
    boundaryMarginMeters,
    soundDirectory,
    onAudioStateChange,
    onPlaybackModeChange,
    onPlaybackEnded,
    controlsRef,
  ]);

  return null;
}
