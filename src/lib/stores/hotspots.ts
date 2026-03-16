/**
 * Hotspots store — manages dynamically-analysed geopolitical hotspots.
 *
 * On load, fetches from /api/hotspots/analyze which runs location extraction,
 * geocoding, scoring and optional LLM enrichment server-side.
 */

import { writable, get } from 'svelte/store';
import type { Hotspot } from '$lib/config/map';

export interface HotspotsState {
	items: Hotspot[];
	loading: boolean;
	error: string | null;
	lastUpdated: number | null;
	llmEnriched: boolean;
	matchedCount: number;
}

interface AnalyzeResponse {
	hotspots: Hotspot[];
	updatedAt: number;
	llmEnriched: boolean;
	matchedCount: number;
}

function createInitialState(): HotspotsState {
	return {
		items: [],
		loading: false,
		error: null,
		lastUpdated: null,
		llmEnriched: false,
		matchedCount: 0
	};
}

interface LoadOptions {
	forceRefresh?: boolean;
}

function createHotspotsStore() {
	const { subscribe, update } = writable<HotspotsState>(createInitialState());

	return {
		subscribe,

		/** Fetch dynamic hotspots from the server analysis endpoint. */
		async load(options: LoadOptions = {}) {
			const state = get({ subscribe });
			if (state.loading) return; // Prevent concurrent fetches

			update((s) => ({ ...s, loading: true, error: null }));

			try {
				const url = options.forceRefresh ? '/api/hotspots/analyze?refresh=1' : '/api/hotspots/analyze';
				const response = await fetch(url);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				const data = (await response.json()) as AnalyzeResponse;

				update((s) => ({
					...s,
					items: Array.isArray(data.hotspots) ? data.hotspots : [],
					loading: false,
					lastUpdated: data.updatedAt ?? Date.now(),
					llmEnriched: data.llmEnriched ?? false,
					matchedCount: data.matchedCount ?? 0
				}));
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.warn('[hotspots store] keeping last dynamic hotspots after error:', message);

				update((s) => ({
					...s,
					// Keep existing items — do not wipe on transient failures
					loading: false,
					error: message
				}));
			}
		},

		/** Reset to empty state (used for testing or manual override). */
		reset() {
			update(() => createInitialState());
		}
	};
}

export const hotspotsStore = createHotspotsStore();
