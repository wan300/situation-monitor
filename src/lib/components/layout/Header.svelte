<script lang="ts">
	import { isRefreshing, lastRefresh, language, ui, setLanguage, LANGUAGE_OPTIONS } from '$lib/stores';

	interface Props {
		onSettingsClick?: () => void;
	}

	let { onSettingsClick }: Props = $props();

	const lastRefreshText = $derived(
		$lastRefresh
			? $ui.header.lastUpdated(
					new Date($lastRefresh).toLocaleTimeString($language, {
						hour: 'numeric',
						minute: '2-digit'
					})
				)
			: $ui.header.neverRefreshed
	);
</script>

<header class="header">
	<div class="header-left">
		<h1 class="logo">{$ui.header.title}</h1>
	</div>

	<div class="header-center">
		<div class="refresh-status">
			{#if $isRefreshing}
				<span class="status-text loading">{$ui.header.refreshing}</span>
			{:else}
				<span class="status-text">{lastRefreshText}</span>
			{/if}
		</div>
	</div>

	<div class="header-right">
		<div class="language-toggle" aria-label={$ui.header.language}>
			{#each LANGUAGE_OPTIONS as option}
				<button
					type="button"
					class="language-btn"
					class:active={$language === option.value}
					onclick={() => setLanguage(option.value)}
					title={option.label}
				>
					{option.shortLabel}
				</button>
			{/each}
		</div>
		<button class="header-btn settings-btn" onclick={onSettingsClick} title={$ui.header.settings}>
			<span class="btn-icon">⚙</span>
			<span class="btn-label">{$ui.header.settings}</span>
		</button>
	</div>
</header>

<style>
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 100;
		gap: 1rem;
	}

	.header-left {
		display: flex;
		align-items: baseline;
		flex-shrink: 0;
	}

	.logo {
		font-size: 0.9rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--text-primary);
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.header-center {
		display: flex;
		align-items: center;
		flex: 1;
		justify-content: center;
		min-width: 0;
	}

	.refresh-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-text {
		font-size: 0.6rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.status-text.loading {
		color: var(--accent);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.language-toggle {
		display: inline-flex;
		align-items: center;
		padding: 0.15rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border);
		border-radius: 999px;
	}

	.language-btn {
		min-width: 2.2rem;
		height: 2rem;
		padding: 0 0.6rem;
		background: transparent;
		border: none;
		border-radius: 999px;
		color: var(--text-secondary);
		font-size: 0.6rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.language-btn.active {
		background: rgba(var(--accent-rgb), 0.18);
		color: var(--accent);
	}

	.language-btn:hover {
		color: var(--text-primary);
	}

	.header-btn {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 2.75rem;
		padding: 0.4rem 0.75rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.15s ease;
		font-size: 0.65rem;
	}

	.header-btn:hover {
		background: var(--border);
		color: var(--text-primary);
	}

	.btn-icon {
		font-size: 0.8rem;
	}

	.btn-label {
		display: none;
	}

	@media (min-width: 768px) {
		.btn-label {
			display: inline;
		}
	}
</style>
