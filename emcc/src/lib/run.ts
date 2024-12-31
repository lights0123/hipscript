// @ts-check

/// <reference path="./types.d.ts" />
/// <reference types="../../node_modules/@webgpu/types" />

const ChipVarPrefix = '_chip_var_';
const ChipVarInitPrefix = '_chip_var_init_';

import type { Terminal } from '@xterm/xterm';
import { openpty } from 'xterm-pty';
import CompileWorker from './compiler.worker?worker';
import Module from './wasm/webgpu_runtime.mjs';
import ModulePath from './wasm/webgpu_runtime.mjs?url';
import ModuleBinary from './wasm/webgpu_runtime.wasm?url';
import llvmManifest from './llvm_manifest.json';
// avoid Emscripten memory leak
import 'setimmediate';

const q = {
	data: {
		getPackage: {
			packageName: 'llvm-spir',
			namespace: 'lights0123',
			versions: [
				{
					version: '0.1.7',
					isArchived: false,
					v2: {
						piritaDownloadUrl: null,
						piritaSha256Hash: null,
						webcManifest: null
					},
					v3: {
						// not checked, but length validated
						piritaSha256Hash: '0000000000000000000000000000000000000000000000000000000000000000',
						webcManifest: JSON.stringify(llvmManifest)
					}
				}
			]
		},
		info: {
			defaultFrontend: 'https://wasmer.io'
		}
	}
};

const piritaDownloadUrl = '/lights0123-llvm-spir-0.1.7.webc';

const cache = await caches.open('my-cache');
let b;
try {
	b = URL.createObjectURL(await cache.match(piritaDownloadUrl).then((f) => f.blob()));
} catch (_) {
	console.error(_);
}
if (!b) {
	const res = await fetch(piritaDownloadUrl, {
		cache: 'no-store'
	});
	await cache.put(piritaDownloadUrl, res);
	b = URL.createObjectURL(await cache.match(piritaDownloadUrl).then((f) => f.blob()));
}
q.data.getPackage.versions[0].v3.piritaDownloadUrl = b;
const registry = `data:application/json;charset=utf-8,` + JSON.stringify(q);
// const registry = null;
// URL.revokeObjectURL(q);
// const contents = await fetch('/hi.hip').then((f) => f.text());
const sysroot = '/sysroot';
const triple = 'wasm32-unknown-emscripten';

const w1 = new CompileWorker();
const w2 = new CompileWorker();
w1.postMessage({ contents: '', registry, stage: -1 });
w2.postMessage({ contents: '', registry, stage: -2 });
const [{ pch: devicePch }, { pch: hostPch }] = await Promise.all([
	new Promise((resolve, reject) => {
		w1.onmessage = ({ data }) => {
			if (data.type === 'res') resolve(data.data);
			else if (data.type === 'err') reject(data.err);
			else if (data.type === 'feedback') console.log(data.data);
		};
	}),
	await new Promise((resolve, reject) => {
		w2.onmessage = ({ data }) => {
			if (data.type === 'res') resolve(data.data);
			else if (data.type === 'err') reject(data.err);
			else if (data.type === 'feedback') console.log(data.data);
		};
	})
]);

export interface KernelInfo {
	name: string;
	bx: number;
	by: number;
	bz: number;
	gx: number;
	gy: number;
	gz: number;
	duration: number;
	status?: string;
}

export interface RunInfo {
	kernels: KernelInfo[];
	allKernels: Iterable<string>;
}

