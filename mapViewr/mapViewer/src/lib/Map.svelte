<script>
    import {
        GeoJSON,
        GeolocateControl,
        HeatmapLayer,
        Layer,
        LineLayer,
        MapLibre,
        Marker,
        NavigationControl,
        RasterLayer,
        RasterTileSource,
        ScaleControl,
    } from "svelte-maplibre";
    import apiUrls, { availableMapMarkerTypes, LEVEL_ORDER } from "./constants";
    import LevelSelect from "./LevelSelect.svelte";
    import RoomInfoOverlay from "./overlays/RoomInfoOverlay.svelte";
    import api from "./api/api";
    import SearchOverlay from "./searchOverlay.svelte";
    import { handleMapClick } from "./handleMapClick";
    import { MarkerProposal, SearchRoomResponse } from "./searchEngine";
    import { SvelteURLSearchParams } from "svelte/reactivity";
    import { onMount, setContext } from "svelte";
    import RoutingInfoOverlay from "./overlays/RoutingInfoOverlay.svelte";
    import RouteSettings from "./overlays/RouteSettings.svelte";
    import maplibregljs from "maplibre-gl";
    import CustomLayerOverlay from "./overlays/CustomLayerOverlay.svelte";
    import gj from "geojson";

    /**
     * @type {LevelSelect | null}
     */
    let levelSelect = $state(null);
    /**
     * @type {CustomLayerOverlay | null}
     */
    let customLayerOverlay = $state(null);

    /**
     * @type {gj.GeoJSON | null}
     */
    let heatmapdata = $state(null);
    // $inspect(heatmapdata, "heatmapdata");

    /**
     * @type {boolean}
     */
    let settingsOpen = $state(false);

    /**
     * @type {import("maplibre-gl").Map | undefined}
     */
    let map = $state(undefined);

    function loadWcIcon() {
        map?.loadImage(apiUrls.getWCIcon());
    }

    /**
     * @type {Array.<{ lngLat: { lng: number; lat: number } }>}
     */
    let markers = $state([]);

    function addBuildingMarkers() {
        api.getData().then((data) => {
            if (!map) return;

            for (const [key, building] of Object.entries(data.part)) {
                markers.push({
                    lngLat: {
                        lng: building.building.lng,
                        lat: building.building.lat,
                    },
                });
            }
        });
    }

    let reactiveZoom = $state(1);
    let markerSize = $derived.by(() => {
        // 0 at zoom level 18; 10 at level 17; 1 at level 1
        /**
         * @type {Record<number, number>}
         */
        let dat = {
            0: 1,
            10: 2,
            16: 20,
            17: 0,
        };
        // interpolate between the values in dat based on reactiveZoom
        let zoomLevels = Object.keys(dat)
            .map((x) => parseFloat(x))
            .sort((a, b) => a - b);
        for (let i = 0; i < zoomLevels.length - 1; i++) {
            let z1 = zoomLevels[i];
            let z2 = zoomLevels[i + 1];
            if (reactiveZoom >= z1 && reactiveZoom <= z2) {
                let v1 = dat[z1];
                let v2 = dat[z2];
                let t = (reactiveZoom - z1) / (z2 - z1);
                return v1 + t * (v2 - v1);
            }
        }
    });

    $effect(() => {
        // console.log('effect level select update', map, map?.isStyleLoaded(), levelSelect?.currentLevel);
        levelSelect?.currentLevel; // when style isn't loaded, update layers wount't run and thus the effect won't check for changes in currentLevel, so we add it as a dependency here
        if (!map) return;
        if (!map.isStyleLoaded()) return;
        // updateLayers();
    });

    let isRouteStartPointSetting = $state(false);
    /**
     * @type {| {
     *           start: { lat: number; lng: number; level: string };
     *           end: { lat: number; lng: number; level: string };
     *           room: SearchRoomResponse;
     *           routeLength: number;
     *           levelChanges: number;
     *           timeEstimate: number;
     *       }
     *     | null
     *     | { error: string }}
     */
    let routeInformation = $state(null);
    /**
     * @type {{
     *     level: string;
     *     points: import("$lib/api/datatype").LatLng[];
     *     i: number;
     * }[]}
     */
    let routePoints = $state([]);
    let fitToRoute = $state(false);
    /**
     * @type {{
     *     levelFrom: string;
     *     levelTo: string;
     *     pos: import("$lib/api/datatype").LatLng;
     *     i: number;
     * }[]}
     */
    let routeLevelChanges = $derived.by(() => {
        if (!routePoints) return [];
        let currentLevel = routePoints[0]?.level;
        let changes = [];
        let i = 0;
        for (let segment of routePoints) {
            if (segment.level !== currentLevel) {
                changes.push({
                    levelFrom: currentLevel,
                    levelTo: segment.level,
                    pos: segment.points[0],
                    i: i++,
                });
                currentLevel = segment.level;
            }
        }
        return changes;
    });

    function focusOnRoute() {
        // focus map on all route points
        let bounds = new maplibregljs.LngLatBounds();
        routePoints.forEach((segment) => {
            segment.points.forEach((p) => {
                const lng = Number(p.lng);
                const lat = Number(p.lat);
                if (
                    isNaN(lng) ||
                    isNaN(lat) ||
                    lng < -180 ||
                    lng > 180 ||
                    lat < -90 ||
                    lat > 90
                ) {
                    console.warn("Invalid route point (skipped):", p);
                    alert(
                        "Could not focus on route: route contains invalid point",
                    );
                    return;
                }
                bounds.extend([p.lng, p.lat]);
            });
        });
        if (bounds.isEmpty()) {
            alert("Could not focus on route: route bounds are empty");
            return;
        }
        setTimeout(() => {
            fitToRoute = true;
            map?.setPadding({
                top: 100,
                bottom: 50 + (roomInfoOverlay?.getHeight() || 50),
                left: 70,
                right: 70,
            });
            map?.fitBounds(bounds.toArray(), {
                // padding: {
                //     top: 100,
                //     bottom: 50 + (roomInfoOverlay?.getHeight() || 50),
                //     left: 70,
                //     right: 70,
                // },
                maxZoom: 20,
                duration: 1000,
            });
        }, 100);
    }

    $effect(() => {
        if (routePoints.length > 0) {
            focusOnRoute();
        }
    });

    /**
     * Compute direction between two levels using `LEVEL_ORDER`.
     * Returns: 'up' | 'down' | 'side'
     *
     * @param {string} fromLevel
     * @param {string} toLevel
     */
    function getLevelDirection(fromLevel, toLevel) {
        const fromIdx = LEVEL_ORDER.indexOf(fromLevel);
        const toIdx = LEVEL_ORDER.indexOf(toLevel);
        if (fromIdx === -1 || toIdx === -1) return "side";
        if (toIdx < fromIdx) return "up";
        if (toIdx > fromIdx) return "down";
        return "side";
    }

    /**
     * @type {RoutingInfoOverlay | null}
     */
    let routingInfoOverlay = $state(null);
    /**
     * @type {SearchOverlay | null}
     */
    let searchOverlay = $state(null);
    /**
     * @type {RoomInfoOverlay | null}
     */
    let roomInfoOverlay = $state(null);

    /**
     * @type {SearchRoomResponse | null}
     */
    let selectedRoom = $state(null);
    /**
     * @type {MarkerProposal | null}
     */
    let selectedMarker = $state(null);

    /**
     * @param {MarkerProposal | null} marker
     * @param marker
     */
    function selectMarker(marker) {
        selectedMarker = marker;
    }

    /**
     * @param {SearchRoomResponse | null} room
     * @returns {void}
     */
    function selectRoom(room, moveMap = true) {
        selectedRoom = room;
        if (room && room.level) {
            levelSelect?.setLevel(room.level);

            if (moveMap) {
                map?.setPadding({
                    top: 100,
                    bottom: 50 + (roomInfoOverlay?.getHeight() || 50),
                    left: 70,
                    right: 70,
                });
                map?.flyTo({
                    center: [room.latLng.lng, room.latLng.lat],
                    zoom: Math.max(20, map.getZoom()),
                    duration: 1000,
                });
            }
        }
    }
    setContext("selectRoom", selectRoom);
    setContext("showRoute", focusOnRoute);
    setContext("setStartPoint", async () => {
        await routingInfoOverlay?.setRouteStartPoint();
        if (selectedRoom) {
            routingInfoOverlay?.route(selectedRoom);
        }
    });
    setContext("openSettings", () => {
        settingsOpen = true;
    });
    setContext("closeSettings", () => {
        settingsOpen = false;
        // recalculate route
        if (routeInformation && !("error" in routeInformation)) {
            routeToRoom(routeInformation.room);
        }
    });

    function updateUrl() {
        // save url state when anything changes
        const params = new SvelteURLSearchParams();
        /*
		lat
		lng
		zoom
		level
		room
		building
		route
		routeDest
		routeBuilding
		routeStartLat
		routeStartLng
		routeStartLevel
		marker
		*/
        if (map) {
            params.set("lat", map.getCenter().lat.toFixed(6));
            params.set("lng", map.getCenter().lng.toFixed(6));
            params.set("zoom", map.getZoom().toFixed(2));
        }
        if (levelSelect?.currentLevel) {
            params.set("level", levelSelect.currentLevel);
        }
        if (selectedRoom) {
            params.set("room", selectedRoom.name);
            params.set("building", selectedRoom.buildingName);
        }
        if (selectedMarker) {
            params.set("marker", selectedMarker.type.id);
        }
        if (routeInformation && !("error" in routeInformation)) {
            // https://raumplan.flulu.de/index.html#lat=48.150969&lng=11.580544&zoom=19.53&level=EG&room=D+Z007&building=Geschwister-Scholl-Platz+01&route=1&routeDest=D+Z007&routeBuilding=Geschwister-Scholl-Platz+01&routeStartLat=48.151018&routeStartLng=11.580716
            params.set("route", "1");
            params.set("routeDest", routeInformation.room.name);
            params.set("routeBuilding", routeInformation.room.buildingName);
            params.set("routeStartLat", routeInformation.start.lat.toFixed(6));
            params.set("routeStartLng", routeInformation.start.lng.toFixed(6));
            params.set("routeStartLevel", routeInformation.start.level);
        }

        // set the hashtag
        const newHash = "#" + params.toString();
        if (window.location.hash !== newHash) {
            // console.log("Updating URL hash to:", newHash);
            window.history.replaceState(null, "", newHash);
        }
    }

    function checkRoomInView() {
        if (!map || !selectedRoom) return;
        const roomLngLat = {
            lng: selectedRoom.latLng.lng,
            lat: selectedRoom.latLng.lat,
        };
        const mapBounds = map.getBounds();
        if (roomInfoOverlay) {
            roomInfoOverlay.setRoomVisible(mapBounds.contains(roomLngLat));
        }
    }

    function loadStateFromUrl() {
        // on initial load, check url for state
        const params = new SvelteURLSearchParams(window.location.hash.slice(1));
        const lat = parseFloat(params.get("lat") || "");
        const lng = parseFloat(params.get("lng") || "");
        const zoom = parseFloat(params.get("zoom") || "");
        const level = params.get("level");
        const roomName = params.get("room");
        const buildingName = params.get("building");
        const markerTypeId = params.get("marker");
        const route = params.get("route");
        const roomNum = params.get("roomNum"); // get from old roomfinder

        if (lat && lng && zoom) {
            map?.setCenter([lng, lat]);
            map?.setZoom(zoom);
        }
        if (level) {
            levelSelect?.setLevel(level);
        }
        if (roomNum) {
            console.log("Looking for room by number from URL:", roomNum);
            api.findRoomByNumber(roomNum).then((result) => {
                if (result) {
                    selectRoom(result, false);
                    if (result.level) {
                        levelSelect?.setLevel(result.level);
                    }
                    map?.flyTo({
                        center: [result.latLng.lng, result.latLng.lat],
                        zoom: Math.max(20, map.getZoom()),
                        duration: 1000,
                    });
                } else {
                    console.warn(
                        "Could not find room by number from URL:",
                        roomNum,
                    );
                }
            });
        }
        if (roomName && buildingName) {
            api.findRoom(roomName, buildingName, undefined /*level*/).then(
                (result) => {
                    if (result) {
                        let levelBefore = levelSelect?.currentLevel;
                        selectRoom(result, false);
                        if (level) {
                            levelSelect?.setLevel(levelBefore || level);
                        }
                    }
                },
            );
        }
        if (route) {
            const routeDest = params.get("routeDest");
            const routeBuilding = params.get("routeBuilding");
            const routeStartLat = parseFloat(params.get("routeStartLat") || "");
            const routeStartLng = parseFloat(params.get("routeStartLng") || "");
            const routeStartLevel = params.get("routeStartLevel");

            if (routeDest && routeBuilding) {
                api.findRoom(routeDest, routeBuilding, null).then((result) => {
                    if (result) {
                        if (
                            !isNaN(routeStartLat) &&
                            !isNaN(routeStartLng) &&
                            routeStartLevel
                        ) {
                            routingInfoOverlay?.setRouteStart({
                                lat: routeStartLat,
                                lng: routeStartLng,
                                level: routeStartLevel,
                            });
                        }
                        routeToRoom(result);
                    } else {
                        console.warn(
                            "Could not find room for route from URL:",
                            routeDest,
                            routeBuilding,
                        );
                    }
                });
            }
        }
        if (markerTypeId) {
            availableMapMarkerTypes.forEach((type) => {
                if (type.id === markerTypeId) {
                    // TODO: this is a bit hacky
                    setTimeout(() => {
                        searchOverlay?.setSearchInput(type.name);
                    }, 1000);
                }
            });
        }
    }

    /**
     * @param {SearchRoomResponse} room
     */
    function routeToRoom(room) {
        routingInfoOverlay?.route(room);
    }

    onMount(() => {
        loadStateFromUrl();

        window.addEventListener("hashchange", () => {
            loadStateFromUrl();
        });
    });

    $effect(() => {
        updateUrl();
    });
