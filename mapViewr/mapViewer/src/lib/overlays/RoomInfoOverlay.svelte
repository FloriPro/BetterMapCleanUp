<script>
    import { slide, fade } from "svelte/transition";
    import { cubicOut } from "svelte/easing";
    import { SearchRoomResponse } from "../searchEngine";
    import api from "../api/api";
    import RoomInfoOverlayDetails from "./RoomInfoOverlayDetails.svelte";
    import RouteOverlay from "./RouteOverlay.svelte";
    import Controlls from "./Controlls.svelte";

    /**
     * @type {{
     *     map: import("maplibre-gl").Map | undefined;
     *     selectedRoom: SearchRoomResponse | null;
     *     selectRoom: Function;
     *     routeToRoom: Function;
     *     routeInformation:
     *         | {
     *               start: { lat: number; lng: number };
     *               end: { lat: number; lng: number };
     *               room: SearchRoomResponse;
     *               routeLength: number;
     *               levelChanges: number;
     *               timeEstimate: number;
     *           }
     *         | null
     *         | { error: string };
     *     clearRoute?: () => void;
     * }} }
     */
    let {
        map,
        selectedRoom,
        selectRoom,
        routeToRoom,
        routeInformation,
        clearRoute,
    } = $props();

    /**
     * @type {{ name: string; buildingName: string } | null}
     */
    let oldRoomData = $state(null);
    $effect(() => {
        if (selectedRoom) {
            oldRoomData = {
                name: selectedRoom.name,
                buildingName: selectedRoom.buildingName,
            };
        } else {
            large = false;
        }
    });

    export function hideRoom() {
        // selectedRoom = null;
        selectRoom(null);
    }

    let roomVisible = $state(true);
    /**
     * @param {boolean} visible
     */
    export function setRoomVisible(visible) {
        roomVisible = visible;
    }

    let large = $state(false);

    /**
     * @type {HTMLElement | null}
     */
    let overlayElement = null;
    /**
     * @type {ResizeObserver | undefined}
     */
    let resizeObserver;
    /**
     * @type {MutationObserver | undefined}
     */
    let mutationObserver;

    function updateMapControlsBottom() {
        let h = 0;
        if (overlayElement) {
            h = overlayElement.getBoundingClientRect().height;
            // if this is hidden, treat height as 0
            if (!overlayElement.classList.contains("visible")) {
                h = 0;
            }
        }

        /**
         * @type {HTMLElement | null}
         */
        const bottomRightControl = document.querySelector(
            ".maplibregl-ctrl-bottom-right",
        );
        if (bottomRightControl) {
            bottomRightControl.style.bottom = h + "px";
        }

        /**
         * @type {HTMLElement | null}
         */
        const bottomLeftControl = document.querySelector(
            ".maplibregl-ctrl-bottom-left",
        );
        if (bottomLeftControl) {
            bottomLeftControl.style.bottom = h + "px";
        }
    }

    $effect(() => {
        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(() =>
                updateMapControlsBottom(),
            );
            if (overlayElement) resizeObserver.observe(overlayElement);
        }

        if (typeof MutationObserver !== "undefined") {
            mutationObserver = new MutationObserver(() =>
                updateMapControlsBottom(),
            );
            if (typeof document !== "undefined") {
                mutationObserver.observe(document.body, {
                    childList: true,
                    subtree: true,
                });
            }
        }

        // initial update after first paint
        requestAnimationFrame(updateMapControlsBottom);

        return () => {
            resizeObserver?.disconnect();
            mutationObserver?.disconnect();
        };
    });

    // rerun when selectedRoom or large change (Svelte 5)
    $effect(() => {
        if (!overlayElement) return;
        // touch selectedRoom and large to create reactive dependencies
        selectedRoom;
        large;
        requestAnimationFrame(updateMapControlsBottom);
    });

    let offsetHeight = $state(0);
    export function getHeight() {
        return offsetHeight;
    }
</script>

<div
    id="room-info-overlay"
    bind:this={overlayElement}
    bind:offsetHeight
    class:visible={selectedRoom}
>
    <RouteOverlay canBeLarge={!large} {routeInformation} {clearRoute} />
    {#if selectedRoom}
        <div
            class="room-info-container"
            in:slide={{ duration: 300 }}
            out:slide={{ duration: 220 }}
        >
            <div class="room-info-header" class:has-bottom-border={large}>
                <div>
                    <div class="room-info-title">
                        {oldRoomData?.name || "Room Name"}
                    </div>
                    <div class="room-info-building">
                        {oldRoomData?.buildingName || "Building Name"}
                    </div>
                </div>
                <Controlls
                    actions={[
                        {
                            title: "Show on map",
                            icon: "📍",
                            onClick: () => {
                                if (selectedRoom) {
                                    map?.flyTo({
                                        center: [
                                            selectedRoom.latLng.lng,
                                            selectedRoom.latLng.lat,
                                        ],
                                        zoom: Math.max(19, map.getZoom()),
                                        duration: 1000,
                                    });
                                }
                            },
                            visible: !roomVisible,
                            class: "show-btn",
                        },
                        {
                            label: "Route",
                            title: "Start route to this room",
                            icon: "🗺️",
                            onClick: () => {
                                routeToRoom(selectedRoom);
                            },
                            class: "route-btn",
                        },
                        {
                            title: "Show more or less information about this room",
                            // label: large ? 'Show Less' : 'Show More',
                            icon: large ? "↓" : "↑",
                            onClick: () => {
                                large = !large;
                            },
                            class: "expand-btn",
                        },
                        {
                            // label: 'Close',
                            title: "Close",
                            icon: "✕",
                            onClick: () => {
                                selectRoom(null);
                            },
                            class: "close-btn",
                        },
                    ]}
                />
            </div>
            <RoomInfoOverlayDetails {selectedRoom} {large} />
        </div>
    {/if}
</div>

<style>
    .room-info-container::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.3) 50%,
            transparent 100%
        );
    }

    .room-info-container {
        padding: 10px;
        position: relative;
    }
    .room-info-header.has-bottom-border {
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .room-info-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0px;
        padding-bottom: 0px;
        border-bottom: 0px solid rgba(255, 255, 255, 0);

        transition:
            border-bottom 0.3s ease,
            margin-bottom 0.3s ease,
            padding-bottom 0.3s ease;
    }

    #room-info-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        will-change: transform;
        background: linear-gradient(
            135deg,
            rgba(40, 44, 52, 0.97) 0%,
            rgba(45, 49, 57, 0.95) 100%
        );
        border-top: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px 12px 0 0;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        box-shadow:
            0 -4px 20px rgba(0, 0, 0, 0.3),
            0 -2px 10px rgba(0, 0, 0, 0.2),
            inset 0 0px 0 rgba(255, 255, 255, 0.1);
        overflow: hidden;
    }
    .room-info-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0px;
        padding-bottom: 0px;
    }

    .room-info-title {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 4px;
    }
    .room-info-building {
        font-size: 12px;
        opacity: 0.8;
    }
</style>
