<script>
	let { expanded = true, duration = 220, class: className = '', children } = $props();

	let container = $state();
	let inner = $state();
	/**
	 * @type {((e: any) => void) | null}
	 */
	let currentTransitionEndHandler = null;

	/**
	 * @type {number | null}
	 */
	let oldFrom = null;

	/**
	 * @param {HTMLElement} el
	 * @return {number}
	 */
	function getHeightWithMargin(el) {
		const style = getComputedStyle(el);
		return el.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
	}

	/**
	 * @param {boolean} open
	 */
	function animateTo(open) {
		if (!container || !inner) return;

		// Clean up previous transition end handler if exists
		if (currentTransitionEndHandler) {
			container.removeEventListener('transitionend', currentTransitionEndHandler);
			currentTransitionEndHandler = null;
		}

		/**
		 * @type {number}
		 */
		let from = oldFrom || getHeightWithMargin(container);
		const targetHeight = open ? getHeightWithMargin(inner) : 0;

		// console.log('Animating from', from, 'to', targetHeight, '(old from:', oldFrom, ')');

		oldFrom = null;

		// If heights are equal, just set final state directly
		if (Math.round(from) === Math.round(targetHeight)) {
			container.style.height = open && inner ? 'auto' : '0px';
			return;
		}

		// Set starting height explicitly and force reflow
		container.style.height = `${from}px`;
		container.getBoundingClientRect(); // force reflow
		container.style.height = `${targetHeight}px`;

		// Handle transition end
		const onEnd = (/** @type {{ propertyName: string; }} */ e) => {
			if (e.propertyName === 'height') {
				container.removeEventListener('transitionend', onEnd);
				// if (open && inner) container.style.height = 'auto';
				currentTransitionEndHandler = null;
				oldFrom = targetHeight;
			}
		};

		container.addEventListener('transitionend', onEnd);
		currentTransitionEndHandler = onEnd;
	}

	// Update transition duration when it changes
	$effect(() => {
		if (!container) return;
		container.style.transition = `height ${duration}ms ease`;
	});

	// Animate when expanded state changes
	$effect(() => {
		animateTo(expanded);
	});

	// Set up ResizeObserver to handle content height changes
	/**
	 * @type {ResizeObserver}
	 */
	let resizeObserver;
	$effect(() => {
		if (!inner) return;

		if (resizeObserver) resizeObserver.disconnect();
		resizeObserver = new ResizeObserver((entries) => {
			// Only re-animate if expanded (no need to track height when collapsed)
			if (expanded) {
				animateTo(true);
			}
		});
		resizeObserver.observe(inner);

		return () => {
			if (resizeObserver) resizeObserver.disconnect();
		};
	});
</script>

<div class={`smooth-resizer ${className}`} bind:this={container}>
	<div bind:this={inner} class="smooth-resizer-inner">
		{@render children?.()}
	</div>
</div>

<style>
	.smooth-resizer {
		overflow: hidden;
		will-change: height;
		display: block;
		width: 100%;
	}

	.smooth-resizer-inner {
		display: block;
		width: 100%;
	}
</style>
