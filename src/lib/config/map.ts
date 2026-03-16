// Map configuration - hotspots, conflict zones, and strategic locations

export interface LocalizedText {
	'zh-CN': string;
	'en-US': string;
}

export interface Hotspot {
	id?: string;
	name: string;
	nameLocalized?: LocalizedText;
	lat: number;
	lon: number;
	level: 'critical' | 'high' | 'elevated' | 'low';
	desc: string;
	summary?: LocalizedText;
	score?: number;
	mentions?: number;
	alertMentions?: number;
	recentMentions?: number;
	sourceDiversity?: number;
	country?: string;
	lastSeenAt?: number;
	/** Keywords used to match this hotspot against news headlines for dynamic scoring */
	keywords?: string[];
}

export interface ConflictZone {
	name: string;
	coords: [number, number][];
	color: string;
	desc: string;
}

export interface Chokepoint {
	name: string;
	lat: number;
	lon: number;
	desc: string;
}

export interface CableLanding {
	name: string;
	lat: number;
	lon: number;
	desc: string;
}

export interface NuclearSite {
	name: string;
	lat: number;
	lon: number;
	desc: string;
}

export interface MilitaryBase {
	name: string;
	lat: number;
	lon: number;
	desc: string;
}

export interface Ocean {
	name: string;
	lat: number;
	lon: number;
}

export const THREAT_COLORS = {
	critical: '#ff0000',
	high: '#ff4444',
	elevated: '#ffcc00',
	low: '#00ff88'
} as const;

export const SANCTIONED_COUNTRY_IDS = [
	364, // Iran
	408, // North Korea
	760, // Syria
	862, // Venezuela
	112, // Belarus
	643, // Russia
	728, // South Sudan
	729 // Sudan
];

