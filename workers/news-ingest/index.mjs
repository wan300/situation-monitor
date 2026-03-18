#!/usr/bin/env node

import { createClient } from '@libsql/client';

const DEFAULT_LOCAL_DB_URL = 'file:./situation-monitor.db';
const DEFAULT_GDELT_TIMESPAN = '14d';
const DEFAULT_GDELT_MAX_RECORDS = '60';
const DEFAULT_CATEGORY_DELAY_MS = 6000;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_FETCH_TIMEOUT_MS = 30000;
const DEFAULT_FETCH_RETRIES = 2;
const DEFAULT_FETCH_RETRY_DELAY_MS = 5000;
const DEFAULT_GDELT_MIN_REQUEST_GAP_MS = 6000;
const HARD_MIN_GDELT_REQUEST_GAP_MS = 6000;

const NEWS_CATEGORIES = ['politics', 'tech', 'finance', 'gov', 'ai', 'intel'];

const CONFLICT_QUERY_TERMS =
	'(ceasefire OR airstrike OR shelling OR frontline OR insurgency OR militia OR "proxy war" OR bombardment)';

const GLOBAL_MAJOR_COUNTRY_QUERY_TERMS =
	'("united states" OR china OR russia OR india OR japan OR germany OR france OR "united kingdom" OR britain OR italy OR canada OR australia OR "south korea" OR israel OR iran OR turkey OR saudi OR brazil OR mexico OR indonesia OR pakistan OR ukraine OR taiwan OR "north korea")';

const GLOBAL_GOV_ORG_QUERY_TERMS =
	'(nato OR "european union" OR "united nations" OR "security council" OR asean OR "african union" OR "g7" OR "g20")';

const CATEGORY_QUERIES = {
	politics:
		'(politics OR government OR election OR parliament OR congress OR sanctions OR "foreign policy" OR diplomacy OR "state department")',
	tech: '(technology OR software OR startup OR "silicon valley")',
	finance: '(finance OR "stock market" OR economy OR banking)',
	gov:
		'("federal government" OR "white house" OR regulation OR "public administration" OR "executive order" OR "national security council" OR "defense ministry" OR "foreign ministry")',
	ai: '("artificial intelligence" OR "machine learning" OR AI OR ChatGPT)',
	intel: `(intelligence OR security OR military OR defense OR espionage OR covert OR "national security" OR "foreign intelligence" OR ${CONFLICT_QUERY_TERMS} OR ${GLOBAL_MAJOR_COUNTRY_QUERY_TERMS} OR ${GLOBAL_GOV_ORG_QUERY_TERMS})`
};

const CATEGORY_FALLBACK_QUERIES = {
	politics: '("government policy" OR election OR parliament OR congress OR diplomacy OR sanctions)',
	tech: '(technology OR software OR startup OR "silicon valley")',
	finance: '(finance OR "stock market" OR economy OR banking)',
	gov:
		'("public policy" OR regulation OR "federal agency" OR "executive order" OR "defense ministry" OR "foreign ministry")',
	ai: '("artificial intelligence" OR "machine learning" OR AI OR ChatGPT)',
	intel:
		'(intelligence OR security OR military OR defense OR espionage OR "national security" OR "united states" OR china OR russia OR ukraine OR taiwan OR israel OR iran)'
};

const ALERT_KEYWORDS = [
	'war',
	'invasion',
	'military',
	'nuclear',
	'sanctions',
	'missile',
	'attack',
	'troops',
	'conflict',
	'strike',
	'bomb',
	'casualties',
	'ceasefire',
	'treaty',
	'nato',
	'coup',
	'martial law',
	'emergency',
	'assassination',
	'terrorist',
	'hostage',
	'evacuation',
	'airstrike',
	'shelling',
	'frontline',
	'insurgency',
	'proxy war',
	'militia',
	'artillery',
	'drone strike',
	'cross-border',
	'bombardment',
	'retaliation',
	'defense ministry',
	'foreign ministry',
	'national security council',
	'state of emergency',
	'military exercise',
	'naval drill',
	'carrier strike group',
	'ballistic missile',
	'no-fly zone',
	'mobilization',
	'conscription',
	'war games',
	'deterrence'
];

