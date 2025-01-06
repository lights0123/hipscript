import init, { Wasmer, Runtime, Directory, type SpawnOptions } from './wasmer';

import './wasm/twgsl';
import twgslModule from './wasm/twgsl.wasm?url';

const sysroot = '/sysroot';
const triple = 'wasm32-unknown-emscripten';

// -ftime-trace=main.cpp.json

const commonArgs = `-cc1 -fcolor-diagnostics -dumpdir a- -disable-free -clear-ast-before-backend -disable-llvm-verifier -fno-rounding-math -mconstructor-aliases -debugger-tuning=gdb -fdebug-compilation-dir=/home -fcoverage-compilation-dir=/home -resource-dir /lib/clang/19 -ferror-limit 19 -fhip-new-launch-api -fgnuc-version=4.2.1 -fdeprecated-macro -fskip-odr-check-in-gmf -I/hip/include/cuspv -D__HIP_PLATFORM_SPIRV__= -D__NVCC__ -D__CHIP_CUDA_COMPATIBILITY__ -Duint=uint32_t -Dulong=uint64_t -std=c++17`;

const deviceArgs = `${commonArgs} -main-file-name main.cpp -mrelocation-model static -mframe-pointer=all -aux-target-cpu generic -fcuda-is-device -fcuda-allow-variadic-functions -mllvm -vectorize-loops=false -mllvm -vectorize-slp=false -fvisibility=hidden -fapply-global-visibility-to-externs -mlink-builtin-bitcode /hip/lib/hip-device-lib/hipspv-spirv32.bc -isystem /hip/include -isysroot ${sysroot} -internal-isystem ${sysroot}/include/c++/v1 -internal-isystem ${sysroot}/include/c++/v1 -internal-isystem /lib/clang/19/include -internal-isystem ${sysroot}/include -internal-isystem /lib/clang/19/include -internal-isystem ${sysroot}/include -fno-autolink -fcxx-exceptions -fexceptions --offload-new-driver -mllvm -chipstar -triple spirv32 -aux-triple ${triple} -Wspir-compat`;

const hostArgs = `${commonArgs} -main-file-name main.cpp -target-feature +atomics -target-feature +bulk-memory -target-feature +mutable-globals -target-feature +sign-ext -D __EMSCRIPTEN_SHARED_MEMORY__=1 -D EMSCRIPTEN -pthread -mframe-pointer=none -ffp-contract=on -target-cpu generic -fvisibility=default -debug-info-kind=line-tables-only -isysroot ${sysroot} -internal-isystem ${sysroot}/include/c++/v1 -internal-isystem /lib/clang/19/include -internal-isystem ${sysroot}/include -mrelocation-model pic -pic-level 2 -I/hip/include -discard-value-names -triple ${triple}`;

const header = {
	'headers.hh':
		[
			'hip/spirv_fixups.h',
			'cuspv/cuda_runtime.h',
			'cassert',
			'vector',
			'stdexcept',
			'string',
			'iostream'
		]
			.map((s) => `#include <${s}>\n`)
			.join('') +
		`
        extern template class std::basic_string<char>;
        extern template class std::vector<int>;`
};

function findLowestMissingNumbers(arr: Iterable<number>, count: number) {
	// Convert to Set for O(1) lookup
	const numSet = new Set(arr);

	const missing = [];
	let current = 30;

	// Find 'count' missing numbers
	while (missing.length < count) {
		if (!numSet.has(current)) {
			missing.push(current);
		}
		current++;
	}

	return missing;
}

