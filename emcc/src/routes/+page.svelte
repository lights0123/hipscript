<script lang="ts">
	// import '$lib/run'
	import { onMount } from 'svelte';
	import 'xterm/css/xterm.css';
	import RunControl from '$lib/RunControl.svelte';
	import { browser } from '$app/environment';
	import type { Terminal } from '@xterm/xterm';
	import type { RunInfo } from '$lib/run';

	let terminalElement: HTMLElement;
	let editorElement: import('$lib/Monaco.svelte').default;
	const lib: Promise<typeof import('$lib/run')> = browser
		? import('$lib/run')
		: ({} as unknown as any);
	let xterm: Terminal;
	onMount(async () => {
		const { Terminal } = await import('@xterm/xterm');
		const { FitAddon } = await import('@xterm/addon-fit');

		xterm = new Terminal();

		const fitAddon = new FitAddon();
		xterm.loadAddon(fitAddon);
		xterm.open(terminalElement);
		xterm.onData(data=>console.log('xterm', new TextEncoder().encode(data)))
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
		<div bind:this={terminalElement}></div>
	</div>
	<div class="w-72">
		<RunControl {run} {compiling} {kernels} />
	</div>
</div>
