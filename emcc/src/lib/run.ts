import type { Terminal } from '@xterm/xterm';
import { openpty } from 'xterm-pty';
import CompileWorker from './compiler.worker?worker';
import ModulePath from './wasm/webgpu_runtime.mjs?worker&url';
import ModuleBinary from './wasm/webgpu_runtime.wasm?url';
import llvmManifest from './llvm_manifest.json';
// avoid Emscripten memory leak
import 'setimmediate';

const ChipVarPrefix = '_chip_var_';
const ChipVarInitPrefix = '_chip_var_init_';

// this is ok since in vite.config.ts we configure web workers to keep their exports
const Module = import(/* @vite-ignore */ ModulePath);

async function runCompilers<T>(
	instances: any[],
	cb: (ev: MessageEvent, resolve: (d: T) => void, reject: (e?: any) => void) => void
): Promise<T[]> {
	if (navigator.deviceMemory >= 8) {
		const workers: Worker[] = [];
		for (const instance of instances) {
			const worker = new CompileWorker();
			worker.postMessage(instance);
			workers.push(worker);
		}
		return await Promise.all(
			workers.map(
				(worker) =>
					new Promise<T>((resolve, reject) => {
						worker.onmessage = (e) => cb(e, resolve, reject);
					})
			)
		);
	} else {
		const res = [];
		for (const instance of instances) {
			const worker = new CompileWorker();
			worker.postMessage(instance);
			res.push(
				await new Promise<T>((resolve, reject) => {
					worker.onmessage = (e) => cb(e, resolve, reject);
				})
			);
		}
		return res;
	}
}

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
						piritaDownloadUrl: '',
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

const piritaDownloadUrl = import.meta.env.VITE_LLVM_URL;
let registry: string;
let devicePch: Uint8Array, hostPch: Uint8Array;
export async function init(term: Terminal) {
	const cache = await caches.open('my-cache');
	let b;
	try {
		b = URL.createObjectURL(await cache.match(piritaDownloadUrl).then((f) => f!.blob()));
	} catch (_) {
		// oh well
	}
	if (!b) {
		const res = await fetch(piritaDownloadUrl, {
			cache: 'no-store'
		});

		cache.keys().then((keys) => {
			for (const request of keys) {
				cache.delete(request);
			}
			cache.put(piritaDownloadUrl, res);
		});

		const values = [];
		const reader = res.clone().body!.getReader();
		let loaded = 0;
		const total = Number.parseInt(import.meta.env.VITE_LLVM_SIZE);
		term.write('Downloading LLVM [0%]');
		for (let { done, value } = await reader.read(); !done; { done, value } = await reader.read()) {
			values.push(value!);
			loaded += value!.byteLength;
			term.write(`\rDownloading LLVM [${Math.floor((loaded / total) * 100)}%]`);
		}
		term.writeln('\rDownloaded LLVM        ');

		b = URL.createObjectURL(new Blob(values));
	}
	q.data.getPackage.versions[0].v3.piritaDownloadUrl = b;
	registry = `data:application/json;charset=utf-8,` + JSON.stringify(q);

	term.writeln('Precompiling headers...');

	const [res1, res2] = await runCompilers(
		[
			{ contents: '', registry, stage: -1 },
			{ contents: '', registry, stage: -2 }
		],
		({ data }, resolve, reject) => {
			if (data.type === 'res') resolve(data.data);
			else if (data.type === 'err') reject(data.err);
			else if (data.type === 'feedback') term.write(data.data.replaceAll('\n', '\r\n'));
		}
	);
	devicePch = res1.pch;
	hostPch = res2.pch;
	setImmediate(() => term.reset());
}

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
	timestampsQuantized: boolean;
}

let codeCache = {
	contents: '',
	reflection: '',
	bc: new Uint8Array(),
	cl: new Uint8Array(),
	shader: '',
	wasm: '',
	wasmMap: ''
};
const cacheCleaner = new FinalizationRegistry<string>((s) => {
	URL.revokeObjectURL(s);
});

