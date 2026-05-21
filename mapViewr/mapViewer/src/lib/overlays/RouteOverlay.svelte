<script>
    import { SearchRoomResponse } from "$lib/searchEngine";
    import { getContext } from "svelte";
    import Controlls from "./Controlls.svelte";
    import SmoothResizer from "./SmoothResizer.svelte";
    import RouteSettings from "./RouteSettings.svelte";
    let large = $state(true);
    /**
     * @type {{
     *     canBeLarge: boolean;
     *     routeInformation: {
     *         start: { lat: number; lng: number };
     *         end: { lat: number; lng: number };
     *         room: SearchRoomResponse;
     *         routeLength: number;
     *         levelChanges: number;
     *         timeEstimate: number;
     *     } | null;
     *     clearRoute?: () => void;
     * }}
     */
    let { canBeLarge, routeInformation, clearRoute } = $props();

    /**
     * @type {boolean}
     */
    let actualLarge = $derived((canBeLarge && large) || false);

    /**
     * @type {Function}
     */
    let selectRoom = getContext("selectRoom");
    /**
     * @type {Function}
     */
    let showRoute = getContext("showRoute");
    /**
     * @type {Function}
     */
    let setStartPoint = getContext("setStartPoint");
    /**
     * @type {Function}
     */
    let openSettings = getContext("openSettings");

    // const totalSeconds = routeInformation
    //     ? Math.round(routeInformation.timeEstimate)
    //     : 0;
    // const minutes = Math.floor(totalSeconds / 60);
    // const seconds = totalSeconds % 60;
    // let timeString = "";
    // if (minutes > 0) {
    //     timeString = `${minutes} min${minutes > 1 ? "s" : ""} ${seconds} sec`;
    // } else {
    //     timeString = `${seconds} sec`;
    // }

    let timeString = $derived.by(() => {
        if (!routeInformation) return "";
        const totalSeconds = Math.round(routeInformation.timeEstimate);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes > 0) {
            return `${minutes} min${minutes > 1 ? "s" : ""} ${seconds} sec`;
        } else {
            return `${seconds} sec`;
        }
    });
</script>

{#snippet routeButton(
    /** @type {string} */ icon,
    /** @type {string} */ text,
    /** @type {Function} */ oc,
)}
    <button
        class="route-button"
        onclick={() => {
            oc();
        }}
    >
        {icon}
        {text}
    </button>

    <style>
        .route-button {
            background: linear-gradient(135deg, #4fa8d8 0%, #3d8bb0 100%);
            color: #fff;
            border: none;
            padding: 3px 10px;
            border-radius: 18px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition:
                box-shadow 0.18s,
                transform 0.18s;
            width: auto;
            min-width: 90px;
            margin: 0 6px 0 0;
            box-shadow: 0 2px 8px rgba(79, 168, 216, 0.1);
            outline: none;
            display: inline-block;
            position: relative;
            letter-spacing: 0.05em;
        }
    </style>
{/snippet}

{#snippet routeInfoPart(
    /** @type {string} */ icon,
    /** @type {string} */ text,
    /** @type {string}*/ value,
)}
    <div class="route-info-item">
        <span class="route-info-icon">{icon}</span>
        <span>{text}: <span class="route-level-indicator">{value}</span></span>
    </div>
{/snippet}

{#if routeInformation}
    <div id="room-info-container">
        <div class="route-info-header" class:has-bottom-border={actualLarge}>
            <div>
                <div class="route-info-title">{routeInformation.room.name}</div>
                <div class="route-info-building">Route</div>
            </div>
            <Controlls
                actions={[
                    {
                        title: "Small / large",
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
                            console.log("clear route", clearRoute);
                            clearRoute?.();
                        },
                        class: "close-btn",
                    },
                ]}
            />
        </div>
        <SmoothResizer
            expanded={actualLarge}
            duration={220}
            class="smooth-resizer-container"
        >
            <div class="route-info">
                {#if routeInformation}
                    {@render routeInfoPart(
                        "📍",
                        "To",
                        routeInformation.room.name,
                    )}
                    {@render routeInfoPart(
                        "🏢",
                        "Building",
                        routeInformation.room.buildingName,
                    )}
                    {@render routeInfoPart(
                        "🏠",
                        "Level",
                        routeInformation.room.level,
                    )}
                    {@render routeInfoPart(
                        "📏",
                        "Length",
                        routeInformation.routeLength.toFixed(1) + " m",
                    )}
                    {@render routeInfoPart(
                        "🔼",
                        "Level Changes",
                        routeInformation.levelChanges.toString(),
                    )}
                    {@render routeInfoPart("⏱️", "Estimated Time", timeString)}
                {:else}
                    <div class="room-not-found">
                        No route information available.
                    </div>
                {/if}
            </div>
            <div class="route-action-buttons">
                <!-- route button: -->
                {#if routeInformation}
                    {@render routeButton("🎯", "Go to Room", () => {
                        selectRoom(routeInformation.room);
                    })}
                    {@render routeButton("🗺️", "Show Route", () => {
                        showRoute();
                    })}
                    {@render routeButton("📍", "Set Start Point", () => {
                        setStartPoint();
                    })}
                    {@render routeButton("⚙️", "Open Settings", () => {
                        openSettings();
                    })}
                {:else}
                    <div class="room-not-found">
                        No route information available.
                    </div>
                {/if}
            </div>
        </SmoothResizer>
    </div>
{/if}

<style>
    #room-info-container {
        padding: 10px;
        position: relative;
    }
    .route-info-header {
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

    .route-info-title {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 4px;
    }
    .route-info-building {
        font-size: 12px;
        opacity: 0.8;
    }
    .has-bottom-border {
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .route-level-indicator {
        display: inline-block;
        padding: 2px 6px;
        background: rgba(79, 168, 216, 0.2);
        border: 1px solid rgba(79, 168, 216, 0.3);
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        color: #4fa8d8;
        margin-left: 4px;
    }
    .route-info-item {
        display: flex;
        align-items: center;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.8);
        padding-right: 12px;
        border-right: 1px solid rgba(255, 255, 255, 0.12);
    }
    .route-info-icon {
        margin-right: 8px;
        font-size: 14px;
    }

    .route-action-buttons {
        display: flex;
        gap: 5px;
        margin-top: 12px;
        justify-content: center;
        flex-wrap: wrap;
    }
    .route-info {
        margin-bottom: 12px;
        gap: 10px;

        display: flex;
        flex-direction: row;
        justify-content: center;
        flex-wrap: wrap;
    }
    .route-info-item:last-child {
        border-right: none;
    }
</style>
