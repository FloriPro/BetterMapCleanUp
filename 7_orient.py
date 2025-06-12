import math
import pygame
import json
from PIL import Image
import os
from PIL import ImageChops

# rotate all images to north, with user input

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


cornersize = 450
pygame.init()

pygame.display.set_mode((cornersize * 2 + 1, cornersize * 2 + 1))
screen = pygame.display.get_surface()
pygame.display.flip()

clock = pygame.time.Clock()


def toPygame(img):
    return pygame.image.frombuffer(img.tobytes(), img.size, "RGBA")


def getbuildingsJSON():
    with open("data_buildingsJSON.json", encoding="UTF-8") as f:
        return json.load(f)


def getUniqueBuildingParts(buildingid):
    with open(f"data/{buildingid}/uniqueBuildingParts.json", encoding="UTF-8") as f:
        return json.load(f)


def make(buildingid):
    buildingParts = getUniqueBuildingParts(buildingid)
    lastCorners = None
    lastRotation = None
    selectedCorner = None
    for part, value in buildingParts.items():
        print(f"[buildingid]: {buildingid}, [part]: {part}")
        img = Image.open(f"data/{buildingid}/clear_{part}.png")

        if os.path.exists(f"data/{buildingid}/rotation_{part}.json"):
            continue

        currCorners = [
            img.crop((0, 0, cornersize, cornersize)),  # top left
            img.crop(
                (img.size[0] - cornersize, 0, img.size[0], cornersize)
            ),  # top right
            img.crop(
                (0, img.size[1] - cornersize, cornersize, img.size[1])
            ),  # bottom left
            img.crop(
                (
                    img.size[0] - cornersize,
                    img.size[1] - cornersize,
                    img.size[0],
                    img.size[1],
                )
            ),  # bottom right
        ]

        if lastRotation and are_images_equal(
            currCorners[selectedCorner], lastCorners[selectedCorner]
        ):
            rotation = lastRotation
        else:
            # get corners of img
            imgCorners = [
                toPygame(currCorners[0]),
                toPygame(currCorners[1]),
                toPygame(currCorners[2]),
                toPygame(currCorners[3]),
            ]
            lastCorners = [
                img.crop((0, 0, cornersize, cornersize)),  # top left
                img.crop(
                    (img.size[0] - cornersize, 0, img.size[0], cornersize)
                ),  # top right
                img.crop(
                    (0, img.size[1] - cornersize, cornersize, img.size[1])
                ),  # bottom left
                img.crop(
                    (
                        img.size[0] - cornersize,
                        img.size[1] - cornersize,
                        img.size[0],
                        img.size[1],
                    )
                ),  # bottom right
            ]

            # display on screen
            def display():
                screen.fill((0, 0, 255))
                screen.blit(imgCorners[0], (0, 0))
                screen.blit(imgCorners[1], (cornersize + 1, 0))
                screen.blit(imgCorners[2], (0, cornersize + 1))
                screen.blit(imgCorners[3], (cornersize + 1, cornersize + 1))

            linestart = (None, None)
            lineend = (None, None)
            pressed = False
            finish = False
            while not finish:
                clock.tick(60)
                for event in pygame.event.get():
                    if event.type == pygame.QUIT:
                        pygame.quit()
                        exit()
                    if event.type == pygame.MOUSEBUTTONDOWN:
                        if event.button == 1:  # left mouse button
                            linestart = pygame.mouse.get_pos()
                            lineend = pygame.mouse.get_pos()
                            pressed = True
                    if event.type == pygame.MOUSEBUTTONUP:
                        if event.button == 1:  # left mouse button
                            pressed = False
                            finish = True
                    if event.type == pygame.MOUSEMOTION:
                        if pressed:  # left mouse button
                            lineend = pygame.mouse.get_pos()
                display()
                if linestart[0] != None:
                    pygame.draw.line(screen, (255, 0, 0), linestart, lineend, 1)
                pygame.display.flip()

            if linestart[0] < 100:
                if linestart[1] < 100:
                    selectedCorner = 0
                else:
                    selectedCorner = 2
            else:
                if linestart[1] < 100:
                    selectedCorner = 1
                else:
                    selectedCorner = 3

            # calc rotation
            rotation = math.atan2(lineend[1] - linestart[1], lineend[0] - linestart[0])
            rotation = math.degrees(rotation) + 90
            lastRotation = rotation
        # display text that rotation and selectedCorner
        screen.fill((0, 0, 0))
        font = pygame.font.Font(None, 36)
        text = font.render(
            f"Rotation: {rotation:.2f}°",
            True,
            (255, 255, 255),
        )
        text2 = font.render(
            f"Part: {part}",
            True,
            (255, 255, 255),
        )
        text3 = font.render(
            f"Please wait...",
            True,
            (255, 255, 255),
        )
        screen.blit(text, (10, 10))
        screen.blit(text2, (10, 50))
        screen.blit(text3, (10, 90))
        pygame.display.flip()

        print(rotation, selectedCorner)
        with open(
            f"data/{buildingid}/rotation_{part}.json", "w", encoding="UTF-8"
        ) as f:
            json.dump(rotation, f)
        imgrotate = img.rotate(rotation, expand=True, fillcolor=(255, 255, 255,0))
        imgrotate.save(f"data/{buildingid}/rotate_{part}.png")


bj = getbuildingsJSON()
for i, x in enumerate(bj):
    print(f"{i}/{len(bj)}")
    make(x["code"])
