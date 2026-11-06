import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { useEffect, useId, useRef } from "react";
import { useMap } from "react-map-gl/mapbox";
import createSoundFlow from "./createSoundFlow";

// Standardantal ränder; stands med stripeWidthMeters får antal utifrån längd.
const STRIPE_COUNT = 10;

function createMarkerData(stand, corners, center, standPosition) {
  let innerEdge = 0;
  let closestEdgeDistance = Infinity;
  corners.forEach((corner, edgeIndex) => {
    const next = corners[(edgeIndex + 1) % corners.length];
    const midpointX = (corner.x + next.x) / 2;
    const midpointY = (corner.y + next.y) / 2;
    const distance =
      (center.x - midpointX) ** 2 + (center.y - midpointY) ** 2;
    if (distance < closestEdgeDistance) {
      innerEdge = edgeIndex;
      closestEdgeDistance = distance;
    }
  });
  const start = corners[innerEdge];
  const end = corners[(innerEdge + 1) % corners.length];
  const sideCenter = corners.reduce(
    (sum, point) => ({
      x: sum.x + point.x / corners.length,
      y: sum.y + point.y / corners.length,
    }),
    { x: 0, y: 0 },
  );
  const inward = new THREE.Vector2(
    sideCenter.x - (start.x + end.x) / 2,
    sideCenter.y - (start.y + end.y) / 2,
  ).normalize();
  const inset = stand.markerInsetMeters ?? 8;
  const width = stand.markerWidthMeters ?? 4;
  const [minHeight, maxHeight] =
    stand.markerHeightRangeMeters ??
    [4, 12];
  const standDepth = Math.max(
    2 *
      Math.hypot(
        sideCenter.x - (start.x + end.x) / 2,
        sideCenter.y - (start.y + end.y) / 2,
      ),
    1,
  );
  const heightPerMeter = (maxHeight - minHeight) / standDepth;
  const innerZ = minHeight + heightPerMeter * inset - standPosition.height + 0.5;
  const outerZ = innerZ + heightPerMeter * width;
  const markerVertices = [
    [start.x + inward.x * inset, start.y + inward.y * inset, innerZ],
    [end.x + inward.x * inset, end.y + inward.y * inset, innerZ],
    [
      end.x + inward.x * (inset + width),
      end.y + inward.y * (inset + width),
      outerZ,
    ],
    [
      start.x + inward.x * (inset + width),
      start.y + inward.y * (inset + width),
      outerZ,
    ],
  ].flatMap(([x, y, z]) => [x, y, z]);

  const emitterSpacing = stand.emitterSpacingMeters ?? 4;
  const alongLength = Math.hypot(end.x - start.x, end.y - start.y);
  const alongDivisions = Math.max(1, Math.ceil(alongLength / emitterSpacing));
  const widthDivisions = Math.max(1, Math.ceil(width / emitterSpacing));
  const stripeCount = stand.stripeWidthMeters
    ? Math.max(1, Math.round(alongLength / stand.stripeWidthMeters))
    : STRIPE_COUNT;
  const emitters = [];
  for (let column = 0; column < alongDivisions; column++) {
    const along = (column + 0.5) / alongDivisions;
    for (let row = 0; row < widthDivisions; row++) {
      const across = (row + 0.5) / widthDivisions;
      const distanceFromInnerEdge = inset + width * across;
      const height =
        minHeight + heightPerMeter * distanceFromInnerEdge;
      emitters.push({
        colorIndex: Math.floor(along * stripeCount) % 2,
        x:
          start.x * (1 - along) +
          end.x * along +
          inward.x * distanceFromInnerEdge,
        y:
          start.y * (1 - along) +
          end.y * along +
          inward.y * distanceFromInnerEdge,
        // Emit away from the stand footprint and onto the pitch.
        directionX: -inward.x,
        directionY: -inward.y,
        heightOffset: height - standPosition.height,
      });
    }
  }

  return { markerVertices, emitters, stripeCount };
}

