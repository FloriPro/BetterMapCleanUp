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
let empty = L.tileLayer('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAQAAAD2e2DtAAABnElEQVR42u3SQQEAAAQEMJdcdF5S2DIs08VjEUAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAAAQQQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQQAABBEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAABEAAzgLXe38QsfcE+gAAAABJRU5ErkJggg==', {
    maxZoom: 30, maxNativeZoom: 19, minZoom: 0, attribution: ''
})
let layers = {
    //"satelite": satelite,
    //"empty": empty,
    "osm": osm,
}
let map = L.map('map', {
    layers: Object.values(layers),
});
map.removeControl(map.zoomControl);
var layerControl = L.control.layers(layers, []).addTo(map);

let currentSelected = undefined;
let currentSelectedMarker = undefined;
let _currentSelected = undefined;

class imgCache {
    //indexeddb cache if available, else not.
    constructor() {
        this.db = null;
        this.store = null;
    }

    async init() {
        if (!('indexedDB' in window)) {
            return;
        }
        this.db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('imgCache', 1);
            request.onerror = (event) => {
                reject(event.target.error);
            };
            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                db.createObjectStore('images');
            };
        });
    }

    async get(url) {
        //check if in cache, if not fetch and save
        if (!this.db) {
            return URL.createObjectURL(await fetch(url).then((response) => response.blob()));
        }
        let store = this.db.transaction(['images'], 'readwrite').objectStore('images');
        const cached = await new Promise((resolve) => {
            const request = store.get(url);
            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            request.onerror = () => {
                resolve(null);
            };
        });
        if (cached) {
            return URL.createObjectURL(cached);
        }
        const response = await fetch(url);
        const blob = await response.blob();

        if (response.status < 400) {
            //add to cache
            store = this.db.transaction(['images'], 'readwrite').objectStore('images');
            await new Promise((resolve) => {
                const request = store.put(blob, url);
                request.onsuccess = () => {
                    resolve();
                };
                request.onerror = () => {
                    resolve();
                };
            });
        }

        return URL.createObjectURL(blob)
    }
}