export async function compile(
	adapterRequest: GPURequestAdapterOptions,
	contents: string,
	xterm: Terminal,
	aborter: AbortSignal,
	download: (name: string, data: string | Uint8Array) => unknown
): Promise<RunInfo | undefined> {
	xterm.reset();

	aborter.throwIfAborted();

	// Create master/slave objects
	let { master: ptyController, slave: pty } = openpty();

	// Connect the master object to xterm.js
	xterm.loadAddon(ptyController);
	let device: GPUDevice | undefined;
	try {
		let { reflection, bc, cl, shader, wasm, wasmMap } = codeCache;
		if (codeCache.contents !== contents) {
			const [p1, p2] = await runCompilers(
				[
					{ contents, registry, pch: devicePch, stage: 0 },
					{ contents, registry, pch: hostPch, stage: 1 }
				],
				({ data }, resolve, reject) => {
					if (data.type === 'res') resolve(data.data);
					else if (data.type === 'err') reject();
					else if (data.type === 'feedback') {
						pty.write(data.data);
						if (data.err) reject();
					}
				}
			);
			reflection = p1.reflection;
			bc = p1.bc;
			cl = p1.cl;
			shader = p1.shader;
			wasm = URL.createObjectURL(new Blob([p2.wasm], { type: 'application/wasm' }));
			wasmMap = p2.wasmMap;
			codeCache = {
				contents,
				reflection,
				bc,
				cl,
				shader,
				wasm,
				wasmMap
			};
			cacheCleaner.register(codeCache, wasm);
		}
		download('kernel-ocl.bc', bc);
		download('kernel.spv', cl);
		download('kernel.csv', reflection);
		download('kernel.wgsl', shader);
		// console.log(wasmMap);
		aborter.throwIfAborted();
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

		function objLikeToObj(src: any) {
			const dst: any = {};
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
		device.onuncapturederror = (e) => {
			pty.write('\x1b[1;91m' + e.error.message + '\x1b[0m');
		};

		device.pushErrorScope('validation');
		const shaderModule = device.createShaderModule({
			code: shader // The WGSL shader provided in the variable
		});
		await device.popErrorScope().then((s) => {
			if (s) throw s.message;
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
		const wgpuAnyKernelHasBindings = kernels.values().some((k) => k.args.length);
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
						...(wgpuAnyKernelHasBindings ? [kernel.bindGroupLayout] : []),
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
			pty: pty,
			preinitializedWebGPUDevice: device,
			wgpuShaderModule: shaderModule,
			wgpuKernelMap: kernels,
			wgpuGlobals: {},
			wgpuAnyKernelHasBindings,
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
				pty.write(code !== 0 ? '\x1b[1;91m' : '\x1b[1m');
				pty.write(`Process exited with code ${code}\n`);
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
					pty.write(
						'\x1b[1;91m' +
							msg
								.substring(13)
								.replaceAll(/^\s*at ([^f][^i][^l][^e]|file\.wasm\.main ).*\n/gm, '')
								.replace('.__original_main ', '.main ')
								.replace('resolved is not a function', 'Function not implemented') +
							'\x1b[0m'
					);
					mod._raise(9);
				} else {
					pty.write('\x1b[1;93m' + msg + '\x1b[0m');
				}
			},
			dynamicLibraries: [wasm],
			locateFile(path, prefix) {
				if (path.endsWith('.wasm')) {
					return ModuleBinary;
				}
				return path;
			}
		};
		// the first kernel to use printf is really slow without this
		device.queue.writeBuffer(mod.wgpuPrintfBuffer, 0, new Uint32Array([0]));
		await (await Module).default(mod);
		aborter.throwIfAborted();
		function kill() {
			mod._raise(9);
		}
		aborter.addEventListener('abort', kill);
		await promise;
		aborter.removeEventListener('abort', kill);
		mod._stop_bg_threads();
		setImmediate(() => mod._stop_bg_threads());

		let timestampsQuantized = false;
		if (mod.wgpuTimestampReadBuffer && mod.wgpuKernelsRan.length) {
			try {
				await mod.wgpuTimestampReadBuffer.mapAsync(
					GPUMapMode.READ,
					0,
					mod.wgpuTimestampReadBuffer.size
				);
				const times = new BigUint64Array(
					mod.wgpuTimestampReadBuffer.getMappedRange(
						0,
						Math.min(mod.wgpuKernelsRan.length * 16, mod.wgpuTimestampReadBuffer.size)
					)
				);
				timestampsQuantized = true;
				for (let i = 0; i < times.length / 2; i++) {
					const duration = Number(times[i * 2 + 1] - times[i * 2]);
					mod.wgpuKernelsRan[i].duration = duration;
					if ((duration & 65535) !== 0) timestampsQuantized = false;
				}
				console.log(structuredClone(times), mod.wgpuKernelsRan);
				mod.wgpuTimestampReadBuffer.unmap();
			} catch (e) {
				console.error(e);
			}
		}
		return {
			kernels: mod.wgpuKernelsRan,
			allKernels: [...kernels.keys()].filter(
				(kernelName) => !kernelName.startsWith(ChipVarInitPrefix)
			),
			timestampsQuantized
		};
	} catch (e) {
		if (e) pty.write('\x1b[1;91m' + e + '\x1b[0m');
	} finally {
		console.log('dispose');
		device?.destroy();
		ptyController.dispose();
		pty = null;
	}
}