let runtime: Runtime;
let f: Wasmer;
async function compile(
	contents: string,
	registry: any,
	pch: any,
	stage: number,
	feedback: (command: string, stdout: string, err?: boolean) => void
) {
	await init();
	runtime = new Runtime({ registry });
	f = await Wasmer.fromRegistry('lights0123/llvm-spir', runtime);
	function run(name: string, args: SpawnOptions, bytes: false): Promise<string>;
	function run(name: string, args: SpawnOptions, bytes?: true): Promise<Uint8Array>;
	async function run(name: string, args: SpawnOptions, bytes = true) {
		const program = await f.commands[name].run(args);
		const output = await program.wait();
		feedback(`${name} ${args.args?.join(' ')}`, `${output.stderr}`, !output.ok);
		if (!output.ok) throw output.stderr;
		return bytes ? output.stdoutBytes : output.stdout;
	}
	if (stage === -1 || stage === -2) {
		const pch = await run('clang++', {
			args: `${stage === -1 ? deviceArgs : hostArgs} -emit-pch -o - -xhip headers.hh`.split(' '),
			mount: {
				'/home': {
					...header
				}
			},
			cwd: '/home'
		});
		return { pch };
	}
	if (stage === 0) {
		async function tw(data: any) {
			let stderr = '';
			const res = (
				await twgsl(twgslModule, {
					print(e) {
						stderr += e;
					},
					printErr(e) {
						stderr += e;
					}
				})
			).convertSpirV2WGSL(data);
			feedback('tint main.spv', stderr, !!stderr);
			if (stderr) {
				throw stderr;
			}
			return res;
		}
		const bc = await run('clang++', {
			args: `${deviceArgs} -include-pch headers.hh.pch -emit-llvm-bc -emit-llvm-uselists -o - -xhip main.cpp`.split(
				' '
			),
			mount: {
				'/home': { 'main.cpp': contents, 'headers.hh.pch': pch, ...header }
			},
			cwd: '/home'
		});
		const cl = await run('clspv', {
			stdin: bc,
			args: `-x ir -arch spir - -enable-printf -max-pushconstant-size 0 -inline-entry-points -uniform-workgroup-size -cl-std=CLC++ -o -`.split(
				' '
			)
		});
		const reflection = await run(
			'clspv-reflection',
			{
				args: `-d /home/file.spv`.split(' '),
				mount: {
					'/home': { 'file.spv': cl }
				}
			},
			false
		);
		// no kernels found
		if (!reflection) return { reflection, cl_proc: new Uint8Array(), shader: '' };

		// problem: Tint doesn't support pipeline constants as workgroup or
		// shared memory sizes, but these need to be dynamically specified with
		// the CUDA launch syntax! Instead, find four numbers not used in the code
		const replacement_nums = findLowestMissingNumbers(new Uint32Array(cl.buffer), 4);

		const cl_proc = await run('spirv-tools-opt', {
			args: [
				'-o',
				'-',
				'--strip-nonsemantic',
				'--set-spec-const-default-value',
				replacement_nums.map((n, i) => `${i}:${n}`).join(' '),
				'--freeze-spec-const'
			],
			stdin: cl
		});

		const wgsl = await tw(new Uint32Array(cl_proc.buffer));
		let shader = `override _cuda_wgx: u32;
override _cuda_wgy: u32;
override _cuda_wgz: u32;
override _cuda_shared: u32;
`;
		shader += wgsl
			.replaceAll(/enable chromium_disable_uniformity_analysis;|@stride\(\d+\)/g, '')
			.replaceAll(new RegExp(`\\b${replacement_nums[0]}[ui]?\\b`, 'g'), '_cuda_wgx')
			.replaceAll(new RegExp(`\\b${replacement_nums[1]}[ui]?\\b`, 'g'), '_cuda_wgy')
			.replaceAll(new RegExp(`\\b${replacement_nums[2]}[ui]?\\b`, 'g'), '_cuda_wgz')
			.replaceAll(new RegExp(`\\b${replacement_nums[3]}[ui]?\\b`, 'g'), '_cuda_shared');
		return { reflection, bc, cl, shader };
	} else if (stage === 1) {
		const wasm_obj = await run('clang++', {
			args: `${hostArgs} -include-pch headers.hh.pch -emit-obj -o - -x hip main.cpp`.split(' '),
			mount: {
				'/home': { 'main.cpp': contents, 'headers.hh.pch': pch, ...header }
			},
			cwd: '/home'
		});
		const dir = new Directory({ 'file.o': wasm_obj });
		const wasmMap = await run(
			'wasm-ld',
			{
				args: `-mllvm -combiner-global-alias-analysis=false -mllvm -enable-emscripten-sjlj -mllvm -disable-lsr --import-memory --shared-memory --export=__wasm_call_ctors --export=_emscripten_tls_init --export-if-defined=__start_em_asm --export-if-defined=__stop_em_asm --export-if-defined=__start_em_lib_deps --export-if-defined=__stop_em_lib_deps --export-if-defined=__start_em_js --export-if-defined=__stop_em_js --export-if-defined=main --export-if-defined=__main_argc_argv --export-if-defined=__wasm_apply_data_relocs --export-if-defined=fflush --experimental-pic --unresolved-symbols=import-dynamic --no-shlib-sigcheck -shared --no-export-dynamic --print-map --stack-first /home/file.o ${sysroot}/lib/wasm32-emscripten/pic/crtbegin.o -o /home/file.wasm`.split(
					' '
				),
				mount: {
					'/home': dir
				}
			},
			false
		);
		const wasm = await dir.readFile('file.wasm');
		dir.free();
		return { wasm, wasmMap };
	} else throw 'Invalid stage';
}

globalThis.onmessage = async (e) => {
	try {
		const data = await compile(
			e.data.contents,
			e.data.registry,
			e.data.pch,
			e.data.stage,
			(cmd, stdout, err) => {
				if (stdout && !stdout.endsWith('\n')) stdout += '\n';
				let prefix = (err ? '\x1b[1;91m' : '\x1b[1;92m') + '❯\x1b[0m';

				globalThis.postMessage({ type: 'feedback', data: `${prefix} ${cmd}\n${stdout}`, err });
			}
		);
		globalThis.postMessage({ type: 'res', data });
		f?.free();
		runtime?.free();
	} catch (err) {
		globalThis.postMessage({ type: 'err', err });
	} finally {
		close();
	}
};
