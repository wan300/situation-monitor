import type { PanelId } from '$lib/config';
import type { NewsCategory } from '$lib/types';

export type Language = 'zh-CN' | 'en-US';

export const DEFAULT_LANGUAGE: Language = 'zh-CN';

export const LANGUAGE_OPTIONS = [
	{ value: 'zh-CN', shortLabel: '中', label: '中文' },
	{ value: 'en-US', shortLabel: 'EN', label: 'English' }
] as const;

const MESSAGES = {
	'zh-CN': {
		meta: {
			title: '态势监测',
			description: '实时全球态势监控仪表盘'
		},
		header: {
			title: '态势监测',
			refreshing: '刷新中...',
			settings: '设置',
			language: '语言',
			neverRefreshed: '尚未刷新',
			lastUpdated: (time: string) => `最后更新：${time}`
		},
		common: {
			loading: '加载中...',
			retry: '重试',
			close: '关闭',
			alert: '警报',
			togglePanel: '展开或折叠面板',
			zoomIn: '放大',
			zoomOut: '缩小',
			reset: '重置',
			activeCount: (count: number) => `${count} 个启用`,
			panelCount: (count: number) => `${count} 个面板`,
			itemCount: (count: number) => `${count} 条`,
			sourceCount: (count: number) => `${count} 个来源`
		},
		settings: {
			title: '设置',
			enabledPanels: '已启用面板',
			sectionDesc: '开关面板以自定义你的仪表盘',
			dashboard: '仪表盘',
			reconfigure: '重新配置仪表盘',
			presetHint: '为你的面板选择一个预设方案',
			reset: '重置所有设置'
		},
		onboarding: {
			skip: '跳过引导',
			welcome: '欢迎使用态势监测',
			subtitle: '选择一个仪表盘配置后开始使用',
			changeLater: '之后可以在设置中随时修改'
		},
		monitorForm: {
			createTitle: '新建监控',
			editTitle: '编辑监控',
			name: '名称',
			namePlaceholder: '例如：乌克兰危机',
			keywords: '关键词（逗号分隔）',
			keywordsPlaceholder: '例如：ukraine, zelensky, kyiv',
			keywordsHint: '匹配任一关键词的新闻会显示在你的监控中',
			enabled: '启用',
			delete: '删除',
			cancel: '取消',
			create: '创建监控',
			save: '保存修改',
			errors: {
				nameRequired: '请输入名称',
				keywordsRequired: '至少需要一个关键词',
				maxReached: '已达到监控数量上限（20 个）'
			}
		},
		panels: {
			news: { empty: '暂无新闻' },
			markets: { title: '市场', empty: '暂无市场数据' },
			heatmap: { title: '行业热力图', empty: '暂无行业数据' },
			commodities: {
				title: '大宗商品 / VIX',
				empty: '暂无大宗商品数据',
				status: {
					highFear: '高恐慌',
					elevated: '升温',
					low: '低'
				}
			},
			crypto: { title: '加密货币', empty: '暂无加密货币数据' },
			mainCharacter: {
				title: '头号人物',
				empty: '暂无数据',
				label: '今日头号人物',
				mentions: (count: number) => `标题提及 ${count} 次`
			},
			correlation: {
				title: '模式分析',
				insufficientData: '数据不足，无法进行分析',
				emergingPatterns: '新兴模式',
				momentumSignals: '动量信号',
				crossSourceLinks: '跨来源关联',
				predictiveSignals: '预测信号',
				noPatterns: '未检测到显著模式',
				confidence: (value: number) => `置信度：${value}%`
			},
			narrative: {
				title: '叙事追踪',
				insufficientData: '数据不足，无法进行叙事分析',
				emergingFringe: '边缘叙事升温',
				crossovers: '边缘 → 主流穿透',
				watch: '叙事观察',
				disinfo: '虚假信息信号',
				noNarratives: '未检测到显著叙事',
				mentions: (count: number) => `${count} 次提及`,
				fringe: (count: number) => `边缘（${count}）`,
				mainstream: (count: number) => `主流（${count}）`,
				crossoverLevel: (value: number) => `穿透程度：${value}%`
			},
			monitors: {
				title: '自定义监控',
				empty: '尚未配置监控',
				create: '+ 新建监控',
				add: '新增监控',
				enable: '启用',
				disable: '停用',
				edit: '编辑',
				delete: '删除'
			},
			map: {
				title: '全球态势',
				legendHigh: '高',
				legendElevated: '中',
				legendLow: '低',
				legendConflict: '冲突区',
				legendChokepoint: '咽喉要道',
				legendCable: '海缆节点',
				legendNuclear: '核设施',
				legendMilitary: '军事基地',
				emptyHotspots: '暂无活跃热点',
				aiSummary: (count: number) => `AI ✓ ${count} 个热点`,
				algoSummary: (count: number) => `算法 ${count} 个热点`,
				localTime: (time: string) => `本地时间：${time}`,
				weatherLine: (condition: string, temp: number | null, wind: number | null) =>
					`${condition} ${temp ?? '--'}°F, ${wind ?? '--'} 英里/时`
			},
			intel: { title: '情报流', empty: '暂无情报' },
			leaders: {
				title: '世界领导人',
				empty: '暂无领导人数据',
				since: (value: string) => `任职自 ${value}`
			},
			whales: { title: '巨鲸监测', empty: '未检测到巨鲸交易' },
			polymarket: {
				title: 'Polymarket',
				empty: '暂无预测数据',
				volume: (value: string) => `成交额：${value}`
			},
			contracts: { title: '政府合同', empty: '暂无合同数据' },
			layoffs: {
				title: '裁员追踪',
				empty: '暂无近期裁员数据',
				jobs: (value: string) => `${value} 个岗位`
			},
			printer: {
				title: '印钞机',
				empty: '暂无美联储数据',
				label: '美联储资产负债表',
				unit: '万亿美元',
				on: '印钞开启',
				off: '印钞关闭',
				wow: '周环比'
			},
			fed: {
				title: '美联储',
				noApiKey: '添加 VITE_FRED_API_KEY 以显示经济指标',
				speeches: '讲话与视频',
				liveBroadcast: '直播',
				noNews: '暂无美联储新闻',
				powell: '鲍威尔',
				video: '视频'
			},
			situation: {
				empty: '暂无最新新闻',
				status: {
					monitoring: '监控中',
					elevated: '升高',
					critical: '严重'
				}
			}
		}
	},
	'en-US': {
		meta: {
			title: 'Situation Monitor',
			description: 'Real-time global situation monitoring dashboard'
		},
		header: {
			title: 'SITUATION MONITOR',
			refreshing: 'Refreshing...',
			settings: 'Settings',
			language: 'Language',
			neverRefreshed: 'Never refreshed',
			lastUpdated: (time: string) => `Last updated: ${time}`
		},
		common: {
			loading: 'Loading...',
			retry: 'Retry',
			close: 'Close',
			alert: 'ALERT',
			togglePanel: 'Toggle panel',
			zoomIn: 'Zoom in',
			zoomOut: 'Zoom out',
			reset: 'Reset',
			activeCount: (count: number) => `${count} active`,
			panelCount: (count: number) => `${count} panels`,
			itemCount: (count: number) => `${count} items`,
			sourceCount: (count: number) => `${count} sources`
		},
		settings: {
			title: 'Settings',
			enabledPanels: 'Enabled Panels',
			sectionDesc: 'Toggle panels on/off to customize your dashboard',
			dashboard: 'Dashboard',
			reconfigure: 'Reconfigure Dashboard',
			presetHint: 'Choose a preset profile for your panels',
			reset: 'Reset All Settings'
		},
		onboarding: {
			skip: 'Skip onboarding',
			welcome: 'Welcome to Situation Monitor',
			subtitle: 'Choose a dashboard configuration to get started',
			changeLater: 'You can change this later in Settings'
		},
		monitorForm: {
			createTitle: 'Create Monitor',
			editTitle: 'Edit Monitor',
			name: 'Name',
			namePlaceholder: 'e.g., Ukraine Crisis',
			keywords: 'Keywords (comma separated)',
			keywordsPlaceholder: 'e.g., ukraine, zelensky, kyiv',
			keywordsHint: 'News matching any of these keywords will appear in your monitor',
			enabled: 'Enabled',
			delete: 'Delete',
			cancel: 'Cancel',
			create: 'Create Monitor',
			save: 'Save Changes',
			errors: {
				nameRequired: 'Name is required',
				keywordsRequired: 'At least one keyword is required',
				maxReached: 'Maximum number of monitors reached (20)'
			}
		},
		panels: {
			news: { empty: 'No news available' },
			markets: { title: 'Markets', empty: 'No market data available' },
			heatmap: { title: 'Sector Heatmap', empty: 'No sector data available' },
			commodities: {
				title: 'Commodities / VIX',
				empty: 'No commodity data available',
				status: {
					highFear: 'HIGH FEAR',
					elevated: 'ELEVATED',
					low: 'LOW'
				}
			},
			crypto: { title: 'Crypto', empty: 'No crypto data available' },
			mainCharacter: {
				title: 'Main Character',
				empty: 'No data yet',
				label: "Today's Main Character",
				mentions: (count: number) => `${count} mentions in headlines`
			},
			correlation: {
				title: 'Pattern Analysis',
				insufficientData: 'Insufficient data for analysis',
				emergingPatterns: 'Emerging Patterns',
				momentumSignals: 'Momentum Signals',
				crossSourceLinks: 'Cross-Source Links',
				predictiveSignals: 'Predictive Signals',
				noPatterns: 'No significant patterns detected',
				confidence: (value: number) => `Confidence: ${value}%`
			},
			narrative: {
				title: 'Narrative Tracker',
				insufficientData: 'Insufficient data for narrative analysis',
				emergingFringe: 'Emerging Fringe',
				crossovers: 'Fringe → Mainstream Crossovers',
				watch: 'Narrative Watch',
				disinfo: 'Disinfo Signals',
				noNarratives: 'No significant narratives detected',
				mentions: (count: number) => `${count} mentions`,
				fringe: (count: number) => `Fringe (${count})`,
				mainstream: (count: number) => `Mainstream (${count})`,
				crossoverLevel: (value: number) => `Crossover level: ${value}%`
			},
			monitors: {
				title: 'Custom Monitors',
				empty: 'No monitors configured',
				create: '+ Create Monitor',
				add: 'Add monitor',
				enable: 'Enable',
				disable: 'Disable',
				edit: 'Edit',
				delete: 'Delete'
			},
			map: {
				title: 'Global Situation',
				legendHigh: 'High',
				legendElevated: 'Elevated',
				legendLow: 'Low',
				legendConflict: 'Conflict zone',
				legendChokepoint: 'Chokepoint',
				legendCable: 'Cable node',
				legendNuclear: 'Nuclear site',
				legendMilitary: 'Military base',
				emptyHotspots: 'No active hotspots',
				aiSummary: (count: number) => `AI ✓ ${count} hotspots`,
				algoSummary: (count: number) => `ALGO ${count} hotspots`,
				localTime: (time: string) => `Local: ${time}`,
				weatherLine: (condition: string, temp: number | null, wind: number | null) =>
					`${condition} ${temp ?? '--'}°F, ${wind ?? '--'}mph`
			},
			intel: { title: 'Intel Feed', empty: 'No intel available' },
			leaders: {
				title: 'World Leaders',
				empty: 'No leaders data available',
				since: (value: string) => `Since ${value}`
			},
			whales: { title: 'Whale Watch', empty: 'No whale transactions detected' },
			polymarket: {
				title: 'Polymarket',
				empty: 'No predictions available',
				volume: (value: string) => `Vol: ${value}`
			},
			contracts: { title: 'Gov Contracts', empty: 'No contracts available' },
			layoffs: {
				title: 'Layoffs Tracker',
				empty: 'No recent layoffs data',
				jobs: (value: string) => `${value} jobs`
			},
			printer: {
				title: 'Money Printer',
				empty: 'No Fed data available',
				label: 'Federal Reserve Balance Sheet',
				unit: 'T USD',
				on: 'PRINTER ON',
				off: 'PRINTER OFF',
				wow: 'WoW'
			},
			fed: {
				title: 'Federal Reserve',
				noApiKey: 'Add VITE_FRED_API_KEY for economic indicators',
				speeches: 'Speeches & Video',
				liveBroadcast: 'Live Broadcast',
				noNews: 'No Fed news available',
				powell: 'POWELL',
				video: 'VIDEO'
			},
			situation: {
				empty: 'No recent news',
				status: {
					monitoring: 'MONITORING',
					elevated: 'ELEVATED',
					critical: 'CRITICAL'
				}
			}
		}
	}
} as const;

