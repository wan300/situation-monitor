import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('hotspots/geocode', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('geocodeLocation should cache successful lookups', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				results: [
					{
						name: 'Tokyo',
						latitude: 35.6762,
						longitude: 139.6503,
						country: 'Japan'
					}
				]
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		const { geocodeLocation } = await import('./geocode');
		const first = await geocodeLocation('Tokyo');
		const second = await geocodeLocation('Tokyo');

		expect(first).toBeTruthy();
		expect(second).toEqual(first);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('geocodeLocation should deduplicate in-flight requests', async () => {
		let resolveFetch: ((value: unknown) => void) | undefined;
		const fetchPromise = new Promise((resolve) => {
			resolveFetch = resolve;
		});

		const fetchMock = vi.fn().mockReturnValue(fetchPromise);
		vi.stubGlobal('fetch', fetchMock);

		const { geocodeLocation } = await import('./geocode');
		const requestA = geocodeLocation('Berlin');
		const requestB = geocodeLocation('Berlin');

		expect(fetchMock).toHaveBeenCalledTimes(1);

		if (!resolveFetch) {
			throw new Error('Expected fetch resolver to be defined');
		}

		resolveFetch({
			ok: true,
			json: async () => ({
				results: [
					{
						name: 'Berlin',
						latitude: 52.52,
						longitude: 13.405,
						country: 'Germany'
					}
				]
			})
		});

		const [resultA, resultB] = await Promise.all([requestA, requestB]);
		expect(resultA).toEqual(resultB);
		expect(resultA?.name).toBe('Berlin');
	});

	it('geocodeLocations should dedupe repeated input queries', async () => {
		const fetchMock = vi.fn(async (input: string | URL) => {
			const url = new URL(String(input));
			const query = url.searchParams.get('name');

			if (query === 'Kyiv') {
				return {
					ok: true,
					json: async () => ({
						results: [{ name: 'Kyiv', latitude: 50.45, longitude: 30.523 }]
					})
				};
			}

			if (query === 'Tokyo') {
				return {
					ok: true,
					json: async () => ({
						results: [{ name: 'Tokyo', latitude: 35.6762, longitude: 139.6503 }]
					})
				};
			}

			return {
				ok: true,
				json: async () => ({ results: [] })
			};
		});
		vi.stubGlobal('fetch', fetchMock);

		const { geocodeLocations } = await import('./geocode');
		const results = await geocodeLocations(['Kyiv', 'Kyiv', 'Tokyo', '  '], 10);

		expect(results.size).toBe(2);
		expect(results.get('Kyiv')?.lat).toBe(50.45);
		expect(results.get('Tokyo')?.lon).toBe(139.6503);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});