import api from "$lib/api/api.js";
import { availableMapMarkerTypes } from "./constants.js";

class SearchResponse {
    /**
     * @param {string} name
     * @param {boolean} actuallyMarkerProposal
     */
    constructor(name, actuallyMarkerProposal) {
        this.name = name;
        this.actuallyMarkerProposal = actuallyMarkerProposal;
        /**
         * @type {string | null}
         */
        this.searchId = null; // will be set later
    }
}

class SearchRoomResponse extends SearchResponse {
    /**
     * @param {string} name
     * @param {string} buildingName
     * @param {import("./api/datatype.js").LatLng} latLng
     * @param {string} level
     * @param {import("./api/datatype.js").Room} originalRoom
     * @param {string} buildingId
     * @param {string} roomId
     * @param {number} similarity
     */
    constructor(
        name,
        buildingName,
        latLng,
        level,
        originalRoom,
        buildingId,
        roomId,
        similarity,
    ) {
        super(name, false);
        this.buildingName = buildingName;
        this.latLng = latLng;
        this.level = level;
        this.originalRoom = originalRoom;
        this.similarity = similarity;
        this.buildingId = buildingId;
        this.roomId = roomId;
        this.actuallyMarkerProposal = false;
    }
}

class MarkerProposal extends SearchResponse {
    /**
     * @param {import("./constants.js").MapMarkerType} type
     * @param {string} name
     * @param {number} similarity
     */
    constructor(type, name, similarity = 1) {
        super(name, true);
        this.type = type;
        this.similarity = similarity;
    }
}