export type UiMessages = (typeof MESSAGES)[Language];

const PANEL_NAMES: Record<Language, Record<PanelId, string>> = {
	'zh-CN': {
		map: '全球地图',
		politics: '全球 / 地缘政治',
		tech: '科技 / AI',
		finance: '金融',
		gov: '政府 / 政策',
		heatmap: '行业热力图',
		markets: '市场',
		monitors: '我的监控',
		commodities: '大宗商品 / VIX',
		crypto: '加密货币',
		polymarket: 'Polymarket',
		whales: '巨鲸监测',
		mainchar: '头号人物',
		printer: '印钞机',
		contracts: '政府合同',
		ai: 'AI 军备竞赛',
		layoffs: '裁员追踪',
		venezuela: '委内瑞拉态势',
		greenland: '格陵兰态势',
		iran: '伊朗态势',
		leaders: '世界领导人',
		intel: '情报流',
		correlation: '关联引擎',
		narrative: '叙事追踪',
		fed: '美联储'
	},
	'en-US': {
		map: 'Global Map',
		politics: 'World / Geopolitical',
		tech: 'Technology / AI',
		finance: 'Financial',
		gov: 'Government / Policy',
		heatmap: 'Sector Heatmap',
		markets: 'Markets',
		monitors: 'My Monitors',
		commodities: 'Commodities / VIX',
		crypto: 'Crypto',
		polymarket: 'Polymarket',
		whales: 'Whale Watch',
		mainchar: 'Main Character',
		printer: 'Money Printer',
		contracts: 'Gov Contracts',
		ai: 'AI Arms Race',
		layoffs: 'Layoffs Tracker',
		venezuela: 'Venezuela Situation',
		greenland: 'Greenland Situation',
		iran: 'Iran Situation',
		leaders: 'World Leaders',
		intel: 'Intel Feed',
		correlation: 'Correlation Engine',
		narrative: 'Narrative Tracker',
		fed: 'Federal Reserve'
	}
};

