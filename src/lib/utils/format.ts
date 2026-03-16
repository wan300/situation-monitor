/**
 * Formatting utilities
 */

import type { Language } from '$lib/i18n';

/**
 * Format relative time from a date
 */
export function timeAgo(dateInput: string | number | Date, locale: Language = 'en-US'): string {
	const date = new Date(dateInput);
	const now = new Date();
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (locale === 'zh-CN') {
		if (seconds < 60) return '刚刚';
		if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
		if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
		return `${Math.floor(seconds / 86400)} 天前`;
	}

	if (seconds < 60) return 'just now';
	if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
	if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
	return Math.floor(seconds / 86400) + 'd';
}

/**
 * Get relative time with more detail
 */
export function getRelativeTime(
	dateInput: string | number | Date,
	locale: Language = 'en-US'
): string {
	const date = new Date(dateInput);
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const days = Math.floor(hours / 24);

	if (locale === 'zh-CN') {
		if (hours < 1) return '刚刚';
		if (hours < 24) return `${hours} 小时前`;
		if (days < 7) return `${days} 天前`;
		return date.toLocaleDateString(locale);
	}

	if (hours < 1) return 'Just now';
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return date.toLocaleDateString(locale);
}

/**
 * Format currency value
 */
export function formatCurrency(
	value: number,
	options: { decimals?: number; compact?: boolean; symbol?: string; locale?: Language } = {}
): string {
	const { decimals = 2, compact = false, symbol = '$', locale = 'en-US' } = options;

	if (compact) {
		return (
			symbol +
			new Intl.NumberFormat(locale, {
				notation: 'compact',
				maximumFractionDigits: 1
			}).format(value)
		);
	}

	return (
		symbol +
		value.toLocaleString(locale, {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals
		})
	);
}

/**
 * Format number with compact notation
 */
export function formatNumber(value: number, decimals = 2, locale: Language = 'en-US'): string {
	if (Math.abs(value) >= 1e3) {
		return new Intl.NumberFormat(locale, {
			notation: 'compact',
			maximumFractionDigits: decimals
		}).format(value);
	}

	return value.toLocaleString(locale, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	});
}

/**
 * Format percent change with sign
 */
export function formatPercentChange(
	value: number,
	decimals = 2,
	locale: Language = 'en-US'
): string {
	const sign = value > 0 ? '+' : '';
	return (
		sign +
		new Intl.NumberFormat(locale, {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals
		}).format(value) +
		'%'
	);
}

/**
 * Get CSS class for positive/negative change
 */
export function getChangeClass(value: number): 'up' | 'down' | '' {
	if (value > 0) return 'up';
	if (value < 0) return 'down';
	return '';
}

/**
 * Escape HTML for safe display
 */
export function escapeHtml(text: string): string {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

/**
 * Get date from days ago
 */
export function getDateDaysAgo(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return date.toISOString().split('T')[0];
}

/**
 * Get today's date formatted
 */
export function getToday(): string {
	return new Date().toISOString().split('T')[0];
}

/**
 * Convert lat/lon to map position (equirectangular projection)
 */
export function latLonToXY(
	lat: number,
	lon: number,
	width: number,
	height: number
): { x: number; y: number } {
	const x = ((lon + 180) / 360) * width;
	const y = ((90 - lat) / 180) * height;
	return { x, y };
}
