import type { NewsCategory, NewsItem } from '$lib/types';
import { FEEDS } from '$lib/config/feeds';
import { containsAlertKeyword, detectRegion, detectTopics } from '$lib/config/keywords';
import { DEFAULT_NEWS_LIMIT, NEWS_CATEGORIES, NEWS_RETENTION_DAYS } from './constants';
import { getNewsDb } from './db';
import {
	finishIngestRun,
	getNewsSnapshot,
	purgeExpiredNews,
	startIngestRun,
	upsertNewsItems,
	type NewsSnapshot
} from './storage';

interface GdeltArticle {
	title?: string;
	url?: string;
	seendate?: string;
	domain?: string;
}

interface GdeltResponse {
	articles?: GdeltArticle[];
}

const GDELT_TIMESPAN = '14d';
const GDELT_MAX_RECORDS = '60';
const CONFLICT_QUERY_TERMS =
	'(ceasefire OR airstrike OR shelling OR frontline OR insurgency OR militia OR "proxy war" OR bombardment)';

const CATEGORY_QUERIES: Record<NewsCategory, string> = {
	politics: `(politics OR government OR election OR congress OR sanctions OR military OR ${CONFLICT_QUERY_TERMS})`,
	tech: '(technology OR software OR startup OR "silicon valley")',
	finance: '(finance OR "stock market" OR economy OR banking)',
	gov: `("federal government" OR "white house" OR congress OR regulation OR defense OR sanctions OR ${CONFLICT_QUERY_TERMS})`,
	ai: '("artificial intelligence" OR "machine learning" OR AI OR ChatGPT)',
	intel: `(intelligence OR security OR military OR defense OR espionage OR covert OR ${CONFLICT_QUERY_TERMS})`
};

export interface NewsIngestSummary {
	runId: number;
	status: 'success';
	fetchedCount: number;
	prunedCount: number;
	startedAt: number;
	completedAt: number;
	categoryCounts: Record<NewsCategory, number>;
	failedCategories: Partial<Record<NewsCategory, string>>;
}

function hashCode(value: string): string {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		const charCode = value.charCodeAt(i);
		hash = (hash << 5) - hash + charCode;
		hash |= 0;
	}
	return Math.abs(hash).toString(36);
}

function parseGdeltDate(value: string | undefined): Date {
	if (!value) {
		return new Date();
	}

	const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
	if (!match) {
		const fallback = new Date(value);
		return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
	}

	const [, year, month, day, hour, minute, second] = match;
	return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
}

function createItemId(category: NewsCategory, article: GdeltArticle): string {
	const identity = article.url || `${article.title || ''}-${article.seendate || ''}`;
	return `gdelt-${category}-${hashCode(identity)}`;
}

function toNewsItem(article: GdeltArticle, category: NewsCategory): NewsItem | null {
	const title = (article.title || '').trim();
	const link = (article.url || '').trim();

	if (!title || !link) {
		return null;
	}

	const parsedDate = parseGdeltDate(article.seendate);
	const headlineAnalysis = containsAlertKeyword(title);
	const defaultSource = FEEDS[category]?.[0]?.name || 'News';

	return {
		id: createItemId(category, article),
		title,
		link,
		pubDate: article.seendate,
		timestamp: parsedDate.getTime(),
		source: article.domain || defaultSource,
		category,
		isAlert: headlineAnalysis.isAlert,
		alertKeyword: headlineAnalysis.keyword,
		region: detectRegion(title) ?? undefined,
		topics: detectTopics(title)
	};
}

async function fetchCategoryNews(category: NewsCategory): Promise<NewsItem[]> {
	const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
	url.searchParams.set('query', `${CATEGORY_QUERIES[category]} sourcelang:english`);
	url.searchParams.set('timespan', GDELT_TIMESPAN);
	url.searchParams.set('mode', 'artlist');
	url.searchParams.set('maxrecords', GDELT_MAX_RECORDS);
	url.searchParams.set('format', 'json');
	url.searchParams.set('sort', 'date');

	const response = await fetch(url.toString(), {
		headers: {
			Accept: 'application/json'
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch ${category} news: HTTP ${response.status}`);
	}

	const payload = (await response.json()) as GdeltResponse;
	if (!payload.articles || payload.articles.length === 0) {
		return [];
	}

	return payload.articles
		.map((article) => toNewsItem(article, category))
		.filter((item): item is NewsItem => item !== null);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function createCategoryCountMap(): Record<NewsCategory, number> {
	return {
		politics: 0,
		tech: 0,
		finance: 0,
		gov: 0,
		ai: 0,
		intel: 0
	};
}

export async function runNewsIngestion(): Promise<NewsIngestSummary> {
	const db = await getNewsDb();
	const runId = await startIngestRun(db);
	const startedAt = Date.now();
	const fetchedAt = Date.now();
	let fetchedCount = 0;
	const categoryCounts = createCategoryCountMap();
	const failedCategories: Partial<Record<NewsCategory, string>> = {};

	try {
		for (let i = 0; i < NEWS_CATEGORIES.length; i++) {
			const category = NEWS_CATEGORIES[i];

			try {
				const items = await fetchCategoryNews(category);
				categoryCounts[category] = items.length;
				fetchedCount += items.length;
				await upsertNewsItems(db, items, fetchedAt);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				failedCategories[category] = message;
				console.warn(`[news ingest] category ${category} failed:`, message);
			}

			if (i < NEWS_CATEGORIES.length - 1) {
				await sleep(300);
			}
		}

		if (fetchedCount === 0) {
			throw new Error('Failed to ingest news for all categories');
		}

		const prunedCount = await purgeExpiredNews(db, NEWS_RETENTION_DAYS);
		const completedAt = await finishIngestRun(db, runId, 'success', fetchedCount, null);

		return {
			runId,
			status: 'success',
			fetchedCount,
			prunedCount,
			startedAt,
			completedAt,
			categoryCounts,
			failedCategories
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		await finishIngestRun(db, runId, 'failed', fetchedCount, errorMessage);
		throw error;
	}
}

export async function getLatestNewsSnapshot(limitPerCategory = DEFAULT_NEWS_LIMIT): Promise<NewsSnapshot> {
	const db = await getNewsDb();
	return getNewsSnapshot(db, limitPerCategory);
}