export async function compile(
	adapterRequest: GPURequestAdapterOptions,
	contents: string,
	xterm: Terminal,
	aborter: AbortSignal
): Promise<RunInfo> {
	xterm.reset();

	aborter.throwIfAborted();

	// Create master/slave objects
	let { master, slave } = openpty();

	window.master = master;
	window.slave = slave;

	// Connect the master object to xterm.js
	xterm.loadAddon(master);
	let device: GPUDevice;
	try {
		const w1 = new CompileWorker();
		w1.postMessage({ contents, registry, pch: devicePch, stage: 0 });
		const w2 = new CompileWorker();
		w2.postMessage({ contents, registry, pch: hostPch, stage: 1 });
		const [{ reflection, cl_proc, shader }, { wasm, wasmMap }] = await Promise.all([
			new Promise((resolve, reject) => {
				w1.onmessage = ({ data }) => {
					if (data.type === 'res') resolve(data.data);
					else if (data.type === 'err') reject(data.err);
					else if (data.type === 'feedback') {
						slave.write(data.data);
						if (data.err) reject(data.data);
					}
				};
			}),
			new Promise((resolve, reject) => {
				w2.onmessage = ({ data }) => {
					if (data.type === 'res') resolve(data.data);
					else if (data.type === 'err') reject(data.err);
					else if (data.type === 'feedback') {
						slave.write(data.data);
						if (data.err) reject(data.data);
					}
				};
			})
		]);
		console.log(wasmMap);
		aborter.throwIfAborted();
		// console.log(await run('clang++', { args: ['--version'] }, false));
		// const wasm = {};
		window.wasm = wasm;
		window.Module = Module;
		const supportedLimits = [
			'maxTextureDimension1D',
			'maxTextureDimension2D',
			'maxTextureDimension3D',
			'maxTextureArrayLayers',
			'maxBindGroups',
			'maxBindGroupsPlusVertexBuffers',
			'maxBindingsPerBindGroup',
			'maxDynamicUniformBuffersPerPipelineLayout',
			'maxDynamicStorageBuffersPerPipelineLayout',
			'maxSampledTexturesPerShaderStage',
			'maxSamplersPerShaderStage',
			'maxStorageBuffersPerShaderStage',
			'maxStorageTexturesPerShaderStage',
			'maxUniformBuffersPerShaderStage',
			'maxUniformBufferBindingSize',
			'maxStorageBufferBindingSize',
			'minUniformBufferOffsetAlignment',
			'minStorageBufferOffsetAlignment',
			'maxVertexBuffers',
			'maxBufferSize',
			'maxVertexAttributes',
			'maxVertexBufferArrayStride',
			'maxInterStageShaderComponents',
			'maxInterStageShaderVariables',
			'maxColorAttachments',
			'maxColorAttachmentBytesPerSample',
			'maxComputeWorkgroupStorageSize',
			'maxComputeInvocationsPerWorkgroup',
			'maxComputeWorkgroupSizeX',
			'maxComputeWorkgroupSizeY',
			'maxComputeWorkgroupSizeZ',
			'maxComputeWorkgroupsPerDimension'
		];
		const adapter = await navigator.gpu.requestAdapter(adapterRequest);
		window.wgpuAdapter = adapter;

		function objLikeToObj(src) {
			const dst = {};
			for (const key in src) {
				if (supportedLimits.includes(key)) dst[key] = src[key];
			}
			return dst;
		}

		device = await adapter?.requestDevice({
			requiredFeatures: adapter.features,
			requiredLimits: objLikeToObj(adapter.limits)
		});
		if (!device) throw 'err';
		const timestamp = device.features.has('timestamp-query');
		window.wgpuDevice = device;

		const shaderModule = device.createShaderModule({
			code: shader // The WGSL shader provided in the variable
		});

		const map = reflection;
		/** @type Map<string, any> */
		const kernels = new Map();
		let printfString = '';
		for (const line of map.split('\n')) {
			const [ty, name, ...parts] = line.split(',');
			const data = {};
			for (let i = 0; i < parts.length; i += 2) {
				data[parts[i]] = parts[i + 1];
			}
			if (ty === 'kernel_decl')
				kernels.set(name, {
					args: [],
					dynamic_mem: false,
					printf: data['printf'] === '1'
				});
			else if (ty === 'kernel') {
				const kernel = kernels.get(name);
				if (!kernel) continue;
				if (data['argKind'] === 'local') kernel.dynamic_mem = +data['arrayElemSize'];
				if (!['buffer', 'pod_ubo'].includes(data['argKind'])) continue;
				kernel.args.push(data);
			} else if (ty === 'printf') {
				printfString += line + '\n';
			}
		}
		window.printfString = printfString;
		const wgpuPrintfGroupLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: 'storage' }
				}
			]
		});
		for (const [kernelName, kernel] of kernels) {
			/** @type GPUBindGroupLayoutEntry[] */
			const bindGroupLayoutDesc = [];
			/** @type number[] */
			const uniformBuffers = [];
			let hasGlobals = false;
			for (const { arg, argKind, binding, argSize, offset } of kernel.args) {
				if (!kernelName.startsWith(ChipVarInitPrefix) && arg.startsWith(ChipVarPrefix)) {
					hasGlobals = true;
					continue;
				}
				if (argKind === 'pod_ubo') {
					const len = +argSize + +offset;
					if ((+binding) in uniformBuffers) {
						uniformBuffers[binding] = Math.max(uniformBuffers[binding], len);
					} else {
						uniformBuffers[binding] = len;
					}
				}

				if (bindGroupLayoutDesc.some((desc) => desc.binding === +binding)) continue;
				bindGroupLayoutDesc.push({
					binding: +binding,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: argKind === 'buffer' ? 'storage' : 'uniform' }
				});
			}
			kernel.uniformBuffers = uniformBuffers;
			if (hasGlobals) {
				kernel.bindGroupLayoutDesc = bindGroupLayoutDesc;
			} else {
				kernel.bindGroupLayout = device.createBindGroupLayout({
					entries: bindGroupLayoutDesc
				});
				kernel.pipelineLayout = device.createPipelineLayout({
					bindGroupLayouts: [
						kernel.bindGroupLayout,
						// wgpuPrintfGroupLayout,
						...(kernel.printf ? [wgpuPrintfGroupLayout] : [])
					]
				});
			}
		}

		const wgpuPrintfBuffer = device.createBuffer({
			size: 1048576,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
		});

		const { promise, resolve, reject } = Promise.withResolvers();
		let mod = {
			ModuleBinary,
			mainScriptUrlOrBlob: ModulePath,
			pty: slave,
			preinitializedWebGPUDevice: device,
			wgpuShaderModule: shaderModule,
			wgpuKernelMap: kernels,
			wgpuGlobals: {},
			wgpuPrintfBuffer,
			wgpuPrintfStagingBuffer: device.createBuffer({
				size: 1048576,
				usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
			}),
			wgpuPrintfGroupLayout,
			wgpuPrintfBindGroup: device.createBindGroup({
				layout: wgpuPrintfGroupLayout,
				entries: [{ binding: 0, resource: { buffer: wgpuPrintfBuffer } }]
			}),
			wgpuAbortStagingBuffer: device.createBuffer({
				size: 4,
				usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
			}),
			...(timestamp
				? {
						wgpuTimestampBuffer: device.createBuffer({
							size: 8 * 2,
							usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
						}),
						wgpuTimestampReadBuffer: device.createBuffer({
							size: 8 * 2 * 128,
							usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
						}),
						wgpuTimestampQuery: device.createQuerySet({
							type: 'timestamp',
							count: 2
						})
					}
				: {}),
			wgpuKernelsRan: [] as KernelInfo[],
			preInit: () => {
				const FS = mod.FS;
				FS.writeFile('/printf.csv', printfString);
				mod.ENV['PRINTF_BUFFER_SIZE'] = wgpuPrintfBuffer.size;
			},
			/**
			 * @param {number} code
			 */
			onExit(code, ...args) {
				console.log('onExit');
				slave.write(code !== 0 ? '\x1b[1;91m' : '\x1b[1m');
				slave.write(`Process exited with code ${code}\n`);
				resolve(null);
			},
			onAbort(msg) {
				console.log('onAbort', msg);
				// slave.write('\x1b[1;91m' + msg);
				resolve(null);
			},
			printErr(msg) {
				if (!msg.endsWith('\n')) msg += '\n';
				console.log('errmsg', msg);
				if (msg.startsWith('worker sent an error')) return;
				if (msg.startsWith('WORKER_STACK')) {
					slave.write(
						'\x1b[1;91m' +
							msg
								.substring(13)
								.replaceAll(/^\s*at ([^f][^i][^l][^e]|file\.wasm\.main ).*\n/gm, '')
								.replace('.__original_main ', '.main ') +
							'\x1b[0m'
					);
					resolve(null);
				} else {
					slave.write('\x1b[1;93m' + msg + '\x1b[0m');
				}
			},
			dynamicLibraries: [URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' }))],
			locateFile(path, prefix) {
				if (path.endsWith('.wasm')) {
					return ModuleBinary;
				}
				return path;
			}
		};
		// the first kernel to use printf is really slow without this
		device.queue.writeBuffer(mod.wgpuPrintfBuffer, 0, new Uint32Array([0]));
		await Module(mod);
		window.Module = mod;
		await promise;
		mod._stop_bg_threads();
		setImmediate(() => mod._stop_bg_threads());

		if (mod.wgpuTimestampReadBuffer) {
			try {
				await mod.wgpuTimestampReadBuffer.mapAsync(
					GPUMapMode.READ
					// 0,
					// mod.wgpuTimestampReadBuffer.size,
				);
				const times = new BigUint64Array(
					mod.wgpuTimestampReadBuffer.getMappedRange(
						0,
						Math.min(mod.wgpuKernelsRan.length * 16, mod.wgpuTimestampReadBuffer.size)
					)
				);
				for (let i = 0; i < times.length / 2; i++) {
					mod.wgpuKernelsRan[i].duration = Number(times[i * 2 + 1] - times[i * 2]);
				}
			} catch (e) {
				console.error(e);
			}
		}
		console.log(mod.wgpuKernelsRan);
		return {
			kernels: mod.wgpuKernelsRan,
			allKernels: [...kernels.keys()].filter(
				(kernelName) => !kernelName.startsWith(ChipVarInitPrefix)
			)
		};
	} finally {
		console.log('dispose');
		device?.destroy();
		master.dispose();
		slave = null;
	}
}
