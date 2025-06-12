import enum
import gc
import shutil
import threading
import time
from PIL import Image as PILImage
from PIL import ImageDraw
from PIL import ImageFont
import math
import json
import os
import numpy
from sympy import zoo
from ulid import T
import functools

with open("../data/app_data.json", "r") as f:
    data = json.load(f)

TILE_DOWN_SCALE = 2
TILE_SIZE = 256 * 2 * TILE_DOWN_SCALE
MULTITHREAD = True
DEBUG = False

hiddenBuildings = [
    "bw0040",
    "bw0073",
    "bw0110",
    "bw0121",
    "bw0122",
    "bw0801",
    "bw0820",
    "bw1110",
    "bw1502",
    "bw1541",
]


def multithreaded(threads, maxThreads):
    if not MULTITHREAD:
        for thread in threads:
            try:
                print(f" + {thread.name}")
                thread.start()
                thread.join()
                print(f" - {thread.name}")
            except KeyboardInterrupt:
                print("KeyboardInterrupt")
                exit(1)
        return

    runningThreads = []
    sem = threading.Semaphore(maxThreads)

    def dummyThread(thread):
        print(f" + {thread.name}")
        thread.start()
        thread.join()
        sem.release()
        print(f" - {thread.name}")

    # start threads
    for i, thread in enumerate(threads):
        try:
            sem.acquire()
        except KeyboardInterrupt:
            print("KeyboardInterrupt")
            exit(1)
        t = threading.Thread(
            target=dummyThread,
            args=(thread,),
            daemon=True,
            # hide thread from debugger
        )
        runningThreads.append(t)
        t.start()
    # wait for semaphore to be released
    for thread in runningThreads:
        thread.join()

    return


def find_coeffs(pa, pb):
    matrix = []
    for p1, p2 in zip(pa, pb):
        matrix.append([p1[0], p1[1], 1, 0, 0, 0, -p2[0] * p1[0], -p2[0] * p1[1]])
        matrix.append([0, 0, 0, p1[0], p1[1], 1, -p2[1] * p1[0], -p2[1] * p1[1]])

    A = numpy.matrix(matrix, dtype=float)
    B = numpy.array(pb).reshape(8)

    res = numpy.dot(numpy.linalg.inv(A.T * A) * A.T, B)
    return numpy.array(res).reshape(8)


class LatLng:
    def __init__(self, lat, lng):
        self.lat = lat
        self.lng = lng

    def getTile(self, zoom: int) -> tuple[int, int]:
        p = self.toPixels(zoom)
        return p[0] // TILE_SIZE, p[1] // TILE_SIZE

    @functools.cache
    def toPixels(self, zoom: int) -> tuple[int, int]:
        lat = self.lat * math.pi / 180
        lng = self.lng * math.pi / 180

        x = TILE_SIZE * (lng + math.pi) / (2 * math.pi) * (2**zoom)
        y = (
            TILE_SIZE
            * (math.pi - math.log(math.tan(lat) + 1 / math.cos(lat)))
            / (2 * math.pi)
            * (2**zoom)
        )

        return int(x), int(y)


class MapImage:
    def __init__(
        self,
        image_path_hq: str,
        image_path_lq: str,
        cornerTopLeft: LatLng,
        cornerTopRight: LatLng,
        cornerBottomLeft: LatLng,
        cornerBottomRight: LatLng,
    ):
        self.cornerTopLeft = cornerTopLeft
        self.cornerTopRight = cornerTopRight
        self.cornerBottomLeft = cornerBottomLeft
        self.cornerBottomRight = cornerBottomRight

        self.image_path_hq = image_path_hq
        self.image_path_lq = image_path_lq

    def img(self, zoom: int):
        if zoom >= 18:
            return self.img_hq()
        else:
            return self.img_lq()

    def img_hq(self):
        if not hasattr(self, "_img_hq"):
            self._img_hq = PILImage.open(self.image_path_hq).convert("RGBA")
        return self._img_hq

    def img_lq(self):
        if not hasattr(self, "_img_lq"):
            self._img_lq = PILImage.open(self.image_path_lq).convert("RGBA")
        return self._img_lq


