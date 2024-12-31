<script lang="ts">
	// import '$lib/run'
	import { onMount } from 'svelte';
	import 'xterm/css/xterm.css';
	import RunControl from '$lib/RunControl.svelte';
	import { browser } from '$app/environment';
	import type { Terminal } from '@xterm/xterm';
	import type { RunInfo } from '$lib/run';

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
	const lib: Promise<typeof import('$lib/run')> = browser
		? import('$lib/run')
		: ({} as unknown as any);
	let xterm: Terminal;

	onMount(async () => {
		const { Terminal } = await import('@xterm/xterm');
		const { FitAddon } = await import('@xterm/addon-fit');
		xterm = new Terminal({
			theme: terminalTheme
		});

		const fitAddon = new FitAddon();
		xterm.loadAddon(fitAddon);
		xterm.open(terminalElement);
		fitAddon.fit();
		new ResizeObserver(() => fitAddon.fit()).observe(terminalElement);
	});

	let compiling = $state(false);
	let kernels: null | RunInfo = $state(null);

	async function run(adapter: GPURequestAdapterOptions, aborter: AbortSignal) {
		try {
			compiling = true;
			kernels = null;
			kernels = await (await lib).compile(adapter, editorElement.getData(), xterm, aborter);
		} finally {
			compiling = false;
		}
	}
</script>

<div class="flex h-screen w-full">
	<div class="flex flex-1 flex-col overflow-hidden">
		{#await import('$lib/Monaco.svelte') then { default: Component }}
			<Component bind:this={editorElement} />
		{/await}
		<div
			style={`background: ${terminalTheme.background}`}
			class="p-2 pr-0"
			bind:this={terminalElement}
		></div>
	</div>
	<div class="w-72">
		<RunControl {run} {compiling} {kernels} />
	</div>
</div>
