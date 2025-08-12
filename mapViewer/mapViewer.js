let style = {
    "version": 8,
    "sources": {
        "osm": {
            "type": "raster",
            "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            "tileSize": 256,
            "attribution": "© OpenStreetMap contributors"
        }
    },
    "layers": [{
        "id": "osm",
        "type": "raster",
        "source": "osm",
        "paint": {
            "raster-brightness-min": 1,
            "raster-brightness-max": 0,
            // rotate color
            "raster-hue-rotate": 180
        }
    }]
}

let apiUrls = {
    getRoom: (buildingId) => `/data/roomInfo/${buildingId}.json`,
    getAppData: () => "/data/app_data.json",
    getRoutingData: (buildingId) => `/routing/routingUpload/${buildingId}.json`,
    getTileMap: (level) => `/mapTiling/tiles/${level}/{z}/{x}/{y}.png`
}

if (location.hostname == "raumplan.flulu.de") {
    apiUrls = {
        getRoom: (buildingId) => `https://raumplan.flulu.de/roomInfo/${buildingId}.json`,
        getAppData: () => "https://raumplan.flulu.de/app_data.json",
        getRoutingData: (buildingId) => `https://raumplan.flulu.de/routing/${buildingId}.json`,
        getTileMap: (level) => `https://raumplan.flulu.de/tilesLQ/${level}/{z}/{x}/{y}.png`
    }
}

style = "https://api.maptiler.com/maps/streets-v2-dark/style.json?key=WKfpITqH1nhqMcaWvHXD"

const map = new maplibregl.Map({
    container: "map",
    style: style,
    center: [11.582, 48.1351],
    zoom: 13,
    maxZoom: 25
});

map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

const LEVEL_ORDER = ["UG 03", "UG 02", "UG 01", "EG", "EG Z", "OG 01", "OG 01 Z", "OG 02", "OG 02 Z", "OG 03", "OG 03 Z", "OG 04", "OG 04 Z", "OG 05", "OG 05 Z", "OG 06", "OG 06 Z", "OG 07", "OG 07 Z",].reverse();

const LEVEL_SHORT = {
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
    "EG": "EG",
    "UG 01": "UG 1",
    "UG 02": "UG 2",
    "UG 03": "UG 3"
};

let currentLevel = "EG";
let showAllLevels = false;
let currentSelectedRoom = null;

class OneBuildingRoom {
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
}

class RoomApiClient {
    constructor() {
        // this.baseurl = "https://raumplan.flulu.de"
        this.baseurl = "/data"
    }

