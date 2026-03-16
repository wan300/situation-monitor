<script lang="ts">
	import { Panel } from '$lib/components/common';
	import { formatCurrency } from '$lib/utils';
	import { language, ui } from '$lib/stores';

	interface Contract {
		agency: string;
		description: string;
		vendor: string;
		amount: number;
	}

	interface Props {
		contracts?: Contract[];
		loading?: boolean;
		error?: string | null;
	}

	let { contracts = [], loading = false, error = null }: Props = $props();

	const count = $derived(contracts.length);

	function formatValue(v: number): string {
		return formatCurrency(v, { compact: true, locale: $language, decimals: 0 });
	}
</script>

<Panel id="contracts" title={$ui.panels.contracts.title} {count} {loading} {error}>
	{#if contracts.length === 0 && !loading && !error}
		<div class="empty-state">{$ui.panels.contracts.empty}</div>
	{:else}
		<div class="contracts-list">
			{#each contracts as contract, i (contract.vendor + i)}
				<div class="contract-item">
					<div class="contract-agency">{contract.agency}</div>
					<div class="contract-desc">
						{contract.description.length > 100
							? contract.description.substring(0, 100) + '...'
							: contract.description}
					</div>
					<div class="contract-meta">
						<span class="contract-vendor">{contract.vendor}</span>
						<span class="contract-value">{formatValue(contract.amount)}</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.contracts-list {
		display: flex;
		flex-direction: column;
	}

	.contract-item {
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--border);
	}

	.contract-item:last-child {
		border-bottom: none;
	}

	.contract-agency {
		font-size: 0.55rem;
		font-weight: 600;
		color: var(--accent);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin-bottom: 0.2rem;
	}

	.contract-desc {
		font-size: 0.65rem;
		color: var(--text-primary);
		line-height: 1.3;
		margin-bottom: 0.3rem;
	}

	.contract-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.contract-vendor {
		font-size: 0.55rem;
		color: var(--text-secondary);
	}

	.contract-value {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--success);
		font-variant-numeric: tabular-nums;
	}

	.empty-state {
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.7rem;
		padding: 1rem;
	}
</style>
