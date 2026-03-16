/**
 * Dynamic hotspot analysis engine
 *
 * Uses two scoring channels:
 * 1) Dynamic locations extracted from headlines + geocoding validation.
 * 2) Global association scoring against strategic hotspots using keyword hits
 *    and region-level diffusion weights.
 */

import type { NewsCategory, NewsItem } from '$lib/types';
import { HOTSPOTS, type Hotspot, type LocalizedText } from '$lib/config/map';
import { REGION_HOTSPOT_SPREAD, TOPIC_KEYWORDS } from '$lib/config/keywords';
import { translateMapText } from '$lib/i18n';
import { extractLocationCandidates } from './extract';
import { geocodeLocations, type GeocodedLocation } from './geocode';
import {
	HOTSPOT_ALLOWED_CATEGORIES,
	HOTSPOT_ANALYSIS_WINDOW_DAYS,
	HOTSPOT_ANALYSIS_WINDOW_MS
} from './constants';

export interface HotspotScore {
	hotspot: Hotspot;
	score: number;
	matchedItems: NewsItem[];
	mentions: number;
	alertMentions: number;
	recentMentions: number;
	sourceDiversity: number;
	channel?: 'dynamic' | 'association';
}

interface AssociationAccumulator {
	hotspot: Hotspot;
	mentions: number;
	alertMentions: number;
	recentMentions: number;
	conflictTopicMentions: number;
	keywordSignal: number;
	spreadSignal: number;
	lastSeenAt: number;
	sourceSet: Set<string>;
	matchedItems: NewsItem[];
	seenItemIds: Set<string>;
}

interface ConflictSignal {
	hasSignal: boolean;
	alertHit: boolean;
	topicHit: boolean;
	keywordHit: boolean;
}

const MIN_ACTIVE_SCORE = 4;
const MAX_GEOCODE_CANDIDATES = 40;
const MAX_RETURNED_HOTSPOTS = 18;
const MAX_KEYWORD_HITS_PER_ITEM = 2;
const ASSOCIATION_KEYWORD_SIGNAL_WEIGHT = 0.25;
const ASSOCIATION_SPREAD_SCORE_CAP = 4;
const GEOCODE_TOKEN_OVERLAP_THRESHOLD = 0.6;
const ALERT_MENTION_WEIGHT = 4;
const RECENT_MENTION_WEIGHT = 2;
const CONFLICT_TOPIC_WEIGHT = 3;
const CONFLICT_TOPIC = 'CONFLICT';
const CONFLICT_KEYWORDS = TOPIC_KEYWORDS.CONFLICT.map((keyword) => keyword.toLowerCase());

const HOTSPOT_KEY_ALIASES: Record<string, string> = {
	washington: 'dc',
	'washington dc': 'dc',
	'washington d c': 'dc',
	'tel aviv yafo': 'tel aviv'
};

