<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { language, ui, hotspotsStore } from '$lib/stores';
	import {
		CONFLICT_ZONES,
		CHOKEPOINTS,
		CABLE_LANDINGS,
		NUCLEAR_SITES,
		MILITARY_BASES,
		OCEANS,
		SANCTIONED_COUNTRY_IDS,
		THREAT_COLORS,
		WEATHER_CODES
	} from '$lib/config/map';
	import { CACHE_TTLS } from '$lib/config/api';
	import type { Hotspot } from '$lib/config/map';
	import type { CustomMonitor } from '$lib/types';
	import { translateMapText } from '$lib/i18n';

	interface Props {
		monitors?: CustomMonitor[];
		loading?: boolean;
		error?: string | null;
	}

	let { monitors = [], loading = false, error = null }: Props = $props();

	// Dynamic hotspots from store
	let currentHotspots = $derived($hotspotsStore.items);
	let renderedLanguage = $state<string | null>(null);
	let mapReady = $state(false);

	let mapContainer: HTMLDivElement;
	// D3 objects - initialized in initMap, null before initialization
	// Using 'any' for D3 objects as they're dynamically imported and have complex generic types
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let d3Module: typeof import('d3') | null = null;
	let svg: any = null;
	let mapGroup: any = null;
	let overlayGroup: any = null;
	let projection: any = null;
	let path: any = null;
	let zoom: any = null;
	let currentZoomTransform: any = null;
	/* eslint-enable @typescript-eslint/no-explicit-any */

	const WIDTH = 800;
	const HEIGHT = 400;
	const CORRUPTED_TEXT_PATTERN = /�|Ã.|â.|鈭/;

	// Tooltip state
	let tooltipContent = $state<{
		title: string;
		color: string;
		lines: string[];
	} | null>(null);
	let tooltipPosition = $state({ left: 0, top: 0 });
	let tooltipVisible = $state(false);

	// Data cache for tooltips with TTL support
	interface CacheEntry<T> {
		data: T;
		timestamp: number;
	}
	const dataCache: Record<string, CacheEntry<unknown>> = {};

	function getCachedData<T>(key: string): T | null {
		const entry = dataCache[key] as CacheEntry<T> | undefined;
		if (!entry) return null;
		// Check if cache entry has expired
		if (Date.now() - entry.timestamp > CACHE_TTLS.weather) {
			delete dataCache[key];
			return null;
		}
		return entry.data;
	}

	function setCachedData<T>(key: string, data: T): void {
		dataCache[key] = { data, timestamp: Date.now() };
	}

	function sanitizeDisplayText(value: string | null | undefined): string {
		if (!value) return '';
		const normalized = value
			.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		if (!normalized) return '';
		if (!CORRUPTED_TEXT_PATTERN.test(normalized)) return normalized;
		return normalized.replace(CORRUPTED_TEXT_PATTERN, ' ').replace(/\s+/g, ' ').trim();
	}

	function getHotspotDisplayName(hotspot: Hotspot): string {
		return sanitizeDisplayText(
			hotspot.nameLocalized?.[$language] ?? translateMapText(hotspot.name, $language)
		);
	}

	function getHotspotSummary(hotspot: Hotspot): string {
		return sanitizeDisplayText(
			hotspot.summary?.[$language] ?? translateMapText(hotspot.desc, $language)
		);
	}

	// Get local time at longitude
	function getLocalTime(lon: number, locale: string): string {
		const now = new Date();
		const utcHours = now.getUTCHours();
		const utcMinutes = now.getUTCMinutes();
		const offsetHours = Math.round(lon / 15);
		const displayDate = new Date(Date.UTC(2024, 0, 1, utcHours + offsetHours, utcMinutes));
		return displayDate.toLocaleTimeString(locale, {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'UTC'
		});
	}

	// Weather result type
	interface WeatherResult {
		temp: number | null;
		wind: number | null;
		condition: string;
	}

	// Fetch weather from Open-Meteo with TTL-based caching
	async function getWeather(lat: number, lon: number): Promise<WeatherResult | null> {
		const key = `weather_${lat}_${lon}`;
		const cached = getCachedData<WeatherResult>(key);
		if (cached) return cached;

		try {
			const res = await fetch(
				`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m`
			);
			const data = await res.json();
			const temp = data.current?.temperature_2m;
			const tempF = temp ? Math.round((temp * 9) / 5 + 32) : null;
			const wind = data.current?.wind_speed_10m;
			const code = data.current?.weather_code;
			const result: WeatherResult = {
				temp: tempF,
				wind: wind ? Math.round(wind) : null,
				condition: WEATHER_CODES[code] || '未知'
			};
			setCachedData(key, result);
			return result;
		} catch {
			return null;
		}
	}

	function projectScreenPoint(lon: number, lat: number): [number, number] | null {
		if (!projection) return null;
		const projected = projection([lon, lat]);
		if (!projected) return null;
		const [baseX, baseY] = projected as [number, number];
		if (!currentZoomTransform) return [baseX, baseY];
		return currentZoomTransform.apply([baseX, baseY]) as [number, number];
	}

	// Enable zoom/pan behavior on the map
	function enableZoom(): void {
		if (!svg || !zoom) return;
		svg.call(zoom);
	}

	// Calculate day/night terminator points
	function calculateTerminator(): [number, number][] {
		const now = new Date();
		const dayOfYear = Math.floor(
			(now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
		);
		const declination = -23.45 * Math.cos(((360 / 365) * (dayOfYear + 10) * Math.PI) / 180);
		const hourAngle = (now.getUTCHours() + now.getUTCMinutes() / 60) * 15 - 180;

		const terminatorPoints: [number, number][] = [];
		for (let lat = -90; lat <= 90; lat += 2) {
			const tanDec = Math.tan((declination * Math.PI) / 180);
			const tanLat = Math.tan((lat * Math.PI) / 180);
			let lon = -hourAngle + (Math.acos(-tanDec * tanLat) * 180) / Math.PI;
			if (isNaN(lon)) lon = lat * declination > 0 ? -hourAngle + 180 : -hourAngle;
			terminatorPoints.push([lon, lat]);
		}
		for (let lat = 90; lat >= -90; lat -= 2) {
			const tanDec = Math.tan((declination * Math.PI) / 180);
			const tanLat = Math.tan((lat * Math.PI) / 180);
			let lon = -hourAngle - (Math.acos(-tanDec * tanLat) * 180) / Math.PI;
			if (isNaN(lon)) lon = lat * declination > 0 ? -hourAngle - 180 : -hourAngle;
			terminatorPoints.push([lon, lat]);
		}
		return terminatorPoints;
	}

	// Show tooltip using state (safe rendering)
	function showTooltip(
		event: MouseEvent,
		title: string,
		color: string,
		lines: string[] = []
	): void {
		if (!mapContainer) return;
		const rect = mapContainer.getBoundingClientRect();
		tooltipContent = {
			title: sanitizeDisplayText(title),
			color,
			lines: lines.map((line) => sanitizeDisplayText(line)).filter(Boolean)
		};
		tooltipPosition = {
			left: event.clientX - rect.left + 15,
			top: event.clientY - rect.top - 10
		};
		tooltipVisible = true;
	}

	// Move tooltip
	function moveTooltip(event: MouseEvent): void {
		if (!mapContainer) return;
		const rect = mapContainer.getBoundingClientRect();
		tooltipPosition = {
			left: event.clientX - rect.left + 15,
			top: event.clientY - rect.top - 10
		};
	}

	// Hide tooltip
	function hideTooltip(): void {
		tooltipVisible = false;
		tooltipContent = null;
	}

	// Build enhanced tooltip with weather
	async function showEnhancedTooltip(event: MouseEvent, hotspot: Hotspot, color: string): Promise<void> {
		const localTime = getLocalTime(hotspot.lon, $language);
		const lines = [$ui.panels.map.localTime(localTime)];
		showTooltip(event, getHotspotSummary(hotspot), color, lines);

		// Fetch weather asynchronously
		const weather = await getWeather(hotspot.lat, hotspot.lon);
		if (weather && tooltipVisible) {
			tooltipContent = {
				title: getHotspotSummary(hotspot),
				color,
				lines: [
					$ui.panels.map.localTime(localTime),
					$ui.panels.map.weatherLine(
						translateMapText(weather.condition, $language),
						weather.temp,
						weather.wind
					)
				]
			};
		}
	}

	async function rebuildMap(): Promise<void> {
		if (!mapContainer || !d3Module) return;
		const svgEl = mapContainer.querySelector('svg');
		if (!svgEl) return;

		d3Module.select(svgEl).selectAll('*').remove();
		mapGroup = null;
		overlayGroup = null;
		projection = null;
		path = null;
		zoom = null;
		currentZoomTransform = null;
		await initMap();
	}

	// Initialize map
	async function initMap(): Promise<void> {
		const d3 = await import('d3');
		d3Module = d3;
		const topojson = await import('topojson-client');

		const svgEl = mapContainer.querySelector('svg');
		if (!svgEl) return;

		svg = d3.select(svgEl);
		svg.attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);

		mapGroup = svg.append('g').attr('id', 'mapGroup');
		overlayGroup = svg.append('g').attr('id', 'overlayGroup');
		currentZoomTransform = d3.zoomIdentity;

		// Setup zoom with bounded panning and wheel zoom support
		zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([1, 6])
			.extent([
				[0, 0],
				[WIDTH, HEIGHT]
			])
			.translateExtent([
				[0, 0],
				[WIDTH, HEIGHT]
			])
			.filter((event) => {
				// Block double-click zoom
				if (event.type === 'dblclick') return false;
				// Ignore non-primary mouse buttons while keeping wheel/touch enabled
				if ('button' in event && event.button !== 0) return false;
				// Allow wheel, drag, touch and programmatic controls
				return true;
			})
			.on('zoom', (event) => {
				mapGroup.attr('transform', event.transform.toString());
				currentZoomTransform = event.transform;
				drawStaticOverlays();
				drawHotspots(currentHotspots);
				drawMonitors();
			});

		enableZoom();

		// Setup projection
		projection = d3
			.geoEquirectangular()
			.scale(130)
			.center([0, 20])
			.translate([WIDTH / 2, HEIGHT / 2 - 30]);

		path = d3.geoPath().projection(projection);

		// Load world data
		try {
			const response = await fetch(
				'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
			);
			const world = await response.json();
			const countries = topojson.feature(
				world,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				world.objects.countries as any
			) as unknown as GeoJSON.FeatureCollection;

			// Draw countries
			mapGroup
				.selectAll('path.country')
				.data(countries.features)
				.enter()
				.append('path')
				.attr('class', 'country')
				.attr('d', path as unknown as string)
				.attr('fill', (d: GeoJSON.Feature) =>
					SANCTIONED_COUNTRY_IDS.includes(+(d.id || 0)) ? '#2a1a1a' : '#0f3028'
				)
				.attr('stroke', (d: GeoJSON.Feature) =>
					SANCTIONED_COUNTRY_IDS.includes(+(d.id || 0)) ? '#4a2020' : '#1a5040'
				)
				.attr('stroke-width', 0.5);

			// Draw graticule
			const graticule = d3.geoGraticule().step([30, 30]);
			mapGroup
				.append('path')
				.datum(graticule)
				.attr('d', path as unknown as string)
				.attr('fill', 'none')
				.attr('stroke', '#1a3830')
				.attr('stroke-width', 0.3)
				.attr('stroke-dasharray', '2,2');

			// Draw ocean labels
			OCEANS.forEach((o) => {
				const [x, y] = projection([o.lon, o.lat]) || [0, 0];
				if (x && y) {
					mapGroup
						.append('text')
						.attr('x', x)
						.attr('y', y)
						.attr('fill', '#1a4a40')
						.attr('font-size', '10px')
						.attr('font-family', 'monospace')
						.attr('text-anchor', 'middle')
						.attr('opacity', 0.6)
						.text(translateMapText(o.name, $language));
				}
			});

			// Draw day/night terminator
			const terminatorPoints = calculateTerminator();
			mapGroup
				.append('path')
				.datum({ type: 'Polygon', coordinates: [terminatorPoints] } as GeoJSON.Polygon)
				.attr('d', path as unknown as string)
				.attr('fill', 'rgba(0,0,0,0.3)')
				.attr('stroke', 'none');

			// Draw conflict zones
			CONFLICT_ZONES.forEach((zone) => {
				const zonePath = mapGroup
					.append('path')
					.datum({ type: 'Polygon', coordinates: [zone.coords] } as GeoJSON.Polygon)
					.attr('d', path as unknown as string)
					.attr('fill', zone.color)
					.attr('fill-opacity', 0.15)
					.attr('stroke', zone.color)
					.attr('stroke-width', 0.5)
					.attr('stroke-opacity', 0.4);

				zonePath
					.attr('class', 'hotspot-hit')
					.on('mouseenter', (event: MouseEvent) =>
						showTooltip(event, translateMapText(zone.name, $language), zone.color, [
							translateMapText(zone.desc, $language)
						])
					)
					.on('mousemove', moveTooltip)
					.on('mouseleave', hideTooltip);

				const centerLon =
					zone.coords.reduce((sum, point) => sum + point[0], 0) / Math.max(zone.coords.length, 1);
				const centerLat =
					zone.coords.reduce((sum, point) => sum + point[1], 0) / Math.max(zone.coords.length, 1);
				const [labelX, labelY] = projection([centerLon, centerLat]) || [0, 0];
				if (labelX && labelY) {
					mapGroup
						.append('text')
						.attr('x', labelX)
						.attr('y', labelY)
						.attr('fill', zone.color)
						.attr('font-size', '8px')
						.attr('font-family', 'monospace')
						.attr('text-anchor', 'middle')
						.attr('opacity', 0.75)
						.text(translateMapText(zone.name, $language));
				}
			});

			// Draw fixed-size overlay markers
			drawStaticOverlays();

			// Draw hotspots (initial draw using current store value)
			drawHotspots(currentHotspots);

			// Draw custom monitors with locations
			drawMonitors();
			renderedLanguage = $language;
			mapReady = true;
		} catch (err) {
			console.error('Failed to load map data:', err);
		}
	}

	function drawStaticOverlays(): void {
		if (!overlayGroup || !projection) return;
		overlayGroup.selectAll('.static-overlay').remove();

		CHOKEPOINTS.forEach((cp) => {
			const point = projectScreenPoint(cp.lon, cp.lat);
			if (!point) return;
			const [x, y] = point;
			const group = overlayGroup.append('g').attr('class', 'static-overlay');
			group
				.append('rect')
				.attr('x', x - 4)
				.attr('y', y - 4)
				.attr('width', 8)
				.attr('height', 8)
				.attr('fill', '#00aaff')
				.attr('opacity', 0.8)
				.attr('transform', `rotate(45,${x},${y})`);
			group
				.append('text')
				.attr('x', x + 8)
				.attr('y', y + 3)
				.attr('fill', '#00aaff')
				.attr('font-size', '7px')
				.attr('font-family', 'monospace')
				.text(translateMapText(cp.name, $language));
			group
				.append('circle')
				.attr('cx', x)
				.attr('cy', y)
				.attr('r', 10)
				.attr('fill', 'transparent')
				.attr('class', 'hotspot-hit')
				.on('mouseenter', (event: MouseEvent) =>
					showTooltip(event, translateMapText(cp.name, $language), '#00aaff', [
						translateMapText(cp.desc, $language)
					])
				)
				.on('mousemove', moveTooltip)
				.on('mouseleave', hideTooltip);
		});

		CABLE_LANDINGS.forEach((cl) => {
			const point = projectScreenPoint(cl.lon, cl.lat);
			if (!point) return;
			const [x, y] = point;
			const group = overlayGroup.append('g').attr('class', 'static-overlay');
			group
				.append('circle')
				.attr('cx', x)
				.attr('cy', y)
				.attr('r', 3)
				.attr('fill', 'none')
				.attr('stroke', '#aa44ff')
				.attr('stroke-width', 1.5);
			group
				.append('circle')
				.attr('cx', x)
				.attr('cy', y)
				.attr('r', 10)
				.attr('fill', 'transparent')
				.attr('class', 'hotspot-hit')
				.on('mouseenter', (event: MouseEvent) =>
					showTooltip(event, translateMapText(cl.name, $language), '#aa44ff', [
						translateMapText(cl.desc, $language)
					])
				)
				.on('mousemove', moveTooltip)
				.on('mouseleave', hideTooltip);
		});

		NUCLEAR_SITES.forEach((ns) => {
			const point = projectScreenPoint(ns.lon, ns.lat);
			if (!point) return;
			const [x, y] = point;
			const group = overlayGroup.append('g').attr('class', 'static-overlay');
			group.append('circle').attr('cx', x).attr('cy', y).attr('r', 2).attr('fill', '#ffff00');
			group
				.append('circle')
				.attr('cx', x)
				.attr('cy', y)
				.attr('r', 5)
				.attr('fill', 'none')
				.attr('stroke', '#ffff00')
				.attr('stroke-width', 1)
				.attr('stroke-dasharray', '3,3');
			group
				.append('circle')
				.attr('cx', x)
				.attr('cy', y)
				.attr('r', 10)
				.attr('fill', 'transparent')
				.attr('class', 'hotspot-hit')
				.on('mouseenter', (event: MouseEvent) =>
					showTooltip(event, translateMapText(ns.name, $language), '#ffff00', [
						translateMapText(ns.desc, $language)
					])
				)
				.on('mousemove', moveTooltip)
				.on('mouseleave', hideTooltip);
		});

		MILITARY_BASES.forEach((mb) => {
			const point = projectScreenPoint(mb.lon, mb.lat);
			if (!point) return;
			const [x, y] = point;
			const group = overlayGroup.append('g').attr('class', 'static-overlay');
			const starPath = `M${x},${y - 5} L${x + 1.5},${y - 1.5} L${x + 5},${y - 1.5} L${x + 2.5},${y + 1} L${x + 3.5},${y + 5} L${x},${y + 2.5} L${x - 3.5},${y + 5} L${x - 2.5},${y + 1} L${x - 5},${y - 1.5} L${x - 1.5},${y - 1.5} Z`;
			group.append('path').attr('d', starPath).attr('fill', '#ff00ff').attr('opacity', 0.8);
			group
				.append('circle')
				.attr('cx', x)
				.attr('cy', y)
				.attr('r', 10)
				.attr('fill', 'transparent')
				.attr('class', 'hotspot-hit')
				.on('mouseenter', (event: MouseEvent) =>
					showTooltip(event, translateMapText(mb.name, $language), '#ff00ff', [
						translateMapText(mb.desc, $language)
					])
				)
				.on('mousemove', moveTooltip)
				.on('mouseleave', hideTooltip);
		});
	}

	// Draw hotspot markers extracted so it can be called reactively
	function drawHotspots(hotspots: Hotspot[]): void {
		if (!overlayGroup || !projection) return;
		overlayGroup.selectAll('.hotspot-group').remove();

		hotspots.forEach((h) => {
			const point = projectScreenPoint(h.lon, h.lat);
			if (point) {
				const [x, y] = point;
				const color = THREAT_COLORS[h.level];
				// Pulsing circle
				overlayGroup
					.append('circle')
					.attr('class', 'hotspot-group pulse')
					.attr('cx', x)
					.attr('cy', y)
					.attr('r', 6)
					.attr('fill', color)
					.attr('fill-opacity', 0.3);
				// Inner dot
				overlayGroup
					.append('circle')
					.attr('class', 'hotspot-group')
					.attr('cx', x)
					.attr('cy', y)
					.attr('r', 3)
					.attr('fill', color);
				// Label
				overlayGroup
					.append('text')
					.attr('class', 'hotspot-group')
					.attr('x', x + 8)
					.attr('y', y + 3)
					.attr('fill', color)
					.attr('font-size', '8px')
					.attr('font-family', 'monospace')
					.text(getHotspotDisplayName(h));
				// Hit area
				overlayGroup
					.append('circle')
					.attr('class', 'hotspot-group hotspot-hit')
					.attr('cx', x)
					.attr('cy', y)
					.attr('r', 12)
					.attr('fill', 'transparent')
					.on('mouseenter', (event: MouseEvent) => showEnhancedTooltip(event, h, color))
					.on('mousemove', moveTooltip)
					.on('mouseleave', hideTooltip);
			}
		});
	}

	// Draw custom monitor locations
	function drawMonitors(): void {
		if (!overlayGroup || !projection) return;

		// Remove existing monitor markers
		overlayGroup.selectAll('.monitor-marker').remove();

		monitors
			.filter((m) => m.enabled && m.location)
			.forEach((m) => {
				if (!m.location) return;
				const point = projectScreenPoint(m.location.lon, m.location.lat);
				if (point) {
					const [x, y] = point;
					const color = m.color || '#00ffff';
					overlayGroup
						.append('circle')
						.attr('class', 'monitor-marker')
						.attr('cx', x)
						.attr('cy', y)
						.attr('r', 5)
						.attr('fill', color)
						.attr('fill-opacity', 0.6)
						.attr('stroke', color)
						.attr('stroke-width', 2);
					overlayGroup
						.append('text')
						.attr('class', 'monitor-marker')
						.attr('x', x + 8)
						.attr('y', y + 3)
						.attr('fill', color)
						.attr('font-size', '8px')
						.attr('font-family', 'monospace')
						.text(m.name);
					overlayGroup
						.append('circle')
						.attr('class', 'monitor-marker')
						.attr('cx', x)
						.attr('cy', y)
						.attr('r', 10)
						.attr('fill', 'transparent')
						.on('mouseenter', (event: MouseEvent) =>
							showTooltip(event, `📡 ${m.name}`, color, [
								m.location?.name || '',
								m.keywords.join(', ')
							])
						)
						.on('mousemove', moveTooltip)
						.on('mouseleave', hideTooltip);
				}
			});
	}

	// Zoom controls
	function zoomIn(): void {
		if (!svg || !zoom) return;
		svg.transition().duration(300).call(zoom.scaleBy, 1.5);
	}

	function zoomOut(): void {
		if (!svg || !zoom) return;
		svg
			.transition()
			.duration(300)
			.call(zoom.scaleBy, 1 / 1.5);
	}

	function resetZoom(): void {
		if (!svg || !zoom || !d3Module) return;
		svg.transition().duration(300).call(zoom.transform, d3Module.zoomIdentity);
	}

	// Reactively update monitors when they change
	$effect(() => {
		// Track monitors changes
		const _monitorsRef = monitors;
		if (_monitorsRef && mapGroup && projection) {
			drawMonitors();
		}
	});

	// Reactively redraw hotspots when the store updates
	$effect(() => {
		const hotspots = currentHotspots;
		if (hotspots && mapGroup && projection) {
			drawHotspots(hotspots);
		}
	});

	$effect(() => {
		const currentLanguage = $language;
		if (!mapReady || !mapGroup || renderedLanguage === null) {
			return;
		}
		if (renderedLanguage !== currentLanguage) {
			renderedLanguage = currentLanguage;
			void rebuildMap();
		}
	});

	onMount(() => {
		initMap();
	});
