import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewsItem } from '$lib/types';
import { canonicalizeLocationName, extractLocationCandidates } from './extract';

function makeNewsItem(overrides: Partial<NewsItem>): NewsItem {
	return {
		id: overrides.id ?? 'item-1',
		title: overrides.title ?? 'Kyiv sees new talks',
		link: overrides.link ?? 'https://example.com/news/1',
		timestamp: overrides.timestamp ?? Date.now(),
		source: overrides.source ?? 'Reuters',
		category: overrides.category ?? 'politics',
		isAlert: overrides.isAlert,
		description: overrides.description,
		region: overrides.region,
		topics: overrides.topics,
		alertKeyword: overrides.alertKeyword,
		pubDate: overrides.pubDate,
		content: overrides.content
	};
}

describe('hotspots/extract', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('canonicalizeLocationName should normalize aliases', () => {
		expect(canonicalizeLocationName(' us ')).toBe('United States');
		expect(canonicalizeLocationName('U.S.')).toBe('United States');
		expect(canonicalizeLocationName('Taiwan Strait')).toBe('Taiwan Strait');
		expect(canonicalizeLocationName('Berlin')).toBe('Berlin');
	});

	it('extractLocationCandidates should aggregate mentions, alerts and source diversity', () => {
		const now = Date.now();
		const items: NewsItem[] = [
			makeNewsItem({
				id: 'n1',
				title: 'Kyiv braces for attack',
				source: 'BBC',
				timestamp: now - 30 * 60 * 1000,
				isAlert: true
			}),
			makeNewsItem({
				id: 'n2',
				title: 'Kyiv and NATO hold talks',
				source: 'Reuters',
				timestamp: now - 2 * 60 * 60 * 1000,
				isAlert: false
			}),
			makeNewsItem({
				id: 'n3',
				title: 'US officials discuss sanctions',
				description: 'The U.S. strategy is shifting quickly.',
				source: 'AP',
				timestamp: now - 3 * 60 * 60 * 1000,
				isAlert: true
			}),
			makeNewsItem({
				id: 'n4',
				title: 'President addresses economy outlook',
				source: 'AP',
				timestamp: now - 60 * 60 * 1000
			})
		];

		const candidates = extractLocationCandidates(items);

		const kyiv = candidates.find((candidate) => candidate.query === 'Kyiv');
		expect(kyiv).toBeDefined();
		expect(kyiv?.mentions).toBe(2);
		expect(kyiv?.alertMentions).toBe(1);
		expect(kyiv?.recentMentions).toBe(2);
		expect(kyiv?.sourceDiversity).toBe(2);

		const unitedStates = candidates.find((candidate) => candidate.query === 'United States');
		expect(unitedStates).toBeDefined();
		expect(unitedStates?.mentions).toBe(1);
		expect(unitedStates?.alertMentions).toBe(1);
		expect(unitedStates?.sourceDiversity).toBe(1);

		// "President" is a stopword and should not become a location candidate.
		expect(candidates.some((candidate) => candidate.query === 'President')).toBe(false);
	});

	it('extractLocationCandidates should count recentMentions using a 5-day window', () => {
		const now = Date.now();
		const items: NewsItem[] = [
			makeNewsItem({
				id: 'k1',
				title: 'Kyiv frontline shelling continues',
				source: 'AP',
				timestamp: now - 2 * 24 * 60 * 60 * 1000,
				isAlert: true
			}),
			makeNewsItem({
				id: 'k2',
				title: 'Kyiv officials discuss ceasefire framework',
				source: 'Reuters',
				timestamp: now - 6 * 24 * 60 * 60 * 1000,
				isAlert: false
			})
		];

		const candidates = extractLocationCandidates(items);
		const kyiv = candidates.find((candidate) => candidate.query === 'Kyiv');

		expect(kyiv).toBeDefined();
		expect(kyiv?.mentions).toBe(2);
		expect(kyiv?.recentMentions).toBe(1);
	});

	it('extractLocationCandidates should not treat region labels as geocodable locations', () => {
		const items: NewsItem[] = [
			makeNewsItem({
				id: 'r1',
				title: 'Regional tensions rise after sanctions update',
				source: 'AP',
				region: 'AMERICAS'
			})
		];

		const candidates = extractLocationCandidates(items);
		expect(candidates.some((candidate) => candidate.query === 'AMERICAS')).toBe(false);
		expect(candidates.some((candidate) => candidate.query === 'Americas')).toBe(false);
	});

	it('extractLocationCandidates should filter noisy title-case non-location words', () => {
		const items: NewsItem[] = [
			makeNewsItem({ id: 'n1', title: 'Why markets are moving today', source: 'Reuters' }),
			makeNewsItem({ id: 'n2', title: 'Leader warns of inflation risk', source: 'Bloomberg' }),
			makeNewsItem({ id: 'n3', title: 'Stocks fall after late session', source: 'CNBC' }),
			makeNewsItem({ id: 'n4', title: 'Opposition calls for early vote', source: 'BBC' })
		];

		const candidates = extractLocationCandidates(items);
		const names = candidates.map((candidate) => candidate.query.toLowerCase());
		expect(names).not.toContain('why');
		expect(names).not.toContain('leader');
		expect(names).not.toContain('stocks');
		expect(names).not.toContain('opposition');
	});
});