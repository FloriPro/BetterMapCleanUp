# combine all json data needed in one big file, to improve performance
import json

with open("data_buildingsJSON.json", encoding="UTF-8") as f:
    buildings = json.load(f)

output = {"buildings": buildings, "buildingParts": {}, "part": {}}

appOutput = {"part": {}}

for building in buildings:
    print(building["code"])
    # data/${buildingid}/uniqueBuildingParts.json
    with open(
        f"data/{building['code']}/uniqueBuildingParts.json", encoding="UTF-8"
    ) as f:
        buildingPart = json.load(f)

    output["buildingParts"][building["code"]] = buildingPart
    output["part"][building["code"]] = {}
    appOutput["part"][building["code"]] = {
        "parts": {},
        "building": building,
    }

    for part in buildingPart.keys():
        with open(f"data/{building['code']}/rooms_{part}.json", encoding="UTF-8") as f:
            rooms = json.load(f)

        with open(
            f"data/{building['code']}/mapInfo_{part}.json", encoding="UTF-8"
        ) as f:
            mapInfo = json.load(f)

        # `/data/${building.code}/rotation_${part}.json`
        with open(
            f"data/{building['code']}/rotation_{part}.json", encoding="UTF-8"
        ) as f:  # rotation data is not used yet
            rotation = json.load(f)
        with open(
            f"data/{building['code']}/polyInfo_{part}.json", encoding="UTF-8"
        ) as f:  # rotation data is not used yet
            polyInfo = json.load(f)
        with open(
            f"data/{building['code']}/rooms_latlng_{part}.json", encoding="UTF-8"
        ) as f:  # rotation data is not used yet
            latlngRooms = json.load(f)["rooms"]

        output["part"][building["code"]][part] = {
            "rooms": rooms,
            "mapInfo": mapInfo,
            "rotation": rotation,
            "polyInfo": polyInfo,
        }
        appOutput["part"][building["code"]]["parts"][part] = {
            "polyInfo": polyInfo,
            "level": buildingPart[part]["level"],
            "rooms": latlngRooms,
        }

with open("data/data.json", "w", encoding="UTF-8") as f:
    json.dump(output, f)

with open("data/app_data.json", "w", encoding="UTF-8") as f:
    json.dump(appOutput, f)