const REGION_KEYWORDS = {
	EUROPE: [
		'nato',
		'eu',
		'european',
		'ukraine',
		'russia',
		'germany',
		'france',
		'italy',
		'spain',
		'uk',
		'britain',
		'poland',
		'romania',
		'baltic',
		'black sea'
	],
	MENA: [
		'iran',
		'israel',
		'saudi',
		'turkey',
		'uae',
		'qatar',
		'egypt',
		'syria',
		'iraq',
		'gaza',
		'lebanon',
		'yemen',
		'houthi',
		'middle east'
	],
	APAC: [
		'china',
		'taiwan',
		'japan',
		'korea',
		'north korea',
		'south korea',
		'india',
		'pakistan',
		'indonesia',
		'australia',
		'indo-pacific',
		'south china sea',
		'asean',
		'philippines'
	],
	AMERICAS: [
		'us',
		'america',
		'united states',
		'washington',
		'canada',
		'mexico',
		'brazil',
		'argentina',
		'colombia',
		'venezuela',
		'latin'
	],
	AFRICA: [
		'africa',
		'sahel',
		'niger',
		'sudan',
		'ethiopia',
		'somalia',
		'egypt',
		'libya',
		'nigeria',
		'kenya',
		'congo',
		'south africa',
		'mali'
	]
};

const TOPIC_KEYWORDS = {
	CYBER: ['cyber', 'hack', 'ransomware', 'malware', 'breach', 'apt', 'vulnerability'],
	NUCLEAR: ['nuclear', 'icbm', 'warhead', 'nonproliferation', 'uranium', 'plutonium'],
	CONFLICT: [
		'war',
		'military',
		'troops',
		'invasion',
		'strike',
		'missile',
		'combat',
		'offensive',
		'ceasefire',
		'airstrike',
		'shelling',
		'frontline',
		'insurgency',
		'proxy war',
		'militia',
		'artillery',
		'drone strike',
		'cross-border',
		'bombardment'
	],
	INTEL: ['intelligence', 'espionage', 'spy', 'cia', 'mossad', 'fsb', 'covert'],
	DEFENSE: [
		'pentagon',
		'dod',
		'defense',
		'military',
		'army',
		'navy',
		'air force',
		'defense ministry',
		'joint chiefs',
		'military exercise',
		'naval drill',
		'carrier strike group',
		'strategic command',
		'deterrence'
	],
	DIPLO: [
		'diplomat',
		'embassy',
		'treaty',
		'sanctions',
		'talks',
		'summit',
		'bilateral',
		'foreign ministry',
		'foreign minister',
		'state department',
		'un security council',
		'peace talks',
		'ceasefire talks',
		'mediator'
	]
};

const LOG_LEVELS = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 3
};

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const configuredLogLevel = process.env.NEWS_WORKER_LOG_LEVEL?.toLowerCase() || 'info';
const activeLogLevel = Object.prototype.hasOwnProperty.call(LOG_LEVELS, configuredLogLevel)
	? configuredLogLevel
	: 'info';

let lastGdeltRequestAt = 0;
let hasLoggedGapOverride = false;

function log(level, message, meta) {
	if (LOG_LEVELS[level] > LOG_LEVELS[activeLogLevel]) {
		return;
	}

	const payload = {
		ts: new Date().toISOString(),
		level,
		message,
		...(meta && typeof meta === 'object' ? meta : {})
	};

	const output = JSON.stringify(payload);
	if (level === 'error') {
		console.error(output);
		return;
	}

	console.log(output);
}

function parsePositiveInt(value, fallback) {
	if (!value) {
		return fallback;
	}

	const parsed = Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
}

function compactSnippet(text, maxLength = 120) {
	if (typeof text !== 'string' || text.length === 0) {
		return '';
	}

	return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function waitForGdeltRequestSlot() {
	const configuredGapMs = parsePositiveInt(
		process.env.NEWS_GDELT_MIN_REQUEST_GAP_MS,
		DEFAULT_GDELT_MIN_REQUEST_GAP_MS
	);
	const minGapMs = Math.max(configuredGapMs, HARD_MIN_GDELT_REQUEST_GAP_MS);

	if (configuredGapMs < HARD_MIN_GDELT_REQUEST_GAP_MS && !hasLoggedGapOverride) {
		hasLoggedGapOverride = true;
		log('warn', 'configured gdelt request gap is too low, enforcing hard minimum', {
			configuredGapMs,
			enforcedGapMs: minGapMs
		});
	}

	const now = Date.now();
	const waitMs = lastGdeltRequestAt - now;
	if (waitMs > 0) {
		log('debug', 'waiting for gdelt request slot', {
			waitMs,
			minGapMs
		});
		await sleep(waitMs);
	}

	lastGdeltRequestAt = Date.now() + minGapMs;
}

function hashCode(value) {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		const charCode = value.charCodeAt(i);
		hash = (hash << 5) - hash + charCode;
		hash |= 0;
	}
	return Math.abs(hash).toString(36);
}

