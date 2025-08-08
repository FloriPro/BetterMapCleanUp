import json
import math
import sys
import time
from PIL import Image, ImageDraw, ImageFont
from scipy.fft import dst

building = "bw0000"
with open(f"data/{building}/routing/routingData.json") as f:
    data = json.load(f)

lines = data["lines"]
points = data["points"]

pointBefore = None
while pointBefore is None:
    if len(sys.argv) > 1:
        startRoom = sys.argv[1]
    else:
        startRoom = input("Enter start room: ")
    for pointid, point in points.items():
        if "tags" in point and "room" in point["tags"]:
            if point["tags"]["room"] == startRoom:
                pointBefore = pointid
                break
    if pointBefore is None:
        print(f"Room '{startRoom}' not found. Please try again.")  #
        if len(sys.argv) > 1:
            exit(1)


endPoint = None
while endPoint is None:
    if len(sys.argv) > 2:
        endRoom = sys.argv[2]
    else:
        endRoom = input("Enter end room: ")
    for pointid, point in points.items():
        if "tags" in point and "room" in point["tags"]:
            if point["tags"]["room"] == endRoom:
                endPoint = pointid
                break
    if endPoint is None:
        print(f"Room '{endRoom}' not found. Please try again.")
        if len(sys.argv) > 2:
            exit(1)
print(f"Start point: {pointBefore}")
print(f"End point: {endPoint}")

# lines: {start:<pointid>, end:<pointid>, tags:{...}}

connectingNodes = {}
for line in lines:
    if line["start"] not in connectingNodes:
        connectingNodes[line["start"]] = []
    if line["end"] not in connectingNodes:
        connectingNodes[line["end"]] = []

    connectingNodes[line["start"]].append(
        {"other": line["end"], "tags": line.get("tags", [])}
    )
    connectingNodes[line["end"]].append(
        {"other": line["start"], "tags": line.get("tags", [])}
    )


def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371e3  # Earth radius in metres

    φ1 = math.radians(lat1)
    φ2 = math.radians(lat2)
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lon2 - lon1)

    a = math.sin(Δφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    d = R * c  # distance in metres
    return d


def find_path(start, end, dontPointTags=[], dontLineTags=[]):
    routes = {}

    def dfs(current, target, route, routeLength):
        nodesToLookAt = connectingNodes[current]
        # print(f"Visiting {current}, route so far: {route}, looking at {nodesToLookAt}")
        for n in nodesToLookAt:
            # check if point[n] has a tag that is in dontTags
            ignore = False
            for tag in dontLineTags:
                if tag in n["tags"] and n["tags"][tag]:
                    # print(f"Skipping {n} due to tag {tag}")
                    ignore = True
                    break
            if ignore:
                continue
            n = n["other"]
            if "tags" in points[n]:
                for tag in dontPointTags:
                    if tag in points[n]["tags"] and points[n]["tags"][tag]:
                        # print(f"Skipping {n} due to tag {tag}")
                        ignore = True
                        break
            if ignore:
                continue

            if n in route:
                continue

            currentPath = route + [n]
            dst1 = points[n]
            dst2 = points[current]
            # dst = (
            #    (dst1["lat"] - dst2["lat"]) ** 2 + (dst1["lng"] - dst2["lng"]) ** 2
            # ) ** 0.5
            dst = haversine_distance(dst1["lat"], dst1["lng"], dst2["lat"], dst2["lng"])
            currentPathLength = routeLength + dst
            if n not in routes or routes[n]["length"] > currentPathLength:
                routes[n] = {"path": currentPath, "length": currentPathLength}
                dfs(n, target, currentPath, currentPathLength)

    dfs(start, end, [start], 0)
    return (
        routes.get(end, None)["path"] if end in routes else None,
        routes.get(end, None)["length"] if end in routes else None,
    )


startTime = time.time()
path, length = find_path(
    pointBefore,
    endPoint,
    ["outside", "private"],
    ["locked", "-accessible", "unlikely"],
)
endTime = time.time()
print()
print(f"Pathfinding took {endTime - startTime:.2f} seconds.")

if path is None:
    print(f"No path found from {pointBefore} to {endPoint}.")
    exit(1)
else:
    print()
    print(f"Path found from {pointBefore} to {endPoint}:")
    # Optionally, print the full path with room names
    full_path = [
        f"{point} ({points[point].get('tags', {}).get('room', 'Unknown')})"
        for point in path
    ]
    print(" -> ".join(full_path))

# with open(f"data/{building}/clear/{room}.png", "rb") as f:
#     img = Image.open(f)
#     img.show()

room = "g003002"

img = Image.open(f"data/{building}/clear/{room}.png")
imgdraw = ImageDraw.Draw(img)

with open(f"data/{building}/rooms/latlng/{room}.json") as f:
    rooms = json.load(f)

addArrows = False

ArrowSize = 100
arrowEveryPixel = 70
arrowImg = Image.open(f"routing/img/arrow.png")
arrowImg = arrowImg.convert("RGBA")
arrowImg = arrowImg.resize((ArrowSize * 5, ArrowSize * 5), Image.LANCZOS)

pointBefore = path[0]
pointBeforeX = points[pointBefore]["x"]
pointBeforeY = points[pointBefore]["y"]
for point in path[1:]:
    pointx = points[point]["x"]
    pointy = points[point]["y"]

    imgdraw.line((pointBeforeX, pointBeforeY, pointx, pointy), fill="blue", width=1)

    if addArrows:
        # draw arrow
        angle = math.atan2(pointBeforeX - pointx, pointBeforeY - pointy)
        nowarrowImg = arrowImg.rotate(
            math.degrees(angle),
            expand=True,
            center=(arrowImg.width // 2, arrowImg.height // 2),
        )
        # scale to 30x30px
        nowarrowImg = nowarrowImg.resize(
            (nowarrowImg.width // 5, nowarrowImg.height // 5), Image.LANCZOS
        )

        arrowCount = (
            (pointx - pointBeforeX) ** 2 + (pointy - pointBeforeY) ** 2
        ) ** 0.5 / arrowEveryPixel
        if arrowCount < 1:
            arrowCount = 1
        else:
            arrowCount = math.ceil(arrowCount)
        for i in range(int(arrowCount)):
            lerpX = pointBeforeX + (pointx - pointBeforeX) * (i / arrowCount)
            lerpY = pointBeforeY + (pointy - pointBeforeY) * (i / arrowCount)
            arrow_x = lerpX - nowarrowImg.width // 2
            arrow_y = lerpY - nowarrowImg.height // 2
            img.paste(
                nowarrowImg,
                (int(arrow_x), int(arrow_y)),
                nowarrowImg,  # use alpha channel for transparency
            )
        del nowarrowImg

    pointBeforeX = pointx
    pointBeforeY = pointy

font = ImageFont.truetype("arial.ttf", 50)
# background color
text = f"Path length: {length:.2f} m"
x = 10
y = 10
left, top, textwidth, textheight = imgdraw.textbbox(xy=(x, y), text=text, font=font)
imgdraw.rectangle((x, y, x + textwidth, y + textheight), fill="white")
imgdraw.text(xy=(x, y), text=text, fill="black", font=font)
img.show()
