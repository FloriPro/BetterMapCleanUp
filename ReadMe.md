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
       - `stair: boolean` to mark the point as a stair.
       - `elevator: boolean` to mark the point as an elevator.
         - when `point.levelChange` is true, `stair` or `elevator` will be set to true.

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
   - green Point with `S` symbol: the point is a stair.
   - orange Point with `E` symbol: the point is an elevator.

   #### keyboard shortcuts

   - `Space` or use any other mouse Button: To enable dragging the map while on the canvas
   - `Mouse Drag`: While dragging on the canvas with the mouse, a line will be added to represent a route segment.
   - `Shift + Mouse Drag`: If the cursor is near an existing point, it will move that point to the cursor position.
   - `Ctrl + Mouse Dra`_: If the cursor is near an existing \_point_, it will remove that point. And all lines connected to it.<br> If it is near a _line_, it will remove that line.
   - `m`: Mark the _point_ as a level change point. This will be used later to connect **stairs**, when the other levels are added.
   - `M`: Mark the _point_ as a level change point. This will be used later to connect **elevators**, when the other levels are added.
   - `p`: Toggel the private state of the _Point_.
   - `t`: Edit the tags of the _Point_.
   - `e`: Add room id to the _Point_.
   - `o`: Mark the _Point_ as Outside.
   - `c`: mark all missing rooms.
   - `a`: Toggel the accessibility of the _Line_.
   - `l`: Toggel the locked state of the _Line_.
   - `f`: Edit another plan level.

3. Open http://localhost:3015/ in your browser and select [`routing connect`](http://localhost:3015/connect).

   - Enter the Building ID. The default is bw0000
   - on the left side, you will see all the levels of the building. Click on a level to show the points and lines of that level in red.

     - lines below the selected level will be shown in blue, if the level below has a 'Z' at the end, the line two levels below will be shown in dark blue.
     - lines above the selected level will be shown in green, if the level above has a 'Z' at the end, the line two levels above will be shown in dark green.

   - with the key `o`, you can open the routing editor tab for every level. The position of the current view will be synced along all tabs.

     - after changing something in the routing editor, use `r` in the routing connect tab to refresh the view.

   - All marked as level change points will be shown with the same icon as in the routing editor.

     - all not connected points will have a pink background.

   - click on a point to select it. Then click on another point to connect them with a line.

     - press `Esc` to cancel the operation.

     - when a point is selected, a yellow line will be drawn to the cursor position
     - when a point is connected, a yellow line will be drawn between the two points.

   - to delete a line, click on it.

4. After you have connected all points run `python 14_generateRouting.py` to generate the routing data.

# What To Upload

- mapTiling/tiles -> tilesLQ/
- data/app_data.json -> app_data.json
- data/data.json -> data.json
- routing/routingUpload/ -> routing/

- _from lsf repo_ -> roomInfo/

# Map Viewer

There exists under placer/viewer.[js/html] a map viewer implementation, but this is not performant.

For better performance use the viewer in the `mapViewer/` directory. (you should change the maplibre style to not use osm tiles)
