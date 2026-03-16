import type { NewsItem } from '$lib/types';
import { HOTSPOT_ANALYSIS_WINDOW_MS } from './constants';

export interface LocationCandidate {
	key: string;
	query: string;
	displayName: string;
	mentions: number;
	alertMentions: number;
	recentMentions: number;
	sourceDiversity: number;
	lastSeenAt: number;
	matchedItems: NewsItem[];
}

interface CandidateAccumulator {
	key: string;
	query: string;
	displayName: string;
	mentions: number;
	alertMentions: number;
	recentMentions: number;
	aliasHits: number;
	titleCaseHits: number;
	lastSeenAt: number;
	sourceSet: Set<string>;
	matchedItems: NewsItem[];
	seenItemIds: Set<string>;
}

type CandidateSource = 'alias' | 'title-case';

interface ExtractedCandidate {
	value: string;
	source: CandidateSource;
}

const RECENT_WINDOW_MS = HOTSPOT_ANALYSIS_WINDOW_MS;
const MIN_CANDIDATE_LENGTH = 3;
const MAX_CANDIDATE_LENGTH = 48;

const LOCATION_ALIASES: Record<string, string> = {
	'us': 'United States',
	'u.s': 'United States',
	'u.s.': 'United States',
	'usa': 'United States',
	'america': 'United States',
	'uk': 'United Kingdom',
	'u.k': 'United Kingdom',
	'u.k.': 'United Kingdom',
	'uae': 'United Arab Emirates',
	'eu': 'European Union',
	'dprk': 'North Korea',
	'north korean': 'North Korea',
	'taiwan strait': 'Taiwan Strait',
	'south china sea': 'South China Sea',
	'gaza strip': 'Gaza',
	'west bank': 'West Bank',
	'washington dc': 'Washington',
	'd.c.': 'Washington',
	'nyc': 'New York',
	'la': 'Los Angeles',
	'st petersburg': 'Saint Petersburg',
	'ivory coast': 'Cote d Ivoire',
	'burma': 'Myanmar'
};

const STOPWORDS = new Set([
	'the',
	'a',
	'an',
	'and',
	'or',
	'for',
	'with',
	'from',
	'about',
	'after',
	'before',
	'during',
	'while',
	'new',
	'latest',
	'breaking',
	'update',
	'live',
	'exclusive',
	'analysis',
	'global',
	'world',
	'news',
	'market',
	'markets',
	'white house',
	'federal reserve',
	'congress',
	'senate',
	'president',
	'prime minister',
	'leader',
	'leaders',
	'stocks',
	'opposition'
]);

const NOISY_TITLE_TOKENS = new Set([
	'why',
	'what',
	'when',
	'where',
	'who',
	'how',
	'leader',
	'leaders',
	'stock',
	'stocks',
	'opposition',
	'group',
	'global',
	'americas',
	'europe',
	'apac',
	'mena',
	'africa',
	'world'
]);

const BROAD_REGION_TERMS = new Set(['americas', 'europe', 'apac', 'mena', 'africa', 'world']);

const TRUSTED_SINGLE_MENTION_LOCATIONS = new Set(
	Array.from(new Set(Object.values(LOCATION_ALIASES).map((value) => value.toLowerCase())))
);

function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSpaces(input: string): string {
	return input.replace(/\s+/g, ' ').trim();
}

function stripEdgePunctuation(input: string): string {
	return input.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
}

function normalizeCandidate(raw: string): string {
	const normalized = normalizeSpaces(stripEdgePunctuation(raw));
	return normalized.replace(/["'`]/g, '');
}

export function canonicalizeLocationName(raw: string): string {
	const normalized = normalizeCandidate(raw);
	if (!normalized) return '';
	const lower = normalized.toLowerCase();
	return LOCATION_ALIASES[lower] ?? normalized;
}

function buildLocationKey(raw: string): string {
	return canonicalizeLocationName(raw).toLowerCase();
}

function isLikelyLocation(value: string): boolean {
	if (!value) return false;
	if (value.length < MIN_CANDIDATE_LENGTH || value.length > MAX_CANDIDATE_LENGTH) return false;
	if (/\d/.test(value)) return false;

	const lowerValue = value.toLowerCase();
	if (STOPWORDS.has(lowerValue)) return false;
	if (BROAD_REGION_TERMS.has(lowerValue)) return false;

	const tokens = value.split(' ');
	const tokenLowers = tokens.map((token) => token.toLowerCase());
	if (tokens.length > 4) return false;
	if (tokens.every((token) => token.length <= 1)) return false;
	if (tokens.length === 1 && NOISY_TITLE_TOKENS.has(tokenLowers[0])) return false;
	return true;
}

function extractAliasMatches(text: string): string[] {
	const matches: string[] = [];

	for (const [alias, target] of Object.entries(LOCATION_ALIASES)) {
		const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi');
		if (pattern.test(text)) {
			matches.push(target);
		}
	}

	return matches;
}

function extractTitleCasePhrases(text: string): string[] {
	const matches = text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2}\b/g);
	if (!matches) return [];
	return matches;
}

