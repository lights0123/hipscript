<script lang="ts">
	import { onMount } from 'svelte';
	import ErrorTriangle from 'iconoir/icons/regular/warning-triangle.svg?raw';
	import InfoCircle from 'iconoir/icons/regular/info-circle.svg?raw';
	import type { RunInfo } from './run';

	let { run, compiling, kernels }: { run: () => void; compiling: boolean; kernels: RunInfo } =
		$props();

	let options: { adapter: GPUAdapter; requestAdapterOptions: GPURequestAdapterOptions }[] = $state(
		[]
	);
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
		console.log(options.map((a) => a.adapter.info));
	});

	let controller = new AbortController();
	function click() {
		if (!compiling) {
			controller = new AbortController();
			run(options[selected]?.requestAdapterOptions, controller.signal);
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

	const limits = $derived(options[selected]?.adapter.limits);
	const limitDesc = $derived(
		limits &&
			[
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
</script>

<div class="flex h-full flex-col overflow-hidden p-2">
	<h2 class="text-center text-2xl font-bold">Select GPU</h2>
	<div class="grid grid-cols-2 space-x-2 font-medium">
		{#each options as o, i}
			<button
				onclick={() => (selected = i)}
				class={'my-2 rounded border p-1 capitalize transition-colors' +
					(i === selected ? ' bg-green-200 text-green-950' : ' bg-white')}
				>{o.adapter.info.vendor} {o.adapter.info.architecture}</button
			>
		{/each}
	</div>

	<ul>
		{#each limitDesc as limit}
			<li
				class={'flex' +
					(limit.warn && ({ info: ' text-blue-800' }[limit.warnLevel!] || ' text-orange-700'))}
				title={(limit.desc || '') + (limit.warn ? limit.warnDesc : '')}
			>
				{limit.name}: {limit.num}
				{#if limit.warn}
					<span class="ml-1">
						{@html { info: InfoCircle }[limit.warnLevel!] || ErrorTriangle}
					</span>
				{/if}
			</li>
		{/each}
	</ul>
	<button
		onclick={click}
		class="mt-2 w-full rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
	>
		{#if compiling}
			Cancel
		{:else}
			Run
		{/if}
	</button>
	{#if kernels != null}
		<div class="mb-1 mt-6 text-center text-2xl font-bold">Kernels Executed</div>
		<div class="flex w-full text-pretty border-b text-center font-semibold">
			<span class="flex-1">NDRange / Grid Size</span>
			<span class="flex-1">Workgroup / Block Size</span>
		</div>
		<ol class="-mx-2 flex h-full flex-col divide-y overflow-y-auto tabular-nums">
			{#each kernels?.kernels as kernel, i}
				<li class={'px-2 py-1' + (kernel.status && ' bg-orange-200')} title={kernel.status}>
					{#if kernel.status}
						<span class="flex font-bold text-orange-950">
							{@html ErrorTriangle}
							<span class="ml-1">
								{kernel.status === 'aborted' ? 'Aborted' : 'Error: hover for details'}
							</span>
						</span>
					{/if}
					<div class="flex justify-between">
						<span>
							<!-- <span class="select-none invisible">{'0'.repeat(digits-(i+1).toString().length)}</span> -->
							{i + 1}. {demangle(kernel.name)}</span
						>
						{#if kernel.duration}
							<span title={`${kernel.duration}ns`}>{formatNs(kernel.duration)}</span>
						{/if}
					</div>
					<div class="flex justify-between space-x-1">
						<span class="line-clamp-1 overflow-ellipsis"
							>{kernel.gx}×{kernel.gy}×{kernel.gz} ({kernel.gx * kernel.gy * kernel.gz})</span
						>
						<span class="line-clamp-1 overflow-ellipsis"
							>{kernel.bx}×{kernel.by}×{kernel.bz} ({kernel.bx * kernel.by * kernel.bz})</span
						>
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
