import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import f from './emscripten_worker';

export default defineConfig({
	plugins: [
		sveltekit(),
		f({ include: [/\.m?[jt]s(\?.*)?$/] }),
		{
			name: 'configure-response-headers',
			configureServer: (server) => {
				server.middlewares.use((_req, res, next) => {
					res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
					res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
					next();
				});
			}
		}
	],
});
