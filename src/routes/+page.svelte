<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { Header, Dashboard } from '$lib/components/layout';
	import { SettingsModal, MonitorFormModal, OnboardingModal } from '$lib/components/modals';
	import {
		NewsPanel,
		MarketsPanel,
		HeatmapPanel,
		CommoditiesPanel,
		CryptoPanel,
		MainCharPanel,
		CorrelationPanel,
		NarrativePanel,
		MonitorsPanel,
		MapPanel,
		WhalePanel,
		PolymarketPanel,
		ContractsPanel,
		LayoffsPanel,
		IntelPanel,
		SituationPanel,
		WorldLeadersPanel,
		PrinterPanel,
		FedPanel
	} from '$lib/components/panels';
	import {
		news,
		markets,
		monitors,
		settings,
		refresh,
		allNewsItems,
		fedIndicators,
		fedNews,
		language,
		ui,
		hotspotsStore
	} from '$lib/stores';
	import {
		fetchNewsSnapshot,
		fetchAllMarkets,
		fetchPolymarket,
		fetchWhaleTransactions,
		fetchGovContracts,
		fetchLayoffs,
		fetchWorldLeaders,
		fetchFedIndicators,
		fetchFedNews,
		fetchFedBalanceSheet
	} from '$lib/api';
	import type { Prediction, WhaleTransaction, Contract, Layoff, FedBalanceSheet } from '$lib/api';
	import type { CustomMonitor, WorldLeader } from '$lib/types';
	import type { PanelId } from '$lib/config';
	import { getNewsPanelTitle, getSituationCopy } from '$lib/i18n';

	// Modal state
	let settingsOpen = $state(false);
	let monitorFormOpen = $state(false);
	let onboardingOpen = $state(false);
	let editingMonitor = $state<CustomMonitor | null>(null);

	// Misc panel data
	let predictions = $state<Prediction[]>([]);
	let whales = $state<WhaleTransaction[]>([]);
	let contracts = $state<Contract[]>([]);
	let layoffs = $state<Layoff[]>([]);
	let leaders = $state<WorldLeader[]>([]);
	let leadersLoading = $state(false);
	let printerData = $state<FedBalanceSheet | null>(null);
	let printerLoading = $state(false);
	let loadedLanguageForHotspots = $state<string | null>(null);

	const CLIENT_FETCH_INTERVAL_MS = 60 * 60 * 1000;
	const CLIENT_CACHE_PREFIX = 'sm-panel-cache';

	interface CacheEnvelope<T> {
		timestamp: number;
		data: T;
	}

	interface MiscCachePayload {
		predictions: Prediction[];
		whales: WhaleTransaction[];
		contracts: Contract[];
		layoffs: Layoff[];
	}

	interface FedCachePayload {
		indicators: Awaited<ReturnType<typeof fetchFedIndicators>>;
		news: Awaited<ReturnType<typeof fetchFedNews>>;
		balanceSheet: FedBalanceSheet;
	}

	function readFreshCache<T>(key: string, maxAgeMs: number): T | null {
		if (!browser) {
			return null;
		}

		try {
			const raw = localStorage.getItem(`${CLIENT_CACHE_PREFIX}:${key}`);
			if (!raw) {
				return null;
			}

			const parsed = JSON.parse(raw) as CacheEnvelope<T>;
			if (!parsed?.timestamp) {
				return null;
			}

			if (Date.now() - parsed.timestamp > maxAgeMs) {
				return null;
			}

			return parsed.data;
		} catch {
			return null;
		}
	}

	function writeCache<T>(key: string, data: T): void {
		if (!browser) {
			return;
		}

		try {
			const payload: CacheEnvelope<T> = {
				timestamp: Date.now(),
				data
			};
			localStorage.setItem(`${CLIENT_CACHE_PREFIX}:${key}`, JSON.stringify(payload));
		} catch (error) {
			console.warn(`Failed to persist cache for ${key}:`, error);
		}
	}

	// Data fetching
	async function loadNews() {
		// Set loading for all categories
		const categories = ['politics', 'tech', 'finance', 'gov', 'ai', 'intel'] as const;
		categories.forEach((cat) => news.setLoading(cat, true));

		try {
			const snapshot = await fetchNewsSnapshot(20);
			for (const category of categories) {
				news.setItems(category, snapshot.categories[category] ?? []);
			}
		} catch (error) {
			categories.forEach((cat) => news.setError(cat, String(error)));
		}
	}

	async function loadMarkets() {
		try {
			const cached = readFreshCache<Awaited<ReturnType<typeof fetchAllMarkets>>>(
				'markets',
				CLIENT_FETCH_INTERVAL_MS
			);
			if (cached) {
				markets.setIndices(cached.indices);
				markets.setSectors(cached.sectors);
				markets.setCommodities(cached.commodities);
				markets.setCrypto(cached.crypto);
				return;
			}

			const data = await fetchAllMarkets();
			markets.setIndices(data.indices);
			markets.setSectors(data.sectors);
			markets.setCommodities(data.commodities);
			markets.setCrypto(data.crypto);
			writeCache('markets', data);
		} catch (error) {
			console.error('Failed to load markets:', error);
		}
	}

	async function loadMiscData() {
		try {
			const cached = readFreshCache<MiscCachePayload>('misc', CLIENT_FETCH_INTERVAL_MS);
			if (cached) {
				predictions = cached.predictions;
				whales = cached.whales;
				contracts = cached.contracts;
				layoffs = cached.layoffs;
				return;
			}

			const [predictionsData, whalesData, contractsData, layoffsData] = await Promise.all([
				fetchPolymarket(),
				fetchWhaleTransactions(),
				fetchGovContracts(),
				fetchLayoffs()
			]);
			predictions = predictionsData;
			whales = whalesData;
			contracts = contractsData;
			layoffs = layoffsData;
			writeCache('misc', {
				predictions: predictionsData,
				whales: whalesData,
				contracts: contractsData,
				layoffs: layoffsData
			});
		} catch (error) {
			console.error('Failed to load misc data:', error);
		}
	}

	async function loadWorldLeaders() {
		if (!isPanelVisible('leaders')) return;

		const cached = readFreshCache<WorldLeader[]>('leaders', CLIENT_FETCH_INTERVAL_MS);
		if (cached) {
			leaders = cached;
			return;
		}

		leadersLoading = true;
		try {
			leaders = await fetchWorldLeaders();
			writeCache('leaders', leaders);
		} catch (error) {
			console.error('Failed to load world leaders:', error);
		} finally {
			leadersLoading = false;
		}
	}

	async function loadFedData() {
		if (!isPanelVisible('fed') && !isPanelVisible('printer')) return;

		const cached = readFreshCache<FedCachePayload>('fed', CLIENT_FETCH_INTERVAL_MS);
		if (cached) {
			fedIndicators.setData(cached.indicators);
			fedNews.setItems(cached.news);
			if (isPanelVisible('printer')) {
				printerData = cached.balanceSheet;
			}
			return;
		}

		fedIndicators.setLoading(true);
		fedNews.setLoading(true);
		if (isPanelVisible('printer')) printerLoading = true;
		try {
			const [indicatorsData, newsData, balanceSheetData] = await Promise.all([
				fetchFedIndicators(),
				fetchFedNews(),
				fetchFedBalanceSheet()
			]);
			fedIndicators.setData(indicatorsData);
			fedNews.setItems(newsData);
			printerData = balanceSheetData;
			writeCache('fed', {
				indicators: indicatorsData,
				news: newsData,
				balanceSheet: balanceSheetData
			});
		} catch (error) {
			console.error('Failed to load Fed data:', error);
			fedIndicators.setError(String(error));
			fedNews.setError(String(error));
		} finally {
			printerLoading = false;
		}
	}

	// Refresh handlers
	async function handleRefresh() {
		refresh.startRefresh();
		try {
			await Promise.all([loadNews(), loadMarkets()]);
			// Hotspots depend on fresh news, so load after news completes
			hotspotsStore.load();
			refresh.endRefresh();
		} catch (error) {
			refresh.endRefresh([String(error)]);
		}
	}

	// Monitor handlers
	function handleCreateMonitor() {
		editingMonitor = null;
		monitorFormOpen = true;
	}

	function handleEditMonitor(monitor: CustomMonitor) {
		editingMonitor = monitor;
		monitorFormOpen = true;
	}

	function handleDeleteMonitor(id: string) {
		monitors.deleteMonitor(id);
	}

	function handleToggleMonitor(id: string) {
		monitors.toggleMonitor(id);
	}

	// Get panel visibility
	function isPanelVisible(id: PanelId): boolean {
		return $settings.enabled[id] !== false;
	}

	// Handle preset selection from onboarding
	function handleSelectPreset(presetId: string) {
		settings.applyPreset(presetId);
		onboardingOpen = false;
		// Refresh data after applying preset
		handleRefresh();
	}

	// Show onboarding again (called from settings)
	function handleReconfigure() {
		settingsOpen = false;
		settings.resetOnboarding();
		onboardingOpen = true;
	}

	// Initial load
	onMount(() => {
		// Check if first visit
		if (!settings.isOnboardingComplete()) {
			onboardingOpen = true;
		}

		// Load initial data and track as refresh
		async function initialLoad() {
			refresh.startRefresh();
			try {
				await Promise.all([
					loadNews(),
					loadMarkets(),
					loadMiscData(),
					loadWorldLeaders(),
					loadFedData()
				]);
				// Load dynamic hotspots after news is ready
				hotspotsStore.load();
				refresh.endRefresh();
			} catch (error) {
				refresh.endRefresh([String(error)]);
			}
		}
		initialLoad();
		refresh.setupAutoRefresh(handleRefresh);

		return () => {
			refresh.stopAutoRefresh();
		};
	});

	$effect(() => {
		const currentLanguage = $language;
		if (!browser) {
			return;
		}

		if (loadedLanguageForHotspots === null) {
			loadedLanguageForHotspots = currentLanguage;
			return;
		}

		if (loadedLanguageForHotspots !== currentLanguage) {
			loadedLanguageForHotspots = currentLanguage;
			hotspotsStore.load({ forceRefresh: true });
		}
	});
