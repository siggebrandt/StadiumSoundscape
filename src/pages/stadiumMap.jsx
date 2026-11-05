import { useCallback, useRef, useState } from "react";
import { Map, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

import ullevi from "../assets/json/ullevi.json";
import eleda from "../assets/json/eleda.json";

import mapBoxControls from "../components/mapBoxControls";
import RenderObject from "../components/renderObject";
import Navigation from "../components/navigation";
import GameStatsSlider from "../components/gameStatsSlider";
import MarkerTuner from "../components/markerTuner";

const ARENAS = {
  ullevi,
  eleda,
};

const apiKey = import.meta.env.VITE_API_KEY;
const apiUrl = import.meta.env.VITE_API_URL;
const apiUrl1 = import.meta.env.VITE_API_URL1;

export default function StadiumMap() {
  const mapRef = useRef(null);
  const activeArenaKeyRef = useRef("ullevi");
  const [activeArenaKey, setActiveArenaKey] = useState("ullevi");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitioningName, setTransitioningName] = useState("");
  const [playback, setPlayback] = useState({
    currentTime: 0,
    duration: 0,
    mode: "paused",
  });
  const audioControlsRef = useRef(null);
  const playbackActionRef = useRef(0);
  const [selectedMarkerSide, setSelectedMarkerSide] = useState("north");
  const [markerSettings, setMarkerSettings] = useState(() =>
    Object.fromEntries(
      Object.entries(ARENAS).map(([arenaKey, arena]) => [
        arenaKey,
        Object.fromEntries(
          Object.entries(arena.stands)
            .filter(([, stand]) => stand.marker)
            .map(([side, stand]) => [
              side,
              {
                insetMeters: stand.markerInsetMeters ?? 8,
                widthMeters: stand.markerWidthMeters ?? 4,
                heightRangeMeters: stand.markerHeightRangeMeters ?? [4, 12],
              },
            ]),
        ),
      ]),
    ),
  );

  const activeArena = ARENAS[activeArenaKey];
  const markerSides = Object.keys(markerSettings[activeArenaKey]);
  const activeMarkerSettings =
    markerSettings[activeArenaKey][selectedMarkerSide];
  const mapPanning = mapBoxControls(mapRef);

  const handleMarkerSettingsChange = (changes) => {
    const updatedSettings = {
      ...activeMarkerSettings,
      ...changes,
    };
    setMarkerSettings((previous) => ({
      ...previous,
      [activeArenaKey]: {
        ...previous[activeArenaKey],
        [selectedMarkerSide]: updatedSettings,
      },
    }));
    audioControlsRef.current?.updateMarkerSettings(
      selectedMarkerSide,
      updatedSettings,
    );
  };

  const handleAudioStateChange = useCallback(
    (duration, currentTime) => {
      if (activeArenaKeyRef.current !== activeArenaKey) return;
      setPlayback((previous) => ({
        ...previous,
        duration,
        currentTime,
      }));
    },
    [activeArenaKey],
  );

  const handlePlaybackEnded = useCallback(() => {
    if (activeArenaKeyRef.current !== activeArenaKey) return;
    playbackActionRef.current += 1;
    setPlayback((previous) => ({
      ...previous,
      currentTime: previous.duration,
      mode: "paused",
    }));
  }, [activeArenaKey]);

  const handlePlaybackModeChange = useCallback(
    (mode) => {
      if (activeArenaKeyRef.current !== activeArenaKey) return;
      if (mode === "solo") playbackActionRef.current += 1;
      setPlayback((previous) => ({ ...previous, mode }));
    },
    [activeArenaKey],
  );

  const handleSeek = (time) => {
    audioControlsRef.current?.seekAll(time);
    setPlayback((previous) => ({ ...previous, currentTime: time }));
  };

  const handleTogglePlayback = () => {
    const controls = audioControlsRef.current;
    if (!controls) return;

    if (playback.mode !== "paused") {
      playbackActionRef.current += 1;
      controls.pauseAll();
      setPlayback((previous) => ({
        ...previous,
        currentTime: controls.getCurrentTime(),
        mode: "paused",
      }));
      return;
    }

    const requestId = ++playbackActionRef.current;
    controls.playAll().then((results) => {
      if (requestId === playbackActionRef.current) {
        const started = results.some((result) => result.status === "fulfilled");
        if (!started) {
          setPlayback((previous) => ({ ...previous, mode: "paused" }));
        }
      }
    });
  };

  const handleSelectArena = (arenaKey) => {
    if (arenaKey === activeArenaKey || isTransitioning) return;

    activeArenaKeyRef.current = arenaKey;
    playbackActionRef.current += 1;
    audioControlsRef.current?.pauseAll();
    setPlayback({ currentTime: 0, duration: 0, mode: "paused" });
    const targetArena = ARENAS[arenaKey];
    setTransitioningName(targetArena.location.name);
    setIsTransitioning(true);

    // 1. Skärmen tonar in med mjuk oskärpa (300ms)
    setTimeout(() => {
      setActiveArenaKey(arenaKey);

      if (mapRef.current) {
        const map = mapRef.current.getMap();
        const loc = targetArena.location;

        // 2. Hoppa till den nya arenans position bakom dimman
        map.jumpTo({
          center: [loc.longitude, loc.latitude],
          zoom: loc.zoom,
          pitch: loc.pitch,
          bearing: loc.bearing,
        });

        // 3. När kartan laddats in, tona ut dimman
        const onIdle = () => {
          setIsTransitioning(false);
        };
        map.once("idle", onIdle);

        // Säkerhetstimeout så den inte fastnar om kartan redan är idle
        setTimeout(() => {
          map.off("idle", onIdle);
          setIsTransitioning(false);
        }, 400);
      } else {
        setIsTransitioning(false);
      }
    }, 350);
  };

  return (
    <>
      <GameStatsSlider
        key={activeArenaKey}
        currentTime={playback.currentTime}
        duration={playback.duration}
        playbackMode={playback.mode}
        match={activeArena.match}
        onSeek={handleSeek}
        onTogglePlayback={handleTogglePlayback}
        getStandScreenPoint={(side) =>
          audioControlsRef.current?.getStandScreenPoint(side) ?? null
        }
      />
      {/* Filmisk övergångs-overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          pointerEvents: isTransitioning ? "all" : "none",
          opacity: isTransitioning ? 1 : 0,
          transition: "opacity 0.35s ease-in-out",
          backgroundColor: "rgba(10, 15, 29, 0.75)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            transform: isTransitioning ? "scale(1)" : "scale(0.96)",
            transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "#94a3b8",
              fontWeight: "600",
            }}
          >
            loading
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: "800",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: "#ffffff",
            }}
          >
            {transitioningName}
          </div>
        </div>
      </div>

      <Navigation
        activeArena={activeArenaKey}
        onSelectArena={handleSelectArena}
      />
      {import.meta.env.DEV && (
        <MarkerTuner
          sides={markerSides}
          selectedSide={selectedMarkerSide}
          settings={activeMarkerSettings}
          onSelectSide={setSelectedMarkerSide}
          onChange={handleMarkerSettingsChange}
        />
      )}

      <div
        style={{ width: "100%", height: "100vh", touchAction: "none" }}
        {...mapPanning}
      >
        <Map
          ref={mapRef}
          dragPan={false}
          dragRotate={false}
          doubleClickZoom={false}
          scrollZoom={false}
          boxZoom={false}
          keyboard={false}
          touchZoomRotate={false}
          touchPitch={false}
          mapboxAccessToken={apiKey}
          initialViewState={{
            longitude: ullevi.location.longitude,
            latitude: ullevi.location.latitude,
            zoom: ullevi.location.zoom,
            pitch: ullevi.location.pitch,
            bearing: ullevi.location.bearing,
            dragPan: false,
            dragRotate: false,
            touchPitch: false,
            keyboard: false,
          }}
          style={{ width: "100%", height: "100vh" }}
          mapStyle={apiUrl1}
          projection={{ name: "mercator" }}
          maxPitch={85}
          terrain={{
            source: "mapbox-dem",
            exaggeration: [
              "interpolate",
              ["linear"],
              ["zoom"],
              12,
              2.8,
              14,
              1.5,
              16,
              1.2,
            ],
          }}
        >
          <Source
            id="mapbox-dem"
            type="raster-dem"
            url="mapbox://mapbox.mapbox-terrain-dem-v1"
            tileSize={512}
            maxzoom={14}
          />
          {/* Manage 3D elements */}
          <Layer
            id="all-buildings"
            source="composite"
            source-layer="building"
            type="fill-extrusion"
            paint={{
              "fill-extrusion-height": [
                "case",
                [
                  "in",
                  ["id"],
                  ["literal", [3114029, 104112635, "3114029", "104112635"]],
                ],
                22,
                0,
              ],
            }}
          />
          <RenderObject
            stands={activeArena.stands}
            markerSettings={markerSettings[activeArenaKey]}
            onAudioStateChange={handleAudioStateChange}
            onPlaybackModeChange={handlePlaybackModeChange}
            onPlaybackEnded={handlePlaybackEnded}
            controlsRef={audioControlsRef}
          />
        </Map>
      </div>
    </>
  );
}
