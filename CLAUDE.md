# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目架构说明

**重要：这是一个 SvelteKit 2.0 全栈应用，不是前后端分离架构**

- **前端层**：Svelte 5 组件、客户端路由、交互界面（`src/lib/components/`, `src/routes/*.svelte`）
- **后端层**：SvelteKit 服务器路由、API 端点、数据处理（`src/routes/api/**/*.ts`）
- **启动方式**：单个 `npm run dev` 命令同时启动前端开发服务器和后端 API 服务
  - 前端：Vite 开发服务器（热模块替换）
  - 后端：SvelteKit 集成服务器
  - 访问：http://localhost:5173/

## Development Workflow

When working on a new feature:
1. Create a new branch before making any changes
2. Make all commits on that feature branch
3. Before opening a PR, run the `code-simplifier` agent to clean up the code

## Build & Development Commands

```bash
# 启动开发环境（包含前端 + 后端集成）
npm run dev          # 启动 Vite 开发服务器 (http://localhost:5173/)

# 构建与预览
npm run build        # 构建生产版本到 /build 目录（使用 Node.js adapter）
npm run preview      # 预览生产构建 (http://localhost:4173/)

# 代码检查与测试
npm run check        # TypeScript 类型检查
npm run check:watch  # 监听模式的类型检查
npm run test         # Vitest 监听模式
npm run test:unit    # 运行单元测试（一次）
npm run test:e2e     # Playwright E2E 测试（需要预览服务器）

# 代码质量
npm run lint         # ESLint + Prettier 检查
npm run format       # Prettier 自动格式化
```

## Technology Stack

- **SvelteKit 2.0** with Svelte 5 reactivity (`$state`, `$derived`, `$effect` runes)
- **TypeScript** (strict mode enabled)
- **Tailwind CSS** with custom dark theme
- **Vitest** (unit) + **Playwright** (E2E) for testing
- **Server Routes** (`src/routes/api/**/*.ts`) for backend API endpoints
- **Node.js adapter** for local development and production builds
- **Static adapter** - for deploying as pure static site to GitHub Pages

## Project Architecture

### Core Directories (`src/lib/`)

- **`analysis/`** - Pattern correlation, narrative tracking, main character detection across news items
- **`api/`** - Data fetching from GDELT, RSS feeds (30+ sources), market APIs, CoinGecko
- **`components/`** - Svelte components organized into layout/, panels/, modals/, common/
- **`config/`** - Centralized configuration for feeds, keywords, analysis patterns, panels, map hotspots
- **`services/`** - Resilience layer: CacheManager, CircuitBreaker, RequestDeduplicator, ServiceClient
- **`stores/`** - Svelte stores for settings, news, markets, monitors, refresh orchestration
- **`types/`** - TypeScript interfaces

### Backend API Routes (`src/routes/api/`)

- **`/api/cron/news-refresh`** - Scheduled news refresh endpoint
- **`/api/news/snapshot`** - News data snapshot endpoint

### Path Aliases

```typescript
$lib        → src/lib
$components → src/lib/components
$stores     → src/lib/stores
$services   → src/lib/services
$config     → src/lib/config
$types      → src/lib/types
```

## Key Architectural Patterns

### Service Layer (`src/lib/services/`)
All HTTP requests go through `ServiceClient` which integrates:
- **CacheManager**: Per-service caching with TTL
- **CircuitBreaker**: Prevents cascading failures
- **RequestDeduplicator**: Prevents concurrent duplicate requests

### Multi-Stage Refresh (`src/lib/stores/refresh.ts`)
Data fetches happen in 3 stages with staggered delays:
1. Critical (0ms): News, markets, alerts
2. Secondary (2s): Crypto, commodities, intel
3. Tertiary (4s): Contracts, whales, layoffs, polymarket

### Analysis Engine (`src/lib/analysis/`)
Unique business logic for intelligence analysis:
- Correlation detection across disparate news items
- Narrative tracking (fringe → mainstream progression)
- Entity prominence calculation ("main character" analysis)
- All use configurable regex patterns from `src/lib/config/analysis.ts`

### Configuration-Driven Design (`src/lib/config/`)
- `feeds.ts`: 30+ RSS sources across 6 categories (politics, tech, finance, gov, ai, intel)
- `keywords.ts`: Alert keywords, region detection, topic detection
- `analysis.ts`: Correlation topics and narrative patterns with severity levels
- `panels.ts`: Panel registry with display order
- `map.ts`: Geopolitical hotspots, conflict zones, strategic locations

## Testing

**Unit tests**: Located alongside source as `*.test.ts` or `*.spec.ts`
**E2E tests**: In `tests/e2e/*.spec.ts`, run against preview server

## Deployment

GitHub Actions workflow builds with `BASE_PATH=/situation-monitor` and deploys to GitHub Pages at `https://hipcityreg.github.io/situation-monitor/`

## External Dependencies

- **D3.js** for interactive map visualization
- **CORS proxy** (Cloudflare Worker) for RSS feed parsing
- **CoinGecko API** for cryptocurrency data

---

## 快速开发指南（中文）

### 项目启动
```bash
# 完整启动（包括前端和后端 API）
npm run dev

# 访问应用
# 前端：http://localhost:5173/
# 后端 API 已内置在同一端口，通过路由 /api/* 访问
```

### 项目架构说明
这是**集成的全栈应用**，不需要分别启动前后端：
- **前端**：Svelte 5 + Vite（热更新）
- **后端**：SvelteKit 服务端路由（与前端共享端口 5173）
- **数据库**（可选）：Turso/LibSQL（需配置 `.env`）

### 常见开发任务
```bash
# 类型检查
npm run check

# 单元测试（一次）
npm run test:unit

# 代码格式化
npm run format

# 代码质量检查
npm run lint
```

### 代码修改建议
1. 修改前创建特性分支
2. 前端组件在 `src/lib/components/`
3. 后端 API 在 `src/routes/api/`
4. 配置文件在 `src/lib/config/`
