<script lang="ts">
	import { onMount } from 'svelte';
	import ErrorTriangle from 'iconoir/icons/regular/warning-triangle.svg?raw';
	import InfoCircle from 'iconoir/icons/regular/info-circle.svg?raw';
	import type { RunInfo } from './run';
	import downloadFile from './downloadFile';

	let {
		run,
		compiling,
		kernels,
		samples,
		selectSample,
		outputs,
		initOk
	}: {
		run: () => unknown;
		compiling: boolean;
		kernels?: RunInfo;
		samples: Record<string, string>;
		selectSample: (s: string) => unknown;
		outputs: Record<string, string | Uint8Array>;
		initOk: (ok: boolean) => unknown;
	} = $props();

	let downloadSelection = $state(null);
	let gpuSelectionOpen = $state(true);

	$effect(() => {
		if (downloadSelection) downloadFile(...downloadSelection);
		downloadSelection = null;
	});

	let options: { adapter: GPUAdapter; requestAdapterOptions: GPURequestAdapterOptions }[] | null =
		$state(null);
	let selected = $state(0);
	onMount(async () => {
		const requestAdapterOptionsSets: GPURequestAdapterOptions[] = [
			{ powerPreference: 'high-performance' },
			{ powerPreference: 'low-power' },
			{ powerPreference: 'low-power', forceFallbackAdapter: true },
			{ xrCompatible: true }
		];

		const adapterIds = new Map();
		for (const requestAdapterOptions of requestAdapterOptionsSets) {
			try {
				const adapter = await navigator.gpu.requestAdapter(requestAdapterOptions);
				// The id is the the actual adaptor limits as a string.
				// Effectively if the limits are the same then it's *probably* the
				// same adaptor.
				if (!adapter) continue;
				function objLikeToKey(src: any) {
					let data = '';
					for (const key in src) {
						data += src[key];
					}
					return data;
				}
				adapterIds.set(objLikeToKey(adapter.info), { adapter, requestAdapterOptions });
			} catch (_) {}
		}
		options = [...adapterIds.values()];
		initOk(!!options.length);
	});

	let controller = new AbortController();
	function click() {
		gpuSelectionOpen = false;
		if (!compiling) {
			controller = new AbortController();
			run(options?.[selected]?.requestAdapterOptions, controller.signal);
		} else {
			controller.abort();
		}
	}

	function demangle(s: string) {
		if (s.startsWith('_Z')) {
			try {
				const len = Number.parseInt(s.substring(2));
				const start = 2 + len.toString().length;
				return s.substring(start, start + len);
			} catch {
				/* oh well */
			}
		}
		return s;
	}

	function formatNs(n: number) {
		if (n < 1000) return `${n}ns`;
		else if (n < 1000000) return `${(n / 1000).toFixed(3)}μs`;
		else return `${(n / 1000000).toFixed(3)}ms`;
	}

	const limits = $derived(options?.[selected]?.adapter.limits);
	const limitDesc = $derived(
		limits &&
			[
				{
					unless: !options?.[selected]?.adapter.isFallbackAdapter,
					name: 'CPU emulator',
					desc: 'This option emulates a GPU with the CPU. Using shared memory will result in a performance decrease rather than increase.',
					warn: true
				},
				{
					name: 'Max threads per block',
					num: limits.maxComputeInvocationsPerWorkgroup,
					warn: limits.maxComputeInvocationsPerWorkgroup < 1024,
					desc: 'There is a fixed limit of the number of threads that can be launched in a block/workgroup. ',
					warnDesc: ' This is below the standard CUDA limit of 1024.'
				},
				{
					name: 'Max shared memory bytes',
					num: limits.maxComputeWorkgroupStorageSize,
					desc: 'Threads within a block/workgroup share access to a limited amount of extremely fast on-chip memory.'
				},
				{
					unless: !limits.minSubgroupSize,
					name: 'Warp/Wavefront Size',
					num:
						limits.minSubgroupSize === limits.maxSubgroupSize
							? limits.minSubgroupSize
							: `${limits.minSubgroupSize}–${limits.maxSubgroupSize}`,
					warn: limits.minSubgroupSize !== limits.maxSubgroupSize || limits.minSubgroupSize !== 32,
					warnLevel: 'info',
					desc: 'The warp size is the number of threads that are executed in lockstep.',
					warnDesc:
						' All CUDA capable GPUs have a fixed warp size of 32. Code written with this in mind may not perform as expected.'
				}
			].filter(({ unless }) => !unless)
	);

	const re = /^.*?\d*([^/]*)\.[^./]*$/;

	const kernelStats = $derived(
		kernels && {
			maxRuntime: Math.max(...kernels.kernels.map((k) => k.duration || 0)),
			maxGrid: Math.max(...kernels.kernels.map((k) => k.gx * k.gy * k.gz))
		}
	);
