let osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 30,
    maxNativeZoom: 19,
    minZoom: 0,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
})
let layers = {
    "osm": osm,
}
let map = L.map('map', {
    layers: Object.values(layers)
});

class _getter {
    constructor() {
    }


    async getBuildings() {
        let buildings = await (await fetch("/data_buildingsJSON.json")).json();
        return buildings;
    }

    async getBuilding(buildingid) {
        throw Error("getBuilding not implemented")
    }

    async getRoom(buildingid, displayName) {
        throw Error("getRoom not implemented")
    }

    async getBuilingParts(buildingid) {
        return await (await fetch(`/data/${buildingid}/uniqueBuildingParts.json`)).json();
    }

    async getRooms(buildingid, part) {
        return await (await fetch(`/data/${buildingid}/rooms/${part}.json`)).json();
    }

    async getPartData(buildingid, part) {
        return await (await fetch(`/data/${buildingid}/polyInfo/${part}_mapInfo.json`)).json();
    }

    async getImgRotation(buildingid, part) {
        return await (await fetch(`/data/${buildingid}/rotation/${part}.json`)).json();
    }
}

let getter = new _getter();

let viewtype = "clear"

let oldImgs = []

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

async function getImg(url) {
    let img = new Image();
    img.src = url;
    await new Promise((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
    });
    return img;
}



async function addBuildingPart(building, part, buildingparts) {
    let imageUrl = `/data/${building.code}/${viewtype}/${part}.png`;
    let imageRotateUrl = `/data/${building.code}/rotation/${part}.png`;
    //let useImageUrl = `/data/${building.code}/downscale/${viewtype}/${part}_maxdownscale.png`
    let useImageUrl = `/data/${building.code}/downscale/${viewtype}/${part}_downscale.png`
    let partData = await getter.getPartData(building.code, part)
    let center = new L.LatLng(partData.center.lat, partData.center.lng)

    partData.imgrotation = 0;
    partData.imgPos = partData.img;
    partData.imgSize = partData.size;
    partData.img = await getImg(imageRotateUrl);
    partData.unrotateimg = await getImg(imageUrl);

    if (viewtype == "clear") {
        //partData.imgrotation += await (await fetch(`/data/${building.code}/rotation/${part}.json`)).json()
        partData.imgrotation += await getter.getImgRotation(building.code, part);
        let oimg = partData.unrotateimg;
        partData.imgPos = partData.unrotateimg

        let rotated_width = oimg.width;
        let rotated_height = oimg.height;
        let mwh = rotated_width > rotated_height ? rotated_width : rotated_height;
        //partData.unrotateimg.width > partData.unrotateimg.height ? partData.unrotateimg.width : partData.unrotateimg.height
        partData.imgSize = (partData.unrotateimg.width > partData.unrotateimg.height ? partData.unrotateimg.width : partData.unrotateimg.height) / mwh * partData.size;

    }
    let poly1 = calculatePoly(partData.imgPos, partData.imgSize, center, partData.rotation - partData.imgrotation);

    let img = L.imageOverlay.rotated(useImageUrl, poly1[3], poly1[2], poly1[0], {
        attribution: "&copy; <a href='http://www.lmu.de'>LMU</a>"
    })
    img.addTo(map);

    let promise1 = fetch(`/save/data/${building.code}/polyInfo/${part}.json`,
        {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "poly": {
                    "topLeft": poly1[3],
                    "topRight": poly1[2],
                    "bottomLeft": poly1[0],
                    "bottomRight": poly1[1]
                }
            })
        }
    )

    let rooms = await getter.getRooms(building.code, part)
    let roomsData = {};
    for (let room of rooms) {
        roomsData[room.rName] = room;
        let pX = room.pX
        let pY = room.pY
        let latlng = mapPointToImage(partData.unrotateimg, partData.size, center, partData.rotation - partData.imgrotation, [pX, pY]);
        roomsData[room.rName].latlng = latlng;
    }
    let promise2 = fetch(`/save/data/${building.code}/rooms/latlng/${part}.json`, {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            "rooms": roomsData
        })
    });


    oldImgs.push(img);
    if (oldImgs.length > 10) {
        let img = oldImgs.shift();
        map.removeLayer(img);
    }
    await Promise.all([promise1, promise2]).then(() => {
        console.log(`Added part ${part} of building ${building.code}`)
    }).catch((e) => {
        console.error(`Error adding part ${part} of building ${building.code}`, e)
    })

    window.oldMarkers = window.oldMarkers || [];
    //remove old markers
    for (let marker of window.oldMarkers) {
        map.removeLayer(marker);
    }
    window.oldMarkers = [];
    for (let room of Object.keys(roomsData)) {
        let marker = L.marker(roomsData[room].latlng, {
            title: roomsData[room].rName,
        });
        marker.addTo(map);
        window.oldMarkers.push(marker);
    }
}

async function addBuilding(building, buildingparts) {
    map.setView([building.lat, building.lng], 18);
    for (let part in buildingparts) {
        await addBuildingPart(building, part, buildingparts)
    }
}

let SKIP_DEBUG = 57;
(async () => {
    let buildings = await getter.getBuildings()
    let i = 0;
    for (building of buildings) {
        i++;
        console.log(`Adding building ${building.code} (${i + 1}/${buildings.length})`)
        if (SKIP_DEBUG > 0 && i < SKIP_DEBUG) {
            continue;
        }
        let buildingparts = await getter.getBuilingParts(building["code"])
        await addBuilding(building, buildingparts)
    }
    alert("YOU ARE DONE")
})()