<script>
    import api from "./api/api";
    import { onMount } from "svelte";
    import { getAvailableLayers } from "./availablelayers";
    import { LEVEL_SHORT } from "./constants";
    import { SearchRoomResponse } from "./searchEngine";

    let currentLevel = $state("EG");

    /**
     * @type {any | null}
     */
    let buildingdata = null;
    /**
     * @type {string[] | null}
     */
    let availableLevels = $state(null);

    /**
     * @type {{
     *     map: import("maplibre-gl").Map | undefined;
     *     selectedRoom: SearchRoomResponse | null;
     * }}
     */
    let { map, selectedRoom } = $props();

    onMount(() => {
        api.getData().then((data) => {
            buildingdata = data;
            update();
        });
    });

    /**
     * @param {string} level
     */
    export function setLevel(level) {
        currentLevel = level;
    }

    /**
     * Takes maplibre map instance and updates the level select with the current
     * level.
     *
     * @returns {void}
     */
    export function update() {
        if (!buildingdata) return;
        if (!map) return;
        availableLevels = getAvailableLayers(map, buildingdata);
    }

    export { currentLevel };
</script>

<div id="level-select-overlay">
    <div id="level-select">
        {#if availableLevels == null}
            {#each { length: 11 } as _, i (i)}
                <div class="loading-level-button">
                    <div
                        class="loading-shimmer"
                        style="animation-delay: {((i * 1) / 3) % 1}s;"
                    ></div>
                </div>
            {/each}
        {:else if availableLevels.length > 0}
            {#each availableLevels as level (level)}
                <button
                    class="level-select-button"
                    class:selected={currentLevel === level}
                    class:isRoomSelected={selectedRoom != null &&
                        selectedRoom.level === level}
                    onclick={() => (currentLevel = level)}
                    >{LEVEL_SHORT[level]}</button
                >
            {/each}
        {:else}
            <button
                class="level-select-button"
                onclick={() => {
                    map?.flyTo({ center: [11.582, 48.1351], zoom: 13 });
                }}>Home</button
            >
        {/if}
    </div>
</div>

<style>
    #level-select {
        background-color: rgba(40, 44, 52, 0.9);
        border: 1.5px solid #49904a;
        border-radius: 14px;
        padding: 4px;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }

    #level-select-overlay {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
    }

    .loading-level-button {
        width: 40px;
        height: 30px;
        margin: 4px 0;
        background-color: rgba(40, 44, 52, 0.8);
        border-radius: 10px;
        position: relative;
        overflow: hidden;
    }

    .loading-shimmer {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        background: linear-gradient(
            90deg,
            rgba(40, 44, 52, 0.8) 0%,
            rgba(255, 255, 255, 0.4) 50%,
            rgba(40, 44, 52, 0.8) 100%
        );
        animation: shimmer 1s infinite;
        animation-timing-function: ease;
        animation-delay: 0s;
        animation-timing-function: linear;
        border-radius: 5px;
        margin: 6px;
        height: calc(100% - 12px);
        transform: translateX(-150%);
    }

    @keyframes shimmer {
        0% {
            transform: translateX(-120%);
        }

        100% {
            transform: translateX(120%);
        }
    }

    .level-select-button {
        width: 35px;
        height: 28px;
        margin: 3px 0;
        background-color: rgba(40, 44, 52, 0.8);
        border: 2px solid transparent;
        border-radius: 10px;
        color: #ffffff;
        font-size: 10px;
        font-weight: 400;
        cursor: pointer;
        transition: all 0.25s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1.2;
    }

    .level-select-button:hover {
        background-color: rgba(80, 84, 92, 0.9);
        transform: scale(1.05);
    }

    .level-select-button.selected {
        background-color: #007acc;
        color: #ffffff;
        box-shadow: 0 2px 8px rgba(0, 122, 204, 0.4);
        transform: scale(1.1);
    }

    .level-select-button.isRoomSelected {
        border: 2px solid #ff4444;
    }

    /* .level-select-button.has-selected-room {
		border: 2px solid #ff4444;
	} */
</style>
