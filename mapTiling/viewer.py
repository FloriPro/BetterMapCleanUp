import flask
import os
from PIL import Image
import io
from io import BytesIO

app = flask.Flask(__name__)


@app.route("/")
def index():
    return flask.send_from_directory(".", "index.html")


@app.route("/<path:path>")
def static_files(path):
    # send static files
    if os.path.exists(path):
        return flask.send_from_directory(".", path)
    return ""



app.run(host="localhost", port=3017, debug=False)