function rotatePoints(center, points, yaw) {
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

function mapPointToImageMeh2(img, currentSize, center, roatation, pixelxy) {
    //pixelxy is the pixel in the image. output the matching lat lon position
    let width = img.width;
    let height = img.height;
    //normalize widht,height to 100m
    let mwh = width > height ? width : height;
    width = width / mwh * currentSize;
    height = height / mwh * currentSize;
    let relx = ((pixelxy[0] - (img.width / 2)) / img.width) * 2
    let rely = ((pixelxy[1] - (img.height / 2)) / img.height) * 2
    let boundx = center.toBounds(relx * width);
    let boundy = center.toBounds(rely * height);
    let outlatlng = new L.LatLng(rely > 0 ? boundy.getSouthWest().lat : boundy.getNorthEast().lat, relx < 0 ? boundx.getNorthWest().lng : boundx.getNorthEast().lng,)
    let latlng = rotatePoints(center, [outlatlng], roatation)[0]
    return latlng
}

function mapPointToImage(img, currentSize, center, roatation, pixelxy) {
    //pixelxy is the pixel in the image. output the matching lat lon position
    let width = img.width;
    let height = img.height;
    //normalize widht,height to 100m
    let mwh = width > height ? width : height;
    width = width / mwh * currentSize;
    height = height / mwh * currentSize;
    let bounds1 = center.toBounds(width);
    let bounds2 = center.toBounds(height);

    let corner1 = new L.LatLng(bounds2.getSouthWest().lat, bounds1.getSouthWest().lng,)
    let corner2 = new L.LatLng(bounds2.getNorthEast().lat, bounds1.getNorthEast().lng,)
    let bounds = new L.LatLngBounds(corner1, corner2)

    let a = bounds.getCenter().lat + (bounds.getSouthWest().lat - bounds.getNorthEast().lat) * (pixelxy[1] / img.height - 0.5)
    let b = bounds.getCenter().lng + (bounds.getNorthEast().lng - bounds.getSouthWest().lng) * (pixelxy[0] / img.width - 0.5)
    //map pixelxy to bounds
    let pixleLatLngUnrotated = new L.LatLng(a, b)

    let latlng = rotatePoints(center, [pixleLatLngUnrotated], roatation)[0]

    return latlng
}

function calculatePoly(img, currentSize, center, roatation) {
    let width = img.width;
    let height = img.height;
    //normalize widht,height to 100m
    let mwh = width > height ? width : height;
    width = width / mwh * currentSize;
    height = height / mwh * currentSize;
    let bounds1 = center.toBounds(width);
    let bounds2 = center.toBounds(height);

    let corner1 = new L.LatLng(bounds2.getSouthWest().lat, bounds1.getSouthWest().lng,)
    let corner2 = new L.LatLng(bounds2.getNorthEast().lat, bounds1.getNorthEast().lng,)
    let bounds = new L.LatLngBounds(corner1, corner2)

    var poly1 = [[bounds.getSouthWest().lat, bounds.getSouthWest().lng], [bounds.getSouthEast().lat, bounds.getSouthEast().lng], [bounds.getNorthEast().lat, bounds.getNorthEast().lng], [bounds.getNorthWest().lat, bounds.getNorthWest().lng]];
    poly1 = rotatePoints(center, poly1, roatation)
    return poly1;
}

class _oldGetter {
    async getBuilingParts(buildingid) {
        return await (await fetch(`data/${buildingid}/uniqueBuildingParts.json`)).json()
    }

    async getRooms(buildingid, part) {
        let partRoomsUrl = `/data/${buildingid}/rooms/${part}.json`;
        return await (await fetch(partRoomsUrl)).json()
    }

    async getPartData(buildingid, part) {
        let partDataUrl = `/data/${buildingid}/polyInfo/${part}_mapInfo.json`;
        return await (await fetch(partDataUrl)).json()
    }
}

class _getter {
    constructor() {
        this.waiters = []
    }

    async getData() {
        if (this.fetching) {
            await new Promise(async (resolve, reject) => {
                this.waiters.push(resolve)
            })
            return this.data
        }
        if (this.data != undefined) {
            return this.data
        }
        if (localStorage["lmumap_data.json"] != undefined) {
            try {
                this.data = JSON.parse(localStorage["lmumap_data.json"])
                return this.data
            } catch (e) {
                console.error(e)
            }
        }

        this.fetching = true;
        this.data = await (await fetch(`data/data.json`)).json()
        localStorage["lmumap_data.json"] = JSON.stringify(this.data)
        this.fetching = false;
        for (let waiter of this.waiters) {
            waiter()
        }
        return this.data
    }

    async getBuildings() {
        let data = await this.getData()
        return data.buildings;
    }

    async getBuilding(buildingid) {
        let data = await this.getBuildings()
        return data.filter((e) => { return e.code == buildingid })[0]
    }

    async getRoom(buildingid, displayName) {
        let parts = await this.getBuilingParts(buildingid)
        for (let part of Object.keys(parts)) {
            let rooms = await this.getRooms(buildingid, part)
            for (let room of rooms) {
                if (room.rName == displayName) {
                    room.part = part
                    return room
                }
            }
        }
    }

    async getBuilingParts(buildingid) {
        let data = await this.getData()
        return data.buildingParts[buildingid];
    }

    async getRooms(buildingid, part) {
        let data = await this.getData()
        return data.part[buildingid][part].rooms;
    }

    async getPartData(buildingid, part) {
        let data = await this.getData()
        return data.part[buildingid][part].mapInfo;
    }

    async getImgRotation(buildingid, part) {
        let data = await this.getData()
        return data.part[buildingid][part].rotation;
    }
}

let getter = new _getter()

let viewtype
viewtype = "clear"
//viewtype = "clear"
//viewtype = "rotate"

let sheduler = []
let shedulerRunning = false

function shedulerAddLast(func) {
    if (sheduler.includes(func)) {
        //remove func from sheduler
        sheduler.splice(sheduler.indexOf(func), 1)
    }
    sheduler.push(func)
}

async function handle(continu = undefined) {
    shedulerRunning = true;
    let item = sheduler.shift()
    if (item == undefined) {
        console.log("hander finish")
        shedulerRunning = false;
        return
    }
    try {
        await item();
    } catch (e) {
        console.error(e)
    }

    if (continu != undefined) {
        setTimeout(handle, 50, continu);
        return;
    }


    if (sheduler.length > 500) {
        setTimeout(handle, 1, 4);
        setTimeout(handle, 1, 4);
        setTimeout(handle, 1, 4);
        setTimeout(handle, 50);
    } else if (sheduler.length > 100) {
        setTimeout(handle, 1, 2);
        setTimeout(handle, 1, 2);
        setTimeout(handle, 50);
    } else {
        setTimeout(handle, 50);
    }
}

async function handle() {
    shedulerRunning = true;
    let currentdate = new Date();
    let start = currentdate.getTime()
    let i = 0;
    while (true) {
        let item = sheduler.shift()
        if (item == undefined) {
            console.log("hander finish")
            shedulerRunning = false;
            return
        }
        try {
            await await item();
        } catch (e) {
            console.error(e)
        }
        i++;
        if (i % 20 == 0) {
            currentdate = new Date();
            if (currentdate.getTime() - start > 100) {
                console.log("Hander Timeout")
                await new Promise((resolve, reject) => {
                    setTimeout(() => {
                        resolve()
                    }, 20)
                })
            }
        }
    }
}

setInterval(() => {
    if (shedulerRunning || sheduler.length == 0) {
        return
    }
    handle()
}, 300);

const LEVEL_ORDER = ["UG 03", "UG 02", "UG 01", "EG", "EG Z", "OG 01", "OG 01 Z", "OG 02", "OG 02 Z", "OG 03", "OG 03 Z", "OG 04", "OG 04 Z", "OG 05", "OG 05 Z", "OG 06", "OG 06 Z", "OG 07", "OG 07 Z",].reverse()

async function updateViewable() {
    let viewableLevels = []
    for (let buildingid of buildingsInView) {
        let parts = await getter.getBuilingParts(buildingid);
        for (part of Object.values(parts)) {
            if (!viewableLevels.includes(part.level)) {
                viewableLevels.push(part.level);
            }
        }
    }
    console.log("viewableLevels:", viewableLevels)
    //order viewableLevels by LEVEL_ORDER
    viewableLevels.sort((a, b) => {
        return LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b);
    });
    document.querySelector("#levelSelect").innerHTML = "";
    let hasSelected = false
    document.querySelector("#levelSelect").classList.remove("nonselected")
    for (let level of viewableLevels) {
        let button = document.createElement("button");
        button.innerText = level;
        button.classList.add("level");
        button.dataset.level = level
        if (level == selectedLevel) {
            hasSelected = true;
            button.classList.add("select");
        } else {
            button.onclick = () => {
                setSelectedLevel(level)
            }
        }
        document.querySelector("#levelSelect").appendChild(button);
    }
    if (!hasSelected && viewableLevels.length > 0) {
        document.querySelector("#levelSelect").classList.add("nonselected")
    }
    if (hasSelected) {
        let selected = document.querySelector("#levelSelect .select")
        if (selected != null) {
            selected.scrollIntoView({
                behavior: "instant", block: "center", inline: "center"
            })
        }
    }
    updCurrentSelected();
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

let showRoomsExtra = false
let hiddenBuildings = {}
let selectedLevel = "EG"
let levelUpdaters = []
let buildingsInView = []
const useLQImages = [
    "bw7070",
    "bw1003",
    "bw0200",
    "bw0251",
    "bw0252",
    "bw0250",
    "bw0050",
    "bw0824",
    "bw0822",
    "bw0826",
    "bw0828"
]
const useForHQ = "png" // svg, png, pdfsvg, pdfpng

function setSelectedLevel(level) {
    selectedLevel = level
    for (let updater of levelUpdaters) {
        sheduler.push(updater)
    }
    updateViewable();
}

function loadView() {
    let url = new URL(location.href)
    let lat = url.searchParams.get("lat")
    let lng = url.searchParams.get("lng")
    let zoom = url.searchParams.get("zoom")
    let urlSelectedLevel = url.searchParams.get("level")
    let currentSelected = url.searchParams.get("currentSelected")
    //map.setView([48.15013612685923, 11.593674288114116], 16)
    map.setView({
        "lat": lat ? lat : 48.15060497869304, "lng": lng ? lng : 11.582421448214385
    }, zoom ? zoom : 18)
    if (urlSelectedLevel) {
        setSelectedLevel(urlSelectedLevel)
    }
    if (currentSelected) {
        let currentSelectedSplit = currentSelected.split(";");
        let currentSelectedOut = undefined;
        if (currentSelectedSplit.length == 1) {
            currentSelectedOut = {
                "type": "building", "id": { "building": currentSelectedSplit[0], },
            }
        } else {
            currentSelectedOut = {
                "type": "room", "id": { "building": currentSelectedSplit[0], "room": currentSelectedSplit[1] }
            }
        }
        if (currentSelectedOut) {
            setCurrentSelected(currentSelectedOut);
        } else {
            console.error("Invalid currentSelected:", currentSelected)
        }
    }
}

loadView()

let finished = 0;
let toLoad = 0;

function updateLoadingBar() {
    //console.log("[" + "#".repeat(finished) + "-".repeat(toLoad - finished) + "]")
    document.querySelector("#loadingPageIndicatorFinished").style.setProperty("--progress", (finished / toLoad * 100) + "%")
    document.querySelector("#loadingPageIndicatorFinished").innerText = Math.round(finished / toLoad * 100) + "%"
    if (finished == toLoad) {
        document.querySelector("#loadingPageIndicatorWrapper").style.display = "none"
    } else {
        document.querySelector("#loadingPageIndicatorWrapper").style.display = ""
    }
}

function addLoad() {
    toLoad++;
    updateLoadingBar()
}

function finishLoad() {
    finished++;
    updateLoadingBar()
}

async function addBuildingPart(building, part, buildingparts, thisBuildingLayers, buildingMarker) {
    //if (buildingparts[part].level != "EG") {
    //    //continue
    //}
    let imageUrl
    if (useForHQ == "png") {
        imageUrl = `/data/${building.code}/${viewtype}/${part}.png`;
    } else if (useForHQ == "svg") {
        imageUrl = `/data/${building.code}/${viewtype}/${part}.svg`;
    } else if (useForHQ == "pdfsvg") {
        imageUrl = `/data/${building.code}/${part}.pdf.svg`;
    }
    let imageUrlMidHQ = `/data/${building.code}/downscale/${viewtype}/${part}_midhiquality.png`
    let downscaleImageUrl = `/data/${building.code}/downscale/${viewtype}/${part}_downscale.png`
    let extremmeDownscaleImageUrl = `/data/${building.code}/downscale/${viewtype}/${part}_maxdownscale.png`
    let partRooms = await getter.getRooms(building.code, part);
    let partData = await getter.getPartData(building.code, part)
    let currentOverlay = "HQ";
    let roomshidden = true;
    let roomsadding = false;
    let roomsremoving = false;
    let roomslist = [];
    let center = new L.LatLng(partData.center.lat, partData.center.lng)
    if (partData.display == false) {
        if (hiddenBuildings[building.code] == undefined) {
            hiddenBuildings[building.code] = []
        }
        hiddenBuildings[building.code].push({
            "showrooms": showrooms, "hiderooms": hiderooms,
        })
        //if (HIDDEN_BUILDING_WATCHER[building.code] == undefined) {
        buildingMarker._icon.classList.remove("buildingmarker");
        //} else {
        //    buildingMarker._icon.style.filter = "hue-rotate(180deg)";
        //}
        finishLoad()
        finishLoad()
        finishLoad()
        return
    }

    partData.imgrotation = 0;
    partData.imgPos = partData.img;
    partData.imgSize = partData.size;
    if (viewtype == "clear") {
        //partData.imgrotation += await (await fetch(`/data/${building.code}/rotation/${part}.json`)).json()
        partData.imgrotation += await getter.getImgRotation(building.code, part);
        let oimg = partData.img;
        partData.imgPos = partData.unrotateimg

        let rotated_width = oimg.width;
        let rotated_height = oimg.height;
        let mwh = rotated_width > rotated_height ? rotated_width : rotated_height;
        //partData.unrotateimg.width > partData.unrotateimg.height ? partData.unrotateimg.width : partData.unrotateimg.height
        partData.imgSize = (partData.unrotateimg.width > partData.unrotateimg.height ? partData.unrotateimg.width : partData.unrotateimg.height) / mwh * partData.size;

    }
    let poly1 = calculatePoly(partData.imgPos, partData.imgSize, center, partData.rotation - partData.imgrotation);

    currentOverlay = "LLQ";
    let overlayLLQ = L.imageOverlay.rotated(await imgCache.get(extremmeDownscaleImageUrl), poly1[3], poly1[2], poly1[0], {
        attribution: "&copy; <a href='http://www.lmu.de'>LMU</a>"
    }).addTo(map);
    if (buildingparts[part].level != selectedLevel) {
        map.removeLayer(overlayLLQ);
        currentOverlay = "hidden"
    }
    finishLoad()
    let overlayLQ = L.imageOverlay.rotated(await imgCache.get(downscaleImageUrl), poly1[3], poly1[2], poly1[0], {
        attribution: "&copy; <a href='http://www.lmu.de'>LMU</a>"
    }).addTo(map);
    map.removeLayer(overlayLQ);
    finishLoad()
    let overlayHQ = L.imageOverlay.rotated(await imgCache.get(useLQImages.includes(building.code) ? imageUrlMidHQ : imageUrl), poly1[3], poly1[2], poly1[0], {
        attribution: "&copy; <a href='http://www.lmu.de'>LMU</a>"
    })
    overlayHQ.addTo(map);
    finishLoad()
    //hide hq
    map.removeLayer(overlayHQ);

    function showrooms(otherCenter = null) {
        if (!showRoomsExtra) {
            return
        }
        if (HIDDEN_BUILDING_WATCHER[building.code]) {
            for (let hiddenBuilding of HIDDEN_BUILDING_WATCHER[building.code]) {
                if (hiddenBuildings[hiddenBuilding] == undefined) {
                    console.warn("hiddenBuilding not found", hiddenBuilding)
                    continue
                }
                for (let hiddenBuildingPart of hiddenBuildings[hiddenBuilding]) {
                    hiddenBuildingPart.showrooms(center)
                }
            }
        }

        if (!roomshidden) {
            return
        }
        if (roomsadding) {
            return
        }
        if (buildingparts[part].level != selectedLevel) {
            return
        }
        let thisOffset = [0, 0]
        if (otherCenter != null) {
            //thisOffset = [otherCenter.lat - center.lat, otherCenter.lng - center.lng]
        }

        roomsadding = true;
        console.log("showrooms")
        for (let room of partRooms) {
            let makeRoom = ((room, partData) => {
                let npX = room.npX
                let npY = room.npY

                let divIcon = L.divIcon({ className: 'roomdescriptor', html: `<span>${room.rName}</span>` });
                let latlng = mapPointToImage(partData.img, partData.size, center, partData.rotation, [npX, npY]);
                //console.log(latlng)

                let roomMarker = L.marker([latlng.lat + thisOffset[0], latlng.lng + thisOffset[1]], { icon: divIcon }).addTo(map);
                //zoom to maker
                roomslist.push(roomMarker);
                roomMarker.bindPopup(room.rName)
            })
            sheduler.push(makeRoom.bind(this, room, partData))
        }
        sheduler.push(() => {
            roomshidden = false;
            roomsadding = false;
        });
    }

    function hiderooms() {
        if (HIDDEN_BUILDING_WATCHER[building.code]) {
            for (let hiddenBuilding of HIDDEN_BUILDING_WATCHER[building.code]) {
                if (hiddenBuildings[hiddenBuilding] == undefined) {
                    console.warn("hiddenBuilding not found", hiddenBuilding)
                    continue
                }
                for (let hiddenBuildingPart of hiddenBuildings[hiddenBuilding]) {
                    hiddenBuildingPart.hiderooms()
                }
            }
        }
        if (roomshidden) {
            return
        }
        if (roomsremoving) {
            return
        }
        if (buildingparts[part].level == selectedLevel) {
            if (currentOverlay == "HQ") {
                return;
            }
        }

        roomsremoving = true;
        console.log("hiderooms")
        for (room of roomslist) {
            sheduler.push(((room) => {
                map.removeLayer(room);
            }).bind(this, room))
        }
        sheduler.push(() => {
            roomshidden = true;
            roomsremoving = false;
        });
    }

    function updateZoom_() {
        // check if overlay on map
        let inViewport = currentOverlay == "LQ" ? map.getBounds().intersects(overlayLQ.getBounds()) : (currentOverlay == "HQ" ? map.getBounds().intersects(overlayHQ.getBounds()) : map.getBounds().intersects(overlayLLQ.getBounds()))
        let shadaowVisible = false;
        if (buildingparts[part].level != selectedLevel) {
            if (buildingparts[part].level == "EG" && !thisBuildingLayers.includes(selectedLevel)) {
                shadaowVisible = true;
                if (currentOverlay != "LLQ") {
                    console.log("switch to LLQ");
                    if (currentOverlay == "HQ") {
                        map.removeLayer(overlayHQ);
                    }
                    if (currentOverlay == "LQ") {
                        map.removeLayer(overlayLQ);
                    }
                    map.addLayer(overlayLLQ);
                    currentOverlay = "LLQ";
                }

                overlayLLQ._image.classList.add("shadowImg")

                inViewport = currentOverlay == "LQ" ? map.getBounds().intersects(overlayLQ.getBounds()) : (currentOverlay == "HQ" ? map.getBounds().intersects(overlayHQ.getBounds()) : map.getBounds().intersects(overlayLLQ.getBounds()))
            } else {
                if (currentOverlay != "hidden") {
                    map.removeLayer(overlayLLQ);
                    map.removeLayer(overlayLQ);
                    map.removeLayer(overlayHQ);
                    currentOverlay = "hidden";
                }
                return
            }
        }
        if (inViewport) {
            if (!buildingsInView.includes(building.code)) {
                buildingsInView.push(building.code)
                shedulerAddLast(updateViewable)
            }
        } else {
            if (buildingsInView.includes(building.code)) {
                buildingsInView.splice(buildingsInView.indexOf(building.code), 1)
                shedulerAddLast(updateViewable)
            }
        }
        if (shadaowVisible) {
            return
        } else {
            overlayLLQ._image.classList.remove("shadowImg")
        }

        if (map.getZoom() >= 19 && inViewport) {
            if (currentOverlay != "HQ") {
                console.log("switch to HQ");
                if (currentOverlay == "LQ") {
                    map.removeLayer(overlayLQ);
                }
                if (currentOverlay == "LLQ") {
                    map.removeLayer(overlayLLQ);
                }
                map.addLayer(overlayHQ);
                currentOverlay = "HQ";
            }
            if (roomshidden) {
                showrooms()
            }
        } else if (map.getZoom() >= 17 && inViewport) {
            if (currentOverlay != "LQ") {
                console.log("switch to LQ");
                if (currentOverlay == "HQ") {
                    map.removeLayer(overlayHQ);
                }
                if (currentOverlay == "LLQ") {
                    map.removeLayer(overlayLLQ);
                }
                map.addLayer(overlayLQ);
                currentOverlay = "LQ";
            }
            if (!roomshidden) {
                hiderooms()
            }
        } else {
            if (currentOverlay != "LLQ") {
                console.log("switch to LLQ");
                if (currentOverlay == "HQ") {
                    map.removeLayer(overlayHQ);
                }
                if (currentOverlay == "LQ") {
                    map.removeLayer(overlayLQ);
                }
                map.addLayer(overlayLLQ);
                currentOverlay = "LLQ";
            }
            if (!roomshidden) {
                hiderooms()
            }
        }
    }

    async function updateZoom() {
        sheduler.push(updateZoom_)
        //updateZoom_();
        //setTimeout(updateZoom_, 10);
    }

    function levelUpdater() {
        updateZoom_()

        if (buildingparts[part].level != selectedLevel) {
            hiderooms();
        }
    }

    levelUpdaters.push(levelUpdater)

    // on move / zoom
    map.on('moveend', updateZoom);
    map.on('zoomend', updateZoom);
    updateZoom()
}

async function addBuilding_(building, buildingparts) {
    let buildingMarker = L.marker([building.lat, building.lng]).addTo(map);
    buildingMarker._icon.classList.add("buildingmarker");
    //popup says building.code
    buildingMarker.bindPopup(building.displayName + " (" + building.code + ")");
    let thisBuildingLayers = []
    for (let part in buildingparts) {
        thisBuildingLayers.push(buildingparts[part].level)
    }
    for (let part in buildingparts) {
        addLoad();
        addLoad();
        addLoad();
        addBuildingPart(building, part, buildingparts, thisBuildingLayers, buildingMarker)
    }
}


async function addBuilding(building) {
    let buildingparts = await getter.getBuilingParts(building["code"])
    return await addBuilding_(building, buildingparts);
}


function whilezoom() {
    let zoomlevel = map.getZoom();
    // set css variable --zoomLevel
    document.documentElement.style.setProperty('--zoomLevel', zoomlevel);
}

whilezoom()

map.on("zoom", whilezoom);

imgCache = new imgCache();
(async () => {
    await imgCache.init()
    //buildings = await (await fetch("/data_buildingsJSON.json")).json()
    let buildings = await getter.getBuildings()

    let promises = []
    for (building of buildings) {
        promises.push(addBuilding(building))
    }
    await Promise.all(promises)
    promises = []
    console.log("done");
})()


let oldSearches = localStorage.getItem("lmumap_searches")
try {
    oldSearches = JSON.parse(oldSearches)
} catch (e) {
    oldSearches = [];
}
if (!oldSearches) {
    oldSearches = [];
}

function hideSearch() {
    document.querySelector("#search").style.width = "calc(40px - 8px)";
    document.querySelector("#searchIcon").classList.remove("hidden")
    document.querySelector("#searchOutput").style.display = "none";
}

function showSearch() {
    document.querySelector("#search").style.width = "calc(100% - 40px)";
    document.querySelector("#searchIcon").classList.add("hidden")
    document.querySelector("#searchOutput").style.display = "";
}

document.querySelector("#search").addEventListener("focus", (e) => {
    showSearch()
    //select all text
    e.target.select()
});
document.querySelector("#search").addEventListener("blur", (e) => {
    if (e.target.value == "") {
        hideSearch()
    } else {
        showSearch()
    }
});

document.body.addEventListener("mouseup", (ev) => {
    for (let el of ev.composedPath()) {
        if (el.id == "searchWrapper") {
            return
        }
    }
    hideSearch()
})

const ignoreText = [" ", "-", "/", "(", ")", ".", ",", "'", '"', "ä", "ö", "ü", "ß",]

function repl(str) {
    str = str.toLowerCase()
    //remove everything in ignoreText
    for (let char of ignoreText) {
        str = str.split(char).join("")
    }
    return str
}

function updCurrentSelected() {
    updateHref()
    if (currentSelected == undefined || _currentSelected != currentSelected) {
        if (currentSelectedMarker != undefined) {
            map.removeLayer(currentSelectedMarker);
            currentSelectedMarker = undefined;
        }
    }
    if (currentSelected == undefined) {
        document.querySelector("#currentSelected").style.display = "none";
        return
    }
    _currentSelected = JSON.parse(JSON.stringify(currentSelected))
    if (currentSelected.type == "room") {
        if (currentSelectedMarker == undefined) {
            //add a blinking marker for 2s to the room
            let roomMarker = L.marker([currentSelected.moveTo.lat, currentSelected.moveTo.lng], {}).addTo(map);
            roomMarker._icon.classList.add("blinkingRoomMarker")
            roomMarker._icon.classList.add("roomMarker")
            setTimeout(() => {
                //add class removeMarker to roomMarker
                if (roomMarker._icon == undefined) {
                    return
                }
                roomMarker._icon.classList.remove("blinkingRoomMarker")
            }, 5000);
            currentSelectedMarker = roomMarker
        }
        document.querySelectorAll(".markSelected").forEach(e => e.classList.remove("markSelected"))
        document.querySelectorAll(`.level[data-level="${currentSelected.level}"]`).forEach(e => e.classList.add("markSelected"))
        document.querySelector("#currentSelected").style.display = "";
        document.querySelector("#currentSelectedText").innerText = currentSelected.name + "; " + currentSelected.level + "; " + currentSelected.building;
    }
}

function closeCurrentSelected() {
    currentSelected = undefined;
    updCurrentSelected()
}

document.querySelector("#currentSelectedClose").addEventListener("click", closeCurrentSelected)

function searchClickFunc(result) {
    document.querySelector("#search").blur()
    hideSearch()
    let zoom = 18;
    if (result.type == "room") {
        zoom = 21;
    }
    map.setView([result.moveTo.lat, result.moveTo.lng], zoom);
    if (result.moveTo.floor != null) {
        setSelectedLevel(result.moveTo.floor);
    } else if (result.type == "building") {
        //check if any leven of the building is visible, and if not set the currently selected level to EG
        getter.getBuilingParts(result.buildingCode).then((r) => {
            let hasLevel = false;
            for (let part of Object.values(r)) {
                if (part.level == selectedLevel) {
                    hasLevel = true;
                    break;
                }
            }
            if (!hasLevel) {
                setSelectedLevel("EG");
            }
        })
    }
    currentSelected = result;
    updCurrentSelected();
    oldSearches.push(latestSearch)
    localStorage.setItem("lmumap_searches", JSON.stringify(oldSearches))
}

let searchEnterFunction = undefined;

function displaySearchResults(results) {
    let searchResults = document.querySelector("#searchOutput");
    searchResults.innerHTML = "";
    let i = 0
    searchEnterFunction = undefined;
    for (let result of results) {
        let resultElement = document.createElement("div");
        resultElement.classList.add("searchResult");

        let name = document.createElement("h2")
        name.innerText = result.name;
        let secondaryDescription = document.createElement("p")
        let thirdDescription
        if (result.type == "building") {
            secondaryDescription.innerText = result.city
        } else {
            secondaryDescription.innerText = result.building
            thirdDescription = document.createElement("p")
            thirdDescription.innerText = "Level " + result.level
        }

        resultElement.appendChild(name)
        resultElement.appendChild(secondaryDescription)
        if (thirdDescription) {
            resultElement.appendChild(thirdDescription)
        }
        let func = searchClickFunc.bind(this, result);
        resultElement.addEventListener("click", func);
        if (searchEnterFunction == undefined) {
            searchEnterFunction = func;
        }

        searchResults.appendChild(resultElement);
        i += 1
        if (i > 100) {
            break
        }
    }
}

async function setCurrentSelected(data) {
    /*
    data:
        {"type": "building", "id": {"building": currentSelectedSplit[0],},}
        {"type": "room", "id": {"building": currentSelectedSplit[0], "room": currentSelectedSplit[1]}}*/

    if (data.type === "building") {
        let building = await getter.getBuilding(data.id.building)
        currentSelected = {
            "id": { "building": building.code },
            "name": building.displayName,
            "city": building.city,
            "type": "building",
            "buildingCode": building.code,
            "moveTo": {
                "lat": building.lat, "lng": building.lng, "floor": null,
            }
        }
    } else if (data.type === "room") {
        let building = await getter.getBuilding(data.id.building)
        let room = await getter.getRoom(data.id.building, data.id.room)
        let part = await getter.getBuilingParts(data.id.building)
        let partData = await getter.getPartData(data.id.building, room.part)
        let center = new L.LatLng(partData.center.lat, partData.center.lng)
        let roomlatlng = mapPointToImage(partData.img, partData.size, center, partData.rotation, [room.npX, room.npY]);
        currentSelected = {
            "id": { "building": building.code, "room": room.rName },
            "name": room.rName,
            "level": part[room.part].level,
            "building": building.displayName,
            "type": "room",
            "moveTo": {
                "lat": roomlatlng.lat, "lng": roomlatlng.lng, "floor": partData.level,
            }
        }
    } else {
        console.error("error")
    }
    console.log(currentSelected)
    updCurrentSelected()
}

async function searchFor(query) {
    if (query == "") {
        document.querySelector("#searchOutput").innerHTML = ""
        return
    }
    let buildings = await getter.getBuildings();
    let searchResults = [];
    for (let building of buildings) {
        let add = false
        if (repl(building.code).includes(query) || repl(building.displayName).includes(query) || repl(building.city).includes(query)) {
            add = true;
        }
        if (building.aka != undefined && add == false) {
            for (let aka of building.aka) {
                if (repl(aka).includes(query)) {
                    add = true;
                    break
                }
            }
        }
        if (add) {
            searchResults.push({
                "id": { "building": building.code },
                "name": building.displayName,
                "city": building.city,
                "type": "building",
                "buildingCode": building.code,
                "moveTo": {
                    "lat": building.lat, "lng": building.lng, "floor": null,
                }
            });
        }
    }
    for (let building of buildings) {
        building = building.code

        let buildingparts = await getter.getBuilingParts(building);
        for (let partid of Object.keys(buildingparts)) {
            let partData = await getter.getPartData(building, partid)
            let part = buildingparts[partid];
            let center = new L.LatLng(partData.center.lat, partData.center.lng)
            let rooms = await getter.getRooms(building, partid);
            for (let room of rooms) {
                if (repl(room.rName).includes(query) || repl(room.rName).includes(query)) {
                    let buildingName = buildings.find((b) => b.code == building).displayName;

                    let npX = room.npX
                    let npY = room.npY
                    let roomlatlng = mapPointToImage(partData.img, partData.size, center, partData.rotation, [npX, npY]);

                    searchResults.push({
                        "id": { "building": building, "room": room.rName },
                        "name": room.rName,
                        "level": part.level,
                        "building": buildingName,
                        "type": "room",
                        "moveTo": {
                            "lat": roomlatlng.lat, "lng": roomlatlng.lng, "floor": part.level,
                        }
                    });
                }
            }
        }
    }

    let mapCenter = map.getCenter();


    //add distance to map.getCenter() to searchResults
    for (let result of searchResults) {
        result.distance = Math.sqrt(Math.pow(result.moveTo.lat - mapCenter.lat, 2) + Math.pow(result.moveTo.lng - mapCenter.lng, 2));
    }

    //order by distance
    searchResults.sort((a, b) => {
        return a.distance - b.distance;
    });


    console.log(searchResults);

    displaySearchResults(searchResults);
}

function updSearch() {
    if (latestSearch != "") {
        searchFor(latestSearch);
    }
}

function updateHref() {
    let center = map.getCenter();
    let zoom = map.getZoom();
    let url = new URL(window.location.href);
    queryStrings = url.searchParams
    queryStrings.set("lat", center.lat);
    queryStrings.set("lng", center.lng);
    queryStrings.set("zoom", zoom);
    queryStrings.set("level", selectedLevel)
    if (currentSelected != undefined) {
        if (currentSelected.type == "room") {
            queryStrings.set("currentSelected", currentSelected.id.building + ";" + currentSelected.id.room)
        } else {
            queryStrings.set("currentSelected", currentSelected.id.building)
        }
    } else {
        queryStrings.delete("currentSelected")
    }
    let href = url.href
    window.history.replaceState({}, "", href);
}

map.on("moveend", updSearch)
map.on("moveend", updateHref)
map.on("zoomend", updSearch)

let latestSearch = ""
document.querySelector("#search").addEventListener("input", (e) => {
    let search = repl(e.target.value);
    latestSearch = search;
    searchFor(search);
});

document.querySelector("#search").addEventListener("keydown", (e) => {
    if (e.key == "Enter") {
        if (searchEnterFunction != undefined) {
            searchEnterFunction();
        }
    }
});


document.querySelector("#findMe").addEventListener("click", () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            map.setView([position.coords.latitude, position.coords.longitude], map.getZoom());
        });
    }
});