function containsAlertKeyword(text) {
	const lowerText = text.toLowerCase();
	for (const keyword of ALERT_KEYWORDS) {
		if (lowerText.includes(keyword)) {
			return { isAlert: true, keyword };
		}
	}
	return { isAlert: false };
}

function detectRegion(text) {
	const lowerText = text.toLowerCase();
	for (const [region, keywords] of Object.entries(REGION_KEYWORDS)) {
		if (keywords.some((keyword) => lowerText.includes(keyword))) {
			return region;
		}
	}
	return null;
}

function detectTopics(text) {
	const lowerText = text.toLowerCase();
	const detected = [];

	for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
		if (keywords.some((keyword) => lowerText.includes(keyword))) {
			detected.push(topic);
		}
	}

	return detected;
}

function parseGdeltDate(value) {
	if (!value) {
		return new Date();
	}

	const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
	if (!match) {
		const fallback = new Date(value);
		return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
	}

	const [, year, month, day, hour, minute, second] = match;
	return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
}

function createItemId(category, article) {
	const identity = article.url || `${article.title || ''}-${article.seendate || ''}`;
	return `gdelt-${category}-${hashCode(identity)}`;
}

function toNewsItem(article, category) {
	const title = (article.title || '').trim();
	const link = (article.url || '').trim();

	if (!title || !link) {
		return null;
	}

	const parsedDate = parseGdeltDate(article.seendate);
	const headlineAnalysis = containsAlertKeyword(title);

	return {
		id: createItemId(category, article),
		title,
		link,
		pubDate: article.seendate,
		timestamp: parsedDate.getTime(),
		source: article.domain || category.toUpperCase(),
		category,
		isAlert: headlineAnalysis.isAlert,
		alertKeyword: headlineAnalysis.keyword,
		region: detectRegion(title) || undefined,
		topics: detectTopics(title)
	};
}

function serializeTopics(topics) {
	return JSON.stringify(topics || []);
}

function serializeAlert(value) {
	return value ? 1 : 0;
}

function toNumber(value, fallback = 0) {
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

function getDbUrl() {
	return process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_LOCAL_DB_URL;
}

function getDbAuthToken() {
	const token = process.env.TURSO_AUTH_TOKEN?.trim();
	return token && token.length > 0 ? token : undefined;
}

function createDbClient() {
	const url = getDbUrl();
	const authToken = getDbAuthToken();

	log('info', 'creating database client', {
		dbUrl: url,
		hasAuthToken: !!authToken
	});

	if (authToken) {
		return createClient({
			url,
			authToken
		});
	}

	return createClient({ url });
}

async function initializeSchema(db) {
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

async function startIngestRun(db) {
	const startedAt = Date.now();
	const result = await db.execute({
		sql: 'INSERT INTO news_ingest_runs (started_at, status, fetched_count) VALUES (?, ?, ?)',
		args: [startedAt, 'running', 0]
	});

	return toNumber(result.lastInsertRowid, 0);
}

async function finishIngestRun(db, runId, status, fetchedCount, errorMessage) {
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

async function upsertNewsItems(db, items, fetchedAt) {
	if (items.length === 0) {
		return;
	}

	const statements = items.map((item) => ({
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
			item.pubDate || null,
			item.timestamp,
			serializeAlert(item.isAlert),
			item.alertKeyword || null,
			item.region || null,
			serializeTopics(item.topics),
			fetchedAt
		]
	}));

	await db.batch(statements, 'write');
}

async function purgeExpiredNews(db, retentionDays) {
	const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
	const cutoffTimestamp = Date.now() - retentionMs;

	const result = await db.execute({
		sql: 'DELETE FROM news_items WHERE timestamp < ?',
		args: [cutoffTimestamp]
	});

	return toNumber(result.rowsAffected, 0);
}

async function fetchJsonWithTimeout(url, timeoutMs) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		return await fetch(url, {
			headers: {
				Accept: 'application/json'
			},
			signal: controller.signal
		});
	} finally {
		clearTimeout(timeoutId);
	}
}