class MapPilImage:
    def __init__(
        self,
        pilImg: PILImage.Image,
        cornerTopLeft: LatLng,
        cornerTopRight: LatLng,
        cornerBottomLeft: LatLng,
        cornerBottomRight: LatLng,
    ):
        self.pilImg = pilImg
        self.cornerTopLeft = cornerTopLeft
        self.cornerTopRight = cornerTopRight
        self.cornerBottomLeft = cornerBottomLeft
        self.cornerBottomRight = cornerBottomRight

    def img(self, zoom: int):
        return self.pilImg


def createFolder(folder_path: str):
    if os.path.exists(folder_path):
        print(f"Removing folder: {folder_path}")
        shutil.rmtree(folder_path)
    os.makedirs(folder_path, exist_ok=True)


class MapTiling:
    def __init__(self, tilePrefix: str):
        self.tilePrefix = tilePrefix
        self.images: list[MapImage] = []

    # cache
    @functools.cache
    def getPadding(self, zoom: int) -> int:
        p = math.ceil(math.log2(zoom))
        # print(f"Padding: {p}")
        return p

    def add_image(self, image: MapImage):
        # check image type
        if not isinstance(image, MapImage) and not isinstance(image, MapPilImage):
            raise TypeError("image must be an instance of MapImage")
        self.images.append(image)

    def makeX(self, x, tiles, zoom: int):
        createFolder(f"tiles/{self.tilePrefix}/{zoom}/{x}")
        #    for y in range(tilesMinY, tilesMaxY + 1):
        for y in tiles:
            tile = PILImage.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))

            hasImage = False
            for image in self.images:
                # print(image)
                # get pixel coordinates of the image corners
                topLeft = image.cornerTopLeft.toPixels(zoom)
                topRight = image.cornerTopRight.toPixels(zoom)
                bottomLeft = image.cornerBottomLeft.toPixels(zoom)
                bottomRight = image.cornerBottomRight.toPixels(zoom)

                box = {
                    "top": min(topLeft[1], topRight[1], bottomLeft[1], bottomRight[1])
                    // TILE_SIZE,
                    "bottom": max(
                        topLeft[1], topRight[1], bottomLeft[1], bottomRight[1]
                    )
                    // TILE_SIZE,
                    "left": min(topLeft[0], topRight[0], bottomLeft[0], bottomRight[0])
                    // TILE_SIZE,
                    "right": max(topLeft[0], topRight[0], bottomLeft[0], bottomRight[0])
                    // TILE_SIZE,
                }

                # Check if any of the image corners are within the tile bounds
                if (box["left"] <= x <= box["right"]) and (
                    box["top"] <= y <= box["bottom"]
                ):
                    hasImage = True

                    img = image.img(zoom)

                    # The image will be warped into the pixel-space quad
                    src_quad = [
                        (0, 0),
                        (img.width, 0),
                        (img.width, img.height),
                        (0, img.height),
                    ]
                    topLeftLocal = (
                        topLeft[0] - x * TILE_SIZE,
                        topLeft[1] - y * TILE_SIZE,
                    )
                    topRightLocal = (
                        topRight[0] - x * TILE_SIZE,
                        topRight[1] - y * TILE_SIZE,
                    )
                    bottomLeftLocal = (
                        bottomLeft[0] - x * TILE_SIZE,
                        bottomLeft[1] - y * TILE_SIZE,
                    )
                    bottomRightLocal = (
                        bottomRight[0] - x * TILE_SIZE,
                        bottomRight[1] - y * TILE_SIZE,
                    )
                    dst_quad = [
                        topLeftLocal,
                        topRightLocal,
                        bottomRightLocal,
                        bottomLeftLocal,
                    ]

                    # print(dst_quad)

                    # Warp the image using the destination quad
                    # print(f"({x}, {y})")
                    warped_img = img.transform(
                        size=(TILE_SIZE, TILE_SIZE),
                        method=PILImage.PERSPECTIVE,
                        data=find_coeffs(dst_quad, src_quad),
                        resample=PILImage.BICUBIC,
                    )

                    offsetx = 0
                    offsety = 0

                    # add red point to show tile coordinates
                    if DEBUG:
                        tile_draw = ImageDraw.Draw(tile)

                        def point(x, y):
                            tile_draw.ellipse(
                                (x - 2, y - 2, x + 2, y + 2),
                                fill=(255, 0, 0),
                            )

                        point(topLeftLocal[0], topLeftLocal[1])
                        point(topRightLocal[0], topRightLocal[1])
                        point(bottomLeftLocal[0], bottomLeftLocal[1])
                        point(bottomRightLocal[0], bottomRightLocal[1])

                    tile.paste(warped_img, (offsetx, offsety), warped_img)

            if hasImage:
                if DEBUG:
                    # add background rectangle for text
                    draw = ImageDraw.Draw(tile)
                    font = ImageFont.load_default()
                    text = f"{x}, {y}"
                    text_size = font.getbbox(text)[2:]
                    text_x = (TILE_SIZE - text_size[0]) // 2
                    text_y = (TILE_SIZE - text_size[1]) // 2
                    padding = 5
                    background_x0 = text_x - padding
                    background_y0 = text_y - padding
                    background_x1 = text_x + text_size[0] + padding
                    background_y1 = text_y + text_size[1] + padding
                    draw.rectangle(
                        [
                            background_x0,
                            background_y0,
                            background_x1,
                            background_y1,
                        ],
                        fill=(0, 0, 0, 128),
                    )
                    # add text to say tile coordinates
                    draw.text((text_x, text_y), text, fill=(255, 255, 255), font=font)

                # tile.save(f"tiles/{self.tilePrefix}/{zoom}/{x}/{y}.png")
                # downscale tile by TILE_DOWN_SCALE
                downscaled = tile.resize(
                    (
                        tile.width // TILE_DOWN_SCALE,
                        tile.height // TILE_DOWN_SCALE,
                    ),
                    resample=PILImage.LANCZOS,
                )
                downscaled.save(
                    f"tiles/{self.tilePrefix}/{zoom}/{x}/{y}.png",
                    optimize=True,
                    quality=95,
                )
            del tile

    def makeZoom(self, zoom: int):
        createFolder(f"tiles/{self.tilePrefix}/{zoom}")

        tiles = {}

        def addBox(topLeft, topRight, bottomLeft, bottomRight):
            # add to tiles dict
            nonlocal tiles
            box = {
                "top": min(topLeft[1], topRight[1], bottomLeft[1], bottomRight[1]),
                "bottom": max(topLeft[1], topRight[1], bottomLeft[1], bottomRight[1]),
                "left": min(topLeft[0], topRight[0], bottomLeft[0], bottomRight[0]),
                "right": max(topLeft[0], topRight[0], bottomLeft[0], bottomRight[0]),
            }
            for x in range(box["left"], box["right"] + 1):
                if not tiles.get(x):
                    tiles[x] = []
                for y in range(box["top"], box["bottom"] + 1):
                    if y not in tiles[x]:
                        tiles[x].append(y)

        for image in self.images:
            addBox(
                image.cornerTopLeft.getTile(zoom),
                image.cornerTopRight.getTile(zoom),
                image.cornerBottomLeft.getTile(zoom),
                image.cornerBottomRight.getTile(zoom),
            )
        # print("Tiles:", tiles)

        # for x in range(tilesMinX, tilesMaxX + 1):
        threads = []
        for i, x in enumerate(tiles.keys()):
            # print(f"{i} /{len(tiles.keys())}")
            # self.makeX(x, tiles[x], zoom)
            thread = threading.Thread(
                target=self.makeX,
                args=(x, tiles[x], zoom),
                daemon=True,
            )
            thread.name = f"Zoom {zoom} X {x}."
            threads.append(thread)

        multithreaded(threads, maxThreads=zoom - 2)

    def make(self, minZoom: int, maxZoom: int):
        createFolder(f"tiles/{self.tilePrefix}")
        threads = []
        for zoom in range(minZoom, maxZoom + 1):
            thread = threading.Thread(
                target=self.makeZoom,
                args=(zoom,),
                daemon=True,
            )
            thread.name = f"Zoom {zoom}."
            threads.append(thread)

        multithreaded(threads, 10)

        gc.collect()


