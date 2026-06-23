const isDev = import.meta.env.DEV;

let apiUrls = {
    getRoom: (
        /**
         * @type {string}
         */ buildingId,
    ) => `http://localhost:3015/data/roomInfo/${buildingId}.json`,
    getAppData: () => "http://localhost:3015/data/app_data.json",
    getRoutingData: (
        /**
         * @type {string}
         */ buildingId,
    ) => `http://localhost:3015/routing/routingUpload/${buildingId}.json`,
    getTileMap: (
        /**
         * @type {string}
         */ level,
    ) => `http://localhost:3015/mapTiling/tiles/${level}/{z}/{x}/{y}.png`,
    getMarker: (
        /**
         * @type {string}
         */ type,
    ) => "http://localhost:3015/data/roomInfo/typeSearch/" + type + ".json",
    getWCIcon: () => "http://localhost:3015/mapViewer/wc-Icon.png",
};

if (!isDev) {
    apiUrls = {
        getRoom: (
            /**
             * @type {string}
             */ buildingId,
        ) => `https://raumplan.flulu.de/roomInfo/${buildingId}.json`,
        getAppData: () => "https://raumplan.flulu.de/app_data.json",
        getRoutingData: (
            /**
             * @type {string}
             */ buildingId,
        ) => `https://raumplan.flulu.de/routing/${buildingId}.json`,
        getTileMap: (
            /**
             * @type {string}
             */ level,
        ) => `https://raumplan.flulu.de/tilesLQ/${level}/{z}/{x}/{y}.png`,
        getMarker: (
            /**
             * @type {string}
             */ type,
        ) => `https://raumplan.flulu.de/type-search/${type}.json`,
        getWCIcon: () => `https://raumplan.flulu.de/imgs/wc-Icon.png`,
    };
}

export default apiUrls;

export const LEVEL_ORDER = [
    "UG 03",
    "UG 02",
    "UG 01",
    "EG",
    "EG Z",
    "OG 01",
    "OG 01 Z",
    "OG 02",
    "OG 02 Z",
    "OG 03",
    "OG 03 Z",
    "OG 04",
    "OG 04 Z",
    "OG 05",
    "OG 05 Z",
    "OG 06",
    "OG 06 Z",
    "OG 07",
    "OG 07 Z",
].reverse();
/**
 * @type {{ [key: string]: string }}
 */
export const LEVEL_SHORT = {
    "OG 07 Z": "OG 7Z",
    "OG 07": "OG 7",
    "OG 06 Z": "OG 6Z",
    "OG 06": "OG 6",
    "OG 05 Z": "OG 5Z",
    "OG 05": "OG 5",
    "OG 04 Z": "OG 4Z",
    "OG 04": "OG 4",
    "OG 03 Z": "OG 3Z",
    "OG 03": "OG 3",
    "OG 02 Z": "OG 2Z",
    "OG 02": "OG 2",
    "OG 01 Z": "OG 1Z",
    "OG 01": "OG 1",
    "EG Z": "EG Z",
    EG: "EG",
    "UG 01": "UG 1",
    "UG 02": "UG 2",
    "UG 03": "UG 3",
};

/**
 * @typedef {Object} MapMarkerType
 * @property {string} id        - Unique identifier for the marker type.
 * @property {string} icon      - Icon representing the marker type (e.g., emoji
 *                              or URL)
 * @property {string} name      - Human-readable name of the marker type.
 * @property {string} selector  - CSS selector or class name associated with the
 *                              marker type.
 */
export const availableMapMarkerTypes = [
    { id: "WC-H", icon: "🚹", name: "Toilette Herren", selector: "wc-h" },
    { id: "WC-D", icon: "🚺", name: "Toilette Damen", selector: "wc-d" },
];
