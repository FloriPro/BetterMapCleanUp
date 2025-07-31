let osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 30,
    maxNativeZoom: 19,
    minZoom: 0,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
})
let map = L.map('map', {
    layers: [osm],
});

function addRoutingData(routingLayer, floorData, lineColor, listener, connectedMarkers) {
    let routingData = floorData.routing;
    for (let line of routingData.lines) {
        let start = routingData.points[line["start"]];
        let end = routingData.points[line["end"]];

        line["tags"] = line["tags"] || {};

        if (!start || !end) {
            console.log(line)
            console.warn(`Skipping line ${line} due to missing points`);
            continue;
        }

        let polyline = L.polyline([L.latLng(start.lat, start.lng), L.latLng(end.lat, end.lng)], {
            color: lineColor,
            weight: 7,
            opacity: 1,
            smoothFactor: 1
        });

        polyline.addTo(routingLayer);
    }

    for (let pointid of Object.keys(routingData.points)) {
        let point = routingData.points[pointid];
        point.tags = point.tags || {};
        let marker = L.marker(L.latLng(point.lat, point.lng), {
            icon: L.divIcon({
                className: 'routing-point',
                html: `<div class="routing-point [classList]" style="width:10px;height:10px"></div>`,
                iconSize: [10, 10]
            })
        });
        if (point.levelChangeTodo) {
            //image /routing/img/arrowBoth.png
            marker.options.icon.options.html = marker.options.icon.options.html.replace("[classList]", "levelChangeTodo [classList]");
            /*marker.setIcon(L.divIcon({
                className: 'routing-point',
                html: `<div class="routing-point [classList]" style="background-image: url('/routing/img/arrowBoth.png'); width: 10px; height: 10px; background-size: cover;"></div>`,
                iconSize: [10, 10]
            }));*/
            // check if point is already connected
            let found = false;
            for (let markerData of connectedMarkers) {
                [markerData.points[0], markerData.points[1]].forEach((connectedPoint) => {
                    if (connectedPoint.id == point.id && connectedPoint.level == floorData.level) {
                        found = true;
                    }
                });
            }
            if (!found) {
                //add marked color
                marker.options.icon.options.html = marker.options.icon.options.html.replace("[classList]", "noLevelChange [classList]");
            } else {
                marker.options.icon.options.html = marker.options.icon.options.html.replace("[classList]", "hasLevelChange [classList]");
            }
            //on click
            marker.on('click', function () {
                listener.markerClicked({
                    point: point,
                    floorData: floorData,
                });
            });
        }
        marker.options.icon.options.html = marker.options.icon.options.html.replace("[classList]", "");
        marker.addTo(routingLayer);
    }
}

L.Control.Layers.include({
    getOverlays: function () {
        // create hash to hold all layers
        var control, layers;
        layers = {};
        control = this;

        // loop thru all layers in control
        control._layers.forEach(function (obj) {
            var layerName;

            // check if layer is an overlay
            // get name of overlay
            layerName = obj.name;
            // store whether it's present on the map or not
            return layers[layerName] = control._map.hasLayer(obj.layer);
        });

        return layers;
    }
});

let legend = L.control({ position: 'bottomleft' });
legend.onAdd = function (map) {
    let div = L.DomUtil.create('div', 'legend');
    let data = {
        "#00ff00": "Routing Above",
        "#ff0000": "Routing",
        "#0000ff": "Routing Below"
    }

    let labels = [];
    for (let color in data) {
        labels.push(
            '<i class="circle" style="background:' + color + '"></i> ' +
            (data[color] ? data[color] : '+'));
    }
    div.innerHTML = labels.join('<br>');
    return div;
};
legend.addTo(map);

// BuildingMapLoader.js
// Refactored into a class with clear, reusable methods.
// Usage example (assuming you have a global Leaflet `map`):
// const loader = new BuildingMapLoader(map);
// loader.load();

const doSync = true;

class BuildingMapLoader {
    constructor(map) {
        this.map = map;
        // Define the logical order of levels from top to bottom
        this.levelsOrder = [
            "OG 06",
            "OG 05",
            "OG 04",
            "OG 03",
            "OG 02 Z",
            "OG 02",
            "OG 01 Z",
            "OG 01",
            "EG Z",
            "EG",
            "UG 01",
            "UG 02",
        ];

        this.editListener = {
            markerClicked: this.markerClicked.bind(this)
        };

        // Prepare a Leaflet layer‑control (will be populated later)
        this.controls = L.control.layers(null, {}, { collapsed: false });

        if (doSync) {
            this.bc = new BroadcastChannel("routing_sync");
            this.bc.onmessage = this.recieveMessage.bind(this);
            this.createListener();
            this.movedBecauseOfSync = false;
        }
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
        if (data.action === "getPosition") {
            let center = map.getCenter();
            let zoom = map.getZoom();
            this.updatePosition(zoom, center.lat, center.lng);
        }
    }

