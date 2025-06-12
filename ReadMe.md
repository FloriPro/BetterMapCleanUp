# Steps to generate TileMaps

1. open https://www.lmu.de/raumfinder/#/ and get the neccesary data: with

```javascript
console.log(JSON.stringify(buildingsLookup)); // -> data_buildingsLookup.json
console.log(JSON.stringify(buildingsJSON)); // -> data_buildingsJSON.json
console.log(JSON.stringify(rename)); // -> data_rename.json
```

2.  run `python 2_getMoreData.py` to download rooms and uniqueBuildingParts for every building

3.  run `python 3_downloadPlans.py` to download the room plans for every building

4.  run `python 4_stitchPlans.py` to stitch the plans together. PIL is needed for this step (pip install Pillow). This may take a while.

5.  run `python 5_crop.py` to crop the stitched plans and remove unnecessary white space

6.  run `python 6_removeWhiteSpace.py` to remove the white background of the plans. (this might take a while)

7.  next you will need to orient all plans north. To do this run `python 7_orient.py`. Pygame is needed for this step (pip install pygame).

    A window will appear that shows the 4 corners of the plan. Use the one showing the north direction and click in the middle of it. Drag the mouse in the direction of north and release the mouse button.

8.  recalculate room Positions to match the new plan size by running `python 8_recalculatePositions.py`. Check if the positions are correct by running `python 8_recalculatePositions_check.py`. This will show left the rotated plan and right the old plan. the colord points are the room locations. (If they are incorrect i fucked up)

9.  run `python 9_downscale.py` to downscale the plans for faster processing when zoomed out.

10. now we need to position the plans on the map. To do this run `python editServer.py`. Open http://localhost:3015 in your browser and select `placer` (http://localhost:3015/placer).

    #### Usage:

    - When opening the page, you will see a map with a marker for the current building position. A semi-transparent image of the plan will be shown on the map.
    - rotate the image by pressing _q/e_. Refine the rotation by pressing _a/d_.
    - zoom the image with _W/S_. refine the zoom with _w/s_.
    - _drag_ the image to the correct position on the map.
    - when you are done, press _Space_ to save the position and move to the next building.

11. after you have placed all the plans open `Add Positions` (http://localhost:3015/addPositions). This will create lat,lng positions for the rooms, and corners of the images. You will just need to wait for the site to finish processing.

12. run `python 12_combineData.py` to combine all the data into one file.

13. To Now finaly create the TileMaps cd into the mapTiling Folder and run `python main.py`. This will create the TileMaps in the `tiles` folder.

    ```cmd
    cd mapTiling
    python main.py
    ```

# Routing

1. Start the edit server with `python editServer.py`
2. Open http://localhost:3015 in your browser and select `router` (http://localhost:3015/router).

3. ### TODO