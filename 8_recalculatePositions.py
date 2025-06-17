import os, json
import math
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image, ImageDraw


def rotate(origin, point, angleog):
    angle = math.radians(angleog)
    """
    Rotate a point counterclockwise by a given angle around a given origin.

    The angle should be given in radians.
    """
    ox, oy = origin
    px, py = point

    qx = ox + math.cos(angle) * (px - ox) - math.sin(angle) * (py - oy)
    qy = oy + math.sin(angle) * (px - ox) + math.cos(angle) * (py - oy)
    return qx, qy


def getbuildingsJSON():
    with open("data_buildingsJSON.json", encoding="UTF-8") as f:
        return json.load(f)


def getUniqueBuildingParts(buildingid):
    with open(f"data/{buildingid}/uniqueBuildingParts.json", encoding="UTF-8") as f:
        return json.load(f)


def getRooms(buildingid):
    with open(f"data/{buildingid}/rooms.json", encoding="UTF-8") as f:
        return json.load(f)


def getCropInfo(buildingid, part):
    with open(f"data/{buildingid}/crop/{part}_info.json", encoding="UTF-8") as f:
        return json.load(f)


def getRotateAngle(buildingid, part):
    with open(f"data/{buildingid}/rotation/{part}.json", encoding="UTF-8") as f:
        return json.load(f)


def calculateExpand(angle, w, h, buildingid, part):
    angle = math.radians(angle)
    ir = Image.open(f"data/{buildingid}/rotation/{part}.png")
    return (ir.size[0] - w) / 2, (ir.size[1] - h) / 2


def addRooms(buildingid, i, m):
    if not os.path.exists(f"data/{buildingid}/rooms/"):
        os.makedirs(f"data/{buildingid}/rooms/")

    print(f"{i}/{m} {buildingid}")
    uniqueBuildingParts = getUniqueBuildingParts(buildingid)
    buildingRoomsUnorderd = getRooms(buildingid)
    buildingRooms = {}
    for roomid, data in buildingRoomsUnorderd.items():
        if data["floorCode"] not in buildingRooms:
            buildingRooms[data["floorCode"]] = []
        data["roomid"] = roomid
        buildingRooms[data["floorCode"]].append(data)

    for part in uniqueBuildingParts:
        partRooms = buildingRooms[part]
        cropInfo = getCropInfo(buildingid, part)
        pixelXMinus = cropInfo["topCut"]
        pixelYMinus = cropInfo["leftCut"]

        origin = (cropInfo["width"] / 2, -cropInfo["height"] / 2)

        angle = getRotateAngle(buildingid, part)

        rotateXAdd, rotateYAdd = calculateExpand(
            angle,
            cropInfo["width"],
            cropInfo["height"],
            buildingid,
            part,
        )

        print(rotateXAdd, rotateYAdd)
        i = 0
        rooms = []
        for room in partRooms:
            room["pX"] = int(room["pX"]) - cropInfo["leftCut"]
            room["pY"] = int(room["pY"]) - cropInfo["topCut"]
            room["npX"], room["npY"] = rotate(origin, (room["pX"], -room["pY"]), angle)
            room["npY"] = -room["npY"]
            room["npX"] = room["npX"] + rotateXAdd
            room["npY"] = room["npY"] + rotateYAdd
            rooms.append(room)
        try:
            with open(
                f"data/{buildingid}/rooms/{part}.json", "w", encoding="UTF-8"
            ) as f:
                json.dump(rooms, f)
        except KeyboardInterrupt:
            print("plase wait...")
            with open(
                f"data/{buildingid}/rooms/{part}.json", "w", encoding="UTF-8"
            ) as f:
                json.dump(rooms, f)


buildings = getbuildingsJSON()


for i, building in enumerate(buildings):
    addRooms(building["code"], i, len(buildings))