const searchHandler = new (class SearchHandler {
    constructor() {
        this.ignoreText = ["-", "/", "(", ")", ".", ",", "'", '"'];
        this.replaceText = {
            ä: "a",
            ö: "o",
            ü: "u",
            ß: "ss",
        };
    }

    /**
     * @param {string} text
     * @returns {string}
     */
    doReplaceText(text) {
        let normalized = text.replaceAll("  ", " ");
        for (const [key, value] of Object.entries(this.replaceText)) {
            normalized = normalized.replaceAll(key, value);
        }
        return normalized;
    }

    /**
     * @param {string} text
     * @returns {string}
     */
    normalizeText(text) {
        let normalized = text.toLowerCase();
        normalized = this.doReplaceText(normalized);
        for (let char of this.ignoreText) {
            normalized = normalized.replaceAll(char, " ");
        }
        return normalized;
    }

    /**
     * @param {string} text
     * @returns {string}
     */
    normalizeNoSpaceText(text) {
        let normalized = this.normalizeText(text);
        return this.removeSpace(normalized);
    }

    /**
     * @param {string} text
     * @returns {string}
     */
    removeSpace(text) {
        return text.replace(/\s+/g, "");
    }

    /**
     * @param room          {import('./api/datatype.js').Room}
     * @param buildingData  {import('./api/datatype.js').Building}
     * @param part          {import('./api/datatype.js').PartValue}
     * @param buildingId    {string}
     * @param similarity    {Number}
     * @returns {SearchRoomResponse}
     */
    makeResponse(room, buildingData, part, buildingId, similarity) {
        return new SearchRoomResponse(
            room.rName,
            buildingData.displayName,
            room.latlng,
            part.level,
            room,
            buildingId,
            room.roomid,
            similarity,
        );
    }

    /**
     * @param {string} string
     * @param {string} o
     * @returns {number}
     */
    count(string, o) {
        //count occurrences of o in string
        return (string.match(new RegExp(o, "g")) || []).length;
    }
    /**
     * @param {string} a
     * @param {string} b
     * @returns {number}
     */
    levenshteinDistance(a, b) {
        const matrix = [];

        // Initialize the matrix
        for (let i = 0; i <= a.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= b.length; j++) {
            matrix[0][j] = j;
        }

        // Compute the distances
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                if (a[i - 1] === b[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        Math.min(
                            matrix[i][j - 1] + 1, // insertion
                            matrix[i - 1][j] + 1, // deletion
                        ),
                    );
                }
            }
        }

        return matrix[a.length][b.length];
    }

    /**
     * @param {string} a
     * @param {string} b
     * @returns {number}
     */
    similar(a, b) {
        let maxLen = Math.max(a.length, b.length);
        let distance = this.levenshteinDistance(a, b);
        return 1 - distance / maxLen;
    }

    /**
     * @param {string} a
     * @param {string} b
     * @returns {number}
     */
    similarStart(a, b) {
        let minLen = Math.min(a.length, b.length);
        a = a.substring(0, minLen);
        b = b.substring(0, minLen);
        return this.similar(a, b) - 0.1;
    }

    /**
     * @param {string} a
     * @param {string} b
     * @returns {number}
     */
    similarAnywhere(a, b) {
        // use the smallest length of the two strings, and check if one string is similar to any substring of the other string with that length
        let minLen = Math.min(a.length, b.length);
        if (minLen < 3) {
            return this.similar(a, b) - 0.2; // if the strings are very short, require a higher similarity
        }

        let maxVal = 0;
        for (let i = 0; i <= a.length - minLen; i++) {
            let substringA = a.substring(i, i + minLen);
            let sim = this.similar(substringA, b);
            if (sim > maxVal) {
                maxVal = sim;
            }
        }
        for (let i = 0; i <= b.length - minLen; i++) {
            let substringB = b.substring(i, i + minLen);
            let sim = this.similar(substringB, a);
            if (sim > maxVal) {
                maxVal = sim;
            }
        }
        return maxVal;
    }

    /**
     * @param {string} value
     * @returns {MarkerProposal[]}
     */
    checkMarkerProposals(value) {
        let out = [];
        for (let type of availableMapMarkerTypes) {
            let simmilarity = Math.max(
                this.similarAnywhere(
                    this.normalizeText(type.name),
                    this.normalizeText(value),
                ),
                this.similarAnywhere(
                    this.normalizeText(type.selector),
                    this.normalizeText(value),
                ),
            );
            for (let alias of type.aliases) {
                simmilarity = Math.max(
                    this.similarAnywhere(
                        this.normalizeText(alias),
                        this.normalizeText(value),
                    ),
                    simmilarity,
                );
            }
            if (simmilarity > 0.7) {
                out.push(new MarkerProposal(type, type.name, simmilarity));
            }
        }

        out.sort((a, b) => b.similarity - a.similarity);

        return out;
    }

    /**
     * @param {string} value
     * @returns {SearchResponse[]}
     */
    search(value) {
        if (!api.dataLoaded()) {
            return [];
        }

        let data = api.getSyncData();
        if (data === undefined) {
            return [];
        }

        let normalizedValue = this.normalizeText(value);
        if (normalizedValue.length === 0) {
            return [];
        }

        /**
         * @type {Array.<{
         *     type: string;
         *     room?: string;
         *     building?: string;
         *     subtr?: boolean;
         * }>}
         */
        let checks = [
            {
                type: "room",
                room: this.removeSpace(normalizedValue),
            },
            {
                type: "building",
                building: this.removeSpace(normalizedValue),
            },
        ];

        // let maybeRoomNumber = normalizedValue.match(/\b([a-z]?\d{1,5}[a-z]?)\b/i);
        const r = /\b([a-z]{0,2}\s?u?[\d,.-_;:]{2,6}[a-z]?)\b/gi;
        const allDecimals = /[\d ]/gi;
        let maybeRoomNumberIt = this.doReplaceText(value).matchAll(r);
        for (const maybeRoomNumber of maybeRoomNumberIt) {
            console.log("maybeRoomNumber", maybeRoomNumber);
            let maybeRoomNumberValue = maybeRoomNumber[0].trim();
            let buildingName = this.doReplaceText(value)
                .replace(maybeRoomNumberValue, "")
                .trim();
            if (
                buildingName &&
                buildingName.length >= 2 &&
                buildingName.replaceAll(allDecimals, "").length >= 2
            ) {
                checks.push({
                    type: "buildingAndRoom",
                    building: this.removeSpace(
                        this.normalizeText(buildingName),
                    ),
                    room: this.removeSpace(
                        this.normalizeText(maybeRoomNumberValue),
                    ),
                });
            } else {
                checks.push({
                    type: "room",
                    room: this.removeSpace(
                        this.normalizeText(maybeRoomNumberValue),
                    ),
                    subtr: true,
                });
            }
        }

        // Check all spaces
        /*let before = "";
		let after = normalizedValue;
		while (after.includes(" ")) {
			let index = after.indexOf(" ");
			before += after.substring(0, index);
			after = after.substring(index + 1);

			if (before.length > 0) {
				checks.push({
					"type": "buildingAndRoom",
					"building": this.normalizeText(before),
					"room": this.normalizeText(after)
				});
			}
		}*/

        console.log("checks", checks);

        const filteredRooms = [];

        const normalizedChecks = checks.map((check) => {
            return {
                ...check,
                normalizedRoom: check.room
                    ? this.normalizeNoSpaceText(check.room)
                    : null,
                normalizedBuilding: check.building
                    ? this.normalizeNoSpaceText(check.building)
                    : null,
            };
        });

        for (const [buildingId, building] of Object.entries(data.part)) {
            //this.main.buildingData.part
            const buildingData = building.building;
            const normalizedBuildingName = this.normalizeText(
                buildingData.displayName,
            );

            for (const part of Object.values(building.parts || {})) {
                for (const room of Object.values(part.rooms || {})) {
                    // const normalizedRoomName = this.normalizeText(room.rName);
                    const normalizedRoomName = this.normalizeNoSpaceText(
                        room.rName,
                    );

                    if (room.rName == "F 5.001") {
                        // debugger;
                    }

                    for (const check of normalizedChecks) {
                        let similarityNormalized = 0;
                        let simmilarityUnNormalized = 0;

                        if (check.type === "room") {
                            if (!check.normalizedRoom || !check.room) continue;
                            similarityNormalized = this.similar(
                                normalizedRoomName,
                                check.normalizedRoom,
                            );
                            simmilarityUnNormalized = this.similar(
                                room.rName,
                                check.room,
                            );
                        } else if (check.type === "building") {
                            if (!check.normalizedBuilding) continue;
                            similarityNormalized = this.similarStart(
                                normalizedBuildingName,
                                check.normalizedBuilding,
                            );
                        } else if (check.type === "buildingAndRoom") {
                            if (
                                !check.normalizedRoom ||
                                !check.normalizedBuilding
                            )
                                continue;
                            similarityNormalized = this.similar(
                                normalizedRoomName,
                                check.normalizedRoom,
                            );
                            similarityNormalized += this.similarStart(
                                normalizedBuildingName,
                                check.normalizedBuilding,
                            );
                        }

                        let similarity = Math.max(
                            // simmilarityUnNormalized,
                            similarityNormalized,
                        );

                        if (check.subtr) {
                            similarity /= 3;
                        }

                        if (similarity > 0.7) {
                            // debugger
                            filteredRooms.push(
                                this.makeResponse(
                                    room,
                                    buildingData,
                                    part,
                                    buildingId,
                                    similarity,
                                ),
                            );
                        }
                    }
                }
            }
        }

        console.log("filteredRooms:", filteredRooms.length);

        // Sort by simmilarity and then by name length and then by bestuhlung (a.bestuhlung - b.bestuhlung)
        filteredRooms.sort((a, b) => {
            if (b.similarity !== a.similarity) {
                return b.similarity - a.similarity;
            }
            // return a.name.length - b.name.length;
            if (b.originalRoom.bestuhlung && a.originalRoom.bestuhlung) {
                return b.originalRoom.bestuhlung - a.originalRoom.bestuhlung;
            } else if (b.originalRoom.bestuhlung) {
                return 1;
            } else if (a.originalRoom.bestuhlung) {
                return -1;
            }
            return a.name.length - b.name.length;
        });

        // run checkMarkerProposals, and add it infront of the current filteredRooms
        const markerProposals = this.checkMarkerProposals(value);
        if (markerProposals.length > 0) {
            console.log("markerProposals:", markerProposals);
            filteredRooms.unshift(...markerProposals);
        }

        // add searchId to each result, which is the hash of the name and buildingName (if exists) and type (if exists)
        let existing = new Set();
        for (let i = 0; i < filteredRooms.length; i++) {
            const result = filteredRooms[i];
            let idString = result.name;

            if (result instanceof SearchRoomResponse) {
                idString +=
                    "srr_" +
                    result.buildingName +
                    result.buildingId +
                    result.roomId +
                    result.level;
            } else if (result instanceof MarkerProposal) {
                idString += "mp_" + result.type.id;
            }
            // if the idString already exists, remove this result, otherwise add the idString to existing. Because they are sorted, only the best room simmilarity will be shown
            if (existing.has(idString)) {
                filteredRooms.splice(i, 1);
                i--;
                continue;
            }
            existing.add(idString);
            result.searchId = idString;
        }

        console.log("final filteredRooms:", filteredRooms);
        return filteredRooms;
    }
})();

export { SearchRoomResponse, SearchResponse, MarkerProposal };

/**
 * @param searchString  {String}
 * @returns {SearchResponse[]}
 */
export function search(searchString) {
    return searchHandler.search(searchString);
}
