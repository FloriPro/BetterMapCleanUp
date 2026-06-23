/**
 * @param {string} url
 * @param {RequestInit} options
 * @param {(event: ProgressEvent) => void} progressCallback
 * @returns {Promise<{
 *     status: number;
 *     statusText: string;
 *     response: Response;
 *     responseText: string;
 *     finalUrl: string;
 * }>}
 */
function fetchWithCorsProxy(url, options, progressCallback) {
    //@ts-expect-error
    if (window.loadedCorsProxy) {
        console.log("Using CORS proxy for request to " + url);
        //@ts-expect-error
        return window.corsFetch(url, options, progressCallback);
    } else {
        return new Promise((resolve, reject) => {
            //@ts-expect-error
            window.waitforcors = window.waitforcors || [];
            //@ts-expect-error
            window.waitforcors.push(() => {
                console.log("Using CORS proxy for request to " + url);
                window
                    //@ts-expect-error
                    .corsFetch(url, options, progressCallback)
                    .then(resolve)
                    .catch(reject);
            });
        });
    }
}

import { afterNavigate } from "$app/navigation";

/**
 * @type {{ value: boolean | null }}
 */
let hasCorsProxy = $state({ value: null });

function checkCorsProxy() {
    // console.log('checking cors proxy');
    hasCorsProxy.value = false;
    //@ts-expect-error
    window.waitforcors = window.waitforcors || [];
    //@ts-expect-error
    window.waitforcors.push(() => {
        hasCorsProxy.value = true;
    });

    //@ts-expect-error
    if (window.loadedCorsProxy) {
        // console.log('cors proxy already loaded');
        //@ts-expect-error
        window.waitforcors.forEach(
            (
                /**
                 * @type {() => void}
                 */ el,
            ) => {
                el();
            },
        );
        //@ts-expect-error
        window.waitforcors = [];
    }
}

export { fetchWithCorsProxy, hasCorsProxy, checkCorsProxy };