function createStandEmitters(
  stands,
  origin,
  meterScale,
  standPositions,
) {
  const center = standPositions.reduce(
    (sum, point) => ({
      x: sum.x + point.x / standPositions.length,
      y: sum.y + point.y / standPositions.length,
    }),
    { x: 0, y: 0 },
  );

  return stands.map((stand, index) => {
    const corners = stand.footprint.map(([longitude, latitude]) => {
      const point = mapboxgl.MercatorCoordinate.fromLngLat(
        [longitude, latitude],
        0,
      );
      return {
        x: (point.x - origin.x) / meterScale,
        y: -(point.y - origin.y) / meterScale,
      };
    });
    const sideCenter = corners.reduce(
      (sum, point) => ({
        x: sum.x + point.x / corners.length,
        y: sum.y + point.y / corners.length,
      }),
      { x: 0, y: 0 },
    );
    const inward = new THREE.Vector2(center.x - sideCenter.x, center.y - sideCenter.y).normalize();
    const alongLength = Math.hypot(
      corners[1].x - corners[0].x,
      corners[1].y - corners[0].y,
    );
    const depth = Math.hypot(
      corners[2].x - corners[1].x,
      corners[2].y - corners[1].y,
    );
    const spacing = stand.emitterSpacingMeters ?? 4;
    const alongDivisions = Math.max(
      1,
      Math.ceil(alongLength / spacing),
    );
    const depthDivisions = Math.max(1, Math.ceil(depth / spacing));
    const heightRange = stand.heightRangeMeters ?? [2, 10];
    const emitters = [];

    for (let row = 0; row < depthDivisions; row++) {
      const v = (row + 0.5) / depthDivisions;
      for (let column = 0; column < alongDivisions; column++) {
        const u = (column + 0.5) / alongDivisions;
        const emitter = {
          x:
            corners[0].x * (1 - u) * (1 - v) +
            corners[1].x * u * (1 - v) +
            corners[2].x * u * v +
            corners[3].x * (1 - u) * v,
          y:
            corners[0].y * (1 - u) * (1 - v) +
            corners[1].y * u * (1 - v) +
            corners[2].y * u * v +
            corners[3].y * (1 - u) * v,
        };
        const height =
          heightRange[0] + Math.random() * (heightRange[1] - heightRange[0]);
        emitters.push({
          ...emitter,
          directionX: inward.x,
          directionY: inward.y,
          heightOffset: height - standPositions[index].height,
        });
      }
    }
    const markerData = stand.marker
      ? createMarkerData(
          stand,
          corners,
          center,
          standPositions[index],
        )
      : null;
    return {
      emitters: markerData?.emitters ?? emitters,
      markerVertices: markerData?.markerVertices ?? null,
      stripeCount: markerData?.stripeCount ?? STRIPE_COUNT,
    };
  });
}

