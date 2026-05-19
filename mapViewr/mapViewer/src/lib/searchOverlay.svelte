<script>
	import { tick, onMount, onDestroy } from 'svelte';
	import { SearchResponse, MarkerProposal, SearchRoomResponse, search } from '$lib/searchEngine.js';
	import { availableMapMarkerTypes } from './constants';
	import { building } from '$app/environment';

	class searchElement {
		/**
		 * @param {string} id
		 * @param {string} name
		 * @param {string} typeId
		 * @param {[number, number]} coordinates
		 */
		constructor(id, name, typeId, coordinates) {
			this.id = id;
			this.name = name;
			this.typeId = typeId;
			this.coordinates = coordinates;
		}
	}

	/**
	 * @type {{map: import('maplibre-gl').Map | undefined, selectRoom: Function, selectedRoom: SearchRoomResponse | null, selectMarker: Function, selectedMarker: MarkerProposal | null}}
	 */
	let { map, selectRoom, selectedRoom, selectMarker, selectedMarker } = $props();

	let isSearchVisible = $state(false);
	/**
	 * @type {HTMLInputElement | null}
	 */
	let searchInputEl = $state(null);

	let searchInput = $state('');
	/**
	 * @type {SearchResponse[]}
	 */
	let searchResults = $derived.by(() => {
		return search(searchInput);
	});

	// Focus input when search opens
	$effect(() => {
		if (isSearchVisible) {
			tick().then(() => {
				searchInputEl?.focus();
			});
		}
	});

	$effect(() => {
		if (searchResults.length > 0 && searchResults[0] instanceof MarkerProposal) {
			// if the first result is a MarkerProposal, we assume all results are MarkerProposals and thus we select the first one
			selectMarker(searchResults[0]);
		} else if (selectedMarker != null) {
			selectMarker(null);
		}
	});

	// Close search when clicking outside
	/**
	 * @param {MouseEvent} e
	 */
	function handleDocumentClick(e) {
		if (isSearchVisible) {
			isSearchVisible = false;
		}
	}

	/**
	 * Handle click on search result
	 * @param {MouseEvent} e
	 * @param {SearchResponse} result
	 */
	function searchClickHandler(e, result) {
		e.stopPropagation();
		if (result instanceof SearchRoomResponse) {
			selectRoom(result);
			isSearchVisible = false;
		} else if (result instanceof MarkerProposal) {
			console.log('MarkerProposal clicked:', result);
			searchInput = result.name;
		}
	}

	function clearSearch() {
		searchInput = '';
		selectMarker(null);
	}

	onMount(() => {
		document.addEventListener('click', handleDocumentClick);
		return () => {
			document.removeEventListener('click', handleDocumentClick);
		};
	});

	/**
	 * @param {string} input
	 */
	export function setSearchInput(input) {
		searchInput = input;
	}

	export { isSearchVisible };
</script>

