/**
 * LLM enrichment layer using SiliconFlow / DeepSeek-V3
 *
 * Enriches the top-N scored hotspots with AI-generated one-sentence summaries.
 * Gracefully no-ops when SILICONFLOW_API_KEY is absent.
 */

import type { Hotspot } from '$lib/config/map';
import type { NewsItem } from '$lib/types';
import { SILICONFLOW_API_KEY, SILICONFLOW_BASE_URL, SILICONFLOW_MODEL } from '$lib/config/api';
import { translateMapText } from '$lib/i18n';
import type { HotspotScore } from './analyze';

/** Maximum hotspots enriched per call (controls API costs) */
const MAX_ENRICH = 12;
/** Minimum score required to be considered for LLM enrichment */
const MIN_SCORE_FOR_LLM = 4;
/** Per-request timeout in milliseconds */
const LLM_TIMEOUT_MS = 15_000;

interface LlmEnrichmentResult {
	level: Hotspot['level'];
	summary_en: string;
	summary_zh: string;
	name_zh?: string;
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const CORRUPTED_TEXT_PATTERN = /�|Ã.|â.|鈭/;

function normalizeLocalizedName(value: string): string {
	return value
		.toLowerCase()
		.replace(/[\s·•'"`.-]/g, '')
		.trim();
}

function sanitizeModelText(value: string): string {
	return value.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isCorruptedModelText(value: string | undefined): boolean {
	if (!value) return false;
	const sanitized = sanitizeModelText(value);
	if (!sanitized) return true;
	return CORRUPTED_TEXT_PATTERN.test(sanitized);
}

function isConsistentLocalizedName(
	candidateNameZh: string | undefined,
	canonicalNameZh: string,
	fallbackNameZh: string
): boolean {
	if (!candidateNameZh || !candidateNameZh.trim()) return false;

	const normalizedCandidate = normalizeLocalizedName(candidateNameZh);
	const normalizedCanonical = normalizeLocalizedName(canonicalNameZh);
	const normalizedFallback = normalizeLocalizedName(fallbackNameZh);

	if (!normalizedCandidate) return false;
	if (normalizedCandidate === normalizedCanonical) return true;
	if (normalizedCandidate === normalizedFallback) return true;

	if (
		normalizedCanonical.length >= 2 &&
		(normalizedCandidate.includes(normalizedCanonical) ||
			normalizedCanonical.includes(normalizedCandidate))
	) {
		return true;
	}

	if (
		normalizedFallback.length >= 2 &&
		(normalizedCandidate.includes(normalizedFallback) || normalizedFallback.includes(normalizedCandidate))
	) {
		return true;
	}

	return false;
}

async function callLlm(messages: ChatMessage[], maxTokens = 300): Promise<string> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

	try {
		const response = await fetch(`${SILICONFLOW_BASE_URL}/chat/completions`, {
			method: 'POST',
			signal: controller.signal,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${SILICONFLOW_API_KEY}`
			},
			body: JSON.stringify({
				model: SILICONFLOW_MODEL,
				messages,
				temperature: 0.3,
				max_tokens: maxTokens,
				response_format: { type: 'json_object' }
			})
		});

		if (!response.ok) {
			throw new Error(`SiliconFlow API error: ${response.status}`);
		}

		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		return data?.choices?.[0]?.message?.content ?? '';
	} finally {
		clearTimeout(timer);
	}
}

function parseEnrichmentResult(raw: string, fallback: Hotspot): LlmEnrichmentResult {
	const fallbackSummaryEn = fallback.summary?.['en-US'] ?? fallback.desc;
	const fallbackSummaryZh = fallback.summary?.['zh-CN'] ?? fallback.desc;
	const fallbackNameZh = fallback.nameLocalized?.['zh-CN'] ?? fallback.name;

	try {
		const parsed = JSON.parse(raw) as Partial<LlmEnrichmentResult>;
		const validLevels: Hotspot['level'][] = ['critical', 'high', 'elevated', 'low'];
		const level = validLevels.includes(parsed.level as Hotspot['level'])
			? (parsed.level as Hotspot['level'])
			: fallback.level;

		const summaryEn =
			typeof parsed.summary_en === 'string' && parsed.summary_en.trim().length > 0 &&
				!isCorruptedModelText(parsed.summary_en)
				? sanitizeModelText(parsed.summary_en)
				: fallbackSummaryEn;
		const summaryZh =
			typeof parsed.summary_zh === 'string' && parsed.summary_zh.trim().length > 0 &&
				!isCorruptedModelText(parsed.summary_zh)
				? sanitizeModelText(parsed.summary_zh)
				: fallbackSummaryZh;
		const nameZh =
			typeof parsed.name_zh === 'string' && parsed.name_zh.trim().length > 0 &&
				!isCorruptedModelText(parsed.name_zh)
				? sanitizeModelText(parsed.name_zh)
				: fallbackNameZh;

		return {
			level,
			summary_en: summaryEn,
			summary_zh: summaryZh,
			name_zh: nameZh
		};
	} catch {
		return {
			level: fallback.level,
			summary_en: fallbackSummaryEn,
			summary_zh: fallbackSummaryZh,
			name_zh: fallbackNameZh
		};
	}
}

async function enrichSingle(score: HotspotScore): Promise<Hotspot> {
	const { hotspot, matchedItems } = score;
	const canonicalNameZh = translateMapText(hotspot.name, 'zh-CN');
	const fallbackNameZh = hotspot.nameLocalized?.['zh-CN'] ?? canonicalNameZh;

	// Take up to 5 most recent headlines as context
	const headlines = matchedItems
		.slice()
		.sort((a, b) => b.timestamp - a.timestamp)
		.slice(0, 5)
		.map((i) => `- [${i.source}] ${i.title}`)
		.join('\n');

	const systemPrompt = `You are a geopolitical intelligence analyst.
Given location and headlines, respond ONLY as a valid JSON object (no markdown) with exact keys:
- "level": one of "critical", "high", "elevated", "low"
- "summary_en": exactly ONE sentence in English, <= 180 chars
- "summary_zh": exactly ONE sentence in Simplified Chinese, <= 90 chars
- "name_zh": concise Simplified Chinese place name

Summaries must reflect headline evidence and avoid speculation.`;

	const userPrompt = `Location: ${hotspot.name}
Recent news headlines:
${headlines}

Assess the current situation and respond with JSON.`;

	const raw = await callLlm([
		{ role: 'system', content: systemPrompt },
		{ role: 'user', content: userPrompt }
	]);

	const result = parseEnrichmentResult(raw, hotspot);
	const validatedNameZh = isConsistentLocalizedName(result.name_zh, canonicalNameZh, fallbackNameZh)
		? (result.name_zh as string).trim()
		: fallbackNameZh;

	return {
		...hotspot,
		level: result.level,
		desc: result.summary_en,
		summary: {
			'en-US': result.summary_en,
			'zh-CN': result.summary_zh
		},
		nameLocalized: {
			'en-US': hotspot.nameLocalized?.['en-US'] ?? hotspot.name,
			'zh-CN': validatedNameZh
		}
	};
}

export interface LlmEventExtraction {
	id: string;
	actors: string[];
	targets: string[];
	locations: string[];
	battlefield?: string;
	confidence: number;
}

const MAX_EVENT_EXTRACTION_ITEMS = 40;
const EVENT_EXTRACTION_BATCH_SIZE = 10;

function chunkArray<T>(items: T[], size: number): T[][] {
	if (size <= 0) return [items];
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

function parseEventExtractionResult(raw: string): LlmEventExtraction[] {
	try {
		const parsed = JSON.parse(raw) as {
			events?: Array<Partial<LlmEventExtraction>>;
		};
		if (!Array.isArray(parsed.events)) {
			return [];
		}
		return parsed.events
			.filter((event) => typeof event.id === 'string' && event.id.length > 0)
			.map((event) => ({
				id: String(event.id),
				actors: Array.isArray(event.actors)
					? event.actors.filter((value): value is string => typeof value === 'string')
					: [],
				targets: Array.isArray(event.targets)
					? event.targets.filter((value): value is string => typeof value === 'string')
					: [],
				locations: Array.isArray(event.locations)
					? event.locations.filter((value): value is string => typeof value === 'string')
					: [],
				battlefield:
					typeof event.battlefield === 'string' && event.battlefield.trim().length > 0
						? event.battlefield.trim()
						: undefined,
				confidence:
					typeof event.confidence === 'number' && Number.isFinite(event.confidence)
						? Math.max(0, Math.min(1, event.confidence))
						: 0.5
			}));
	} catch {
		return [];
	}
}

export async function extractHeadlineEventsWithLLM(
	newsItems: NewsItem[]
): Promise<Map<string, LlmEventExtraction>> {
	if (!SILICONFLOW_API_KEY) {
		return new Map();
	}

	const candidates = newsItems.slice(0, MAX_EVENT_EXTRACTION_ITEMS);
	if (candidates.length === 0) {
		return new Map();
	}

	const eventMap = new Map<string, LlmEventExtraction>();
	const batches = chunkArray(candidates, EVENT_EXTRACTION_BATCH_SIZE);

	for (const batch of batches) {
		const lines = batch.map((item) => `- id: ${item.id} | title: ${item.title}`).join('\n');
		const systemPrompt = `Extract geopolitical event structure from headlines. Reply ONLY JSON:\n{\n  \"events\": [\n    {\n      \"id\": \"string\",\n      \"actors\": [\"...\"],\n      \"targets\": [\"...\"],\n      \"locations\": [\"...\"],\n      \"battlefield\": \"string or empty\",\n      \"confidence\": 0.0\n    }\n  ]\n}`;
		const userPrompt = `Headlines:\n${lines}\n\nRules:\n1) battlefield must be the primary location of conflict if explicit.\n2) If actor sanctions target, target is not actor.\n3) Keep arrays concise and factual.`;

		try {
			const raw = await callLlm(
				[
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				900
			);
			for (const event of parseEventExtractionResult(raw)) {
				eventMap.set(event.id, event);
			}
		} catch (error) {
			console.warn('[hotspots/llm] headline extraction failed:', error);
		}
	}

	return eventMap;
}

/**
 * Enrich scored hotspots with LLM-generated threat descriptions.
 *
 * Only the top-N hotspots by score (≥ MIN_SCORE_FOR_LLM) are sent to the LLM.
 * Others are returned as-is from the algorithm layer.
 *
 * Returns the full Hotspot[] with LLM-enriched entries merged in.
 * If SILICONFLOW_API_KEY is not configured, returns `hotspots` unchanged.
 */
export async function enrichHotspotsWithLLM(
	hotspots: Hotspot[],
	scores: HotspotScore[]
): Promise<{ hotspots: Hotspot[]; enrichedCount: number }> {
	if (!SILICONFLOW_API_KEY) {
		return { hotspots, enrichedCount: 0 };
	}

	// Select candidates for LLM enrichment
	const candidates = scores
		.filter((s) => s.score >= MIN_SCORE_FOR_LLM)
		.sort((a, b) => b.score - a.score)
		.slice(0, MAX_ENRICH);

	if (candidates.length === 0) {
		return { hotspots, enrichedCount: 0 };
	}

	// Enrich in parallel with error isolation
	const enrichmentResults = await Promise.allSettled(candidates.map((c) => enrichSingle(c)));

	// Build a lookup from hotspot id/name -> enriched hotspot
	const enrichedMap = new Map<string, Hotspot>();
	let enrichedCount = 0;
	for (let i = 0; i < candidates.length; i++) {
		const result = enrichmentResults[i];
		const key = candidates[i].hotspot.id ?? candidates[i].hotspot.name;
		if (result.status === 'fulfilled') {
			enrichedMap.set(key, result.value);
			enrichedCount++;
		} else {
			console.warn(
				`[hotspots/llm] Failed to enrich ${candidates[i].hotspot.name}:`,
				result.reason
			);
		}
	}

	// Merge enriched back into the full list
	const merged = hotspots.map((h) => enrichedMap.get(h.id ?? h.name) ?? h);
	return { hotspots: merged, enrichedCount };
}
