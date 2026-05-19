<script>
	/**
	 * Generic action button config:
	 * {
	 *   label: string,
	 *   title?: string,
	 *   icon?: string,
	 *   class?: string,
	 *   onClick?: () => void,
	 *   visible?: boolean
	 * }
	 */

	let { actions = [] } = $props();
</script>

<div class="controls">
	{#each actions as action (action.title)}
		<button
			class={`control-btn ${action.class ?? ''}`}
			title={action.title}
			onclick={action.onClick}
			style:display={action.visible === false ? 'none' : ''}
		>
			{#if action.icon}
				<span>{action.icon}</span>
			{/if}

			{#if action.label}
				<span>{action.label}</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.controls {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.control-btn {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		padding: 8px 12px;
		border-radius: 8px;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		font-size: 14px;
		font-weight: 500;
		backdrop-filter: blur(8px);
		min-width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
	}
	.control-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.25);
		color: rgba(255, 255, 255, 0.9);
	}
	.control-btn.close-btn:hover {
		background: rgba(220, 20, 60, 0.15);
		border-color: rgba(220, 20, 60, 0.3);
		color: rgba(255, 182, 193, 1);
	}
	.control-btn.close-btn {
		background: rgba(220, 20, 60, 0.1);
		border-color: rgba(220, 20, 60, 0.2);
		color: rgba(255, 182, 193, 0.9);
	}
</style>
