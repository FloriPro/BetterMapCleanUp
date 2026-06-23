<script>
    import api from "$lib/api/api";
    import LevelSelect from "$lib/LevelSelect.svelte";
    import settingsService from "$lib/api/settingsService";
    import { SearchRoomResponse } from "$lib/searchEngine";

    /**
     * @type {{
     *     setisRouteStartPointSetting: Function;
     *     isRouteStartPointSetting: boolean;
     *     routeInformation:
     *         | {
     *               start: { lat: number; lng: number };
     *               end: { lat: number; lng: number };
     *               room: SearchRoomResponse;
     *               routeLength: number;
     *               levelChanges: number;
     *               timeEstimate: number;
     *           }
     *         | null
     *         | { error: string };
     *     setrouteinformation: Function;
     *     setroutePoints: Function;
     *     setRouteError: Function;
     *     routePoints: {
     *         level: string;
     *         points: import("$lib/api/datatype").LatLng[];
     *         i: number;
     *     }[];
     *     map: import("maplibre-gl").Map | undefined;
     *     levelSelect: LevelSelect | null;
     * }}
     */
    let {
        setisRouteStartPointSetting,
        isRouteStartPointSetting,
        routeInformation,
        setrouteinformation,
        setRouteError,
        routePoints,
        setroutePoints,
        map,
        levelSelect,
    } = $props();

    let routeLoading = $state(false);
    /**
     * @type {{ lat: number; lng: number; level: string } | null}
     */
    let customRouteStart = $state(null);

    /**
     * @param {{
     *     point: import("$lib/api/datatype").LatLng;
     *     level: string;
     * }[]} routePoints
     * @returns {{
     *     level: string;
     *     points: import("$lib/api/datatype").LatLng[];
     * }[]}
     */
    function groupRouteByLevel(routePoints) {
        const segments = [];
        let currentSegment = null;

        for (let i = 0; i < routePoints.length; i++) {
            const routePoint = routePoints[i];
            if (!currentSegment || currentSegment.level !== routePoint.level) {
                // If changing level, repeat the transition point at the end of previous and start of next
                if (currentSegment && currentSegment.points.length > 0) {
                    // Add transition point to previous segment
                    currentSegment.points.push(routePoint.point);
                    segments.push(currentSegment);
                }
                // Start new segment with transition point
                currentSegment = {
                    level: routePoint.level,
                    points: [routePoint.point],
                    i: i,
                };
            } else {
                currentSegment.points.push(routePoint.point);
            }
        }

        if (currentSegment && currentSegment.points.length > 0) {
            segments.push(currentSegment);
        }

        return segments;
    }

    export function setRouteStartPoint() {
        console.log("Setting route start point. Current map:", map);
        return new Promise((resolve) => {
            console.log("isRouteStartPointSetting", isRouteStartPointSetting);
            setisRouteStartPointSetting(true);
            console.log("isRouteStartPointSetting", isRouteStartPointSetting);
            //TODO await until finished
            const onClick = (
                /**
                 * @type {{ lngLat: { lat: any; lng: any } }}
                 */ event,
            ) => {
                customRouteStart = {
                    lat: event.lngLat.lat,
                    lng: event.lngLat.lng,
                    level: levelSelect?.currentLevel || "EG",
                };
                setisRouteStartPointSetting(false);
                map?.off("click", onClick);
                resolve(customRouteStart);
            };
            map?.on("click", onClick);
        });
    }

    function getUserPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    });
                },
                (error) => {
                    console.error("Error getting user position:", error);
                    reject(error);
                },
            );
        });
    }

    /**
     * @param {SearchRoomResponse} room
     */
    export async function route(room) {
        routeLoading = true;

        try {
            const userPosition =
                customRouteStart ||
                (await getUserPosition().catch((error) => {
                    //activate user to select location
                    return setRouteStartPoint();
                }));

            if (!userPosition) {
                console.error("No user position available for routing");
                return;
            }

            const routingData = await api.getRoutingData(room.buildingId);

            if (!routingData) {
                throw new Error("No routing data available for this building");
            }

            console.log(
                "Routing to room:",
                room.name,
                "in building:",
                room.buildingName,
            );

            // Find closest start point on ground level (or current level if desired)
            let startPoint = findClosestPoint(
                userPosition,
                routingData.points,
                userPosition.level || "EG",
            );
            if (!startPoint) {
                throw new Error("No valid start point found");
            }

            // Find end point for the room
            let endPoint = findRoomPoint(room, routingData.points);
            if (!endPoint) {
                throw new Error("No valid end point found for room");
            }

            console.log(
                "Start point:",
                startPoint.id,
                "End point:",
                endPoint.id,
            );

            // Calculate route using A* algorithm
            const route = calculateRoute(
                startPoint.id,
                endPoint.id,
                routingData.points,
                routingData.lines,
            );

            if (route.length === 0) {
                throw new Error("No route found");
            }

            // Convert route to display format
            let routePoints = route.map((point) => ({
                point: { lat: point.lat, lng: point.lng },
                level: point.level,
            }));

            let groupedPoints = groupRouteByLevel(routePoints);
            setroutePoints(groupedPoints);

            //// COOL STATS CALCULATIONS
            // Route length
            let routeLength = 0;
            for (let i = 1; i < route.length; i++) {
                routeLength += calculateDistance(
                    route[i - 1].lat,
                    route[i - 1].lng,
                    route[i].lat,
                    route[i].lng,
                );
            }

            // Level changes
            let levelChanges = 0;
            for (let i = 1; i < route.length; i++) {
                if (route[i].level !== route[i - 1].level) {
                    levelChanges++;
                }
            }

            // Estimate time (assuming average walking speed of 1.4 m/s and 30 seconds per level change)
            const walkingSpeed = Number(
                settingsService.getValue("walkingSpeed"),
            ); // m/s
            const timePerLevelChange = Number(
                settingsService.getValue("timePerLevelChange"),
            );
            const timeEstimate =
                routeLength / walkingSpeed + levelChanges * timePerLevelChange;

            setrouteinformation({
                start: {
                    lat: userPosition.lat,
                    lng: userPosition.lng,
                    level: userPosition.level || "EG",
                },
                end: {
                    lat: room.latLng.lat,
                    lng: room.latLng.lng,
                    level: room.level,
                },
                room: room,
                routeLength: routeLength,
                levelChanges: levelChanges,
                timeEstimate: timeEstimate,
            });

            console.log("Route information:", routeInformation);
            console.log("Route points:", groupedPoints);
        } catch (/**
         * @type {any}
         */ error) {
            console.error("Error routing to room:", error);
            // alert("Error calculating route: " + error.message);
            setRouteError(error.message);
        } finally {
            routeLoading = false;
        }
    }

    /**
     * @param {number} lat1
     * @param {number} lng1
     * @param {number} lat2
     * @param {number} lng2
     */
    function calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371e3; // Earth radius in meters
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lng2 - lng1) * Math.PI) / 180;

        const a =
            Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    /**
     * @param {import("$lib/api/datatype").LatLng} userPosition
     * @param {{
     *     [key: string]: import("$lib/api/datatype").RoutingPoint;
     * }} points
     * @param {any} level
     */
    function findClosestPoint(userPosition, points, level) {
        let closestPoint = null;
        let minDistance = Infinity;

        for (const [pointId, point] of Object.entries(points)) {
            if (point.level !== level) continue;

            const distance = calculateDistance(
                userPosition.lat,
                userPosition.lng,
                point.lat,
                point.lng,
            );

            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = { ...point };
            }
        }

        return closestPoint;
    }

    /**
     * @param {SearchRoomResponse} room
     * @param {{
     *     [key: string]: import("$lib/api/datatype").RoutingPoint;
     * }} points
     */
    function findRoomPoint(room, points) {
        // First try to find exact room match
        for (const [pointId, point] of Object.entries(points)) {
            if (
                point.level === room.level &&
                point.tags &&
                point.tags.room === room.name
            ) {
                return { pointId, ...point };
            }
        }

        // Fallback: find closest point on the same level
        let closestPoint = null;
        let minDistance = Infinity;

        for (const [pointId, point] of Object.entries(points)) {
            if (point.level !== room.level) continue;

            const distance = calculateDistance(
                room.latLng.lat,
                room.latLng.lng,
                point.lat,
                point.lng,
            );

            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = { pointId, ...point };
            }
        }

        return closestPoint;
    }

    /**
     * @param {import("$lib/api/datatype").RoutingPoint} pointA
     * @param {import("$lib/api/datatype").RoutingPoint} pointB
     */
    function heuristic(pointA, pointB) {
        const dx = pointA.lng - pointB.lng;
        const dy = pointA.lat - pointB.lat;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * @param {import("$lib/api/datatype").RoutingPoint} fromPoint
     * @param {import("$lib/api/datatype").RoutingLine} line
     * @param {import("$lib/api/datatype").RoutingPoint} toPoint
     */
    function getEdgeWeight(fromPoint, line, toPoint) {
        let baseDistance = heuristic(fromPoint, toPoint);

        let weightedDistance = settingsService.getRouteWeight({
            pointTags: toPoint.tags || {},
            lineTags: line.tags || {},
            baseDistance: baseDistance,
        });

        return weightedDistance;
    }

    /**
     * @param {string} startId
     * @param {string} endId
     * @param {{
     *     [key: string]: import("$lib/api/datatype").RoutingPoint;
     * }} points
     * @param {import("$lib/api/datatype").RoutingLine[]} lines
     * @returns {import("$lib/api/datatype").RoutingPoint[]}
     */
    function calculateRoute(startId, endId, points, lines) {
        // Build adjacency graph
        /**
         * @type {Object.<
         *     string,
         *     { node: string; line: import("$lib/api/datatype").RoutingLine }[]
         * >}
         */
        const graph = {};
        for (const line of lines) {
            if (!graph[line.start]) graph[line.start] = [];
            if (!graph[line.end]) graph[line.end] = [];
            graph[line.start].push({ node: line.end, line: line });
            graph[line.end].push({ node: line.start, line: line });
        }

        // A* algorithm implementation
        const openSet = [startId];
        /**
         * @type {Object.<string, string>}
         */
        const cameFrom = {};
        /**
         * @type {Object.<string, number>}
         */
        const gScore = { [startId]: 0 };
        /**
         * @type {Object.<string, number>}
         */
        const fScore = { [startId]: heuristic(points[startId], points[endId]) };

        while (openSet.length > 0) {
            // Find node with lowest fScore
            let current = openSet[0];
            let currentIndex = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (fScore[openSet[i]] < fScore[current]) {
                    current = openSet[i];
                    currentIndex = i;
                }
            }

            if (current === endId) {
                // Reconstruct path
                const path = [];
                let node = endId;
                while (node) {
                    path.unshift(points[node]);
                    node = cameFrom[node];
                }
                return path;
            }

            openSet.splice(currentIndex, 1);

            if (!graph[current]) continue;

            for (const neighbor of graph[current]) {
                const tentativeG =
                    gScore[current] +
                    getEdgeWeight(
                        points[current],
                        neighbor.line,
                        points[neighbor.node],
                    );

                if (
                    !(neighbor.node in gScore) ||
                    tentativeG < gScore[neighbor.node]
                ) {
                    cameFrom[neighbor.node] = current;
                    gScore[neighbor.node] = tentativeG;
                    fScore[neighbor.node] =
                        tentativeG +
                        heuristic(points[neighbor.node], points[endId]);

                    if (!openSet.includes(neighbor.node)) {
                        openSet.push(neighbor.node);
                    }
                }
            }
        }

        return []; // No path found
    }

    export function clearRoute() {
        setrouteinformation(null);
        setroutePoints([]);
    }

    /**
     * @param {{ lat: number; lng: number; level: string }} start
     */
    export function setRouteStart({ lat, lng, level }) {
        customRouteStart = { lat, lng, level };
    }
