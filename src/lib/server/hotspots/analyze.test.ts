import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewsItem } from '$lib/types';
import type { HotspotScore } from './analyze';

const extractLocationCandidatesMock = vi.hoisted(() => vi.fn());
const geocodeLocationsMock = vi.hoisted(() => vi.fn());

vi.mock('./extract', () => ({
	extractLocationCandidates: extractLocationCandidatesMock
}));

vi.mock('./geocode', () => ({
	geocodeLocations: geocodeLocationsMock
}));

import { analyzeHotspots, scoresToHotspots } from './analyze';

function makeNewsItem(overrides: Partial<NewsItem>): NewsItem {
	return {
		id: overrides.id ?? 'item-1',
		title: overrides.title ?? 'Kyiv sees renewed clashes',
		link: overrides.link ?? 'https://example.com/news/1',
		timestamp: overrides.timestamp ?? Date.now(),
		source: overrides.source ?? 'Reuters',
		category: overrides.category ?? 'politics',
		description: overrides.description,
		content: overrides.content,
		pubDate: overrides.pubDate,
		isAlert: overrides.isAlert,
		alertKeyword: overrides.alertKeyword,
		region: overrides.region,
		topics: overrides.topics
	};
}

function makeScore(name: string, score: number, lastSeenAt: number): HotspotScore {
	return {
		hotspot: {
			id: `${name.toLowerCase()}-${score}`,
			name,
			lat: 0,
			lon: 0,
			level: 'low',
			desc: `${name} fallback`,
			lastSeenAt
		},
		score,
		matchedItems: [],
		mentions: score,
		alertMentions: 0,
		recentMentions: 0,
		sourceDiversity: 1
	};
}

describe('hotspots/analyze', () => {
	beforeEach(() => {
		extractLocationCandidatesMock.mockReset();
		geocodeLocationsMock.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('analyzeHotspots should build scored hotspots from candidates and geocode results', async () => {
		const itemA = makeNewsItem({
			id: 'a',
			title: 'Kyiv front changes',
			source: 'BBC',
			isAlert: true,
			topics: ['CONFLICT']
		});
		const itemB = makeNewsItem({
			id: 'b',
			title: 'Kyiv talks continue',
			source: 'Reuters',
			topics: ['CONFLICT']
		});

		extractLocationCandidatesMock.mockReturnValue([
			{
				key: 'kyiv',
				query: 'Kyiv',
				displayName: 'Kyiv',
				mentions: 2,
				alertMentions: 1,
				recentMentions: 2,
				sourceDiversity: 2,
				lastSeenAt: Date.now(),
				matchedItems: [itemA, itemB]
			}
		]);

		geocodeLocationsMock.mockResolvedValue(
			new Map([
				[
					'Kyiv',
					{
						query: 'Kyiv',
						name: 'Kyiv',
						lat: 50.45,
						lon: 30.523,
						country: 'Ukraine'
					}
				]
			])
		);

		const scores = await analyzeHotspots([itemA, itemB]);

		expect(scores).toHaveLength(1);
		expect(scores[0].score).toBeGreaterThanOrEqual(18);
		expect(scores[0].hotspot.level).toBe('high');
		expect(scores[0].hotspot.name).toBe('Kyiv');
		expect(scores[0].hotspot.summary?.['en-US']).toContain('Kyiv is a live hotspot');
		expect(geocodeLocationsMock).toHaveBeenCalledWith(['Kyiv'], 40);
	});

	it('analyzeHotspots should return empty when neither dynamic nor association evidence exists', async () => {
		extractLocationCandidatesMock.mockReturnValue([]);

		const results = await analyzeHotspots([
			makeNewsItem({ id: 'single', title: 'General economic briefing and policy calendar' })
		]);

		expect(results).toEqual([]);
		expect(geocodeLocationsMock).not.toHaveBeenCalled();
	});

	it('analyzeHotspots should exclude tech and ai categories in conflict-focused mode', async () => {
		extractLocationCandidatesMock.mockReturnValue([]);

		const results = await analyzeHotspots([
			makeNewsItem({
				id: 'politics-1',
				title: 'Kyiv frontline shelling intensifies overnight',
				category: 'politics',
				isAlert: true,
				topics: ['CONFLICT']
			}),
			makeNewsItem({
				id: 'tech-1',
				title: 'AI battlefield simulation highlights Kyiv frontline',
				category: 'tech',
				isAlert: true,
				topics: ['CONFLICT']
			}),
			makeNewsItem({
				id: 'ai-1',
				title: 'Machine learning predicts missile strike patterns in Kyiv',
				category: 'ai',
				isAlert: true,
				topics: ['CONFLICT']
			})
		]);

		expect(results).toHaveLength(1);
		const matchedIds = results.flatMap((score) => score.matchedItems.map((item) => item.id));
		expect(matchedIds).toContain('politics-1');
		expect(matchedIds).not.toContain('tech-1');
		expect(matchedIds).not.toContain('ai-1');
		expect(geocodeLocationsMock).not.toHaveBeenCalled();
	});

	it('analyzeHotspots should use a 5-day recent mention window', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-10T00:00:00.000Z'));
		extractLocationCandidatesMock.mockReturnValue([]);

		const now = Date.now();
		const results = await analyzeHotspots([
			makeNewsItem({
				id: 'fresh',
				title: 'Kyiv missile strike reported',
				category: 'politics',
				isAlert: true,
				topics: ['CONFLICT'],
				timestamp: now - 2 * 24 * 60 * 60 * 1000
			}),
			makeNewsItem({
				id: 'stale',
				title: 'Kyiv missile strike reported',
				category: 'politics',
				isAlert: true,
				topics: ['CONFLICT'],
				timestamp: now - 6 * 24 * 60 * 60 * 1000
			})
		]);

		expect(results).toHaveLength(1);
		expect(results[0].recentMentions).toBe(1);
	});

	it('analyzeHotspots should give extra weight when CONFLICT topic is present', async () => {
		extractLocationCandidatesMock.mockReturnValue([]);

		const withConflictTopic = await analyzeHotspots([
			makeNewsItem({
				id: 'with-topic',
				title: 'Kyiv missile strike reported',
				category: 'politics',
				isAlert: true,
				topics: ['CONFLICT']
			})
		]);

		const withoutConflictTopic = await analyzeHotspots([
			makeNewsItem({
				id: 'without-topic',
				title: 'Kyiv missile strike reported',
				category: 'politics',
				isAlert: true,
				topics: ['DEFENSE']
			})
		]);

		expect(withConflictTopic).toHaveLength(1);
		expect(withoutConflictTopic).toHaveLength(1);
		expect(withConflictTopic[0].score).toBeGreaterThan(withoutConflictTopic[0].score);
	});

	it('scoresToHotspots should keep only active hotspots when threshold is met', () => {
		const hotspots = scoresToHotspots([
			makeScore('A', 10, 100),
			makeScore('B', 3, 300),
			makeScore('C', 8, 200)
		]);

		expect(hotspots).toHaveLength(2);
		expect(hotspots[0].name).toBe('A');
		expect(hotspots[1].name).toBe('C');
	});

	it('scoresToHotspots should return weak non-zero signals when none reaches active threshold', () => {
		const hotspots = scoresToHotspots([
			makeScore('Weak-A', 3, 200),
			makeScore('Weak-B', 1, 300),
			makeScore('Weak-C', 0, 400)
		]);

		expect(hotspots).toHaveLength(2);
		expect(hotspots[0].name).toBe('Weak-A');
		expect(hotspots[1].name).toBe('Weak-B');
	});
});