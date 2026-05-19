<script>
	import {
		GeolocateControl,
		MapLibre,
		Marker,
		NavigationControl,
		ScaleControl
	} from 'svelte-maplibre';
	import apiUrls, { availableMapMarkerTypes, LEVEL_ORDER } from './constants';
	import LevelSelect from './LevelSelect.svelte';
	import RoomInfoOverlay from './overlays/RoomInfoOverlay.svelte';
	import api from './api/api';
	import SearchOverlay from './searchOverlay.svelte';
	import { handleMapClick } from './handleMapClick';
	import { MarkerProposal, SearchRoomResponse } from './searchEngine';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { onMount } from 'svelte';

	/**
	 * @type {LevelSelect | null}
	 */
	let levelSelect = $state(null);

	/**
	 * @type {import('maplibre-gl').Map | undefined}
	 */
	let map = $state(undefined);

	function loadWcIcon() {
		map?.loadImage(apiUrls.getWCIcon());
	}

	function genLayers() {
		if (!map) return;
		for (let level of LEVEL_ORDER) {
			//raster layer with url: /mapTiling/tiles/${level}/${z}/${x}/${y}.png
			console.log('Max zoom level:', map.getMaxZoom(), '21');

			map.addSource(level, {
				type: 'raster',
				tiles: [apiUrls.getTileMap(level)],
				tileSize: 256,
				attribution:
					'<a href="https://www.lmu.de/raumfinder/" target="_blank">© Ludwig-Maximilians-Universität München</a>',
				maxzoom: 21
			});
			map.addLayer({
				id: level,
				type: 'raster',
				source: level,
				layout: {
					visibility: 'none'
				},
				paint: {
					'raster-brightness-min': 1,
					'raster-brightness-max': 0.15
				}
			});

			// add building layer, to later add buildings to
			map.addSource(`building-source-${level}`, {
				type: 'geojson',
				data: {
					type: 'FeatureCollection',
					features: []
				}
			});
			map.addLayer({
				id: `building-layer-${level}`,
				type: 'symbol',
				source: `building-source-${level}`,
				layout: {
					'icon-image': 'wc-Icon',
					'icon-size': 0.5,
					'icon-allow-overlap': true
				}
			});
		}
	}

	/**
	 * @type {Array<{lngLat: {lng: number, lat: number}}>}
	 */
	let markers = $state([]);

	function addBuildingMarkers() {
		api.getData().then((data) => {
			if (!map) return;

			for (const [key, building] of Object.entries(data.part)) {
				markers.push({
					lngLat: {
						lng: building.building.lng,
						lat: building.building.lat
					}
				});
			}
		});
	}

	function updateLayers() {
		if (!map) return;
		for (let level of LEVEL_ORDER) {
			if (level === levelSelect?.currentLevel) {
				map.setLayoutProperty(level, 'visibility', 'visible');
				map.setLayoutProperty(`building-layer-${level}`, 'visibility', 'visible');
			} else {
				map.setLayoutProperty(level, 'visibility', 'none');
				map.setLayoutProperty(`building-layer-${level}`, 'visibility', 'none');
			}
		}

		// Update route visibility based on current level
		// if (this.showRoute) {
		//     this.updateRouteVisibility();
		// }

		// roomInfoOverlay.updateRoomMarkerColor();
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
			17: 0
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
		updateLayers();
	});

	let isRouteStartPointSetting = false;
	let routeInformation = null;
	/**
	 * @type {SearchOverlay | null}
	 */
	let searchOverlay = null;
	/**
	 * @type {RoomInfoOverlay | null}
	 */
	let roomInfoOverlay = null;

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
				map?.flyTo({
					center: [room.latLng.lng, room.latLng.lat],
					zoom: Math.max(19, map.getZoom()),
					duration: 1000
				});
			}
		}
	}

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
			params.set('lat', map.getCenter().lat.toFixed(6));
			params.set('lng', map.getCenter().lng.toFixed(6));
			params.set('zoom', map.getZoom().toFixed(2));
		}
		if (levelSelect?.currentLevel) {
			params.set('level', levelSelect.currentLevel);
		}
		if (selectedRoom) {
			params.set('room', selectedRoom.name);
			params.set('building', selectedRoom.buildingName);
		}
		if (selectedMarker) {
			params.set('marker', selectedMarker.type.id);
		}

		// set the hashtag
		const newHash = '#' + params.toString();
		if (window.location.hash !== newHash) {
			// console.log("Updating URL hash to:", newHash);
			window.history.replaceState(null, '', newHash);
		}
	}

	function checkRoomInView() {
		if (!map || !selectedRoom) return;
		const roomLngLat = { lng: selectedRoom.latLng.lng, lat: selectedRoom.latLng.lat };
		const mapBounds = map.getBounds();
		if (roomInfoOverlay) {
			roomInfoOverlay.setRoomVisible(mapBounds.contains(roomLngLat));
		}
	}

	onMount(() => {
		// on initial load, check url for state
		const params = new SvelteURLSearchParams(window.location.hash.slice(1));
		const lat = parseFloat(params.get('lat') || '');
		const lng = parseFloat(params.get('lng') || '');
		const zoom = parseFloat(params.get('zoom') || '');
		const level = params.get('level');
		const roomName = params.get('room');
		const buildingName = params.get('building');
		const markerTypeId = params.get('marker');

		if (lat && lng && zoom) {
			map?.setCenter([lng, lat]);
			map?.setZoom(zoom);
		}
		if (level) {
			levelSelect?.setLevel(level);
		}
		if (roomName && buildingName) {
			api.findRoom(roomName, buildingName, level).then((result) => {
				if (result) {
					selectRoom(result, false);
				}
			});
		}
		if (markerTypeId) {
			availableMapMarkerTypes.forEach((type) => {
				if (type.id === markerTypeId) {
					setTimeout(() => {
						searchOverlay?.setSearchInput(type.name);
					}, 1000);
				}
			});
		}
	});

	$effect(() => {
		updateUrl();
	});
