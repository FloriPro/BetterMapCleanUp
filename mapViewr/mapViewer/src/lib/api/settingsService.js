import { browser } from "$app/environment";

let settingsService = class settingsService {
    constructor() {
        /**
         * @type {Object.<
         *     string,
         *     {
         *         name: string;
         *         type: string;
         *         default: string | boolean | number;
         *         category: string;
         *         description?: string;
         *         options?: string[];
         *     }
         * >}
         */
        this.config = {
            accessible: {
                name: "Avoid Stairs",
                type: "bool",
                default: false,
                category: "Routing Preferences",
                description: "Find accessible routes when possible",
            },
            shortestPath: {
                name: "Prefer Shortest Path",
                type: "bool",
                default: true,
                category: "Routing Preferences",
                description:
                    "Optimize for distances instead of physical exertion.",
            },
            notOutside: {
                name: "Prefer Indoor Routes",
                type: "bool",
                default: false,
                category: "Routing Preferences",
                description: "Prefer routes that are indoors when available",
            },
            ignoreLocks: {
                name: "Ignore Locks",
                type: "bool",
                default: false,
                category: "Routing Preferences",
                description: "Ignore locked areas when calculating routes",
            },
            noElevator: {
                name: "Ignore Elevators",
                type: "bool",
                default: true,
                category: "Routing Preferences",
                description:
                    "Ignore elevators when calculating routes (even if stairs are avoided)",
            },
            // units: {
            //     name: "Distance Units",
            //     type: "select",
            //     default: "Meters",
            //     category: "Display Settings",
            //     options: ["Meters", "Feet"]
            // },
            walkingSpeed: {
                name: "Walking Speed (m/s)",
                type: "number",
                default: 1.4,
                category: "Display Settings",
            },
            timePerLevelChange: {
                name: "Time per Level Change (seconds)",
                type: "number",
                default: 30,
                category: "Display Settings",
            },
        };
        /**
         * @type {Object.<string, string | boolean | number>}
         */
        this.values = {};
        if (browser) {
            this.load();
        }
    }

    load() {
        for (const key in this.config) {
            const val = localStorage.getItem("settings_" + key);
            if (val !== null) {
                if (this.config[key].type === "bool") {
                    this.values[key] = val === "true";
                } else {
                    this.values[key] = JSON.parse(val);
                }
            } else {
                this.values[key] = this.config[key].default;
            }
        }
    }

    /**
     * @param {string} key
     * @param {string | boolean | number} value
     */
    save(key, value) {
        this.values[key] = value;
        localStorage.setItem("settings_" + key, JSON.stringify(value));
    }

    /**
     * @param {string} key
     * @returns {string | boolean | number}
     */
    getValue(key) {
        return this.values[key];
    }

    /**
     * @param {{
     *     pointTags: import("$lib/api/datatype").PointTags;
     *     lineTags: import("$lib/api/datatype").LineTags;
     *     baseDistance: number;
     * }} params
     * @returns {number}
     */
    getRouteWeight({ pointTags, lineTags, baseDistance }) {
        let weight = baseDistance;
        // accessible == true means: the route is not accessible
        if (this.getValue("accessible")) {
            if (lineTags["accessible"] === true) {
                weight *= 10000;
            }
        } else {
            if (pointTags["elevator"] === true) {
                weight = Math.max(weight, 5) * 10;
            }
        }
        if (!this.getValue("ignoreLocks")) {
            if (pointTags["private"] === true) {
                weight *= 1000;
            }
            if (lineTags["locked"] === true) {
                weight *= 1000;
            }
            if (lineTags["unlikely"] === true) {
                weight *= 4;
            }
        }
        if (this.getValue("notOutside") && pointTags["outside"] === true) {
            weight *= 10;
        }
        if (!this.getValue("shortestPath")) {
            if (lineTags["accessible"] === true) {
                weight *= 2;
            }
        }
        if (this.getValue("noElevator")) {
            if (pointTags["elevator"] === true) {
                weight *= 10000;
            }
        }
        return weight;
    }
};

export default new settingsService();
