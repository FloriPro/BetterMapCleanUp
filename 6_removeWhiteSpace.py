import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from attr import has
import requests
import math
import json
from PIL import Image, ImageDraw, ImageChops
import os
import io
from PIL import ImageFilter
from PIL import ImageFilter
import cv2
import numpy as np

Image.MAX_IMAGE_PIXELS = None

# remove inner white space on non rotated images


def are_images_equal(img1, img2):
    equal_size = img1.height == img2.height and img1.width == img2.width

    if img1.mode == img2.mode == "RGBA":
        img1_alphas = [pixel[3] for pixel in img1.getdata()]
        img2_alphas = [pixel[3] for pixel in img2.getdata()]
        equal_alphas = img1_alphas == img2_alphas
    else:
        equal_alphas = True

    equal_content = not ImageChops.difference(
        img1.convert("RGB"), img2.convert("RGB")
    ).getbbox()

    return equal_size and equal_alphas and equal_content


def getbuildingsJSON():
    with open("data_buildingsJSON.json", encoding="UTF-8") as f:
        return json.load(f)


def getUniqueBuildingParts(buildingid):
    with open(f"data/{buildingid}/uniqueBuildingParts.json", encoding="UTF-8") as f:
        return json.load(f)


# buildingOtherChecks = {
#    "bw0000": {
#        "g0030-1": [
#            [2436, 3468],
#            [2898, 1503],
#        ]
#    }
# }

boudingRoomsbigSpots = {
    "bw0000": {
        "g003000": [[3348, 1874], [5291, 1899]],
        "g003091": [[3245, 1770], [5204, 1846]],
        "g003001": [[3298, 1868], [5254, 1913]],
        "g003002": [[3298, 1868], [5254, 1913]],
        "g003003": [[3298, 1868], [5254, 1913]],
        "g003091": [[3298, 1868], [5254, 1913]],
        "g003092": [[3298, 1868], [5254, 1913]],
        "g003093": [[3298, 1868], [5254, 1913]],
        "g0030-1": [[3298, 1868], [5254, 1913]],
    }
}

HaltAfterOne = False


def make(buildingid, building):
    hasDoneStuff = False
    buildingParts = getUniqueBuildingParts(buildingid)
    for part, value in buildingParts.items():
        if hasDoneStuff and HaltAfterOne:
            print(f"[buildingid]: {buildingid}, [part]: {part}")
            exit()
        if os.path.exists(f"data/{buildingid}/clear_{part}.png") == True:
            continue
        hasDoneStuff = True
        print(f"[buildingid]: {buildingid}, [part]: {part}")
        img = Image.open(f"data/{buildingid}/crop_{part}.png")
        # make img rgba
        img = img.convert("RGBA")
        # remove white colors
        imgMask = img.copy()
        imgMask = imgMask.convert("L")
        imgMask = imgMask.filter(ImageFilter.GaussianBlur(radius=2))

        offset = 2

        toCheckStarts = [
            (offset, offset),
            (imgMask.size[0] - 1 - offset, imgMask.size[1] - 1 - offset),
            (offset, imgMask.size[1] - 1 - offset),
            (imgMask.size[0] - 1 - offset, offset),
        ]
        startPoints = []
        for start in toCheckStarts:
            if imgMask.getpixel(start) >= 250:
                startPoints.append(start)

        if len(startPoints) == 0:
            print("ERROR No White Pixel")
            exit()

        # search for big spots of white
        bigSpots = []
        if (
            buildingid in boudingRoomsbigSpots
            and part in boudingRoomsbigSpots[buildingid]
        ):
            bigSpots = boudingRoomsbigSpots[buildingid][part]
        startPoints.extend(bigSpots)

        for i, startPoint in enumerate(startPoints):
            if imgMask.getpixel(startPoint) >= 250:
                # floodfill from startPoint (0,0,0,0)
                print("floodfill ", i, "/", len(startPoints))
                ImageDraw.floodfill(imgMask, startPoint, (0))
                # make all over 0 255
            # else:
            #    print("allready replaced")
        imgMask = Image.eval(imgMask, lambda x: 0 if x == 0 else 255)
        img.putalpha(imgMask)
        print("Finished")
        try:
            img.save(f"data/{buildingid}/clear_{part}.png")
        except KeyboardInterrupt:
            print("please wait...")
            img.save(f"data/{buildingid}/clear_{part}.png")
            exit()


bj = getbuildingsJSON()
for i, x in enumerate(bj):
    print(f"[{x['code']}]: {i}/{len(bj)}")
    make(x["code"], x)
