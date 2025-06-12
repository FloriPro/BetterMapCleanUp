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
    layers: Object.values(layers)
});
var layerControl = L.control.layers(layers, []).addTo(map);

//osm.addTo(map);

async function getBuilingParts(buildingid) {
    return await (await fetch(`data/${buildingid}/uniqueBuildingParts.json`)).json()
}
let viewtype
//viewtype = "clear"
viewtype = "clear"
//viewtype = "rotate"

let lastImgs = []
async function make(building, buildingparts) {
    console.log(buildingparts)
    let before = undefined
    map.setView([building.lat, building.lng], 18);
    for (let part in buildingparts) {
        let partDataUrl = `/data/${building.code}/mapInfo_${part}.json`;
        let partData = undefined
        if (await (await fetch(`/exists${partDataUrl}`)).json() == true) {
            console.log("skip", building.code, part)
            partData = await (await fetch(partDataUrl)).json()
            if (partData.img != undefined && partData.unrotateimg != undefined) {
                console.log("all ok")
                continue;
            }
        }
        let imgrotation = 0
        if (viewtype == "clear") {
            imgrotation += await (await fetch(`/data/${building.code}/rotation_${part}.json`)).json()
        }
        await new Promise((resolve) => {
            //map.setView([building.lat, building.lng], map.getZoom());
            let marker = L.marker([building.lat, building.lng]).addTo(map);
            //add image /img.png to map
            var imageUrl = `/data/${building.code}/${viewtype}_${part}.png`;

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

            function calculatePoly(img, currentSize, center, roatation) {
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
                poly1 = rotatePoints(center, poly1, roatation)
                return poly1;
            }
            let img = new Image();
            img.src = imageUrl;
            let currentSize = 100;
            let roatation = 0;
            let center = L.latLng(building.lat, building.lng)
            if (before != undefined) {
                currentSize = before["size"]
                roatation = before["rotation"]
                center = L.latLng(before["center"]["lat"], before["center"]["lng"])
                img.src = `/data/${building.code}/${viewtype}_${part}.png`;
            }
            img.onload = function () {
                if (partData != undefined) {
                    if (partData.img == undefined && viewtype != "clear") {
                        console.log("add img data")
                        partData.img = {
                            "width": img.width,
                            "height": img.height
                        }
                    } else if (partData.unrotateimg == undefined && viewtype == "clear") {
                        console.log("add unrotateimg data")
                        partData.unrotateimg = {
                            "width": img.width,
                            "height": img.height
                        }
                    }
                    fetch(`/save${partDataUrl}`,
                        {
                            method: "POST",
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(partData)
                        }
                    ).then(() => {
                        resolve()
                    })
                    return
                }

                let poly1 = calculatePoly(img, currentSize, center, roatation + imgrotation)

                var overlay = L.imageOverlay.rotated(imageUrl, poly1[3], poly1[2], poly1[0], {
                    opacity: 0.6,
                    interactive: true,
                    draggable: true,
                    attribution: "&copy; <a href='http://www.lmu.de'>LMU</a>"
                }).addTo(map);

                lastImgs.push(overlay);
                if (lastImgs.length > 6) {
                    map.removeLayer(lastImgs[0])
                    lastImgs.shift()
                }

                let draggable = new L.Draggable(overlay._image);
                draggable.enable();

                function dragevent(e) {
                    console.log(e)
                    let start = e.sourceTarget._startPos
                    let end = e.sourceTarget._newPos
                    let diff = [end.x - start.x, end.y - start.y]
                    let cordsDiff = { x: diff[0], y: diff[1] }
                    let centerPoints = L.CRS.EPSG3857.latLngToPoint(center, map.getZoom())
                    console.log(centerPoints)
                    let newCords = L.point(centerPoints.x + cordsDiff.x, centerPoints.y + cordsDiff.y)
                    center = L.CRS.EPSG3857.pointToLatLng(newCords, map.getZoom())

                    let poly1 = calculatePoly(img, currentSize, center, roatation + imgrotation)
                    overlay.reposition(poly1[3], poly1[2], poly1[0])
                }

                draggable.on("dragend", dragevent)

                function keylistener(e) {
                    console.log(e.key)
                    if (e.key == "e") {
                        roatation += 10
                    } else if (e.key == "q") {
                        roatation -= 10
                    } else if (e.key == "a") {
                        roatation -= 0.5
                    } else if (e.key == "d") {
                        roatation += 0.5
                    } else if (e.key == "w") {
                        currentSize += 0.5
                    } else if (e.key == "W") {
                        currentSize += 5
                    } else if (e.key == "s") {
                        currentSize -= 0.5
                    } else if (e.key == "S") {
                        currentSize -= 5
                    } else if (e.key == " ") {
                        // finish
                        before = {
                            "rotation": roatation,
                            "size": currentSize,
                            "center": center,
                            "img": {
                                "width": img.width,
                                "height": img.height
                            }
                        }
                        fetch(`/save/data/${building.code}/mapInfo_${part}.json`,
                            {
                                method: "POST",
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    "rotation": roatation,
                                    "size": currentSize,
                                    "center": {
                                        "lat": center.lat,
                                        "lng": center.lng
                                    }
                                })
                            }
                        )
                        overlay.setOpacity(0.3)
                        map.removeLayer(marker)
                        document.removeEventListener("keydown", keylistener)
                        draggable.disable()
                        draggable.off("dragend", dragevent)
                        console.log("finish")
                        resolve()
                    }
                    console.log(roatation)
                    let poly1 = calculatePoly(img, currentSize, center, roatation + imgrotation)
                    overlay.reposition(poly1[3], poly1[2], poly1[0])
                }

                // on key event
                document.addEventListener("keydown", keylistener)


            }

            /*let img = new Image();
            img.src = imageUrl;
            img.onload = function () {
                let currentSize = 100;
                let width = img.width;
                let height = img.height;
                //normalize widht,height to 100m
                let mwh = width > height ? width : height;
                width = width / mwh * currentSize;
                height = height / mwh * currentSize;
                let center = L.latLng(building.lat, building.lng)
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
                var pg = new L.Polygon([poly1], {
                    draggable: true,
                    opacity: 0,
                    fillOpacity: 0
                }).addTo(map);
    
                var imageBounds = L.latLngBounds([
                    poly1[0],
                    poly1[2]
                ]);
                map.fitBounds(imageBounds);
                var overlay = new L.ImageOverlay(imageUrl, imageBounds, {
                    opacity: 0.7,
                    interactive: true
                });
                map.addLayer(overlay);
    
                // add dragable to pg
                let dragable = new L.Draggable(imageBounds._image)
                dragable.enable()
    
    
                pg.on('dragend', function (e) {
                    overlay.setBounds(pg.getBounds());
                });
            }*/
        })
    }
}
(async () => {
    buildings = await (await fetch("/data_buildingsJSON.json")).json()
    for (building of buildings) {
        await make(building, await getBuilingParts(building["code"]))
    }
    alert("YOU ARE DONE")
})()