    async getRoom(id) {
        try {
            const buildingId = id.substring(0, 3);
            const url = apiUrls.getRoom(buildingId);

            console.log(`Fetching room details for ${id} from ${url}`);

            const response = await fetch(url);

            if (response.status < 400) {
                const data = await response.json();
                const roomData = data[id];

                if (roomData) {
                    return OneBuildingRoom.fromJson(roomData);
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
}

class SearchRoomResponse {
    constructor(name, buildingName, latLng, level, originalRoom, buildingId, roomId) {
        this.name = name;
        this.buildingName = buildingName;
        this.latLng = latLng;
        this.level = level;
        this.originalRoom = originalRoom;
        this.buildingId = buildingId;
        this.roomId = roomId;
    }
}

class SearchOverlay {
    constructor(main) {
        this.main = main;
        this.isSearchVisible = false;
        this.searchResults = [];
        this.overlayElement = document.getElementById('search-overlay');
        this.containerElement = null;
        this.inputElement = null;
        this.resultsElement = null;
        this.clickOutsideListener = null;

        console.log('SearchOverlay constructor - overlayElement:', this.overlayElement);

        if (!this.overlayElement) {
            console.error('Search overlay element not found!');
            return;
        }

        this.ignoreText = [" ", "-", "/", "(", ")", ".", ",", "'", '"', "ä", "ö", "ü", "ß"];

        this.init();
    }

    normalizeText(text) {
        let normalized = text.toLowerCase();
        for (let char of this.ignoreText) {
            normalized = normalized.replaceAll(char, "");
        }
        return normalized;
    }

    init() {
        this.renderSearchContainer();
    }

    renderSearchContainer() {
        console.log('Rendering search container, isSearchVisible:', this.isSearchVisible);

        // Clear existing content
        this.overlayElement.innerHTML = '';

        // Remove old click listener if it exists
        if (this.clickOutsideListener) {
            document.removeEventListener('click', this.clickOutsideListener);
        }

        // Create main container
        this.containerElement = document.createElement('div');
        this.containerElement.className = `search-container ${this.isSearchVisible ? 'expanded' : 'collapsed'}`;

        // Create input wrapper
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'search-input-wrapper';

        // Create search icon
        const searchIcon = document.createElement('span');
        searchIcon.className = 'search-icon';
        searchIcon.innerHTML = '🔍︎';
        searchIcon.style.cursor = 'pointer';
        const focusInput = () => {
            if (this.inputElement) {
                this.inputElement.focus();
            }
            setTimeout(() => {
                if (this.inputElement) {
                    this.inputElement.focus();
                }
            }, 100);
        };
        searchIcon.addEventListener('click', (e) => {
            console.log('Search icon clicked!');
            e.stopPropagation();
            this.setSearchVisible(true);
            focusInput();
        });
        // iOS Safari workaround: also focus on touchend
        searchIcon.addEventListener('touchend', (e) => {
            e.stopPropagation();
            this.setSearchVisible(true);
            focusInput();
        });

        inputWrapper.appendChild(searchIcon);

        if (this.isSearchVisible) {
            // Create input field
            this.inputElement = document.createElement('input');
            this.inputElement.type = 'text';
            this.inputElement.className = 'search-input';
            this.inputElement.placeholder = 'Search room...';

            this.inputElement.addEventListener('input', (e) => {
                this.searchRoom(e.target.value);
            });

            this.inputElement.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            inputWrapper.appendChild(this.inputElement);
        }

        this.containerElement.appendChild(inputWrapper);
        this.overlayElement.appendChild(this.containerElement);

        // Add click outside listener with proper scope
        this.clickOutsideListener = (e) => {
            if (!this.overlayElement.contains(e.target)) {
                this.setSearchVisible(false);
            }
        };
        document.addEventListener('click', this.clickOutsideListener);

        // Create results container
        this.resultsElement = document.createElement('div');
        this.resultsElement.className = 'search-results';
        this.overlayElement.appendChild(this.resultsElement);
    }

    setSearchVisible(visible) {
        console.log('Setting search visible to:', visible);
        if (this.isSearchVisible === visible) {
            // Already in the correct state, no need to re-render
            return;
        }
        this.isSearchVisible = visible;
        this.renderSearchContainer();
        if (!visible) {
            this.clearResults();
        }
    }

    clearResults() {
        this.searchResults = [];
        this.resultsElement.classList.remove('visible');
        this.resultsElement.innerHTML = '';
    }

    searchRoom(value) {
        if (!this.main.buildingData) {
            console.log('Building data not loaded yet');
            return;
        }

        const normalizedValue = this.normalizeText(value);
        console.log("searchRoom:", normalizedValue);

        if (normalizedValue.length === 0) {
            this.clearResults();
            return;
        }

        const filteredRooms = [];

        for (const [buildingId, building] of Object.entries(this.main.buildingData.part)) {
            const buildingData = building.building;

            for (const part of Object.values(building.parts || {})) {
                for (const room of Object.values(part.rooms || {})) {
                    const normalizedRoomName = this.normalizeText(room.rName);
                    if (normalizedRoomName.includes(normalizedValue)) {
                        filteredRooms.push(new SearchRoomResponse(
                            room.rName,
                            buildingData.displayName,
                            room.latlng,
                            part.level,
                            room,
                            buildingId,
                            room.roomid
                        ));
                    }
                }
            }
        }

        console.log("filteredRooms:", filteredRooms.length);

        // Sort by name length
        filteredRooms.sort((a, b) => a.name.length - b.name.length);

        // Limit to 50 results
        if (filteredRooms.length > 50) {
            console.log("Too many rooms found, limiting to 50");
            this.searchResults = filteredRooms.slice(0, 50);
        } else {
            this.searchResults = filteredRooms;
        }

        this.renderResults();
    }

    renderResults() {
        if (this.searchResults.length === 0) {
            this.resultsElement.classList.remove('visible');
            return;
        }

        this.resultsElement.classList.add('visible');
        this.resultsElement.innerHTML = '';

        const gridContainer = document.createElement('div');
        gridContainer.className = 'search-results-grid';

        this.searchResults.forEach(room => {
            const resultItem = document.createElement('button');
            resultItem.className = 'search-result-item';

            const roomName = document.createElement('div');
            roomName.className = 'search-result-name';
            roomName.textContent = room.name;

            const buildingName = document.createElement('div');
            buildingName.className = 'search-result-building';
            buildingName.textContent = room.buildingName;

            resultItem.appendChild(roomName);
            resultItem.appendChild(buildingName);

            resultItem.addEventListener('click', () => {
                console.log('Room selected:', room);
                this.main.selectRoom(room);
                this.setSearchVisible(false);
            });

            gridContainer.appendChild(resultItem);
        });

        this.resultsElement.appendChild(gridContainer);
    }
}

class RoomInfoOverlay {
    showRouteControl(routeInformation, moreInfo = true) {
        // Remove previous route control if any
        const prev = this.overlayElement.querySelector('.route-control-container');
        if (prev) prev.remove();

        if (!routeInformation) return;

        // Use RouteControlOverlay.render to get the container
        if (this.main.routeControlOverlay) {
            this.main.routeControlOverlay.routeInformation = routeInformation;
            const routeContainer = this.main.routeControlOverlay.render(moreInfo);
            if (routeContainer) {
                this.overlayElement.prepend(routeContainer);
            }
        }
    }
    constructor(main) {
        this.main = main;
        this.currentRoom = null;
        this.detailedRoom = null;
        this.isExpanded = false;
        this.isLoading = false;
        this.overlayElement = document.getElementById('room-info-overlay');
        this.selectedRoomMarker = null;
        this.roomApiClient = new RoomApiClient();
    }

    async showRoom(room) {
        // check if room is RoomResponse Object
        if (!(room instanceof SearchRoomResponse)) {
            console.error('Invalid room object:', room);
            return;
        }

        this.currentRoom = room;
        this.detailedRoom = null;
        this.isLoading = false;
        this.render();
        this.overlayElement.classList.add('visible');

        // Add room marker to map
        this.addRoomMarker(room);

        // Update level selector to show selected room
        currentSelectedRoom = room;
        this.main.levelSelectOverlay.renderOverlay();

        // Load detailed room information
        await this.loadDetailedRoomInfo();
    }

    async loadDetailedRoomInfo() {
        if (!this.currentRoom || !this.currentRoom.roomId) {
            console.log('No room ID available for detailed info');
            return;
        }

        this.isLoading = true;
        this.render(); // Show loading state

        try {
            this.detailedRoom = await this.roomApiClient.getRoom(this.currentRoom.roomId);
            console.log('Loaded detailed room info:', this.detailedRoom);
        } catch (error) {
            console.error('Failed to load detailed room info:', error);
            this.detailedRoom = null;
        }

        this.isLoading = false;
        this.render(); // Update with loaded data or show error state
    }

    hideRoom() {
        this.currentRoom = null;
        const wasVisible = this.overlayElement.classList.contains('visible');
        this.overlayElement.classList.remove('visible');

        // Only animate if it was visible
        if (wasVisible) {
            let cleared = false;
            const onTransitionEnd = () => {
                if (!cleared) {
                    this.overlayElement.innerHTML = '';
                    cleared = true;
                }
                this.overlayElement.removeEventListener('transitionend', onTransitionEnd);
            };
            this.overlayElement.addEventListener('transitionend', onTransitionEnd);
            // Fallback: clear after 350ms if transitionend doesn't fire
            setTimeout(() => {
                if (!cleared) {
                    this.overlayElement.innerHTML = '';
                    cleared = true;
                }
            }, 350);
        } else {
            this.overlayElement.innerHTML = '';
        }

        // Remove room marker
        if (this.selectedRoomMarker) {
            this.selectedRoomMarker.remove();
            this.selectedRoomMarker = null;
        }

        //if has route, remove it
        if (this.main.routeInformation) {
            this.main.hideRoute();
        }

        // Update level selector
        currentSelectedRoom = null;
        this.main.levelSelectOverlay.renderOverlay();

        // Update main's selected room state and URL (without calling hideRoom again)
        this.main.selectedRoom = null;
        this.main.saveStateToUrl();
    }

    routeToRoom() {
        if (!this.currentRoom) return;

        this.main.routeToRoom(this.currentRoom);
    }

    addRoomMarker(room) {
        // Remove existing marker
        if (this.selectedRoomMarker) {
            this.selectedRoomMarker.remove();
        }

        // Create marker container
        const markerEl = document.createElement('div');
        markerEl.className = 'room-marker-container';

        // Create the marker pin
        const markerPin = document.createElement('div');
        markerPin.className = 'room-marker-pin';

        // Create the marker head (circle)
        const markerHead = document.createElement('div');
        markerHead.className = 'room-marker-head';

        // Create room name label
        const roomLabel = document.createElement('div');
        roomLabel.className = 'room-marker-label';
        roomLabel.textContent = room.name;

        // Create inner icon
        const markerIcon = document.createElement('div');
        markerIcon.className = 'room-marker-icon';
        markerIcon.innerText = room.name;

        // Assemble the marker
        markerHead.appendChild(markerIcon);
        markerPin.appendChild(markerHead);
        markerEl.appendChild(markerPin);
        markerEl.appendChild(roomLabel);

        // Create and add marker with animation
        this.selectedRoomMarker = new maplibregl.Marker({
            element: markerEl,
            anchor: 'bottom'
        })
            .setLngLat([room.latLng.lng, room.latLng.lat])
            .addTo(this.main.map);

        // Add entrance animation
        setTimeout(() => {
            markerEl.classList.add('room-marker-visible');
        }, 50);
    }

    toggleExpanded() {
        if (this.isExpanded) {
            // Animate collapse
            const detailsEl = this.overlayElement.querySelector('.room-info-details');
            const header = this.overlayElement.querySelector('.room-info-header');
            if (header) {
                setTimeout(() => {
                    header.classList.remove('has-bottom-border');
                }, 200);
            }
            if (detailsEl) {
                detailsEl.classList.remove('expanded');
                // Wait for transition to finish before hiding
                detailsEl.addEventListener('transitionend', () => {
                    this.isExpanded = false;
                    this.render();
                }, { once: true });
                return;
            }
        }
        this.isExpanded = !this.isExpanded;
        this.render();
    }

    render() {
        if (!this.currentRoom) return;

        // Track previous expanded state
        const wasExpanded = this.overlayElement.querySelector('.room-info-details')?.classList.contains('expanded');

        const container = document.createElement('div');
        container.className = 'room-info-container';

        // Header
        const header = document.createElement('div');
        header.className = 'room-info-header';

        const titleSection = document.createElement('div');

        const title = document.createElement('div');
        title.className = 'room-info-title';
        title.textContent = this.currentRoom.name;

        const building = document.createElement('div');
        building.className = 'room-info-building';
        building.textContent = this.currentRoom.buildingName;

        titleSection.appendChild(title);
        titleSection.appendChild(building);

        // Controls
        const controls = document.createElement('div');
        controls.className = 'room-info-controls';

        // Route button
        const routeButton = document.createElement('button');
        routeButton.className = 'room-info-btn route-btn';
        routeButton.innerHTML = '🗺️ Route';
        if (this.main.showRoute && this.main.routeInformation) {
            routeButton.style.backgroundColor = '#1db954'; // green
            routeButton.style.color = '#fff';
            routeButton.title = 'Remove route';
            routeButton.addEventListener('click', () => {
                this.main.hideRoute();
                this.render();
            });
        } else {
            routeButton.title = 'Start route to this room';
            routeButton.addEventListener('click', () => {
                this.routeToRoom();
            });
        }

        // Expand/collapse button
        const expandBtn = document.createElement('button');
        expandBtn.className = 'room-info-btn expand-btn';
        expandBtn.innerHTML = this.isExpanded ? '↓' : '↑';
        expandBtn.title = this.isExpanded ? 'Show Less' : 'Show More';
        expandBtn.addEventListener('click', () => this.toggleExpanded());

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'room-info-btn close-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Close';
        closeBtn.addEventListener('click', () => this.hideRoom());

        controls.appendChild(routeButton);
        controls.appendChild(expandBtn);
        controls.appendChild(closeBtn);

        header.appendChild(titleSection);
        header.appendChild(controls);
        container.appendChild(header);

        // Details (always render for animation)
        const details = document.createElement('div');
        details.className = 'room-info-details';
        if (this.isExpanded) {
            details.classList.add('expanded');
            header.classList.add('has-bottom-border');
        }

        if (this.isLoading) {
            // Show loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'room-loading';
            loadingDiv.innerHTML = '⏳ Loading room details...';
            details.appendChild(loadingDiv);
        } else if (this.detailedRoom) {
            // Show detailed room information
            this.renderDetailedRoomInfo(details);
        } else {
            // Show basic information only
            this.renderBasicRoomInfo(details);
        }
        container.appendChild(details);

        this.overlayElement.innerHTML = '';
        // If route is active, show route info panel at the top
        if (this.main.showRoute && this.main.routeInformation) {
            this.showRouteControl(this.main.routeInformation, !this.isExpanded);
        }
        this.overlayElement.appendChild(container);

        // Animate expand/collapse only if transitioning from collapsed to expanded
        const detailsEl = container.querySelector('.room-info-details');
        if (detailsEl) {
            if (this.isExpanded && !wasExpanded) {
                // Remove collapsed, force reflow, then add expanded for animation
                detailsEl.classList.remove('expanded');
                void detailsEl.offsetWidth;
                detailsEl.classList.add('expanded');
            } else if (!this.isExpanded) {
                detailsEl.classList.remove('expanded');
            }
        }
    }

    renderBasicRoomInfo(container) {
        const table = document.createElement('table');
        table.className = 'room-info-table';

        // Level row
        const levelRow = document.createElement('tr');
        levelRow.innerHTML = `<td>Level</td><td>${this.currentRoom.level}</td>`;
        table.appendChild(levelRow);

        // Room ID row
        if (this.currentRoom.roomId) {
            const roomIdRow = document.createElement('tr');
            roomIdRow.innerHTML = `<td>Room ID</td><td>${this.currentRoom.roomId}</td>`;
            table.appendChild(roomIdRow);
        }

        container.appendChild(table);

        // Note about detailed info
        const noteDiv = document.createElement('div');
        noteDiv.className = 'info-note';
        noteDiv.textContent = 'Detailed room information not available.';
        noteDiv.style.fontStyle = 'italic';
        noteDiv.style.color = 'rgba(255, 255, 255, 0.6)';
        noteDiv.style.marginTop = '8px';
        container.appendChild(noteDiv);
    }

    renderDetailedRoomInfo(container) {
        const table = document.createElement('table');
        table.className = 'room-info-table';

        // Short Description
        if (this.detailedRoom.kurztext) {
            const row = document.createElement('tr');
            row.innerHTML = `<td>Short Description</td><td>${this.detailedRoom.kurztext}</td>`;
            table.appendChild(row);
        }

        // Description
        if (this.detailedRoom.langtext) {
            const row = document.createElement('tr');
            row.innerHTML = `<td>Description</td><td>${this.detailedRoom.langtext}</td>`;
            table.appendChild(row);
        }

        // Room Type
        if (this.detailedRoom.raumart) {
            const row = document.createElement('tr');
            row.innerHTML = `<td>Room Type</td><td>${this.detailedRoom.raumart}</td>`;
            table.appendChild(row);
        }

        // Level
        const levelRow = document.createElement('tr');
        levelRow.innerHTML = `<td>Level</td><td>${this.currentRoom.level}</td>`;
        table.appendChild(levelRow);

        // Equipment (ausstattung) in one row
        if (this.detailedRoom.ausstattung && Object.keys(this.detailedRoom.ausstattung).length > 0) {
            const equipmentRow = document.createElement('tr');
            let equipmentList = Object.entries(this.detailedRoom.ausstattung)
                .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                .join('<br>');
            equipmentRow.innerHTML = `<td>Equipment</td><td>${equipmentList}</td>`;
            table.appendChild(equipmentRow);
        }

        // Building Code
        if (this.detailedRoom.gebaeude) {
            const row = document.createElement('tr');
            row.innerHTML = `<td>Building Code</td><td>${this.detailedRoom.gebaeude}</td>`;
            table.appendChild(row);
        }

        container.appendChild(table);

        // LSF Button
        const lsfButton = document.createElement('button');
        lsfButton.className = 'lsf-button';
        lsfButton.textContent = 'Open in LSF';
        lsfButton.style.backgroundColor = '#007acc';
        lsfButton.style.color = 'white';
        lsfButton.style.border = 'none';
        lsfButton.style.padding = '8px 16px';
        lsfButton.style.borderRadius = '4px';
        lsfButton.style.cursor = 'pointer';

        const lsfUrl = `https://lsf.verwaltung.uni-muenchen.de/qisserver/rds?state=verpublish&status=init&vmfile=no&moduleCall=webInfo&publishConfFile=webInfoRaum&publishSubDir=raum&keep=y&raum.rgid=${this.detailedRoom.roomid}`;

        lsfButton.addEventListener('click', () => {
            window.open(lsfUrl, '_blank');
        });

        container.appendChild(document.createElement('hr')); // Add a separator

        container.appendChild(lsfButton);
    }

    createInfoRow(label, value) {
        const row = document.createElement('div');
        row.className = 'info-row';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'info-label';
        labelSpan.textContent = label;

        const valueSpan = document.createElement('span');
        valueSpan.className = 'info-value';
        valueSpan.textContent = value || 'Not available';

        row.appendChild(labelSpan);
        row.appendChild(valueSpan);

        return row;
    }
}

class LevelSelectOverlay {
    constructor(main) {
        this.main = main;
        this.availableLevels = [];
        this.isLoading = true;
        this.overlayElement = document.getElementById('level-select-overlay');
        this.containerElement = null;
    }

    showLoadingState() {
        this.isLoading = true;
        this.renderOverlay();
    }

    updateAvailableLevels(levels) {
        this.availableLevels = levels.sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
        this.isLoading = false;
        this.renderOverlay();
    }

    createLoadingButton(index) {
        const button = document.createElement('div');
        button.className = 'loading-level-button';

        const shimmer = document.createElement('div');
        shimmer.className = 'loading-shimmer';
        shimmer.style.animationDelay = `${(index * 1 / 3) % 1}s`;

        button.appendChild(shimmer);
        return button;
    }

    createLevelButton(level) {
        const button = document.createElement('button');
        button.className = 'level-select-button';
        button.textContent = LEVEL_SHORT[level] || `Error - ${level}`;

        // Check if this level is currently selected
        if (this.main.currentLevel === level) {
            button.classList.add('selected');
        }

        // Check if there's a selected room on this level
        if (currentSelectedRoom && currentSelectedRoom.level === level) {
            button.classList.add('has-selected-room');
        }

        button.addEventListener('click', () => {
            this.main.updateLevel(level);
            this.renderOverlay(); // Re-render to update selected state
        });

        return button;
    }

    renderOverlay() {
        // Clear existing content
        this.overlayElement.innerHTML = '';

        // Create container
        this.containerElement = document.createElement('div');
        this.containerElement.className = 'level-select-container';

        if (this.isLoading) {
            // Show loading buttons
            for (let i = 0; i < 11; i++) {
                this.containerElement.appendChild(this.createLoadingButton(i));
            }
        } else {
            // Show actual level buttons
            this.availableLevels.forEach(level => {
                this.containerElement.appendChild(this.createLevelButton(level));
            });
        }

        this.overlayElement.appendChild(this.containerElement);
    }
}

class RouteControlOverlay {
    constructor(main) {
        this.main = main;
        this.overlayElement = document.getElementById('route-control-overlay');
        this.currentStatus = undefined;
    }

    render(showInfo) {
        if (!this.routeInformation) return undefined;
        this.showInfo = showInfo;

        if (this.collapsed === undefined) this.collapsed = false;
        if (this.container) {
            this.container.innerHTML = ''; // Clear previous content
        } else {
            this.container = document.createElement('div');
        }
        this.container.className = 'route-control-container';

        // Header
        const header = document.createElement('div');
        header.className = 'route-control-header';

        const title = document.createElement('div');
        title.className = 'route-control-title';
        title.textContent = `Route ${this.routeInformation.room.name}`;

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'route-control-buttons';

        if (showInfo) {
            const collapseBtn = document.createElement('button');
            collapseBtn.className = 'route-control-collapse room-info-btn';
            collapseBtn.innerHTML = this.collapsed ? '↑' : '↓';
            collapseBtn.title = this.collapsed ? 'Expand route info' : 'Collapse route info';
            collapseBtn.addEventListener('click', () => {
                this.collapsed = !this.collapsed;
                this.render(this.showInfo);
            });
            buttonContainer.appendChild(collapseBtn);
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'route-control-close room-info-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.addEventListener('click', () => {
            this.main.hideRoute();
        });
        buttonContainer.appendChild(closeBtn);


        header.appendChild(title);
        header.appendChild(buttonContainer);

        this.container.appendChild(header);

        // Route info (collapsible)
        if (showInfo && !this.collapsed) {
            const routeInfo = document.createElement('div');
            routeInfo.className = 'route-info';

            const destinationItem = document.createElement('div');
            destinationItem.className = 'route-info-item';
            destinationItem.innerHTML = `
            <span class="route-info-icon">📍</span>
            <span>To: <span class="route-level-indicator">${this.routeInformation.room.name}</span></span>
        `;

            const buildingItem = document.createElement('div');
            buildingItem.className = 'route-info-item';
            buildingItem.innerHTML = `
            <span class="route-info-icon">🏢</span>
            <span class="route-level-indicator">${this.routeInformation.room.buildingName}</span>
        `;

            const levelItem = document.createElement('div');
            levelItem.className = 'route-info-item';
            levelItem.innerHTML = `
            <span class="route-info-icon">🏠</span>
            <span>Level:</span>
            <span class="route-level-indicator">${this.routeInformation.room.level}</span>
        `;

            routeInfo.appendChild(destinationItem);
            routeInfo.appendChild(buildingItem);
            routeInfo.appendChild(levelItem);

            // Action buttons
            const actionBtns = document.createElement('div');
            actionBtns.className = 'route-action-buttons';

            const gotoRoomBtn = document.createElement('button');
            gotoRoomBtn.className = 'route-button';
            gotoRoomBtn.textContent = '🎯 Go to Room';
            gotoRoomBtn.addEventListener('click', () => {
                this.main.selectRoom(this.routeInformation.room);
            });

            const showRouteBtn = document.createElement('button');
            showRouteBtn.className = 'route-button';
            showRouteBtn.textContent = '🗺️ Show Route';
            showRouteBtn.addEventListener('click', () => {
                this.main.fitRouteBounds();
                // buttonContainer.appendChild(settingsBtn);
            });

            // Settings button
            const settingsBtn = document.createElement('button');
            settingsBtn.className = 'route-button';
            settingsBtn.innerHTML = '⚙️ Settings';
            settingsBtn.title = 'Route & display settings';
            settingsBtn.addEventListener('click', () => {
                this.main.settingsOverlay.show();
            });

            const setStartPointBtn = document.createElement('button');
            setStartPointBtn.className = 'route-button';
            setStartPointBtn.textContent = '📍 Set Start Point';
            setStartPointBtn.addEventListener('click', () => {
                this.main.setRouteStartPoint();
            });

            actionBtns.appendChild(gotoRoomBtn);
            actionBtns.appendChild(showRouteBtn);
            actionBtns.appendChild(setStartPointBtn);
            actionBtns.appendChild(settingsBtn);

            this.container.appendChild(routeInfo);
            this.container.appendChild(actionBtns);


            // Get the natural heights first
            this.actionBtnsHeight = actionBtns.scrollHeight;
            this.routeInfoHeight = routeInfo.scrollHeight;

            setTimeout(() => {
                this.actionBtnsHeight = actionBtns.scrollHeight;
                this.routeInfoHeight = routeInfo.scrollHeight;
            }, 10);
            console.log("this.currentstatus", this.currentStatus)

            if (this.currentStatus == "hidden" || this.currentStatus == undefined) {

                // Set initial collapsed state
                actionBtns.style.height = '0px';
                actionBtns.style.margin = '0';
                actionBtns.style.padding = '0';
                actionBtns.style.overflow = 'hidden';
                routeInfo.style.height = '0px';
                routeInfo.style.margin = '0';
                routeInfo.style.padding = '0';
                routeInfo.style.overflow = 'hidden';

                // Add transition classes
                actionBtns.classList.add("animate-height");
                routeInfo.classList.add("animate-height");

                // Animate to full height
                setTimeout(() => {
                    this.actionBtnsHeight = actionBtns.scrollHeight;
                    this.routeInfoHeight = routeInfo.scrollHeight;
                    actionBtns.style.height = this.actionBtnsHeight + 'px';
                    routeInfo.style.height = this.routeInfoHeight + 'px';
                    actionBtns.style.margin = '';
                    actionBtns.style.padding = '';
                    routeInfo.style.margin = '';
                    routeInfo.style.padding = '';

                    this.currentStatus = "visible";

                    // Clean up after animation
                    setTimeout(() => {
                        actionBtns.style.height = '';
                        routeInfo.style.height = '';
                        actionBtns.style.overflow = '';
                        routeInfo.style.overflow = '';
                        routeInfo.classList.remove("animate-height");
                        actionBtns.classList.remove("animate-height");
                    }, 300);
                }, 10);
            }
        } else {
            if (this.currentStatus == "visible") {
                this.currentStatus = "hidden";

                const placeholder = document.createElement('div');
                placeholder.className = 'route-info-placeholder';
                placeholder.style.transition = 'height 0.3s ease';
                placeholder.style.height = this.routeInfoHeight + this.actionBtnsHeight + 'px';

                setTimeout(() => {
                    placeholder.style.height = '0px';
                    placeholder.addEventListener('transitionend', () => {
                        this.container.removeChild(placeholder);
                    });
                }, 10);

                this.container.append(placeholder);
            }
        }

        return this.container;
    }
}

class Main {
    async init(map) {
        this.map = map;
        this.currentLevel = "EG";
        this.selectedRoom = null;
        this.routePoints = [];
        this.isLoadingRoute = false;
        this.showRoute = false;
        this.routeInformation = null;
        this.levelSelectOverlay = new LevelSelectOverlay(this);
        this.searchOverlay = new SearchOverlay(this);
        this.routeControlOverlay = new RouteControlOverlay(this);
        this.roomInfoOverlay = new RoomInfoOverlay(this);
        this.settingsOverlay = new SettingsOverlay(this);
        // When settings overlay closes, update routing if route is shown
        this.settingsOverlay.onClose = () => {
            if (this.showRoute && this.selectedRoom) {
                this.routeToRoom(this.selectedRoom);
            }
        };
        this.settingsService = new SettingsService(this);
        // Route controls are now part of RoomInfoOverlay

        // Show loading state initially
        this.levelSelectOverlay.showLoadingState();

        this.genLayers();
        await this.updateLayers();
        await this.loadData();

        // Load state from URL after data is loaded
        this.loadStateFromUrl();

        await this.updateAvailableLayers();

        this.map.on('moveend', async () => {
            await this.updateAvailableLayers();
            this.saveStateToUrl();
        });

        this.map.on('zoomend', () => {
            this.saveStateToUrl();
        });

        // Listen for browser back/forward navigation
        window.addEventListener('hashchange', () => {
            this.loadStateFromUrl();
        });
    }

    setRouteStartPoint() {

        // Hide all UI overlays
        const overlays = [
            document.getElementById('level-select-overlay'),
            document.getElementById('search-overlay'),
            document.getElementById('route-control-overlay'),
            document.getElementById('room-info-overlay'),
            document.getElementById('settings-overlay')
        ];
        overlays.forEach(el => {
            if (el) el.style.display = 'none';
        });

        // Show red border overlay over the map
        let borderOverlay = document.getElementById('route-start-border-overlay');
        if (!borderOverlay) {
            borderOverlay = document.createElement('div');
            borderOverlay.id = 'route-start-border-overlay';
            const mapEl = document.getElementById('map');
            if (mapEl) mapEl.appendChild(borderOverlay);
        } else {
            borderOverlay.style.display = 'block';
        }

        // Listen for one click
        const onClick = (e) => {
            // Get clicked coordinates
            const lngLat = e.lngLat;
            // Save as custom start point
            this.customRouteStart = { lat: lngLat.lat, lng: lngLat.lng };
            // Remove listener and re-enable drag
            this.map.off('click', onClick);
            this.map.dragPan.enable();
            // Optionally show marker
            if (this.routeStartMarker) this.routeStartMarker.remove();
            const markerEl = document.createElement('div');
            markerEl.className = 'custom-route-start-marker';
            markerEl.innerHTML = '🚩';
            this.routeStartMarker = new maplibregl.Marker({ element: markerEl, anchor: 'bottom' })
                .setLngLat([lngLat.lng, lngLat.lat])
                .addTo(this.map);
            // Optionally trigger route recalculation if destination is set
            if (this.selectedRoom) {
                this.routeToRoom(this.selectedRoom);
            }
            // Restore UI overlays
            overlays.forEach(el => {
                if (el) el.style.display = '';
            });
            // Hide red border overlay
            if (borderOverlay) borderOverlay.style.display = 'none';
        };
        this.map.on('click', onClick);
    }

    saveStateToUrl() {
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();
        const params = new URLSearchParams();

        // Save map position
        params.set('lat', center.lat.toFixed(6));
        params.set('lng', center.lng.toFixed(6));
        params.set('zoom', zoom.toFixed(2));

        // Save current level
        params.set('level', this.currentLevel);

        // Save selected room if any
        if (this.selectedRoom) {
            params.set('room', this.selectedRoom.name);
            params.set('building', this.selectedRoom.buildingName || '');
        }

        // Save routing state if active
        if (this.showRoute && this.routeInformation) {
            params.set('route', '1');
            params.set('routeDest', this.routeInformation.room.name);
            params.set('routeBuilding', this.routeInformation.room.buildingName || '');
            // Save custom start point if set
            if (this.customRouteStart) {
                params.set('routeStartLat', this.customRouteStart.lat.toFixed(6));
                params.set('routeStartLng', this.customRouteStart.lng.toFixed(6));
            }
        }

        // Update URL without causing page reload
        const newHash = '#' + params.toString();
        if (window.location.hash !== newHash) {
            window.history.replaceState(null, null, newHash);
        }
    }

    loadStateFromUrl() {
        const hash = window.location.hash.substring(1);
        if (!hash) return;

        const params = new URLSearchParams(hash);

        // Restore map position
        const lat = parseFloat(params.get('lat'));
        const lng = parseFloat(params.get('lng'));
        const zoom = parseFloat(params.get('zoom'));

        if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
            this.map.setCenter([lng, lat]);
            this.map.setZoom(zoom);
        }

        // Restore level
        const level = params.get('level');
        if (level && LEVEL_ORDER.includes(level)) {
            this.updateLevel(level);
        }

        // Restore selected room
        const roomName = params.get('room');
        const buildingName = params.get('building');
        if (roomName && this.buildingData) {
            this.findAndSelectRoom(roomName, buildingName);
        }

        // Restore routing state if present
        const routeEnabled = params.get('route') === '1';
        const routeDest = params.get('routeDest');
        const routeBuilding = params.get('routeBuilding');
        const routeStartLat = params.get('routeStartLat');
        const routeStartLng = params.get('routeStartLng');
        if (routeEnabled && routeDest && this.buildingData) {
            // Find destination room
            this.findAndSelectRoom(routeDest, routeBuilding).then(found => {
                if (found) {
                    // Set custom start point if present
                    if (routeStartLat && routeStartLng) {
                        this.customRouteStart = {
                            lat: parseFloat(routeStartLat),
                            lng: parseFloat(routeStartLng)
                        };
                    } else {
                        this.customRouteStart = null;
                    }
                    // Route to room
                    this.routeToRoom(this.selectedRoom);
                }
            });
        }
    }

    async findAndSelectRoom(roomName, buildingName) {
        // Search for the room in the building data
        for (const [buildingId, building] of Object.entries(this.buildingData.part)) {
            const buildingData = building.building;

            for (const part of Object.values(building.parts || {})) {
                for (const room of Object.values(part.rooms || {})) {
                    if (room.rName === roomName &&
                        (!buildingName || buildingData.displayName === buildingName)) {
                        // Create room object similar to SearchOverlay format
                        // const roomObj = {
                        //     name: room.rName,
                        //     buildingName: buildingData.displayName,
                        //     level: part.level,
                        //     latLng: room.latlng,
                        //     roomId: room.roomid
                        // };

                        //SearchRoomResponse(name: any, buildingName: any, latLng: any, level: any, originalRoom: any, buildingId: any, roomId: any
                        const roomObj = new SearchRoomResponse(
                            room.rName,
                            buildingData.displayName,
                            room.latlng,
                            part.level,
                            room,
                            buildingId,
                            room.roomid
                        );

                        this.selectRoom(roomObj);
                        return true;
                    }
                }
            }
        }
        console.warn(`Room "${roomName}" not found in building "${buildingName || 'any'}"`);
        return false;
    }

    updateLevel(newLevel) {
        this.currentLevel = newLevel;
        this.updateLayers();
        this.saveStateToUrl();
    }

    selectRoom(room) {
        console.log('Selecting room:', room);

        this.selectedRoom = room;

        // Update level to room's level
        this.updateLevel(room.level);

        // Animate to room location
        this.map.flyTo({
            center: [room.latLng.lng, room.latLng.lat],
            zoom: Math.max(19, this.map.getZoom()),
            duration: 1000
        });

        // Show room info
        this.roomInfoOverlay.showRoom(room);

        // Update URL after animation completes
        setTimeout(() => {
            this.saveStateToUrl();
        }, 1100);
    }

    genLayers() {
        this.layers = {};
        for (let level of LEVEL_ORDER) {
            //raster layer with url: /mapTiling/tiles/${level}/${z}/${x}/${y}.png
            this.map.addSource(level, {
                type: "raster",
                tiles: [apiUrls.getTileMap(level)],
                tileSize: 512
            });
            this.map.addLayer({
                id: level,
                type: "raster",
                source: level,
                layout: {
                    visibility: 'none'
                },
                paint: {
                    'raster-brightness-min': 1,
                    'raster-brightness-max': 0.15
                }
            });
        }
    }

    async updateLayers() {
        for (let level of LEVEL_ORDER) {
            if (level === this.currentLevel) {
                this.map.setLayoutProperty(level, 'visibility', 'visible');
            } else {
                this.map.setLayoutProperty(level, 'visibility', 'none');
            }
        }

        // Update route visibility based on current level
        if (this.showRoute) {
            this.updateRouteVisibility();
        }
    }

    updateRouteVisibility() {
        const layers = this.map.getStyle().layers;

        layers.forEach(layer => {
            if (layer.id.startsWith('route-layer-')) {
                const source = this.map.getSource(layer.source);
                if (source && source._data && source._data.properties) {
                    const routeLevel = source._data.properties.level;
                    const isVisible = routeLevel === this.currentLevel;

                    this.map.setPaintProperty(layer.id, 'line-color',
                        isVisible ? '#0066cc' : 'rgba(189, 197, 216, 0.81)');

                    // add line border

                    this.map.setPaintProperty(layer.id, 'line-opacity',
                        isVisible ? 1 : 0.76); // Higher opacity for non-current levels
                }
            }
        });
    }

    async updateAvailableLayers() {
        if (!this.buildingData) {
            console.log('Building data not yet loaded');
            return;
        }

        let mapBounds = this.map.getBounds();
        // console.log('Map bounds:', mapBounds);

        // Create a slightly expanded bounds for better detection
        const expandFactor = 0.001; // About 100m at this scale
        const expandedBounds = {
            west: mapBounds.getWest() - expandFactor,
            east: mapBounds.getEast() + expandFactor,
            south: mapBounds.getSouth() - expandFactor,
            north: mapBounds.getNorth() + expandFactor
        };

        this.availableLevels = [];

        for (let building of Object.keys(this.buildingData.part)) {
            for (let partId of Object.keys(this.buildingData.part[building].parts)) {
                let part = this.buildingData.part[building].parts[partId];
                let poly = part.polyInfo.poly;
                let level = part.level;

                // Check if any corner of the building polygon is within the expanded map bounds
                const corners = [
                    { lat: poly.topLeft.lat, lng: poly.topLeft.lng },
                    { lat: poly.topRight.lat, lng: poly.topRight.lng },
                    { lat: poly.bottomLeft.lat, lng: poly.bottomLeft.lng },
                    { lat: poly.bottomRight.lat, lng: poly.bottomRight.lng }
                ];

                let isInBounds = false;
                for (const corner of corners) {
                    if (corner.lng >= expandedBounds.west &&
                        corner.lng <= expandedBounds.east &&
                        corner.lat >= expandedBounds.south &&
                        corner.lat <= expandedBounds.north) {
                        isInBounds = true;
                        break;
                    }
                }

                // Also check if the map bounds intersect with the building bounds
                if (!isInBounds) {
                    const buildingBounds = {
                        west: Math.min(poly.topLeft.lng, poly.bottomLeft.lng, poly.topRight.lng, poly.bottomRight.lng),
                        east: Math.max(poly.topLeft.lng, poly.bottomLeft.lng, poly.topRight.lng, poly.bottomRight.lng),
                        south: Math.min(poly.topLeft.lat, poly.bottomLeft.lat, poly.topRight.lat, poly.bottomRight.lat),
                        north: Math.max(poly.topLeft.lat, poly.bottomLeft.lat, poly.topRight.lat, poly.bottomRight.lat)
                    };

                    // Check for bounds intersection
                    isInBounds = !(expandedBounds.east < buildingBounds.west ||
                        expandedBounds.west > buildingBounds.east ||
                        expandedBounds.north < buildingBounds.south ||
                        expandedBounds.south > buildingBounds.north);
                }

                if (isInBounds && !this.availableLevels.includes(level)) {
                    // console.log(`Adding level ${level} for building ${building}, part ${partId}`);
                    this.availableLevels.push(level);
                }
            }
        }

        this.availableLevels.sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
        // console.log('Available levels:', this.availableLevels);

        // Update the level select overlay
        this.levelSelectOverlay.updateAvailableLevels(this.availableLevels);
    }

    async loadData() {
        let buildingData = await (await fetch(apiUrls.getAppData())).json();
        console.log(buildingData);
        this.buildingData = buildingData;
    }

    async getUserPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                },
                (error) => {
                    console.error('Error getting user position:', error);
                    reject(error);
                }
            );
        });
    }

    // Routing functionality
    async routeToRoom(room) {
        this.isLoadingRoute = true;
        this.showLoadingOverlay();

        console.log('Routing to room:', room);

        try {
            // Use custom start point if set, otherwise default
            const userPosition = this.customRouteStart || await this.getUserPosition().catch((error) => {
                //activate user to select location
                this.setRouteStartPoint();
                return null;
            });
            if (!userPosition) {

                this.isLoadingRoute = false;
                this.hideLoadingOverlay();
                // Update room info overlay
                this.roomInfoOverlay.render();
                return;
            }

            // Fetch routing data for the building
            const routingData = await this.fetchRoutingData(room.buildingId);

            if (!routingData) {
                throw new Error('No routing data available for this building');
            }

            console.log('Routing to room:', room.name, 'in building:', room.buildingName);

            // Find closest start point on ground level (or current level if desired)
            let startPoint = this.findClosestPoint(userPosition, routingData.points, "EG");
            if (!startPoint) {
                throw new Error('No valid start point found');
            }

            // Find end point for the room
            let endPoint = this.findRoomPoint(room, routingData.points);
            if (!endPoint) {
                throw new Error('No valid end point found for room');
            }

            console.log('Start point:', startPoint.id, 'End point:', endPoint.id);

            // Calculate route using A* algorithm
            const route = this.calculateRoute(startPoint.id, endPoint.id, routingData.points, routingData.lines);

            if (route.length === 0) {
                throw new Error('No route found');
            }

            // Convert route to display format
            this.routePoints = route.map(point => ({
                point: [point.lng, point.lat],
                level: point.level
            }));

            this.routeInformation = {
                start: [userPosition.lng, userPosition.lat],
                end: [room.latLng.lng, room.latLng.lat],
                room: room
            };

            this.showRoute = true;
            this.displayRoute();
            this.fitRouteBounds();
            this.roomInfoOverlay.showRouteControl(this.routeInformation);

        } catch (error) {
            console.error('Error routing to room:', error);
            alert('Error calculating route: ' + error.message);
        }

        this.isLoadingRoute = false;
        this.hideLoadingOverlay();
        // Update room info overlay
        this.roomInfoOverlay.render();
    }

    async fetchRoutingData(buildingId) {
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

    findClosestPoint(userPosition, points, level) {
        let closestPoint = null;
        let minDistance = Infinity;

        for (const [pointId, point] of Object.entries(points)) {
            if (point.level !== level) continue;

            const distance = this.calculateDistance(
                userPosition.lat, userPosition.lng,
                point.lat, point.lng
            );

            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = { id: pointId, ...point };
            }
        }

        return closestPoint;
    }

    findRoomPoint(room, points) {
        // First try to find exact room match
        for (const [pointId, point] of Object.entries(points)) {
            if (point.level === room.level &&
                point.tags && point.tags.room === room.name) {
                return { id: pointId, ...point };
            }
        }

        // Fallback: find closest point on the same level
        let closestPoint = null;
        let minDistance = Infinity;

        for (const [pointId, point] of Object.entries(points)) {
            if (point.level !== room.level) continue;

            const distance = this.calculateDistance(
                room.latLng.lat, room.latLng.lng,
                point.lat, point.lng
            );

            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = { id: pointId, ...point };
            }
        }

        return closestPoint;
    }

    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371e3; // Earth radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    calculateRoute(startId, endId, points, lines) {
        // Build adjacency graph
        const graph = {};
        for (const line of lines) {
            if (!graph[line.start]) graph[line.start] = [];
            if (!graph[line.end]) graph[line.end] = [];
            graph[line.start].push({ node: line.end, line: line });
            graph[line.end].push({ node: line.start, line: line });
        }

        // A* algorithm implementation
        const openSet = [startId];
        const cameFrom = {};
        const gScore = { [startId]: 0 };
        const fScore = { [startId]: this.heuristic(points[startId], points[endId]) };

        while (openSet.length > 0) {
            // Find node with lowest fScore
            let current = openSet[0];
            let currentIndex = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (fScore[openSet[i]] < fScore[current]) {
                    current = openSet[i];
                    currentIndex = i;
                }
            }

            if (current === endId) {
                // Reconstruct path
                const path = [];
                let node = endId;
                while (node) {
                    path.unshift(points[node]);
                    node = cameFrom[node];
                }
                return path;
            }

            openSet.splice(currentIndex, 1);

            if (!graph[current]) continue;

            for (const neighbor of graph[current]) {
                const tentativeG = gScore[current] + this.getEdgeWeight(points[current], neighbor.line, points[neighbor.node]);

                if (!(neighbor.node in gScore) || tentativeG < gScore[neighbor.node]) {
                    cameFrom[neighbor.node] = current;
                    gScore[neighbor.node] = tentativeG;
                    fScore[neighbor.node] = tentativeG + this.heuristic(points[neighbor.node], points[endId]);

                    if (!openSet.includes(neighbor.node)) {
                        openSet.push(neighbor.node);
                    }
                }
            }
        }

        return []; // No path found
    }

    heuristic(pointA, pointB) {
        const dx = pointA.lng - pointB.lng;
        const dy = pointA.lat - pointB.lat;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getEdgeWeight(fromPoint, line, toPoint) {
        let baseDistance = this.heuristic(fromPoint, toPoint);

        let weightedDistance = this.settingsService.getRouteWeight({
            pointTags: toPoint.tags || {},
            lineTags: line.tags || {},
            baseDistance: baseDistance
        });

        return weightedDistance;
    }

    displayRoute() {
        if (!this.showRoute || this.routePoints.length === 0) {
            this.clearRoute();
            return;
        }

        // Group route points by level
        const routeSegments = this.groupRouteByLevel(this.routePoints);

        // Add route sources and layers
        this.clearRoute(); // Clear existing route

        // Add polylines for each segment
        routeSegments.forEach((segment, index) => {
            const sourceId = `route-${index}`;
            const layerId = `route-layer-${index}`;
            const whiteLayerId = `route-white-layer-${index}`;
            const clickLayerId = `route-click-layer-${index}`;

            // Remove existing layers and source if present
            if (this.map.getLayer(clickLayerId)) {
                this.map.removeLayer(clickLayerId);
            }
            if (this.map.getLayer(layerId)) {
                this.map.removeLayer(layerId);
            }
            if (this.map.getSource(sourceId)) {
                this.map.removeSource(sourceId);
            }

            this.map.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: {
                        level: segment.level
                    },
                    geometry: {
                        type: 'LineString',
                        coordinates: segment.points
                    }
                }
            });

            // const isCurrentLevel = segment.level === this.currentLevel;

            this.map.addLayer({
                id: whiteLayerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#ffffff',
                    'line-width': 7,
                    'line-opacity': 1
                }
            });
            this.map.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#0000ff',
                    'line-width': 4,
                    'line-opacity': 1
                }
            });

            // Add a wide transparent line above for click detection
            this.map.addLayer({
                id: clickLayerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': 'rgba(0,0,0,0)',
                    'line-width': 18,
                    'line-opacity': 0
                },
                interactive: true
            });


            // Add click event to the wide layer
            this.map.on('click', clickLayerId, (e) => {
                this.updateLevel(segment.level);
            });
        });

        this.updateRouteVisibility();

        // Add level change markers
        for (let i = 1; i < routeSegments.length; i++) {
            const prevSegment = routeSegments[i - 1];
            const currSegment = routeSegments[i];
            // Transition point is the last point of previous segment (and first of current)
            const transitionCoord = prevSegment.points[prevSegment.points.length - 1];
            const fromLevel = prevSegment.level;
            const toLevel = currSegment.level;
            this.addLevelChangeMarker(transitionCoord, fromLevel, toLevel);
        }

        // Add start and end markers
        this.addRouteMarkers();
    }
    addLevelChangeMarker(coord, fromLevel, toLevel) {
        // Remove previous marker if exists
        const markerId = `level-change-${fromLevel}-${toLevel}-${coord[0]}-${coord[1]}`;
        if (this.levelChangeMarkers && this.levelChangeMarkers[markerId]) {
            this.levelChangeMarkers[markerId].remove();
            delete this.levelChangeMarkers[markerId];
        } else {
            if (!this.levelChangeMarkers) this.levelChangeMarkers = {};
        }

        // Choose SVG icon and color
        let label = `${fromLevel}→${toLevel}`;
        let color = '#ff9800';
        // Parse level order for up/down
        const levelOrder = [
            "OG 07 Z", "OG 07", "OG 06 Z", "OG 06", "OG 05 Z", "OG 05", "OG 04 Z", "OG 04",
            "OG 03 Z", "OG 03", "OG 02 Z", "OG 02", "OG 01 Z", "OG 01", "EG Z", "EG",
            "UG 01", "UG 02", "UG 03"
        ];
        const fromIdx = levelOrder.indexOf(fromLevel);
        const toIdx = levelOrder.indexOf(toLevel);
        let svgIcon = '';
        if (toIdx < fromIdx) {
            // Up arrow
            svgIcon = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 18V5M11 5L5 11M11 5L17 11" stroke='${color}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/></svg>`;
        } else if (toIdx > fromIdx) {
            // Down arrow
            svgIcon = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 4V17M11 17L5 11M11 17L17 11" stroke='${color}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/></svg>`;
        } else {
            // Side arrow (right)
            svgIcon = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 11H17M17 11L11 5M17 11L11 17" stroke='${color}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/></svg>`;
        }

        // Create custom HTML marker (icon above text, no background)
        const markerEl = document.createElement('div');
        markerEl.className = 'level-change-marker';
        markerEl.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: none;
            border-radius: 0;
            border: none;
            box-shadow: none;
            padding: 0;
            min-width: 0;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.4s cubic-bezier(.4,0,.2,1);
        `;

        // Icon (SVG above text)
        const iconDiv = document.createElement('div');
        iconDiv.style.width = '18px';
        iconDiv.style.height = '18px';
        iconDiv.style.display = 'flex';
        iconDiv.style.alignItems = 'center';
        iconDiv.style.justifyContent = 'center';
        iconDiv.style.marginBottom = '2px';
        iconDiv.style.background = '#ffffffd9';
        iconDiv.style.borderRadius = '6px';
        iconDiv.style.border = '1px solid #ffffff';
        iconDiv.innerHTML = svgIcon;
        markerEl.appendChild(iconDiv);

        // Label (below icon, with background and border)
        const labelDiv = document.createElement('div');
        labelDiv.style.fontSize = '10px';
        labelDiv.style.fontWeight = 'bold';
        labelDiv.style.color = '#ff9800';
        labelDiv.style.background = '#ffffffd9';
        labelDiv.style.borderRadius = '6px';
        labelDiv.style.border = '1px solid #ff9800';
        labelDiv.style.padding = '0px 4px';
        labelDiv.style.marginTop = '2px';
        labelDiv.textContent = label;
        markerEl.appendChild(labelDiv);

        // Add marker to map
        const marker = new maplibregl.Marker({
            element: markerEl,
            anchor: 'bottom'
        })
            .setLngLat(coord)
            .addTo(this.map);
        this.levelChangeMarkers[markerId] = marker;

        // Add click event to marker to switch to the target level
        markerEl.style.cursor = 'pointer';
        markerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.updateLevel(toLevel);
        });

        // Fade-in animation
        setTimeout(() => {
            markerEl.style.opacity = '1';
        }, 30);
    }


    groupRouteByLevel(routePoints) {
        const segments = [];
        let currentSegment = null;

        for (let i = 0; i < routePoints.length; i++) {
            const routePoint = routePoints[i];
            if (!currentSegment || currentSegment.level !== routePoint.level) {
                // If changing level, repeat the transition point at the end of previous and start of next
                if (currentSegment && currentSegment.points.length > 0) {
                    // Add transition point to previous segment
                    currentSegment.points.push(routePoint.point);
                    segments.push(currentSegment);
                }
                // Start new segment with transition point
                currentSegment = {
                    level: routePoint.level,
                    points: [routePoint.point]
                };
            } else {
                currentSegment.points.push(routePoint.point);
            }
        }

        if (currentSegment && currentSegment.points.length > 0) {
            segments.push(currentSegment);
        }

        return segments;
    }

    addRouteMarkers() {
        if (this.routePoints.length === 0) return;

        // Add start marker
        const startPoint = this.routePoints[0];
        this.map.addSource('route-start', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: startPoint.point
                }
            }
        });

        this.map.addLayer({
            id: 'route-start-marker',
            type: 'circle',
            source: 'route-start',
            paint: {
                'circle-radius': 8,
                'circle-color': '#00aa00',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
            }
        });
    }

    clearRoute() {
        // Remove existing route layers and sources
        const layers = this.map.getStyle().layers;
        const sources = this.map.getStyle().sources;

        // Remove route layers (including click layers)
        layers.forEach(layer => {
            if (
                layer.id.startsWith('route-layer-') ||
                layer.id.startsWith('route-click-layer-') ||
                layer.id.startsWith('route-white-layer-') ||
                layer.id === 'route-start-marker'
            ) {
                this.map.removeLayer(layer.id);
            }
        });

        // Remove route sources
        Object.keys(sources).forEach(sourceId => {
            if (sourceId.startsWith('route-') || sourceId === 'route-start') {
                this.map.removeSource(sourceId);
            }
        });

        // Remove level change markers
        if (this.levelChangeMarkers) {
            Object.values(this.levelChangeMarkers).forEach(marker => {
                marker.remove();
            });
            this.levelChangeMarkers = {};
        }
    }

    hideRoute() {
        this.showRoute = false;
        this.routePoints = [];
        this.routeInformation = null;
        this.clearRoute();
        // Remove route control from room info overlay
        const rc = this.roomInfoOverlay.overlayElement.querySelector('.route-control-container');
        if (rc) rc.remove();
        // Force room info overlay to update button color/logic
        if (this.roomInfoOverlay && this.roomInfoOverlay.currentRoom) {
            this.roomInfoOverlay.render();
            setTimeout(() => {
                this.routeControlOverlay.currentStatus = "hidden";
            }, 20);
        }
    }

    fitRouteBounds() {
        if (this.routePoints.length === 0) return;

        const coordinates = this.routePoints.map(rp => rp.point);
        const bounds = coordinates.reduce((bounds, coord) => {
            return bounds.extend(coord);
        }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));

        this.map.fitBounds(bounds, {
            padding: { top: 60, bottom: 220, left: 30, right: 100 }
        });
    }

    showLoadingOverlay() {
        // Create loading overlay if it doesn't exist
        if (!document.getElementById('routing-loading-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'routing-loading-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
            `;

            const card = document.createElement('div');
            card.style.cssText = `
                background: rgba(40, 44, 52, 0.95);
                border-radius: 12px;
                padding: 24px;
                backdrop-filter: blur(10px);
                color: white;
                text-align: center;
            `;

            card.innerHTML = `
                <div style="width: 24px; height: 24px; border: 2px solid transparent; border-top: 2px solid #4fa8d8; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite;"></div>
                <div style="font-size: 16px;">Calculating route...</div>
            `;

            overlay.appendChild(card);
            document.body.appendChild(overlay);
        }
    }

    hideLoadingOverlay() {
        const overlay = document.getElementById('routing-loading-overlay');
        if (overlay) {
            overlay.remove();
        }
    }
}

