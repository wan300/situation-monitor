export interface GeocodedLocation {
	query: string;
	name: string;
	lat: number;
	lon: number;
	country?: string;
	admin1?: string;
	timezone?: string;
}

interface CacheEntry {
	value: GeocodedLocation | null;
	updatedAt: number;
}

interface OpenMeteoLocation {
	name: string;
	latitude: number;
	longitude: number;
	country?: string;
	admin1?: string;
	timezone?: string;
}

interface OpenMeteoPayload {
	results?: OpenMeteoLocation[];
}

const GEOCODE_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const geocodeCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<GeocodedLocation | null>>();

function normalizeKey(query: string): string {
	return query.trim().toLowerCase();
}

function isCacheValid(entry: CacheEntry): boolean {
	return Date.now() - entry.updatedAt < GEOCODE_CACHE_TTL_MS;
}

async function fetchGeocode(query: string): Promise<GeocodedLocation | null> {
	const url = new URL(GEOCODE_ENDPOINT);
	url.searchParams.set('name', query);
	url.searchParams.set('count', '1');
	url.searchParams.set('language', 'en');
	url.searchParams.set('format', 'json');

	const response = await fetch(url.toString(), {
		headers: {
			Accept: 'application/json'
		}
	});

	if (!response.ok) {
		return null;
	}

	const payload = (await response.json()) as OpenMeteoPayload;
	const top = payload.results?.[0];
	if (!top) {
		return null;
	}

	if (typeof top.latitude !== 'number' || typeof top.longitude !== 'number') {
		return null;
	}

	return {
		query,
		name: top.name || query,
		lat: top.latitude,
		lon: top.longitude,
		country: top.country,
		admin1: top.admin1,
		timezone: top.timezone
	};
}

export async function geocodeLocation(query: string): Promise<GeocodedLocation | null> {
	const normalizedQuery = query.trim();
	if (!normalizedQuery) return null;

	const key = normalizeKey(normalizedQuery);
	const cached = geocodeCache.get(key);
	if (cached && isCacheValid(cached)) {
		return cached.value;
	}

	const existingRequest = inFlight.get(key);
	if (existingRequest) {
		return existingRequest;
	}

	const request = fetchGeocode(normalizedQuery)
		.catch((error) => {
			console.warn('[hotspots/geocode] request failed:', normalizedQuery, error);
			return null;
		})
		.then((result) => {
			geocodeCache.set(key, { value: result, updatedAt: Date.now() });
			inFlight.delete(key);
			return result;
		});

	inFlight.set(key, request);
	return request;
}

export async function geocodeLocations(
	queries: string[],
	maxRequests = 40
): Promise<Map<string, GeocodedLocation>> {
	const uniqueQueries = Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean))).slice(
		0,
		maxRequests
	);

	const entries = await Promise.all(
		uniqueQueries.map(async (query) => [query, await geocodeLocation(query)] as const)
	);

	const geocoded = new Map<string, GeocodedLocation>();
	for (const [query, result] of entries) {
		if (result) {
			geocoded.set(query, result);
		}
	}

	return geocoded;
}
