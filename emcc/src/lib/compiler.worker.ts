import init, { Wasmer, Runtime, Directory, type SpawnOptions } from './wasmer';

import './wasm/twgsl';
import twgslModule from './wasm/twgsl.wasm?url';

const sysroot = '/sysroot';
const triple = 'wasm32-unknown-emscripten';

// -ftime-trace=main.cpp.json

const commonArgs = `-cc1 -fcolor-diagnostics -dumpdir a- -disable-free -clear-ast-before-backend -disable-llvm-verifier -fno-rounding-math -mconstructor-aliases -debugger-tuning=gdb -fdebug-compilation-dir=/home -fcoverage-compilation-dir=/home -resource-dir /lib/clang/19 -ferror-limit 19 -fhip-new-launch-api -fgnuc-version=4.2.1 -fdeprecated-macro -fskip-odr-check-in-gmf -D__HIP_PLATFORM_SPIRV__= -Duint=uint32_t -Dulong=uint64_t`;

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

async function compile(
	contents: string,
	registry: any,
	pch: any,
	stage: number,
	feedback: (command: string, stdout: string, err?: boolean) => void
) {
	await init();
	const runtime = new Runtime({ registry });
	const f = await Wasmer.fromRegistry('lights0123/llvm-spir', runtime);
	async function run(name: string, args: SpawnOptions, bytes = true) {
		const program = await f.commands[name].run(args);
		const output = await program.wait();
		feedback(`${name} ${args.args?.join(' ')}`, `${output.stderr}`, !output.ok);
		if (!output.ok) throw output.stderr;
		return bytes ? output.stdoutBytes : output.stdout;
	}
	if (stage === -1 || stage === -2) {
		console.log(`compile headers ${stage}`);
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
		const data = await run('clang++', {
			args: `${deviceArgs} -include-pch headers.hh.pch -emit-llvm-bc -emit-llvm-uselists -o - -xhip main.cpp`.split(
				' '
			),
			mount: {
				'/home': { 'main.cpp': contents, 'headers.hh.pch': pch, ...header }
			},
			cwd: '/home'
		});
		const cl = await run('clspv', {
			stdin: data,
			args: `-x ir -arch spir - -enable-printf -max-pushconstant-size 0 -inline-entry-points -uniform-workgroup-size -cl-std=CLC++ -o -`.split(
				' '
			)
		});
		const reflection = await run(
			'clspv-reflection',
			{
				stdin: data,
				args: `/home/file.spv`.split(' '),
				mount: {
					'/home': { 'file.spv': cl }
				}
			},
			false
		);
		const cl_proc = await run('spirv-tools-opt', {
			args: [
				'-o',
				'-',
				'--strip-nonsemantic',
				'--set-spec-const-default-value',
				'0:840 1:841 2:842 3:8453',
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
			.replaceAll(/840\w?/g, '_cuda_wgx')
			.replaceAll(/841\w?/g, '_cuda_wgy')
			.replaceAll(/842\w?/g, '_cuda_wgz')
			.replaceAll(/8453\w?/g, '_cuda_shared');
		return { reflection, cl_proc, shader };
	} else if (stage === 1) {
		const wasm_obj = await run('clang++', {
			args: `${hostArgs} -include-pch headers.hh.pch -emit-obj -o - -x hip main.cpp`.split(' '),
			mount: {
				'/home': { 'main.cpp': contents, 'headers.hh.pch': pch, ...header }
			},
			cwd: '/home'
		});
		const dir = new Directory({ 'file.o': wasm_obj });
		const wasmMap = await run('wasm-ld', {
			args: `-mllvm -combiner-global-alias-analysis=false -mllvm -enable-emscripten-sjlj -mllvm -disable-lsr --import-memory --shared-memory --export=__wasm_call_ctors --export=_emscripten_tls_init --export-if-defined=__start_em_asm --export-if-defined=__stop_em_asm --export-if-defined=__start_em_lib_deps --export-if-defined=__stop_em_lib_deps --export-if-defined=__start_em_js --export-if-defined=__stop_em_js --export-if-defined=main --export-if-defined=__main_argc_argv --export-if-defined=__wasm_apply_data_relocs --export-if-defined=fflush --experimental-pic --unresolved-symbols=import-dynamic --no-shlib-sigcheck -shared --no-export-dynamic --print-map --stack-first /home/file.o ${sysroot}/lib/wasm32-emscripten/pic/crtbegin.o -o /home/file.wasm`.split(
				' '
			),
			mount: {
				'/home': dir
			}
		}, false);
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
	} catch (err) {
		globalThis.postMessage({ type: 'err', err });
	} finally {
		close();
	}
};