export const HOTSPOTS: Hotspot[] = [
	{
		name: 'DC',
		lat: 38.9,
		lon: -77.0,
		level: 'low',
		desc: 'Washington DC — US political center, White House, Pentagon, Capitol',
		keywords: ['washington', 'white house', 'pentagon', 'congress', 'senate', 'trump', 'biden', 'federal government', 'capitol', 'cia', 'nsa', 'us president']
	},
	{
		name: 'Moscow',
		lat: 55.75,
		lon: 37.6,
		level: 'elevated',
		desc: 'Moscow — Kremlin, Russian military command, sanctions hub',
		keywords: ['russia', 'moscow', 'kremlin', 'putin', 'russian', 'fsb', 'svr', 'russian military', 'russian Federation', 'lavrov']
	},
	{
		name: 'Beijing',
		lat: 39.9,
		lon: 116.4,
		level: 'elevated',
		desc: 'Beijing — CCP headquarters, US-China tensions, tech rivalry',
		keywords: ['china', 'beijing', 'xi jinping', 'ccp', 'pla', 'chinese military', 'chinese government', 'politburo', 'us-china', 'bri', 'belt and road']
	},
	{
		name: 'Kyiv',
		lat: 50.45,
		lon: 30.5,
		level: 'high',
		desc: 'Kyiv — Active conflict zone, Russian invasion ongoing',
		keywords: ['ukraine', 'kyiv', 'zelensky', 'ukrainian', 'donetsk', 'kharkiv', 'odesa', 'zaporizhzhia', 'mariupol', 'dnipro', 'invasion', 'war in ukraine']
	},
	{
		name: 'Taipei',
		lat: 25.03,
		lon: 121.5,
		level: 'elevated',
		desc: 'Taipei — Taiwan Strait tensions, TSMC, China threat',
		keywords: ['taiwan', 'taipei', 'tsmc', 'taiwan strait', 'taiwanese', 'pla navy', 'cross-strait', 'reunification', 'semiconductor']
	},
	{
		name: 'Tehran',
		lat: 35.7,
		lon: 51.4,
		level: 'critical',
		desc: 'Tehran — ACTIVE UPRISING: 200+ cities, 26 provinces. Revolution protests, regime instability, nuclear program',
		keywords: ['iran', 'tehran', 'irgc', 'ayatollah', 'khamenei', 'iranian', 'nuclear program', 'uranium enrichment', 'persian', 'raisi', 'hassan nasrallah', 'iranian protests']
	},
	{
		name: 'Tel Aviv',
		lat: 32.07,
		lon: 34.78,
		level: 'high',
		desc: 'Tel Aviv — Israel-Gaza conflict, active military operations',
		keywords: ['israel', 'gaza', 'tel aviv', 'idf', 'hamas', 'netanyahu', 'west bank', 'hezbollah', 'iron dome', 'israeli', 'palestinian', 'jerusalem']
	},
	{
		name: 'London',
		lat: 51.5,
		lon: -0.12,
		level: 'low',
		desc: 'London — Financial center, Five Eyes, NATO ally',
		keywords: ['uk', 'britain', 'london', 'gchq', 'mi6', 'british government', 'nato ally', 'five eyes', 'sunak', 'starmer', 'bank of england']
	},
	{
		name: 'Brussels',
		lat: 50.85,
		lon: 4.35,
		level: 'low',
		desc: 'Brussels — EU/NATO headquarters, European policy',
		keywords: ['eu', 'european union', 'nato', 'brussels', 'european commission', 'nato headquarters', 'european parliament', 'von der leyen', 'european council']
	},
	{
		name: 'Pyongyang',
		lat: 39.03,
		lon: 125.75,
		level: 'elevated',
		desc: 'Pyongyang — North Korea nuclear threat, missile tests',
		keywords: ['north korea', 'pyongyang', 'kim jong un', 'dprk', 'icbm', 'north korean', 'missile test', 'nuclear test', 'north korean military']
	},
	{
		name: 'Riyadh',
		lat: 24.7,
		lon: 46.7,
		level: 'elevated',
		desc: 'Riyadh — Saudi oil, OPEC+, Yemen conflict, regional power',
		keywords: ['saudi', 'riyadh', 'opec', 'saudi aramco', 'bin salman', 'mbs', 'saudi arabia', 'gulf', 'aramco', 'oil production']
	},
	{
		name: 'Delhi',
		lat: 28.6,
		lon: 77.2,
		level: 'low',
		desc: 'Delhi — India rising power, China border tensions',
		keywords: ['india', 'delhi', 'modi', 'indian government', 'india-china', 'lac', 'line of actual control', 'indo-pacific', 'indian military', 'kashmir']
	},
	{
		name: 'Singapore',
		lat: 1.35,
		lon: 103.82,
		level: 'low',
		desc: 'Singapore — Shipping chokepoint, Asian finance hub',
		keywords: ['singapore', 'strait of malacca', 'asian finance', 'usd sgd', 'singapore dollar', 'asean']
	},
	{
		name: 'Tokyo',
		lat: 35.68,
		lon: 139.76,
		level: 'low',
		desc: 'Tokyo — US ally, regional security, economic power',
		keywords: ['japan', 'tokyo', 'japanese government', 'jsdf', 'kishida', 'japan-us', 'japan-china', 'japanese yen', 'boj', 'bank of japan', 'japanese military']
	},
	{
		name: 'Caracas',
		lat: 10.5,
		lon: -66.9,
		level: 'high',
		desc: 'Caracas — Venezuela crisis, Maduro regime, US sanctions, humanitarian emergency',
		keywords: ['venezuela', 'caracas', 'maduro', 'venezuelan', 'pdvsa', 'venezuelan opposition', 'us sanctions venezuela', 'guaido', 'migrant crisis venezuela']
	},
	{
		name: 'Nuuk',
		lat: 64.18,
		lon: -51.72,
		level: 'elevated',
		desc: 'Nuuk — Greenland, US acquisition interest, Arctic strategy, Denmark tensions',
		keywords: ['greenland', 'nuuk', 'arctic', 'denmark', 'danish', 'trump greenland', 'arctic sovereignty', 'northwest passage', 'arctic strategy']
	}
];

