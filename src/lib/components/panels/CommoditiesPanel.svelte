<script lang="ts">
	import { Panel, MarketItem } from '$lib/components/common';
	import { commodities, vix, ui } from '$lib/stores';

	const items = $derived($commodities.items);
	const loading = $derived($commodities.loading);
	const error = $derived($commodities.error);

	// VIX status for panel header
	const vixStatusKey = $derived(getVixStatusKey($vix?.price));
	const vixStatus = $derived(vixStatusKey ? $ui.panels.commodities.status[vixStatusKey] : '');
	const vixClass = $derived(getVixClass($vix?.price));

	function getVixStatusKey(level: number | undefined): 'highFear' | 'elevated' | 'low' | null {
		if (level === undefined) return null;
		if (level >= 30) return 'highFear';
		if (level >= 20) return 'elevated';
		return 'low';
	}

	function getVixClass(level: number | undefined): string {
		if (level === undefined) return '';
		if (level >= 30) return 'critical';
		if (level >= 20) return 'elevated';
		return 'monitoring';
	}
</script>

<Panel
	id="commodities"
	title={$ui.panels.commodities.title}
	status={vixStatus}
	statusClass={vixClass}
	{loading}
	{error}
>
	{#if items.length === 0 && !loading && !error}
		<div class="empty-state">{$ui.panels.commodities.empty}</div>
	{:else}
		<div class="commodities-list">
			{#each items as item (item.symbol)}
				<MarketItem {item} currencySymbol={item.symbol === '^VIX' ? '' : '$'} />
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.commodities-list {
		display: flex;
		flex-direction: column;
	}

	.empty-state {
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.7rem;
		padding: 1rem;
	}
</style>