</script>

{#if routeLoading && !isRouteStartPointSetting}
    <div id="routing-loading-overlay">
        <div class="routing-loading-content">
            <div class="routing-loading-spinner"></div>
            <div class="routing-loading-text">Calculating route...</div>
        </div>
    </div>
{/if}

{#if isRouteStartPointSetting}
    <div id="route-start-border-overlay" style="display: block;"></div>
{/if}

<style>
    #routing-loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
    }

    .routing-loading-content {
        background: rgba(40, 44, 52, 0.95);
        border-radius: 12px;
        padding: 24px;
        backdrop-filter: blur(10px);
        color: white;
        text-align: center;
    }

    .routing-loading-spinner {
        width: 24px;
        height: 24px;
        border: 2px solid transparent;
        border-top: 2px solid #4fa8d8;
        border-radius: 50%;
        margin: 0 auto 16px;
        animation: spin 1s linear infinite;
    }

    .routing-loading-text {
        font-size: 16px;
    }

    #route-start-border-overlay {
        position: absolute;
        inset: 0px;
        pointer-events: none;
        border: 12px solid rgb(229, 57, 53);
        z-index: 3000;
        box-sizing: border-box;
        transition: opacity 0.2s;
        display: block;
        margin: -6px;
        filter: blur(6px);
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