</script>

<MapLibre
    bind:map
    center={[11.582, 48.1351]}
    zoom={13}
    maxZoom={23.999}
    class="map"
    style="https://api.maptiler.com/maps/streets-v2-dark/style.json?key=WKfpITqH1nhqMcaWvHXD"
    onmoveend={() => {
        if (map) levelSelect?.update();
        checkRoomInView();
        updateUrl();
    }}
    onzoomend={() => {
        if (map) levelSelect?.update();
        checkRoomInView();
        updateUrl();
    }}
    onmovestart={() => {
        fitToRoute = false;
    }}
    onzoom={() => {
        fitToRoute = false;
        if (map) reactiveZoom = map.getZoom();
    }}
    onload={() => {
        if (!map) {
            return;
        }
        loadWcIcon();
        // genLayers();
        // updateLayers();
        addBuildingMarkers();
        reactiveZoom = map.getZoom();

        updateUrl();
        checkRoomInView();
    }}
    onclick={(e) => {
        if (!map) return;
        handleMapClick({
            e,
            map,
            isRouteStartPointSetting,
            searchOverlay,
            levelSelect,
            routeInformation,
            roomInfoOverlay,
            selectRoom,
            api,
        });
        checkRoomInView();
    }}
>
    {#each LEVEL_ORDER as level (level)}
        <RasterTileSource
            id={level}
            tiles={[apiUrls.getTileMap(level)]}
            tileSize={256}
            attribution="<a href='https://www.lmu.de/raumfinder/' target='_blank'>© Ludwig-Maximilians-Universität München</a>"
            maxzoom={21}
        >
            <RasterLayer
                id={level}
                source={level}
                layout={{
                    visibility:
                        level === levelSelect?.currentLevel
                            ? "visible"
                            : "none",
                }}
                paint={{
                    "raster-brightness-min": 1,
                    "raster-brightness-max": 0.15,
                }}
            />
        </RasterTileSource>
    {/each}

    {#if heatmapdata}
        <GeoJSON data={heatmapdata} id="heatmap" promoteId="id">
            <HeatmapLayer
                id="heatmap-layer"
                paint={{
                    "heatmap-weight": [
                        "interpolate",
                        ["linear"],
                        ["get", "count"],
                        0,
                        0,
                        10,
                        0.2,
                        50,
                        0.5,
                        100,
                        0.8,
                        300,
                        1,
                    ],
                    "heatmap-intensity": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        0,
                        1,
                        15,
                        3,
                    ],
                    "heatmap-color": [
                        "interpolate",
                        ["linear"],
                        ["heatmap-density"],
                        0,
                        "rgba(33,102,172,0)",
                        0.2,
                        "rgb(103,169,207)",
                        0.4,
                        "rgb(209,229,240)",
                        0.6,
                        "rgb(253,219,199)",
                        0.8,
                        "rgb(239,138,98)",
                        1,
                        "rgb(178,24,43)",
                    ],
                    "heatmap-radius": [
                        "interpolate",
                        ["exponential", 2],
                        ["zoom"],
                        0,
                        1,
                        12,
                        1,
                        24,
                        3000,
                    ],
                    "heatmap-opacity": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        18,
                        0.9,
                        25,
                        0.6,
                    ],
                    //falloff
                }}
                filter={[
                    "==",
                    ["get", "level"],
                    levelSelect?.currentLevel || "",
                ]}
            />
        </GeoJSON>
    {/if}

    {#if map && reactiveZoom <= 17}
        {#each markers as marker (marker)}
            <Marker
                lngLat={marker.lngLat}
                class="buildingmarker rounded-full bg-red-300"
            >
                <div
                    style="width: {markerSize}px; height: {markerSize}px;"
                ></div>
            </Marker>
        {/each}
    {/if}

    {#if !isRouteStartPointSetting}
        {#if selectedRoom}
            <Marker
                lngLat={{
                    lng: selectedRoom.latLng.lng,
                    lat: selectedRoom.latLng.lat,
                }}
                class="srm"
                zIndex={1000}
            >
                <div
                    class="marker-container"
                    class:notThisLevel={selectedRoom.level !==
                        levelSelect?.currentLevel}
                >
                    <div class="marker-pulse"></div>
                    <div class="selected-room-marker">
                        <svg class="marker-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                        <span class="marker-text">{selectedRoom.name}</span>
                    </div>
                </div>
            </Marker>
        {/if}
        {#if selectedMarker}
            {#await api.getMarker(selectedMarker) then markers}
                {#each markers as marker (marker)}
                    {#await api.getSearchRoom(marker) then makerRoom}
                        {#if makerRoom && makerRoom.level === levelSelect?.currentLevel}
                            <Marker
                                lngLat={{
                                    lng: makerRoom.latLng.lng,
                                    lat: makerRoom.latLng.lat,
                                }}
                                class="srm"
                                zIndex={1000}
                                onclick={(e) => {
                                    selectRoom(makerRoom);
                                }}
                            >
                                <div class="marker-container is-type-marker">
                                    <div class="marker-pulse"></div>
                                    <div class="selected-room-marker is-type-marker">
                                        <span class="marker-icon">{selectedMarker.type.icon}</span>
                                    </div>
                                </div>
                            </Marker>
                        {/if}
                    {/await}
                {/each}
            {/await}
        {/if}
        <!-- {#if routeInformation} -->
        {#each routePoints as segment (segment.i)}
            <GeoJSON
                data={{
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: segment.points.map((p) => [p.lng, p.lat]),
                    },
                    properties: {
                        level: segment.level,
                    },
                }}
                id={`route-segment-${segment.i}`}
                promoteId="id"
            >
                <LineLayer
                    id={`route-click-layer-${segment.i}`}
                    paint={{
                        "line-color": "black",
                        "line-width": 30,
                        "line-opacity": 0.1,
                    }}
                    layout={{
                        "line-join": "round",
                        "line-cap": "round",
                    }}
                    interactive={true}
                    onclick={(e) => {
                        levelSelect?.setLevel(segment.level);
                    }}
                />
                <LineLayer
                    paint={{
                        "line-color": "#ffffff",
                        "line-width": 7,
                        "line-opacity": 1,
                    }}
                    layout={{
                        "line-join": "round",
                        "line-cap": "round",
                    }}
                />
                <LineLayer
                    paint={{
                        "line-color":
                            segment.level === levelSelect?.currentLevel
                                ? "#ff9800"
                                : "gray",
                        "line-width": 4,
                        "line-opacity": 1,
                    }}
                    layout={{
                        "line-join": "round",
                        "line-cap": "round",
                    }}
                />
            </GeoJSON>
        {/each}
        <!-- {/if} -->

        {#each routeLevelChanges as change (change.i)}
            <Marker
                lngLat={{ lng: change.pos.lng, lat: change.pos.lat }}
                class="srm"
                zIndex={1000}
                interactive={true}
            >
                <div
                    class="level-change-marker"
                    onclick={(e) => {
                        e.stopImmediatePropagation();
                        e.stopPropagation();
                        levelSelect?.setLevel(change.levelTo);
                    }}
                    onkeydown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            levelSelect?.setLevel(change.levelTo);
                        }
                    }}
                    role="button"
                    tabindex="0"
                    aria-label={change.levelFrom + " to " + change.levelTo}
                    data-direction={getLevelDirection(
                        change.levelFrom,
                        change.levelTo,
                    )}
                >
                    <div class="level-icon">
                        {#if getLevelDirection(change.levelFrom, change.levelTo) === "up"}
                            <svg
                                width="22"
                                height="22"
                                viewBox="0 0 22 22"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M11 18V5M11 5L5 11M11 5L17 11"
                                    stroke="#ff9800"
                                    stroke-width="2.5"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        {:else if getLevelDirection(change.levelFrom, change.levelTo) === "down"}
                            <svg
                                width="22"
                                height="22"
                                viewBox="0 0 22 22"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M11 4V17M11 17L5 11M11 17L17 11"
                                    stroke="#ff9800"
                                    stroke-width="2.5"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        {:else}
                            <svg
                                width="22"
                                height="22"
                                viewBox="0 0 22 22"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M4 11H17M17 11L11 5M17 11L11 17"
                                    stroke="#ff9800"
                                    stroke-width="2.5"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        {/if}
                    </div>
                    <div class="level-label">
                        {change.levelFrom} → {change.levelTo}
                    </div>
                </div>
            </Marker>
        {/each}

        <!-- markers for start point -->
        <Marker
            lngLat={{
                lng: routePoints[0]?.points[0]?.lng || 0,
                lat: routePoints[0]?.points[0]?.lat || 0,
            }}
            class="srm"
            zIndex={1000}
        >
            <div class="start-marker"></div>
        </Marker>
    {/if}

    <NavigationControl position="bottom-right" />
    <GeolocateControl position="bottom-right" />
    <ScaleControl position="bottom-left" />
</MapLibre>

<LevelSelect bind:this={levelSelect} {map} {selectedRoom} />

{#if !isRouteStartPointSetting}
    <RoomInfoOverlay
        bind:this={roomInfoOverlay}
        {map}
        {selectedRoom}
        {selectRoom}
        {routeToRoom}
        {routeInformation}
        clearRoute={routingInfoOverlay?.clearRoute}
    />
    {#if selectedRoom == null}
        <CustomLayerOverlay bind:this={customLayerOverlay} bind:heatmapdata />
    {/if}
    <SearchOverlay
        bind:this={searchOverlay}
        {map}
        {selectRoom}
        {selectedRoom}
        {selectMarker}
        {selectedMarker}
    />
{/if}

<RoutingInfoOverlay
    bind:this={routingInfoOverlay}
    {map}
    {isRouteStartPointSetting}
    {routeInformation}
    {routePoints}
    {levelSelect}
    setroutePoints={(
        /**@type {{level: string, points: import("$lib/api/datatype").LatLng[], i: number}[]} */ a,
    ) => {
        routePoints = a;
        console.log("Setting route points:", a);
    }}
    setRouteError={(/** @type {string} */ message) => {
        routeInformation = {
            error: message,
        };
        routePoints = [];
    }}
    setrouteinformation={(
        /** @type {{start: {lat: number, lng: number, level: string}, end: {lat: number, lng: number, level: string}, room: SearchRoomResponse, routeLength: number, levelChanges: number, timeEstimate: number} | null}*/ a,
    ) => {
        routeInformation = a;
    }}
    setisRouteStartPointSetting={(/**@type {boolean} */ a) => {
        isRouteStartPointSetting = a;
    }}
/>

{#if settingsOpen}
    <RouteSettings />
{/if}

<style>
    :global(.map) {
        height: 100%;
        width: 100%;
    }

    /* Selected room marker container */
    .marker-container {
        position: relative;
        width: 0;
        height: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    /* Small static dot core instead of pulsing ripple */
    .marker-pulse {
        position: absolute;
        width: 8px;
        height: 8px;
        background-color: #0d9488;
        border: 1px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        transform: translate(-50%, -50%);
        top: 0;
        left: 0;
        pointer-events: none;
        z-index: 1;
    }

    /* Type-specific static dot core */
    .marker-container.is-type-marker .marker-pulse {
        background-color: #2563eb;
    }

    /* Inactive level static dot core */
    .marker-container.notThisLevel .marker-pulse {
        background-color: #94a3b8;
        border-color: #cbd5e1;
    }

    /* Main selected room tooltip styling - optimized and simplified */
    .selected-room-marker {
        position: absolute;
        bottom: 8px;
        left: 50%;
        transform: translateX(-50%);
        background-color: #0d9488;
        color: #ffffff;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 600;
        text-align: center;
        white-space: nowrap;
        border: 1px solid rgba(255, 255, 255, 0.25);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 5px;
        pointer-events: auto;
        z-index: 2;
    }

    .selected-room-marker::after {
        content: "";
        position: absolute;
        bottom: -5px;
        left: 50%;
        transform: translateX(-50%);
        border-width: 5px 5px 0;
        border-style: solid;
        border-color: #0d9488 transparent transparent transparent;
    }

    /* Style for searched category markers (e.g. WC, round icon) */
    .selected-room-marker.is-type-marker {
        width: 28px;
        height: 28px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 15px;
        background-color: #2563eb;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    }

    .selected-room-marker.is-type-marker::after {
        border-color: #2563eb transparent transparent transparent;
    }

    /* Inactive level styling */
    .marker-container.notThisLevel .selected-room-marker {
        background-color: #64748b;
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
        opacity: 0.7;
    }

    .marker-container.notThisLevel .selected-room-marker::after {
        border-color: #64748b transparent transparent transparent;
    }

    /* Icon styling inside tooltip */
    .marker-icon-svg {
        width: 13px;
        height: 13px;
        flex-shrink: 0;
        color: #fbbf24; /* Amber/gold */
    }

    .marker-text {
        font-family: inherit;
    }

    /* Level change marker (icon above label) */
    .level-change-marker {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        z-index: 1000;
        opacity: 0;
        animation: levelFadeIn 400ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
        transform: translateY(-2px);
        user-select: none;
        -webkit-tap-highlight-color: transparent;
    }

    .level-icon {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 2px;
        background: #ffffffd9;
        border-radius: 6px;
        border: 1px solid #ffffff;
        box-sizing: border-box;
        padding: 1px;
    }

    .level-label {
        font-size: 10px;
        font-weight: bold;
        color: #ff9800;
        background: #ffffffd9;
        border-radius: 6px;
        border: 1px solid #ff9800;
        padding: 0px 6px;
        margin-top: 2px;
        white-space: nowrap;
    }

    .level-change-marker:focus {
        outline: none;
        box-shadow: 0 0 0 3px rgba(255, 152, 0, 0.18);
        border-radius: 8px;
    }

    .start-marker {
        width: 16px;
        height: 16px;
        background-color: #2196f3;
        border-radius: 50%;
        border: 2px solid white;
        box-sizing: border-box;
    }

    @keyframes levelFadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
</style>
