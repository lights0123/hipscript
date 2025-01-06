<script lang="ts">
	import { onMount } from 'svelte';
	import 'xterm/css/xterm.css';
	import RunControl from '$lib/RunControl.svelte';
	import type { Terminal } from '@xterm/xterm';
	import type { RunInfo } from '$lib/run';

	const samples = import.meta.glob('$lib/samples/*', {
		query: '?raw',
		import: 'default',
		eager: true
	});

	const terminalTheme = {
		foreground: '#eff0eb',
		background: '#282a36',
		selection: '#97979b33',
		black: '#282a36',
		brightBlack: '#686868',
		red: '#ff5c57',
		brightRed: '#ff5c57',
		green: '#5af78e',
		brightGreen: '#5af78e',
		yellow: '#f3f99d',
		brightYellow: '#f3f99d',
		blue: '#57c7ff',
		brightBlue: '#57c7ff',
		magenta: '#ff6ac1',
		brightMagenta: '#ff6ac1',
		cyan: '#9aedfe',
		brightCyan: '#9aedfe',
		white: '#f1f1f0',
		brightWhite: '#eff0eb'
	};

	let terminalElement: HTMLElement;
	let editorElement: import('$lib/Monaco.svelte').default;
	let lib: Promise<typeof import('$lib/run')>;
	let libInit: Promise<void>;
	let xterm: Terminal;

	let compiling = $state(false);
	let kernels: null | RunInfo = $state(null);
	let outputs: Record<string, string | Uint8Array> = $state({});

	async function initOk(ok: boolean) {
		const { Terminal } = await import('@xterm/xterm');
		const { FitAddon } = await import('@xterm/addon-fit');
		xterm = new Terminal({
			theme: terminalTheme
		});

		await import('@xterm/addon-image').then(({ ImageAddon }) => xterm.loadAddon(new ImageAddon()));
		await import('@xterm/addon-clipboard').then(({ ClipboardAddon }) =>
			xterm.loadAddon(new ClipboardAddon())
		);

		const fitAddon = new FitAddon();
		xterm.loadAddon(fitAddon);
		xterm.open(terminalElement);
		fitAddon.fit();
		new ResizeObserver(() => fitAddon.fit()).observe(terminalElement);

		xterm.writeln('Initializing...');
		if (!ok) {
			xterm.writeln('Not downloading compiler with unsupported browser');
			return;
		}
		lib = import('$lib/run');
		if (localStorage.getItem('hipscript-crash')) {
			xterm.writeln(
				'Your browser might have crashed during the last attempt, not starting automatic compilation.'
			);
			return;
		}
		libInit = lib.then((l) => l.init(xterm));
	}

	async function run(adapter: GPURequestAdapterOptions, aborter: AbortSignal) {
		try {
			compiling = true;
			kernels = null;
			outputs = {};
			if (!libInit) libInit = lib.then((l) => l.init(xterm));
			await libInit;
			kernels = await (
				await lib
			).compile(
				adapter,
				editorElement.getData(),
				xterm,
				aborter,
				(name, data) => (outputs[name] = data)
			);
		} finally {
			compiling = false;
		}
	}
</script>

<svelte:head>
	<title>HipScript: Run HIP and CUDA code with WebGPU</title>
</svelte:head>

<div class="flex w-full flex-col-reverse md:h-screen md:flex-row">
	<div class="flex h-full flex-1 flex-col justify-between overflow-hidden">
		<div class="flex min-h-[60vh] flex-1 flex-col md:min-h-0">
			{#await import('$lib/Monaco.svelte') then { default: Component }}
				<Component
					contents={localStorage.getItem('hipscript-content') || Object.values(samples)[0]}
					bind:this={editorElement}
				/>
			{/await}
		</div>
		<div
			style={`background: ${terminalTheme.background}`}
			class="h-[424px] p-2 pr-0"
			bind:this={terminalElement}
		></div>
	</div>
	<div class="md:w-72">
		<RunControl
			{run}
			{compiling}
			{kernels}
			{samples}
			{outputs}
			{initOk}
			selectSample={(s) => editorElement?.setData(samples[s])}
		/>
	</div>
</div>
