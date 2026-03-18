import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hotspot } from '$lib/config/map';
import type { HotspotScore } from './analyze';

function makeHotspot(overrides: Partial<Hotspot> = {}): Hotspot {
	return {
		id: overrides.id ?? 'kyiv-1',
		name: overrides.name ?? 'Kyiv',
		nameLocalized: overrides.nameLocalized ?? {
			'en-US': 'Kyiv',
			'zh-CN': '基辅'
		},
		lat: overrides.lat ?? 50.45,
		lon: overrides.lon ?? 30.52,
		level: overrides.level ?? 'elevated',
		desc: overrides.desc ?? 'Kyiv fallback summary',
		summary: overrides.summary ?? {
			'en-US': 'Kyiv fallback summary',
			'zh-CN': '基辅回退摘要'
		},
		score: overrides.score ?? 10,
		mentions: overrides.mentions ?? 4,
		alertMentions: overrides.alertMentions ?? 1,
		recentMentions: overrides.recentMentions ?? 3,
		sourceDiversity: overrides.sourceDiversity ?? 2,
		lastSeenAt: overrides.lastSeenAt ?? Date.now()
	};
}

function makeScore(hotspot: Hotspot): HotspotScore {
	return {
		hotspot,
		score: hotspot.score ?? 10,
		matchedItems: [
			{
				id: 'n-1',
				title: 'Kyiv reports missile strikes overnight',
				link: 'https://example.com/1',
				timestamp: Date.now(),
				source: 'Reuters',
				category: 'politics',
				isAlert: true
			}
		],
		mentions: hotspot.mentions ?? 4,
		alertMentions: hotspot.alertMentions ?? 1,
		recentMentions: hotspot.recentMentions ?? 3,
		sourceDiversity: hotspot.sourceDiversity ?? 2,
		dimensions: {
			frequency: 0,
			conflict: 0,
			power: 0,
			spillover: 0,
			temporal: 0
		}
	};
}

describe('hotspots/llm', () => {
	const originalApiKey = process.env.SILICONFLOW_API_KEY;

	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		if (originalApiKey === undefined) {
			delete process.env.SILICONFLOW_API_KEY;
		} else {
			process.env.SILICONFLOW_API_KEY = originalApiKey;
		}
		vi.unstubAllGlobals();
	});

	it('returns original hotspots when API key is missing', async () => {
		delete process.env.SILICONFLOW_API_KEY;
		const { enrichHotspotsWithLLM } = await import('./llm');

		const hotspot = makeHotspot();
		const score = makeScore(hotspot);
		const result = await enrichHotspotsWithLLM([hotspot], [score]);

		expect(result.enrichedCount).toBe(0);
		expect(result.hotspots).toEqual([hotspot]);
	});

	it('keeps fallback Chinese name when LLM name is inconsistent', async () => {
		process.env.SILICONFLOW_API_KEY = 'test-key';
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [
					{
						message: {
							content: JSON.stringify({
								level: 'high',
								summary_en: 'Kyiv remains under elevated military pressure.',
								summary_zh: '基辅维持高压态势。',
								name_zh: '错误地名'
							})
						}
					}
				]
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		const { enrichHotspotsWithLLM } = await import('./llm');
		const hotspot = makeHotspot();
		const score = makeScore(hotspot);
		const result = await enrichHotspotsWithLLM([hotspot], [score]);

		expect(result.enrichedCount).toBe(1);
		expect(result.hotspots[0].nameLocalized?.['zh-CN']).toBe('基辅');
		expect(result.hotspots[0].summary?.['zh-CN']).toBe('基辅维持高压态势。');
	});

	it('falls back when the model returns corrupted summary text', async () => {
		process.env.SILICONFLOW_API_KEY = 'test-key';
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [
					{
						message: {
							content: JSON.stringify({
								level: 'high',
								summary_en: 'GreeceI���� strategic clarity behind Indian ships',
								summary_zh: '基辅��态势升级',
								name_zh: '基辅'
							})
						}
					}
				]
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		const { enrichHotspotsWithLLM } = await import('./llm');
		const hotspot = makeHotspot();
		const score = makeScore(hotspot);
		const result = await enrichHotspotsWithLLM([hotspot], [score]);

		expect(result.enrichedCount).toBe(1);
		expect(result.hotspots[0].summary?.['en-US']).toBe('Kyiv fallback summary');
		expect(result.hotspots[0].summary?.['zh-CN']).toBe('基辅回退摘要');
	});
});


