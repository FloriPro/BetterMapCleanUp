import { LEVEL_ORDER } from "./constants";

/**
 * @param {import("maplibre-gl").Map} map
 * @param {any} buildingData
 * @returns {string[] | null}
 */
export function getAvailableLayers(map, buildingData) {
    if (!buildingData) {
        console.log("Building data not yet loaded");
        return null;
    }

    let mapBounds = map.getBounds();
    // console.log('Map bounds:', mapBounds);

    // Create a slightly expanded bounds for better detection
    const expandFactor = 0.001; // About 100m at this scale
    const expandedBounds = {
        west: mapBounds.getWest() - expandFactor,
        east: mapBounds.getEast() + expandFactor,
        south: mapBounds.getSouth() - expandFactor,
        north: mapBounds.getNorth() + expandFactor,
    };

    /**
     * @type {string[]}
     */
    let availableLevels = [];

    for (let building of Object.keys(buildingData.part)) {
        for (let partId of Object.keys(buildingData.part[building].parts)) {
            let part = buildingData.part[building].parts[partId];
            let poly = part.polyInfo.poly;
            let level = part.level;

            // Check if any corner of the building polygon is within the expanded map bounds
            const corners = [
                { lat: poly.topLeft.lat, lng: poly.topLeft.lng },
                { lat: poly.topRight.lat, lng: poly.topRight.lng },
                { lat: poly.bottomLeft.lat, lng: poly.bottomLeft.lng },
                { lat: poly.bottomRight.lat, lng: poly.bottomRight.lng },
            ];

            let isInBounds = false;
            for (const corner of corners) {
                if (
                    corner.lng >= expandedBounds.west &&
                    corner.lng <= expandedBounds.east &&
                    corner.lat >= expandedBounds.south &&
                    corner.lat <= expandedBounds.north
                ) {
                    isInBounds = true;
                    break;
                }
            }

            // Also check if the map bounds intersect with the building bounds
            if (!isInBounds) {
                const buildingBounds = {
                    west: Math.min(
                        poly.topLeft.lng,
                        poly.bottomLeft.lng,
                        poly.topRight.lng,
                        poly.bottomRight.lng,
                    ),
                    east: Math.max(
                        poly.topLeft.lng,
                        poly.bottomLeft.lng,
                        poly.topRight.lng,
                        poly.bottomRight.lng,
                    ),
                    south: Math.min(
                        poly.topLeft.lat,
                        poly.bottomLeft.lat,
                        poly.topRight.lat,
                        poly.bottomRight.lat,
                    ),
                    north: Math.max(
                        poly.topLeft.lat,
                        poly.bottomLeft.lat,
                        poly.topRight.lat,
                        poly.bottomRight.lat,
                    ),
                };

                // Check for bounds intersection
                isInBounds = !(
                    expandedBounds.east < buildingBounds.west ||
                    expandedBounds.west > buildingBounds.east ||
                    expandedBounds.north < buildingBounds.south ||
                    expandedBounds.south > buildingBounds.north
                );
            }

            if (isInBounds && !availableLevels.includes(level)) {
                // console.log(`Adding level ${level} for building ${building}, part ${partId}`);
                availableLevels.push(level);
            }
        }
    }

    availableLevels.sort(
        (a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b),
    );
    return availableLevels;
}
