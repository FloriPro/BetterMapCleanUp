import time
import os, json
import pygame
from PIL import Image, ImageDraw

pygame.init()
screen = pygame.display.set_mode((1600, 800))


def getbuildingsJSON():
    with open("data_buildingsJSON.json", encoding="UTF-8") as f:
        return json.load(f)


def getUniqueBuildingParts(buildingid):
    with open(f"data/{buildingid}/uniqueBuildingParts.json", encoding="UTF-8") as f:
        return json.load(f)


def getRooms(buildingid, partid):
    with open(f"data/{buildingid}/rooms/{partid}.json", encoding="UTF-8") as f:
        return json.load(f)


def getCropInfo(buildingid, part):
    with open(f"data/{buildingid}/crop/{part}_info.json", encoding="UTF-8") as f:
        return json.load(f)


def checkRooms(buildingid, i, m):
    print(f"{i}/{m} {buildingid}")
    uniqueBuildingParts = getUniqueBuildingParts(buildingid)
    for part in uniqueBuildingParts:
        rooms = getRooms(buildingid, part)
        cropInfo = getCropInfo(buildingid, part)
        i = Image.open(f"data/{buildingid}/rotation/{part}.png")
        iog = Image.open(f"data/{buildingid}/crop/{part}.png")
        draw = ImageDraw.Draw(i)
        drawog = ImageDraw.Draw(iog)
        so = 10
        for room in rooms:
            x = room["npX"]
            y = room["npY"]
            draw.rectangle((x - so, y - so, x + so, y + so), fill="red")
            xog = room["pX"]
            yog = room["pY"]
            drawog.rectangle(
                (
                    xog - so,
                    yog - so,
                    xog + so,
                    yog + so,
                ),
                fill="blue",
            )

        # clear pygame screen
        screen.fill((0, 0, 0))

        # ogimg = pygame.image.load(f"data/{buildingid}/clear/{part}.png")
        ogimg = pygame.image.fromstring(iog.tobytes(), iog.size, iog.mode)
        pgimg = pygame.image.fromstring(i.tobytes(), i.size, i.mode)
        # scale to fit 800, 800
        pgimg = pygame.transform.scale(pgimg, (800, 800))
        ogimg = pygame.transform.scale(ogimg, (800, 800))
        screen.blit(pgimg, (0, 0))
        screen.blit(ogimg, (800, 0))

        running = True
        while running:
            pygame.display.flip()
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    exit()
                    return
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_SPACE:
                        running = False


buildings = getbuildingsJSON()
checkRooms(buildings[0]["code"], 1, len(buildings))
for i, building in enumerate(buildings):
    checkRooms(building["code"], i, len(buildings))
