import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewsItem } from '$lib/types';

const extractStructuredHotspotEventsMock = vi.hoisted(() => vi.fn());
const geocodeLocationsMock = vi.hoisted(() => vi.fn());
const extractHeadlineEventsWithLLMMock = vi.hoisted(() => vi.fn());

vi.mock('./extract', async () => {
	const actual = await vi.importActual<typeof import('./extract')>('./extract');
	return {
		...actual,
		extractStructuredHotspotEvents: extractStructuredHotspotEventsMock
	};
});

vi.mock('./geocode', () => ({
	geocodeLocations: geocodeLocationsMock
}));

vi.mock('./llm', async () => {
	const actual = await vi.importActual<typeof import('./llm')>('./llm');
	return {
		...actual,
		extractHeadlineEventsWithLLM: extractHeadlineEventsWithLLMMock
	};
});

import { analyzeHotspots } from './analyze';

function makeNewsItem(overrides: Partial<NewsItem> = {}): NewsItem {
	return {
		id: overrides.id ?? 'item-1',
		title: overrides.title ?? 'Sanctions pressure intensifies',
		link: overrides.link ?? 'https://example.com/news/1',
		timestamp: overrides.timestamp ?? Date.now(),
		source: overrides.source ?? 'Reuters',
		category: overrides.category ?? 'politics',
		description: overrides.description,
		content: overrides.content,
		pubDate: overrides.pubDate,
		isAlert: overrides.isAlert ?? true,
		alertKeyword: overrides.alertKeyword,
		region: overrides.region,
		topics: overrides.topics ?? ['CONFLICT']
	};
}

describe('hotspots/analyze', () => {
	beforeEach(() => {
		extractStructuredHotspotEventsMock.mockReset();
		geocodeLocationsMock.mockReset();
		extractHeadlineEventsWithLLMMock.mockReset();
		extractHeadlineEventsWithLLMMock.mockResolvedValue(new Map());
	});

	it('skips common noun targets that are not locations', async () => {
		const item = makeNewsItem({
			id: 'energy-1',
			title: 'US sanctions pressure energy exports'
		});

		extractStructuredHotspotEventsMock.mockReturnValue([
			{
				item,
				actors: ['United States'],
				targets: ['Energy'],
				locations: [],
				battlefield: undefined,
				conflictSignals: ['sanctions'],
				interventionSignals: ['sanctions'],
				spilloverSignals: ['energy shock'],
				strategicSignals: [],
				powerActors: ['United States'],
				confidence: 0.9
			}
		]);
		geocodeLocationsMock.mockResolvedValue(new Map());

		const scores = await analyzeHotspots([item]);
		expect(scores).toEqual([]);
		expect(geocodeLocationsMock).not.toHaveBeenCalled();
	});

	it('keeps real geopolitical targets when they are the only usable location', async () => {
		const item = makeNewsItem({
			id: 'sudan-1',
			title: 'Regional powers threaten Sudan ceasefire talks'
		});

		extractStructuredHotspotEventsMock.mockReturnValue([
			{
				item,
				actors: ['Regional powers'],
				targets: ['Sudan'],
				locations: [],
				battlefield: undefined,
				conflictSignals: ['ceasefire'],
				interventionSignals: ['pressure'],
				spilloverSignals: [],
				strategicSignals: [],
				powerActors: [],
				confidence: 0.85
			}
		]);
		geocodeLocationsMock.mockResolvedValue(
			new Map([
				[
					'Sudan',
					{
						query: 'Sudan',
						name: 'Sudan',
						lat: 15.5,
						lon: 30.2,
						country: 'Sudan'
					}
				]
			])
		);

		const scores = await analyzeHotspots([item]);

		expect(scores).toHaveLength(1);
		expect(scores[0].hotspot.name).toBe('Sudan');
		expect(scores[0].hotspot.score).toBeGreaterThan(0);
		expect(geocodeLocationsMock).toHaveBeenCalledWith(['Sudan'], 60);
	});
});