def planTiler(minZoom, maxZoom):
    createFolder(f"tiles")
    # map_tiling = MapTiling()

    levels = {}

    for buildingId, building in data["part"].items():
        if buildingId in hiddenBuildings:
            continue
        for partid, part in building["parts"].items():
            if not levels.get(part["level"]):
                levels[part["level"]] = MapTiling(part["level"])

    for buildingId, building in data["part"].items():
        if buildingId in hiddenBuildings:
            continue
        hasLevels = set()
        for partid, part in building["parts"].items():
            poly = part["polyInfo"]["poly"]
            mapThisImg = MapImage(
                image_path_hq=f"../data/{buildingId}/clear_{partid}.png",
                image_path_lq=f"../data/{buildingId}/downscale_clear_{partid}.png",
                cornerTopLeft=LatLng(poly["topLeft"]["lat"], poly["topLeft"]["lng"]),
                cornerTopRight=LatLng(poly["topRight"]["lat"], poly["topRight"]["lng"]),
                cornerBottomLeft=LatLng(
                    poly["bottomLeft"]["lat"], poly["bottomLeft"]["lng"]
                ),
                cornerBottomRight=LatLng(
                    poly["bottomRight"]["lat"], poly["bottomRight"]["lng"]
                ),
            )
            levels[part["level"]].add_image(mapThisImg)
            hasLevels.add(part["level"])

        if DEBUG:
            print(f"Building {buildingId} has parts on levels: {hasLevels}")

        if len(hasLevels) < len(levels.keys()):
            # take the eg level of this building
            eg = filter(lambda x: x[1]["level"] == "EG", building["parts"].items())
            eg = list(eg)
            if len(eg) == 0:
                hasLevelsCopy = hasLevels.copy()
                eg = filter(
                    lambda x: x[1]["level"] == hasLevelsCopy.pop(),
                    building["parts"].items(),
                )
                eg = list(eg)
                if len(eg) == 0:
                    print(
                        f"Building {buildingId} has no levels, skipping ({hasLevels})"
                    )
                    continue
            (egpartid, eg) = eg[0]
            print("using default level EG for building", eg["level"], buildingId)

            egImg = PILImage.open(
                f"../data/{buildingId}/clear_{egpartid}.png"
            ).convert("RGBA")
            # make everything that is not transparent white
            img_array = numpy.array(egImg)
            non_transparent = img_array[:, :, 3] > 0
            # Set non-transparent pixels to white (255, 255, 255, 255)
            img_array[non_transparent] = [200, 200, 200, 255]

            # Set transparent pixels to fully transparent (0, 0, 0, 0)
            img_array[~non_transparent] = [0, 0, 0, 0]

            # Convert back to PIL image
            egImg = PILImage.fromarray(img_array, mode="RGBA")

            for level in levels.keys():
                if level not in hasLevels:
                    if DEBUG:
                        print(
                            f"Building {buildingId} add level {level} with empty image"
                        )

                    poly = eg["polyInfo"]["poly"]
                    mapPilThisImg = MapPilImage(
                        pilImg=egImg,
                        cornerTopLeft=LatLng(
                            poly["topLeft"]["lat"], poly["topLeft"]["lng"]
                        ),
                        cornerTopRight=LatLng(
                            poly["topRight"]["lat"], poly["topRight"]["lng"]
                        ),
                        cornerBottomLeft=LatLng(
                            poly["bottomLeft"]["lat"], poly["bottomLeft"]["lng"]
                        ),
                        cornerBottomRight=LatLng(
                            poly["bottomRight"]["lat"], poly["bottomRight"]["lng"]
                        ),
                    )
                    levels[level].add_image(mapPilThisImg)


    for level, tiler in levels.items():
        print(f"Level: {level}")
        tiler.make(minZoom, maxZoom)


if __name__ == "__main__":
    planTiler(minZoom=12, maxZoom=21)
