import type { NewsCategory, NewsItem } from '$lib/types';
import { HOTSPOTS, type Hotspot, type LocalizedText } from '$lib/config/map';
import { translateMapText } from '$lib/i18n';
import {
HOTSPOT_ALLOWED_CATEGORIES,
HOTSPOT_ANALYSIS_WINDOW_MS,
HOTSPOT_TEMPORAL_DECAY_DAYS
} from './constants';
import {
canonicalizeLocationName,
extractStructuredHotspotEvents,
isLikelyLocationName,
type StructuredHotspotEvent
} from './extract';
import { geocodeLocations } from './geocode';
import { extractHeadlineEventsWithLLM } from './llm';

export interface HotspotDimensionScores {
frequency: number;
conflict: number;
power: number;
spillover: number;
temporal: number;
}

export interface HotspotScore {
hotspot: Hotspot;
score: number;
matchedItems: NewsItem[];
mentions: number;
alertMentions: number;
recentMentions: number;
sourceDiversity: number;
dimensions: HotspotDimensionScores;
channel?: 'focus' | 'regional';
}

interface FocusAccumulator {
name: string;
mentions: number;
alertMentions: number;
recentMentions: number;
lastSeenAt: number;
sourceSet: Set<string>;
matchedItems: NewsItem[];
seenItemIds: Set<string>;
frequencyRaw: number;
conflictRaw: number;
powerRaw: number;
spilloverRaw: number;
temporalRaw: number;
powerActorSet: Set<string>;
strategicSignalSet: Set<string>;
}

interface RegionalAccumulator {
name: string;
mentions: number;
alertMentions: number;
recentMentions: number;
lastSeenAt: number;
sourceSet: Set<string>;
matchedItems: NewsItem[];
seenItemIds: Set<string>;
dimensions: HotspotDimensionScores;
scoreTotal: number;
latSum: number;
lonSum: number;
count: number;
}

const MAX_GEOCODE_CANDIDATES = 60;
const MAX_FOCUS_RESULTS = 14;
const MAX_REGIONAL_RESULTS = 8;
const MIN_ACTIVE_SCORE = 6;
const REGIONAL_SCORE_MULTIPLIER = 0.72;
const TEMPORAL_DECAY_MS = HOTSPOT_TEMPORAL_DECAY_DAYS * 24 * 60 * 60 * 1000;

const SCORING_WEIGHTS = {
frequency: 1.1,
conflict: 1.9,
power: 2.8,
spillover: 1.5,
temporal: 1.3
} as const;

const SCORE_LEVEL_THRESHOLDS = {
critical: 34,
high: 22,
elevated: 12
} as const;

const BROAD_REGION_TERMS = new Set([
'americas',
'europe',
'apac',
'mena',
'africa',
'world',
'middle east',
'eastern europe'
]);

const CONFLICT_INTENSITY_WEIGHTS: Record<string, number> = {
war: 2.6,
invasion: 2.8,
bombardment: 2.5,
airstrike: 2.4,
shelling: 2.2,
attack: 2.1,
strike: 2,
drone: 1.8,
missile: 2.2,
frontline: 1.7,
offensive: 2,
clash: 1.4,
battle: 1.6,
ceasefire: 1.2,
sanctions: 1
};

const INTERVENTION_KEYWORDS = [
'sanctions',
'military aid',
'arms package',
'pressure',
'warned',
'deploy',
'intervention',
'veto',
'proxy'
] as const;

const SPILLOVER_KEYWORDS = [
'refugee',
'oil prices',
'energy shock',
'supply chain',
'gas cutoff',
'market selloff',
'shipping disruption',
'export ban',
'insurance costs'
] as const;

const STRATEGIC_KEYWORDS = [
'strait',
'chokepoint',
'oil',
'gas',
'pipeline',
'critical mineral',
'shipping lane',
'port',
'sea lane'
] as const;