function extractCandidatesFromItem(item: NewsItem): ExtractedCandidate[] {
	const headlineText = item.title;
	const contextText = `${item.title}. ${item.description ?? ''}`;
	const candidates: ExtractedCandidate[] = [];
	const seen = new Set<string>();

	for (const aliasMatch of extractAliasMatches(contextText)) {
		const key = buildLocationKey(aliasMatch);
		if (!key || seen.has(`alias:${key}`)) continue;
		seen.add(`alias:${key}`);
		candidates.push({ value: aliasMatch, source: 'alias' });
	}

	for (const phrase of extractTitleCasePhrases(headlineText)) {
		const key = buildLocationKey(phrase);
		if (!key || seen.has(`title:${key}`)) continue;
		seen.add(`title:${key}`);
		candidates.push({ value: phrase, source: 'title-case' });
	}

	return candidates;
}

function upsertCandidate(
	accumulator: Map<string, CandidateAccumulator>,
	item: NewsItem,
	rawName: string,
	source: CandidateSource
): void {
	const canonicalName = canonicalizeLocationName(rawName);
	if (!isLikelyLocation(canonicalName)) return;

	const key = buildLocationKey(canonicalName);
	if (!key) return;

	let entry = accumulator.get(key);
	if (!entry) {
		entry = {
			key,
			query: canonicalName,
			displayName: canonicalName,
			mentions: 0,
			alertMentions: 0,
			recentMentions: 0,
			aliasHits: 0,
			titleCaseHits: 0,
			lastSeenAt: item.timestamp,
			sourceSet: new Set<string>(),
			matchedItems: [],
			seenItemIds: new Set<string>()
		};
		accumulator.set(key, entry);
	}

	if (source === 'alias') {
		entry.aliasHits += 1;
	} else {
		entry.titleCaseHits += 1;
	}

	entry.lastSeenAt = Math.max(entry.lastSeenAt, item.timestamp);
	entry.sourceSet.add(item.source);

	if (entry.seenItemIds.has(item.id)) {
		return;
	}

	entry.seenItemIds.add(item.id);
	entry.matchedItems.push(item);
	entry.mentions += 1;
	if (item.isAlert) entry.alertMentions += 1;
	if (Date.now() - item.timestamp < RECENT_WINDOW_MS) entry.recentMentions += 1;
}

function isTrustedCandidate(entry: CandidateAccumulator): boolean {
	const lowerQuery = entry.query.toLowerCase();
	if (BROAD_REGION_TERMS.has(lowerQuery)) {
		return false;
	}

	if (entry.aliasHits > 0) {
		return true;
	}

	if (entry.mentions >= 2 || entry.sourceSet.size >= 2) {
		return true;
	}

	if (TRUSTED_SINGLE_MENTION_LOCATIONS.has(lowerQuery) && entry.recentMentions > 0) {
		return true;
	}

	const singleWord = entry.query.split(' ').length === 1;
	if (singleWord && NOISY_TITLE_TOKENS.has(lowerQuery)) {
		return false;
	}

	return false;
}

export function extractLocationCandidates(newsItems: NewsItem[]): LocationCandidate[] {
	const accumulator = new Map<string, CandidateAccumulator>();

	for (const item of newsItems) {
		for (const candidate of extractCandidatesFromItem(item)) {
			upsertCandidate(accumulator, item, candidate.value, candidate.source);
		}
	}

	return Array.from(accumulator.values())
		.map((entry) => ({
			key: entry.key,
			query: entry.query,
			displayName: entry.displayName,
			mentions: entry.mentions,
			alertMentions: entry.alertMentions,
			recentMentions: entry.recentMentions,
			sourceDiversity: entry.sourceSet.size,
			lastSeenAt: entry.lastSeenAt,
			matchedItems: entry.matchedItems
		}))
		.filter((entry) => entry.mentions > 0 && isTrustedCandidate(accumulator.get(entry.key)!))
		.sort((a, b) => {
			if (b.alertMentions !== a.alertMentions) return b.alertMentions - a.alertMentions;
			if (b.recentMentions !== a.recentMentions) return b.recentMentions - a.recentMentions;
			if (b.mentions !== a.mentions) return b.mentions - a.mentions;
			return b.sourceDiversity - a.sourceDiversity;
		});
}