map.on('load', function () {
    const main = new Main();
    main.init(map);
    window.main = main; // Expose main for debugging
});
// SettingsService: manages routing and display settings, persists in localStorage
class SettingsService {
    constructor() {
        this.config = {
            accessible: {
                name: "Avoid Stairs",
                type: "bool",
                default: false,
                category: "Routing Preferences",
                description: "Find accessible routes when possible"
            },
            shortestPath: {
                name: "Prefer Shortest Path",
                type: "bool",
                default: true,
                category: "Routing Preferences",
                description: "Optimize for distances instead of physical exertion."
            },
            notOutside: {
                name: "Prefer Indoor Routes",
                type: "bool",
                default: false,
                category: "Routing Preferences",
                description: "Prefer routes that are indoors when available"
            },
            ignoreLocks: {
                name: "Ignore Locks",
                type: "bool",
                default: false,
                category: "Routing Preferences",
                description: "Ignore locked areas when calculating routes"
            },
            units: {
                name: "Distance Units",
                type: "string",
                default: "Meters",
                category: "Display Settings",
                options: ["Meters", "Feet"]
            }
        };
        this.values = {};
        this.load();
    }

    load() {
        for (const key in this.config) {
            const val = localStorage.getItem('settings_' + key);
            if (val !== null) {
                if (this.config[key].type === 'bool') {
                    this.values[key] = val === 'true';
                } else {
                    this.values[key] = val;
                }
            } else {
                this.values[key] = this.config[key].default;
            }
        }
    }