const NEWS_PANEL_TITLES: Record<Language, Record<NewsCategory, string>> = {
	'zh-CN': {
		politics: '政治',
		tech: '科技',
		finance: '金融',
		gov: '政府',
		ai: 'AI',
		intel: '情报'
	},
	'en-US': {
		politics: 'Politics',
		tech: 'Tech',
		finance: 'Finance',
		gov: 'Government',
		ai: 'AI',
		intel: 'Intel'
	}
};

const PRESET_COPY: Record<Language, Record<string, { name: string; description: string }>> = {
	'zh-CN': {
		'news-junkie': {
			name: '新闻控',
			description: '聚焦政治、科技和金融的突发新闻'
		},
		trader: {
			name: '交易员',
			description: '以股票、加密货币和大宗商品为核心的市场仪表盘'
		},
		geopolitics: {
			name: '地缘政治观察者',
			description: '关注全球态势与地区热点'
		},
		intel: {
			name: '情报分析师',
			description: '侧重深度分析、模式检测与叙事追踪'
		},
		minimal: {
			name: '极简',
			description: '仅保留地图、新闻与市场核心信息'
		},
		everything: {
			name: '全部开启',
			description: '显示所有面板'
		}
	},
	'en-US': {
		'news-junkie': {
			name: 'News Junkie',
			description: 'Stay on top of breaking news across politics, tech, and finance'
		},
		trader: {
			name: 'Trader',
			description: 'Market-focused dashboard with stocks, crypto, and commodities'
		},
		geopolitics: {
			name: 'Geopolitics Watcher',
			description: 'Global situation awareness and regional hotspots'
		},
		intel: {
			name: 'Intelligence Analyst',
			description: 'Deep analysis, pattern detection, and narrative tracking'
		},
		minimal: {
			name: 'Minimal',
			description: 'Just the essentials - map, news, and markets'
		},
		everything: {
			name: 'Everything',
			description: 'Kitchen sink - all panels enabled'
		}
	}
};

