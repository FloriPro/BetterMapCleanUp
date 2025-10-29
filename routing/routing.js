let osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 30,
    maxNativeZoom: 19,
    minZoom: 0,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
})
let satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 30,
    maxNativeZoom: 19,
    minZoom: 0,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
})
let layers = {
    "satelite": satelite,
    "osm": osm,
}
let map = L.map('map', {
    layers: Object.values(layers),
});
var layerControl = L.control.layers(layers, []).addTo(map);

let building;
let selected_floor;

const HIDDEN_BUILDING_WATCHER = {
    //<building not hidden>: [<building hidden>, ...]
    "bw0000": ["bw0040"],
    "bw0070": ["bw0073"],
    "bw0120": ["bw0110", "bw0121", "bw0122"],
    "bw0800": ["bw0801"],
    "bw0822": ["bw0820"],
    "bw1120": ["bw1110"],
    "bw1509": ["bw1502"],
    "bw1540": ["bw1541"],
}

function bestLineV1(points) {
    //make a Spanning tree containing all points
    if (points.length <= 1) return [];

    // Calculate distances between all pairs of points
    const edges = [];
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const dist = Math.sqrt(
                Math.pow(points[i].x - points[j].x, 2) +
                Math.pow(points[i].y - points[j].y, 2)
            );
            edges.push({
                start: points[i].id,
                end: points[j].id,
                distance: dist
            });
        }
    }

    // Sort edges by distance (Kruskal's algorithm)
    edges.sort((a, b) => a.distance - b.distance);

    // Union-Find data structure for cycle detection
    const parent = {};
    const rank = {};

    function find(x) {
        if (parent[x] !== x) {
            parent[x] = find(parent[x]);
        }
        return parent[x];
    }

    function union(x, y) {
        const rootX = find(x);
        const rootY = find(y);

        if (rootX !== rootY) {
            if (rank[rootX] < rank[rootY]) {
                parent[rootX] = rootY;
            } else if (rank[rootX] > rank[rootY]) {
                parent[rootY] = rootX;
            } else {
                parent[rootY] = rootX;
                rank[rootX]++;
            }
            return true;
        }
        return false;
    }

    // Initialize union-find
    points.forEach(point => {
        parent[point.id] = point.id;
        rank[point.id] = 0;
    });

    // Build minimum spanning tree
    const mstEdges = [];
    for (const edge of edges) {
        if (union(edge.start, edge.end)) {
            mstEdges.push({
                start: edge.start,
                end: edge.end
            });

            // Stop when we have n-1 edges (complete spanning tree)
            if (mstEdges.length === points.length - 1) {
                break;
            }
        }
    }

    return mstEdges;
}

const nearbyPointsReductionDistance = 15;

