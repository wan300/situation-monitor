# Situation Monitor / 态势监测

一个面向全球事件与市场动态的实时监控仪表盘。项目将新闻流、市场数据、情报线索和宏观指标聚合到同一界面，并通过分析模块识别潜在关联与叙事演化。

- 在线地址: https://hipcityreg.github.io/situation-monitor/
- 技术基座: SvelteKit 2 + Svelte 5 + TypeScript + Tailwind CSS
- 部署形态: Vercel 全栈 (前端 + Serverless API + Cron)

## 1. 项目目标

这个项目的核心目标是让你在一个屏幕内同时看到:

1. 全球新闻热点与分主题流 (政治、科技、金融、政府、AI、情报)
2. 市场与风险温度 (指数、板块、商品、加密货币、VIX)
3. 场景化追踪面板 (例如地区态势、世界领导人、美联储)
4. 分析结果面板 (相关性、叙事追踪、Main Character)
5. 用户自定义监控 (关键词命中、启停、编辑、持久化)

## 2. 主要功能

### 2.1 多面板可配置仪表盘

- 支持 20+ 面板自由开关与排序
- 首次进入提供预设模板 (News Junkie / Trader / Geopolitics / Intel / Minimal / Everything)
- 面板配置、顺序、尺寸保存在浏览器本地

### 2.2 多源数据聚合

- 新闻: GDELT + 多类 RSS 来源配置
- 市场: Finnhub (指数/板块/商品) + CoinGecko (加密货币)
- 宏观: FRED 指标 + 美联储 RSS
- 其他: Polymarket、Whale Watch、Gov Contracts、Layoffs、World Leaders

### 2.3 分析引擎

- Correlation Engine: 识别跨主题/跨来源的模式关联
- Narrative Tracker: 跟踪叙事从边缘走向主流的过程
- Main Character: 识别当日新闻焦点人物

### 2.4 双语与刷新机制

- 内置中文/英文双语 UI
- 新闻数据由后端每小时定时抓取并入库
- 前端刷新优先读取后端快照，避免页面刷新触发外部新闻源全量请求
- 分阶段刷新策略，降低峰值请求压力

## 3. 技术栈

- 框架: SvelteKit 2.0 (Svelte 5 runes)
- 语言: TypeScript (strict)
- 样式: Tailwind CSS + 自定义主题变量
- 构建: Vite 6
- 测试: Vitest (单测) + Playwright (E2E)
- 部署: `@sveltejs/adapter-vercel` (支持 API 路由与 Cron)
- 可视化: D3.js (地图)

## 4. 快速开始

### 4.1 环境要求

- Node.js 20+ (建议)
- npm 10+ (建议)

### 4.2 安装依赖

```bash
npm install
```

### 4.3 本地开发

```bash
npm run dev
```

默认地址: http://localhost:5173

### 4.4 生产构建与预览

```bash
npm run build
npm run preview
```

构建产物在 `build/` 目录，预览地址默认是 http://localhost:4173。

## 5. 环境变量

在项目根目录创建 `.env` 文件 (示例):

```bash
VITE_FINNHUB_API_KEY=your_finnhub_key
VITE_FRED_API_KEY=your_fred_key
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_turso_token
NEWS_CRON_SECRET=your_cron_secret
```

另外，部署到子路径时可设置:

```bash
BASE_PATH=/situation-monitor
```

说明:

- `VITE_FINNHUB_API_KEY` 用于指数/板块/商品等市场数据
- `VITE_FRED_API_KEY` 用于美联储经济指标与资产负债表面板
- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` 用于后端新闻持久化存储
- `NEWS_CRON_SECRET` 用于保护 `/api/cron/news-refresh` 定时任务触发端点
- 未配置 key 时，相关面板会回退为“空数据/占位状态”，不影响应用启动

## 6. 常用脚本

```bash
npm run dev          # 本地开发
npm run build        # 生产构建 (Windows 本地默认 /build，Vercel 为 .vercel/output)
npm run preview      # 本地预览生产包
npm run check        # 类型检查 (svelte-check)
npm run check:watch  # 持续类型检查
npm run test         # Vitest watch
npm run test:unit    # Vitest 单次运行
npm run test:e2e     # Playwright E2E
npm run lint         # ESLint + Prettier 校验
npm run format       # Prettier 自动格式化
```

如果首次运行 E2E，先安装浏览器:

```bash
npx playwright install chromium
```

## 7. 项目结构

```text
src/
  lib/
    analysis/      # 相关性、叙事、主角识别
    api/           # 外部数据抓取与转换
    components/    # UI 组件 (layout/panels/modals/common)
    config/        # 数据源、关键词、分析规则、面板配置
    services/      # 缓存、熔断、请求去重、统一客户端
    stores/        # 全局状态与刷新编排
    types/         # TS 类型定义
    utils/         # 通用工具
  routes/          # SvelteKit 路由入口
tests/
  e2e/             # Playwright 端到端测试
```

### 路径别名

```ts
$lib        -> src/lib
$components -> src/lib/components
$stores     -> src/lib/stores
$services   -> src/lib/services
$config     -> src/lib/config
$types      -> src/lib/types
```

## 8. 架构要点

### 8.1 配置驱动

- 数据源、关键词、分析规则、面板清单集中在 `src/lib/config/`
- 新增来源/规则通常只需修改配置即可生效

### 8.2 状态驱动 UI

- 页面组合依赖 stores 提供的状态
- 面板可见性、顺序、监控项持久化在 localStorage

### 8.3 请求韧性设计

- `src/lib/services/` 提供缓存、熔断、请求去重与重试能力
- 对外部接口失败采用降级策略，尽量避免全局崩溃

### 8.4 分阶段刷新

刷新任务按优先级分为三层，减少瞬时并发与限流风险:

1. critical (0ms): news / markets / alerts
2. secondary (2s): crypto / commodities / intel
3. tertiary (4s): contracts / whales / layoffs / polymarket

## 9. 数据来源概览

- 新闻聚合: GDELT + RSS 源配置 (政治/科技/金融/政府/AI/情报)
- 市场数据: Finnhub、CoinGecko
- 美联储相关: FRED API + Federal Reserve RSS
- 其他公开接口: Polymarket、Blockchain、USAspending 等
- CORS 处理: 自定义 Cloudflare Worker + 公共代理回退

## 10. 测试策略

### 单元测试

- 位于各模块附近，命名如 `*.test.ts` / `*.spec.ts`
- 覆盖 analysis、stores、services 等核心逻辑

### 端到端测试

- 目录: `tests/e2e/`
- Playwright 默认通过 `npm run preview` 启动预览服务后执行

## 11. 部署说明

项目使用 Vercel 适配器，支持服务端 API 与定时任务:

- `prerender = true`
- `ssr = false`
- API 路由: `src/routes/api/**`
- Cron 路由: `/api/cron/news-refresh` (每小时)
- 本地 Windows 采用 `adapter-node` 规避 symlink 权限问题，CI/Vercel 自动使用 `adapter-vercel`

如需部署到子路径可设置:

```bash
BASE_PATH=/situation-monitor
```

## 12. 开发建议工作流

1. 新功能先建分支
2. 在功能分支完成开发与提交
3. 提交前执行类型检查、单测、lint

## 13. 常见问题

### 13.1 某些面板没有数据

- 检查是否缺少 API key (`VITE_FINNHUB_API_KEY` / `VITE_FRED_API_KEY`)
- 检查外部接口是否限流或临时不可用

### 13.2 开发端口冲突

- 默认 `npm run dev` 使用 5173
- 关闭占用进程后重试，或调整 Vite 启动参数

### 13.3 配置怎么重置

- 在设置中重置
- 或清理浏览器 localStorage 后刷新页面

---

如果你希望，我可以继续补一个 `.env.example` 和一版面向贡献者的 `CONTRIBUTING.md`，把本地开发规范也完整补齐。