export const CONFLICT_ZONES: ConflictZone[] = [
	{
		name: 'Ukraine',
		coords: [
			[30, 52],
			[40, 52],
			[40, 45],
			[30, 45],
			[30, 52]
		],
		color: '#ff4444',
		desc: 'Ukraine conflict zone — front-line combat and infrastructure risk'
	},
	{
		name: 'Gaza',
		coords: [
			[34, 32],
			[35, 32],
			[35, 31],
			[34, 31],
			[34, 32]
		],
		color: '#ff4444',
		desc: 'Gaza conflict zone — persistent urban warfare and humanitarian pressure'
	},
	{
		name: 'Taiwan Strait',
		coords: [
			[117, 28],
			[122, 28],
			[122, 22],
			[117, 22],
			[117, 28]
		],
		color: '#ffaa00',
		desc: 'Taiwan Strait tension zone — military signaling and maritime pressure'
	},
	{
		name: 'Yemen',
		coords: [
			[42, 19],
			[54, 19],
			[54, 12],
			[42, 12],
			[42, 19]
		],
		color: '#ff6644',
		desc: 'Yemen conflict zone — regional proxy conflict and shipping disruption risk'
	},
	{
		name: 'Sudan',
		coords: [
			[22, 23],
			[38, 23],
			[38, 8],
			[22, 8],
			[22, 23]
		],
		color: '#ff6644',
		desc: 'Sudan conflict zone — civil war conditions and displacement pressure'
	},
	{
		name: 'Myanmar',
		coords: [
			[92, 28],
			[101, 28],
			[101, 10],
			[92, 10],
			[92, 28]
		],
		color: '#ff8844',
		desc: 'Myanmar conflict zone — internal armed clashes and governance instability'
	}
];

export const CHOKEPOINTS: Chokepoint[] = [
	{
		name: 'Suez',
		lat: 30.0,
		lon: 32.5,
		desc: 'Suez Canal — 12% of global trade, Europe-Asia route'
	},
	{
		name: 'Panama',
		lat: 9.1,
		lon: -79.7,
		desc: 'Panama Canal — Americas transit, Pacific-Atlantic link'
	},
	{
		name: 'Hormuz',
		lat: 26.5,
		lon: 56.5,
		desc: 'Strait of Hormuz — 21% of global oil, Persian Gulf exit'
	},
	{
		name: 'Malacca',
		lat: 2.5,
		lon: 101.0,
		desc: 'Strait of Malacca — 25% of global trade, China supply line'
	},
	{
		name: 'Bab el-M',
		lat: 12.5,
		lon: 43.3,
		desc: 'Bab el-Mandeb — Red Sea gateway, Houthi threat zone'
	},
	{ name: 'Gibraltar', lat: 36.0, lon: -5.5, desc: 'Strait of Gibraltar — Mediterranean access' },
	{
		name: 'Bosporus',
		lat: 41.1,
		lon: 29.0,
		desc: 'Bosporus Strait — Black Sea access, Russia exports'
	}
];

export const CABLE_LANDINGS: CableLanding[] = [
	{ name: 'NYC', lat: 40.7, lon: -74.0, desc: 'New York — Transatlantic hub, 10+ cables' },
	{ name: 'Cornwall', lat: 50.1, lon: -5.5, desc: 'Cornwall UK — Europe-Americas gateway' },
	{ name: 'Marseille', lat: 43.3, lon: 5.4, desc: 'Marseille — Mediterranean hub, SEA-ME-WE' },
	{ name: 'Mumbai', lat: 19.1, lon: 72.9, desc: 'Mumbai — India gateway, 10+ cables' },
	{ name: 'Singapore', lat: 1.3, lon: 103.8, desc: 'Singapore — Asia-Pacific nexus' },
	{ name: 'Hong Kong', lat: 22.3, lon: 114.2, desc: 'Hong Kong — China connectivity hub' },
	{ name: 'Tokyo', lat: 35.5, lon: 139.8, desc: 'Tokyo — Trans-Pacific terminus' },
	{ name: 'Sydney', lat: -33.9, lon: 151.2, desc: 'Sydney — Australia/Pacific hub' },
	{ name: 'LA', lat: 33.7, lon: -118.2, desc: 'Los Angeles — Pacific gateway' },
	{ name: 'Miami', lat: 25.8, lon: -80.2, desc: 'Miami — Americas/Caribbean hub' }
];

