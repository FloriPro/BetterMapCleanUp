import flask
import os
from PIL import Image
import io
from io import BytesIO

app = flask.Flask(__name__)


@app.route("/")
def index():
    return """
    <a href="/placer">10: placer</a><br>
    <a href="/addPositions">11: Add Positions</a><br>
    <a href="/viewer">Viewer</a>

    <br>
    <br>

    <a href="/routing">1: Routing</a><br>
"""


@app.route("/viewer")
def viewer():
    # send file index.html
    return flask.send_file("placer/viewer/viewer.html")


@app.route("/placer")
def placer():
    # send file index.html
    return flask.send_file("placer/placer.html")

@app.route("/addPositions")
def addPositions():
    # send file index.html
    return flask.send_file("placer/addPositions.html")


@app.route("/routing")
def routing():
    # send file index.html
    return flask.send_file("routing/routing.html")


@app.route("/<path:path>")
def static_files(path):
    # send static files
    return flask.send_from_directory(".", path)


@app.route("/downscale/<path:path>")
def downscaleImage(path):
    # downscale the image
    img = Image.open(f"{path}")
    img = img.resize((img.size[0] // 8, img.size[1] // 8))
    imgb = io.BytesIO()
    img.save(imgb, format="PNG")
    imgb.seek(0)
    return flask.send_file(imgb, mimetype="image/png")


@app.route("/maxdownscale/<path:path>")
def maxDownscaleImage(path):
    # downscale the image
    img = Image.open(f"{path}")
    img = img.resize((img.size[0] // 70, img.size[1] // 70))
    imgb = io.BytesIO()
    img.save(imgb, format="PNG")
    imgb.seek(0)
    return flask.send_file(imgb, mimetype="image/png")


@app.route("/exists/<path:path>")
def exists(path):
    # check if file exists
    return flask.jsonify(os.path.exists(f"{path}"))


@app.route("/save/<path:path>", methods=["POST"])
def save(path):
    if ".." in path or "%" in path or "?" in path or " " in path:
        return "Invalid path", 400
    # create the directory if it does not exist
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # save the jsonData
    with open(f"{path}", "w") as f:
        f.write(flask.request.data.decode("utf-8"))
    return "ok"

app.run(host="localhost", port=3015, debug=True)
