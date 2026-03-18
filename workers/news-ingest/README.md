# News Ingest Worker

This folder contains a standalone news ingestion worker that can be deployed and scheduled independently from the SvelteKit app.

## Purpose

- Keep news ingestion running continuously on a server.
- Let frontend/backend development continue locally without depending on in-app cron.
- Write directly to the same Turso/LibSQL tables used by the app.

## Commands

If deployed as a standalone folder:

```bash
npm install --omit=dev
npm run health
npm run once
```

Or directly with the helper shell script:

```bash
bash run.sh health
bash run.sh once
```

From repository root:

```bash
node workers/news-ingest/index.mjs once
node workers/news-ingest/index.mjs health
```

Or via package scripts:

```bash
npm run worker:news:once
npm run worker:news:health
```

## Required environment variables

- `TURSO_DATABASE_URL`: Turso/libsql url. Defaults to `file:./situation-monitor.db` if omitted.
- `TURSO_AUTH_TOKEN`: Required when using remote Turso.

You can copy [.env.example](workers/news-ingest/.env.example) to `.env` and let [run.sh](workers/news-ingest/run.sh) load it automatically.

## Optional environment variables

- `NEWS_RETENTION_DAYS` (default `30`)
- `NEWS_CATEGORY_DELAY_MS` (default `5000`)
- `NEWS_GDELT_TIMESPAN` (default `14d`)
- `NEWS_GDELT_MAX_RECORDS` (default `60`)
- `NEWS_GDELT_MIN_REQUEST_GAP_MS` (default `5000`)
- `NEWS_FETCH_TIMEOUT_MS` (default `30000`)
- `NEWS_FETCH_RETRIES` (default `2`)
- `NEWS_FETCH_RETRY_DELAY_MS` (default `5000`)
- `NEWS_WORKER_LOG_LEVEL` (`error` | `warn` | `info` | `debug`, default `info`)

## Scheduling examples

### Linux cron

Run every 15 minutes:

```cron
*/15 * * * * cd /srv/situation-monitor && /usr/bin/node workers/news-ingest/index.mjs once >> /var/log/situation-monitor-news-worker.log 2>&1
```

### systemd service + timer

Template files are provided in [deploy/systemd/situation-monitor-news-worker.service](workers/news-ingest/deploy/systemd/situation-monitor-news-worker.service) and [deploy/systemd/situation-monitor-news-worker.timer](workers/news-ingest/deploy/systemd/situation-monitor-news-worker.timer).

`/etc/systemd/system/situation-monitor-news-worker.service`

```ini
[Unit]
Description=Situation Monitor News Ingest Worker
After=network.target

[Service]
Type=oneshot
WorkingDirectory=/srv/situation-monitor
ExecStart=/usr/bin/bash /srv/situation-monitor/run.sh once
```

`/etc/systemd/system/situation-monitor-news-worker.timer`

```ini
[Unit]
Description=Run Situation Monitor News Ingest Worker every 15 minutes

[Timer]
OnCalendar=*:0/15
Persistent=true

[Install]
WantedBy=timers.target
```

Enable timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now situation-monitor-news-worker.timer
```

## Notes

- Worker creates/updates schema automatically (`news_items`, `news_ingest_runs`).
- Worker exits with non-zero code on fatal failure, suitable for scheduler retries.
- If you only upload this folder to the server, `package.json` is already included here, so you can run `npm install --omit=dev` inside the folder directly.
