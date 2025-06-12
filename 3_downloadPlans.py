import math
import json
import requests
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

# download room plans


def getbuildingsJSON():
    with open("data_buildingsJSON.json", encoding="UTF-8") as f:
        return json.load(f)


def getUniqueBuildingParts(buildingid):
    with open(f"data/{buildingid}/uniqueBuildingParts.json", encoding="UTF-8") as f:
        return json.load(f)


def download_tile(buildingid, part, name, x, y, i, m):
    url = f"https://cms-static.uni-muenchen.de/lmu-roomfinder-4b38a548/tiles/v3/{name}/1000/{x}/{y}.png"
    if os.path.exists(f"data/{buildingid}/map/{part}/{x}_{y}.png"):
        return  # Skip existing files

    print(f"{buildingid} ({i}/{m}) {name} {x} {y}")
    img = requests.get(url)

    if img.status_code >= 400:
        print(f"Error fetching URL: {url}")
        print(img.text)
        return

    # Ensure directory exists
    os.makedirs(f"data/{buildingid}/map/{part}/", exist_ok=True)

    # Save the image
    with open(f"data/{buildingid}/map/{part}/{x}_{y}.png", "wb") as f:
        f.write(img.content)


def download_building(buildingid, i, m, max_workers=5):
    buildingParts = getUniqueBuildingParts(buildingid)
    tasks = []

    # Use ThreadPoolExecutor to download in parallel
    for part, value in buildingParts.items():
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            name = value["mapUri"].replace(".pdf", "")
            xlen = math.ceil(int(value["mapSizeX"]) / 256)
            ylen = math.ceil(int(value["mapSizeY"]) / 256)

            # Schedule tasks for downloading each tile
            for x in range(xlen):
                for y in range(ylen):
                    tasks.append(
                        executor.submit(
                            download_tile, buildingid, part, name, x, y, i, m
                        )
                    )

            # Monitor the progress of downloads
            for future in as_completed(tasks):
                future.result()  # Raise exceptions if any


buildings = getbuildingsJSON()

# Parallelize the download of different buildings
for i, building in enumerate(buildings):
    download_building(building["code"], i, len(buildings))
