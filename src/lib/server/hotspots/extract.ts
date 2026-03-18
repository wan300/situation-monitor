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
	'government',
	'ministry',
	'minister',
	'committee',
	'cabinet',
	'court',
	'party',
	'bank',
	'fund',
	'defense',
	'security',
	'trade',
	'economy',
	'energy',
	'president',
	'prime minister',
	'leader',
	'leaders',
	'official',
	'officials',
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
	'government',
	'ministry',
	'defense',
	'security',
	'trade',
	'economy',
	'energy',
	'official',
	'officials',
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

export function isLikelyLocationName(value: string): boolean {
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
	if (!isLikelyLocationName(canonicalName)) return;

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

export interface StructuredHotspotEvent {
	item: NewsItem;
	actors: string[];
	targets: string[];
	locations: string[];
	battlefield?: string;
	conflictSignals: string[];
	interventionSignals: string[];
	spilloverSignals: string[];
	strategicSignals: string[];
	powerActors: string[];
	confidence: number;
}

export interface ExtractStructuredEventOptions {
	conflictKeywords?: string[];
	interventionKeywords?: string[];
	spilloverKeywords?: string[];
	strategicKeywords?: string[];
	majorPowers?: string[];
}

const ACTOR_TARGET_PATTERNS = [
	/^(?<actor>.+?)\s+(?:imposes?|imposed|slaps?|announces?|launch(?:es|ed)?|strikes?|attack(?:s|ed)?|bomb(?:s|ed)?|sanction(?:s|ed)?|pressures?|warn(?:s|ed)?|threaten(?:s|ed)?|backs?|support(?:s|ed)?|arm(?:s|ed)?)\s+(?:new\s+|fresh\s+|additional\s+)?(?:sanctions?\s+on\s+|on\s+|against\s+)?(?<target>.+?)(?:\s+(?:in|near|around|at)\s+(?<location>[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3}))?$/i,
	/^(?<actor>.+?)\s+(?:and|&)\s+(?<target>.+?)\s+(?:clash(?:es|ed)?|fight(?:s|ing)?|battle(?:s|d)?|exchange(?:s|d)?\s+fire|trade(?:s|d)?\s+strikes?)\s+(?:in|near|around|at)\s+(?<location>[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})/i,
	/^(?<actor>.+?)\s+(?:vs\.?|versus)\s+(?<target>.+?)(?:\s+(?:in|near|around|at)\s+(?<location>[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3}))?$/i
] as const;

const BATTLEFIELD_PATTERN =
	/\b(?:in|near|around|at|off)\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})/g;

const DEFAULT_CONFLICT_KEYWORDS = [
	'war',
	'invasion',
	'strike',
	'attack',
	'shelling',
	'offensive',
	'frontline',
	'clash',
	'battle',
	'bombardment',
	'drone strike',
	'ceasefire',
	'missile'
] as const;

const DEFAULT_INTERVENTION_KEYWORDS = [
	'sanctions',
	'pressure',
	'military aid',
	'arms package',
	'warned',
	'intervention',
	'deploy',
	'veto',
	'proxy',
	'naval patrol'
] as const;

const DEFAULT_SPILLOVER_KEYWORDS = [
	'refugee',
	'oil prices',
	'energy shock',
	'supply chain',
	'gas cutoff',
	'food prices',
	'market selloff',
	'shipping disruption',
	'export ban'
] as const;

const DEFAULT_STRATEGIC_KEYWORDS = [
	'strait',
	'chokepoint',
	'oil',
	'gas',
	'pipeline',
	'critical mineral',
	'shipping lane',
	'port'
] as const;

const DEFAULT_MAJOR_POWERS = [
	'united states',
	'us',
	'china',
	'russia',
	'united kingdom',
	'uk',
	'france',
	'eu',
	'nato',
	'india'
] as const;

function dedupeStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of values) {
		const value = normalizeSpaces(raw).trim();
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(value);
	}
	return result;
}