export const NUCLEAR_SITES: NuclearSite[] = [
	{ name: 'Natanz', lat: 33.7, lon: 51.7, desc: 'Natanz — Iran uranium enrichment' },
	{ name: 'Yongbyon', lat: 39.8, lon: 125.8, desc: 'Yongbyon — North Korea nuclear complex' },
	{ name: 'Dimona', lat: 31.0, lon: 35.1, desc: 'Dimona — Israel nuclear facility' },
	{ name: 'Bushehr', lat: 28.8, lon: 50.9, desc: 'Bushehr — Iran nuclear power plant' },
	{
		name: 'Zaporizhzhia',
		lat: 47.5,
		lon: 34.6,
		desc: 'Zaporizhzhia — Europe largest NPP, conflict zone'
	},
	{ name: 'Chernobyl', lat: 51.4, lon: 30.1, desc: 'Chernobyl — Exclusion zone, occupied 2022' },
	{ name: 'Fukushima', lat: 37.4, lon: 141.0, desc: 'Fukushima — Decommissioning site' }
];

export const MILITARY_BASES: MilitaryBase[] = [
	{ name: 'Ramstein', lat: 49.4, lon: 7.6, desc: 'Ramstein — US Air Force, NATO hub Germany' },
	{
		name: 'Diego Garcia',
		lat: -7.3,
		lon: 72.4,
		desc: 'Diego Garcia — US/UK Indian Ocean base'
	},
	{
		name: 'Okinawa',
		lat: 26.5,
		lon: 127.9,
		desc: 'Okinawa — US Forces Japan, Pacific presence'
	},
	{ name: 'Guam', lat: 13.5, lon: 144.8, desc: 'Guam — US Pacific Command, bomber base' },
	{
		name: 'Djibouti',
		lat: 11.5,
		lon: 43.1,
		desc: 'Djibouti — US/China/France bases, Horn of Africa'
	},
	{ name: 'Qatar', lat: 25.1, lon: 51.3, desc: 'Al Udeid — US CENTCOM forward HQ' },
	{
		name: 'Kaliningrad',
		lat: 54.7,
		lon: 20.5,
		desc: 'Kaliningrad — Russian Baltic exclave, missiles'
	},
	{ name: 'Sevastopol', lat: 44.6, lon: 33.5, desc: 'Sevastopol — Russian Black Sea Fleet' },
	{
		name: 'Hainan',
		lat: 18.2,
		lon: 109.5,
		desc: 'Hainan — Chinese submarine base, South China Sea'
	}
];

export const OCEANS: Ocean[] = [
	{ name: 'ATLANTIC', lat: 25, lon: -40 },
	{ name: 'PACIFIC', lat: 0, lon: -150 },
	{ name: 'INDIAN', lat: -20, lon: 75 },
	{ name: 'ARCTIC', lat: 75, lon: 0 },
	{ name: 'SOUTHERN', lat: -60, lon: 0 }
];

export const WEATHER_CODES: Record<number, string> = {
	0: '☀️ Clear',
	1: '🌤️ Mostly clear',
	2: '⛅ Partly cloudy',
	3: '☁️ Overcast',
	45: '🌫️ Fog',
	48: '🌫️ Fog',
	51: '🌧️ Drizzle',
	53: '🌧️ Drizzle',
	55: '🌧️ Drizzle',
	61: '🌧️ Rain',
	63: '🌧️ Rain',
	65: '🌧️ Heavy rain',
	71: '🌨️ Snow',
	73: '🌨️ Snow',
	75: '🌨️ Heavy snow',
	77: '🌨️ Snow',
	80: '🌧️ Showers',
	81: '🌧️ Showers',
	82: '⛈️ Heavy showers',
	85: '🌨️ Snow',
	86: '🌨️ Snow',
	95: '⛈️ Thunderstorm',
	96: '⛈️ Thunderstorm',
	99: '⛈️ Thunderstorm'
};