const SITUATION_COPY = {
	'zh-CN': {
		venezuela: {
			title: '委内瑞拉观察',
			subtitle: '人道主义危机监测'
		},
		greenland: {
			title: '格陵兰观察',
			subtitle: '北极地缘政治监测'
		},
		iran: {
			title: '伊朗危机',
			subtitle: '革命抗议、政权不稳与核计划'
		}
	},
	'en-US': {
		venezuela: {
			title: 'Venezuela Watch',
			subtitle: 'Humanitarian crisis monitoring'
		},
		greenland: {
			title: 'Greenland Watch',
			subtitle: 'Arctic geopolitics monitoring'
		},
		iran: {
			title: 'Iran Crisis',
			subtitle: 'Revolution protests, regime instability & nuclear program'
		}
	}
} as const;

const ZH_CORRELATION_TOPIC_NAMES: Record<string, string> = {
	tariffs: '关税',
	'fed-rates': '美联储利率',
	inflation: '通胀',
	'ai-regulation': 'AI 监管',
	'china-tensions': '中美紧张局势',
	'russia-ukraine': '俄乌局势',
	'israel-gaza': '以色列加沙局势',
	iran: '伊朗',
	crypto: '加密货币',
	housing: '住房市场',
	layoffs: '裁员',
	'bank-crisis': '银行危机',
	election: '选举',
	immigration: '移民',
	climate: '气候',
	pandemic: '疫情',
	nuclear: '核威胁',
	'supply-chain': '供应链',
	'big-tech': '科技巨头',
	deepfake: '深度伪造'
};

const ZH_NARRATIVE_NAMES: Record<string, string> = {
	'deep-state': '深层政府',
	'cbdc-control': 'CBDC 控制',
	'wef-agenda': 'WEF 议程',
	'bio-weapon': '生物武器',
	'election-fraud': '选举舞弊',
	'ai-doom': 'AI 末日论',
	'ai-consciousness': 'AI 意识',
	'robot-replacement': '机器人替代',
	'china-invasion': '中国入侵',
	'nato-expansion': '北约扩张',
	'dollar-collapse': '美元崩溃',
	'vaccine-injury': '疫苗伤害',
	'next-pandemic': '下一场疫情',
	depopulation: '去人口化',
	'food-crisis': '粮食危机',
	'energy-war': '能源战争'
};