<div id="search-overlay">
	<!--	bind value to searchinput-->
	<div
		class="search-container {isSearchVisible ? 'expanded' : ''}"
		onclick={(e) => {
			e.stopPropagation();
			isSearchVisible = true;
		}}
		ontouchend={(e) => {
			e.stopPropagation();
			isSearchVisible = true;
		}}
		onkeydown={(e) => {
			e.stopPropagation();
			isSearchVisible = true;
		}}
		role="button"
		tabindex="0"
	>
		<div class="search-input-wrapper">
			<span class="search-icon" style="cursor: pointer;">🔍︎</span>
			{#if isSearchVisible}
				<input
					type="text"
					class="search-input"
					placeholder="Search room..."
					bind:this={searchInputEl}
					bind:value={searchInput}
				/>
			{/if}
		</div>
		{#if isSearchVisible}
			<div class="type-search-wrapper">
				<!-- <div class="type-search-item" data-type-id="WC-H" title="Toilette Herren">🚹</div>
				<div class="type-search-item" data-type-id="WC-D" title="Toilette Damen">🚺</div> -->
				{#each availableMapMarkerTypes as type (type.id)}
					<button
						type="button"
						class="type-search-item {type.id === selectedMarker?.type.id ? 'selected' : ''}"
						data-type-id={type.id}
						title={type.name}
						onclick={(e) => {
							if (selectedMarker && selectedMarker.type.id === type.id) {
								clearSearch();
							} else {
								searchClickHandler(e, new MarkerProposal(type, type.name));
							}
						}}
					>
						{type.icon}
					</button>
				{/each}
			</div>
		{/if}
	</div>
	{#if isSearchVisible && searchResults.length > 0}
		<div class="search-results">
			<div class="search-results-grid">
				<!-- limit to 50 results -->
				{#each searchResults.slice(0, 50) as result (result.searchId)}
					<!-- <button class="search-result-item"><div class="search-result-name">087</div><div class="search-result-building">Akademiestr. 01</div></button> -->
					<!-- differentiate between MarkerProposal and SearchRoomResponse -->
					<button
						type="button"
						class="search-result-item {(result instanceof MarkerProposal &&
							selectedMarker?.type.id === result.type.id) ||
						(result instanceof SearchRoomResponse && selectedRoom?.roomId === result.roomId)
							? 'selected'
							: ''}"
						onclick={(e) => {
							searchClickHandler(e, result);
						}}
					>
						{#if result instanceof MarkerProposal}
							<div class="search-result-name">{result.type.icon} {result.name}</div>
						{:else if result instanceof SearchRoomResponse}
							<div class="search-result-name">{result.name}</div>
							<div class="search-result-building">{result.buildingName}</div>
						{:else}
							<div class="search-result-name">????? {result.name}</div>
						{/if}
					</button>
				{/each}
				{#if searchResults.length > 50}
					<div
						style="grid-column: span 2; text-align: center; padding: 8px; color: rgba(255, 255, 255, 0.7); font-size: 12px;"
					>
						And {searchResults.length - 50} more (worse) results...
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	#search-overlay {
		position: absolute;
		top: 20px;
		left: 20px;
		z-index: 1001;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		max-width: calc(100vw - 140px);
		pointer-events: auto;
	}

	.search-container {
		background-color: rgba(40, 44, 52, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		padding: 7px;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		transition: all 0.2s ease;
		pointer-events: auto;
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
	}

	.search-input-wrapper {
		display: flex;
		align-items: center;
		gap: 8px;
		pointer-events: auto;
		width: 100%;
	}

	.search-icon {
		color: #ffffff;
		font-size: 20px;
		flex-shrink: 0;
		cursor: pointer;
		padding: 4px;
		pointer-events: auto;
		width: 27px;
		height: 27px;
		display: flex;
		justify-content: center;
		align-items: center;
		box-sizing: content-box;
	}

	.search-results {
		margin-top: 6px;
		background-color: rgba(40, 44, 52, 0.95);
		border-radius: 12px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		max-height: 50vh;
		overflow-y: auto;
		/*display: none;*/
	}

	.type-search-wrapper {
		display: flex;
		gap: 5px;
		align-items: center;
	}

	.type-search-item {
		font-size: 25px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		cursor: pointer;
	}

	.search-container.expanded {
		width: 250px;
	}

	.search-input {
		background: none;
		border: none;
		outline: none;
		color: #ffffff;
		font-size: 14px;
		width: 100%;
		padding: 8px 4px;
		pointer-events: auto;
		cursor: text;
		min-height: 20px;
	}
	.search-results-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		padding: 5px;
	}

	.search-result-item {
		background-color: rgba(60, 64, 72, 0.8);
		border-radius: 10px;
		padding: 8px 12px;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
		color: #ffffff;
		text-align: left;
		min-height: 40px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.search-result-name {
		font-weight: 600;
		font-size: 12px;
		margin-bottom: 2px;
	}
	.search-result-building {
		font-size: 10px;
		opacity: 0.7;
	}
	.search-result-item:hover {
		background-color: rgba(80, 84, 92, 0.9);
		transform: scale(1.02);
	}

	.search-result-item.selected {
		background-color: rgba(45, 213, 177, 0.2);
	}

	.type-search-item.selected::before {
		content: '❌';
		font-size: 25px;
		position: absolute;
		background: rgba(213, 45, 45, 0.2);
		border-radius: 8px;
	}
</style>