async function fetchCategoryNews(category) {
	const timeoutMs = parsePositiveInt(process.env.NEWS_FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS);
	const maxAttempts = parsePositiveInt(process.env.NEWS_FETCH_RETRIES, DEFAULT_FETCH_RETRIES);
	const retryDelayMs = parsePositiveInt(
		process.env.NEWS_FETCH_RETRY_DELAY_MS,
		DEFAULT_FETCH_RETRY_DELAY_MS
	);
	const queryCandidates = [
		CATEGORY_QUERIES[category],
		CATEGORY_FALLBACK_QUERIES[category]
	].filter((query, index, all) => query && all.indexOf(query) === index);

	let lastError = null;

	for (let queryIndex = 0; queryIndex < queryCandidates.length; queryIndex++) {
		const query = queryCandidates[queryIndex];
		const isFallbackQuery = queryIndex > 0;
		let sawQueryValidationIssue = false;

		if (isFallbackQuery) {
			log('warn', 'switching to fallback query', {
				category,
				query
			});
		}

		const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
		url.searchParams.set('query', `${query} sourcelang:english`);
		url.searchParams.set('timespan', process.env.NEWS_GDELT_TIMESPAN || DEFAULT_GDELT_TIMESPAN);
		url.searchParams.set('mode', 'artlist');
		url.searchParams.set('maxrecords', process.env.NEWS_GDELT_MAX_RECORDS || DEFAULT_GDELT_MAX_RECORDS);
		url.searchParams.set('format', 'json');
		url.searchParams.set('sort', 'date');

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				await waitForGdeltRequestSlot();
				const response = await fetchJsonWithTimeout(url.toString(), timeoutMs);
				const rawBody = await response.text();

				if (!response.ok) {
					const snippet = compactSnippet(rawBody);
					const error = new Error(
						`Failed to fetch ${category} news: HTTP ${response.status}${snippet ? `: ${snippet}` : ''}`
					);
					error.retryable = RETRYABLE_HTTP_STATUSES.has(response.status);
					throw error;
				}

				const contentType = response.headers.get('content-type') || '';
				if (!contentType.includes('application/json')) {
					const snippet = compactSnippet(rawBody);
					const error = new Error(
						`Failed to fetch ${category} news: non-json response${snippet ? `: ${snippet}` : ''}`
					);
					error.retryable = true;
					throw error;
				}

				let payload;
				try {
					payload = JSON.parse(rawBody);
				} catch {
					const snippet = compactSnippet(rawBody);
					const error = new Error(
						`Failed to fetch ${category} news: invalid json${snippet ? `: ${snippet}` : ''}`
					);
					error.retryable = true;
					throw error;
				}

				if (!payload.articles || payload.articles.length === 0) {
					return [];
				}

				return payload.articles
					.map((article) => toNewsItem(article, category))
					.filter((item) => item !== null);
			} catch (error) {
				lastError = error;
				const message = error instanceof Error ? error.message : String(error);
				const isRetryable = typeof error === 'object' && error && error.retryable === true;
				const lowerMessage = message.toLowerCase();
				const isTooCommon = lowerMessage.includes('too common');
				const isTooShort = lowerMessage.includes('too short');
				const isTooLong = lowerMessage.includes('too long');
				const isQueryValidationIssue = isTooCommon || isTooShort || isTooLong;
				sawQueryValidationIssue = sawQueryValidationIssue || isQueryValidationIssue;

				if (sawQueryValidationIssue && queryIndex < queryCandidates.length - 1) {
					log('warn', 'query rejected by gdelt, trying fallback query', {
						category,
						attempt,
						error: message
					});
					break;
				}

				if (attempt < maxAttempts && isRetryable) {
					const waitMs = retryDelayMs * attempt;
					log('warn', 'category fetch attempt failed, retrying', {
						category,
						attempt,
						maxAttempts,
						waitMs,
						error: message
					});
					await sleep(waitMs);
					continue;
				}

				throw error;
			}
		}
	}

	if (lastError) {
		throw lastError;
	}

	return [];
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function createCategoryCountMap() {
	return {
		politics: 0,
		tech: 0,
		finance: 0,
		gov: 0,
		ai: 0,
		intel: 0
	};
}

