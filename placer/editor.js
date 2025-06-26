class Helper {
    constructor(parent) {
        this.parent = parent;
    }
    rotatePoints(center, points, yaw) {
        const map = this.parent.map;
        const res = []
        const centerPoint = map.latLngToLayerPoint(center)
        const angle = yaw * (Math.PI / 180)
        for (let i = 0; i < points.length; i++) {
            const p = map.latLngToLayerPoint(points[i])
            // translate to center
            const p2 = new L.Point(p.x - centerPoint.x, p.y - centerPoint.y)
            // rotate using matrix rotation
            const p3 = new L.Point(Math.cos(angle) * p2.x - Math.sin(angle) * p2.y, Math.sin(angle) * p2.x + Math.cos(angle) * p2.y)
            // translate back to center
            let p4 = new L.Point(p3.x + centerPoint.x, p3.y + centerPoint.y)
            // done with that point
            p4 = map.layerPointToLatLng(p4)
            res.push(p4)
        }
        return res
    }

    calculatePoly(img, currentSize, center, roatation) {
        let width = img.width;
        let height = img.height;
        //normalize widht,height to 100m
        let mwh = width > height ? width : height;
        width = width / mwh * currentSize;
        height = height / mwh * currentSize;
        let bounds1 = center.toBounds(width);
        let bounds2 = center.toBounds(height);

        let corner1 = new L.LatLng(
            bounds2.getSouthWest().lat,
            bounds1.getSouthWest().lng,
        )
        let corner2 = new L.LatLng(
            bounds2.getNorthEast().lat,
            bounds1.getNorthEast().lng,
        )
        let bounds = new L.LatLngBounds(corner1, corner2)

        var poly1 = [
            [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
            [bounds.getSouthEast().lat, bounds.getSouthEast().lng],
            [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
            [bounds.getNorthWest().lat, bounds.getNorthWest().lng]
        ];
        poly1 = this.rotatePoints(center, poly1, roatation)
        return poly1;
    }
}

const HIDDEN_BUILDING_WATCHER = {
    "bw0000": ["bw0040"],
    "bw0070": ["bw0073"],
    "bw0120": ["bw0110", "bw0121", "bw0122"],
    "bw0800": ["bw0801"],
    "bw0822": ["bw0820"],
    "bw1120": ["bw1110"],
    "bw1509": ["bw1502"],
    "bw1540": ["bw1541"],
}

class MapHandler {
    constructor() {
        this.map = L.map('map', {
            keyboard: false,

            layers: Object.values(this.getLayers()),
        });
        var layerControl = L.control.layers(this.getLayers(), []).addTo(this.map);
        this.lastImgs = [];
        this.before = undefined;
        this.helper = new Helper(this);
    }
    getLayers() {
        if (this.layers) {
            return this.layers;
        }
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
        this.layers = {
            "satelite": satelite,
            "osm": osm,
        }
        return this.layers;
    }
    async getBuilingParts(buildingid) {
        return await (await fetch(`data/${buildingid}/uniqueBuildingParts.json`)).json()
    }
    async make(building, buildingParts) {
        this.before = undefined;
        this.map.setView([building.lat, building.lng], 18);
        for (let part in buildingParts) {
            await this.makePart(building, part, buildingParts[part]);
        }
    }

    getImage(url) {
        return new Promise((resolve, reject) => {
            let img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(err);
            img.src = url;
        });
    }
    async getPartRotation(buildingcode, part) {
        return await (await fetch(`/data/${buildingcode}/rotation/${part}.json`)).json()
    }

    async makeGhost(partDataUrl, part, building) {
        let partData = await (await fetch(partDataUrl)).json()

        let imgrotation = -(await this.getPartRotation(building.code, part));
        let currentSize = partData["size"]
        let rotation = partData["rotation"]
        let center = L.latLng(partData["center"]["lat"], partData["center"]["lng"])

        let imageUrl = `/data/${building.code}/clear/${part}.png`;
        let img = await this.getImage(imageUrl);
        let poly1 = this.helper.calculatePoly(img, currentSize, center, rotation + imgrotation);

        var overlay = L.imageOverlay.rotated(imageUrl, poly1[3], poly1[2], poly1[0], {
            opacity: 0.6,
            interactive: true,
            draggable: true,
            attribution: "&copy; <a href='http://www.lmu.de'>LMU</a>"
        }).addTo(this.map);
        this.lastImgs.push(overlay);
        if (this.lastImgs.length > 6) {
            this.map.removeLayer(this.lastImgs[0])
            this.lastImgs.shift()
        }
        this.before = {
            "rotation": rotation,
            "size": currentSize,
            "center": center,
            "img": {
                "width": img.width,
                "height": img.height
            }
        }
    }

    async makePart(building, part, uniquePartData) {
        let partDataUrl = `/data/${building.code}/polyInfo/${part}_mapInfo.json`;

        let partData = undefined
        if (await (await fetch(`/exists${partDataUrl}`)).json() == true) {
            await this.makeGhost(partDataUrl, part, building);
            //this.makeGhost(partDataUrl, part, building);
            return;
        }


        //check if the building is hidden and if so, copy the data from the watcher
        let hiddenBuildingWatcher = undefined;
        for (let hiddenBuildingsWatcher of Object.keys(HIDDEN_BUILDING_WATCHER)) {
            let hiddenBuildings = HIDDEN_BUILDING_WATCHER[hiddenBuildingsWatcher];
            if (hiddenBuildings.includes(building.code)) {
                alert(`${building.code} is hidden. copying data from ${hiddenBuildingsWatcher}`);
                hiddenBuildingWatcher = hiddenBuildingsWatcher;
            }
        }
        if (hiddenBuildingWatcher == undefined) {
            //check if the building is a watcher
            if (Object.keys(HIDDEN_BUILDING_WATCHER).includes(building.code)) {
                alert(`${building.code} is a watcher. check if there is a hidden building to copy data from.`);
                for (let hiddenBuildings of HIDDEN_BUILDING_WATCHER[building.code]) {
                    //check if http://localhost:3015/exists/data/bw1540/polyInfo/ returns true
                    if (await (await fetch(`/exists/data/${hiddenBuildings}/polyInfo/`)).json() == true) {
                        alert(`Found hidden building ${hiddenBuildings} for watcher ${building.code}. Copying data from it.`);
                        hiddenBuildingWatcher = hiddenBuildings;
                        break;
                    }
                }
            }
        }
        if (hiddenBuildingWatcher != undefined && confirm(`Building ${building.code} is hidden. Do you want to copy the data from ${hiddenBuildingWatcher}?`)) {
            let watcherParts = await this.getBuilingParts(hiddenBuildingWatcher);
            let watcherPart = undefined;
            for (let watcherPartin of Object.keys(watcherParts)) {
                if (watcherParts[watcherPartin].level == uniquePartData.level) {
                    watcherPart = watcherPartin;
                    break;
                }
            }
            if (watcherPart == undefined) {
                alert(`No watcher part found for ${hiddenBuildingWatcher} and part ${part}, level ${uniquePartData.level}. Please move the part manually.`);

            } else {
                let buildingWatcherPartDataUrl = `/data/${hiddenBuildingWatcher}/polyInfo/${watcherPart}_mapInfo.json`;
                if (await (await fetch(`/exists${buildingWatcherPartDataUrl}`)).json() == true) {
                    //copy the data from the watcher part
                    let partDataUrl = `/data/${building.code}/polyInfo/${part}_mapInfo.json`;

                    console.log(`Copying data from ${buildingWatcherPartDataUrl} to ${partDataUrl}`);
                    let watcherPartData = await (await fetch(buildingWatcherPartDataUrl)).json();
                    await fetch("/save" + partDataUrl, {
                        method: "POST",
                        body: JSON.stringify(watcherPartData),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                    //copy the rotation from the watcher part
                    let watcherPartRotation = await this.getPartRotation(hiddenBuildingWatcher, watcherPart);
                    await fetch(`/save/data/${building.code}/rotation/${part}.json`, {
                        method: "POST",
                        body: JSON.stringify(watcherPartRotation),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });

                    //now make the ghost
                    await this.makeGhost(partDataUrl, part, building);
                    return;
                } else {
                    alert(`No data found for ${hiddenBuildingWatcher} and part ${part}, ${watcherPart} ${buildingWatcherPartDataUrl}. Please move the part manually.`);
                }
            }
        }


        let keylistener = this.keylistener.bind(this);
        let mouseMove = this.mouseMove.bind(this);
        document.addEventListener("keydown", keylistener);
        document.addEventListener("mousemove", mouseMove);
        this.pointmovemarkers = [];
        await new Promise((resolve) => {
            this.resolve = resolve;
            this.editor(partDataUrl, part, building)
        });
        this.overlaydraggable.disable();
        document.removeEventListener("keydown", keylistener);
        document.removeEventListener("mousemove", mouseMove);
    }

    async editor(partDataUrl, part, building) {
        this.building = building;
        this.part = part;
        let marker = L.marker([building.lat, building.lng]).addTo(this.map);
        let imageUrl = `/data/${building.code}/clear/${part}.png`;
        this.img = await this.getImage(imageUrl);
        this.currentSize = 100; // 100m
        this.rotation = 0; // 0 degrees
        this.center = L.latLng(building.lat, building.lng);
        this.imgrotation = -(await this.getPartRotation(building.code, part));

        if (this.before != undefined) {
            this.currentSize = this.before["size"]
            this.rotation = this.before["rotation"]
            this.center = L.latLng(this.before["center"]["lat"], this.before["center"]["lng"])
        }

        let poly1 = this.helper.calculatePoly(this.img, this.currentSize, this.center, this.rotation + this.imgrotation);

        this.overlay = L.imageOverlay.rotated(imageUrl, poly1[3], poly1[2], poly1[0], {
            opacity: 0.6,
            interactive: true,
            draggable: true,
            attribution: "&copy; <a href='http://www.lmu.de'>LMU</a>"
        }).addTo(this.map);

        this.lastImgs.push(this.overlay);
        if (this.lastImgs.length > 6) {
            this.map.removeLayer(this.lastImgs[0])
            this.lastImgs.shift()
        }
        this.overlaydraggable = new L.Draggable(this.overlay._image);
        this.overlaydraggable.enable();

        this.overlaydraggable.on("dragend", this.dragEvent.bind(this));
    }

    dragEvent(event) {
        console.log(event)
        let start = event.sourceTarget._startPos
        let end = event.sourceTarget._newPos
        let diff = [end.x - start.x, end.y - start.y]
        let cordsDiff = { x: diff[0], y: diff[1] }
        let centerPoints = L.CRS.EPSG3857.latLngToPoint(this.center, this.map.getZoom())
        console.log(centerPoints)
        let newCords = L.point(centerPoints.x + cordsDiff.x, centerPoints.y + cordsDiff.y)
        this.center = L.CRS.EPSG3857.pointToLatLng(newCords, this.map.getZoom())

        let poly1 = this.helper.calculatePoly(this.img, this.currentSize, this.center, this.rotation + this.imgrotation)
        this.overlay.reposition(poly1[3], poly1[2], poly1[0])
    }

    mouseMove(e) {
        this.currentMouseEvent = e;
    }

    save() {
        // finish
        this.before = {
            "rotation": this.rotation,
            "size": this.currentSize,
            "center": this.center,
            "img": {
                "width": this.img.width,
                "height": this.img.height
            }
        }
        fetch(`/save/data/${this.building.code}/polyInfo/${this.part}_mapInfo.json`,
            {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "rotation": this.rotation,
                    "size": this.currentSize,
                    "center": {
                        "lat": this.center.lat,
                        "lng": this.center.lng
                    }
                })
            }
        )
        this.overlay.setOpacity(0.3)
        for (let marker of this.pointmovemarkers) {
            this.map.removeLayer(marker);
        }
        this.pointmovemarkers = [];
        console.log("finish")
        this.resolve()
    }

    keylistener(e) {
        console.log(e.key)
        if (e.key == "e") {
            this.rotation += 10
        } else if (e.key == "q") {
            this.rotation -= 10
        } else if (e.key == "a") {
            this.rotation -= 0.5
        } else if (e.key == "d") {
            this.rotation += 0.5
        } else if (e.key == "w") {
            this.currentSize += 0.5
        } else if (e.key == "W") {
            this.currentSize += 5
        } else if (e.key == "s") {
            this.currentSize -= 0.5
        } else if (e.key == "S") {
            this.currentSize -= 5
        } else if (e.key == " ") {
            this.save()
            return;
        } else if (e.key == "p") {
            if (this.pointmovemarkers.length >= 2) {
                for (let marker of this.pointmovemarkers) {
                    this.map.removeLayer(marker);
                }
                this.pointmovemarkers = [];
                return
            }
            //add a dragable marker to the map, where the mouse is
            let mousePos = this.map.mouseEventToLatLng(this.currentMouseEvent);
            let marker = L.marker(mousePos, {
                draggable: true,
                autoPan: true,
            }).addTo(this.map);
            marker.startLatLng = mousePos;
            marker.on("drag", ((marker, e) => {
                let newLatLng = e.target.getLatLng();
                if (!this._dragInit) return;

                if (this.pointmovemarkers.length == 1) {
                    let diff = {
                        lat: newLatLng.lat - marker.startLatLng.lat,
                        lng: newLatLng.lng - marker.startLatLng.lng
                    };
                    this.center = L.latLng(
                        this._dragInit.center.lat + diff.lat,
                        this._dragInit.center.lng + diff.lng
                    );
                    let poly1 = this.helper.calculatePoly(this.img, this.currentSize, this.center, this.rotation + this.imgrotation);
                    this.overlay.reposition(poly1[3], poly1[2], poly1[0]);
                } else if (this.pointmovemarkers.length == 2 && this._dragInit.startLatLngs) {
                    let map = this.map;
                    // Use initial positions for calculation
                    let pos1 = map.latLngToLayerPoint(this._dragInit.startLatLngs[0]);
                    let pos2 = map.latLngToLayerPoint(this._dragInit.startLatLngs[1]);
                    let newPos1 = map.latLngToLayerPoint(this.pointmovemarkers[0].getLatLng());
                    let newPos2 = map.latLngToLayerPoint(this.pointmovemarkers[1].getLatLng());

                    let origVec = [pos2.x - pos1.x, pos2.y - pos1.y];
                    let newVec = [newPos2.x - newPos1.x, newPos2.y - newPos1.y];

                    let origAngle = Math.atan2(origVec[1], origVec[0]);
                    let newAngle = Math.atan2(newVec[1], newVec[0]);
                    let angleDiff = (newAngle - origAngle) * (180 / Math.PI);
                    this.rotation = this._dragInit.rotation + angleDiff;

                    let origDist = Math.sqrt(Math.pow(origVec[0], 2) + Math.pow(origVec[1], 2));
                    let newDist = Math.sqrt(Math.pow(newVec[0], 2) + Math.pow(newVec[1], 2));
                    if (origDist > 0) {
                        this.currentSize = this._dragInit.currentSize * (newDist / origDist);
                    }

                    let center = map.latLngToLayerPoint(this._dragInit.center);
                    let centerDiff = L.point(
                        ((newPos1.x - pos1.x) + (newPos2.x - pos2.x)) / 2,
                        ((newPos1.y - pos1.y) + (newPos2.y - pos2.y)) / 2
                    );
                    let newCenter = L.point(center.x + centerDiff.x, center.y + centerDiff.y);
                    this.center = map.layerPointToLatLng(newCenter);

                    let poly1 = this.helper.calculatePoly(this.img, this.currentSize, this.center, this.rotation + this.imgrotation);
                    this.overlay.reposition(poly1[3], poly1[2], poly1[0])
                }
                // Do NOT update marker.startLatLng here
            }).bind(this, marker));

            // Add dragend event to update startLatLng after drag is finished
            marker.on("dragend", ((marker, e) => {
                marker.startLatLng = marker.getLatLng();
            }).bind(this, marker));

            // Add dragstart event to store initial state
            marker.on("dragstart", ((marker, e) => {
                if (!this._dragInit) this._dragInit = {};
                this._dragInit.center = this.center.clone ? this.center.clone() : L.latLng(this.center.lat, this.center.lng);
                this._dragInit.rotation = this.rotation;
                this._dragInit.currentSize = this.currentSize;
                // For two markers, store their initial positions
                if (this.pointmovemarkers.length === 2) {
                    this._dragInit.startLatLngs = [
                        this.pointmovemarkers[0].startLatLng,
                        this.pointmovemarkers[1].startLatLng
                    ];
                }
            }).bind(this, marker));

            this.pointmovemarkers.push(marker);
            return;
        } else if (e.key == "o") {
            //move to point
            if (this.pointmovemarkers.length == 0) {
                alert("You need to add a point first with 'p'!")
                return;
            }
            if (this.pointmovemarkers.length == 1) {
                let point = this.pointmovemarkers[0].getLatLng();
                this.map.setView(point, this.map.getZoom());
            }
            if (this.pointmovemarkers.length == 2) {
                this.currentSelectedPoint = (this.currentSelectedPoint + 1) % 2;
                if (isNaN(this.currentSelectedPoint)) {
                    this.currentSelectedPoint = 0;
                }
                let point = this.pointmovemarkers[this.currentSelectedPoint].getLatLng();
                this.map.setView(point, this.map.getZoom());
            }
        }
        // arrow keys to move the image
        let moveMult = 0.1;
        if (e.shiftKey) {
            moveMult = 1;
        } else if (e.ctrlKey) {
            moveMult = 0.01;
        }
        if (e.key == "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            this.center.lat += 0.0001 * moveMult;
        } else if (e.key == "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            this.center.lat -= 0.0001 * moveMult;
        } else if (e.key == "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            this.center.lng -= 0.0001 * moveMult;
        } else if (e.key == "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            this.center.lng += 0.0001 * moveMult;
        }
        console.log(this.rotation)
        let poly1 = this.helper.calculatePoly(this.img, this.currentSize, this.center, this.rotation + this.imgrotation)
        this.overlay.reposition(poly1[3], poly1[2], poly1[0])
    }

}


const SKIP_DEBUG = 82;
const mapHandler = new MapHandler();

(async () => {
    window.buildings = await (await fetch("/data_buildingsJSON.json")).json()
    let buildings = window.buildings;
    //put all buildings where buildings["code"] is in Object.keys(HIDDEN_BUILDING_WATCHER) at the start of the array
    buildings = buildings.sort((a, b) => {
        if (Object.keys(HIDDEN_BUILDING_WATCHER).includes(a.code) && !Object.keys(HIDDEN_BUILDING_WATCHER).includes(b.code)) {
            return -1;
        }
        if (!Object.keys(HIDDEN_BUILDING_WATCHER).includes(a.code) && Object.keys(HIDDEN_BUILDING_WATCHER).includes(b.code)) {
            return 1;
        }
        return 0;
    });

    let i = 0;
    for (let building of buildings) {
        i++;
        console.log(`Processing building ${i}/${buildings.length}: ${building.code}`);
        if (i < SKIP_DEBUG) {
            continue;
        }
        //await make(building, await getBuilingParts(building["code"]))
        await mapHandler.make(building, await mapHandler.getBuilingParts(building["code"]))
    }
    alert("YOU ARE DONE")
})()