    save(key, value) {
        this.values[key] = value;
        localStorage.setItem('settings_' + key, value);
    }

    getValue(key) {
        return this.values[key];
    }

    getRouteWeight({ pointTags, lineTags, baseDistance }) {
        let weight = baseDistance;
        // accessible == true means: the route is not accessible
        if (this.getValue('accessible')) {
            if (lineTags['accessible'] === true) {
                weight *= 1000;
            }
        } else {
            if (pointTags['elevator'] === true) {
                weight = Math.max(weight, 5) * 10;
            }
        }
        if (!this.getValue('ignoreLocks')) {
            if (pointTags['private'] === true) {
                weight *= 1000;
            }
            if (lineTags['locked'] === true) {
                weight *= 1000;
            }
            if (lineTags['unlikely'] === true) {
                weight *= 4;
            }
        }
        if (this.getValue('notOutside') && pointTags['outside'] === true) {
            weight *= 10;
        }
        if (!this.getValue('shortestPath')) {
            if (lineTags['accessible'] === true) {
                weight *= 1.5;
            }
        }
        return weight;
    }
}

// SettingsOverlay: UI for settings page
class SettingsOverlay {
    constructor(main) {
        this.main = main;
        this.overlayId = 'settings-overlay';
        this.rendered = false;
        this.onClose = null; // Callback for when overlay is closed
    }

