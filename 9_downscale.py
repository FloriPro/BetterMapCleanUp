from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import math
import json
from PIL import Image, ImageDraw, ImageChops
import os
import io
from PIL import ImageFilter
from PIL import ImageFilter

Image.MAX_IMAGE_PIXELS = None


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


def downscale(buildingid, building, adding, viewtype, scale):
    buildingParts = getUniqueBuildingParts(buildingid)
    for part, value in buildingParts.items():
        savePath = f"data/{buildingid}/{adding.replace('<part>', part)}"
        if os.path.exists(savePath) == True:
            continue
        print(f"[buildingid]: {buildingid}, [part]: {part}, [viewtype]: {viewtype}")
        img = Image.open(f"data/{buildingid}/{viewtype}/{part}.png")
        img = img.resize((img.size[0] // scale, img.size[1] // scale))
        img.save(savePath)


bj = getbuildingsJSON()
for i, x in enumerate(bj):
    if not os.path.exists(f"data/{x['code']}/downscale"):
        os.makedirs(f"data/{x['code']}/downscale", exist_ok=True)
        
    print(f"[{x['code']}]: {i}/{len(bj)}")
    for viewtype in ["rotation", "clear"]:
        if not os.path.exists(f"data/{x['code']}/downscale/{viewtype}"):
            os.makedirs(f"data/{x['code']}/downscale/{viewtype}", exist_ok=True)
        downscale(
            x["code"], x, f"downscale/{viewtype}/<part>_midhiquality.png", viewtype, 2
        )
        downscale(
            x["code"], x, f"downscale/{viewtype}/<part>_downscale.png", viewtype, 8
        )
        downscale(
            x["code"], x, f"downscale/{viewtype}/<part>_maxdownscale.png", viewtype, 40
        )
