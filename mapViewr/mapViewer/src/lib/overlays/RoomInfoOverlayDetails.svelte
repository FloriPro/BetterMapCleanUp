<script>
    import api from "../api/api";
    import SmoothResizer from "./SmoothResizer.svelte";

    let { selectedRoom, large } = $props();
</script>

<div class="room-info-details" class:collapsed={!large}>
    <SmoothResizer
        expanded={large}
        duration={220}
        class="smooth-resizer-container"
    >
        <div class="room-info-details-inner">
            {#await api.getRoom(selectedRoom.roomId)}
                <div class="room-loading">⏳ Loading room details...</div>
            {:then detailedRoom}
                <div class="room-info-details-content">
                    {#if detailedRoom != null}
                        <table class="room-info-table">
                            <tbody>
                                {#each Object.entries(detailedRoom?.toView(selectedRoom) || {}) as [key, value] (key)}
                                    <tr>
                                        <td>{key}</td>
                                        <td>{value}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                        <hr />
                        <a
                            class="lsf-button"
                            href="https://lsf.verwaltung.uni-muenchen.de/qisserver/rds?state=verpublish&status=init&vmfile=no&moduleCall=webInfo&publishConfFile=webInfoRaum&publishSubDir=raum&keep=y&raum.rgid={detailedRoom?.roomid}"
                            target="_blank"
                        >
                            Open in LSF
                        </a>
                    {:else}
                        <div class="room-not-found">
                            Detailed room information not available.
                        </div>
                    {/if}
                </div>
            {/await}
        </div>
    </SmoothResizer>
</div>

<style>
    .room-not-found {
        text-align: center;
        padding: 20px;
        color: rgba(255, 255, 255, 0.7);
        font-style: italic;
        font-size: 14px;
    }

    .room-info-details {
        opacity: 1;
        transition: opacity 220ms ease;
    }

    .room-info-details.collapsed {
        opacity: 0;
        pointer-events: none;
        /* Height is handled by SmoothResizer, so no height:0 !important needed */
    }

    .room-loading {
        text-align: center;
        padding: 20px;
        color: rgba(255, 255, 255, 0.7);
        font-style: italic;
        font-size: 14px;
        position: relative;
    }

    .room-loading::before {
        content: "";
        width: 18px;
        height: 18px;
        border: 2px solid transparent;
        border-top-width: 2px;
        border-top-style: solid;
        border-top-color: transparent;
        border-top: 2px solid #4fa8d8;
        border-radius: 50%;
        display: inline-block;
        margin-right: 8px;
        animation: spin 1s linear infinite;
        vertical-align: middle;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .room-info-details-inner {
        padding: 0 16px;
        max-height: 400px;
        overflow-y: auto;
    }

    .room-info-details-inner table {
        width: 100%;
        border-collapse: collapse;
    }

    .lsf-button:hover {
        background-color: rgba(80, 84, 92, 0.9);
    }

    hr {
        height: 1px;
        background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.3) 50%,
            transparent 100%
        );
        border: none;
    }

    .room-info-table td:first-child {
        font-weight: bold;
        width: 140px;
        background: rgba(255, 255, 255, 0.04);
    }

    .room-info-table td {
        padding: 8px 12px;
        color: #fff;
        vertical-align: top;
    }

    .room-info-table tr {
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }

    .room-info-table tr:last-child {
        border-bottom: none;
    }

    .room-info-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        overflow: hidden;
        font-size: 12px;
		margin-bottom: 12px;
    }

    .lsf-button {
        margin-top: 12px;
        width: 100%;
        padding: 10px;
        background-color: rgba(40, 44, 52, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        color: #ffffff;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        backdrop-filter: blur(8px);
        transition: background-color 0.25s ease;
        text-decoration: none;
        display: inline-block;
        text-align: center;
        margin-bottom: 12px;
    }
</style>