</script>

<svelte:head>
	<title>{$ui.meta.title}</title>
	<meta name="description" content={$ui.meta.description} />
</svelte:head>

<div class="app">
	<Header onSettingsClick={() => (settingsOpen = true)} />

	<main class="main-content">
		<Dashboard>
			<!-- Map Panel - Full width -->
			{#if isPanelVisible('map')}
				<div class="panel-slot map-slot">
					<MapPanel monitors={$monitors.monitors} />
				</div>
			{/if}

			<!-- News Panels -->
			{#if isPanelVisible('politics')}
				<div class="panel-slot">
					<NewsPanel
						category="politics"
						panelId="politics"
						title={getNewsPanelTitle('politics', $language)}
					/>
				</div>
			{/if}

			{#if isPanelVisible('tech')}
				<div class="panel-slot">
					<NewsPanel category="tech" panelId="tech" title={getNewsPanelTitle('tech', $language)} />
				</div>
			{/if}

			{#if isPanelVisible('finance')}
				<div class="panel-slot">
					<NewsPanel
						category="finance"
						panelId="finance"
						title={getNewsPanelTitle('finance', $language)}
					/>
				</div>
			{/if}

			{#if isPanelVisible('gov')}
				<div class="panel-slot">
					<NewsPanel category="gov" panelId="gov" title={getNewsPanelTitle('gov', $language)} />
				</div>
			{/if}

			{#if isPanelVisible('ai')}
				<div class="panel-slot">
					<NewsPanel category="ai" panelId="ai" title={getNewsPanelTitle('ai', $language)} />
				</div>
			{/if}

			<!-- Markets Panels -->
			{#if isPanelVisible('markets')}
				<div class="panel-slot">
					<MarketsPanel />
				</div>
			{/if}

			{#if isPanelVisible('heatmap')}
				<div class="panel-slot">
					<HeatmapPanel />
				</div>
			{/if}

			{#if isPanelVisible('commodities')}
				<div class="panel-slot">
					<CommoditiesPanel />
				</div>
			{/if}

			{#if isPanelVisible('crypto')}
				<div class="panel-slot">
					<CryptoPanel />
				</div>
			{/if}

			<!-- Analysis Panels -->
			{#if isPanelVisible('mainchar')}
				<div class="panel-slot">
					<MainCharPanel />
				</div>
			{/if}

			{#if isPanelVisible('correlation')}
				<div class="panel-slot">
					<CorrelationPanel news={$allNewsItems} />
				</div>
			{/if}

			{#if isPanelVisible('narrative')}
				<div class="panel-slot">
					<NarrativePanel news={$allNewsItems} />
				</div>
			{/if}

			<!-- Intel Panel -->
			{#if isPanelVisible('intel')}
				<div class="panel-slot">
					<IntelPanel />
				</div>
			{/if}

			<!-- Fed Panel -->
			{#if isPanelVisible('fed')}
				<div class="panel-slot">
					<FedPanel />
				</div>
			{/if}

			<!-- World Leaders Panel -->
			{#if isPanelVisible('leaders')}
				<div class="panel-slot">
					<WorldLeadersPanel {leaders} loading={leadersLoading} />
				</div>
			{/if}

			<!-- Situation Panels -->
			{#if isPanelVisible('venezuela')}
				<div class="panel-slot">
					<SituationPanel
						panelId="venezuela"
						config={{
							title: getSituationCopy('venezuela', $language).title,
							subtitle: getSituationCopy('venezuela', $language).subtitle,
							criticalKeywords: ['maduro', 'caracas', 'venezuela', 'guaido']
						}}
						news={$allNewsItems.filter(
							(n) =>
								n.title.toLowerCase().includes('venezuela') ||
								n.title.toLowerCase().includes('maduro')
						)}
					/>
				</div>
			{/if}

			{#if isPanelVisible('greenland')}
				<div class="panel-slot">
					<SituationPanel
						panelId="greenland"
						config={{
							title: getSituationCopy('greenland', $language).title,
							subtitle: getSituationCopy('greenland', $language).subtitle,
							criticalKeywords: ['greenland', 'arctic', 'nuuk', 'denmark']
						}}
						news={$allNewsItems.filter(
							(n) =>
								n.title.toLowerCase().includes('greenland') ||
								n.title.toLowerCase().includes('arctic')
						)}
					/>
				</div>
			{/if}

			{#if isPanelVisible('iran')}
				<div class="panel-slot">
					<SituationPanel
						panelId="iran"
						config={{
							title: getSituationCopy('iran', $language).title,
							subtitle: getSituationCopy('iran', $language).subtitle,
							criticalKeywords: [
								'protest',
								'uprising',
								'revolution',
								'crackdown',
								'killed',
								'nuclear',
								'strike',
								'attack',
								'irgc',
								'khamenei'
							]
						}}
						news={$allNewsItems.filter(
							(n) =>
								n.title.toLowerCase().includes('iran') ||
								n.title.toLowerCase().includes('tehran') ||
								n.title.toLowerCase().includes('irgc')
						)}
					/>
				</div>
			{/if}

			<!-- Placeholder panels for additional data sources -->
			{#if isPanelVisible('whales')}
				<div class="panel-slot">
					<WhalePanel {whales} />
				</div>
			{/if}

			{#if isPanelVisible('polymarket')}
				<div class="panel-slot">
					<PolymarketPanel {predictions} />
				</div>
			{/if}

			{#if isPanelVisible('contracts')}
				<div class="panel-slot">
					<ContractsPanel {contracts} />
				</div>
			{/if}

			{#if isPanelVisible('layoffs')}
				<div class="panel-slot">
					<LayoffsPanel {layoffs} />
				</div>
			{/if}

			<!-- Money Printer Panel -->
			{#if isPanelVisible('printer')}
				<div class="panel-slot">
					<PrinterPanel data={printerData} loading={printerLoading} />
				</div>
			{/if}

			<!-- Custom Monitors (always last) -->
			{#if isPanelVisible('monitors')}
				<div class="panel-slot">
					<MonitorsPanel
						monitors={$monitors.monitors}
						matches={$monitors.matches}
						onCreateMonitor={handleCreateMonitor}
						onEditMonitor={handleEditMonitor}
						onDeleteMonitor={handleDeleteMonitor}
						onToggleMonitor={handleToggleMonitor}
					/>
				</div>
			{/if}
		</Dashboard>
	</main>

	<!-- Modals -->
	<SettingsModal
		open={settingsOpen}
		onClose={() => (settingsOpen = false)}
		onReconfigure={handleReconfigure}
	/>
	<MonitorFormModal
		open={monitorFormOpen}
		onClose={() => (monitorFormOpen = false)}
		editMonitor={editingMonitor}
	/>
	<OnboardingModal open={onboardingOpen} onSelectPreset={handleSelectPreset} />
</div>

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
	}

	.main-content {
		flex: 1;
		padding: 0.5rem;
		overflow-y: auto;
	}

	.map-slot {
		column-span: all;
		margin-bottom: 0.5rem;
	}

	@media (max-width: 768px) {
		.main-content {
			padding: 0.25rem;
		}
	}
</style>
