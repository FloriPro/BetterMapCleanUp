<script>
    import {
        checkCorsProxy,
        fetchWithCorsProxy,
        hasCorsProxy,
    } from "$lib/api/corsFetch.svelte";
    import * as cheerio from "cheerio";
    import { onMount } from "svelte";
    import GeoJson from "geojson";

    const DB_NAME = "UsageDataDB";
    const STORE_NAME = "usageData";

    onMount(async () => {
        checkCorsProxy();
        try {
            const cached = await loadFromIndexedDB();
            if (cached) {
                usageData = cached.data;
                lastUpdated = cached.timestamp;
                console.log(
                    "Loaded usage data from cache, timestamp:",
                    new Date(lastUpdated).toLocaleString(),
                );
            }
        } catch (e) {
            console.error("Failed to load usage data from IndexedDB:", e);
        }
    });

    /**
     * @type {{
     *     heatmapdata: null | GeoJson.GeoJSON;
     * }}
     */
    // eslint-disable-next-line no-useless-assignment
    let { heatmapdata = $bindable(null) } = $props();

    /**
     * @type {null | GeoJson.GeoJSON}
     */
    let usageData = $state(null);
    /**
     * @type {null | number}
     */
    let usageDataProgress = $state(null);
    /**
     * @type {null | number}
     */
    let lastUpdated = $state(null);

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: "id" });
                }
            };
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async function clearIndexeDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = () => {
                lastUpdated = null;
                usageData = null;
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function saveToIndexedDB(data) {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const timestamp = Date.now();
        return new Promise((resolve, reject) => {
            const request = store.put({ id: "latest", data, timestamp });
            request.onsuccess = () => {
                lastUpdated = timestamp;
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function loadFromIndexedDB() {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        return new Promise((resolve, reject) => {
            const request = store.get("latest");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function updateUsageData() {
        usageDataProgress = 0;

        let htmlrequest = await fetchWithCorsProxy(
            "https://wlan.lrz.de/apstat/",
            {},
            (e) => {
                usageDataProgress = e.loaded;
                console.log("usageDataProgress:", usageDataProgress);
            },
        );
        // let htmlrequest = {
        //     responseText: await (await fetch("demodat.html")).text(),
        // };
        usageDataProgress = null;

        console.log(htmlrequest.responseText);
        let ß = cheerio.load(htmlrequest.responseText);
        console.log("loaded");

        let aptable = ß("table#aptable tbody").first();
        if (aptable.length != 1) {
            throw "table #aptable not found";
        }

        /**
         * @type {{ apName: string; count: number }[]}
         */
        let scrapedData = [];
        aptable.children("tr").each((i, tr) => {
            const tds = ß(tr).children("td");
            if (tds.length !== 7) {
                throw (
                    "Unexpected number of columns in table row, error: " +
                    tds.length
                );
            }

            const attr1 = ß(tds[0]).find("a").attr("href");
            if (attr1 == undefined) {
                console.warn("attr href of tds[0] is undefined");
                return;
            }
            const unterbezirk = attr1.split("/").slice(-1)[0];
            const standort = ß(tds[0]).text().trim();

            // Column 1: Raum
            const raum = ß(tds[1]).text().trim();

            // Column 2: AP name and href (must match)
            const attr2 = ß(tds[2]).find("a").attr("href");
            if (attr2 == undefined) {
                console.warn("attr href of tds[2] is undefined");
                return;
            }
            const apHref = attr2.split("/").slice(-2)[0]; // second last
            const apName = ß(tds[2]).text().trim();

            if (apHref !== apName) {
                console.error(
                    "AP name and href do not match, error",
                    apName,
                    apHref,
                );
                return;
            }

            // Column 4: AP type
            const apType = ß(tds[4]).text().trim();

            // Column 5: nested table for Auslastung
            const auslastungTRs = ß(tds[5]).find("table tr");

            /**
             * @type {{ [key: string]: number }}
             */
            const auslastungMap = {};
            auslastungTRs.each((idx, el) => {
                const innerTds = ß(el).children("td");
                if (innerTds.length !== 2) {
                    console.error(
                        "Unexpected number of columns in auslastung table row, error",
                        innerTds.length,
                    );
                    return;
                }
                const key = ß(innerTds[0])
                    .text()
                    .trim()
                    .replace(":", "")
                    .toLowerCase();
                const value = parseInt(
                    ß(innerTds[1]).text().trim().split("-")[1],
                    10,
                );
                auslastungMap[key] = value;
            });

            const auslastungGesamt = auslastungMap["gesamt"];
            const auslastungEduroam = auslastungMap["eduroam"];
            const auslastungLrz = auslastungMap["lrz"];
            const auslastungBayernWLAN = auslastungMap["@bayernwlan"];

            scrapedData.push({
                apName,
                count: auslastungGesamt,
            });
        });

        let apPositionsLookup = JSON.parse(
            await (await fetch("apToPosLookup.json")).text(),
        );

        /**
         * @type {Record<
         *     string,
         *     {
         *         count: number;
         *         apNames: string[];
         *         lng: number;
         *         lat: number;
         *         level: string;
         *     }
         * >}
         */
        let aggregated = {};
        for (let item of scrapedData) {
            let data = apPositionsLookup[item.apName];
            if (!data) continue;

            let level = data.level;
            let count = item.count;
            if (isNaN(count)) count = 0;

            const key = `${item.apName}`;

            if (aggregated[key]) {
                aggregated[key].count += count;
                aggregated[key].apNames.push(item.apName);
            } else {
                let [lat, lng] = getLatLng(apPositionsLookup, item.apName);
                if (!lat || !lng) continue;
                aggregated[key] = {
                    count: count,
                    apNames: [item.apName],
                    lng: lng,
                    lat: lat,
                    level: level,
                };
            }
        }

        /**
         * @type {import("geojson").Feature<import("geojson").Point>[]}
         */
        let features = Object.values(aggregated).map((info) => ({
            type: "Feature",
            properties: {
                count: info.count,
                apNames: info.apNames,
                level: info.level,
            },
            geometry: {
                type: "Point",
                coordinates: [info.lng, info.lat],
            },
        }));
        console.log(features);

        // usageData = { type: "FeatureCollection", features: features };
        /**
         * @type {GeoJSON.GeoJSON}
         */
        let dattosave = { type: "FeatureCollection", features: features };
        await saveToIndexedDB(dattosave);
        usageData = dattosave;
        return usageData;
    }

    /**
     * @param {{ [x: string]: { lng: number; lat: number } }} apPositionsLookup
     * @param {string} apName
     */
    function getLatLng(apPositionsLookup, apName) {
        for (let testap in apPositionsLookup) {
            if (testap === apName) {
                return [
                    apPositionsLookup[testap].lat,
                    apPositionsLookup[testap].lng,
                ];
            }
        }
        return [null, null];
    }
</script>

<!--add all possible custom overlay if's here with an or-->
{#if hasCorsProxy}
    <div id="custom-route-overlay">
        <div class="overlay-controls">
            <button
                class="btn btn-primary"
                onclick={() => {
                    if (usageData == null) {
                        heatmapdata = null;
                        updateUsageData().then(() => {
                            heatmapdata = usageData;
                        });
                    } else {
                        if (heatmapdata != usageData) {
                            heatmapdata = usageData;
                        } else {
                            heatmapdata = null;
                        }
                    }
                }}
            >
                {heatmapdata != usageData
                    ? "Show"
                    : usageData
                      ? "Hide"
                      : "Load"} usage heatmap
            </button>

            <button
                class="btn btn-secondary"
                onclick={() => {
                    updateUsageData().then(() => {
                        heatmapdata = usageData;
                    });
                }}
            >
                Update usage heatmap
                {#if lastUpdated != null}
                    <span class="last-updated">
                        (Last update: {new Date(
                            lastUpdated,
                        ).toLocaleTimeString()})
                    </span>
                {/if}
            </button>
            {#if usageDataProgress != null}
                <span class="progress-badge">({usageDataProgress} bytes)</span>
            {/if}

            <button
                class="btn btn-secondary"
                onclick={() => {
                    clearIndexeDB();
                }}
            >
                Clear heatmap data
            </button>
        </div>
    </div>
{/if}

<style>
    /* ── Your original overlay styles (unchanged) ── */
    #custom-route-overlay {
        position: absolute;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        width: fit-content;
        min-width: 300px;
        padding: 10px;
        z-index: 1000;
        will-change: transform;
        background: linear-gradient(
            135deg,
            rgba(40, 44, 52, 0.97) 0%,
            rgba(45, 49, 57, 0.95) 100%
        );
        border-top: 1px solid rgba(255, 255, 255, 0.2);
        border-right: 1px solid rgba(255, 255, 255, 0.2);
        border-left: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px 12px 0 0;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        box-shadow:
            0 -4px 20px rgba(0, 0, 0, 0.3),
            0 -2px 10px rgba(0, 0, 0, 0.2),
            inset 0 0px 0 rgba(255, 255, 255, 0.1);
        overflow: hidden;
    }

    /* ── Updated inner styles to match the first style ── */
    .overlay-controls {
        display: flex;
        align-items: center;
        gap: 10px; /* matches .route-info gap */
        flex-wrap: wrap;
        justify-content: center;
        padding: 6px 0;
        margin-bottom: 0;
        border-bottom: 0 solid rgba(255, 255, 255, 0); /* for optional transition */
        transition:
            border-bottom 0.3s ease,
            margin-bottom 0.3s ease,
            padding-bottom 0.3s ease;
    }

    .btn {
        border: 1px solid rgba(255, 255, 255, 0.12); /* same as .route-info-item border-right */
        border-radius: 4px; /* consistent with .route-level-indicator */
        padding: 4px 12px; /* more compact, like info items */
        font-size: 12px; /* fixed px to match first style */
        font-weight: 500;
        cursor: pointer;
        transition:
            background 0.15s ease,
            border-color 0.15s ease;
        background: transparent; /* subtle, like .route-info-item */
        color: rgba(255, 255, 255, 0.8); /* same opacity as info text */
        display: inline-flex;
        align-items: center;
        gap: 6px;
        letter-spacing: 0.2px;
        line-height: 1.4;
        text-decoration: none;
    }

    .btn:hover {
        background: rgba(
            255,
            255,
            255,
            0.06
        ); /* light hover, like first style's subtle effects */
        border-color: rgba(255, 255, 255, 0.2);
    }

    .btn:active {
        background: rgba(255, 255, 255, 0.03);
    }

    /* Primary button – uses the blue accent from .route-level-indicator */
    .btn-primary {
        background: rgba(79, 168, 216, 0.2); /* same as level indicator bg */
        color: #4fa8d8; /* same text colour */
        border-color: rgba(79, 168, 216, 0.3); /* same border */
    }

    .btn-primary:hover {
        background: rgba(79, 168, 216, 0.3);
        border-color: rgba(79, 168, 216, 0.5);
    }

    .btn-primary:active {
        background: rgba(79, 168, 216, 0.15);
    }

    /* Secondary button – very minimal */
    .btn-secondary {
        background: transparent;
        color: rgba(255, 255, 255, 0.8);
        border-color: rgba(255, 255, 255, 0.12);
    }

    .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-secondary:active {
        background: rgba(255, 255, 255, 0.03);
    }

    /* Progress badge – resembles a pill / level indicator */
    .progress-badge {
        font-size: 12px; /* same as .route-info-building */
        background: rgba(255, 255, 255, 0.08); /* subtle */
        padding: 2px 12px;
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.8); /* consistent text */
        border: 1px solid rgba(255, 255, 255, 0.06);
        line-height: 1.6;
        font-weight: 500;
    }

    /* Last updated – matches .route-info-building style */
    .last-updated {
        font-size: 12px;
        opacity: 0.8; /* same as building text */
        font-weight: 400;
        letter-spacing: 0.2px;
        color: rgba(255, 255, 255, 0.8);
        margin-left: 4px;
    }
</style>
