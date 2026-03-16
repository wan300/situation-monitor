import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { NewsItem } from '$lib/types';
import { getLatestNewsSnapshot } from '$lib/server/news/ingest';
import { analyzeHotspots, filterConflictFocusedNews, scoresToHotspots } from '$lib/server/hotspots/analyze';
import {
	HOTSPOT_ANALYSIS_WINDOW_MS,
	HOTSPOT_SAMPLE_LIMIT
} from '$lib/server/hotspots/constants';
import { enrichHotspotsWithLLM } from '$lib/server/hotspots/llm';
import type { Hotspot } from '$lib/config/map';

export const prerender = false;

/** Server-side in-memory cache to reduce LLM API calls */
interface CacheEntry {
	hotspots: Hotspot[];
	updatedAt: number;
	llmEnriched: boolean;
	matchedCount: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
let cache: CacheEntry | null = null;

function isCacheValid(): boolean {
	return cache !== null && Date.now() - cache.updatedAt < CACHE_TTL_MS;
}

function filterNewsByWindow(newsItems: NewsItem[], windowMs: number): NewsItem[] {
	const cutoff = Date.now() - windowMs;
	return newsItems.filter((item) => item.timestamp >= cutoff);
}

export const GET: RequestHandler = async ({ url }) => {
	// Allow cache bypass via ?refresh=1 for testing
	const forceRefresh = url.searchParams.get('refresh') === '1';

	if (!forceRefresh && isCacheValid() && cache) {
		return json({
			hotspots: cache.hotspots,
			updatedAt: cache.updatedAt,
			llmEnriched: cache.llmEnriched,
			matchedCount: cache.matchedCount,
			cached: true
		});
	}

	try {
		// Fetch latest news from all categories
		const snapshot = await getLatestNewsSnapshot(HOTSPOT_SAMPLE_LIMIT);
		const allNews = Object.values(snapshot.categories).flat();
		const conflictFocusedNews = filterConflictFocusedNews(
			filterNewsByWindow(allNews, HOTSPOT_ANALYSIS_WINDOW_MS)
		);

		if (conflictFocusedNews.length === 0) {
			// No news data yet — return empty dynamic set
			return json({
				hotspots: [],
				updatedAt: Date.now(),
				llmEnriched: false,
				matchedCount: 0,
				cached: false
			});
		}

		// Step 1: Build dynamic hotspots from extracted + geocoded locations
		const scores = await analyzeHotspots(conflictFocusedNews);
		const dynamicHotspots = scoresToHotspots(scores);

		if (dynamicHotspots.length === 0) {
			cache = {
				hotspots: [],
				updatedAt: Date.now(),
				llmEnriched: false,
				matchedCount: 0
			};

			return json({
				hotspots: [],
				updatedAt: cache.updatedAt,
				llmEnriched: false,
				matchedCount: 0,
				cached: false
			});
		}

		// Step 2: Enrich top candidates via LLM (async, non-blocking on failure)
		const { hotspots: enrichedHotspots, enrichedCount } = await enrichHotspotsWithLLM(
			dynamicHotspots,
			scores
		);

		const matchedCount = enrichedHotspots.length;

		// Update cache
		cache = {
			hotspots: enrichedHotspots,
			updatedAt: Date.now(),
			llmEnriched: enrichedCount > 0,
			matchedCount
		};

		return json({
			hotspots: enrichedHotspots,
			updatedAt: cache.updatedAt,
			llmEnriched: cache.llmEnriched,
			matchedCount,
			cached: false
		});
	} catch (error) {
		console.error('[hotspots/analyze] failed:', error);

		// On error, prefer last successful dynamic cache to keep map usable.
		if (cache) {
			return json({
				hotspots: cache.hotspots,
				updatedAt: cache.updatedAt,
				llmEnriched: cache.llmEnriched,
				matchedCount: cache.matchedCount,
				cached: true,
				error: 'analysis_failed_fallback_cache'
			});
		}

		// No cache yet: return empty hotspot set.
		return json(
			{
				hotspots: [],
				updatedAt: Date.now(),
				llmEnriched: false,
				matchedCount: 0,
				cached: false,
				error: 'analysis_failed'
			},
			{ status: 200 }
		);
	}
};
