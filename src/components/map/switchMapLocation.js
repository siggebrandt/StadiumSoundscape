export function flyToArena(mapRef, location) {
  if (!mapRef?.current) return;
  const map = mapRef.current.getMap();

  map.flyTo({
    center: [location.longitude, location.latitude],
    zoom: location.zoom,
    pitch: location.pitch,
    bearing: location.bearing,
    duration: 3500,
    curve: 1.5,
    essential: true,
  });
}

export default flyToArena;