function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeNameForCompare(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function tokenize(value: string): string[] {
	return normalizeNameForCompare(value)
		.split(' ')
		.map((token) => token.trim())
		.filter((token) => token.length > 1);
}

function tokenOverlapRatio(left: string, right: string): number {
	const leftSet = new Set(tokenize(left));
	const rightSet = new Set(tokenize(right));
	if (leftSet.size === 0 || rightSet.size === 0) return 0;

	let overlap = 0;
	for (const token of leftSet) {
		if (rightSet.has(token)) overlap += 1;
	}

	return overlap / Math.max(leftSet.size, rightSet.size);
}

function buildMergeKey(name: string): string {
	const normalized = normalizeNameForCompare(name);
	return HOTSPOT_KEY_ALIASES[normalized] ?? normalized;
}

function dedupeMatchedItems(items: NewsItem[]): NewsItem[] {
	const byId = new Map<string, NewsItem>();
	for (const item of items) {
		if (!byId.has(item.id)) {
			byId.set(item.id, item);
		}
	}
	return Array.from(byId.values());
}

function buildKeywordPattern(keyword: string): RegExp {
	const trimmed = keyword.trim();
	if (!trimmed) {
		return /$^/;
	}

	const escaped = escapeRegExp(trimmed.toLowerCase());
	if (/^[a-z0-9-]+$/i.test(trimmed)) {
		return new RegExp(`\\b${escaped}\\b`, 'i');
	}

	return new RegExp(escaped, 'i');
}

function countKeywordHits(text: string, patterns: RegExp[]): number {
	let hits = 0;
	for (const pattern of patterns) {
		if (pattern.test(text)) {
			hits += 1;
		}
	}
	return Math.min(hits, MAX_KEYWORD_HITS_PER_ITEM);
}

function isConflictCategory(category: NewsCategory): boolean {
	return HOTSPOT_ALLOWED_CATEGORIES.has(category);
}

function getConflictSignal(item: NewsItem): ConflictSignal {
	const text = `${item.title}. ${item.description ?? ''}`.toLowerCase();
	const topicHit = (item.topics ?? []).some((topic) => topic.toUpperCase() === CONFLICT_TOPIC);
	const alertHit = Boolean(item.isAlert || item.alertKeyword);
	const keywordHit = CONFLICT_KEYWORDS.some((keyword) => text.includes(keyword));

	return {
		hasSignal: topicHit || alertHit || keywordHit,
		alertHit,
		topicHit,
		keywordHit
	};
}

export function isConflictFocusedNewsItem(item: NewsItem): boolean {
	return isConflictCategory(item.category) && getConflictSignal(item).hasSignal;
}

export function filterConflictFocusedNews(newsItems: NewsItem[]): NewsItem[] {
	return newsItems.filter((item) => isConflictFocusedNewsItem(item));
}

function countConflictTopicMentions(items: NewsItem[]): number {
	let mentions = 0;
	for (const item of items) {
		if (getConflictSignal(item).topicHit) {
			mentions += 1;
		}
	}
	return mentions;
}

function isGeocodeConsistent(query: string, geocoded: GeocodedLocation): boolean {
	const normalizedQuery = normalizeNameForCompare(query);
	const normalizedGeoName = normalizeNameForCompare(geocoded.name);

	if (!normalizedQuery || !normalizedGeoName) {
		return false;
	}

	if (normalizedQuery === normalizedGeoName) {
		return true;
	}

	if (normalizedGeoName.includes(normalizedQuery) || normalizedQuery.includes(normalizedGeoName)) {
		return true;
	}

	const overlapRatio = tokenOverlapRatio(normalizedQuery, normalizedGeoName);
	if (overlapRatio >= GEOCODE_TOKEN_OVERLAP_THRESHOLD) {
		return true;
	}

	// If geocoder has weak context metadata, require stronger name similarity.
	if (!geocoded.country && !geocoded.admin1) {
		return false;
	}

	return overlapRatio >= GEOCODE_TOKEN_OVERLAP_THRESHOLD;
}

function buildHotspotId(name: string, lat: number, lon: number): string {
	const safeName = name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-');
	return `${safeName}-${Math.round(lat * 10)}-${Math.round(lon * 10)}`;
}

function scoreToLevel(score: number): Hotspot['level'] {
	if (score >= 22) return 'critical';
	if (score >= 14) return 'high';
	if (score >= 8) return 'elevated';
	return 'low';
}

function buildNameLocalized(name: string): LocalizedText {
	return {
		'en-US': name,
		'zh-CN': translateMapText(name, 'zh-CN')
	};
}

function buildFallbackSummary(
	localizedName: LocalizedText,
	matchedItems: NewsItem[],
	mentions: number,
	alertMentions: number,
	sourceDiversity: number
): LocalizedText {
	const topHeadline = matchedItems
		.slice()
		.sort((a, b) => b.timestamp - a.timestamp)[0]?.title;

	const summaryEn = topHeadline
		? `${localizedName['en-US']} is a live hotspot with ${mentions} mentions from ${sourceDiversity} sources, led by "${topHeadline}".`
		: `${localizedName['en-US']} is a live hotspot with ${mentions} mentions and ${alertMentions} alerts in the last ${HOTSPOT_ANALYSIS_WINDOW_DAYS} days.`;

	const summaryZh = topHeadline
		? `${localizedName['zh-CN']}是当前活跃热点，过去${HOTSPOT_ANALYSIS_WINDOW_DAYS}天来自${sourceDiversity}个来源共提及${mentions}次，焦点为“${topHeadline}”。`
		: `${localizedName['zh-CN']}是当前活跃热点，过去${HOTSPOT_ANALYSIS_WINDOW_DAYS}天共提及${mentions}次，其中警报${alertMentions}次。`;

	return {
		'en-US': summaryEn,
		'zh-CN': summaryZh
	};
}

function scoreCandidate(
	mentions: number,
	alertMentions: number,
	recentMentions: number,
	sourceDiversity: number,
	conflictTopicMentions = 0
): number {
	const sourceBonus = Math.min(sourceDiversity, 6);
	return (
		alertMentions * ALERT_MENTION_WEIGHT +
		recentMentions * RECENT_MENTION_WEIGHT +
		conflictTopicMentions * CONFLICT_TOPIC_WEIGHT +
		mentions +
		sourceBonus
	);
}

function buildAssociationScores(newsItems: NewsItem[]): HotspotScore[] {
	const keywordMatchers = HOTSPOTS.map((hotspot) => ({
		hotspot,
		mergeKey: buildMergeKey(hotspot.name),
		patterns: (hotspot.keywords ?? []).map(buildKeywordPattern)
	}));

	const accumulator = new Map<string, AssociationAccumulator>();

	for (const item of newsItems) {
		const conflictSignal = getConflictSignal(item);
		if (!conflictSignal.hasSignal) {
			continue;
		}

		const text = `${item.title}. ${item.description ?? ''}`.toLowerCase();
		const regionSpread = item.region ? REGION_HOTSPOT_SPREAD[item.region] ?? [] : [];
		const spreadByKey = new Map(regionSpread.map((entry) => [buildMergeKey(entry.hotspot), entry.weight]));

		for (const matcher of keywordMatchers) {
			const keywordHits = countKeywordHits(text, matcher.patterns);
			const spreadWeight = spreadByKey.get(matcher.mergeKey) ?? 0;

			if (keywordHits <= 0 && spreadWeight <= 0) {
				continue;
			}

			let entry = accumulator.get(matcher.mergeKey);
			if (!entry) {
				entry = {
					hotspot: matcher.hotspot,
					mentions: 0,
					alertMentions: 0,
					recentMentions: 0,
					conflictTopicMentions: 0,
					keywordSignal: 0,
					spreadSignal: 0,
					lastSeenAt: item.timestamp,
					sourceSet: new Set<string>(),
					matchedItems: [],
					seenItemIds: new Set<string>()
				};
				accumulator.set(matcher.mergeKey, entry);
			}

			entry.lastSeenAt = Math.max(entry.lastSeenAt, item.timestamp);
			entry.spreadSignal += spreadWeight;

			if (keywordHits <= 0 || entry.seenItemIds.has(item.id)) {
				continue;
			}

			entry.seenItemIds.add(item.id);
			entry.matchedItems.push(item);
			entry.mentions += 1;
			entry.keywordSignal += keywordHits;
			entry.sourceSet.add(item.source);
			if (conflictSignal.alertHit) entry.alertMentions += 1;
			if (conflictSignal.topicHit) entry.conflictTopicMentions += 1;
			if (Date.now() - item.timestamp < HOTSPOT_ANALYSIS_WINDOW_MS) entry.recentMentions += 1;
		}
	}

	const rows: HotspotScore[] = [];

	for (const entry of accumulator.values()) {
		const mentionBoost = Math.round(entry.keywordSignal * ASSOCIATION_KEYWORD_SIGNAL_WEIGHT);
		const spreadBoost = Math.min(Math.floor(entry.spreadSignal), ASSOCIATION_SPREAD_SCORE_CAP);
		const effectiveMentions = entry.mentions + mentionBoost;
		const sourceDiversity = entry.sourceSet.size;

		const score =
			scoreCandidate(
				effectiveMentions,
				entry.alertMentions,
				entry.recentMentions,
				sourceDiversity,
				entry.conflictTopicMentions
			) +
			spreadBoost;

		if (score <= 0) {
			continue;
		}

		const nameLocalized = buildNameLocalized(entry.hotspot.name);
		const mentionsForSummary = Math.max(1, effectiveMentions);
		const summary = buildFallbackSummary(
			nameLocalized,
			entry.matchedItems,
			mentionsForSummary,
			entry.alertMentions,
			sourceDiversity
		);

		rows.push({
			hotspot: {
				...entry.hotspot,
				id: buildHotspotId(entry.hotspot.name, entry.hotspot.lat, entry.hotspot.lon),
				nameLocalized,
				level: scoreToLevel(score),
				desc: summary['en-US'],
				summary,
				score,
				mentions: effectiveMentions,
				alertMentions: entry.alertMentions,
				recentMentions: entry.recentMentions,
				sourceDiversity,
				lastSeenAt: entry.lastSeenAt
			},
			score,
			matchedItems: entry.matchedItems,
			mentions: effectiveMentions,
			alertMentions: entry.alertMentions,
			recentMentions: entry.recentMentions,
			sourceDiversity,
			channel: 'association'
		});
	}

	return rows;
}

function buildDynamicLocationScores(newsItems: NewsItem[]): Promise<HotspotScore[]> {
	return (async () => {
		const candidates = extractLocationCandidates(newsItems);
		if (candidates.length === 0) {
			return [];
		}

		const geocodeCandidates = candidates.slice(0, MAX_GEOCODE_CANDIDATES);
		const geocoded = await geocodeLocations(
			geocodeCandidates.map((candidate) => candidate.query),
			MAX_GEOCODE_CANDIDATES
		);

		const rows: HotspotScore[] = [];

		for (const candidate of geocodeCandidates) {
			const geo = geocoded.get(candidate.query);
			if (!geo) continue;
			if (!isGeocodeConsistent(candidate.query, geo)) continue;

			const conflictTopicMentions = countConflictTopicMentions(candidate.matchedItems);

			const score = scoreCandidate(
				candidate.mentions,
				candidate.alertMentions,
				candidate.recentMentions,
				candidate.sourceDiversity,
				conflictTopicMentions
			);

			if (score <= 0) continue;

			const canonicalName = candidate.displayName || candidate.query || geo.name;
			const nameLocalized = buildNameLocalized(canonicalName);
			const summary = buildFallbackSummary(
				nameLocalized,
				candidate.matchedItems,
				candidate.mentions,
				candidate.alertMentions,
				candidate.sourceDiversity
			);

			rows.push({
				hotspot: {
					id: buildHotspotId(canonicalName, geo.lat, geo.lon),
					name: canonicalName,
					nameLocalized,
					lat: geo.lat,
					lon: geo.lon,
					level: scoreToLevel(score),
					desc: summary['en-US'],
					summary,
					score,
					mentions: candidate.mentions,
					alertMentions: candidate.alertMentions,
					recentMentions: candidate.recentMentions,
					sourceDiversity: candidate.sourceDiversity,
					country: geo.country,
					lastSeenAt: candidate.lastSeenAt
				},
				score,
				matchedItems: candidate.matchedItems,
				mentions: candidate.mentions,
				alertMentions: candidate.alertMentions,
				recentMentions: candidate.recentMentions,
				sourceDiversity: candidate.sourceDiversity,
				channel: 'dynamic'
			});
		}

		return rows;
	})();
}

function mergeScores(rows: HotspotScore[]): HotspotScore[] {
	const merged = new Map<string, HotspotScore>();

	for (const row of rows) {
		const key = buildMergeKey(row.hotspot.name);
		const existing = merged.get(key);

		if (!existing) {
			merged.set(key, row);
			continue;
		}

		const matchedItems = dedupeMatchedItems([...existing.matchedItems, ...row.matchedItems]);
		const sourceDiversity =
			new Set(matchedItems.map((item) => item.source)).size ||
			Math.max(existing.sourceDiversity, row.sourceDiversity);
		const mentions = Math.max(existing.mentions, row.mentions);
		const alertMentions = Math.max(existing.alertMentions, row.alertMentions);
		const recentMentions = Math.max(existing.recentMentions, row.recentMentions);
		const score = Math.max(existing.score, row.score);
		const preferred =
			existing.channel === 'association' && row.channel !== 'association'
				? existing
				: row.channel === 'association' && existing.channel !== 'association'
					? row
					: existing.score >= row.score
						? existing
						: row;

		const localizedName = preferred.hotspot.nameLocalized ?? buildNameLocalized(preferred.hotspot.name);
		const summary = buildFallbackSummary(
			localizedName,
			matchedItems,
			mentions,
			alertMentions,
			sourceDiversity
		);

		merged.set(key, {
			hotspot: {
				...preferred.hotspot,
				nameLocalized: localizedName,
				desc: summary['en-US'],
				summary,
				score,
				mentions,
				alertMentions,
				recentMentions,
				sourceDiversity,
				lastSeenAt: Math.max(preferred.hotspot.lastSeenAt ?? 0, row.hotspot.lastSeenAt ?? 0)
			},
			score,
			matchedItems,
			mentions,
			alertMentions,
			recentMentions,
			sourceDiversity,
			channel: preferred.channel
		});
	}

	return Array.from(merged.values());
}

function hydrateHotspot(score: HotspotScore): Hotspot {
	return {
		...score.hotspot,
		level: scoreToLevel(score.score),
		score: score.score,
		mentions: score.mentions,
		alertMentions: score.alertMentions,
		recentMentions: score.recentMentions,
		sourceDiversity: score.sourceDiversity
	};
}

export async function analyzeHotspots(newsItems: NewsItem[]): Promise<HotspotScore[]> {
	if (newsItems.length === 0) {
		return [];
	}

	const conflictFocusedNews = filterConflictFocusedNews(newsItems);
	if (conflictFocusedNews.length === 0) {
		return [];
	}

	const [dynamicScores, associationScores] = await Promise.all([
		buildDynamicLocationScores(conflictFocusedNews),
		Promise.resolve(buildAssociationScores(conflictFocusedNews))
	]);

	const mergedScores = mergeScores([...dynamicScores, ...associationScores]);

	return mergedScores.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return (b.hotspot.lastSeenAt ?? 0) - (a.hotspot.lastSeenAt ?? 0);
	});
}

export function scoresToHotspots(scores: HotspotScore[]): Hotspot[] {
	const sorted = scores.map(hydrateHotspot).sort((a, b) => {
		if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
		return (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0);
	});

	const active = sorted.filter((hotspot) => (hotspot.score ?? 0) >= MIN_ACTIVE_SCORE);
	if (active.length > 0) {
		return active.slice(0, MAX_RETURNED_HOTSPOTS);
	}

	// If no hotspot passes active threshold, still return a few weak signals.
	return sorted.filter((hotspot) => (hotspot.score ?? 0) > 0).slice(0, Math.min(6, MAX_RETURNED_HOTSPOTS));
}
