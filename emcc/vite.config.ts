import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const headers = {
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Content-Security-Policy':
		"default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src * data: blob:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self'"
};
export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'configure-response-headers',
			configureServer: (server) => {
				server.middlewares.use((_req, res, next) => {
					for (const [k, v] of Object.entries(headers)) {
						res.setHeader(k, v);
					}
					next();
				});
			}
		}
	],
	define: {
		eval: null
	},
	worker: {
		format: 'es',
		plugins: () => [
			// allow importing web worker from main worker for code deduplication
			{
				name: 'preserve-strict-signatures',
				options(options) {
					return {
						...options,
						preserveEntrySignatures: 'strict'
					};
				}
			}
		]
	},
	build: {
		sourcemap: true,
		target: 'es2022'
	}
});
