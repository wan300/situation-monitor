import type { Client, InStatement } from '@libsql/client';
import type { NewsCategory, NewsItem } from '$lib/types';
import { NEWS_CATEGORIES } from './constants';

export type IngestRunStatus = 'success' | 'failed';

export interface NewsSnapshot {
	categories: Record<NewsCategory, NewsItem[]>;
	lastIngestAt: number | null;
	totalItems: number;
}

function toNumber(value: unknown, fallback = 0): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'bigint') {
		return Number(value);
	}
	if (typeof value === 'string') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return fallback;
}

function toNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined) {
		return null;
	}
	const parsed = toNumber(value, Number.NaN);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseTopics(topicsJson: unknown): string[] | undefined {
	if (typeof topicsJson !== 'string' || topicsJson.length === 0) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(topicsJson);
		if (Array.isArray(parsed)) {
			return parsed.filter((topic): topic is string => typeof topic === 'string');
		}
	} catch {
		return undefined;
	}

	return undefined;
}

function rowToNewsItem(row: Record<string, unknown>, category: NewsCategory): NewsItem {
	return {
		id: String(row.id ?? ''),
		title: String(row.title ?? ''),
		link: String(row.link ?? ''),
		pubDate: row.pub_date ? String(row.pub_date) : undefined,
		timestamp: toNumber(row.timestamp, Date.now()),
		source: String(row.source ?? 'Unknown'),
		category,
		isAlert: toNumber(row.is_alert, 0) === 1,
		alertKeyword: row.alert_keyword ? String(row.alert_keyword) : undefined,
		region: row.region ? String(row.region) : undefined,
		topics: parseTopics(row.topics_json)
	};
}

function serializeTopics(topics: string[] | undefined): string {
	return JSON.stringify(topics ?? []);
}

function serializeAlert(alert: boolean | undefined): number {
	return alert ? 1 : 0;
}

function emptyCategories(): Record<NewsCategory, NewsItem[]> {
	return {
		politics: [],
		tech: [],
		finance: [],
		gov: [],
		ai: [],
		intel: []
	};
}

export async function startIngestRun(db: Client): Promise<number> {
	const startedAt = Date.now();
	const result = await db.execute({
		sql: 'INSERT INTO news_ingest_runs (started_at, status, fetched_count) VALUES (?, ?, ?)',
		args: [startedAt, 'running', 0]
	});

	return toNumber(result.lastInsertRowid, 0);
}

export async function finishIngestRun(
	db: Client,
	runId: number,
	status: IngestRunStatus,
	fetchedCount: number,
	errorMessage: string | null
): Promise<number> {
	const completedAt = Date.now();

	await db.execute({
		sql: `
			UPDATE news_ingest_runs
			SET completed_at = ?, status = ?, fetched_count = ?, error = ?
			WHERE id = ?
		`,
		args: [completedAt, status, fetchedCount, errorMessage, runId]
	});

	return completedAt;
}

export async function upsertNewsItems(db: Client, items: NewsItem[], fetchedAt: number): Promise<void> {
	if (items.length === 0) {
		return;
	}

	const statements: InStatement[] = items.map((item) => ({
		sql: `
			INSERT INTO news_items (
				id,
				category,
				title,
				link,
				source,
				pub_date,
				timestamp,
				is_alert,
				alert_keyword,
				region,
				topics_json,
				fetched_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				title = excluded.title,
				link = excluded.link,
				source = excluded.source,
				pub_date = excluded.pub_date,
				timestamp = excluded.timestamp,
				is_alert = excluded.is_alert,
				alert_keyword = excluded.alert_keyword,
				region = excluded.region,
				topics_json = excluded.topics_json,
				fetched_at = excluded.fetched_at
		`,
		args: [
			item.id,
			item.category,
			item.title,
			item.link,
			item.source,
			item.pubDate ?? null,
			item.timestamp,
			serializeAlert(item.isAlert),
			item.alertKeyword ?? null,
			item.region ?? null,
			serializeTopics(item.topics),
			fetchedAt
		]
	}));

	await db.batch(statements, 'write');
}

export async function purgeExpiredNews(db: Client, retentionDays: number): Promise<number> {
	const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
	const cutoffTimestamp = Date.now() - retentionMs;

	const result = await db.execute({
		sql: 'DELETE FROM news_items WHERE timestamp < ?',
		args: [cutoffTimestamp]
	});

	return toNumber(result.rowsAffected, 0);
}

export async function getNewsSnapshot(db: Client, limitPerCategory: number): Promise<NewsSnapshot> {
	const categories = emptyCategories();

	for (const category of NEWS_CATEGORIES) {
		const result = await db.execute({
			sql: `
				SELECT id, title, link, source, pub_date, timestamp, is_alert, alert_keyword, region, topics_json
				FROM news_items
				WHERE category = ?
				ORDER BY timestamp DESC
				LIMIT ?
			`,
			args: [category, limitPerCategory]
		});

		categories[category] = result.rows.map((row) => rowToNewsItem(row as Record<string, unknown>, category));
	}

	const ingestResult = await db.execute({
		sql: "SELECT MAX(completed_at) AS last_ingest_at FROM news_ingest_runs WHERE status = 'success'"
	});

	const ingestRow = ingestResult.rows[0] as Record<string, unknown> | undefined;
	const lastIngestAt = toNullableNumber(ingestRow?.last_ingest_at);
	const totalItems = NEWS_CATEGORIES.reduce((sum, category) => sum + categories[category].length, 0);

	return {
		categories,
		lastIngestAt,
		totalItems
	};
}

export async function getNewsSnapshotByWindow(
	db: Client,
	windowDays: number,
	limitPerCategory: number
): Promise<NewsSnapshot> {
	const safeWindowDays = Number.isFinite(windowDays) ? Math.max(1, Math.floor(windowDays)) : 1;
	const cutoffTimestamp = Date.now() - safeWindowDays * 24 * 60 * 60 * 1000;
	const categories = emptyCategories();

	for (const category of NEWS_CATEGORIES) {
		const result = await db.execute({
			sql: `
				SELECT id, title, link, source, pub_date, timestamp, is_alert, alert_keyword, region, topics_json
				FROM news_items
				WHERE category = ? AND timestamp >= ?
				ORDER BY timestamp DESC
				LIMIT ?
			`,
			args: [category, cutoffTimestamp, limitPerCategory]
		});

		categories[category] = result.rows.map((row) => rowToNewsItem(row as Record<string, unknown>, category));
	}

	const ingestResult = await db.execute({
		sql: "SELECT MAX(completed_at) AS last_ingest_at FROM news_ingest_runs WHERE status = 'success'"
	});

	const ingestRow = ingestResult.rows[0] as Record<string, unknown> | undefined;
	const lastIngestAt = toNullableNumber(ingestRow?.last_ingest_at);
	const totalItems = NEWS_CATEGORIES.reduce((sum, category) => sum + categories[category].length, 0);

	return {
		categories,
		lastIngestAt,
		totalItems
	};
}
