<script>
	import Controlls from './Controlls.svelte';
	import SmoothResizer from './SmoothResizer.svelte';
	let large = $state(false);
	let { canBeLarge } = $props();

    /**
     * @type {boolean}
     */
    let actualLarge = $derived((canBeLarge && large) || false);

</script>

<div id="room-info-container">
	<div class="route-info-header" class:has-bottom-border={actualLarge}>
		<div>
			<div class="route-info-title">A150</div>
			<div class="route-info-building">Route</div>
		</div>
		<Controlls
			actions={[
				{
					title: 'Small / large',
					icon: large ? '↓' : '↑',
					onClick: () => {
						large = !large;
					},
					class: 'expand-btn'
				},
				{
					// label: 'Close',
					title: 'Close',
					icon: '✕',
					onClick: () => {},
					class: 'close-btn'
				}
			]}
		/>
	</div>
	<SmoothResizer expanded={actualLarge} duration={220} class="smooth-resizer-container">
		<div class="route-info-content">
			<p>Start at A150</p>
			<p>Go straight for 50m</p>
			<p>Turn right and go for 30m</p>
			<p>Your destination will be on the left</p>
		</div>
	</SmoothResizer>
</div>

<style>
	#room-info-container {
		padding: 10px;
		position: relative;
	}
	.route-info-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0px;
		padding-bottom: 0px;
		border-bottom: 0px solid rgba(255, 255, 255, 0);

		transition:
			border-bottom 0.3s ease,
			margin-bottom 0.3s ease,
			padding-bottom 0.3s ease;
	}

	.route-info-title {
		font-weight: 600;
		font-size: 14px;
		margin-bottom: 4px;
	}
	.route-info-building {
		font-size: 12px;
		opacity: 0.8;
	}
	.has-bottom-border {
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}
</style>
