/**
 * Keyword configuration for alerts and categorization
 */

export const ALERT_KEYWORDS = [
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
	'retaliation'
] as const;

export type AlertKeyword = (typeof ALERT_KEYWORDS)[number];

export const REGION_KEYWORDS: Record<string, string[]> = {
	EUROPE: [
		'nato',
		'eu',
		'european',
		'ukraine',
		'russia',
		'germany',
		'france',
		'uk',
		'britain',
		'poland'
	],
	MENA: [
		'iran',
		'israel',
		'saudi',
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
		'indo-pacific',
		'south china sea',
		'asean',
		'philippines'
	],
	AMERICAS: ['us', 'america', 'canada', 'mexico', 'brazil', 'venezuela', 'latin'],
	AFRICA: ['africa', 'sahel', 'niger', 'sudan', 'ethiopia', 'somalia']
};

export interface RegionalHotspotSpread {
	hotspot: string;
	weight: number;
}

/**
 * Region-level diffusion map for hotspot scoring.
 *
 * The model may boost these hotspots even when a headline does not directly
 * mention the city, as long as the article is classified into that region.
 */
export const REGION_HOTSPOT_SPREAD: Record<string, RegionalHotspotSpread[]> = {
	EUROPE: [
		{ hotspot: 'Kyiv', weight: 1.0 },
		{ hotspot: 'Moscow', weight: 0.9 },
		{ hotspot: 'Brussels', weight: 0.7 },
		{ hotspot: 'London', weight: 0.6 }
	],
	MENA: [
		{ hotspot: 'Tehran', weight: 1.0 },
		{ hotspot: 'Tel Aviv', weight: 1.0 },
		{ hotspot: 'Riyadh', weight: 0.8 }
	],
	APAC: [
		{ hotspot: 'Beijing', weight: 1.0 },
		{ hotspot: 'Taipei', weight: 1.0 },
		{ hotspot: 'Tokyo', weight: 0.8 },
		{ hotspot: 'Singapore', weight: 0.7 },
		{ hotspot: 'Pyongyang', weight: 0.8 },
		{ hotspot: 'Delhi', weight: 0.5 }
	],
	AMERICAS: [
		{ hotspot: 'DC', weight: 1.0 },
		{ hotspot: 'Caracas', weight: 0.9 }
	],
	AFRICA: [
		{ hotspot: 'Riyadh', weight: 0.5 },
		{ hotspot: 'Brussels', weight: 0.4 },
		{ hotspot: 'London', weight: 0.3 }
	]
};

export const TOPIC_KEYWORDS: Record<string, string[]> = {
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
	DEFENSE: ['pentagon', 'dod', 'defense', 'military', 'army', 'navy', 'air force'],
	DIPLO: ['diplomat', 'embassy', 'treaty', 'sanctions', 'talks', 'summit', 'bilateral']
};

/**
 * Check if a headline contains alert keywords
 */
export function containsAlertKeyword(text: string): { isAlert: boolean; keyword?: string } {
	const lowerText = text.toLowerCase();
	for (const keyword of ALERT_KEYWORDS) {
		if (lowerText.includes(keyword)) {
			return { isAlert: true, keyword };
		}
	}
	return { isAlert: false };
}

/**
 * Detect region from text
 */
export function detectRegion(text: string): string | null {
	const lowerText = text.toLowerCase();
	for (const [region, keywords] of Object.entries(REGION_KEYWORDS)) {
		if (keywords.some((k) => lowerText.includes(k))) {
			return region;
		}
	}
	return null;
}

/**
 * Detect topics from text
 */
export function detectTopics(text: string): string[] {
	const lowerText = text.toLowerCase();
	const detected: string[] = [];
	for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
		if (keywords.some((k) => lowerText.includes(k))) {
			detected.push(topic);
		}
	}
	return detected;
}