const ZH_STATUS_LABELS: Record<string, string> = {
	high: '高',
	elevated: '升高',
	emerging: '新兴',
	medium: '中',
	low: '低',
	viral: '爆发',
	spreading: '扩散',
	crossing: '穿透',
	watch: '观察',
	disinfo: '虚假信息',
	monitoring: '监控中'
};

const ZH_SOURCE_TYPE_LABELS: Record<string, string> = {
	osint: '开源情报',
	govt: '政府',
	'think-tank': '智库',
	defense: '防务',
	regional: '地区',
	cyber: '网络'
};

const ZH_FED_TYPE_LABELS: Record<string, string> = {
	monetary: '货币政策',
	powell: '鲍威尔主席',
	speech: '讲话',
	testimony: '听证',
	announcement: '公告'
};

const ZH_FED_INDICATOR_LABELS: Record<string, string> = {
	'Fed Funds Rate': '联邦基金利率',
	'CPI Inflation': 'CPI 通胀',
	'10Y Treasury': '10 年期美债'
};

const ZH_REGIONS: Record<string, string> = {
	EUROPE: '欧洲',
	MENA: '中东和北非',
	APAC: '亚太',
	AMERICAS: '美洲',
	AFRICA: '非洲'
};

const ZH_TOPICS: Record<string, string> = {
	CYBER: '网络',
	NUCLEAR: '核',
	CONFLICT: '冲突',
	INTEL: '情报',
	DEFENSE: '防务',
	DIPLO: '外交',
	defense: '防务',
	geopolitics: '地缘政治',
	policy: '政策',
	'foreign-policy': '外交政策',
	military: '军事',
	strategy: '战略',
	'asia-pacific': '亚太',
	'middle-east': '中东',
	investigation: '调查',
	osint: '开源情报',
	cyber: '网络',
	security: '安全'
};

const ZH_COUNTRIES: Record<string, string> = {
	'United States': '美国',
	China: '中国',
	Russia: '俄罗斯',
	'United Kingdom': '英国',
	France: '法国',
	Germany: '德国',
	Italy: '意大利',
	Israel: '以色列',
	'Saudi Arabia': '沙特阿拉伯',
	Iran: '伊朗',
	India: '印度',
	'North Korea': '朝鲜',
	Japan: '日本',
	Taiwan: '台湾',
	Ukraine: '乌克兰',
	Argentina: '阿根廷',
	Brazil: '巴西',
	Canada: '加拿大'
};

const ZH_LEADER_TITLES: Record<string, string> = {
	President: '总统',
	'Vice President': '副总统',
	'Prime Minister': '总理',
	Chancellor: '总理',
	'Crown Prince': '王储',
	'Supreme Leader': '最高领袖'
};

const ZH_LEADER_FOCUS: Record<string, string> = {
	tariffs: '关税',
	immigration: '移民',
	deregulation: '放松监管',
	taiwan: '台湾',
	'belt and road': '一带一路',
	'tech dominance': '科技主导权',
	'ukraine war': '乌克兰战争',
	'nato expansion': '北约扩张',
	energy: '能源',
	gaza: '加沙',
	'judicial reform': '司法改革',
	'vision 2030': '2030 愿景',
	oil: '石油',
	'regional influence': '地区影响力',
	'nuclear program': '核计划',
	proxies: '代理人网络',
	sanctions: '制裁',
	economy: '经济',
	'china border': '中印边境',
	technology: '科技',
	nuclear: '核武',
	missiles: '导弹',
	'russia alliance': '俄朝联盟',
	defense: '防务',
	china: '中国',
	'us alliance': '美日同盟',
	'china relations': '对华关系',
	semiconductors: '半导体',
	war: '战争',
	'western aid': '西方援助',
	'nato membership': '北约成员资格',
	dollarization: '美元化',
	'spending cuts': '削减开支',
	amazon: '亚马孙',
	'social programs': '社会项目',
	brics: '金砖国家',
	'us relations': '对美关系'
};

const ZH_PREDICTIONS: Record<string, string> = {
	'Market volatility likely in next 24-48h': '未来 24 至 48 小时内市场波动可能加剧',
	'Expect increased financial sector coverage': '预计金融板块相关报道将增加',
	'Geopolitical escalation narrative forming': '地缘政治升级叙事正在形成',
	'Employment concerns may dominate news cycle': '就业担忧可能主导接下来的新闻周期',
	'Breaking developments likely within hours': '数小时内可能出现新的重大进展',
	'Topic gaining mainstream traction': '该主题正在获得主流关注'
};

