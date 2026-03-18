import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { DEFAULT_NEWS_LIMIT } from '$lib/server/news/constants';
import { getLatestNewsSnapshot, runNewsIngestion } from '$lib/server/news/ingest';

export const prerender = false;

let bootstrapPromise: Promise<void> | null = null;

function shouldBootstrapOnEmptySnapshot(): boolean {
	const configured = env.NEWS_BOOTSTRAP_ON_EMPTY?.trim().toLowerCase();

	if (!configured) {
		return true;
	}

	return !['0', 'false', 'off', 'no'].includes(configured);
}

function normalizeLimit(input: string | null): number {
	if (!input) {
		return DEFAULT_NEWS_LIMIT;
	}

	const parsed = Number(input);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return DEFAULT_NEWS_LIMIT;
	}

	return Math.min(Math.floor(parsed), 50);
}

async function ensureInitialData(): Promise<void> {
	if (!bootstrapPromise) {
		bootstrapPromise = runNewsIngestion()
			.then(() => undefined)
			.catch((error) => {
				console.error('[news snapshot] bootstrap ingest failed:', error);
			})
			.finally(() => {
				bootstrapPromise = null;
			});
	}

	await bootstrapPromise;
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const limit = normalizeLimit(url.searchParams.get('limit'));
		let snapshot = await getLatestNewsSnapshot(limit);

		if (snapshot.totalItems === 0 && shouldBootstrapOnEmptySnapshot()) {
			await ensureInitialData();
			snapshot = await getLatestNewsSnapshot(limit);
		}

		return json(snapshot, {
			headers: {
				'cache-control': 'public, max-age=60, stale-while-revalidate=300'
			}
		});
	} catch (error) {
		console.error('[news snapshot] failed to load snapshot:', error);
		return json(
			{
				error: 'failed_to_load_news_snapshot'
			},
			{ status: 500 }
		);
	}
};
