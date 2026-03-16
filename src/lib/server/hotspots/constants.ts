import type { NewsCategory } from '$lib/types';

export const HOTSPOT_SAMPLE_LIMIT = 100;
export const HOTSPOT_ANALYSIS_WINDOW_DAYS = 5;
export const HOTSPOT_ANALYSIS_WINDOW_MS = HOTSPOT_ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export const HOTSPOT_ALLOWED_CATEGORIES: ReadonlySet<NewsCategory> = new Set([
	'politics',
	'gov',
	'intel'
]);