const ZH_MAP_TEXT: Record<string, string> = {
	ATLANTIC: '大西洋',
	PACIFIC: '太平洋',
	INDIAN: '印度洋',
	ARCTIC: '北冰洋',
	SOUTHERN: '南冰洋',
	DC: '华盛顿',
	Moscow: '莫斯科',
	Beijing: '北京',
	Kyiv: '基辅',
	Taipei: '台北',
	Tehran: '德黑兰',
	'Tel Aviv': '特拉维夫',
	London: '伦敦',
	Brussels: '布鲁塞尔',
	Pyongyang: '平壤',
	Riyadh: '利雅得',
	Delhi: '德里',
	Singapore: '新加坡',
	Tokyo: '东京',
	Caracas: '加拉加斯',
	Nuuk: '努克',
	Ukraine: '乌克兰',
	Gaza: '加沙',
	'Taiwan Strait': '台海',
	Yemen: '也门',
	Sudan: '苏丹',
	Myanmar: '缅甸',
	'United States': '美国',
	'United Kingdom': '英国',
	'European Union': '欧盟',
	'North Korea': '朝鲜',
	'South China Sea': '南海',
	'West Bank': '约旦河西岸',
	'Los Angeles': '洛杉矶',
	Suez: '苏伊士',
	Panama: '巴拿马',
	Hormuz: '霍尔木兹',
	Malacca: '马六甲',
	'Bab el-M': '曼德海峡',
	Gibraltar: '直布罗陀',
	Bosporus: '博斯普鲁斯',
	Cornwall: '康沃尔',
	Marseille: '马赛',
	Mumbai: '孟买',
	'Hong Kong': '香港',
	Sydney: '悉尼',
	Miami: '迈阿密',
	Natanz: '纳坦兹',
	Yongbyon: '宁边',
	Dimona: '迪莫纳',
	Bushehr: '布什尔',
	Zaporizhzhia: '扎波罗热',
	Chernobyl: '切尔诺贝利',
	Fukushima: '福岛',
	Ramstein: '拉姆施泰因',
	'Okinawa': '冲绳',
	Guam: '关岛',
	Djibouti: '吉布提',
	Qatar: '卡塔尔',
	Kaliningrad: '加里宁格勒',
	Sevastopol: '塞瓦斯托波尔',
	Hainan: '海南',
	'Washington DC — US political center, White House, Pentagon, Capitol': '华盛顿特区：美国政治中心，白宫、五角大楼与国会所在地',
	'Moscow — Kremlin, Russian military command, sanctions hub': '莫斯科：克里姆林宫、俄军指挥中心与制裁枢纽',
	'Beijing — CCP headquarters, US-China tensions, tech rivalry': '北京：中国共产党总部、中美紧张关系与科技竞争中心',
	'Kyiv — Active conflict zone, Russian invasion ongoing': '基辅：冲突前线，俄军入侵仍在持续',
	'Taipei — Taiwan Strait tensions, TSMC, China threat': '台北：台海紧张局势、台积电与中国威胁焦点',
	'Tehran — ACTIVE UPRISING: 200+ cities, 26 provinces. Revolution protests, regime instability, nuclear program': '德黑兰：活跃抗争，波及 200 多座城市与 26 个省份；革命抗议、政权不稳与核计划并存',
	'Tel Aviv — Israel-Gaza conflict, active military operations': '特拉维夫：以色列与加沙冲突，军事行动持续',
	'London — Financial center, Five Eyes, NATO ally': '伦敦：金融中心、五眼联盟成员与北约盟友',
	'Brussels — EU/NATO headquarters, European policy': '布鲁塞尔：欧盟与北约总部所在地，欧洲政策中心',
	'Pyongyang — North Korea nuclear threat, missile tests': '平壤：朝鲜核威胁与导弹试验热点',
	'Riyadh — Saudi oil, OPEC+, Yemen conflict, regional power': '利雅得：沙特石油、OPEC+、也门冲突与地区影响力交汇点',
	'Delhi — India rising power, China border tensions': '德里：印度崛起与中印边境紧张局势焦点',
	'Singapore — Shipping chokepoint, Asian finance hub': '新加坡：航运咽喉与亚洲金融枢纽',
	'Tokyo — US ally, regional security, economic power': '东京：美国盟友、地区安全支点与经济强国',
	'Caracas — Venezuela crisis, Maduro regime, US sanctions, humanitarian emergency': '加拉加斯：委内瑞拉危机、马杜罗政权、美国制裁与人道主义紧急状况',
	'Nuuk — Greenland, US acquisition interest, Arctic strategy, Denmark tensions': '努克：格陵兰、美国收购意向、北极战略与丹麦紧张关系',
	'Suez Canal — 12% of global trade, Europe-Asia route': '苏伊士运河：承载全球约 12% 贸易，是欧亚航线要冲',
	'Panama Canal — Americas transit, Pacific-Atlantic link': '巴拿马运河：连接太平洋与大西洋的美洲航运枢纽',
	'Strait of Hormuz — 21% of global oil, Persian Gulf exit': '霍尔木兹海峡：全球约 21% 石油运输通道，波斯湾出口',
	'Strait of Malacca — 25% of global trade, China supply line': '马六甲海峡：承载全球约 25% 贸易，是中国供应线关键节点',
	'Bab el-Mandeb — Red Sea gateway, Houthi threat zone': '曼德海峡：红海门户，胡塞威胁区',
	'Strait of Gibraltar — Mediterranean access': '直布罗陀海峡：地中海出入口',
	'Bosporus Strait — Black Sea access, Russia exports': '博斯普鲁斯海峡：黑海出入口与俄罗斯出口通道',
	'New York — Transatlantic hub, 10+ cables': '纽约：跨大西洋枢纽，连接 10 多条海缆',
	'Cornwall UK — Europe-Americas gateway': '英国康沃尔：欧亚与美洲海缆门户',
	'Marseille — Mediterranean hub, SEA-ME-WE': '马赛：地中海海缆枢纽，连接 SEA-ME-WE 系统',
	'Mumbai — India gateway, 10+ cables': '孟买：印度海缆门户，连接 10 多条海缆',
	'Singapore — Asia-Pacific nexus': '新加坡：亚太海缆核心节点',
	'Hong Kong — China connectivity hub': '香港：中国连接枢纽',
	'Tokyo — Trans-Pacific terminus': '东京：跨太平洋海缆终点之一',
	'Sydney — Australia/Pacific hub': '悉尼：澳大利亚与太平洋枢纽',
	'Los Angeles — Pacific gateway': '洛杉矶：太平洋门户',
	'Miami — Americas/Caribbean hub': '迈阿密：美洲与加勒比海枢纽',
	'Natanz — Iran uranium enrichment': '纳坦兹：伊朗铀浓缩设施',
	'Yongbyon — North Korea nuclear complex': '宁边：朝鲜核设施群',
	'Dimona — Israel nuclear facility': '迪莫纳：以色列核设施',
	'Bushehr — Iran nuclear power plant': '布什尔：伊朗核电站',
	'Zaporizhzhia — Europe largest NPP, conflict zone': '扎波罗热：欧洲最大核电站，位于冲突区',
	'Chernobyl — Exclusion zone, occupied 2022': '切尔诺贝利：隔离区，曾于 2022 年被占领',
	'Fukushima — Decommissioning site': '福岛：核设施退役现场',
	'Ramstein — US Air Force, NATO hub Germany': '拉姆施泰因：美国空军基地，德国北约枢纽',
	'Diego Garcia — US/UK Indian Ocean base': '迪戈加西亚：美英印度洋基地',
	'Okinawa — US Forces Japan, Pacific presence': '冲绳：驻日美军与太平洋存在核心基地',
	'Guam — US Pacific Command, bomber base': '关岛：美军太平洋司令部关键前进基地',
	'Djibouti — US/China/France bases, Horn of Africa': '吉布提：美中法基地汇聚，位于非洲之角',
	'Al Udeid — US CENTCOM forward HQ': '乌代德：美军中央司令部前沿总部',
	'Kaliningrad — Russian Baltic exclave, missiles': '加里宁格勒：俄罗斯波罗的海飞地与导弹部署点',
	'Sevastopol — Russian Black Sea Fleet': '塞瓦斯托波尔：俄罗斯黑海舰队基地',
	'Hainan — Chinese submarine base, South China Sea': '海南：中国潜艇基地与南海前沿',
	'Ukraine conflict zone — front-line combat and infrastructure risk':
		'乌克兰冲突区：前线交战持续，关键基础设施风险较高',
	'Gaza conflict zone — persistent urban warfare and humanitarian pressure':
		'加沙冲突区：城市作战持续，人道压力居高不下',
	'Taiwan Strait tension zone — military signaling and maritime pressure':
		'台海紧张区：军事信号增强，海上对峙压力上升',
	'Yemen conflict zone — regional proxy conflict and shipping disruption risk':
		'也门冲突区：地区代理冲突叠加航运中断风险',
	'Sudan conflict zone — civil war conditions and displacement pressure':
		'苏丹冲突区：内战态势延续，人口流离失所压力加剧',
	'Myanmar conflict zone — internal armed clashes and governance instability':
		'缅甸冲突区：内部武装冲突频发，治理稳定性不足',
	'☀️ Clear': '☀️ 晴朗',
	'🌤️ Mostly clear': '🌤️ 大致晴朗',
	'⛅ Partly cloudy': '⛅ 局部多云',
	'☁️ Overcast': '☁️ 阴天',
	'🌫️ Fog': '🌫️ 有雾',
	'🌧️ Drizzle': '🌧️ 毛毛雨',
	'🌧️ Rain': '🌧️ 下雨',
	'🌧️ Heavy rain': '🌧️ 大雨',
	'🌨️ Snow': '🌨️ 下雪',
	'🌨️ Heavy snow': '🌨️ 大雪',
	'🌧️ Showers': '🌧️ 阵雨',
	'⛈️ Heavy showers': '⛈️ 强阵雨',
	'⛈️ Thunderstorm': '⛈️ 雷暴'
};

