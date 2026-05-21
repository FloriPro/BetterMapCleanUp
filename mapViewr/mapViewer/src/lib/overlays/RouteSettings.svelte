<script>
    import settingsService from "$lib/api/settingsService";
    import { getContext } from "svelte";

    // to cattegory

    let settingsCategory = $derived.by(() => {
        /**
         * @type {{
         *     [category: string]: {
         *         [key: string]: {
         *             name: string;
         *             type: string;
         *             default: string | boolean | number;
         *             category: string;
         *             description?: string;
         *             options?: string[];
         *         };
         *     };
         * }}
         */
        let outCat = {};
        for (const key in settingsService.config) {
            const cat = settingsService.config[key].category || "General";
            if (!outCat[cat]) {
                outCat[cat] = {};
            }
            outCat[cat][key] = { ...settingsService.config[key] };
        }
        console.log(outCat);
        return outCat;
    });

    /**
     * @type {Function}
     */
    let closeSettings = getContext("closeSettings");
</script>

<div id="settingsWindowOuter">
    <div id="settingsWindow">
        <button
            class="settings-close-btn"
            title="Close"
            onclick={() => closeSettings()}>✕</button
        >
        <div class="settings-title">Settings</div>
        {#each Object.keys(settingsCategory) as kat (kat)}
            <div class="settings-category">{kat}</div>
            {#each Object.entries(settingsCategory[kat]) as [key, setting] (key)}
                <div class="settings-row">
                    <div class="settings-label">{setting.name}</div>
                    {#if setting.type === "bool"}
                        <input
                            type="checkbox"
                            class="slider-switch"
                            checked={Boolean(settingsService.getValue(key))}
                            onchange={(e) =>
                                settingsService.save(
                                    key,
                                    /** @type {HTMLInputElement} */ (e.target)
                                        ?.checked,
                                )}
                        />
                    {:else if setting.type === "select" && setting.options}
                        <select
                            value={settingsService.getValue(key)}
                            onchange={(e) =>
                                settingsService.save(
                                    key,
                                    /** @type {HTMLSelectElement} */ (e.target)
                                        ?.value,
                                )}
                        >
                            {#each setting.options as option (option)}
                                <option value={option}>{option}</option>
                            {/each}
                        </select>
                    {:else if setting.type === "string"}
                        <input
                            type="text"
                            value={settingsService.getValue(key)}
                            onchange={(e) =>
                                settingsService.save(
                                    key,
                                    /** @type {HTMLInputElement} */ (e.target)
                                        ?.value,
                                )}
                        />
                    {:else if setting.type === "number"}
                        <input
                            type="number"
                            value={settingsService.getValue(key)}
                            onchange={(e) =>
                                settingsService.save(
                                    key,
                                    parseFloat(
                                        /** @type {HTMLInputElement} */ (
                                            e.currentTarget
                                        ).value,
                                    ),
                                )}
                        />
                    {/if}
                    {#if setting.description}
                        <div class="settings-desc">{setting.description}</div>
                    {/if}
                </div>
            {/each}
        {/each}
    </div>
</div>

<style>
    #settingsWindowOuter {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        background: rgba(0, 0, 0, 0.2);
        /* blur */
        backdrop-filter: blur(12px) saturate(1.2);
        --webkit-backdrop-filter: blur(12px) saturate(1.2);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1002;
    }
    #settingsWindow {
        position: relative;
        max-width: 90%;
        max-height: 90%;
        min-height: 200px;
        background: rgba(34, 34, 42, 0.85);
        border-radius: 20px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
        padding: 36px 32px 28px 32px;
        overflow-y: auto;
        color: #fff;
        border: 1.5px solid rgba(255, 255, 255, 0.08);
    }
    .settings-close-btn:hover {
        background: #4fa8d8;
        color: #fff;
        box-shadow: 0 2px 8px rgba(79, 168, 216, 0.1);
    }
    .settings-close-btn {
        position: absolute;
        top: 18px;
        right: 18px;
        background: rgba(45, 45, 55, 0.92);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        color: #e0e6f6;
        border: none;
        border-radius: 10px;
        font-size: 1.3em;
        cursor: pointer;
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .settings-title {
        font-size: 1.7em;
        font-weight: 800;
        margin-bottom: 22px;
        letter-spacing: 0.5px;
        color: #e0e6f6;
        text-shadow: 0 2px 8px rgba(79, 168, 216, 0.08);
    }
    .settings-category {
        font-weight: 700;
        font-size: 1.12em;
        margin-top: 22px;
        margin-bottom: 10px;
        color: #a6b1c8;
        letter-spacing: 0.2px;
    }
    .settings-row {
        display: flex;
        align-items: center;
        margin-bottom: 16px;
        padding: 10px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    }
    .settings-label {
        flex: 1;
        font-weight: 600;
        font-size: 1em;
        color: #e0e6f6;
        letter-spacing: 0.1px;
    }
    .settings-desc {
        font-size: 0.95em;
        color: #a6b1c8;
        margin-left: 14px;
        flex: 2;
        font-style: italic;
    }
    .settings-row input[type="checkbox"] {
        accent-color: #4fa8d8;
        transform: scale(1.25);
        margin-left: 14px;
        cursor: pointer;
    }
    input[type="checkbox"].slider-switch {
        appearance: none;
        width: 44px;
        height: 24px;
        background: #e3e6f0;
        border-radius: 12px;
        position: relative;
        cursor: pointer;
        outline: none;
        border: none;
        box-shadow: 0 2px 8px rgba(80, 120, 220, 0.08);
        transition: background 0.22s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .settings-row input {
        padding: 6px 12px;
        border-radius: 8px;
        background: #333a;
        color: #e0e6f6;
        border: 1px solid #4fa8d8;
        font-size: 1em;
        cursor: text;
    }
    input[type="checkbox"].slider-switch::before {
        content: "";
        position: absolute;
        left: 4px;
        top: 3px;
        width: 18px;
        height: 18px;
        background: linear-gradient(90deg, #4fa8d8 60%, #0066cc 100%);
        border-radius: 50%;
        box-shadow: 0 1px 4px rgba(80, 120, 220, 0.12);
        transition:
            left 0.22s cubic-bezier(0.4, 0, 0.2, 1),
            background 0.18s;
    }
    input[type="checkbox"].slider-switch:checked {
        background: linear-gradient(90deg, #4fa8d8 60%, #0066cc 100%);
    }
    input[type="checkbox"].slider-switch:checked::before {
        left: 22px;
        background: #e3e6f0;
    }

    select {
        padding: 6px 12px;
        border-radius: 8px;
        background: #333a;
        color: #e0e6f6;
        border: 1px solid #4fa8d8;
        font-size: 1em;
        cursor: pointer;
    }
    select:hover {
        background: #444f;
    }
    select option {
        background: #333;
        color: #e0e6f6;
    }
</style>