function splitEntityPhrase(phrase: string): string[] {
	const cleaned = phrase
		.replace(/\b(?:officials?|forces|troops|government|regime)\b/gi, '')
		.replace(/\b(?:the|an|a)\b/gi, ' ')
		.replace(/[,:;]+/g, ' ')
		.trim();

	if (!cleaned) return [];

	return dedupeStrings(
		cleaned
			.split(/\s+(?:and|&|vs\.?|versus)\s+|\//gi)
			.map((segment) => canonicalizeLocationName(segment))
			.filter((segment) => segment.length >= 2)
	);
}

function findKeywordHits(text: string, keywords: readonly string[]): string[] {
	const lower = text.toLowerCase();
	const hits: string[] = [];
	for (const keyword of keywords) {
		if (lower.includes(keyword.toLowerCase())) {
			hits.push(keyword);
		}
	}
	return hits;
}

function extractBattlefield(title: string): string | undefined {
	const matches = Array.from(title.matchAll(BATTLEFIELD_PATTERN));
	for (const match of matches) {
		const candidate = canonicalizeLocationName(match[1] ?? '');
		if (isLikelyLocationName(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

function extractActorsAndTargets(title: string): { actors: string[]; targets: string[]; location?: string } {
	for (const pattern of ACTOR_TARGET_PATTERNS) {
		const matched = title.match(pattern);
		if (!matched?.groups) {
			continue;
		}

		const actors = splitEntityPhrase(matched.groups.actor ?? '');
		const targets = splitEntityPhrase(matched.groups.target ?? '');
		const locationRaw = matched.groups.location;
		const location = locationRaw ? canonicalizeLocationName(locationRaw) : undefined;

		if (actors.length > 0 || targets.length > 0 || location) {
			return { actors, targets, location };
		}
	}

	return { actors: [], targets: [] };
}

function collectPowerActors(
	text: string,
	actors: string[],
	majorPowers: readonly string[]
): string[] {
	const hitsFromText = findKeywordHits(text, majorPowers);
	const actorHits = actors.filter((actor) =>
		majorPowers.some((power) => actor.toLowerCase().includes(power.toLowerCase()))
	);
	return dedupeStrings([...actorHits, ...hitsFromText].map((value) => canonicalizeLocationName(value)));
}

export function extractStructuredHotspotEvents(
	newsItems: NewsItem[],
	options: ExtractStructuredEventOptions = {}
): StructuredHotspotEvent[] {
	const conflictKeywords = options.conflictKeywords ?? Array.from(DEFAULT_CONFLICT_KEYWORDS);
	const interventionKeywords =
		options.interventionKeywords ?? Array.from(DEFAULT_INTERVENTION_KEYWORDS);
	const spilloverKeywords = options.spilloverKeywords ?? Array.from(DEFAULT_SPILLOVER_KEYWORDS);
	const strategicKeywords = options.strategicKeywords ?? Array.from(DEFAULT_STRATEGIC_KEYWORDS);
	const majorPowers = options.majorPowers ?? Array.from(DEFAULT_MAJOR_POWERS);

	const events: StructuredHotspotEvent[] = [];

	for (const item of newsItems) {
		const contextText = `${item.title}. ${item.description ?? ''}`;
		const conflictSignals = findKeywordHits(contextText, conflictKeywords);
		const interventionSignals = findKeywordHits(contextText, interventionKeywords);
		const spilloverSignals = findKeywordHits(contextText, spilloverKeywords);
		const strategicSignals = findKeywordHits(contextText, strategicKeywords);

		const parsed = extractActorsAndTargets(item.title);
		const extractedLocations = dedupeStrings(
			extractCandidatesFromItem(item)
				.map((candidate) => canonicalizeLocationName(candidate.value))
				.filter((candidate) => isLikelyLocationName(candidate))
		);

		const battlefield =
			parsed.location && isLikelyLocationName(parsed.location)
				? parsed.location
				: extractBattlefield(item.title);
		const locations = dedupeStrings(
			battlefield
				? [battlefield, ...extractedLocations]
				: extractedLocations
		);
		const actors = dedupeStrings(parsed.actors);
		const targets = dedupeStrings(parsed.targets);
		const powerActors = collectPowerActors(contextText, actors, majorPowers);

		const hasSignals =
			locations.length > 0 ||
			targets.length > 0 ||
			conflictSignals.length > 0 ||
			interventionSignals.length > 0 ||
			spilloverSignals.length > 0;

		if (!hasSignals) {
			continue;
		}

		let confidence = 0.2;
		if (actors.length > 0) confidence += 0.2;
		if (targets.length > 0) confidence += 0.2;
		if (battlefield) confidence += 0.2;
		if (locations.length > 0) confidence += 0.1;
		if (conflictSignals.length > 0) confidence += 0.1;
		if (powerActors.length > 0 && interventionSignals.length > 0) confidence += 0.1;
		if (spilloverSignals.length > 0) confidence += 0.05;

		events.push({
			item,
			actors,
			targets,
			locations,
			battlefield,
			conflictSignals,
			interventionSignals,
			spilloverSignals,
			strategicSignals,
			powerActors,
			confidence: Math.min(1, confidence)
		});
	}

	return events;
}