</script>

<MapLibre
	bind:map
	center={[11.582, 48.1351]}
	zoom={13}
	maxZoom={25}
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
	onzoom={() => {
		if (map) reactiveZoom = map.getZoom();
	}}
	onload={() => {
		if (!map) {
			return;
		}
		loadWcIcon();
		genLayers();
		updateLayers();
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
			api
		});
		checkRoomInView();
	}}
>
	{#if map && reactiveZoom <= 17}
		{#each markers as marker (marker)}
			<Marker lngLat={marker.lngLat} class="buildingmarker rounded-full bg-red-300">
				<div style="width: {markerSize}px; height: {markerSize}px;"></div>
			</Marker>
		{/each}
	{/if}

	{#if selectedRoom}
		<Marker
			lngLat={{ lng: selectedRoom.latLng.lng, lat: selectedRoom.latLng.lat }}
			class="srm"
			zIndex={1000}
		>
			<div class="selected-room-marker">
				{selectedRoom.name}
			</div>
		</Marker>
	{/if}
	{#if selectedMarker}
		{#await api.getMarker(selectedMarker) then markers}
			{#each markers as marker (marker)}
				{#await api.getSearchRoom(marker) then makerRoom}
					{#if makerRoom && makerRoom.level === levelSelect?.currentLevel}
						<Marker
							lngLat={{ lng: makerRoom.latLng.lng, lat: makerRoom.latLng.lat }}
							class="srm"
							zIndex={1000}
							onclick={(e) => {
								selectRoom(makerRoom);
							}}
						>
							<div class="selected-room-marker">&#8203;</div>
						</Marker>
					{/if}
				{/await}
			{/each}
		{/await}
	{/if}

	<NavigationControl position="bottom-right" />
	<GeolocateControl position="bottom-right" />
	<ScaleControl position="bottom-left" />
</MapLibre>

<LevelSelect bind:this={levelSelect} {map} />

<RoomInfoOverlay bind:this={roomInfoOverlay} {map} {selectedRoom} {selectRoom} />

<SearchOverlay
	bind:this={searchOverlay}
	{map}
	{selectRoom}
	{selectedRoom}
	{selectMarker}
	{selectedMarker}
/>

<style>
	:global(.map) {
		height: 100%;
		width: 100%;
	}

	.selected-room-marker {
		background-color: rgb(9, 99, 83);
		color: white;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 14px;
		font-weight: bold;
		text-align: center;
		white-space: nowrap;
		transform: translate(0, calc(-100% + 10px));
	}

	.selected-room-marker::after {
		content: '';
		position: absolute;
		bottom: -11px;
		left: 50%;
		transform: translateX(-50%);
		border-width: 6px;
		border-style: solid;
		border-color: rgb(9, 99, 83) transparent transparent transparent;
	}
</style>
