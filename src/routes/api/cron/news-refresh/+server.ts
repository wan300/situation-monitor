import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { runNewsIngestion } from '$lib/server/news/ingest';

export const prerender = false;

function getCronSecret(): string | null {
	const secret = env.NEWS_CRON_SECRET || env.CRON_SECRET;
	if (!secret) {
		return null;
	}

	const trimmed = secret.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function isAuthorized(request: Request): boolean {
	const configuredSecret = getCronSecret();
	if (!configuredSecret) {
		return true;
	}

	const directSecret = request.headers.get('x-cron-secret')?.trim();
	if (directSecret && directSecret === configuredSecret) {
		return true;
	}

	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) {
		return false;
	}

	const token = authorization.slice('Bearer '.length).trim();
	return token === configuredSecret;
}

async function handleRefresh(request: Request) {
	if (!isAuthorized(request)) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const summary = await runNewsIngestion();
		return json(summary);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[news-refresh cron] ingestion failed:', error);
		return json(
			{
				error: 'news_ingestion_failed',
				message
			},
			{ status: 500 }
		);
	}
}

export const GET: RequestHandler = async ({ request }) => {
	return handleRefresh(request);
};

export const POST: RequestHandler = async ({ request }) => {
	return handleRefresh(request);
};
