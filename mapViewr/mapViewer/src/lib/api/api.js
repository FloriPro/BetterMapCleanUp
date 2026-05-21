import apiUrls from "../constants"
import { MarkerProposal, SearchRoomResponse } from "../searchEngine";

class OneBuildingRoom {
    /**
     * 
     * @param {string} roomid 
     * @param {string} kurztext 
     * @param {string} langtext 
     * @param {string} raumart 
     * @param {{ [key: string]: unknown }} ausstattung
     * @param {string} gebaeude 
     * @param {string} geschossplan 
     * @param {string} raumfinderid 
     * @param {string} gebaeudeId 
     */
    constructor(roomid, kurztext, langtext, raumart, ausstattung, gebaeude, geschossplan, raumfinderid, gebaeudeId) {
        this.roomid = roomid;
        this.kurztext = kurztext;
        this.langtext = langtext;
        this.raumart = raumart;
        this.ausstattung = ausstattung || {};
        this.gebaeude = gebaeude;
        this.geschossplan = geschossplan || '';
        this.raumfinderid = raumfinderid;
        this.gebaeudeId = gebaeudeId || '';
    }

    /**
     * @param {{ roomid: { toString: () => string; }; kurztext: string; langtext: string; raumart: string; ausstattung: Record<string, unknown>; gebaeude: string; geschossplan: string; raumfinderid: string; gebaeudeId: string; }} json
     */
    static fromJson(json) {
        return new OneBuildingRoom(
            json.roomid?.toString(),
            json.kurztext,
            json.langtext,
            json.raumart,
            json.ausstattung || {},
            json.gebaeude,
            json.geschossplan || '',
            json.raumfinderid,
            json.gebaeudeId || ''
        );
    }

    toJson() {
        return {
            roomid: this.roomid,
            kurztext: this.kurztext,
            langtext: this.langtext,
            raumart: this.raumart,
            ausstattung: this.ausstattung,
            gebaeude: this.gebaeude,
            geschossplan: this.geschossplan,
            raumfinderid: this.raumfinderid,
            gebaeudeId: this.gebaeudeId
        };
    }

    /**
     * @param {SearchRoomResponse} search
     */
    toView(search) {
        return {
            "Short Description": this.kurztext,
            "Description": this.langtext,
            "Room Type": this.raumart,
            "Level": search.level,
            "Equipment": Object.entries(this.ausstattung).map(([key, value]) => `${key}: ${value}`).join(', '),
            "Building Code": this.gebaeude,
        }
    }
}

