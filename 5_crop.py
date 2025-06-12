import json
from PIL import Image
import os

# remove empty white space at top bottom left right


def getbuildingsJSON():
    with open("data_buildingsJSON.json", encoding="UTF-8") as f:
        return json.load(f)


def getUniqueBuildingParts(buildingid):
    with open(f"data/{buildingid}/uniqueBuildingParts.json", encoding="UTF-8") as f:
        return json.load(f)




def crop(buildingid):
    buildingParts = getUniqueBuildingParts(buildingid)

    for part, value in buildingParts.items():
        if os.path.exists(f"data/{buildingid}/crop_{part}.png") and os.path.exists(
            f"data/{buildingid}/cropInfo_{part}.json"
        ):
            continue

        img = Image.open(f"data/{buildingid}/{part}.png")

        # left
        leftCut = 0
        while True:
            allWhite = True
            for y in range(img.size[1]):
                if img.getpixel((leftCut, y))[0] != 255:
                    allWhite = False
                    break

            if not allWhite:
                break
            leftCut += 1
        print("leftCut", leftCut)

        # top
        topCut = 0
        while True:
            allWhite = True
            for x in range(img.size[0]):
                if img.getpixel((x, topCut))[0] != 255:
                    allWhite = False
                    break

            if not allWhite:
                break
            topCut += 1
        print("topCut", topCut)

        # right
        rightCut = img.size[0]
        while True:
            allWhite = True
            for y in range(img.size[1]):
                if img.getpixel((rightCut - 1, y))[0] != 255:
                    allWhite = False
                    break

            if not allWhite:
                break
            rightCut -= 1
        print("rightCut", rightCut)

        # bottom
        bottomCut = img.size[1]
        while True:
            allWhite = True
            for x in range(img.size[0]):
                if img.getpixel((x, bottomCut - 1))[0] != 255:
                    allWhite = False
                    break

            if not allWhite:
                break
            bottomCut -= 1
        print("bottomCut", bottomCut)
        print("buildingid", buildingid)
        newImg = img.crop((leftCut, topCut, rightCut, bottomCut))
        data = {
            "leftCut": leftCut,
            "topCut": topCut,
            "rightCut": rightCut,
            "bottomCut": bottomCut,
            "width": newImg.size[0],
            "height": newImg.size[1],
            "oldWidth": img.size[0],
            "oldHeight": img.size[1],
        }
        try:
            newImg.save(f"data/{buildingid}/crop_{part}.png")
            with open(
                f"data/{buildingid}/cropInfo_{part}.json", "w", encoding="UTF-8"
            ) as f:
                json.dump(
                    data,
                    f,
                )
        except KeyboardInterrupt:
            print("plase wait...")
            newImg.save(f"data/{buildingid}/crop_{part}.png")
            with open(
                f"data/{buildingid}/cropInfo_{part}.json", "w", encoding="UTF-8"
            ) as f:
                json.dump(
                    data,
                    f,
                )
            exit()


for x in getbuildingsJSON():
    crop(x["code"])