    createListener() {
        function upd() {
            if (this.movedBecauseOfSync) {
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
    updatePosition(zoom, lat, lng) {
        if (this.movedBecauseOfSync) {
            return;
        }
        let data = {
            "action": "updatePosition",
            "building": this.building,
            "pos": {
                "zoom": zoom,
                "lat": lat,
                "lng": lng
            }
        }

        this.bc.postMessage(data);
    }

    /**
     * Main entry point: prompts for a building ID, fetches data, and renders everything on the map.
     */
    async load() {
        const building = await this.promptBuildingId();
        if (!building) return; // user canceled
        this.building = building;

        const floorsData = await this.fetchFloorsData(building);
        let floorLevelsStr = this.extractFloorLevels(floorsData);
        this.floorLevels = await this.fetchRoutingForFloors(floorLevelsStr, building);
        console.log(this.floorLevels);

        this.connectedMarkers = [];
        await this.loadConnectedMarkers();
        this.repositionConnectedMarkers()

        this.buildControls(this.floorLevels);

        // Finalize the map view & controls
        this.controls.addTo(this.map);
        this.map.setView([48.14899315841645, 11.580760594532162], 16);
        this.map.removeControl(this.map.zoomControl);

        //mouse move listener
        /*this.map.on('mousemove', (e) => {
            this.mouseLatLng = e.latlng;
            this.mouseMove()
        });*/
        document.querySelector("#map").addEventListener("pointermove", (e) => {
            //only mouse and pen
            if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
            this.mouseLatLng = this.map.mouseEventToLatLng(e);
            this.mouseMove();
        });

        this.addKeyPressListener()
    }

    saveConnectedMarkers() {
        return fetch(`/save/data/${this.building}/routing/connectedMarkers.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(this.connectedMarkers)
        });
    }
    loadConnectedMarkers() {
        return fetch(`/data/${this.building}/routing/connectedMarkers.json`)
            .then(response => {
                if (!response.ok) throw new Error("Connected markers not found");
                return response.json();
            })
            .then(data => {
                this.connectedMarkers = data || [];
            })
            .catch(error => {
                console.error("Error loading connected markers:", error);
                this.connectedMarkers = [];
            });
    }

    /**
     * Prompt the user for a building ID (defaults to "bw0000").
     */
    async promptBuildingId() {
        let building = prompt("Building id (bw0000)", "bw0000");
        if (building === null) return null; // user hit cancel
        if (building.trim() === "") building = "bw0000";
        return building.trim();
    }

    /**
     * Download the unique building parts file and parse JSON.
     */
    async fetchFloorsData(building) {
        const response = await fetch(`/data/${building}/uniqueBuildingParts.json`);
        if (!response.ok) throw new Error("Building not found");
        return response.json();
    }

    /**
     * Convert raw floor data into an ordered array of { floor, level } objects.
     */
    extractFloorLevels(floorsData) {
        return Object.entries(floorsData)
            .map(([floor, data]) => ({ floor, level: data.level }))
            .sort(
                (a, b) =>
                    this.levelsOrder.indexOf(a.level) - this.levelsOrder.indexOf(b.level)
            );
    }

    /**
     * For each floor, fetch its routing file (lines + points). Missing files yield empty routing objects.
     */
    async fetchRoutingForFloors(floorLevels, building) {
        return Promise.all(
            floorLevels.map(async (f) => {
                try {
                    const res = await fetch(`/data/${building}/routing/${f.floor}.json`);
                    f.routing = await res.json();
                } catch {
                    f.routing = { lines: [], points: [] };
                }
                return f;
            })
        );
    }

    /**
     * Build Leaflet layers for each floor level and register them with the controls.
     */
    buildControls() {
        const undefinedRouting = { routing: { lines: [], points: [] }, level: "" };
        this.routingLayers = {};
        this.floorLevels.forEach((floor, idx) => {
            let floorAbove = this.floorLevels[idx - 1] ?? undefinedRouting;
            let floorBelow = this.floorLevels[idx + 1] ?? undefinedRouting;


            let routingLayer = L.layerGroup();

            // Blue = below, Red = current, Green = above
            if (floorBelow.level.endsWith("Z")) {
                let secondFloorBelow = this.floorLevels[idx + 2] ?? undefinedRouting;
                addRoutingData(routingLayer, secondFloorBelow, "#0000aa", this.editListener, this.connectedMarkers);
            }
            addRoutingData(routingLayer, floorBelow, "#0000ff", this.editListener, this.connectedMarkers);
            addRoutingData(routingLayer, floor, "#ff0000", this.editListener, this.connectedMarkers);
            addRoutingData(routingLayer, floorAbove, "#00ff00", this.editListener, this.connectedMarkers);
            //level ends with Z
            if (floorAbove.level.endsWith("Z")) {
                let secondFloorAbove = this.floorLevels[idx - 2] ?? undefinedRouting;
                addRoutingData(routingLayer, secondFloorAbove, "#00aa00", this.editListener, this.connectedMarkers);
            }

            // Overlay the raster tile map for this level
            const tilemap = this.createTileLayer(floor.level);
            routingLayer.addLayer(tilemap);


            let connectionLayer = L.layerGroup();
            connectionLayer.addTo(routingLayer);

            // Register with the layer control
            this.controls.addBaseLayer(routingLayer, floor.level);
            this.routingLayers[floor.level] = { "routingLayer": routingLayer, "connectionLayer": connectionLayer };
        });
        this.updateConnectedMarkers();
    }

    mouseMove() {
        if (this.markerConnectLine) {
            this.markerConnectLine.setLatLngs([
                this.markerConnectLineStart,
                this.mouseLatLng
            ]);
        }
    }

    updateConnectedMarkers() {
        Object.values(this.routingLayers).forEach((layer) => {
            layer.connectionLayer.clearLayers();
        });
        Object.values(this.connectedMarkers).forEach((marker) => {
            let polyline = L.polyline(marker.points, {
                color: "#ffff00",
                weight: 5,
                opacity: 1,
                smoothFactor: 1
            });
            polyline.addTo(this.routingLayers[marker.points[0].level].connectionLayer);
            let polylineCopy = L.polyline(marker.points, {
                color: "#ffff00",
                weight: 5,
                opacity: 1,
                smoothFactor: 1
            });

            //if marker.points[0].level and marker.points[1].level have another level in between them as described in thislevels
            let thislevels = buildingMapLoader.floorLevels.map(e => e.level)
            let levelIndex0 = thislevels.indexOf(marker.points[0].level);
            let levelIndex1 = thislevels.indexOf(marker.points[1].level);
            let polylineMiddle
            console.log(Math.abs(levelIndex0 - levelIndex1), levelIndex0, levelIndex1, thislevels);
            if (Math.abs(levelIndex0 - levelIndex1) > 1) {
                polylineMiddle = L.polyline(marker.points, {
                    color: "#ffff00",
                    weight: 5,
                    opacity: 1,
                    smoothFactor: 1
                });
                console.log("Adding middle polyline for levels", marker.points[0].level, marker.points[1].level);
                this.routingLayers[thislevels[Math.min(levelIndex0, levelIndex1) + 1]].connectionLayer.addLayer(polylineMiddle);
            }

            [polyline, polylineCopy, polylineMiddle].forEach((polyline) => {
                if (!polyline) return; // skip if polylineMiddle is undefined
                polyline.on('click', () => {
                    console.warn("Marker connect line clicked, removing it");
                    this.connectedMarkers = this.connectedMarkers.filter(m => m !== marker);
                    this.saveConnectedMarkers();
                    this.updateConnectedMarkers();
                });
            });

            polylineCopy.addTo(this.routingLayers[marker.points[1].level].connectionLayer);
        });
    }

    /**
     * Reload routing data for all floors and update the display
     */
    async reloadRoutingData() {
        console.log("Reloading routing data...");
        // Reload routing data for all floors
        this.floorLevels = await this.fetchRoutingForFloors(this.floorLevels, this.building);

        let currentSelectedLayer = null;
        // Check if a layer is currently selected
        //getOverlays() // -> { Truck 1: true, Truck 2: false, Truck 3: false }
        let ols = this.controls.getOverlays();
        console.log("Current overlays:", ols);
        for (let el in ols) {
            if (ols[el]) {
                currentSelectedLayer = el;
            }
        }
        console.log("Current selected layer:", currentSelectedLayer);

        // Reload connected markers
        await this.loadConnectedMarkers();
        this.repositionConnectedMarkers();
        this.updateConnectedMarkers();

        //clear the controls
        this.controls.remove();
        this.map.removeControl(this.controls);
        this.controls = L.control.layers(null, {}, { collapsed: false });
        this.map.addControl(this.controls);

        // Clear existing layers
        Object.values(this.routingLayers).forEach(layer => {
            layer.routingLayer.clearLayers();
        });
        this.routingLayers = {};

        // Rebuild controls with new data
        this.buildControls();

        //select the previously selected layer
        for (let layer of this.controls._layers) {
            if (layer.name === currentSelectedLayer) {
                layer.layer.addTo(this.map);
            }
        }

        console.log("Routing data reloaded successfully!");
    }

    repositionConnectedMarkers() {
        let changed = false;
        this.connectedMarkers.forEach((markers) => {
            markers.points.forEach((point) => {
                for (let level of this.floorLevels) {
                    if (level.floor != point.floor) {
                        continue;
                    }
                    for (let levelpointid of Object.keys(level.routing.points)) {
                        if (levelpointid === point.id) {
                            let levelPoint = level.routing.points[levelpointid];
                            if (point.lat === levelPoint.lat && point.lng === levelPoint.lng) {
                                break; // no change needed
                            }
                            changed = true;
                            point.lat = levelPoint.lat;
                            point.lng = levelPoint.lng;
                            break; // exit the loop once we found the point
                        }
                    }
                }
            });
        });
        if (changed) {
            console.warn("Repositioned connected markers due to changes in routing points");
            this.saveConnectedMarkers();
        }
    }

    addKeyPressListener() {
        document.addEventListener('keydown', (event) => {
            console.log("Key pressed:", event.key);
            switch (event.key) {
                case 'Escape':
                    if (this.markerConnectLine) {
                        console.warn("Escape pressed, removing marker connect line");
                        this.map.removeLayer(this.markerConnectLine);
                        this.markerConnectLine = null;
                        this.markerConnectLineStartPoint = null;
                    }
                    break;
                case 'r':
                case 'R':
                    console.log("Reloading routing data...");
                    this.reloadRoutingData();
                    break;
                case 'o':
                case 'O':
                    //open: "http://localhost:3015/routing?floor={floor}&building={building}"
                    for (let floor of this.floorLevels.sort((a, b) => this.levelsOrder.indexOf(b.level) - this.levelsOrder.indexOf(a.level))) {
                        let url = `http://localhost:3015/routing?floor=${floor.level.replaceAll(" ", "+")}&building=${this.building}&synced=true`;
                        console.log("Opening URL:", url);
                        window.open(url, '_blank');
                    }
                    break;
            }
        });
    }

