import json
import os

with open("data_buildingsJSON.json", encoding="UTF-8") as f:
    buildings = json.load(f)


for building in buildings:
    if not os.path.exists(f"data/{building['code']}/routing"):
        continue
    with open(
        f"data/{building['code']}/uniqueBuildingParts.json", encoding="UTF-8"
    ) as f:
        buildingPart = json.load(f)
    if not os.path.exists(f"data/{building['code']}/routing/connectedMarkers.json"):
        continue

    routingData = {"lines": [], "points": {}}
    for part in buildingPart.keys():
        if not os.path.exists(f"data/{building['code']}/routing/{part}.json"):
            continue
        with open(
            f"data/{building['code']}/routing/{part}.json", encoding="UTF-8"
        ) as f:
            try:
                routing = json.load(f)
            except json.JSONDecodeError as e:
                print(f"Error decoding JSON for {building['code']}/{part}: {e}")
                raise e
        levelname = buildingPart[part]["level"]

        for line in routing["lines"]:
            tags = line.get("tags", {})

            routingData["lines"].append(
                {
                    "start": f'{levelname}_{line["start"]}',
                    "end": f'{levelname}_{line["end"]}',
                    "tags": tags
                }
            )
        for point in routing["points"]:
            routing["points"][point]["level"] = levelname
            routing["points"][point]["id"] = f"{levelname}_{point}"
            routingData["points"][f"{levelname}_{point}"] = routing["points"][point]

    with open(
        f"data/{building['code']}/routing/connectedMarkers.json", encoding="UTF-8"
    ) as f:
        connectedMarkers = json.load(f)

    for con in connectedMarkers:
        if len(con["points"]) != 2:
            print(f"Skipping {con} in {building['code']}")
            continue
        start = con["points"][0]
        end = con["points"][1]

        startCode = f"{start['level']}_{start['id']}"
        endCode = f"{end['level']}_{end['id']}"
        routingData["lines"].append({"start": startCode, "end": endCode})

    with open(
        f"data/{building['code']}/routing/routingData.json", "w", encoding="UTF-8"
    ) as f:
        json.dump(routingData, f, ensure_ascii=False)

    with open(
        f"routing/routingUpload/{building['code']}.json", "w", encoding="UTF-8"
    ) as f:
        json.dump(routingData, f, ensure_ascii=False)

    print(f"Processed routing data for {building['code']}")
