/**
 * Miscellaneous API functions for specialized panels
 * Uses live external APIs with resilient parsing and graceful fallbacks.
 */

import { fetchWithProxy, logger } from '$lib/config/api';

export interface Prediction {
	id: string;
	question: string;
	yes: number;
	volume: string | number;
}

export interface WhaleTransaction {
	coin: string;
	amount: number;
	usd: number;
	hash: string;
}

export interface Contract {
	agency: string;
	description: string;
	vendor: string;
	amount: number;
}

export interface Layoff {
	company: string;
	count?: number;
	title: string;
	date: string;
}

interface PolymarketMarket {
	id?: string | number;
	question?: string;
	volume?: string | number;
	volumeNum?: number;
	outcomes?: string | string[];
	outcomePrices?: string | string[];
	lastTradePrice?: number | string;
}

interface BlockchainOutput {
	value?: number;
}

interface BlockchainTx {
	hash?: string;
	time?: number;
	out?: BlockchainOutput[];
}

interface BlockchainUnconfirmedResponse {
	txs?: BlockchainTx[];
}

interface UsaSpendingResponse {
	results?: Array<{
		'Awarding Agency'?: string;
		'Description'?: string;
		'Recipient Name'?: string;
		'Award Amount'?: number;
	}>;
}

interface GdeltArticle {
	title?: string;
	domain?: string;
	seendate?: string;
}

interface GdeltResponse {
	articles?: GdeltArticle[];
}

const POLYMARKET_MARKETS_URL =
	'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=40';

const BLOCKCHAIN_UNCONFIRMED_URL = 'https://blockchain.info/unconfirmed-transactions?format=json';

const COINGECKO_BTC_URL =
	'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';

const USA_SPENDING_SEARCH_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

const LAYOFFS_GDELT_QUERY =
	'(layoffs OR "job cuts" OR downsizing OR "workforce reduction") sourcelang:english';

function parseJsonArray(input: unknown): string[] {
	if (Array.isArray(input)) {
		return input.map((v) => String(v));
	}

	if (typeof input === 'string') {
		try {
			const parsed = JSON.parse(input) as unknown;
			if (Array.isArray(parsed)) {
				return parsed.map((v) => String(v));
			}
		} catch {
			return [];
		}
	}

	return [];
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}

	return null;
}

function clampPercent(value: number): number {
	if (value < 0) return 0;
	if (value > 100) return 100;
	return Math.round(value);
}

function parseYesProbability(market: PolymarketMarket): number {
	const outcomes = parseJsonArray(market.outcomes).map((o) => o.trim().toLowerCase());
	const prices = parseJsonArray(market.outcomePrices)
		.map((p) => Number(p))
		.filter((p) => Number.isFinite(p));

	const yesIndex = outcomes.findIndex((o) => o === 'yes');
	if (yesIndex >= 0 && prices[yesIndex] !== undefined) {
		return clampPercent(prices[yesIndex] * 100);
	}

	const lastTradePrice = toFiniteNumber(market.lastTradePrice);
	if (lastTradePrice !== null) {
		if (lastTradePrice <= 1) {
			return clampPercent(lastTradePrice * 100);
		}
		return clampPercent(lastTradePrice);
	}

	return 50;
}

function normalizeVolume(market: PolymarketMarket): number {
	const volume = toFiniteNumber(market.volumeNum) ?? toFiniteNumber(market.volume) ?? 0;
	return Math.max(0, volume);
}

