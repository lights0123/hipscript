import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'configure-response-headers',
			configureServer: (server) => {
				server.middlewares.use((_req, res, next) => {
					res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
					res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
					res.setHeader(
						'Content-Security-Policy',
						"default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self'"
					);
					next();
				});
			}
		}
	],
	define: {
		eval: null
	}
});