function bestLine(points) {
    //connect a point to the 5 nearest points. then check for each line, that if it would be removed, the travel time would increase by more than 50%
    if (points.length <= 1) return [];

    // Helper function to calculate distance between two points
    function distance(p1, p2) {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    }

    // Fast Floyd-Warshall implementation for all-pairs shortest paths
    function computeAllPairsShortestPaths(points, edges) {
        const pointIds = points.map(p => p.id);
        const n = pointIds.length;
        const idToIndex = {};
        pointIds.forEach((id, i) => idToIndex[id] = i);

        // Initialize distance matrix
        const dist = Array(n).fill(null).map(() => Array(n).fill(Infinity));

        // Distance from a point to itself is 0
        for (let i = 0; i < n; i++) {
            dist[i][i] = 0;
        }

        // Set direct edge distances
        edges.forEach(edge => {
            const i = idToIndex[edge.start];
            const j = idToIndex[edge.end];
            if (i !== undefined && j !== undefined) {
                dist[i][j] = Math.min(dist[i][j], edge.distance);
                dist[j][i] = Math.min(dist[j][i], edge.distance);
            }
        });

        // Floyd-Warshall algorithm
        for (let k = 0; k < n; k++) {
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    if (dist[i][k] + dist[k][j] < dist[i][j]) {
                        dist[i][j] = dist[i][k] + dist[k][j];
                    }
                }
            }
        }

        return { dist, idToIndex, pointIds };
    }

    // Check if graph is connected using DFS
    function isConnected(points, edges) {
        if (points.length <= 1) return true;

        const adjacency = {};
        points.forEach(p => adjacency[p.id] = []);
        edges.forEach(edge => {
            adjacency[edge.start].push(edge.end);
            adjacency[edge.end].push(edge.start);
        });

        const visited = new Set();
        const stack = [points[0].id];

        while (stack.length > 0) {
            const current = stack.pop();
            if (visited.has(current)) continue;
            visited.add(current);

            adjacency[current].forEach(neighbor => {
                if (!visited.has(neighbor)) {
                    stack.push(neighbor);
                }
            });
        }

        return visited.size === points.length;
    }

    // Step 1: Connect each point to its 5 nearest neighbors
    const initialEdges = [];

    points.forEach(point => {
        // Calculate distances to all other points
        const distances = points
            .filter(p => p.id !== point.id)
            .map(p => ({
                point: p,
                distance: distance(point, p)
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, Math.min(5, points.length - 1)); // Take up to 5 nearest

        // Create edges to nearest neighbors
        distances.forEach(({ point: neighbor, distance: dist }) => {
            // Check if edge already exists (avoid duplicates)
            const edgeExists = initialEdges.some(edge =>
                (edge.start === point.id && edge.end === neighbor.id) ||
                (edge.start === neighbor.id && edge.end === point.id)
            );

            if (!edgeExists) {
                initialEdges.push({
                    start: point.id,
                    end: neighbor.id,
                    distance: dist
                });
            }
        });
    });

    // Step 2: Optimize by removing non-critical edges
    const optimizedEdges = [...initialEdges];

    // Calculate baseline all-pairs shortest paths
    let { dist: baselineDist, idToIndex } = computeAllPairsShortestPaths(points, optimizedEdges);

    // Test each edge for removal (iterate backwards to avoid index issues)
    for (let i = optimizedEdges.length - 1; i >= 0; i--) {
        const edgeToTest = optimizedEdges[i];

        // Temporarily remove the edge
        const edgesWithoutCurrent = optimizedEdges.filter((_, index) => index !== i);

        // Quick connectivity check first
        if (!isConnected(points, edgesWithoutCurrent)) {
            continue; // Keep edge if it breaks connectivity
        }

        // Calculate new shortest paths without this edge
        const { dist: newDist } = computeAllPairsShortestPaths(points, edgesWithoutCurrent);

        // Check if removing this edge increases any travel time by more than 50%
        let shouldKeepEdge = false;
        const n = points.length;

        for (let j = 0; j < n && !shouldKeepEdge; j++) {
            for (let k = j + 1; k < n; k++) {
                const baselineTime = baselineDist[j][k];
                const newTime = newDist[j][k];

                // Skip if baseline is infinite (unreachable)
                if (baselineTime === Infinity) continue;

                // If the new time is more than 50% longer, keep the edge
                if (newTime > baselineTime * 1.5) {
                    shouldKeepEdge = true;
                    break;
                }
            }
        }

        // Remove the edge if it's not critical
        if (!shouldKeepEdge) {
            optimizedEdges.splice(i, 1);
            // Update baseline for next iteration
            baselineDist = newDist;
        }
    }

    // Return edges in the expected format
    return optimizedEdges.map(edge => ({
        start: edge.start,
        end: edge.end
    }));
}



class storage {
    static openDB() {
        return new Promise((resolve, reject) => {
            let request = indexedDB.open("fastRoomData", 1);
            request.onupgradeneeded = function (event) {
                let db = event.target.result;
                if (!db.objectStoreNames.contains("fastRoomData")) {
                    db.createObjectStore("fastRoomData");
                }
            };
            request.onsuccess = function (event) {
                let db = event.target.result;
                resolve(db);
            };
            request.onerror = function (event) {
                reject(event.target.error);
            };
        });
    }

    static async setFastRoomData(data, building, floor) {
        let db = await this.openDB();
        let tx = db.transaction("fastRoomData", "readwrite");
        let store = tx.objectStore("fastRoomData");
        console.log("Promise created");
        await new Promise((resolve, reject) => {
            let req = store.put(data, `${building}_${floor}`);
            req.onsuccess = resolve;
            req.onerror = reject;
        });
        console.log("Promise closed");
        db.close();
    }

    static async getFastRoomData(building, floor) {
        let db = await this.openDB();
        let tx = db.transaction("fastRoomData", "readonly");
        let store = tx.objectStore("fastRoomData");
        let key = `${building}_${floor}`;
        let result = await new Promise((resolve, reject) => {
            let req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        db.close();
        return result;
    }
}

function resetLayer() {
    let urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("building")) {
        urlParams.delete("building");
    }
    if (urlParams.has("floor")) {
        urlParams.delete("floor");
    }
    window.history.replaceState({}, '', `${window.location.pathname}?${urlParams}`);
}
function setFloor(floor) {
    //use url parameter to set the floor
    let urlParams = new URLSearchParams(window.location.search);
    urlParams.set("floor", floor);
    window.history.replaceState({}, '', `${window.location.pathname}?${urlParams}`);
}

class _SyncObj {
    constructor() {
        this.isSyncing = this.getIsSyncing();
        this.bc = new BroadcastChannel("routing_sync");
        this.movedBecauseOfSync = false;
        this.isFinishedLoading = false;
        this.bc.onmessage = this.recieveMessage.bind(this);
        this.createListener();
    }

    finishedLoading() {
        this.isFinishedLoading = true;
        this.bc.postMessage({
            action: "getPosition",
            building: building,
            floor: selected_floor
        });
    }

    createListener() {
        if (!this.isSyncing) {
            console.log("Syncing is disabled, not creating listener.");
            return;
        }
        function upd() {
            if (!this.isFinishedLoading) {
                return;
            }
            let center = map.getCenter();
            let zoom = map.getZoom();
            this.updatePosition(zoom, center.lat, center.lng);
        }
        map.on('moveend', upd.bind(this));
        map.on('zoomend', upd.bind(this));
        map.on('dragend', upd.bind(this));
    }

    getIsSyncing() {
        let urlParams = new URLSearchParams(window.location.search);
        return urlParams.has("synced") && urlParams.get("synced") === "true";
    }

    recieveMessage(event) {

        let data = event.data;
        if (data.action === "updatePosition") {
            if (this.remSync) {
                console.log("Clearing previous sync timeout");
                clearTimeout(this.remSync);
            }
            this.movedBecauseOfSync = true;
            this.remSync = setTimeout(() => {
                this.movedBecauseOfSync = false;
                this.remSync = null;
            }, 500);
            map.setView([data.pos.lat, data.pos.lng], data.pos.zoom, {
                animate: false
            });
            console.log("Updated position to:", data.pos);
        }
    }

    updatePosition(zoom, lat, lng) {
        if (!this.isSyncing || this.movedBecauseOfSync) {
            return
        }
        let data = {
            "action": "updatePosition",
            "building": building,
            "floor": selected_floor,
            "pos": {
                "zoom": zoom,
                "lat": lat,
                "lng": lng
            }
        }

        this.bc.postMessage(data);
    }
}

let syncObj = new _SyncObj()

function getBuilding() {
    let urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("building");
}

function getFloor() {
    let urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("floor");
}

async function getCorners(building, floor) {
    let corners = await (await fetch(`/data/${building}/polyInfo/${floor}.json`)).json().catch(e => {
        alert("Error loading corners data")
    });
    return corners;
}

function selectLayer() {
    let urlBuilding = getBuilding();
    if (urlBuilding) {
        localStorage.setItem("createRouting_current", urlBuilding);
    }
    building = localStorage.getItem("createRouting_current")
    if (building == null) {
        building = prompt("current Room")
    } else {
        //building = prompt("current Room", building)
    }
    localStorage.setItem("createRouting_current", building)

    selected_floor = getFloor();
    if (selected_floor == null) {
        selected_floor = prompt("target Floor")
    } else {
    }

    setFloor(selected_floor);

    console.log("Building:", building, "Floor:", selected_floor)
}

selectLayer();

function copy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function distanceToLine(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) { // avoid division by zero
        param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 
 * @param {*} px x-coordinate of the point
 * @param {*} py y-coordinate of the point
 * @param {*} x1 x-coordinate of the first point of the line segment
 * @param {*} y1 y-coordinate of the first point of the line segment
 * @param {*} x2 x-coordinate of the second point of the line segment
 * @param {*} y2 y-coordinate of the second point of the line segment
 * @returns 
 */
function nearestPointOnLine(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) { // avoid division by zero
        param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    return { x: xx, y: yy };
}

function linesIntersect(start1, end1, start2, end2) {
    function ccw(A, B, C) {
        return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    }

    return (
        ccw(start1, start2, end2) !== ccw(end1, start2, end2) &&
        ccw(start1, end1, start2) !== ccw(start1, end1, end2)
    );
}
function getLinesIntersection(start1, end1, start2, end2) {
    const x1 = start1.x, y1 = start1.y;
    const x2 = end1.x, y2 = end1.y;
    const x3 = start2.x, y3 = start2.y;
    const x4 = end2.x, y4 = end2.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    if (denom === 0) {
        // Lines are parallel or coincident
        return null;
    }

    const px = ((x1 * y2 - y1 * x2) * (x3 - x4) -
        (x1 - x2) * (x3 * y4 - y3 * x4)) / denom;

    const py = ((x1 * y2 - y1 * x2) * (y3 - y4) -
        (y1 - y2) * (x3 * y4 - y3 * x4)) / denom;

    // Check if the intersection point (px, py) is within both segments
    function pointOnSegment(px, py, x1, y1, x2, y2) {
        return (
            Math.min(x1, x2) <= px && px <= Math.max(x1, x2) &&
            Math.min(y1, y2) <= py && py <= Math.max(y1, y2)
        );
    }

    const onSegment1 = pointOnSegment(px, py, x1, y1, x2, y2);
    const onSegment2 = pointOnSegment(px, py, x3, y3, x4, y4);

    if (onSegment1 && onSegment2) {
        return { x: px, y: py };
    }

    return null; // Intersection point not on both segments
}

function drawPoint(x, y, radius, color = "blue") {
    this.beginPath();
    this.arc(x, y, radius, 0, Math.PI * 2);
    this.fillStyle = color;
    this.fill();
    this.closePath();
}

function pxToLatLng(corners, x, y, canvasWidth, canvasHeight) {
    const u = x / canvasWidth;
    const v = y / canvasHeight;

    // Bilinear interpolation for longitude
    const lngTop = corners.topLeft.lng * (1 - u) + corners.topRight.lng * u;
    const lngBottom = corners.bottomLeft.lng * (1 - u) + corners.bottomRight.lng * u;
    const lng = lngTop * (1 - v) + lngBottom * v;

    // Bilinear interpolation for latitude
    const latLeft = corners.topLeft.lat * (1 - v) + corners.bottomLeft.lat * v;
    const latRight = corners.topRight.lat * (1 - v) + corners.bottomRight.lat * v;
    const lat = latLeft * (1 - u) + latRight * u;

    return { lat, lng };
}

let fastRoomDownscaleBuilding = {
    "bw0000": 1,
    "bw1003": 3,
    "bw7070": 2,
    "bw0420": 3,
}


class RoutingGenerator {
    constructor(building, floorData, corners, canvas, floorimg, canvasRotation, roomInfo) {
        this.building = building;
        this.floorData = floorData;
        this.corners = corners;
        this.canvas = canvas;
        this.floorimg = floorimg;
        this.canvasRotation = canvasRotation; // Convert degrees to radians
        this.roomInfo = roomInfo;

        this.ctx = this.canvas.getContext("2d");
        this.ctx.drawPoint = drawPoint.bind(this.ctx);

        this.currentlyMovingView = false;
        this.headerRoutingData = null;
        this.lines = [];
        this.points = {};

        this.currentlyMoving = false;
        this.mousePosition = { x: 0, y: 0, lat: 0, lng: 0 };
        this.currentDo = "none";

        this.isUsingFastRoom = false;
        this.fastRoomConnections = [];

        this.arrowUpImg = new Image();
        this.arrowUpImg.src = "/routing/img/arrowUp.png"
        this.arrowDownImg = new Image();
        this.arrowDownImg.src = "/routing/img/arrowDown.png"
        this.arrowBothImg = new Image();
        this.arrowBothImg.src = "/routing/img/arrowBoth.png"
        this.lockImg = new Image();
        this.lockImg.src = "/routing/img/lock.png";
        this.raindropImg = new Image();
        this.raindropImg.src = "/routing/img/raindrop.png";

        document.title = `${floorData.level} - ${building} Routing Generator`;
    }

    async start() {
        await this.loadOrInitRoutingData();
        this.setupMouseHandlers();
        this.setupKeyboardHandlers();
        this.redrawCanvas();
        syncObj.finishedLoading();
    }

    async loadOrInitRoutingData() {
        let response = await fetch(`/data/${this.building}/routing/${this.floorData.id}.json`);
        if (response.status === 404) {
            this.headerRoutingData = { lines: [], points: {} };
            this.lines = this.headerRoutingData.lines;
            this.points = this.headerRoutingData.points;
            this.saveData();
        } else {
            this.headerRoutingData = await response.json();
            this.lines = this.headerRoutingData.lines;
            this.points = this.headerRoutingData.points;
            this.fastRoomConnections = this.headerRoutingData.fastRoomConnections || [];

            this.migrateData();
        }
    }

    migrateData() {
        // if a point has a levelChangeTodo property, but no ("stair", "elevator") tag, add a "stair" tag
        for (let pointId in this.points) {
            if (this.points[pointId].levelChangeTodo && !this.getTag(pointId, "stair") && !this.getTag(pointId, "elevator")) {
                this.setTag(pointId, "stair", true);
            }
        }
    }

    saveData() {
        this.headerRoutingData = {
            lines: this.lines,
            points: this.points,
            fastRoomConnections: this.fastRoomConnections,
        };
        fetch(`/save/data/${this.building}/routing/${this.floorData.id}.json`, {
            method: "POST",
            body: JSON.stringify(this.headerRoutingData),
        });
    }

    createPoint(mousePosition) {
        if (!mousePosition || !mousePosition.x || !mousePosition.y || !mousePosition.lat || !mousePosition.lng) {
            console.error("Invalid mouse position:", mousePosition, "expected {x, y, lat, lng}");
            throw new Error("Invalid mouse position");
        }
        let i = Object.keys(this.points).length;
        while (this.points[`point_${i}`]) {
            i++;
        }
        let pointId = `point_${i}`;
        this.points[pointId] = copy(mousePosition);
        this.points[pointId].id = pointId;
        if (mousePosition.tags) {
            this.points[pointId].tags = mousePosition.tags;
        }
        if (mousePosition.noSave) {
            return pointId;
        }
        this.saveData();
        return pointId;
    }

    updateNearestPoint() {
        this.nearestPointId = null;
        let nearestDistance = Infinity;

        for (let pointId in this.points) {
            let point = this.points[pointId];
            let distance = Math.sqrt(
                Math.pow(point.x - this.mousePosition.x, 2) +
                Math.pow(point.y - this.mousePosition.y, 2)
            );

            if (distance < nearestDistance) {
                nearestDistance = distance;
                this.nearestPointId = pointId;
            }
        }
        if (this.nearestPointId && nearestDistance < 15) {
        } else {
            this.nearestPointId = null;
        }
    }

    reduceNearbyPoints(threshold = 10) {
        const pointsToMerge = new Map(); // pointId -> targetPointId
        const processedPoints = new Set();

        // Find clusters of nearby points
        for (let pointId in this.points) {
            if (processedPoints.has(pointId)) continue;

            const point = this.points[pointId];
            const cluster = [pointId];

            // Find all points within threshold distance
            for (let otherPointId in this.points) {
                if (otherPointId === pointId || processedPoints.has(otherPointId)) continue;

                const otherPoint = this.points[otherPointId];
                const distance = Math.sqrt(
                    Math.pow(point.x - otherPoint.x, 2) +
                    Math.pow(point.y - otherPoint.y, 2)
                );

                if (distance <= threshold) {
                    cluster.push(otherPointId);
                }
            }

            if (cluster.length > 1) {
                // Use the first point as the target, merge others into it
                const targetPointId = cluster[0];

                // Calculate average position for better placement
                let avgX = 0, avgY = 0, avgLat = 0, avgLng = 0;
                let validPoints = 0;

                for (let clusterId of cluster) {
                    const clusterPoint = this.points[clusterId];
                    if (clusterPoint && clusterPoint.x !== undefined && clusterPoint.y !== undefined) {
                        avgX += clusterPoint.x;
                        avgY += clusterPoint.y;
                        avgLat += clusterPoint.lat || 0;
                        avgLng += clusterPoint.lng || 0;
                        validPoints++;
                    }
                }

                if (validPoints > 0) {
                    // Update target point to average position
                    this.points[targetPointId].x = avgX / validPoints;
                    this.points[targetPointId].y = avgY / validPoints;
                    this.points[targetPointId].lat = avgLat / validPoints;
                    this.points[targetPointId].lng = avgLng / validPoints;

                    // Merge tags from all points
                    for (let clusterId of cluster) {
                        if (clusterId !== targetPointId && this.points[clusterId]) {
                            const sourcePoint = this.points[clusterId];
                            if (sourcePoint.tags) {
                                if (!this.points[targetPointId].tags) {
                                    this.points[targetPointId].tags = {};
                                }
                                // Merge tags, prioritizing existing tags on target
                                for (let tag in sourcePoint.tags) {
                                    if (!this.points[targetPointId].tags[tag]) {
                                        this.points[targetPointId].tags[tag] = sourcePoint.tags[tag];
                                    }
                                }
                            }
                        }
                    }

                    // Mark points to be merged
                    for (let i = 1; i < cluster.length; i++) {
                        pointsToMerge.set(cluster[i], targetPointId);
                    }
                }
            }

            // Mark all points in this cluster as processed
            cluster.forEach(id => processedPoints.add(id));
        }

        // Update all lines to use target points instead of merged points
        for (let line of this.lines) {
            if (pointsToMerge.has(line.start)) {
                line.start = pointsToMerge.get(line.start);
            }
            if (pointsToMerge.has(line.end)) {
                line.end = pointsToMerge.get(line.end);
            }
        }

        // Remove duplicate lines (lines with same start and end points)
        const uniqueLines = [];
        const lineSet = new Set();

        for (let line of this.lines) {
            // Skip lines that connect a point to itself
            if (line.start === line.end) continue;

            // Create a normalized line identifier (smaller id first)
            const lineKey = line.start < line.end ?
                `${line.start}-${line.end}` :
                `${line.end}-${line.start}`;

            if (!lineSet.has(lineKey)) {
                lineSet.add(lineKey);
                uniqueLines.push(line);
            }
        }

        this.lines = uniqueLines;

        // Remove merged points from this.points
        for (let pointId of pointsToMerge.keys()) {
            delete this.points[pointId];
        }

        console.log(`Reduced ${pointsToMerge.size} nearby points within ${threshold}px threshold`);
    }

    getNearestLine(threshold = 15) {
        let nearestLine = null;
        let nearestDistance = Infinity;

        for (let line of this.lines) {
            let startPoint = this.points[line.start];
            let endPoint = this.points[line.end];
            if (startPoint && endPoint) {
                let distance = distanceToLine(
                    this.mousePosition.x, this.mousePosition.y,
                    startPoint.x, startPoint.y,
                    endPoint.x, endPoint.y
                );
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestLine = line;
                }
            }
        }

        if (nearestDistance < threshold) {
            return nearestLine;
        }
        return null;
    }

    rotateCtx(angle, pointx, pointy) {
        this.ctx.save();
        this.ctx.translate(pointx, pointy);
        this.ctx.rotate(angle);
        this.ctx.translate(-pointx, -pointy);
    }
    unrotateCtx() {
        this.ctx.restore();
    }

    redrawCanvas() {
        if (this.currentDo == "highlightRoomAreas") {
            return
        }
        this.updateNearestPoint();
        let nearestLine = this.getNearestLine();

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.drawImage(this.floorimg, 0, 0);

        for (let line of this.lines) {
            let startPoint = this.points[line.start];
            let endPoint = this.points[line.end];
            if (startPoint && endPoint) {
                this.ctx.beginPath();
                this.ctx.moveTo(startPoint.x, startPoint.y);
                this.ctx.lineTo(endPoint.x, endPoint.y);
                if (this.getLineTag(line, "accessible") == true) {
                    this.ctx.strokeStyle = "#5e1c85";
                } else {
                    this.ctx.strokeStyle = "black";
                }
                if (this.getLineTag(line, "locked") == true) {
                    if (this.getLineTag(line, "unlikely") == true) {
                        this.ctx.setLineDash([10, 5, 2, 2]);
                    } else {
                        this.ctx.setLineDash([5, 5]);
                    }
                } else if (this.getLineTag(line, "unlikely") == true) {
                    //twodash
                    this.ctx.setLineDash([2, 2, 10, 2]);
                } else {
                    this.ctx.setLineDash([]);
                }
                this.ctx.lineWidth = 3;
                if (!this.isUsingFastRoom && !this.nearestPointId && nearestLine && nearestLine.start === line.start && nearestLine.end === line.end) {
                    this.ctx.lineWidth = 6;
                }
                this.ctx.stroke();

                this.ctx.setLineDash([]);
            } else {
                console.warn("Line has undefined points:", line, startPoint, endPoint);
            }
        }

        for (let pointId in this.points) {
            let point = this.points[pointId];
            //draw one point
            this.ctx.drawPoint(point.x, point.y, 5, "blue");
            if (point.levelChangeTodo) {
                //get tags
                let tags = point.tags || {};
                if (tags["stair"] != true && tags["elevator"] != true) {
                    this.ctx.fillStyle = "red";
                    this.ctx.font = "12px Arial";
                    this.ctx.fillText("?", point.x + 10, point.y - 10);
                }
                else if (tags["stair"] == true) {
                    //green background
                    this.ctx.fillStyle = "green";
                    this.ctx.beginPath();
                    this.ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.fillStyle = "white";
                    this.ctx.font = "12px Arial";
                    this.ctx.fillText("S", point.x - 5, point.y + 5);
                }
                else if (tags["elevator"] == true) {
                    this.ctx.fillStyle = "orange";
                    this.ctx.beginPath();
                    this.ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.fillStyle = "white";
                    this.ctx.font = "12px Arial";
                    this.ctx.fillText("E", point.x - 5, point.y + 5);
                } else {
                    console.log(tags)
                    this.ctx.fillStyle = "red";
                    this.ctx.beginPath();
                    this.ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.fillStyle = "white";
                    this.ctx.font = "12px Arial";
                    this.ctx.fillText("?", point.x - 5, point.y + 5);
                }
            }
            if (this.getTag(pointId, "private") == true) {
                this.rotateCtx(this.canvasRotation * (Math.PI / 180), point.x, point.y);
                this.ctx.drawImage(this.lockImg, point.x - 10, point.y - 10, 20, 20);
                this.unrotateCtx();
            }
            if (this.getTag(pointId, "room")) {
                let room = this.roomInfo.rooms[this.getTag(pointId, "room")];
                if (room) {
                    //line to the room center
                    //if the line is too long, draw start and end line
                    let linelength = Math.sqrt(
                        Math.pow(point.x - room.pX, 2) +
                        Math.pow(point.y - room.pY, 2)
                    )
                    if (linelength > 200 && !(this.nearestPointId == pointId)) {
                        this.ctx.beginPath();
                        this.ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
                        this.ctx.lineWidth = 1;
                        this.ctx.setLineDash([2, 1]);
                        this.ctx.moveTo(point.x, point.y);
                        this.ctx.lineTo(point.x + (room.pX - point.x) / linelength * 50, point.y + (room.pY - point.y) / linelength * 50);
                        this.ctx.stroke();
                        this.ctx.beginPath();
                        this.ctx.moveTo(room.pX, room.pY);
                        this.ctx.lineTo(room.pX - (room.pX - point.x) / linelength * 50, room.pY - (room.pY - point.y) / linelength * 50);
                        this.ctx.stroke();
                        this.ctx.setLineDash([]);

                    } else {
                        this.ctx.beginPath();
                        this.ctx.moveTo(point.x, point.y);
                        this.ctx.lineTo(room.pX, room.pY);
                        this.ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
                        this.ctx.lineWidth = 2;
                        this.ctx.stroke();
                    }

                } else {
                    //console.warn("Room not found for point:", pointId, "Room name:", this.getTag(pointId, "room"));
                    //draw the room name
                    this.ctx.font = "12px Arial";
                    this.ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
                    this.ctx.fillText(this.getTag(pointId, "room"), point.x + 10, point.y - 10);
                    //line to the room center
                    this.ctx.beginPath();
                    this.ctx.moveTo(point.x, point.y);
                    this.ctx.lineTo(point.x + 10, point.y - 10);
                    this.ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
            }
            if (this.getTag(pointId, "outside") == true) {
                this.rotateCtx(this.canvasRotation * (Math.PI / 180), point.x, point.y);
                this.ctx.drawImage(this.raindropImg, point.x - 10, point.y - 10, 20, 20);
                this.unrotateCtx();
            }
        }

        for (let connection of this.fastRoomConnections) {
            this.ctx.beginPath();
            this.ctx.moveTo(connection.startPos.x, connection.startPos.y);
            this.ctx.lineTo(connection.endPos.x, connection.endPos.y);
            this.ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }

        if (!this.isUsingFastRoom) {
            if (this.nearestPointId) {
                console.log("Nearest point:", this.nearestPointId);
                this.ctx.drawPoint(
                    this.points[this.nearestPointId].x,
                    this.points[this.nearestPointId].y,
                    8,
                    "red"
                );
            } else {
                if (nearestLine) {
                    let startPoint = this.points[nearestLine.start];
                    let endPoint = this.points[nearestLine.end];

                    if (startPoint && endPoint) {
                        let nearestPoint = nearestPointOnLine(
                            this.mousePosition.x, this.mousePosition.y,
                            startPoint.x, startPoint.y,
                            endPoint.x, endPoint.y
                        );
                        this.ctx.drawPoint(nearestPoint.x, nearestPoint.y, 8, "#85351c");

                    } else {
                        console.warn("Nearest line has undefined points:", nearestLine, startPoint, endPoint);
                    }
                }
            }
        }

        if (this.currentDo === "addLine") {
            this.ctx.beginPath();
            this.ctx.moveTo(this.points[this.addlinestart].x, this.points[this.addlinestart].y);
            if (this.nearestPointId) {
                this.ctx.lineTo(this.points[this.nearestPointId].x, this.points[this.nearestPointId].y);
            } else {
                this.ctx.lineTo(this.mousePosition.x, this.mousePosition.y);
            }
            this.ctx.strokeStyle = "green";
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
        if (this.currentDo === "addRoom") {
            this.ctx.drawPoint(
                this.mousePosition.x,
                this.mousePosition.y,
                50,
                "#00000050"
            )
            if (this.addRoomNearestRoom) {
                this.ctx.beginPath();
                this.ctx.moveTo(this.points[this.addRoomTo].x, this.points[this.addRoomTo].y);
                this.ctx.lineTo(this.addRoomNearestRoom.pX, this.addRoomNearestRoom.pY);
                this.ctx.strokeStyle = "orange";
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }

        }

        if (this.overlayImg) {
            // overlayImage is from black to white. black is transparent, white is opaque
            this.ctx.globalCompositeOperation = "multiply"
            this.ctx.drawImage(this.overlayImg, 0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalCompositeOperation = "source-over"
        }
    }

    getTag(pointId, tag) {
        if (this.points[pointId] && this.points[pointId].tags) {
            return this.points[pointId].tags[tag];
        }
        return null;
    }
    setTag(pointId, tag, value) {
        if (!this.points[pointId]) {
            console.warn("Point not found:", pointId);
            return;
        }
        if (!this.points[pointId].tags) {
            this.points[pointId].tags = {};
        }
        this.points[pointId].tags[tag] = value;
        this.saveData();
    }

    getLineTag(line, tag) {
        if (!line || !line.start || !line.end) {
            console.warn("Invalid line:", line);
            return null;
        }
        if (!this.lines.includes(line)) {
            console.warn("Line not found in lines array:", line);
            return null;
        }
        if (line.tags && line.tags[tag] !== undefined) {
            return line.tags[tag];
        }
        return null;
    }

    setLineTag(line, tag, value) {
        if (!line || !line.start || !line.end) {
            console.warn("Invalid line:", line);
            return;
        }
        if (!this.lines.includes(line)) {
            console.warn("Line not found in lines array:", line);
            return;
        }
        if (!line.tags) {
            line.tags = {};
        }
        line.tags[tag] = value;
        this.saveData();
    }

    recalculateRoomsMissingMarkers() {
        // Clear existing markers
        this.roomsMissingMarkers.forEach(marker => {
            map.removeLayer(marker);
        });
        this.roomsMissingMarkers = [];

        // Recalculate missing rooms
        let roomsMissing = Object.keys(this.roomInfo.rooms);
        for (let pointId in this.points) {
            let rtag = this.getTag(pointId, "room");
            if (rtag != undefined) {
                roomsMissing = roomsMissing.filter(r => r != rtag);
            }
        }

        // Add markers for missing rooms
        for (let roomId of roomsMissing) {
            let room = this.roomInfo.rooms[roomId];
            if (room) {
                let marker = L.marker([room.latlng.lat, room.latlng.lng], {
                    title: room.rName,
                    icon: L.divIcon({
                        className: 'room-marker',
                        html: `<div style="background-color: red; color: white; padding: 5px; border-radius: 5px; pointer-events: none;">${room.rName}</div>`,
                        iconSize: [100, 30],
                        iconAnchor: [50, 15]
                    }),
                    interactive: false // Make marker clickthrough
                });

                this.roomsMissingMarkers.push(marker);
                map.addLayer(marker);
            } else {
                console.warn("Room not found:", roomId);
            }
        }
    }


    setupMouseHandlers() {
        this.canvas.addEventListener("pointermove", (e) => {
            if (!["mouse", "pen"].includes(e.pointerType)) { return; }
            if (this.currentlyMovingView) return;
            this.mousePosition.x = e.offsetX;
            this.mousePosition.y = e.offsetY;
            let pointLng = map.containerPointToLatLng(L.point(e.clientX, e.clientY));
            this.mousePosition.lat = pointLng.lat;
            this.mousePosition.lng = pointLng.lng;

            if (this.currentDo === "addLine") {
            } else if (this.currentDo === "movePoint") {
                if (this.currentlyMovingPointId) {
                    this.points[this.currentlyMovingPointId] = {
                        ...this.points[this.currentlyMovingPointId],
                        ...this.mousePosition
                    }
                }
            } else if (this.currentDo === "remove") {
                //remove nearest point or line
                this.updateNearestPoint();
                if (this.nearestPointId) {
                    delete this.points[this.nearestPointId];
                    this.lines = this.lines.filter(line => line.start !== this.nearestPointId && line.end !== this.nearestPointId);
                    this.saveData();
                    this.nearestPointId = null;
                } else {
                    //remove nearest line
                    let nearestLineIndex = null;
                    let nearestDistance = Infinity;
                    for (let i = 0; i < this.lines.length; i++) {
                        let line = this.lines[i];
                        let startPoint = this.points[line.start];
                        let endPoint = this.points[line.end];
                        if (startPoint && endPoint) {
                            let distance = distanceToLine(
                                this.mousePosition.x, this.mousePosition.y,
                                startPoint.x, startPoint.y,
                                endPoint.x, endPoint.y
                            );
                            if (distance < nearestDistance) {
                                nearestDistance = distance;
                                nearestLineIndex = i;
                            }
                        }
                    }
                    if (nearestLineIndex !== null && nearestDistance < 10) {
                        this.lines.splice(nearestLineIndex, 1);
                        this.saveData();
                    }
                }
            } else if (this.currentDo === "addRoom") {
                this.addRoomNearestRoom = undefined;
                let nearestDistance = Infinity;
                for (let room of Object.values(this.roomInfo.rooms)) {
                    let distance = Math.sqrt(
                        Math.pow(room.pX - this.mousePosition.x, 2) +
                        Math.pow(room.pY - this.mousePosition.y, 2)
                    );
                    if (distance < nearestDistance) {
                        this.addRoomNearestRoom = room;
                        nearestDistance = distance;
                    }
                }
                if (nearestDistance > 50) {
                    this.addRoomNearestRoom = undefined;
                }
            } else if (this.currentDo === "removeFastRoomConnection") {
                console.log("Removing fast room connection");
                //get nearest fast room connection
                let nearestDistance = Infinity;
                let nearestConnection = null;
                for (let connection of this.fastRoomConnections) {
                    let distance = distanceToLine(
                        this.mousePosition.x, this.mousePosition.y,
                        connection.startPos.x, connection.startPos.y,
                        connection.endPos.x, connection.endPos.y
                    );
                    if (distance < nearestDistance) {
                        nearestConnection = connection;
                        nearestDistance = distance;
                    }
                }
                if (nearestDistance > 20) {
                    console.log("No fast room connection found nearby: ", nearestDistance);
                    return;
                }
                console.log("Removing fast room connection:", nearestConnection);
                this.fastRoomConnections = this.fastRoomConnections.filter(c => c !== nearestConnection);
                this.saveData();
            }
            this.redrawCanvas();
        });

        this.canvas.addEventListener("pointerdown", (event) => {
            if (!["mouse", "pen"].includes(event.pointerType)) { return; }
            if (this.currentlyMovingView) return;
            if (event.button !== 0) return; // Only handle left mouse button
            map.dragging.disable();
            event.preventDefault();
            event.stopPropagation();
            if (this.isUsingFastRoom) {
                if (!event.shiftKey && !event.ctrlKey && this.currentDo == "none") {
                    this.startRoomArea = null;
                    let pos = [Math.round(this.mousePosition.x / this.fastRoomAreaDownscale), Math.round(this.mousePosition.y / this.fastRoomAreaDownscale),];
                    let posidx = pos[0] + pos[1] * this.fastRoomImg.width;
                    for (let i in this.fastRoomData) {
                        //fastRoomData: Uint8Array
                        // for (let el of this.fastRoomData[i]) {
                        //     if (el[0] === pos[0] && el[1] === pos[1]) {
                        //         this.startRoomArea = i;
                        //         break;
                        //     }
                        // }
                        if (this.fastRoomData[i].has(posidx)) {
                            this.startRoomArea = i;
                            break;
                        }
                    }
                    console.log("Start room area:", this.startRoomArea);
                    this.startPos = {
                        x: this.mousePosition.x,
                        y: this.mousePosition.y,
                    };
                    this.currentDo = "addFastRoomConnection";
                } else if (event.ctrlKey) {
                    //remove fast room connection
                    console.log("Removing fast room connection");
                    this.currentDo = "removeFastRoomConnection";
                }
                return;
            }
            if (event.shiftKey) {
                //move point
                this.updateNearestPoint();
                if (this.nearestPointId) {
                    this.currentDo = "movePoint";
                    this.currentlyMovingPointId = this.nearestPointId;
                } else {
                }
            } else if (event.ctrlKey) {
                this.currentDo = "remove"
            } else {
                this.currentDo = "addLine";
                if (this.nearestPointId) {
                    this.addlinestart = this.nearestPointId;
                    this.linestartIsNew = false;
                } else {
                    let nearestLine = this.getNearestLine();
                    if (!nearestLine) {
                        this.addlinestart = this.createPoint(this.mousePosition);
                        this.linestartIsNew = true;
                    }
                    else {
                        let startPoint = nearestPointOnLine(
                            this.mousePosition.x, this.mousePosition.y,
                            this.points[nearestLine.start].x, this.points[nearestLine.start].y,
                            this.points[nearestLine.end].x, this.points[nearestLine.end].y
                        );
                        let tolng = pxToLatLng(this.corners, startPoint.x, startPoint.y, this.canvas.width, this.canvas.height);
                        this.addlinestart = this.createPoint({
                            x: startPoint.x,
                            y: startPoint.y,
                            lat: tolng.lat,
                            lng: tolng.lng
                        });

                        //remove nearestLine from this.lines
                        let nearestLineIndex = this.lines.indexOf(nearestLine);
                        if (nearestLineIndex === -1) {
                            console.warn("Nearest line not found in lines array:", nearestLine);
                            return;
                        }
                        this.lines.splice(nearestLineIndex, 1);

                        this.lines.push({
                            start: nearestLine.start,
                            end: this.addlinestart,
                        });
                        this.lines.push({
                            start: nearestLine.end,
                            end: this.addlinestart,
                        });

                        this.linestartIsNew = true;
                    }
                }
                this.redrawCanvas();
            }
        });

        this.canvas.addEventListener("pointerup", (event) => {
            if (!["mouse", "pen"].includes(event.pointerType)) { return; }
            if (this.currentlyMovingView) return;
            if (event.button !== 0) return; // Only handle left mouse button
            map.dragging.enable();
            event.preventDefault();
            event.stopPropagation();
            if (this.isUsingFastRoom) {
                if (this.currentDo === "addFastRoomConnection") {
                    this.endRoomArea = null;
                    let pos = [Math.round(this.mousePosition.x / this.fastRoomAreaDownscale), Math.round(this.mousePosition.y / this.fastRoomAreaDownscale),];
                    let posidx = pos[0] + pos[1] * this.fastRoomImg.width;
                    for (let i in this.fastRoomData) {
                        //fastRoomData: Uint8Array
                        // for (let el of this.fastRoomData[i]) {
                        //     if (el[0] === pos[0] && el[1] === pos[1]) {
                        //         this.startRoomArea = i;
                        //         break;
                        //     }
                        // }
                        if (this.fastRoomData[i].has(posidx)) {
                            this.endRoomArea = i;
                            break;
                        }
                    }
                    console.log("End room area:", this.endRoomArea);

                    // if (this.startRoomArea == this.endRoomArea) {
                    //     this.startRoomArea = null;
                    //     this.endRoomArea = null;
                    //     this.currentDo = "none";
                    //     return
                    // }

                    if (!this.startRoomArea || !this.endRoomArea) {
                        console.warn("Start or end room area not set:", this.startRoomArea, this.endRoomArea);
                        this.startRoomArea = null;
                        this.endRoomArea = null;
                        this.currentDo = "none";
                        return;
                    }

                    let endPos = { x: this.mousePosition.x, y: this.mousePosition.y }
                    this.fastRoomConnections.push({
                        start: parseInt(this.startRoomArea),
                        end: parseInt(this.endRoomArea),
                        startPos: this.startPos,
                        endPos: endPos,
                    });
                    this.redrawCanvas();
                    this.saveData();
                    this.currentDo = "none";
                }
                if (this.currentDo === "removeFastRoomConnection") {
                    this.currentDo = "none";
                }
                this.calculateFastRoomPoints()
                return;
            }
            if (this.currentDo === "addLine") {
                this.currentDo = "none";
                /*let newPointId = this.nearestPointId || this.createPoint(this.mousePosition);
                */
                let newPointId
                if (this.nearestPointId) {
                    newPointId = this.nearestPointId;
                } else {
                    let nearestLine = this.getNearestLine();
                    if (!nearestLine) {
                        newPointId = this.createPoint(this.mousePosition);
                    } else {
                        let npOnLine = nearestPointOnLine(
                            this.mousePosition.x, this.mousePosition.y,
                            this.points[nearestLine.start].x, this.points[nearestLine.start].y,
                            this.points[nearestLine.end].x, this.points[nearestLine.end].y
                        );

                        let tolng = pxToLatLng(this.corners, npOnLine.x, npOnLine.y, this.canvas.width, this.canvas.height);
                        newPointId = this.createPoint({
                            x: npOnLine.x,
                            y: npOnLine.y,
                            lat: tolng.lat,
                            lng: tolng.lng
                        });

                        let nearestLineIndex = this.lines.indexOf(nearestLine);
                        if (nearestLineIndex === -1) {
                            console.warn("Nearest line not found in lines array:", nearestLine);
                            return;
                        }
                        this.lines.splice(nearestLineIndex, 1);

                        this.lines.push({
                            start: nearestLine.start,
                            end: newPointId,
                        });
                        this.lines.push({
                            start: nearestLine.end,
                            end: newPointId,
                        });
                    }
                }
                if (this.addlinestart !== newPointId) {
                    let lineExists = this.lines.some(line =>
                        (line.start === this.addlinestart && line.end === newPointId) ||
                        (line.start === newPointId && line.end === this.addlinestart)
                    );

                    if (!lineExists) {
                        //check if the line intersects with any existing line
                        let intersects = false;
                        let intersectionPoint = null;
                        let intersectingLine = null;

                        for (let line of this.lines) {
                            let startPoint = this.points[line.start];
                            let endPoint = this.points[line.end];
                            if (startPoint && endPoint) {
                                let intersection = linesIntersect(startPoint, endPoint, this.points[this.addlinestart], this.points[newPointId])
                                if (intersection) {
                                    let intersectionP = getLinesIntersection(startPoint, endPoint, this.points[this.addlinestart], this.points[newPointId])
                                    if (intersectionP != null) {
                                        // check if intersectionP is not too close to the start or end points
                                        let distToStart = Math.sqrt(
                                            Math.pow(intersectionP.x - this.points[this.addlinestart].x, 2) +
                                            Math.pow(intersectionP.y - this.points[this.addlinestart].y, 2)
                                        );
                                        let distToEnd = Math.sqrt(
                                            Math.pow(intersectionP.x - this.points[newPointId].x, 2) +
                                            Math.pow(intersectionP.y - this.points[newPointId].y, 2)
                                        );
                                        if (distToStart < 3 || distToEnd < 3) {
                                            console.warn("Intersection point too close to start or end point, skipping intersection:", intersectionP, "Start:", this.points[this.addlinestart], "End:", this.points[newPointId]);
                                            continue;
                                        }
                                        intersects = true;
                                        let lng = pxToLatLng(this.corners, intersectionP.x, intersectionP.y, this.canvas.width, this.canvas.height);
                                        intersectionPoint = { ...intersectionP, "lat": lng.lat, "lng": lng.lng };
                                        intersectingLine = line;
                                        break;
                                    }
                                };
                            }
                        }


                        if (!intersects) {
                            this.lines.push({
                                start: this.addlinestart,
                                end: newPointId,
                            });
                            this.saveData();
                        } else {
                            let newIntersectionPointId = this.createPoint(intersectionPoint);
                            this.lines.push({
                                start: this.addlinestart,
                                end: newIntersectionPointId,
                            });
                            this.lines.push({
                                start: newPointId,
                                end: newIntersectionPointId,
                            });

                            let intersectingLineIndex = this.lines.indexOf(intersectingLine);
                            if (intersectingLineIndex == -1) {
                                console.warn("Intersecting line not found in lines array:", intersectingLine);
                                return;
                            }
                            this.lines.splice(intersectingLineIndex, 1);
                            this.lines.push({
                                start: intersectingLine.start,
                                end: newIntersectionPointId,
                            });
                            this.lines.push({
                                start: intersectingLine.end,
                                end: newIntersectionPointId,
                            });
                        }
                    }
                }
                this.linestartIsNew = undefined;
                this.redrawCanvas();
            }
            else if (this.currentDo === "movePoint") {
                this.currentDo = "none";
                this.currentlyMovingPointId = null;
                this.redrawCanvas();
                this.saveData();
            }
            else if (this.currentDo === "remove") {
                this.currentDo = "none";
                this.redrawCanvas();
            }
        });
    }
    setupKeyboardHandlers() {
        document.addEventListener("keydown", (event) => {
            if (event.key === " ") {
                this.currentlyMovingView = true;
                this.canvas.style.cursor = "grabbing";
            }
            if (event.key === "Escape") {
                if (this.currentDo === "addLine") {
                    this.currentDo = "none";
                    if (this.linestartIsNew) {
                        delete this.points[this.addlinestart];
                    }
                    this.linestartIsNew = undefined;
                    this.addlinestart = null;
                    this.redrawCanvas();
                }
                else if (this.currentDo === "addRoom") {
                    this.addRoomNearestRoom = undefined;
                    this.currentDo = "none";
                    this.redrawCanvas();
                }
            }
            if (event.key === "e" && this.currentDo === "none") {
                this.updateNearestPoint();
                if (this.nearestPointId) {
                    this.addRoomTo = this.nearestPointId
                    this.addRoomNearestRoom = undefined;
                    this.currentDo = "addRoom";
                }
            }
        });

        document.addEventListener("keyup", (event) => {
            if (event.key === " ") {
                this.currentlyMovingView = false;
                this.canvas.style.cursor = "";
            }
            if (event.key === "e") {
                if (this.addRoomNearestRoom) {
                    this.setTag(this.addRoomTo, "room", this.addRoomNearestRoom.rName);
                    // If roomsMissingMarkers are active, recalculate them
                    if (this.roomsMissingMarkers && this.roomsMissingMarkers.length > 0) {
                        this.recalculateRoomsMissingMarkers();
                    }
                }
                this.addRoomNearestRoom = undefined;
                this.currentDo = "none";
                this.redrawCanvas();
            }
        });

        document.addEventListener("keypress", (event) => {
            switch (event.key) {
                case "m":
                    //stair
                    this.updateNearestPoint();
                    if (this.nearestPointId) {
                        let nval = this.getTag(this.nearestPointId, "stair") != true;
                        this.points[this.nearestPointId].levelChangeTodo = nval;
                        this.setTag(this.nearestPointId, "elevator", false);
                        this.setTag(this.nearestPointId, "stair", nval);
                    }
                    this.redrawCanvas();
                    this.saveData();
                    break;
                case "M":
                    // elevator
                    this.updateNearestPoint();
                    if (this.nearestPointId) {
                        let nval = this.getTag(this.nearestPointId, "elevator") != true;
                        this.points[this.nearestPointId].levelChangeTodo = nval;
                        this.setTag(this.nearestPointId, "stair", false);
                        this.setTag(this.nearestPointId, "elevator", nval);
                    }
                    this.redrawCanvas();
                    this.saveData();
                    break;
                case "p":
                    this.updateNearestPoint();
                    if (this.nearestPointId) {
                        this.setTag(this.nearestPointId, "private", this.getTag(this.nearestPointId, "private") != true);
                    }
                    this.redrawCanvas();
                    break;
                case "a":
                    let nearestLine = this.getNearestLine();
                    if (nearestLine) {
                        // add tag to the line
                        this.setLineTag(nearestLine, "accessible", this.getLineTag(nearestLine, "accessible") != true);
                        this.redrawCanvas();
                    }
                    break;
                case "l":
                    let nearestLine2 = this.getNearestLine();
                    if (nearestLine2) {
                        // add tag to the line
                        this.setLineTag(nearestLine2, "locked", this.getLineTag(nearestLine2, "locked") != true);
                        this.redrawCanvas();
                    }
                    break;
                case "o":
                    //mark point as outside
                    this.updateNearestPoint();
                    if (this.nearestPointId) {
                        this.setTag(this.nearestPointId, "outside", this.getTag(this.nearestPointId, "outside") != true);
                    }
                    this.redrawCanvas();
                    break;
                case "c":
                    if (this.roomsMissingMarkers && this.roomsMissingMarkers.length > 0) {
                        // Clear existing markers
                        this.roomsMissingMarkers.forEach(marker => {
                            map.removeLayer(marker);
                        });
                        this.roomsMissingMarkers = [];
                        return;
                    }
                    //mark all missing rooms.
                    let roomsMissing = Object.keys(this.roomInfo.rooms)
                    for (let pointId in this.points) {
                        let rtag = this.getTag(pointId, "room")
                        if (rtag != undefined) {
                            roomsMissing = roomsMissing.filter(r => r != rtag)
                        }
                    }
                    this.roomsMissingMarkers = [];
                    for (let roomId of roomsMissing) {
                        let room = this.roomInfo.rooms[roomId];
                        if (room) {
                            console.log("Adding marker for missing room:", roomId, room);
                            let marker = L.marker([room.latlng.lat, room.latlng.lng], {
                                title: room.rName,
                                icon: L.divIcon({
                                    className: 'room-marker',
                                    html: `<div style="background-color: red; color: white; padding: 5px; border-radius: 5px; pointer-events: none;">${room.rName}</div>`,
                                    iconSize: [100, 30],
                                    iconAnchor: [50, 15]
                                }),
                                interactive: false // Make marker clickthrough
                            });

                            this.roomsMissingMarkers.push(marker);
                            map.addLayer(marker);
                        } else {
                            console.warn("Room not found:", roomId);
                        }
                    }
                    break;
                case "u":
                    // add tag: unlikely to line
                    let nearestLine3 = this.getNearestLine();
                    if (nearestLine3) {
                        this.setLineTag(nearestLine3, "unlikely", this.getLineTag(nearestLine3, "unlikely") != true);
                    }
                    this.redrawCanvas();
                    break;
                case "f":
                    //change floor we are currently working on
                    selected_floor = prompt("target Floor")
                    setFloor(selected_floor);
                    location.reload();
                    break;
                case "i":
                    this.startAiGenerator();
                case "F":
                    // toggle fast room usage
                    this.isUsingFastRoom = !this.isUsingFastRoom;
                    if (this.isUsingFastRoom) {
                        this.calculateFastRoomAreas();
                    }
                    break;
                case "H":
                    // hightlight fast room areas
                    if (!this.isUsingFastRoom) return;
                    if (this.currentDo == "highlightRoomAreas") {
                        this.currentDo = "none";
                    } else if (this.currentDo == "none") {
                        this.currentDo = "highlightRoomAreas";
                        this.drawCurrentRoomAreas();
                    }
                    break;
                case "C":
                    // calculate fast room points
                    this.calculateFastRoomPoints();
                    break;
                default:
                    return; // Ignore other keys
            }
        });
    }
    drawCurrentRoomAreas() {
        if (!this.isUsingFastRoom) return;
        const ctx = this.canvas.getContext("2d");
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Assign a random color to each area
        const areaColors = {};
        for (let i in this.fastRoomData) {
            // Generate a random pastel color
            const hue = Math.floor(Math.random() * 360);
            areaColors[i] = `hsl(${hue}, 70%, 80%)`;
        }

        // Draw each area
        for (let i in this.fastRoomData) {
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = areaColors[i];
            for (let idx of this.fastRoomData[i]) {
                const x = idx % this.fastRoomImg.width;
                const y = Math.floor(idx / this.fastRoomImg.width);
                ctx.fillRect(x * this.fastRoomAreaDownscale, y * this.fastRoomAreaDownscale, this.fastRoomAreaDownscale, this.fastRoomAreaDownscale);
            }
            ctx.restore();
        }
    }

    calculateFastRoomPoints() {
        if (!this.isUsingFastRoom) return;


        //remove all lines with tag "fastRoomConnection"
        this.lines = this.lines.filter(line => !line.tags || !line.tags.fastRoomConnection);
        for (let pointId in this.points) {
            if (this.points[pointId].tags && this.points[pointId].tags.fastRoomConnection) {
                delete this.points[pointId];
            }
        }

        console.log("Calculating fast room points...");
        let i = 0;
        for (let conn of this.fastRoomConnections) {
            conn.id = i++;
        }

        let pointsToConnect = {}
        //add points and lines to connect fast room areas where a this.fastRoomConnections says a connection exists
        for (let area in this.fastRoomData) {
            area = parseInt(area);
            let connectionsToHere = this.fastRoomConnections.filter(c => c.start === area || c.end === area);
            if (connectionsToHere.length == 0) {
                continue;
            }
            //console.log("Found connections to area:", area, connectionsToHere);
            let newPoints = [];
            for (let conn of connectionsToHere) {
                if (conn.start == area) {
                    newPoints.push({ x: conn.startPos.x, y: conn.startPos.y, id: conn.id });
                }
                if (conn.end == area) {
                    newPoints.push({ x: conn.endPos.x, y: conn.endPos.y, id: conn.id });
                }
            }
            let pointsOfThisArea = [];
            for (let point of newPoints) {
                //get lat lng of the point
                let latlng = pxToLatLng(this.corners, point.x, point.y, this.canvas.width, this.canvas.height);
                let newPointId = this.createPoint({
                    x: point.x,
                    y: point.y,
                    lat: latlng.lat,
                    lng: latlng.lng,
                    tags: { "fastRoomConnection": true, "fastRoomId": point.id },
                    noSave: true,
                });
                pointsToConnect[point.id] = pointsToConnect[point.id] || [];
                pointsToConnect[point.id].push(newPointId);
                pointsOfThisArea.push({
                    x: point.x,
                    y: point.y,
                    id: newPointId,
                });
            }

            //find the best path between all pointsOfThisArea, to then connect them together with a few lines

            let bs = bestLine(pointsOfThisArea);
            //console.log("Best line found:", bs);
            for (let conn of bs) {
                this.lines.push({
                    start: conn.start,
                    end: conn.end,
                    tags: { "fastRoomConnection": true }
                });
            }



            let roomsToConnect = []
            for (let room of Object.values(this.roomInfo.rooms)) {
                let roomIdx = Math.round(room.pX / this.fastRoomAreaDownscale) + Math.round(room.pY / this.fastRoomAreaDownscale) * this.fastRoomImg.width;
                //if roomPos in this area
                if (this.fastRoomData[area].has(roomIdx)) {
                    roomsToConnect.push(room);
                }
            }

            for (let room of roomsToConnect) {
                let nearestpoint = null;
                let nearestDistance = Infinity;
                for (let point of pointsOfThisArea) {
                    let distance = Math.sqrt(
                        Math.pow(room.pX - point.x, 2) +
                        Math.pow(room.pY - point.y, 2)
                    );
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestpoint = point.id;
                    }
                }
                if (nearestpoint !== null) {
                    this.points[nearestpoint].tags = this.points[nearestpoint].tags || {};
                    this.points[nearestpoint].tags["room"] = room.rName;
                }
            }
        }

        for (let e of Object.keys(pointsToConnect)) {
            if (pointsToConnect[e].length < 2) continue; // we need at least two points to connect
            for (let i = 0; i < pointsToConnect[e].length - 1; i++) {
                let startPoint = pointsToConnect[e][i];
                let endPoint = pointsToConnect[e][i + 1];
                this.lines.push({
                    start: startPoint,
                    end: endPoint,
                    tags: { "fastRoomConnection": true }
                });
            }
        }

        //reduce points, that are within 10px of each other to one point by updating this.points, this.lines
        this.reduceNearbyPoints(nearbyPointsReductionDistance * this.fastRoomAreaDownscale);

        this.optimizeLineAngles(
            this.lines.filter(line => line.tags && line.tags.fastRoomConnection),
            Object.values(this.points).filter(point => point.tags && point.tags.fastRoomConnection),
            15
        );
        this.reduceNearbyPoints(nearbyPointsReductionDistance * this.fastRoomAreaDownscale);
        this.optimizeSubLines();

        console.log("Fast room points calculated:");
        this.redrawCanvas();
    }

    optimizeLineAngles(lines, points, angleThreshold = 15) {
        console.log("Optimizing line angles", lines, points, angleThreshold);

        function calculateAngle(line) {
            let startPoint = this.points[line.start];
            let endPoint = this.points[line.end];
            let dx = endPoint.x - startPoint.x;
            let dy = endPoint.y - startPoint.y;
            return Math.atan2(dy, dx) * (180 / Math.PI);
        }
        calculateAngle = calculateAngle.bind(this);

        function normalizeAngle(angle) {
            while (angle < 0) angle += 360;
            while (angle >= 360) angle -= 360;
            return angle;
        }


        //angle score: the higher the score, the more the lines deviate from having 90° multiples between each other
        function calculateAngleScore(pointid) {
            let connectedLines = lines.filter(line => line.start === pointid || line.end === pointid);
            if (connectedLines.length < 2) return 0; // Need at least 2 lines to check angles between them

            let angles = connectedLines.map(calculateAngle);
            angles = angles.map(normalizeAngle);
            let totalScore = 0;

            // Primary focus: ensure lines are at 90° multiples to each other
            for (let i = 0; i < angles.length; i++) {
                for (let j = i + 1; j < angles.length; j++) {
                    let angleDiff = Math.abs(angles[i] - angles[j]);
                    // Normalize angle difference to 0-180 range
                    if (angleDiff > 180) angleDiff = 360 - angleDiff;

                    // Find the closest multiple of 90° (0°, 90°, 180°)
                    let deviationFrom0 = Math.abs(angleDiff - 0);    // Parallel lines
                    let deviationFrom90 = Math.abs(angleDiff - 90);  // Perpendicular lines
                    let deviationFrom180 = Math.abs(angleDiff - 180); // Opposite parallel lines

                    let minDeviationFrom90Multiple = Math.min(deviationFrom0, deviationFrom90, deviationFrom180);

                    // Weight this heavily as it's our primary goal
                    totalScore += minDeviationFrom90Multiple * 2.0;
                }
            }

            // Secondary focus: align individual lines to cardinal directions (0°, 90°, 180°, 270°)
            // But weight this less than the inter-line relationships
            for (let angle of angles) {
                let minDistanceToCardinal = Math.min(
                    Math.abs(angle - 0),
                    Math.abs(angle - 90),
                    Math.abs(angle - 180),
                    Math.abs(angle - 270),
                    Math.abs(angle - 360) // 360° is same as 0°
                );

                // Also check wrapped angles for edge cases
                minDistanceToCardinal = Math.min(
                    minDistanceToCardinal,
                    Math.abs((angle + 360) % 360 - 0),
                    Math.abs((angle + 360) % 360 - 90),
                    Math.abs((angle + 360) % 360 - 180),
                    Math.abs((angle + 360) % 360 - 270)
                );

                // Weight cardinal alignment less than inter-line orthogonality
                totalScore += minDistanceToCardinal * 0.3;
            }

            return totalScore;
        }

        // Optimize points to align with 90-degree angles - slow gradient over longer period
        for (let bigIteration = 0; bigIteration < 5; bigIteration++) { // Increased from 3 to 5 for more gradual optimization
            for (let point of points) {
                for (let iteration = 0; iteration < 8; iteration++) { // Increased from 6 to 8 for finer steps
                    // Store original position
                    let originalX = this.points[point.id].x;
                    let originalY = this.points[point.id].y;

                    let currentScore = calculateAngleScore(point.id);

                    // Much smaller initial change for gradual optimization
                    let valchange = 2 * this.fastRoomAreaDownscale; // Reduced from 5 to 2
                    // More gradual reduction in change size
                    valchange /= (1 + (iteration * 0.5) + (bigIteration * 2)); // Slower reduction rate

                    // Ensure minimum movement threshold to avoid getting stuck
                    valchange = Math.max(valchange, 0.1 * this.fastRoomAreaDownscale);

                    let changes = [
                        [originalX + valchange, originalY],
                        [originalX - valchange, originalY],
                        [originalX, originalY + valchange],
                        [originalX, originalY - valchange],
                        [originalX + valchange, originalY + valchange],
                        [originalX - valchange, originalY - valchange],
                        [originalX + valchange, originalY - valchange],
                        [originalX - valchange, originalY + valchange],
                        // Add smaller diagonal movements for finer adjustment
                        [originalX + valchange * 0.5, originalY + valchange * 0.5],
                        [originalX - valchange * 0.5, originalY - valchange * 0.5],
                        [originalX + valchange * 0.5, originalY - valchange * 0.5],
                        [originalX - valchange * 0.5, originalY + valchange * 0.5],
                        [originalX, originalY], // Keep original as option
                    ];

                    let bestChange = null;
                    let bestScore = currentScore;

                    for (let change of changes) {
                        // Temporarily set new position
                        this.points[point.id].x = change[0];
                        this.points[point.id].y = change[1];

                        let newScore = calculateAngleScore(point.id);
                        if (newScore < bestScore) {
                            bestScore = newScore;
                            bestChange = { x: change[0], y: change[1] };
                        }
                    }

                    if (bestChange) {
                        // Apply the best change and update position for next iteration
                        this.points[point.id].x = bestChange.x;
                        this.points[point.id].y = bestChange.y;

                        // Early exit if improvement is very small (convergence)
                        let improvement = currentScore - bestScore;
                        if (improvement < 0.1) {
                            break;
                        }
                    } else {
                        // No improvement found, restore original position
                        this.points[point.id].x = originalX;
                        this.points[point.id].y = originalY;
                        break; // Exit early if no improvement
                    }
                }
            }

            // Log progress for debugging
            if (bigIteration % 2 === 0) {
                console.log(`Line angle optimization: completed ${bigIteration + 1}/5 major iterations`);
            }
        }
    }

    optimizeSubLines() {
        function calculateAngle(line) {
            let startPoint = this.points[line.start];
            let endPoint = this.points[line.end];
            let dx = endPoint.x - startPoint.x;
            let dy = endPoint.y - startPoint.y;
            return Math.atan2(dy, dx) * (180 / Math.PI);
        }

        // if a point only has two lines connected to it, and both lines almost have a 180°/0° angle, 
        // and both lines have a fastRoomConnection tag but dont have any other tags. 
        // remove the point, and only make one long line
        let pointsToRemove = [];

        for (let pointId in this.points) {
            let point = this.points[pointId];
            if (!point || !point.tags || !point.tags.fastRoomConnection || Object.keys(point.tags).length !== 1) continue;

            let connectedLines = this.lines.filter(line => (line.start === pointId || line.end === pointId) && line.tags && line.tags.fastRoomConnection && Object.keys(line.tags).length === 1);
            if (connectedLines.length !== 2) continue; // We need exactly two lines

            let line1 = connectedLines[0];
            let line2 = connectedLines[1];

            let angle1 = calculateAngle.call(this, line1);
            let angle2 = calculateAngle.call(this, line2);

            // Calculate the absolute difference between angles
            let angleDiff = Math.abs(angle1 - angle2);
            // Normalize to 0-180 range
            if (angleDiff > 180) angleDiff = 360 - angleDiff;

            // If the angles are almost 180° apart (nearly straight line), merge them
            const straightLineThreshold = 10; // degrees
            if (Math.abs(angleDiff - 180) <= straightLineThreshold) {
                // Get the other endpoints of the two lines
                let otherPoint1 = line1.start === pointId ? line1.end : line1.start;
                let otherPoint2 = line2.start === pointId ? line2.end : line2.start;

                // Create a new line connecting the two other endpoints
                let newLine = {
                    start: otherPoint1,
                    end: otherPoint2,
                    tags: { fastRoomConnection: true }
                };

                // Store the changes to apply later (to avoid modifying arrays while iterating)
                pointsToRemove.push({
                    pointId: pointId,
                    linesToRemove: [line1, line2],
                    lineToAdd: newLine
                });
            }
        }

        // Apply the changes
        for (let change of pointsToRemove) {
            // Remove the old lines
            for (let lineToRemove of change.linesToRemove) {
                let index = this.lines.indexOf(lineToRemove);
                if (index !== -1) {
                    this.lines.splice(index, 1);
                }
            }

            // Add the new line
            this.lines.push(change.lineToAdd);

            // Remove the point
            delete this.points[change.pointId];
        }

        console.log(`Optimized ${pointsToRemove.length} sub-lines`);
    }

    async calculateFastRoomAreas() {
        if (!this.isUsingFastRoom) return;
        if (this.fastRoomData && this.fastRoomData.length > 0) {
            console.log("Fast room areas already calculated.");
            return;
        }

        this.fastRoomAreaDownscale = fastRoomDownscaleBuilding[this.building] || 1;

        let localfsr = await storage.getFastRoomData(this.building, this.floorData.id);
        if (localfsr) {
            this.fastRoomData = [];
            let sets = 0;
            // let existingNums = new Set();
            for (let i of localfsr) {
                // if (!existingNums.has(i)) {
                //     existingNums.add(i);
                // }
                i = parseInt(i);
                if (i > sets) {
                    sets = i;
                }
            }
            console.log("Found", sets, "sets in local fast room data.");
            // console.log(existingNums)
            for (let i = 0; i <= sets; i++) {
                i = "" + i;
                this.fastRoomData[i] = new Set();
            }
            for (let i in localfsr) {
                let el = localfsr[i];
                // el = el;
                if (el !== undefined && el !== null) {
                    this.fastRoomData[el].add(parseInt(i));
                }
            }

            this.fastRoomImg = {
                width: Math.round(this.floorimg.width / this.fastRoomAreaDownscale),
                height: Math.round(this.floorimg.height / this.fastRoomAreaDownscale),
            }
            return;
        }


        console.log("Calculating fast room areas...");

        this.fastRoomData = [];

        let { width, height } = this.floorimg;
        const imgCanvas = document.createElement("canvas");
        imgCanvas.width = Math.round(width / this.fastRoomAreaDownscale);
        imgCanvas.height = Math.round(height / this.fastRoomAreaDownscale);

        width = imgCanvas.width;
        height = imgCanvas.height;

        this.fastRoomImg = imgCanvas;

        const ctx = imgCanvas.getContext("2d");
        ctx.drawImage(this.floorimg, 0, 0, imgCanvas.width, imgCanvas.height);
        //ctx.filter = "blur(2px)";
        ctx.drawImage(imgCanvas, 0, 0);

        const imgData = ctx.getImageData(0, 0, imgCanvas.width, imgCanvas.height);
        const data = imgData.data;
        const visited = new Uint8Array(imgCanvas.width * imgCanvas.height); // 1 byte per pixel instead of Uint32

        function floodfill(startX, startY, r, g, b) {
            const stack = [[startX, startY]];
            const area = new Set();

            while (stack.length > 0) {
                const [x, y] = stack.pop();
                if (x < 0 || x >= width || y < 0 || y >= height) continue;

                const idx = (y * width + x);
                const pixelIdx = idx * 4;
                if (visited[idx]) continue;

                const pr = data[pixelIdx];
                const pg = data[pixelIdx + 1];
                const pb = data[pixelIdx + 2];

                if (pr !== r || pg !== g || pb !== b) continue;

                visited[idx] = 1;
                area.add(idx);

                stack.push([x + 1, y]);
                stack.push([x - 1, y]);
                stack.push([x, y + 1]);
                stack.push([x, y - 1]);
            }

            return area;
        }

        for (let y = 0; y < height; y++) {
            console.log("Processing row:", y, "/", height);
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x);
                //if (visited[idx]) continue;

                const pixelIdx = idx * 4;
                const r = data[pixelIdx];
                const g = data[pixelIdx + 1];
                const b = data[pixelIdx + 2];

                //if (r === 255 && g === 255 && b === 255) continue; // Skip white pixels

                const area = floodfill(x, y, r, g, b);
                //if (area.size === 0) continue; // Skip empty areas
                if (area.size < 10) continue; // Skip small areas
                //console.log("Floodfill area found:", area.size, "pixels at position:", x, y);
                this.fastRoomData.push(area);
            }
        }

        console.log("Fast room areas calculated:", this.fastRoomData.length, "areas found.");

        console.log("saving fast room data...");
        let output = [];
        // Pre-allocate array size for better performance
        let maxIndex = 0;
        for (let setKey in this.fastRoomData) {
            for (let intkey of this.fastRoomData[setKey]) {
                if (intkey > maxIndex) maxIndex = intkey;
            }
        }
        output = new Array(maxIndex + 1);
        console.log("Pre-allocated output array of size:", output.length);

        // Use for...in instead of Object.keys() and batch processing
        for (let setKey in this.fastRoomData) {
            const setKeyNum = setKey; // Keep as string since that's what's expected
            const currentSet = this.fastRoomData[setKey];
            for (let intkey of currentSet) {
                output[intkey] = setKeyNum;
            }
        }
        console.log("Fast room data output length:", output.length);
        storage.setFastRoomData(output, this.building, this.floorData.id)

        this.recalcAreaAssociations();
    }

    recalcAreaAssociations() {
        function getArea(px, py) {
            px = Math.round(px / this.fastRoomAreaDownscale);
            py = Math.round(py / this.fastRoomAreaDownscale);
            let posidx = px + py * this.fastRoomImg.width;
            for (let i in this.fastRoomData) {
                if (this.fastRoomData[i].has(posidx)) {
                    return parseInt(i);
                }
            }
            return null;
        }

        for (let i in this.fastRoomConnections) {
            this.fastRoomConnections[i].start = getArea.call(this, this.fastRoomConnections[i].startPos.x, this.fastRoomConnections[i].startPos.y);
            this.fastRoomConnections[i].end = getArea.call(this, this.fastRoomConnections[i].endPos.x, this.fastRoomConnections[i].endPos.y);
        }
    }

    async startAiGenerator() {
        let bodyDiv = document.createElement("div");
        //set style to styletext
        let bodyStyle = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow-y: auto;
        `
        bodyDiv.style = bodyStyle;
        let p = document.createElement("p");
        p.innerText = "Generating doorways, this may take a while...\n";
        p.style = "color: white; font-size: 20px; text-align: center;background-color: rgba(0, 0, 0, 0.8); padding: 20px; border-radius: 10px;";
        bodyDiv.appendChild(p)
        document.body.appendChild(bodyDiv);
        let respObj = await fetch("http://localhost:3030/generateDoorways", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                building: this.building,
                floor: this.floorData.id
            })
        })

        //respObj is a stream, we need to read it
        if (!respObj.ok) {
            console.error("Error generating doorways:", respObj.statusText);
            alert("Error generating doorways: " + respObj.statusText);
            document.body.removeChild(bodyDiv);
            return;
        }
        const reader = respObj.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
                const chunk = decoder.decode(value, { stream: !done });
                p.innerText += chunk;
                console.log("Received chunk:", chunk);
                //scroll bodyDiv to bottom
                bodyDiv.scrollTop = bodyDiv.scrollHeight;
            }
        }
        p.innerText = "Doorway generation completed. Loading results...";
        let imgUrl = `http://localhost:3030/getImages/${this.building}/${this.floorData.id}`;
        let img = new Image();
        img.src = imgUrl;
        img.onload = () => {
            this.overlayImg = img;
            this.redrawCanvas();
            document.body.removeChild(bodyDiv);
            alert("Doorway generation completed. Check the canvas for results.");
        };
    }
}



async function startRoutingCreation(building, floorData, corners, canvas, floorimg, canvasRotation, roomInfo) {
    let routingGenerator = new RoutingGenerator(building, floorData, corners, canvas, floorimg, canvasRotation, roomInfo);
    await routingGenerator.start();
    window.currentRoutingGenerator = routingGenerator;
    console.log("Routing creation started for building:", building, "floor:", floorData.id);
}

async function loadFloor(building, floor) {
    let canvas = document.createElement("canvas");
    canvas.height = 600;
    canvas.width = 600;
    let ctx = canvas.getContext("2d");
    ctx.fillStyle = "magenta";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "30px Arial";
    ctx.fillStyle = "white";
    ctx.fillText(`Building: ${building}`, 10, 50);
    ctx.fillText(`Floor: ${floor}`, 10, 100);

    let floorsData = await (await fetch(`/data/${building}/uniqueBuildingParts.json`).catch(e => {
        alert("Building not found")
        return
    })).json().catch(e => {
        alert("Error loading building data")
        return
    })
    if (floorsData == undefined) {
        resetLayer()
        return
    }
    let floorData = undefined;
    for (let floorkeys of Object.keys(floorsData)) {
        let floor = floorsData[floorkeys]
        if (floor.level == selected_floor) {
            floorData = floor
            floorData.id = floorkeys
            break
        }
    }
    if (floorData == undefined) {
        alert("Floor not found")
        resetLayer()
        return
    }
    let corners = (await getCorners(building, floorData.id)).poly;
    console.log("Corners:", corners)

    //rooms/latlng/g003001.json
    let roomInfo = await (await fetch(`/data/${building}/rooms/latlng/${floorData.id}.json`)).json().catch(e => {
        console.error("Error loading room data:", e);
        alert("Error loading room data")
        return
    });
    if (Object.keys(HIDDEN_BUILDING_WATCHER).includes(building)) {
        for (let otherbuildingid of HIDDEN_BUILDING_WATCHER[building]) {
            let otherbuildingParts = await (await fetch(`/data/${otherbuildingid}/uniqueBuildingParts.json`)).json().catch(e => {
                console.error("Error loading other building data:", e);
                alert("Error loading other building data")
                return
            });
            if (otherbuildingParts == undefined) {
                continue
            }
            for (let otherfloorkeys of Object.keys(otherbuildingParts)) {
                let otherfloor = otherbuildingParts[otherfloorkeys];
                if (otherfloor.level == selected_floor) {
                    let otherroomsData = await (await fetch(`/data/${otherbuildingid}/rooms/latlng/${otherfloorkeys}.json`)).json().catch(e => {
                        console.error("Error loading other room data:", e);
                        alert("Error loading other room data")
                        return
                    });
                    if (otherroomsData == undefined) {
                        continue
                    }
                    let otherrooms = otherroomsData.rooms;
                    // Merge room data
                    console.log(`Merging rooms from ${otherbuildingid} into ${building} (${Object.keys(otherrooms).length} rooms)`);
                    for (let roomId of Object.keys(otherrooms)) {
                        if (!roomInfo.rooms[roomId]) {
                            console.log(`Merging room ${roomId} from ${otherbuildingid}`);
                            roomInfo.rooms[roomId] = otherrooms[roomId];
                        } else {
                            console.warn(`Room ${roomId} already exists in roomInfo, skipping merge.`);
                        }
                    }
                }
            }
        }
    }

    if (roomInfo == undefined) {
        alert("Error loading room data")
        return
    }
    map.fitBounds([
        [corners.bottomLeft.lat, corners.bottomLeft.lng], // Southwest
        [corners.topRight.lat, corners.topRight.lng]      // Northeast
    ], {
        padding: [50, 50],
        animate: false,
    });

    map.removeControl(map.zoomControl);

    //set img to the canvas
    let floorimgurl = `/data/${building}/clear/${floorData.id}.png`;
    let floorimg = new Image();
    floorimg.src = floorimgurl;
    let canvasRotation;
    floorimg.onload = () => {
        canvas.width = floorimg.width;
        canvas.height = floorimg.height;
        ctx.fillStyle = "magenta";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(floorimg, 0, 0);
        console.log("Image loaded:", floorimgurl);

        map.setView(map.getCenter(), map.getZoom() + 1, {
            animate: false
        });
        map.invalidateSize();

        startRoutingCreation(building, floorData, corners, canvas, floorimg, canvasRotation, roomInfo);
    };

    let overlay = L.imageOverlay.rotated(
        //canvas as image#
        canvas,
        L.latLng(corners.topLeft.lat, corners.topLeft.lng),
        L.latLng(corners.topRight.lat, corners.topRight.lng),
        L.latLng(corners.bottomLeft.lat, corners.bottomLeft.lng),
        {
            opacity: 0.9,
            interactive: true,
            //lmu attribution
            attribution: `&copy; <a href='https://www.lmu.de'>Ludwig-Maximilians-Universität München</a> | Floor: ${floorData.level} | Building: ${building}`,
        }
    )
    overlay.addTo(map);
}

loadFloor(building, selected_floor)