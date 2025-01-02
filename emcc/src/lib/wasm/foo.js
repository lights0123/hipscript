// @ts-check

/// <reference types="@webgpu/types" />
/// <reference path="./types.d.ts" />

/**
 * @param {GPUErrorFilter[]} errs
 * @param {any} f
 */
function asyncify(errs, f) {
	return `(cb, data, res_p, ...args) => {
    ${errs.map((err) => `window.wgpuDevice.pushErrorScope(${JSON.stringify(err)});`).join('\n')}
	let reportErr = err;
    (${f})(...args)
    ${errs
			.map(
				() =>
					`.finally(()=>window.wgpuDevice.popErrorScope().then(err => err && Promise.reject(err)))`
			)
			.join('\n')}
      .then((res)=>{setValue(res_p, res, 'i32'); {{{ makeDynCall('vp', 'cb') }}}(data)},
      (e)=>{setValue(res_p, 1, 'i32'); reportErr(e.message || e.toString()); {{{ makeDynCall('vp', 'cb') }}}(data)});

  }
    `;
}

addToLibrary({
	wasm_hipLaunchKernel: asyncify(
		['validation'],
		async (
			/** @type {number} */ kernelPtr,
			/** @type {number} */ gx,
			/** @type {number} */ gy,
			/** @type {number} */ gz,
			/** @type {number} */ bx,
			/** @type {number} */ by,
			/** @type {number} */ bz,
			/** @type {number} */ Args,
			/** @type {number} */ SharedMem,
			/** @type {number} */ printfBuffer
		) => {
			const device = window.wgpuDevice;
			const kernelName = UTF8ToString(kernelPtr);
			const kernel = Module.wgpuKernelMap.get(kernelName);
			if (!kernel) return 98; // hipErrorInvalidDeviceFunction
			if (!kernel.bindGroupLayout) {
				for (const { arg, binding } of kernel.args) {
					if (arg.startsWith('_chip_var_')) {
						kernel.bindGroupLayoutDesc.push({
							binding: +binding,
							visibility: GPUShaderStage.COMPUTE,
							buffer: {
								type: 'storage' // Module.wgpuGlobals[arg].constant ? "uniform" : "storage",
							}
						});
					}
				}

				kernel.bindGroupLayout = device.createBindGroupLayout({
					entries: kernel.bindGroupLayoutDesc
				});
				kernel.pipelineLayout = device.createPipelineLayout({
					bindGroupLayouts: [
						kernel.bindGroupLayout,
						// Module.wgpuPrintfGroupLayout
						...(kernel.printf ? [Module.wgpuPrintfGroupLayout] : [])
					]
				});
			}
			/** @type GPUBindGroupEntry[] */
			const bindGroups = [];
			/** @type GPUBuffer[] */
			const uniforms = kernel.uniformBuffers.map((size) =>
				device.createBuffer({
					size,
					usage: GPUBufferUsage.UNIFORM, // | GPUBufferUsage.COPY_DST,
					mappedAtCreation: true
				})
			);
			uniforms.forEach((buffer, i) => {
				bindGroups.push({ binding: i, resource: { buffer } });
			});
			const uniformRanges = uniforms.map((uniform) => new Uint8Array(uniform.getMappedRange()));
			/** @type false | GPUBuffer */
			let abortBuffer = false;
			for (const { arg, argOrdinal, argKind, binding, argSize, offset } of kernel.args) {
				if (arg.startsWith('_chip_var_')) {
					const buffer = Module.wgpuGlobals[arg].buffer;
					if (arg === '_chip_var___chipspv_abort_called') abortBuffer = buffer;
					bindGroups.push({
						binding: +binding,
						resource: { buffer }
					});
					continue;
				}
				const argLoc = HEAPU32[Args / 4 + +argOrdinal];
				if (argKind === 'buffer') {
					const buffer = WebGPU.mgrBuffer.get(HEAPU32[argLoc / 4]);
					bindGroups.push({ binding: +binding, resource: { buffer } });
				} else {
					uniformRanges[+binding].set(HEAPU8.subarray(argLoc, argLoc + +argSize), +offset);
				}
			}
			uniforms.forEach((uniform) => uniform.unmap());

			// Create compute pipeline
			const computePipeline = device.createComputePipeline({
				layout: kernel.pipelineLayout,
				compute: {
					module: Module.wgpuShaderModule,
					entryPoint: kernelName,

					constants: {
						_cuda_wgx: bx,
						_cuda_wgy: by,
						_cuda_wgz: bz,
						...(kernel.dynamic_mem && {
							_cuda_shared: Math.max((SharedMem / kernel.dynamic_mem) | 0, 1)
						})
					}
				}
			});

			// Create bind group
			const bindGroup = device.createBindGroup({
				layout: kernel.bindGroupLayout,
				entries: bindGroups
			});

			// Create command encoder
			const commandEncoder = device.createCommandEncoder();
			const timestamp = !!Module.wgpuTimestampQuery;
			const passEncoder = commandEncoder.beginComputePass(
				timestamp
					? {
							timestampWrites: {
								querySet: Module.wgpuTimestampQuery,
								beginningOfPassWriteIndex: 0,
								endOfPassWriteIndex: 1
							}
						}
					: {}
			);
			passEncoder.setPipeline(computePipeline);
			passEncoder.setBindGroup(0, bindGroup);
			passEncoder.setBindGroup(Module.wgpuAnyKernelHasBindings ? 1 : 0, Module.wgpuPrintfBindGroup);
			passEncoder.dispatchWorkgroups(gx, gy, gz);
			passEncoder.end();

			if (timestamp && Module.wgpuKernelsRan.length * 16 < Module.wgpuTimestampReadBuffer.size) {
				commandEncoder.resolveQuerySet(
					Module.wgpuTimestampQuery,
					0,
					2,
					Module.wgpuTimestampBuffer,
					0
				);
				commandEncoder.copyBufferToBuffer(
					Module.wgpuTimestampBuffer,
					0,
					Module.wgpuTimestampReadBuffer,
					Module.wgpuKernelsRan.length * 16,
					16
				);
			}

			const kernelRan = { name: kernelName, bx, by, bz, gx, gy, gz };
			Module.wgpuKernelsRan.push(kernelRan);
			reportErr = (err) => {
				kernelRan.status = err;
			};

			if (kernel.printf) {
				commandEncoder.copyBufferToBuffer(
					Module.wgpuPrintfBuffer,
					0,
					Module.wgpuPrintfStagingBuffer,
					0,
					Module.wgpuPrintfBuffer.size
				);
				// just clear the initial offset to clear the buffer
				commandEncoder.clearBuffer(Module.wgpuPrintfBuffer, 0, 4);
			}
			if (abortBuffer) {
				commandEncoder.copyBufferToBuffer(abortBuffer, 0, Module.wgpuAbortStagingBuffer, 0, 4);
				commandEncoder.clearBuffer(abortBuffer);
			}

			device.queue.submit([commandEncoder.finish()]);

			let abortBufferPromise;
			if (abortBuffer) {
				abortBufferPromise = Module.wgpuAbortStagingBuffer.mapAsync(GPUMapMode.READ);
			}
			if (kernel.printf) {
				await Module.wgpuPrintfStagingBuffer.mapAsync(GPUMapMode.READ);
				const printf = new Uint8Array(Module.wgpuPrintfStagingBuffer.getMappedRange());
				// only copy as much data as was actually used
				const words = new Uint32Array(printf.buffer)[0] + 1;
				HEAPU8.set(printf.subarray(0, words * 4), printfBuffer);
				Module.wgpuPrintfStagingBuffer.unmap();
			} else {
				HEAPU32[printfBuffer / 4] = 0;
			}
			if (abortBuffer) {
				await abortBufferPromise;
				const aborted = new Uint32Array(Module.wgpuAbortStagingBuffer.getMappedRange())[0];
				Module.wgpuAbortStagingBuffer.unmap();
				if (aborted) {
					kernelRan.status = 'aborted';
					return 710; // hipErrorAssert
				}
			}
		}
	),
	wasm_hipRegisterVar(
		/** @type {number} */ bufferPtr,
		/** @type {number} */ namePtr,
		/** @type {number} */ size,
		/** @type {number} */ constant
	) {
		const device = window.wgpuDevice;
		const buffer = WebGPU.mgrBuffer.get(bufferPtr);
		const name = UTF8ToString(namePtr);

		const initKernelName = '_chip_var_init_' + name;
		const initKernel = Module.wgpuKernelMap.get(initKernelName);

		Module.wgpuGlobals['_chip_var_' + name] = {
			constant: !!constant,
			buffer
		};

		// no init kernel? no init needed
		if (!initKernel) return;

		const tmpBuffer = //constant ?
			// window.wgpuDevice.createBuffer({
			//   size,
			//   usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
			// }) :
			buffer;

		const computePipeline = device.createComputePipeline({
			layout: initKernel.pipelineLayout,
			compute: {
				module: Module.wgpuShaderModule,
				entryPoint: initKernelName,
				constants: {
					_cuda_wgx: 1,
					_cuda_wgy: 1,
					_cuda_wgz: 1
				}
			}
		});

		// Create bind group
		const bindGroup = device.createBindGroup({
			layout: initKernel.bindGroupLayout,
			entries: [{ binding: 0, resource: { buffer: tmpBuffer } }]
		});

		// Create command encoder
		const commandEncoder = device.createCommandEncoder();
		const passEncoder = commandEncoder.beginComputePass();
		passEncoder.setPipeline(computePipeline);
		passEncoder.setBindGroup(0, bindGroup);
		passEncoder.dispatchWorkgroups(1, 1, 1);
		passEncoder.end();
		// if (constant) {
		//   commandEncoder.copyBufferToBuffer(tmpBuffer, 0, buffer, 0, size);
		// }

		device.queue.submit([commandEncoder.finish()]);
	},
	wasm_hipMemcpy: asyncify(
		['validation'],
		async (
			/** @type {number} */ dstId,
			/** @type {number} */ srcId,
			/** @type {number} */ sizeBytes,
			/** @type {number} */ kind
		) => {
			switch (kind) {
				case 1: {
					// hipMemcpyHostToDevice
					const dst = WebGPU.mgrBuffer.get(dstId);
					window.wgpuDevice.queue.writeBuffer(dst, 0, HEAPU8, srcId, sizeBytes);
					return 0;
				}
				case 2: {
					// hipMemcpyDeviceToHost

					const src = WebGPU.mgrBuffer.get(srcId);
					const stagingBuffer = window.wgpuDevice.createBuffer({
						size: sizeBytes,
						usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
						mappedAtCreation: false
					});

					// Create and submit copy command
					const commandEncoder = window.wgpuDevice.createCommandEncoder();
					commandEncoder.copyBufferToBuffer(src, 0, stagingBuffer, 0, sizeBytes);
					const commandBuffer = commandEncoder.finish();

					// Submit, map and copy back
					window.wgpuDevice.queue.submit([commandBuffer]);
					await stagingBuffer.mapAsync(GPUMapMode.READ);

					const copyArray = new Uint8Array(stagingBuffer.getMappedRange());
					HEAPU8.set(copyArray, dstId);
					stagingBuffer.unmap();
					stagingBuffer.destroy();
					return 0;
				}
				case 3: // hipMemcpyDeviceToDevice
					const src = WebGPU.mgrBuffer.get(srcId);
					const dst = WebGPU.mgrBuffer.get(dstId);
					const commandEncoder = window.wgpuDevice.createCommandEncoder();
					commandEncoder.copyBufferToBuffer(src, 0, dst, 0, sizeBytes);
					const commandBuffer = commandEncoder.finish();

					window.wgpuDevice.queue.submit([commandBuffer]);
					return 0;

				default:
					return 1;
			}
		}
	)
});
