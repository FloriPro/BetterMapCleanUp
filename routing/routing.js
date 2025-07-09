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
    }

    async start() {
        await this.loadOrInitRoutingData();
        this.setupMouseHandlers();
        this.setupKeyboardHandlers();
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
        }
    }

    saveData() {
        this.headerRoutingData = {
            lines: this.lines,
            points: this.points,
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
        this.updateNearestPoint();


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
                this.rotateCtx(this.canvasRotation * (Math.PI / 180), point.x, point.y);
                this.ctx.drawImage(this.arrowBothImg, point.x - 10, point.y - 10, 20, 20);
                this.unrotateCtx();
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

        if (this.nearestPointId) {
            console.log("Nearest point:", this.nearestPointId);
            this.ctx.drawPoint(
                this.points[this.nearestPointId].x,
                this.points[this.nearestPointId].y,
                6,
                "red"
            );
        } else {
            let nearestLine = this.getNearestLine();
            if (nearestLine) {
                let startPoint = this.points[nearestLine.start];
                let endPoint = this.points[nearestLine.end];
                if (startPoint && endPoint) {
                    let nearestPoint = nearestPointOnLine(
                        this.mousePosition.x, this.mousePosition.y,
                        startPoint.x, startPoint.y,
                        endPoint.x, endPoint.y
                    );
                    this.ctx.drawPoint(nearestPoint.x, nearestPoint.y, 6, "#85351c");
                } else {
                    console.warn("Nearest line has undefined points:", nearestLine, startPoint, endPoint);
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
                }
                this.addRoomNearestRoom = undefined;
                this.currentDo = "none";
                this.redrawCanvas();
            }
        });

        document.addEventListener("keypress", (event) => {
            switch (event.key) {
                case "m":
                    this.updateNearestPoint();
                    if (this.nearestPointId) {
                        this.points[this.nearestPointId].levelChangeTodo = !this.points[this.nearestPointId].levelChangeTodo;
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
                default:
                    return; // Ignore other keys
            }
        });
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

    map.setView([48.14899315841645, 11.580760594532162], 16)
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

        //update leaflet (without moving the map)
        map.setView([48.14899315841645, 11.580760594532162], 17, {
            animate: true,
            pan: { duration: 0 }
        });

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