function createLayer({
  id,
  stands,
  playbackAudioUrl,
  color,
  altitude,
  onAudioStateChange,
  onPlaybackModeChange,
  onPlaybackEnded,
  map,
}) {
  const list = Object.entries(stands ?? {})
    .map(([id, stand]) => ({ ...stand, id }))
    .filter((stand) => Array.isArray(stand.footprint) && stand.footprint.length === 4)
    .map((stand) => {
      const [longitude, latitude] = stand.footprint
        .reduce(
          (sum, point) => [sum[0] + point[0] / 4, sum[1] + point[1] / 4],
          [0, 0],
        );
      return { ...stand, longitude, latitude };
    });
  if (!list.length) throw new Error("No valid stand areas are configured.");

  const modelCenter = list.reduce(
    (center, stand) => ({
      longitude: center.longitude + stand.longitude / list.length,
      latitude: center.latitude + stand.latitude / list.length,
    }),
    { longitude: 0, latitude: 0 },
  );
  const modelOrigin = mapboxgl.MercatorCoordinate.fromLngLat(
    [modelCenter.longitude, modelCenter.latitude],
    0,
  );
  const modelScale = modelOrigin.meterInMercatorCoordinateUnits();
  const modelTransform = new THREE.Matrix4()
    .makeTranslation(modelOrigin.x, modelOrigin.y, modelOrigin.z)
    .scale(new THREE.Vector3(modelScale, -modelScale, modelScale));

  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  const soundFlows = [];
  let playbackFlow = null;
  let renderer;
  let playbackSequence = 0;
  let playbackMode = "paused";
  let activeFlow = null;
  let timelinePosition = 0;
  const localPositions = list.map((stand) => {
    const point = mapboxgl.MercatorCoordinate.fromLngLat(
      [stand.longitude, stand.latitude],
      0,
    );
    return {
      x: (point.x - modelOrigin.x) / modelScale,
      y: -(point.y - modelOrigin.y) / modelScale,
      height: stand.altitude ?? altitude,
    };
  });
  const standData = createStandEmitters(
    list,
    modelOrigin,
    modelScale,
    localPositions,
  );

  function notifyAudioState() {
    onAudioStateChange(
      Math.max(...soundFlows.map((flow) => flow.getDuration()), playbackFlow?.getDuration() ?? 0),
      getCurrentTime(),
    );
  }

  function getCurrentTime() {
    const playingFlows = [...soundFlows, ...(playbackFlow ? [playbackFlow] : [])]
      .filter((flow) => flow.isPlaying());
    if (playingFlows.length) {
      timelinePosition = Math.max(
        ...playingFlows.map((flow) => flow.getCurrentTime()),
      );
    }
    return timelinePosition;
  }

  return {
    id,
    type: "custom",
    renderingMode: "3d",
    slot: "top",

    onAdd(m, gl) {
      renderer = new THREE.WebGLRenderer({
        canvas: m.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;

      if (playbackAudioUrl) {
        playbackFlow = createSoundFlow({
          audioUrl: playbackAudioUrl,
          makeupGain: 4,
          onAudioStateChange: notifyAudioState,
          onEnded: () => {
            timelinePosition = playbackFlow.getCurrentTime();
            soundFlows.forEach((flow) => flow.setEmissionEnabled(false));
            playbackMode = "paused";
            activeFlow = null;
            onPlaybackEnded();
          },
        });
        playbackFlow.prepareAudio();
      }

      list.forEach((stand, index) => {
        const soundFlow = createSoundFlow({
          color: stand.color ?? color,
          colors: stand.colors,
          crowdColors: stand.crowdColors,
          markerOpacity: stand.markerOpacity,
          stripeCount: standData[index].stripeCount,
          emitters: standData[index].emitters,
          markerVertices: standData[index].markerVertices,
          audioUrl: stand.audioUrl,
          onAudioStateChange: notifyAudioState,
          onEnded: () => {
            if (soundFlows.every((item) => !item.isPlaying())) {
              timelinePosition = Math.max(
                ...soundFlows.map((item) => item.getDuration()),
                0,
              );
              soundFlows.forEach((item) => item.setEmissionEnabled(false));
              playbackMode = "paused";
              activeFlow = null;
              onPlaybackEnded();
            }
          },
        });
        soundFlow.prepareAudio();
        soundFlow.group.position.set(0, 0, 0);
        soundFlow.anchor = {
          longitude: stand.longitude,
          latitude: stand.latitude,
          altitude: stand.altitude ?? altitude,
          ground: 0,
        };

        scene.add(soundFlow.group);
        soundFlows.push(soundFlow);
      });
      notifyAudioState();
    },

    render(gl, matrix) {
      camera.projectionMatrix
        .copy(new THREE.Matrix4().fromArray(matrix))
        .multiply(modelTransform);

      const t = performance.now() / 1000;
      soundFlows.forEach((flow) => {
        const a = flow.anchor;
        const g = map.queryTerrainElevation([a.longitude, a.latitude]);
        if (g != null) a.ground = g; // behåll senaste värdet om terrängen inte är laddad
        flow.group.position.z = a.ground + a.altitude;
        flow.update(t);
      });

      renderer.resetState();
      renderer.render(scene, camera);

      map.triggerRepaint();
    },

    onRemove() {
      soundFlows.forEach((flow) => flow.dispose());
      playbackFlow?.dispose();
    },

    playAll() {
      const request = ++playbackSequence;
      if (!playbackFlow) {
        return Promise.resolve([{ status: "rejected", reason: new Error("No playback audio URL configured.") }]);
      }
      const duration = playbackFlow.getDuration();
      const startTime =
        duration > 0 && timelinePosition >= duration ? 0 : timelinePosition;
      timelinePosition = startTime;
      soundFlows.forEach((flow) => {
        flow.pause();
        flow.setEmissionEnabled(false);
        flow.seek(startTime);
      });
      playbackFlow.seek(startTime);
      return Promise.allSettled([playbackFlow.play()]).then((results) => {
        if (request === playbackSequence && results[0].status === "fulfilled") {
          soundFlows.forEach((flow) => {
            flow.shareAudioAnalysis(playbackFlow);
            flow.setEmissionEnabled(true);
          });
          playbackMode = "all";
          activeFlow = null;
          onPlaybackModeChange("all");
        }
        return results;
      });
    },

    playSolo(clickedFlow) {
      // Stands med samma `group` fungerar som ett enda stand.
      const groupKey = (flow) => {
        const stand = list[soundFlows.indexOf(flow)];
        return stand?.group ?? stand?.id;
      };
      const key = groupKey(clickedFlow);
      const members = soundFlows.filter((flow) => groupKey(flow) === key);
      const selectedFlow = members[0];

      if (
        playbackMode === "solo" &&
        activeFlow === selectedFlow &&
        selectedFlow.isPlaying()
      ) {
        playbackSequence++;
        timelinePosition = getCurrentTime();
        soundFlows.forEach((flow) => {
          flow.pause();
          flow.setEmissionEnabled(false);
        });
        playbackMode = "paused";
        activeFlow = null;
        onPlaybackModeChange("paused");
        return;
      }

      const request = ++playbackSequence;
      const currentTime = getCurrentTime();
      playbackFlow?.pause();
      soundFlows.forEach((flow) => {
        flow.pause();
        flow.setEmissionEnabled(false);
      });
      members.forEach((flow) => {
        flow.setVolume(0.35 / members.length);
        flow.setEmissionEnabled(true);
        flow.seek(currentTime);
      });
      playbackMode = "solo";
      activeFlow = selectedFlow;
      onPlaybackModeChange("solo");
      Promise.all(members.map((flow) => flow.play())).then(
        () => {
          if (request === playbackSequence) {
            playbackMode = "solo";
            onPlaybackModeChange("solo");
          }
        },
        (error) => {
          if (request === playbackSequence) {
            playbackMode = "paused";
            activeFlow = null;
            onPlaybackModeChange("paused");
          }
          console.error(error);
        },
      );
    },

    pauseAll() {
      playbackSequence++;
      timelinePosition = getCurrentTime();
      playbackFlow?.pause();
      soundFlows.forEach((flow) => {
        flow.pause();
        flow.setEmissionEnabled(false);
      });
      playbackMode = "paused";
      activeFlow = null;
    },

    seekAll(timeSeconds) {
      timelinePosition = timeSeconds;
      soundFlows.forEach((flow) => flow.seek(timeSeconds));
      playbackFlow?.seek(timeSeconds);
    },

    getCurrentTime,

    // Skärmposition (CSS-pixlar) för mitten av en markering, eller null om den inte syns.
    getStandScreenPoint(standId) {
      const index = list.findIndex((stand) => stand.id === standId);
      const flow = soundFlows[index];
      if (!flow?.hasMarker) return null;
      const { width, height } = map.getCanvas().getBoundingClientRect();
      const positions = flow.hit.geometry.getAttribute("position");
      let x = 0;
      let y = 0;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const clip = new THREE.Vector4(
          positions.getX(vertex),
          positions.getY(vertex),
          positions.getZ(vertex) + flow.group.position.z,
          1,
        ).applyMatrix4(camera.projectionMatrix);
        if (clip.w <= 0) return null;
        x += ((clip.x / clip.w + 1) * width) / 2;
        y += ((1 - clip.y / clip.w) * height) / 2;
      }
      return { x: x / positions.count, y: y / positions.count };
    },

    // Vilket ljudflöde ligger under skärmpunkten? (point i CSS-pixlar)
    pick(point) {
      const { width, height } = map.getCanvas().getBoundingClientRect();
      const screenPoint = { x: point.x, y: point.y };
      const containsPoint = (polygon) => {
        let inside = false;
        for (
          let current = 0, previous = polygon.length - 1;
          current < polygon.length;
          previous = current++
        ) {
          const a = polygon[current];
          const b = polygon[previous];
          const intersects =
            a.y > screenPoint.y !== b.y > screenPoint.y &&
            screenPoint.x <
              ((b.x - a.x) * (screenPoint.y - a.y)) / (b.y - a.y) + a.x;
          if (intersects) inside = !inside;
        }
        return inside;
      };

      for (let index = soundFlows.length - 1; index >= 0; index--) {
        const flow = soundFlows[index];
        if (!flow.hasMarker) continue;
        const positions = flow.hit.geometry.getAttribute("position");
        const polygon = [];
        for (let vertex = 0; vertex < positions.count; vertex++) {
          const clip = new THREE.Vector4(
            positions.getX(vertex),
            positions.getY(vertex),
            positions.getZ(vertex) + flow.group.position.z,
            1,
          ).applyMatrix4(camera.projectionMatrix);
          if (clip.w <= 0) {
            polygon.length = 0;
            break;
          }
          polygon.push({
            x: ((clip.x / clip.w + 1) * width) / 2,
            y: ((1 - clip.y / clip.w) * height) / 2,
          });
        }
        if (polygon.length === positions.count && containsPoint(polygon)) {
          return flow;
        }
      }
      return null;
    },
  };
}

export default function RenderObject({
  stands,
  playbackAudioUrl,
  color = "#38bdf8",
  altitude = 5,
  onAudioStateChange,
  onPlaybackModeChange,
  onPlaybackEnded,
  controlsRef,
  canPlayStand = true,
  onBeforeStandPlayback,
}) {
  const { current: mapRef } = useMap();
  const layerId = useId();
  const standPlaybackRef = useRef({ canPlayStand, onBeforeStandPlayback });

  useEffect(() => {
    standPlaybackRef.current = { canPlayStand, onBeforeStandPlayback };
  }, [canPlayStand, onBeforeStandPlayback]);

  useEffect(() => {
    if (!mapRef || !Object.keys(stands ?? {}).length) return;
    const map = mapRef.getMap();
    let layer = null;
    let down = null;

    let disposed = false;
    const add = () => {
      if (disposed) return;
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      layer = createLayer({
        id: layerId,
        stands,
        playbackAudioUrl,
        color,
        altitude,
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
      if (!layer || !standPlaybackRef.current.canPlayStand) return;
      if (down && Math.hypot(e.point.x - down.x, e.point.y - down.y) > 5)
        return;
      const hit = layer.pick(e.point);
      if (hit) {
        standPlaybackRef.current.onBeforeStandPlayback?.();
        layer.playSolo(hit);
        map.triggerRepaint();
      }
    };
    const onMove = (e) => {
      if (!layer) return;
      map.getCanvas().style.cursor =
        standPlaybackRef.current.canPlayStand && layer.pick(e.point) ? "pointer" : "";
    };

    // isStyleLoaded() är false medan plattor laddas, så vänta inte bara på style.load.
    const tryAdd = () => {
      if (disposed || layer) return;
      try {
        add();
      } catch {
        layer = null;
        return;
      }
      map.off("style.load", tryAdd);
      map.off("idle", tryAdd);
    };
    tryAdd();
    if (!layer) {
      map.on("style.load", tryAdd);
      map.on("idle", tryAdd);
    }

    map.on("mousedown", onDown);
    map.on("click", onClick);
    map.on("mousemove", onMove);

    return () => {
      disposed = true;
      map.off("style.load", tryAdd);
      map.off("idle", tryAdd);
      map.off("mousedown", onDown);
      map.off("click", onClick);
      map.off("mousemove", onMove);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (controlsRef.current === layer) controlsRef.current = null;
    };
  }, [
    mapRef,
    layerId,
    stands,
    playbackAudioUrl,
    color,
    altitude,
    onAudioStateChange,
    onPlaybackModeChange,
    onPlaybackEnded,
    controlsRef,
  ]);

  return null;
}
