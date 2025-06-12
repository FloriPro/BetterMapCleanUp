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
        return data.filter((e) => {
            return e.code == buildingid
        })[0]
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



async function addBuildingPart(building, part, buildingparts) {
    let imageUrl = `/data/${building.code}/${viewtype}_${part}.png`;
    let useImageUrl = `/data/${building.code}/maxdownscale_${viewtype}_${part}.png`
    let partData = await getter.getPartData(building.code, part)
    let center = new L.LatLng(partData.center.lat, partData.center.lng)

    partData.imgrotation = 0;
    partData.imgPos = partData.img;
    partData.imgSize = partData.size;
    if (viewtype == "clear") {
        //partData.imgrotation += await (await fetch(`/data/${building.code}/rotation_${part}.json`)).json()
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

    let img = L.imageOverlay.rotated(useImageUrl, poly1[3], poly1[2], poly1[0], {
        attribution: "&copy; <a href='http://www.lmu.de'>LMU</a>"
    })
    img.addTo(map);

    await fetch(`/save/data/${building.code}/polyInfo_${part}.json`,
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
        let npX = room.npX
        let npY = room.npY
        let latlng = mapPointToImage(partData.img, partData.size, center, partData.rotation, [npX, npY]);
        roomsData[room.rName].latlng = latlng;
    }
    await fetch(`/save/data/${building.code}/rooms_latlng_${part}.json`, {
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
}

async function addBuilding(building, buildingparts) {
    map.setView([building.lat, building.lng], 18);
    for (let part in buildingparts) {
        await addBuildingPart(building, part, buildingparts)
    }
}

(async () => {
    let buildings = await getter.getBuildings()
    for (building of buildings) {
        let buildingparts = await getter.getBuilingParts(building["code"])
        await addBuilding(building, buildingparts)
    }
    alert("YOU ARE DONE")
})()