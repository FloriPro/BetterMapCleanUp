import adapter from "@sveltejs/adapter-static";

/**
 * @type {import("@sveltejs/kit").Config}
 */
const config = {
    compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
            filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
    },
    kit: {
        // Use the static adapter so the project builds to plain files that can be served
        // by any static file server (no Node server required).
        adapter: adapter({
            pages: "build",
            assets: "build",
            // fallback: 'index.html' enables SPA-style client-side routing when
            // serving the files from plain file hosting (useful for single-page apps).
            fallback: undefined, //'index.html'
            precompress: false,
            strict: true,
        }),
    },
};

export default config;
export const prerender = true;
