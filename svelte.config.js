import nodeAdapter from '@sveltejs/adapter-node';
import vercelAdapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const useLocalNodeAdapter =
	process.platform === 'win32' && process.env.CI !== 'true' && process.env.VERCEL !== '1';

const selectedAdapter = useLocalNodeAdapter
	? nodeAdapter({
			out: 'build'
		})
	: vercelAdapter({
			split: false
		});

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// Use node adapter for local Windows builds; Vercel adapter for deployment/CI.
		adapter: selectedAdapter,
		paths: {
			base: process.env.BASE_PATH || ''
		},
		alias: {
			$lib: 'src/lib',
			$components: 'src/lib/components',
			$stores: 'src/lib/stores',
			$services: 'src/lib/services',
			$config: 'src/lib/config',
			$types: 'src/lib/types'
		}
	}
};

export default config;