const MAJOR_POWER_ENTITIES = [
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

const LOCATION_PARENT_MAP: Record<string, string> = {
tehran: 'Gulf Region',
gaza: 'Levant',
'tel aviv': 'Levant',
jerusalem: 'Levant',
'west bank': 'Levant',
bakhmut: 'Donetsk Region',
donetsk: 'Donetsk Region',
kyiv: 'Ukraine',
odesa: 'Ukraine',
dnipro: 'Ukraine',
riyadh: 'Gulf Region',
yemen: 'Gulf Region',
hormuz: 'Gulf Region',
moscow: 'Eastern Europe',
beijing: 'East Asia',
taipei: 'Taiwan Strait',
'taiwan strait': 'Taiwan Strait',
pyongyang: 'Korean Peninsula',
seoul: 'Korean Peninsula'
};

const REGION_COORDS: Record<string, { lat: number; lon: number }> = {
'Gulf Region': { lat: 26.2, lon: 51.2 },
Levant: { lat: 32.2, lon: 35.2 },
'Donetsk Region': { lat: 48.0, lon: 37.8 },
Ukraine: { lat: 49.0, lon: 31.3 },
'Eastern Europe': { lat: 52.0, lon: 29.0 },
'East Asia': { lat: 33.0, lon: 123.0 },
'Taiwan Strait': { lat: 24.7, lon: 119.8 },
'Korean Peninsula': { lat: 38.2, lon: 127.0 }
};

const DRIVER_LABELS = {
frequency: { en: 'High Event Frequency', zh: '事件频率高' },
conflict: { en: 'Conflict Intensity', zh: '冲突强度高' },
power: { en: 'Major-Power Intervention', zh: '大国介入力强' },
spillover: { en: 'Global Spillover Impact', zh: '外溢影响显著' },
temporal: { en: 'Long-Term Persistence', zh: '持续时间较长' }
} as const;

const CORRUPTED_TEXT_PATTERN = /�|Ã.|â.|鈭/;



function normalizeNameForCompare(value: string): string {
return value
.toLowerCase()
.replace(/[^a-z0-9\s]/g, ' ')
.replace(/\s+/g, ' ')
.trim();
}

function roundTo(value: number, digits = 2): number {
const base = 10 ** digits;
return Math.round(value * base) / base;
}

function dedupeStrings(values: string[]): string[] {
const seen = new Set<string>();
const output: string[] = [];
for (const raw of values) {
const value = raw.trim();
if (!value) continue;
const key = normalizeNameForCompare(value);
if (!key || seen.has(key)) continue;
seen.add(key);
output.push(value);
}
return output;
}

function buildMergeKey(name: string): string {
return normalizeNameForCompare(canonicalizeLocationName(name));
}

function buildHotspotId(name: string, lat: number, lon: number, layer: 'focus' | 'regional'): string {
const safeName = name
.toLowerCase()
.replace(/[^a-z0-9\s-]/g, '')
.trim()
.replace(/\s+/g, '-');
return `${layer}-${safeName}-${Math.round(lat * 10)}-${Math.round(lon * 10)}`;
}

function scoreToLevel(score: number): Hotspot['level'] {
if (score >= SCORE_LEVEL_THRESHOLDS.critical) return 'critical';
if (score >= SCORE_LEVEL_THRESHOLDS.high) return 'high';
if (score >= SCORE_LEVEL_THRESHOLDS.elevated) return 'elevated';
return 'low';
}

function buildNameLocalized(name: string): LocalizedText {
return {
'en-US': name,
'zh-CN': translateMapText(name, 'zh-CN')
};
}



function isConflictCategory(category: NewsCategory): boolean {
return HOTSPOT_ALLOWED_CATEGORIES.has(category);
}

function hasSignalKeyword(text: string, keywords: readonly string[]): boolean {
return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

export function isConflictFocusedNewsItem(item: NewsItem): boolean {
if (!isConflictCategory(item.category)) {
return false;
}

const text = `${item.title}. ${item.description ?? ''}`.toLowerCase();
const topicHit = (item.topics ?? []).some((topic) => topic.toUpperCase() === 'CONFLICT');
const alertHit = Boolean(item.isAlert || item.alertKeyword);
const interventionHit = hasSignalKeyword(text, INTERVENTION_KEYWORDS);
const spilloverHit = hasSignalKeyword(text, SPILLOVER_KEYWORDS);
const conflictHit =
topicHit ||
hasSignalKeyword(text, Object.keys(CONFLICT_INTENSITY_WEIGHTS)) ||
hasSignalKeyword(text, STRATEGIC_KEYWORDS);

return alertHit || conflictHit || interventionHit || spilloverHit;
}

export function filterConflictFocusedNews(newsItems: NewsItem[]): NewsItem[] {
return newsItems.filter((item) => isConflictFocusedNewsItem(item));
}

function computeTemporalSignal(timestamp: number): number {
const age = Math.max(0, Date.now() - timestamp);
return Math.exp(-age / TEMPORAL_DECAY_MS) * 3;
}

function computeConflictSignalScore(event: StructuredHotspotEvent): number {
let score = 0;
for (const signal of event.conflictSignals) {
const key = signal.toLowerCase();
score += CONFLICT_INTENSITY_WEIGHTS[key] ?? 1;
}

if (event.battlefield) score += 1;
if (event.item.isAlert) score += 1;
score += event.strategicSignals.length * 0.6;

return Math.max(0.8, score);
}

function computePowerSignalScore(event: StructuredHotspotEvent): number {
const majorPowerWeight = event.powerActors.length * 1.8;
const interventionWeight = event.interventionSignals.length * 1.3;
const targetBoost = event.powerActors.length > 0 && event.targets.length > 0 ? 1.2 : 0;
return majorPowerWeight + interventionWeight + targetBoost;
}

function computeSpilloverSignalScore(event: StructuredHotspotEvent): number {
const spill = event.spilloverSignals.length * 1.4;
const strategicCrossImpact = event.strategicSignals.length > 0 ? 0.5 : 0;
return spill + strategicCrossImpact;
}

function hasCorruptedText(value: string | undefined): boolean {
if (!value) return false;
return CORRUPTED_TEXT_PATTERN.test(value);
}

function isLikelyHotspotLocation(value: string): boolean {
if (!value) return false;
const normalized = normalizeNameForCompare(value);
if (!normalized || BROAD_REGION_TERMS.has(normalized)) return false;
return isLikelyLocationName(value);
}

function selectPrimaryLocation(event: StructuredHotspotEvent): string | undefined {
const actorKeys = new Set(event.actors.map((actor) => normalizeNameForCompare(actor)));

if (event.battlefield && isLikelyHotspotLocation(event.battlefield)) {
return canonicalizeLocationName(event.battlefield);
}

for (const location of event.locations) {
const normalized = normalizeNameForCompare(location);
if (!actorKeys.has(normalized) && isLikelyHotspotLocation(location)) {
return canonicalizeLocationName(location);
}
}

for (const target of event.targets) {
const canonical = canonicalizeLocationName(target);
if (isLikelyHotspotLocation(canonical)) {
return canonical;
}
}

for (const location of event.locations) {
const canonical = canonicalizeLocationName(location);
if (isLikelyHotspotLocation(canonical)) {
return canonical;
}
}

return undefined;
}

function mergeStructuredEvents(
ruleEvents: StructuredHotspotEvent[],
llmEvents: Map<string, { actors: string[]; targets: string[]; locations: string[]; battlefield?: string; confidence: number }>,
newsItems: NewsItem[]
): StructuredHotspotEvent[] {
const newsById = new Map(newsItems.map((item) => [item.id, item]));
const mergedById = new Map<string, StructuredHotspotEvent>();

for (const event of ruleEvents) {
mergedById.set(event.item.id, event);
}

for (const [id, llmEvent] of llmEvents.entries()) {
const existing = mergedById.get(id);
if (existing) {
mergedById.set(id, {
...existing,
actors: dedupeStrings([...existing.actors, ...llmEvent.actors]),
targets: dedupeStrings([...existing.targets, ...llmEvent.targets]),
locations: dedupeStrings([...existing.locations, ...llmEvent.locations]),
battlefield:
llmEvent.battlefield && llmEvent.confidence >= existing.confidence
? canonicalizeLocationName(llmEvent.battlefield)
: existing.battlefield,
confidence: Math.max(existing.confidence, llmEvent.confidence)
});
continue;
}

const item = newsById.get(id);
if (!item) continue;

mergedById.set(id, {
item,
actors: dedupeStrings(llmEvent.actors.map((value) => canonicalizeLocationName(value))),
targets: dedupeStrings(llmEvent.targets.map((value) => canonicalizeLocationName(value))),
locations: dedupeStrings(llmEvent.locations.map((value) => canonicalizeLocationName(value))),
battlefield: llmEvent.battlefield ? canonicalizeLocationName(llmEvent.battlefield) : undefined,
conflictSignals: [],
interventionSignals: [],
spilloverSignals: [],
strategicSignals: [],
powerActors: dedupeStrings(
llmEvent.actors.filter((actor) =>
MAJOR_POWER_ENTITIES.some((power) => actor.toLowerCase().includes(power))
)
),
confidence: llmEvent.confidence
});
}

return Array.from(mergedById.values());
}

function inferParentRegion(locationName: string, country?: string): string {
const key = normalizeNameForCompare(locationName);
if (LOCATION_PARENT_MAP[key]) {
return LOCATION_PARENT_MAP[key];
}

if (country && country.trim().length > 0) {
return country;
}

if (key.includes('gulf')) return 'Gulf Region';
if (key.includes('strait')) return 'Maritime Chokepoint';
if (key.includes('donetsk')) return 'Donetsk Region';
return locationName;
}

function pickTopDrivers(dimensions: HotspotDimensionScores): Array<keyof HotspotDimensionScores> {
const weighted = [
{ key: 'frequency', value: dimensions.frequency * SCORING_WEIGHTS.frequency },
{ key: 'conflict', value: dimensions.conflict * SCORING_WEIGHTS.conflict },
{ key: 'power', value: dimensions.power * SCORING_WEIGHTS.power },
{ key: 'spillover', value: dimensions.spillover * SCORING_WEIGHTS.spillover },
{ key: 'temporal', value: dimensions.temporal * SCORING_WEIGHTS.temporal }
] as Array<{ key: keyof HotspotDimensionScores; value: number }>;

const total = weighted.reduce((sum, item) => sum + item.value, 0);
if (total <= 0) {
return ['frequency'];
}

return weighted
.sort((a, b) => b.value - a.value)
.filter((item, index) => index < 2 || item.value >= total * 0.2)
.slice(0, 3)
.map((item) => item.key);
}

function buildDriverSummary(
localizedName: LocalizedText,
drivers: Array<keyof HotspotDimensionScores>
): LocalizedText {
const en = drivers.map((key) => DRIVER_LABELS[key].en).join(', ');
const zh = drivers.map((key) => DRIVER_LABELS[key].zh).join('、');

return {
'en-US': `${localizedName['en-US']} is driven by ${en}.`,
'zh-CN': `${localizedName['zh-CN']}的主要驱动因素是${zh}。`
};
}

function buildFallbackSummary(
localizedName: LocalizedText,
matchedItems: NewsItem[],
drivers: Array<keyof HotspotDimensionScores>,
dimensions: HotspotDimensionScores,
layer: 'focus' | 'regional'
): LocalizedText {
const topHeadline = matchedItems
.slice()
.sort((a, b) => b.timestamp - a.timestamp)[0]?.title;
const safeHeadline = topHeadline && !hasCorruptedText(topHeadline) ? topHeadline : undefined;
const driverTextEn = drivers.map((key) => DRIVER_LABELS[key].en).join(', ');
const driverTextZh = drivers.map((key) => DRIVER_LABELS[key].zh).join('、');
const layerLabelEn = layer === 'focus' ? 'focus hotspot' : 'regional hotspot';
const layerLabelZh = layer === 'focus' ? '焦点热点' : '区域热点';

const summaryEn = safeHeadline
? `${localizedName['en-US']} is a ${layerLabelEn} driven by ${driverTextEn}; latest signal: "${safeHeadline}".`
: `${localizedName['en-US']} is a ${layerLabelEn} driven by ${driverTextEn}.`;

const summaryZh = safeHeadline
? `${localizedName['zh-CN']}为${layerLabelZh}，主要驱动因素为${driverTextZh}；最新信号为“${safeHeadline}”。`
: `${localizedName['zh-CN']}为${layerLabelZh}，主要驱动因素为${driverTextZh}。`;

return {
'en-US': `${summaryEn} Score factors: F ${roundTo(dimensions.frequency, 1)}, C ${roundTo(dimensions.conflict, 1)}, P ${roundTo(dimensions.power, 1)}, S ${roundTo(dimensions.spillover, 1)}, T ${roundTo(dimensions.temporal, 1)}.`,
'zh-CN': `${summaryZh} 评分因子：F ${roundTo(dimensions.frequency, 1)}，C ${roundTo(dimensions.conflict, 1)}，P ${roundTo(dimensions.power, 1)}，S ${roundTo(dimensions.spillover, 1)}，T ${roundTo(dimensions.temporal, 1)}。`
};
}

function computeWeightedScore(dimensions: HotspotDimensionScores): number {
return roundTo(
dimensions.frequency * SCORING_WEIGHTS.frequency +
dimensions.conflict * SCORING_WEIGHTS.conflict +
dimensions.power * SCORING_WEIGHTS.power +
dimensions.spillover * SCORING_WEIGHTS.spillover +
dimensions.temporal * SCORING_WEIGHTS.temporal,
2
);
}

function getKnownHotspot(name: string): Hotspot | undefined {
const key = buildMergeKey(name);
return HOTSPOTS.find((hotspot) => buildMergeKey(hotspot.name) === key);
}

function buildFocusBuckets(events: StructuredHotspotEvent[]): Map<string, FocusAccumulator> {
const buckets = new Map<string, FocusAccumulator>();

for (const event of events) {
const location = selectPrimaryLocation(event);
if (!location) {
continue;
}

const key = buildMergeKey(location);
if (!key || BROAD_REGION_TERMS.has(key)) {
continue;
}

let bucket = buckets.get(key);
if (!bucket) {
bucket = {
name: canonicalizeLocationName(location),
mentions: 0,
alertMentions: 0,
recentMentions: 0,
lastSeenAt: event.item.timestamp,
sourceSet: new Set<string>(),
matchedItems: [],
seenItemIds: new Set<string>(),
frequencyRaw: 0,
conflictRaw: 0,
powerRaw: 0,
spilloverRaw: 0,
temporalRaw: 0,
powerActorSet: new Set<string>(),
strategicSignalSet: new Set<string>()
};
buckets.set(key, bucket);
}

bucket.lastSeenAt = Math.max(bucket.lastSeenAt, event.item.timestamp);
bucket.sourceSet.add(event.item.source);
for (const actor of event.powerActors) {
bucket.powerActorSet.add(actor);
}
for (const signal of event.strategicSignals) {
bucket.strategicSignalSet.add(signal);
}

if (bucket.seenItemIds.has(event.item.id)) {
continue;
}

bucket.seenItemIds.add(event.item.id);
bucket.matchedItems.push(event.item);
bucket.mentions += 1;
if (event.item.isAlert) bucket.alertMentions += 1;
if (Date.now() - event.item.timestamp <= HOTSPOT_ANALYSIS_WINDOW_MS) {
bucket.recentMentions += 1;
}

bucket.frequencyRaw += 1;
bucket.conflictRaw += computeConflictSignalScore(event);
bucket.powerRaw += computePowerSignalScore(event);
bucket.spilloverRaw += computeSpilloverSignalScore(event);
bucket.temporalRaw += computeTemporalSignal(event.item.timestamp);
}

return buckets;
}

async function buildFocusScores(events: StructuredHotspotEvent[]): Promise<HotspotScore[]> {
const buckets = buildFocusBuckets(events);
if (buckets.size === 0) return [];

const unresolved = Array.from(buckets.values())
.filter((bucket) => !getKnownHotspot(bucket.name))
.map((bucket) => bucket.name)
.slice(0, MAX_GEOCODE_CANDIDATES);

const geocoded = await geocodeLocations(unresolved, MAX_GEOCODE_CANDIDATES);
const rows: HotspotScore[] = [];

for (const bucket of buckets.values()) {
const known = getKnownHotspot(bucket.name);
const geo = geocoded.get(bucket.name);
const lat = known?.lat ?? geo?.lat;
const lon = known?.lon ?? geo?.lon;

if (typeof lat !== 'number' || typeof lon !== 'number') {
continue;
}

const dimensions: HotspotDimensionScores = {
frequency: roundTo(bucket.frequencyRaw),
conflict: roundTo(bucket.conflictRaw),
power: roundTo(bucket.powerRaw),
spillover: roundTo(bucket.spilloverRaw),
temporal: roundTo(bucket.temporalRaw)
};
const score = computeWeightedScore(dimensions);
if (score <= 0) continue;

const nameLocalized = buildNameLocalized(bucket.name);
const driverKeys = pickTopDrivers(dimensions);
const driverSummary = buildDriverSummary(nameLocalized, driverKeys);
const summary = buildFallbackSummary(nameLocalized, bucket.matchedItems, driverKeys, dimensions, 'focus');
const parentRegion = inferParentRegion(bucket.name, known?.country ?? geo?.country);
const coreDrivers = driverKeys.map((key) => DRIVER_LABELS[key].en);
const evidenceHeadlines = bucket.matchedItems
.slice()
.sort((a, b) => b.timestamp - a.timestamp)
.slice(0, 3)
.map((item) => item.title);

rows.push({
hotspot: {
...(known ?? {
name: bucket.name,
lat,
lon,
level: 'low',
desc: summary['en-US']
}),
id: buildHotspotId(bucket.name, lat, lon, 'focus'),
name: bucket.name,
nameLocalized,
lat,
lon,
level: scoreToLevel(score),
desc: summary['en-US'],
summary,
score,
mentions: bucket.mentions,
alertMentions: bucket.alertMentions,
recentMentions: bucket.recentMentions,
sourceDiversity: bucket.sourceSet.size,
country: known?.country ?? geo?.country,
lastSeenAt: bucket.lastSeenAt,
layer: 'focus',
parentRegion,
coreDrivers,
driverSummary,
scoreBreakdown: {
...dimensions,
total: score
},
powerActors: Array.from(bucket.powerActorSet).slice(0, 4),
evidenceHeadlines
},
score,
matchedItems: bucket.matchedItems,
mentions: bucket.mentions,
alertMentions: bucket.alertMentions,
recentMentions: bucket.recentMentions,
sourceDiversity: bucket.sourceSet.size,
dimensions,
channel: 'focus'
});
}

return rows;
}

function buildRegionalScores(focusScores: HotspotScore[]): HotspotScore[] {
const accumulator = new Map<string, RegionalAccumulator>();

for (const row of focusScores) {
const regionName = row.hotspot.parentRegion?.trim();
if (!regionName) continue;
if (buildMergeKey(regionName) === buildMergeKey(row.hotspot.name)) continue;

const key = buildMergeKey(regionName);
let entry = accumulator.get(key);
if (!entry) {
entry = {
name: regionName,
mentions: 0,
alertMentions: 0,
recentMentions: 0,
lastSeenAt: row.hotspot.lastSeenAt ?? 0,
sourceSet: new Set<string>(),
matchedItems: [],
seenItemIds: new Set<string>(),
dimensions: {
frequency: 0,
conflict: 0,
power: 0,
spillover: 0,
temporal: 0
},
scoreTotal: 0,
latSum: 0,
lonSum: 0,
count: 0
};
accumulator.set(key, entry);
}

entry.mentions += row.mentions;
entry.alertMentions += row.alertMentions;
entry.recentMentions += row.recentMentions;
entry.lastSeenAt = Math.max(entry.lastSeenAt, row.hotspot.lastSeenAt ?? 0);
entry.latSum += row.hotspot.lat;
entry.lonSum += row.hotspot.lon;
entry.count += 1;
entry.dimensions.frequency += row.dimensions.frequency;
entry.dimensions.conflict += row.dimensions.conflict;
entry.dimensions.power += row.dimensions.power;
entry.dimensions.spillover += row.dimensions.spillover;
entry.dimensions.temporal += row.dimensions.temporal;
entry.scoreTotal += row.score;

for (const item of row.matchedItems) {
entry.sourceSet.add(item.source);
if (!entry.seenItemIds.has(item.id)) {
entry.seenItemIds.add(item.id);
entry.matchedItems.push(item);
}
}
}

const rows: HotspotScore[] = [];
for (const entry of accumulator.values()) {
const coords = REGION_COORDS[entry.name];
const lat = coords?.lat ?? (entry.count > 0 ? entry.latSum / entry.count : 0);
const lon = coords?.lon ?? (entry.count > 0 ? entry.lonSum / entry.count : 0);
if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

const dimensions: HotspotDimensionScores = {
frequency: roundTo(entry.dimensions.frequency * REGIONAL_SCORE_MULTIPLIER),
conflict: roundTo(entry.dimensions.conflict * REGIONAL_SCORE_MULTIPLIER),
power: roundTo(entry.dimensions.power * REGIONAL_SCORE_MULTIPLIER),
spillover: roundTo(entry.dimensions.spillover * REGIONAL_SCORE_MULTIPLIER),
temporal: roundTo(entry.dimensions.temporal * REGIONAL_SCORE_MULTIPLIER)
};

const score = computeWeightedScore(dimensions);
const nameLocalized = buildNameLocalized(entry.name);
const driverKeys = pickTopDrivers(dimensions);
const driverSummary = buildDriverSummary(nameLocalized, driverKeys);
const summary = buildFallbackSummary(nameLocalized, entry.matchedItems, driverKeys, dimensions, 'regional');
const coreDrivers = driverKeys.map((key) => DRIVER_LABELS[key].en);
const evidenceHeadlines = entry.matchedItems
.slice()
.sort((a, b) => b.timestamp - a.timestamp)
.slice(0, 3)
.map((item) => item.title);

rows.push({
hotspot: {
id: buildHotspotId(entry.name, lat, lon, 'regional'),
name: entry.name,
nameLocalized,
lat,
lon,
level: scoreToLevel(score),
desc: summary['en-US'],
summary,
score,
mentions: entry.mentions,
alertMentions: entry.alertMentions,
recentMentions: entry.recentMentions,
sourceDiversity: entry.sourceSet.size,
lastSeenAt: entry.lastSeenAt,
layer: 'regional',
coreDrivers,
driverSummary,
scoreBreakdown: {
...dimensions,
total: score
},
evidenceHeadlines
},
score,
matchedItems: entry.matchedItems,
mentions: entry.mentions,
alertMentions: entry.alertMentions,
recentMentions: entry.recentMentions,
sourceDiversity: entry.sourceSet.size,
dimensions,
channel: 'regional'
});
}

return rows;
}

function sortScores(rows: HotspotScore[]): HotspotScore[] {
return rows.slice().sort((a, b) => {
if (b.score !== a.score) return b.score - a.score;
if (a.channel !== b.channel) return a.channel === 'focus' ? -1 : 1;
return (b.hotspot.lastSeenAt ?? 0) - (a.hotspot.lastSeenAt ?? 0);
});
}

export async function analyzeHotspots(newsItems: NewsItem[]): Promise<HotspotScore[]> {
if (newsItems.length === 0) {
return [];
}

const conflictFocusedNews = filterConflictFocusedNews(newsItems);
if (conflictFocusedNews.length === 0) {
return [];
}

const ruleEvents = extractStructuredHotspotEvents(conflictFocusedNews, {
conflictKeywords: Object.keys(CONFLICT_INTENSITY_WEIGHTS),
interventionKeywords: Array.from(INTERVENTION_KEYWORDS),
spilloverKeywords: Array.from(SPILLOVER_KEYWORDS),
strategicKeywords: Array.from(STRATEGIC_KEYWORDS),
majorPowers: Array.from(MAJOR_POWER_ENTITIES)
});
const llmEvents = await extractHeadlineEventsWithLLM(conflictFocusedNews);
const mergedEvents = mergeStructuredEvents(ruleEvents, llmEvents, conflictFocusedNews);

if (mergedEvents.length === 0) {
return [];
}

const focusScores = await buildFocusScores(mergedEvents);
const regionalScores = buildRegionalScores(focusScores);
return sortScores([...focusScores, ...regionalScores]);
}

function hydrateHotspot(score: HotspotScore): Hotspot {
return {
...score.hotspot,
level: scoreToLevel(score.score),
score: score.score,
mentions: score.mentions,
alertMentions: score.alertMentions,
recentMentions: score.recentMentions,
sourceDiversity: score.sourceDiversity,
scoreBreakdown: {
...score.dimensions,
total: score.score
}
};
}

export function scoresToHotspots(scores: HotspotScore[]): Hotspot[] {
const hydrated = sortScores(scores).map(hydrateHotspot);

const focus = hydrated
.filter((hotspot) => hotspot.layer !== 'regional' && (hotspot.score ?? 0) >= MIN_ACTIVE_SCORE)
.slice(0, MAX_FOCUS_RESULTS);
const regional = hydrated
.filter((hotspot) => hotspot.layer === 'regional' && (hotspot.score ?? 0) >= MIN_ACTIVE_SCORE)
.slice(0, MAX_REGIONAL_RESULTS);

const combined = sortScores(
[...focus, ...regional].map((hotspot) => ({
hotspot,
score: hotspot.score ?? 0,
matchedItems: [],
mentions: hotspot.mentions ?? 0,
alertMentions: hotspot.alertMentions ?? 0,
recentMentions: hotspot.recentMentions ?? 0,
sourceDiversity: hotspot.sourceDiversity ?? 0,
dimensions: {
frequency: hotspot.scoreBreakdown?.frequency ?? 0,
conflict: hotspot.scoreBreakdown?.conflict ?? 0,
power: hotspot.scoreBreakdown?.power ?? 0,
spillover: hotspot.scoreBreakdown?.spillover ?? 0,
temporal: hotspot.scoreBreakdown?.temporal ?? 0
},
channel: hotspot.layer ?? 'focus'
}))
).map((row) => row.hotspot);

if (combined.length > 0) {
return combined;
}

return hydrated
.filter((hotspot) => (hotspot.score ?? 0) > 0)
.slice(0, Math.min(6, MAX_FOCUS_RESULTS + MAX_REGIONAL_RESULTS));
}