async function runNewsIngestion() {
	const db = createDbClient();
	await initializeSchema(db);

	const runId = await startIngestRun(db);
	const startedAt = Date.now();
	const fetchedAt = Date.now();
	const retentionDays = parsePositiveInt(process.env.NEWS_RETENTION_DAYS, DEFAULT_RETENTION_DAYS);
	const categoryDelayMs = parsePositiveInt(
		process.env.NEWS_CATEGORY_DELAY_MS,
		DEFAULT_CATEGORY_DELAY_MS
	);

	let fetchedCount = 0;
	const categoryCounts = createCategoryCountMap();
	const failedCategories = {};

	try {
		for (let i = 0; i < NEWS_CATEGORIES.length; i++) {
			const category = NEWS_CATEGORIES[i];

			try {
				const items = await fetchCategoryNews(category);
				categoryCounts[category] = items.length;
				fetchedCount += items.length;
				await upsertNewsItems(db, items, fetchedAt);
				log('info', 'category ingestion completed', {
					category,
					count: items.length
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				failedCategories[category] = message;
				log('warn', 'category ingestion failed', {
					category,
					error: message
				});
			}

			if (i < NEWS_CATEGORIES.length - 1) {
				await sleep(categoryDelayMs);
			}
		}

		if (fetchedCount === 0) {
			throw new Error('Failed to ingest news for all categories');
		}

		const prunedCount = await purgeExpiredNews(db, retentionDays);
		const completedAt = await finishIngestRun(db, runId, 'success', fetchedCount, null);

		const summary = {
			runId,
			status: 'success',
			fetchedCount,
			prunedCount,
			startedAt,
			completedAt,
			categoryCounts,
			failedCategories
		};

		log('info', 'news ingestion completed', summary);
		return summary;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await finishIngestRun(db, runId, 'failed', fetchedCount, message);
		throw error;
	}
}

async function getHealthReport() {
	const db = createDbClient();
	await initializeSchema(db);

	const latestRunResult = await db.execute({
		sql: `
			SELECT id, status, started_at, completed_at, fetched_count, error
			FROM news_ingest_runs
			ORDER BY id DESC
			LIMIT 1
		`
	});

	const totalItemsResult = await db.execute({
		sql: 'SELECT COUNT(*) AS total_items FROM news_items'
	});

	const latestRun = latestRunResult.rows[0] || null;
	const totalItems = toNumber(totalItemsResult.rows[0]?.total_items, 0);

	const report = {
		status: 'ok',
		timestamp: Date.now(),
		dbUrl: getDbUrl(),
		totalItems,
		latestRun
	};

	log('info', 'health report generated', {
		totalItems,
		hasLatestRun: !!latestRun
	});

	return report;
}

function printUsage() {
	console.log(`\nnews-ingest worker\n\nUsage:\n  node workers/news-ingest/index.mjs once\n  node workers/news-ingest/index.mjs health\n\nCommands:\n  once    Run one ingestion cycle and exit.\n  health  Print database/ingestion health report.\n\nEnvironment variables:\n  TURSO_DATABASE_URL        Optional, defaults to file:./situation-monitor.db\n  TURSO_AUTH_TOKEN          Optional, required for remote Turso\n  NEWS_RETENTION_DAYS       Optional, default 30\n  NEWS_CATEGORY_DELAY_MS    Optional, default 6000\n  NEWS_GDELT_TIMESPAN       Optional, default 14d\n  NEWS_GDELT_MAX_RECORDS    Optional, default 60\n  NEWS_GDELT_MIN_REQUEST_GAP_MS Optional, default 6000 (hard minimum 6000)\n  NEWS_FETCH_TIMEOUT_MS     Optional, default 30000\n  NEWS_FETCH_RETRIES        Optional, default 2\n  NEWS_FETCH_RETRY_DELAY_MS Optional, default 5000\n  NEWS_WORKER_LOG_LEVEL     Optional: error | warn | info | debug\n`);
}

async function main() {
	const command = (process.argv[2] || 'once').toLowerCase();

	if (command === 'help' || command === '--help' || command === '-h') {
		printUsage();
		return;
	}

	if (command === 'once') {
		const summary = await runNewsIngestion();
		console.log(JSON.stringify(summary, null, 2));
		return;
	}

	if (command === 'health') {
		const health = await getHealthReport();
		console.log(JSON.stringify(health, null, 2));
		return;
	}

	throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	log('error', 'worker failed', {
		error: message
	});
	process.exitCode = 1;
});