    markerClicked({ point, floorData }) {
        point.level = floorData.level;
        point.floor = floorData.floor;
        console.log("Marker clicked:", point, floorData);
        if (this.markerConnectLine) {
            if (point.id === this.markerConnectLineStartPoint.id) {
                console.warn("Cannot connect marker to itself");
                this.map.removeLayer(this.markerConnectLine);
                this.markerConnectLine = null;
                this.markerConnectLineStartPoint = null;
                return
            }
            //check if point is already connected
            let found = false;
            for (let marker of this.connectedMarkers) {
                /*if (marker.points[0].id === point.id || marker.points[1].id === point.id) {
                    console.warn("Marker is already connected:", marker);
                    this.map.removeLayer(this.markerConnectLine);
                    this.markerConnectLine = null;
                    this.markerConnectLineStartPoint = null;
                    return;
                }*/
                [[marker.points[0], marker.points[1]], [marker.points[1], marker.points[0]]].forEach((connectedPointPair) => {
                    if (connectedPointPair[0].id === point.id && connectedPointPair[1].id === this.markerConnectLineStartPoint.id && connectedPointPair[0].level === point.level && connectedPointPair[1].level === this.markerConnectLineStartPoint.level) {
                        console.warn("Marker is already connected:", marker);
                        if (this.markerConnectLine) {
                            this.map.removeLayer(this.markerConnectLine);
                            this.markerConnectLine = null;
                        }
                        this.markerConnectLineStartPoint = null;
                        found = true;
                        return;
                    }
                });
            }
            if (found) return;

            this.connectedMarkers.push({
                points: [this.markerConnectLineStartPoint, point],
            });
            this.saveConnectedMarkers();
            this.map.removeLayer(this.markerConnectLine);
            this.markerConnectLine = null;
            this.markerConnectLineStartPoint = null;
            this.updateConnectedMarkers();
        } else {
            this.markerConnectLineStartPoint = point;
            this.markerConnectLineStart = L.latLng(point.lat, point.lng);
            this.markerConnectLine = L.polyline(
                [this.markerConnectLineStart, this.mouseLatLng],
                {
                    color: "#ffff00",
                    weight: 5,
                    opacity: 1,
                    smoothFactor: 1
                }
            )
            this.markerConnectLine.addTo(this.map)
        };
    }

    /**
     * Create a Leaflet tile layer for a given building level.
     */
    createTileLayer(level) {
        return L.tileLayer(
            `https://raumplan.flulu.de/tilesLQ/${level}/{z}/{x}/{y}.png`,
            {
                maxZoom: 30,
                maxNativeZoom: 21,
                minZoom: 12,
            }
        );
    }
}


let buildingMapLoader = new BuildingMapLoader(map);
// Start loading the map
buildingMapLoader.load();