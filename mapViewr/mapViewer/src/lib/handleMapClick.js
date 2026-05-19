import { SearchRoomResponse } from './searchEngine';

/**
 * Handles the map click event logic from Map.svelte.
 * @param {Object} params
 * @param {any} params.e - The click event
 * @param {import('maplibre-gl').Map} params.map - The map instance
 * @param {boolean} params.isRouteStartPointSetting
 * @param {any} params.searchOverlay
 * @param {any} params.levelSelect
 * @param {any} params.routeInformation
 * @param {any} params.roomInfoOverlay
 * @param {function} params.selectRoom
 * @param {any} params.api
 */
export function handleMapClick({
  e,
  map,
  isRouteStartPointSetting,
  searchOverlay,
  levelSelect,
  routeInformation,
  roomInfoOverlay,
  selectRoom,
  api
}) {
  if (!map) return;
  // Check if clicking on route layer: cancel
  const style = map.getStyle();
  if (style && style.layers) {
    for (const layer of style.layers) {
      if (layer.id.startsWith('route-click-layer-')) {
        const features = map.queryRenderedFeatures(e.point, { layers: [layer.id] });
        if (features.length > 0) {
          return;
        }
      }
    }
  }

  // If setting route start point (implement your own flag if needed)
  if (isRouteStartPointSetting) return;

  // If search overlay is open (implement your own flag if needed)
  if (searchOverlay != null && searchOverlay?.isSearchVisible) return;

  let nearestRoom = null;
  let nearestDistance = Infinity;

  let buildingData = api.getSyncData();

  // Find the nearest room on the current level
  if (!levelSelect?.currentLevel) {
    return;
  }
  for (const buildingId of Object.keys(buildingData.part)) {
    const buildingPart = buildingData.part[buildingId];
    for (const partId of Object.keys(buildingPart.parts)) {
      const part = buildingPart.parts[partId];
      if (part.level !== levelSelect.currentLevel) continue;
      for (const roomId of Object.keys(part.rooms || {})) {
        const room = part.rooms[roomId];
        const distance = Math.sqrt(
          Math.pow(e.lngLat.lat - room.latlng.lat, 2) +
          Math.pow(e.lngLat.lng - room.latlng.lng, 2)
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestRoom = {
            ...room,
            buildingId,
            partId,
            level: part.level
          };
        }
      }
    }
  }

  if (!nearestRoom || nearestDistance > 0.00004) {
    // ~4 meters in lat/lng degrees
    console.log('No room found within 4 meters.');
    if (routeInformation == null) {
      roomInfoOverlay?.hideRoom();
    }
    return;
  }

  // selectRoom({
  //   roomName: nearestRoom.rName,
  //   buildingName: buildingData.part[nearestRoom.buildingId].building.displayName,
  //   latlng: nearestRoom.latlng,
  //   level: buildingData.part[nearestRoom.buildingId].parts[nearestRoom.partId].level,
  //   room: nearestRoom,
  //   buildingId: nearestRoom.buildingId,
  //   roomid: nearestRoom.roomid,
  //   distance: nearestDistance
  // });

  selectRoom(
    new SearchRoomResponse(
      nearestRoom.rName,
      buildingData.part[nearestRoom.buildingId].building.displayName,
      nearestRoom.latlng,
      buildingData.part[nearestRoom.buildingId].parts[nearestRoom.partId].level,
      nearestRoom,
      nearestRoom.buildingId,
      nearestRoom.roomid,
      nearestDistance
    )
  );
}