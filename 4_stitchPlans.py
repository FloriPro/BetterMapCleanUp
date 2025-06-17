import math
import json
import requests
import os
from PIL import Image

# stitch room plans


def getbuildingsJSON():
    with open("data_buildingsJSON.json", encoding="UTF-8") as f:
        return json.load(f)


def getUniqueBuildingParts(buildingid):
    with open(f"data/{buildingid}/uniqueBuildingParts.json", encoding="UTF-8") as f:
        return json.load(f)


def stitch(buildingid):
    buildingParts = getUniqueBuildingParts(buildingid)

    # make folder img_default if not exists
    if not os.path.exists(f"data/{buildingid}/img_default"):
        os.makedirs(f"data/{buildingid}/img_default")

    for part, value in buildingParts.items():
        if os.path.exists(f"data/{buildingid}/img_default/{part}.png"):
            continue
        xlen = math.ceil(int(value["mapSizeX"]) / 256)
        ylen = math.ceil(int(value["mapSizeY"]) / 256)

        width = 0
        imgs = []
        for x in range(int(xlen)):
            height = 0
            imgs.append([])
            for y in range(int(ylen)):
                imgs[-1].append(Image.open(f"data/{buildingid}/map/{part}/{x}_{y}.png"))
                height += imgs[-1][-1].size[1]
            width += imgs[-1][0].size[0]

        print(f"Stitching {buildingid} {part}")
        new_img = Image.new("RGB", (width, height))
        x_offset = 0
        for imglist in imgs:
            y_offset = 0
            for img in imglist:
                new_img.paste(img, (x_offset, y_offset))
                y_offset += img.size[1]
            x_offset += img.size[0]

        try:
            new_img.save(f"data/{buildingid}/img_default/{part}.png")
        except KeyboardInterrupt:
            print(f"plase wait otherwise the image will be corrupted (data/{buildingid}/img_default/{part}.png)")
            new_img.save(f"data/{buildingid}/img_default/{part}.png")
            exit()
        print(f"Done {buildingid} {part}")


for i, x in enumerate(getbuildingsJSON()):
    print(f"{i+1}/{len(getbuildingsJSON())} {x['code']}")
    stitch(x["code"])
