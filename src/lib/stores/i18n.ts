import { browser } from '$app/environment';
import { derived, writable } from 'svelte/store';
import {
	DEFAULT_LANGUAGE,
	LANGUAGE_OPTIONS,
	getMessages,
	type Language
} from '$lib/i18n';

const STORAGE_KEY = 'uiLanguage';

function isLanguage(value: string | null): value is Language {
	return value === 'zh-CN' || value === 'en-US';
}

function getInitialLanguage(): Language {
	if (!browser) return DEFAULT_LANGUAGE;

	const saved = localStorage.getItem(STORAGE_KEY);
	if (isLanguage(saved)) {
		return saved;
	}

	return DEFAULT_LANGUAGE;
}

function createLanguageStore() {
	const { subscribe, set, update } = writable<Language>(getInitialLanguage());

	function persist(next: Language): void {
		set(next);
		if (browser) {
			localStorage.setItem(STORAGE_KEY, next);
		}
	}

	return {
		subscribe,
		setLanguage(next: Language) {
			persist(next);
		},
		toggle() {
			update((current) => {
				const next = current === 'zh-CN' ? 'en-US' : 'zh-CN';
				if (browser) {
					localStorage.setItem(STORAGE_KEY, next);
				}
				return next;
			});
		}
	};
}

const languageStore = createLanguageStore();

export const language = {
	subscribe: languageStore.subscribe
};

export const ui = derived(language, ($language) => getMessages($language));

export function setLanguage(next: Language): void {
	languageStore.setLanguage(next);
}

export function toggleLanguage(): void {
	languageStore.toggle();
}

export { LANGUAGE_OPTIONS };
export type { Language };