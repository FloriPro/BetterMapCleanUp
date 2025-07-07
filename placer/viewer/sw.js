const cache = [
    "/viewer",
    "/placer/viewer/viewerstyle.css",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    "/placer/Leaflet.ImageOverlay.Rotated.js",
    "/placer/viewer/viewer.js"
]


const addResourcesToCache = async (resources) => {
    const cache = await caches.open("v1");
    await cache.addAll(resources);
};

self.addEventListener("install", (event) => {
    event.waitUntil(
        addResourcesToCache(cache),
    );
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request, {
            ignoreSearch: true,
        }).then((response) => {
            if (response) {
                return response;
            }
            return fetch(event.request);
        }),
    );
});