</script>

<div class="flex h-full flex-col overflow-hidden p-2 dark:bg-slate-900 dark:text-white">
	<h1 class="text-center text-3xl font-[650]">HipScript</h1>
	<p class="text-center font-medium leading-tight">
		Online compiler for HIP and NVIDIA® CUDA® code to WebGPU
	</p>
	<p class="text-center font-[425]">
		By Ben Schattinger &bullet; <a
			class="text-blue-700 underline dark:text-blue-300"
			href="https://lights0123.com/blog/2025/01/07/hip-script/"
			rel="noopener"
			target="_blank">Learn More</a
		>
	</p>
	<small class="nojs-hidden">Load sample code:</small>
	<select
		oninput={(s) => selectSample(s.target!.value)}
		class="nojs-hidden block w-full rounded-md border-transparent bg-gray-100 p-2 focus:border-gray-500 focus:bg-white focus:ring-0 dark:bg-gray-800 focus:dark:bg-gray-900"
	>
		{#each Object.keys(samples) as sample}
			<option value={sample}>
				{re.exec(sample)![1]}
			</option>
		{/each}
	</select>
	<noscript>
		<p class="mb-2 mt-8 text-center text-3xl font-bold">JavaScript Required</p>
	</noscript>
	{#if options && !options.length}
		<p class="mb-2 mt-8 text-center text-3xl font-bold">WebGPU Not Available</p>
		{#if window.chrome}
			<p class="text-center">
				You might need to enable flags to enable it on your browser. Check out about:gpu and
				about:flags. If you're using Linux, try launching like:
			</p>
			<code>chromium --enable-unsafe-webgpu --enable-features=Vulkan</code>
			<p class="text-center">or</p>
			<code>google-chrome --enable-unsafe-webgpu --enable-features=Vulkan</code>
		{:else}
			<p class="text-center">
				Please try a Chromium-based browser like Google Chrome or Microsoft Edge.
			</p>
		{/if}
	{:else}
		<details bind:open={gpuSelectionOpen} class="nojs-hidden">
			<summary class="text-2xl font-semibold">Select GPU</summary>
			<div class={'grid space-x-2 font-medium ' + (options?.length > 1 ? 'grid-cols-2' : '')}>
				{#each options || [] as { adapter: { info } }, i}
					<button
						onclick={() => (selected = i)}
						class={'mb-2 rounded border p-1 capitalize transition-colors' +
							(i === selected
								? ' bg-green-200 text-green-950 dark:bg-green-900 dark:text-green-100'
								: ' bg-transparent text-black dark:text-white')}
						>{info.vendor} {info.vendor === info.architecture ? '' : info.architecture}</button
					>
				{/each}
			</div>

			<p class="font-medium">GPU Information</p>
			<ul class="mb-2">
				{#each limitDesc as limit}
					<li
						class={'flex' +
							(limit.warn &&
								({ info: ' text-blue-800 dark:text-blue-300' }[limit.warnLevel!] ||
									' text-orange-700 dark:text-orange-300'))}
						title={(limit.desc || '') + (limit.warn ? limit.warnDesc || '' : '')}
					>
						{limit.name + (limit.num == null ? '' : ':')}
						{limit.num}
						{#if limit.warn}
							<span class="ml-1">
								{@html { info: InfoCircle }[limit.warnLevel!] || ErrorTriangle}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		</details>
		<button
			onclick={click}
			class={'nojs-hidden w-full rounded px-4 py-2 font-bold' +
				(compiling
					? ' bg-red-500 text-white hover:bg-red-700'
					: ' bg-blue-500 text-white hover:bg-blue-700')}
		>
			{#if compiling}
				Cancel
			{:else}
				Run
			{/if}
		</button>
	{/if}

	{#if Object.keys(outputs).length}
		<select
			bind:value={downloadSelection}
			class="my-2 block w-full rounded-md border-transparent bg-gray-100 p-2 focus:border-gray-500 focus:bg-white focus:ring-0 dark:bg-gray-800 focus:dark:bg-gray-900"
		>
			<option value={null}>Download intermediate file...</option>
			{#each Object.entries(outputs) as [name, output]}
				<option value={[name, output]}>{name}</option>
			{/each}
		</select>
	{/if}
	{#if kernels != null}
		{#if kernels.timestampsQuantized}
			<details
				class="mb-1 rounded bg-orange-200 p-2 text-orange-950 dark:bg-orange-950 dark:text-orange-200"
			>
				<summary class="font-bold">Runtimes may be quantized</summary>
				Browsers round timestamps by default to protect your privacy.
				{#if window.chrome}
					Enable Chrome flag <a
						class="font-mono text-sm"
						href="chrome://flags/#enable-webgpu-developer-features"
						>enable-webgpu-developer-features</a
					>
					to avoid this.
				{/if}
			</details>
		{/if}
		<div class="mb-1 text-center text-2xl font-bold">Kernels Executed</div>
		<div class="flex w-full text-pretty border-b text-center font-semibold">
			<span class="flex-1">NDRange / Grid Size</span>
			<span class="flex-1">Workgroup / Block Size</span>
		</div>
		<ol class="-mx-2 flex h-full flex-col divide-y overflow-y-auto tabular-nums">
			{#each kernels?.kernels as kernel, i}
				{@const blockSize = kernel.bx * kernel.by * kernel.bz}
				{@const gridSize = kernel.gx * kernel.gy * kernel.gz}
				<li
					class={'z-0 px-2 py-1' + (kernel.status && ' bg-orange-200 dark:bg-orange-950')}
					title={kernel.status}
				>
					{#if kernel.status}
						<span class="flex font-bold text-orange-950 dark:text-orange-200">
							{@html ErrorTriangle}
							<span class="ml-1">
								{kernel.status === 'aborted' ? 'Aborted' : 'Error: hover for details'}
							</span>
						</span>
					{/if}
					<div class="grid grid-cols-3">
						<span class="col-span-2 line-clamp-1 overflow-ellipsis" title={demangle(kernel.name)}>
							{i + 1}. <span class="font-mono">{demangle(kernel.name)}</span></span
						>
						{#if 'duration' in kernel}
							<span class="relative text-right" title={`${kernel.duration}ns`}>
								<div
									class="absolute right-0 -z-10 h-full bg-fuchsia-200 dark:bg-fuchsia-950"
									style={`width: ${(kernel.duration / kernelStats!.maxRuntime) * 100}%`}
								></div>
								{formatNs(kernel.duration)}
							</span>
						{/if}
					</div>
					<div class="grid grid-cols-2 space-x-1">
						<span class="relative line-clamp-1 overflow-ellipsis">
							<div
								class="absolute right-0 -z-10 h-full bg-blue-200 dark:bg-blue-900"
								style={`width: ${(gridSize / kernelStats!.maxGrid) * 100}%`}
							></div>
							{kernel.gx}×{kernel.gy}×{kernel.gz} ({gridSize})
						</span>
						<span class="relative line-clamp-1 overflow-ellipsis text-right">
							<div
								class="absolute right-0 -z-10 h-full bg-sky-200 dark:bg-sky-900"
								style={`width: ${(blockSize / 1024) * 100}%`}
							></div>
							{kernel.bx}×{kernel.by}×{kernel.bz} ({blockSize})
						</span>
					</div>
				</li>
			{:else}
				<li class="italic text-center">No kernels executed</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	.numbered-list {
		counter-reset: item;
	}
	.list-number::before {
		content: counter(item) ') ';
		counter-increment: item;
	}
</style>