function shortHash(hash: string): string {
	if (hash.length <= 20) return hash;
	return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function parseGdeltDate(dateStr: string): Date {
	const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
	if (!match) return new Date(dateStr);

	const [, y, m, d, h, min, s] = match;
	return new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`);
}

function toTitleCase(input: string): string {
	return input
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
}

function inferCompanyFromDomain(domain?: string): string {
	if (!domain) return 'Unknown Company';

	const root = domain.toLowerCase().replace(/^www\./, '').split('.')[0] || 'unknown';
	return toTitleCase(root.replace(/[-_]/g, ' '));
}

function extractCompany(title: string, domain?: string): string {
	const clean = title.replace(/[|:]/g, ' ').replace(/\s+/g, ' ').trim();

	const pattern1 = clean.match(
		/^([A-Z][A-Za-z0-9&.'\-\s]{1,45}?)\s+(?:to|plans|plan|announces|announced|cuts?|cutting|layoffs?|reduces|reducing|slashes|slashing|eliminates|eliminating)\b/i
	);
	if (pattern1?.[1]) {
		return pattern1[1].trim();
	}

	const pattern2 = clean.match(/\b(?:at|from)\s+([A-Z][A-Za-z0-9&.'\-\s]{1,45})\b/i);
	if (pattern2?.[1]) {
		return pattern2[1].trim();
	}

	return inferCompanyFromDomain(domain);
}

function extractLayoffCount(title: string): number | undefined {
	const normalized = title.replace(/,/g, '');

	const match = normalized.match(/(\d{2,6})(\+)?\s*(?:employees?|jobs?|workers?|staff|roles?)\b/i);
	if (match?.[1]) {
		const value = Number(match[1]);
		if (Number.isFinite(value) && value > 0) {
			return value;
		}
	}

	const shortKMatch = normalized.match(/(\d{1,3}(?:\.\d+)?)\s*k\s*(?:employees?|jobs?|workers?|staff|roles?)\b/i);
	if (shortKMatch?.[1]) {
		const value = Number(shortKMatch[1]);
		if (Number.isFinite(value) && value > 0) {
			return Math.round(value * 1000);
		}
	}

	return undefined;
}

/**
 * Fetch Polymarket predictions
 * Uses Polymarket Gamma API via proxy (browser CORS-safe path)
 */
export async function fetchPolymarket(): Promise<Prediction[]> {
	try {
		const response = await fetchWithProxy(POLYMARKET_MARKETS_URL);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const markets = (await response.json()) as PolymarketMarket[];
		if (!Array.isArray(markets)) return [];

		return markets
			.map((market, index) => {
				const id = String(market.id ?? `pm-${index}`);
				const question = (market.question || '').trim();
				const yes = parseYesProbability(market);
				const volume = normalizeVolume(market);

				return { id, question, yes, volume };
			})
			.filter((m) => m.question.length > 0)
			.sort((a, b) => b.volume - a.volume)
			.slice(0, 10);
	} catch (error) {
		logger.error('Misc API', 'Error fetching Polymarket data:', error);
		return [];
	}
}

/**
 * Fetch whale transactions
 * Uses public blockchain mempool data + BTC spot price
 */
export async function fetchWhaleTransactions(): Promise<WhaleTransaction[]> {
	try {
		const [txResp, btcPriceResp] = await Promise.all([
			fetch(BLOCKCHAIN_UNCONFIRMED_URL),
			fetchWithProxy(COINGECKO_BTC_URL)
		]);

		if (!txResp.ok) {
			throw new Error(`Blockchain HTTP ${txResp.status}: ${txResp.statusText}`);
		}

		const txData = (await txResp.json()) as BlockchainUnconfirmedResponse;
		const txs = Array.isArray(txData.txs) ? txData.txs : [];

		let btcUsd = 0;
		if (btcPriceResp.ok) {
			const btcPriceData = (await btcPriceResp.json()) as { bitcoin?: { usd?: number } };
			btcUsd = btcPriceData.bitcoin?.usd ?? 0;
		}

		const mapped = txs
			.map((tx) => {
				const sats = (tx.out || []).reduce((sum, out) => sum + (out.value || 0), 0);
				const amountBtc = sats / 1e8;
				const usd = btcUsd > 0 ? amountBtc * btcUsd : 0;

				return {
					coin: 'BTC',
					amount: amountBtc,
					usd,
					hash: tx.hash || '',
					time: tx.time || 0
				};
			})
			.filter((tx) => tx.amount >= 25)
			.sort((a, b) => b.amount - a.amount)
			.slice(0, 10)
			.map((tx) => ({
				coin: tx.coin,
				amount: Math.round(tx.amount * 100) / 100,
				usd: Math.round(tx.usd),
				hash: shortHash(tx.hash)
			}));

		return mapped;
	} catch (error) {
		logger.error('Misc API', 'Error fetching whale transactions:', error);
		return [];
	}
}

/**
 * Fetch government contracts
 * Uses USAspending award search API (contracts only)
 */
export async function fetchGovContracts(): Promise<Contract[]> {
	try {
		const now = new Date();
		const yearStart = `${now.getUTCFullYear()}-01-01`;
		const yearEnd = `${now.getUTCFullYear()}-12-31`;

		const body = {
			filters: {
				award_type_codes: ['A', 'B', 'C', 'D'],
				time_period: [{ start_date: yearStart, end_date: yearEnd }]
			},
			fields: ['Awarding Agency', 'Description', 'Recipient Name', 'Award Amount'],
			limit: 10,
			sort: 'Award Amount',
			order: 'desc'
		};

		const response = await fetch(USA_SPENDING_SEARCH_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = (await response.json()) as UsaSpendingResponse;
		const results = Array.isArray(data.results) ? data.results : [];

		return results
			.map((item) => ({
				agency: item['Awarding Agency'] || 'Unknown Agency',
				description: item['Description'] || 'No description provided',
				vendor: item['Recipient Name'] || 'Unknown Recipient',
				amount: item['Award Amount'] || 0
			}))
			.filter((item) => item.amount > 0);
	} catch (error) {
		logger.error('Misc API', 'Error fetching government contracts:', error);
		return [];
	}
}

/**
 * Fetch layoffs data
 * Uses GDELT news API via proxy with layoffs-focused query
 */
export async function fetchLayoffs(): Promise<Layoff[]> {
	try {
		const query = encodeURIComponent(LAYOFFS_GDELT_QUERY);
		const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&timespan=30d&mode=artlist&maxrecords=40&format=json&sort=date`;

		const response = await fetchWithProxy(gdeltUrl);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = (await response.json()) as GdeltResponse;
		const articles = Array.isArray(data.articles) ? data.articles : [];

		const layoffs = articles
			.map((article): Layoff | null => {
				const title = (article.title || '').trim();
				if (!title) return null;

				const parsedDate = article.seendate ? parseGdeltDate(article.seendate) : new Date();
				const company = extractCompany(title, article.domain);
				const count = extractLayoffCount(title);

				return {
					company,
					count,
					title,
					date: parsedDate.toISOString()
				};
			})
			.filter((item): item is Layoff => item !== null);

		// De-duplicate by company + title
		const deduped = new Map<string, Layoff>();
		for (const item of layoffs) {
			const key = `${item.company.toLowerCase()}::${item.title.toLowerCase()}`;
			if (!deduped.has(key)) {
				deduped.set(key, item);
			}
		}

		return Array.from(deduped.values()).slice(0, 12);
	} catch (error) {
		logger.error('Misc API', 'Error fetching layoffs data:', error);
		return [];
	}
}
