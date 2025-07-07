# Steps to generate TileMaps

1. open https://www.lmu.de/raumfinder/#/ and get the neccesary data with the following code in the debug console:

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

10. now we need to position the plans on the map. To do this run `python editServer.py`. Open http://localhost:3015 in your browser and select [`placer`](http://localhost:3015/placer).

    #### Usage:

    - When opening the page, you will see a map with a marker for the current building position. A semi-transparent image of the plan will be shown on the map.
    - rotate the image by pressing _q/e_. Refine the rotation by pressing _a/d_.
    - zoom the image with _W/S_. refine the zoom with _w/s_.
    - _drag_ the image to the correct position on the map.
    - when you are done, press _Space_ to save the position and move to the next building.
    - To better locate corners use _P_ to create one point that you can drag to move the image. using _P_ again will create a second point. Both will be anchored to the image and you can drag them to move and rotate the image (calculations are a bit off, but it works for now). Use _P_ again to remove the points.
      - use _o_ to switch between the two points.

11. after you have placed all the plans open [`Add Positions`](http://localhost:3015/addPositions). This will create lat,lng positions for the rooms, and corners of the images. You will just need to wait for the site to finish processing.

12. run `python 12_combineData.py` to combine all the data into one file.

13. You now need to manually replace "EG (3. Flur)" With "EG", "OG 01 (4. Flur)" with "OG 01", "OG 02 (5. Flur)" with "OG 02", ... (in `data\bw1505\uniqueBuildingParts.json`). use `python 13_replaceNames.py` to do this.

14. To Now finaly create the TileMaps cd into the mapTiling Folder and run `python main.py`. This will create the TileMaps in the `tiles` folder.

    ```cmd
    cd mapTiling
    python main.py
    ```

# Routing

1. Start the edit server with `python editServer.py`
2. Open http://localhost:3015 in your browser and select [`router`](http://localhost:3015/router).

   #### Design

   - The routing is made out of _points_, which are connected by _lines_. Lines only store the id of the start and end point.
   - Points _need_ to contain
     - `x`, `y` as well as corresponding `lat`, `lng` positions.
   - Points _may_ contain

     - `tags` to identify special information about the point
       point. (`{"tags": {"<tag>": "<value>"}}`)
       - `room: boolean` to link the point to a room in the building (uses the rName. as seen in "rooms/latlng/\<floorid\>").
       - `private: boolean` to mark the point as private or private.
       - `outside: boolean` to mark the point as outside.
     - A point can also include a `levelChange` property. This allows you to define stairs, elevators, or other transitions between floors.point. (`{"levelChange": [{levelId:"<level>", pointId: "<id>", "direction": "[up/down]"}]}`)
       - there is also a `levelChangeTodo: boolean` property that can be used to mark points that need to be defined later.

   - Lines _may_ contain
     - `tags` to identify special information about the line.
       - `{"tags": {"<tag>": "<value>"}}`
         - `accessible: boolean` is true, if the line is not accessible for wheelchair users
         - `locked: boolean` if the line goes through a locked door
         - `unlikely: boolean` if the line is unlikely to be used (e.g. to stop the routing algorithm from using it if not necessary)

   #### UI Symbols

   - locksymbol on point: private room
   - dashed line: a line that is not accessible, e.g. a locked door or a wall.
   - two dashed lines: a line that is unlikely and should not be used for unnecessary routing.
   - pink line: line is not accessible for wheelchair users.
   - arrow in both directions: the line is a level change point, e.g. a staircase or an elevator.

   #### keyboard shortcuts

   - _Space_ or use any other mouse Button: To enable dragging the map while on the canvas
   - _Mouse Drag_: While dragging on the canvas with the mouse, a line will be added to represent a route segment.
   - _Shift + Mouse Drag_: If the cursor is near an existing point, it will move that point to the cursor position.
   - _Ctrl + Mouse Drag_: If the cursor is near an existing _point_, it will remove that point. And all lines connected to it.<br> If it is near a _line_, it will remove that line.
   - _m_: Mark the _point_ as a level change point. This will be used later to define stairs, when the other levels are added.
   - _p_: Toggel the private state of the _Point_.
   - _t_: Edit the tags of the _Point_.
   - _e_: Add room id to the _Point_.
   - _o_: Mark the _Point_ as Outside.
   - _c_: mark all missing rooms.
   - _a_: Toggel the accessibility of the _Line_.
   - _l_: Toggel the locked state of the _Line_.
   - _f_: Edit another plan level.

3. Open http://localhost:3015/ in your browser and select [`routing connect`](http://localhost:3015/connect).
   - Still TODO
   - Will let you connect multiple levels together, by seeing all the points where you marked a level change point.

## Test Routing

To test the routing, you can use the `test.py` script in the `routing` folder with `python .\routing\test.py "D 098" "G 024"`. There currently is no smart search, so the room names need to be exact.