let api = new (class api {
    /**
     * @param {string} buildingId 
     * @returns {Promise<import("./datatype").RoutingData | null>}
     */
    async getRoutingData(buildingId) {
        try {
            const response = await fetch(apiUrls.getRoutingData(buildingId));
            if (!response.ok) {
                throw new Error(`Routing data not found for building ${buildingId}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch routing data:', error);
            return null;
        }
    }
    /**
     * @param {string} roomName
     * @param {string} buildingName
     * @param {string | null | undefined} level
     * @returns {Promise<SearchRoomResponse | null>}
     */
    async findRoom(roomName, buildingName, level) {
        let data = await this.getData();
        for (const buildingKey of Object.keys(data.part)) {
            const building = data.part[buildingKey];
            if (building.building.displayName.toLowerCase() === buildingName.toLowerCase()) {
                for (const partKey of Object.keys(building.parts)) {
                    const part = building.parts[partKey];
                    if (level == undefined || part.level === level) {
                        for (const roomKey of Object.keys(part.rooms)) {
                            const room = part.rooms[roomKey];
                            if (room.rName === roomName) {
                                return new SearchRoomResponse(
                                    room.rName,
                                    building.building.displayName,
                                    room.latlng,
                                    part.level,
                                    room,
                                    buildingKey,
                                    room.roomid,
                                    1
                                );
                            }
                        }
                    }
                }
            }
        }
        return null;
    }
    /**
     * @param {MarkerProposal} selectedMarker
     * @return {Promise<string[] | null>}
     */
    async getMarker(selectedMarker) {
        let url = apiUrls.getMarker(selectedMarker.type.id);
        try {
            const response = await fetch(url);
            if (response.status < 400) {
                const data = await response.json();
                return data;
            } else {
                console.error(`API error: ${response.status}`);
                return null;
            }
        } catch (error) {
            console.error('Error fetching marker details:', error);
            return null;
        }
    }
    /**
     * @type {Promise<any> | undefined}
     */
    datapromise;
    /**
     * @type {import("./datatype").BuildingsData | undefined}
     */
    _data;

    dataLoaded() {
        return !!this._data
    }

    /**
     * @param {Function} callback 
     */
    onDataLoaded(callback) {
        if (this._data) {
            callback(this._data)
        } else {
            this._loadData().then(() => {
                if (this._data) {
                    callback(this._data)
                }
            })
        }
    }

    /**
     * @return {import("./datatype").BuildingsData}
     */
    getSyncData() {
        if (!this._data) {
            throw new Error("Data not loaded")
        }
        return this._data
    }

    /**
     * @return {Promise<import("./datatype").BuildingsData>}
     */
    async getData() {
        await this._loadData()
        if (!this._data) {
            throw new Error("Data not loaded")
        }
        return this._data
    }

    _loadData() {
        if (this.datapromise) {
            return this.datapromise
        }
        this.datapromise = new Promise((resolve, reject) => {
            fetch(apiUrls.getAppData()).then(res => res.json()).then(data => {
                this._data = data
                resolve(data)
            });
        });
        return this.datapromise
    }

    /**
     * 
     * @param {string} id 
     * @returns {SearchRoomResponse | null}
     */
    syncGetSearchRoom(id) {
        if (!id) {
            return null;
        }
        if (!this._data) {
            return null;
        }
        for (const buildingKey of Object.keys(this._data.part)) {
            const building = this._data.part[buildingKey];
            for (const partKey of Object.keys(building.parts)) {
                const part = building.parts[partKey];
                for (const roomKey of Object.keys(part.rooms)) {
                    const room = part.rooms[roomKey];
                    if (room.roomid === id) {
                        return new SearchRoomResponse(
                            room.rName,
                            building.building.displayName,
                            room.latlng,
                            part.level,
                            room,
                            buildingKey,
                            room.roomid,
                            1
                        )
                    }
                }
            }
        }
        return null;
    }


    /**
     * 
     * @param {string} id 
     * @returns {Promise<SearchRoomResponse | null>}
     */
    async getSearchRoom(id) {
        await this.getData();
        return this.syncGetSearchRoom(id);
    }

    /**
     * 
     * @param {string} id 
     * @returns {Promise<OneBuildingRoom | null>}
     */
    async getRoom(id) {
        // await new Promise(resolve => setTimeout(resolve, 10000)); // Artificial delay to simulate network latency
        if (!id) {
            return null;
        }
        if (this.buildingCache[id]) {
            return this.buildingCache[id];
        }
        try {
            const buildingId = id.substring(0, 3);
            const url = apiUrls.getRoom(buildingId);

            console.log(`Fetching room details for ${id} from ${url}`);

            const response = await fetch(url);

            if (response.status < 400) {
                const data = await response.json();
                const roomData = data[id];

                if (roomData) {
                    const room = OneBuildingRoom.fromJson(roomData);
                    this.buildingCache[id] = room;
                    this.cullBuildingCache();
                    return room;
                } else {
                    console.warn(`Room ${id} not found in building data`);
                    return null;
                }
            } else if (response.status === 404) {
                console.warn(`Building ${buildingId} not found`);
                return null;
            } else {
                console.error(`API error: ${response.status}`);
                return null;
            }
        } catch (error) {
            console.error('Error fetching room details:', error);
            return null;
        }
    }
    cullBuildingCache() {
        const maxCacheSize = 10; // Maximum number of rooms to keep in cache
        const keys = Object.keys(this.buildingCache);
        if (keys.length > maxCacheSize) {
            // Remove the oldest entries from the cache
            for (let i = 0; i < keys.length - maxCacheSize; i++) {
                delete this.buildingCache[keys[i]];
            }
        }
    }

    constructor() {
        /**
         * @type {{ [roomId: string]: OneBuildingRoom }}
         */
        this.buildingCache = {};
    }
})()

export default api