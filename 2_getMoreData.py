import requests
import json
import os


# download image, rooms and uniqueBuildingParts for every building

with open("data_buildingsJSON.json", encoding="UTF-8") as f:
    buildings = json.load(f)

try:
    os.mkdir("data")
except FileExistsError:
    pass

for building in buildings:
    print(building["code"])
    try:
        os.mkdir(f"data/{building['code']}")
    except FileExistsError:
        pass

    uniqueBuildingPartsUrl = f"https://www.lmu.de/raumfinder/json/uniqueBuildingParts/{building['code']}.json"
    uniqueBuildingParts = requests.get(uniqueBuildingPartsUrl)
    with open(f"data/{building['code']}/uniqueBuildingParts.json", "wb") as f:
        f.write(uniqueBuildingParts.content)

    roomsUrl = f"https://www.lmu.de/raumfinder/json/rooms/{building['code']}.json"
    rooms = requests.get(roomsUrl)
    with open(f"data/{building['code']}/rooms.json", "wb") as f:
        f.write(rooms.content)