    show() {
        if (!this.rendered) {
            this.render();
        }
        const overlay = document.getElementById(this.overlayId);
        if (overlay) {
            overlay.style.display = 'flex';
        }
    }

    hide() {
        const overlay = document.getElementById(this.overlayId);
        if (overlay) {
            overlay.style.display = 'none';
        }
        if (typeof this.onClose === 'function') {
            this.onClose();
        }
    }

    render() {
        let overlay = document.getElementById(this.overlayId);
        if (overlay) {
            overlay.innerHTML = '';
        } else {
            overlay = document.createElement('div');
            overlay.id = this.overlayId;
            overlay.className = 'settings-overlay';
            document.body.appendChild(overlay);
        }

        const container = document.createElement('div');
        container.className = 'settings-container';

        // Title
        const title = document.createElement('div');
        title.className = 'settings-title';
        title.textContent = 'Settings';
        container.appendChild(title);

        // Settings grouped by category
        const grouped = {};
        for (const key in this.main.settingsService.config) {
            const cfg = this.main.settingsService.config[key];
            const cat = cfg.category || 'General';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push({ key, cfg });
        }
        for (const cat in grouped) {
            const catTitle = document.createElement('div');
            catTitle.className = 'settings-category';
            catTitle.textContent = cat;
            container.appendChild(catTitle);
            for (const { key, cfg } of grouped[cat]) {
                container.appendChild(this.renderSetting(key, cfg));
            }
        }

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'settings-close-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Close';
        closeBtn.onclick = () => this.hide();
        container.appendChild(closeBtn);

        overlay.appendChild(container);
        this.rendered = true;
    }