</script>

<Panel id="map" title={$ui.panels.map.title} {loading} {error}>
	{#if $hotspotsStore.llmEnriched}
		<div class="ai-badge">{$ui.panels.map.aiSummary($hotspotsStore.matchedCount)}</div>
	{:else if $hotspotsStore.matchedCount > 0}
		<div class="ai-badge algo">{$ui.panels.map.algoSummary($hotspotsStore.matchedCount)}</div>
	{/if}
	{#if !$hotspotsStore.loading && currentHotspots.length === 0}
		<div class="hotspot-empty">{$ui.panels.map.emptyHotspots}</div>
	{/if}
	<div class="map-container" bind:this={mapContainer}>
		<svg class="map-svg"></svg>
		{#if tooltipVisible && tooltipContent}
			<div
				class="map-tooltip"
				style="left: {tooltipPosition.left}px; top: {tooltipPosition.top}px;"
			>
				<strong style="color: {tooltipContent.color}">{tooltipContent.title}</strong>
				{#each tooltipContent.lines as line}
					<br /><span class="tooltip-line">{line}</span>
				{/each}
			</div>
		{/if}
		<div class="zoom-controls">
			<button class="zoom-btn" onclick={zoomIn} title={$ui.common.zoomIn}>+</button>
			<button class="zoom-btn" onclick={zoomOut} title={$ui.common.zoomOut}>-</button>
			<button class="zoom-btn" onclick={resetZoom} title={$ui.common.reset}>R</button>
		</div>
		<div class="map-legend">
			<div class="legend-item">
				<span class="legend-dot high"></span> {$ui.panels.map.legendHigh}
			</div>
			<div class="legend-item">
				<span class="legend-dot elevated"></span> {$ui.panels.map.legendElevated}
			</div>
			<div class="legend-item">
				<span class="legend-dot low"></span> {$ui.panels.map.legendLow}
			</div>
			<div class="legend-item muted">
				<span class="legend-symbol conflict"></span> {$ui.panels.map.legendConflict}
			</div>
			<div class="legend-item muted">
				<span class="legend-symbol chokepoint"></span> {$ui.panels.map.legendChokepoint}
			</div>
			<div class="legend-item muted">
				<span class="legend-symbol cable"></span> {$ui.panels.map.legendCable}
			</div>
			<div class="legend-item muted">
				<span class="legend-symbol nuclear"></span> {$ui.panels.map.legendNuclear}
			</div>
			<div class="legend-item muted">
				<span class="legend-symbol military"></span> {$ui.panels.map.legendMilitary}
			</div>
		</div>
	</div>
</Panel>

<style>
	.map-container {
		position: relative;
		width: 100%;
		aspect-ratio: 2 / 1;
		background: #0a0f0d;
		border-radius: 4px;
		overflow: hidden;
	}

	.ai-badge {
		display: inline-block;
		margin-bottom: 0.4rem;
		padding: 0.15rem 0.5rem;
		font-size: 0.6rem;
		font-family: monospace;
		background: rgba(0, 255, 136, 0.12);
		color: #00ff88;
		border: 1px solid rgba(0, 255, 136, 0.3);
		border-radius: 3px;
	}

	.ai-badge.algo {
		background: rgba(255, 204, 0, 0.1);
		color: #ffcc00;
		border-color: rgba(255, 204, 0, 0.3);
	}

	.hotspot-empty {
		margin-bottom: 0.4rem;
		font-size: 0.65rem;
		color: #8da89f;
		font-family: monospace;
	}

	.map-svg {
		width: 100%;
		height: 100%;
		touch-action: none;
	}

	.map-tooltip {
		position: absolute;
		background: rgba(10, 10, 10, 0.95);
		border: 1px solid #333;
		border-radius: 4px;
		padding: 0.5rem;
		font-size: 0.65rem;
		color: #ddd;
		max-width: 250px;
		pointer-events: none;
		z-index: 100;
	}

	.tooltip-line {
		opacity: 0.7;
	}

	.zoom-controls {
		position: absolute;
		bottom: 0.5rem;
		right: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.zoom-btn {
		width: 2.75rem;
		height: 2.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(20, 20, 20, 0.9);
		border: 1px solid #333;
		border-radius: 4px;
		color: #aaa;
		font-size: 1rem;
		cursor: pointer;
	}

	.zoom-btn:hover {
		background: rgba(40, 40, 40, 0.9);
		color: #fff;
	}

	.map-legend {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		background: rgba(10, 10, 10, 0.8);
		padding: 0.3rem 0.5rem;
		border-radius: 4px;
		font-size: 0.55rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: #888;
	}

	.legend-item.muted {
		opacity: 0.85;
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.legend-dot.high {
		background: #ff4444;
	}

	.legend-dot.elevated {
		background: #ffcc00;
	}

	.legend-dot.low {
		background: #00ff88;
	}

	.legend-symbol {
		display: inline-block;
		width: 8px;
		height: 8px;
	}

	.legend-symbol.conflict {
		background: #ff6644;
		opacity: 0.45;
	}

	.legend-symbol.chokepoint {
		background: #00aaff;
		transform: rotate(45deg);
	}

	.legend-symbol.cable {
		border-radius: 50%;
		border: 1.5px solid #aa44ff;
	}

	.legend-symbol.nuclear {
		border-radius: 50%;
		background: #ffff00;
	}

	.legend-symbol.military {
		background: #ff00ff;
		clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
	}

	/* Pulse animation for hotspots */
	:global(.pulse) {
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			r: 6;
			opacity: 0.3;
		}
		50% {
			r: 10;
			opacity: 0.1;
		}
	}

	:global(.hotspot-hit) {
		cursor: pointer;
	}

	/* Hide zoom controls on mobile where touch zoom is available */
	@media (max-width: 768px) {
		.zoom-controls {
			display: flex;
		}
	}
</style>