function titleCaseFromId(id: string): string {
	return id.replace(/-/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
}

export function getMessages(language: Language): UiMessages {
	return MESSAGES[language];
}

export function getPanelName(panelId: PanelId, language: Language): string {
	return PANEL_NAMES[language][panelId];
}

export function getNewsPanelTitle(category: NewsCategory, language: Language): string {
	return NEWS_PANEL_TITLES[language][category];
}

export function getPresetCopy(
	presetId: string,
	language: Language
): { name: string; description: string } {
	return PRESET_COPY[language][presetId] ?? PRESET_COPY['en-US'][presetId];
}

export function getSituationCopy(
	panelId: 'venezuela' | 'greenland' | 'iran',
	language: Language
): { title: string; subtitle: string } {
	return SITUATION_COPY[language][panelId];
}

export function getCorrelationTopicName(
	topicId: string,
	language: Language,
	fallback = topicId
): string {
	if (language === 'zh-CN') {
		return ZH_CORRELATION_TOPIC_NAMES[topicId] ?? fallback;
	}
	return fallback || titleCaseFromId(topicId);
}

export function getNarrativeName(
	narrativeId: string,
	language: Language,
	fallback = narrativeId
): string {
	if (language === 'zh-CN') {
		return ZH_NARRATIVE_NAMES[narrativeId] ?? fallback;
	}
	return fallback || titleCaseFromId(narrativeId);
}

export function getStatusLabel(value: string, language: Language): string {
	if (language === 'zh-CN') {
		return ZH_STATUS_LABELS[value] ?? value;
	}
	return value.toUpperCase();
}

export function getSourceTypeLabel(type: string, language: Language): string {
	if (language === 'zh-CN') {
		return ZH_SOURCE_TYPE_LABELS[type] ?? type;
	}
	return type.toUpperCase();
}

export function getFedTypeLabel(type: string, language: Language, fallback = type): string {
	if (language === 'zh-CN') {
		return ZH_FED_TYPE_LABELS[type] ?? fallback;
	}
	return fallback;
}

export function translateFedIndicatorName(name: string, language: Language): string {
	if (language === 'zh-CN') {
		return ZH_FED_INDICATOR_LABELS[name] ?? name;
	}
	return name;
}

export function translateRegion(region: string, language: Language): string {
	if (language === 'zh-CN') {
		return ZH_REGIONS[region] ?? region;
	}
	return region;
}

export function translateTopic(topic: string, language: Language): string {
	if (language === 'zh-CN') {
		return ZH_TOPICS[topic] ?? topic;
	}
	return topic;
}

export function translateCountry(country: string, language: Language): string {
	if (language === 'zh-CN') {
		return ZH_COUNTRIES[country] ?? country;
	}
	return country;
}

export function translateLeaderTitle(title: string, language: Language): string {
	if (language === 'zh-CN') {
		return ZH_LEADER_TITLES[title] ?? title;
	}
	return title;
}

export function translateLeaderFocus(topic: string, language: Language): string {
	if (language === 'zh-CN') {
		return ZH_LEADER_FOCUS[topic] ?? topic;
	}
	return topic;
}

export function translatePredictionText(text: string, language: Language): string {
	if (language === 'zh-CN') {
		return ZH_PREDICTIONS[text] ?? text;
	}
	return text;
}

export function translateMapText(text: string, language: Language): string {
	if (language === 'zh-CN') {
		return ZH_MAP_TEXT[text] ?? text;
	}
	return text;
}

export function localizeMonthYear(value: string, language: Language): string {
	if (language !== 'zh-CN') return value;

	const [month, year] = value.split(' ');
	const zhMonths: Record<string, string> = {
		Jan: '1月',
		Feb: '2月',
		Mar: '3月',
		Apr: '4月',
		May: '5月',
		Jun: '6月',
		Jul: '7月',
		Aug: '8月',
		Sep: '9月',
		Oct: '10月',
		Nov: '11月',
		Dec: '12月'
	};

	if (!month || !year) return value;
	return `${year}年${zhMonths[month] ?? month}`;
}