    renderSetting(key, cfg) {
        const row = document.createElement('div');
        row.className = 'settings-row';

        // Label
        const label = document.createElement('div');
        label.className = 'settings-label';
        label.textContent = cfg.name;
        row.appendChild(label);

        // Control
        let control;
        if (cfg.type === 'bool') {
            control = document.createElement('input');
            control.type = 'checkbox';
            control.className = 'slider-switch';
            control.checked = this.main.settingsService.getValue(key);
            control.onchange = (e) => {
                this.main.settingsService.save(key, control.checked);
            };
            // Clicking row toggles checkbox
            row.addEventListener('click', (e) => {
                if (e.target !== control) {
                    control.checked = !control.checked;
                    control.dispatchEvent(new Event('change'));
                }
            });
        } else if (cfg.type === 'string' && cfg.options) {
            control = document.createElement('select');
            for (const opt of cfg.options) {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                control.appendChild(option);
            }
            control.value = this.main.settingsService.getValue(key);
            control.onchange = (e) => {
                this.main.settingsService.save(key, control.value);
            };
            // Clicking row focuses select
            row.addEventListener('click', (e) => {
                if (e.target !== control) {
                    control.focus();
                }
            });
        }
        row.appendChild(control);

        // Description
        if (cfg.description) {
            const desc = document.createElement('div');
            desc.className = 'settings-desc';
            desc.textContent = cfg.description;
            row.appendChild(desc);
        }
        return row;
    }
}