import { createClient, type Client } from '@libsql/client';
import { env } from '$env/dynamic/private';

const DEFAULT_LOCAL_DB_URL = 'file:./situation-monitor.db';

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function getDbUrl(): string {
	return env.TURSO_DATABASE_URL || env.DATABASE_URL || DEFAULT_LOCAL_DB_URL;
}

function getDbAuthToken(): string | undefined {
	const token = env.TURSO_AUTH_TOKEN?.trim();
	return token ? token : undefined;
}

function getClient(): Client {
	if (client) {
		return client;
	}

	const url = getDbUrl();
	const authToken = getDbAuthToken();

	client = createClient(
		authToken
			? {
					url,
					authToken
				}
			: {
					url
				}
	);

	return client;
}

async function initializeSchema(db: Client): Promise<void> {
	await db.execute(`
		CREATE TABLE IF NOT EXISTS news_items (
			id TEXT PRIMARY KEY,
			category TEXT NOT NULL,
			title TEXT NOT NULL,
			link TEXT NOT NULL,
			source TEXT NOT NULL,
			pub_date TEXT,
			timestamp INTEGER NOT NULL,
			is_alert INTEGER NOT NULL DEFAULT 0,
			alert_keyword TEXT,
			region TEXT,
			topics_json TEXT,
			fetched_at INTEGER NOT NULL
		)
	`);

	await db.execute(`
		CREATE INDEX IF NOT EXISTS idx_news_items_category_timestamp
		ON news_items (category, timestamp DESC)
	`);

	await db.execute(`
		CREATE INDEX IF NOT EXISTS idx_news_items_fetched_at
		ON news_items (fetched_at DESC)
	`);

	await db.execute(`
		CREATE TABLE IF NOT EXISTS news_ingest_runs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			started_at INTEGER NOT NULL,
			completed_at INTEGER,
			status TEXT NOT NULL,
			fetched_count INTEGER NOT NULL DEFAULT 0,
			error TEXT
		)
	`);

	await db.execute(`
		CREATE INDEX IF NOT EXISTS idx_news_ingest_runs_completed_at
		ON news_ingest_runs (completed_at DESC)
	`);
}

export async function getNewsDb(): Promise<Client> {
	const db = getClient();

	if (!schemaReady) {
		schemaReady = initializeSchema(db);
	}

	await schemaReady;
	return db;
}
