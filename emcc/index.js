// @ts-check

/// <reference types="@webgpu/types" />
/// <reference path="./types.d.ts" />

const ChipVarPrefix = "_chip_var_";
const ChipVarInitPrefix = "_chip_var_init_";

import "./node_modules/xterm/lib/xterm.js";
import "./node_modules/xterm-pty/index.js";
import {
  init,
  Wasmer,
  Runtime,
  Directory,
} from "./node_modules/@wasmer/sdk/dist/index.mjs";
import Module from "./a.out.mjs";
import "./twgsl.js";
import './node_modules/monaco-editor/esm/vs/editor/editor.main.js'

// setRegistry({ registryUrl: 'https://google.com/'})
await init();
const q = await fetch("https://registry.wasmer.io/graphql", {
  method: "POST",
  headers: { accept: "application/json", "content-type": "application/json" },
  body: JSON.stringify({
    query: `{
    getPackage(name: "lights0123/llvm-spir") {
        packageName
        namespace
        versions {
          version
          isArchived
          v2: distribution(version: V2) {
            piritaDownloadUrl
            piritaSha256Hash
            webcManifest
          }
          v3: distribution(version: V3) {
            piritaDownloadUrl
            piritaSha256Hash
            webcManifest
          }
        }
    }
    info {
        defaultFrontend
    }
}`,
  }),
}).then((s) => s.json());
console.log(q);
q.data.getPackage.versions = [q.data.getPackage.versions[0]];
// initializeLogger("debug");

const cache = await caches.open("my-cache");
let b;
try {
  b = URL.createObjectURL(
    await cache
      .match(q.data.getPackage.versions[0].v3.piritaDownloadUrl)
      .then((f) => f.blob())
  );
} catch (_) {
  console.error(_);
}
if (!b) {
  const res = await fetch(q.data.getPackage.versions[0].v3.piritaDownloadUrl, {
    cache: "no-store",
  });
  await cache.put(q.data.getPackage.versions[0].v3.piritaDownloadUrl, res);
  b = URL.createObjectURL(
    await cache
      .match(q.data.getPackage.versions[0].v3.piritaDownloadUrl)
      .then((f) => f.blob())
  );
}
q.data.getPackage.versions[0].v3.piritaDownloadUrl = b;
const registry = `data:application/json;charset=utf-8,` + JSON.stringify(q);
// const registry = null;
const runtime = new Runtime({ registry });
const f = await Wasmer.fromRegistry("lights0123/llvm-spir", runtime);
URL.revokeObjectURL(q);
const contents = await fetch("/hi.hip").then((f) => f.text());
const sysroot = "/sysroot";
const triple = "wasm32-unknown-emscripten";
/**
 * @param {string} name
 * @param {import('@wasmer/sdk').SpawnOptions} args
 */
async function run(name, args, bytes = true) {
  const program = await f.commands[name].run(args);
  const output = await program.wait();
  if (!output.ok) throw output.stderr;
  if (output.stderr) console.warn(output.stderr);
  return bytes ? output.stdoutBytes : output.stdout;
}
const data = await run("clang++", {
  stdin: contents,
  args: `-cc1 -triple spirv32 -aux-triple ${triple} -Wspir-compat -emit-llvm-bc -emit-llvm-uselists -dumpdir a- -disable-free -clear-ast-before-backend -disable-llvm-verifier -main-file-name hi.hip -mrelocation-model static -mframe-pointer=all -fno-rounding-math -mconstructor-aliases -aux-target-cpu generic -fcuda-is-device -fcuda-allow-variadic-functions -mllvm -vectorize-loops=false -mllvm -vectorize-slp=false -fvisibility=hidden -fapply-global-visibility-to-externs -mlink-builtin-bitcode hip/lib/hip-device-lib/hipspv-spirv32.bc -debugger-tuning=gdb -fdebug-compilation-dir=/home -fcoverage-compilation-dir=/home -resource-dir /lib/clang/19 -isystem hip/include -D __HIP_PLATFORM_SPIRV__= -isysroot ${sysroot} -internal-isystem ${sysroot}/include/c++/v1 -internal-isystem ${sysroot}/include/c++/v1 -internal-isystem /lib/clang/19/include -internal-isystem ${sysroot}/include -internal-isystem /lib/clang/19/include -internal-isystem ${sysroot}/include -fdeprecated-macro -fno-autolink -ferror-limit 19 -fhip-new-launch-api -fgnuc-version=4.2.1 -fskip-odr-check-in-gmf -fcxx-exceptions -fexceptions --offload-new-driver -Duint=uint32_t -Dulong=uint64_t -fcuda-allow-variadic-functions -mllvm -chipstar -o - -x hip -`.split(
    " "
  ),
});
const cl = await run("clspv", {
  stdin: data,
  args: `-x ir -arch spir - -enable-printf -max-pushconstant-size 0 -inline-entry-points -uniform-workgroup-size -cl-std=CLC++ -o -`.split(
    " "
  ),
});
const reflection = await run(
  "clspv-reflection",
  {
    stdin: data,
    args: `/home/file.spv`.split(" "),
    mount: {
      "/home": { "file.spv": cl },
    },
  },
  false
);
const cl_proc = await run("spirv-tools-opt", {
  args: [
    "-o",
    "-",
    "--strip-nonsemantic",
    "--set-spec-const-default-value",
    "0:840 1:841 2:842 3:8453",
    "--freeze-spec-const",
  ],
  stdin: cl,
});
const wasm_obj = await run("clang++", {
  args: `-cc1 -triple ${triple} -emit-obj -dumpdir a- -disable-free -clear-ast-before-backend -disable-llvm-verifier -discard-value-names -main-file-name hi.cpp -target-feature +atomics -target-feature +bulk-memory -target-feature +mutable-globals -target-feature +sign-ext -D __EMSCRIPTEN_SHARED_MEMORY__=1 -D EMSCRIPTEN -pthread -mframe-pointer=none -ffp-contract=on -fno-rounding-math -mconstructor-aliases -target-cpu generic -fvisibility=default -debug-info-kind=line-tables-only -debugger-tuning=gdb -fdebug-compilation-dir=/home -fcoverage-compilation-dir=/home -resource-dir /lib/clang/19 -isysroot ${sysroot} -internal-isystem ${sysroot}/include/c++/v1 -internal-isystem /lib/clang/19/include -internal-isystem ${sysroot}/include -fhip-new-launch-api -fdeprecated-macro -ferror-limit 19 -fgnuc-version=4.2.1 -fskip-odr-check-in-gmf -mrelocation-model pic -pic-level 2 -D __HIP_PLATFORM_SPIRV__= -Ihip/include -Duint=uint32_t -Dulong=uint64_t -o - -x hip -`.split(
    " "
  ),
  stdin: contents,
});
const dir = new Directory({ "file.o": wasm_obj });
await run("wasm-ld", {
  args: `-mllvm -combiner-global-alias-analysis=false -mllvm -enable-emscripten-sjlj -mllvm -disable-lsr --import-memory --shared-memory --export=__wasm_call_ctors --export=_emscripten_tls_init --export-if-defined=__start_em_asm --export-if-defined=__stop_em_asm --export-if-defined=__start_em_lib_deps --export-if-defined=__stop_em_lib_deps --export-if-defined=__start_em_js --export-if-defined=__stop_em_js --export-if-defined=main --export-if-defined=__main_argc_argv --export-if-defined=__wasm_apply_data_relocs --export-if-defined=fflush --experimental-pic --unresolved-symbols=import-dynamic --no-shlib-sigcheck -shared --no-export-dynamic --print-map --stack-first /home/file.o ${sysroot}/lib/wasm32-emscripten/pic/crtbegin.o -o /home/file.wasm`.split(
    " "
  ),
  mount: {
    "/home": dir,
  },
});
const wasm = await dir.readFile("file.wasm");
dir.free();
window.wasm = wasm;
const tw = await twgsl();
window.Module = Module;
const supportedLimits = [
  "maxTextureDimension1D",
  "maxTextureDimension2D",
  "maxTextureDimension3D",
  "maxTextureArrayLayers",
  "maxBindGroups",
  "maxBindGroupsPlusVertexBuffers",
  "maxBindingsPerBindGroup",
  "maxDynamicUniformBuffersPerPipelineLayout",
  "maxDynamicStorageBuffersPerPipelineLayout",
  "maxSampledTexturesPerShaderStage",
  "maxSamplersPerShaderStage",
  "maxStorageBuffersPerShaderStage",
  "maxStorageTexturesPerShaderStage",
  "maxUniformBuffersPerShaderStage",
  "maxUniformBufferBindingSize",
  "maxStorageBufferBindingSize",
  "minUniformBufferOffsetAlignment",
  "minStorageBufferOffsetAlignment",
  "maxVertexBuffers",
  "maxBufferSize",
  "maxVertexAttributes",
  "maxVertexBufferArrayStride",
  "maxInterStageShaderComponents",
  "maxInterStageShaderVariables",
  "maxColorAttachments",
  "maxColorAttachmentBytesPerSample",
  "maxComputeWorkgroupStorageSize",
  "maxComputeInvocationsPerWorkgroup",
  "maxComputeWorkgroupSizeX",
  "maxComputeWorkgroupSizeY",
  "maxComputeWorkgroupSizeZ",
  "maxComputeWorkgroupsPerDimension",
];
const adapter = await navigator.gpu.requestAdapter();
window.wgpuAdapter = adapter;

function objLikeToObj(src) {
  const dst = {};
  for (const key in src) {
    if (supportedLimits.includes(key)) dst[key] = src[key];
  }
  return dst;
}

const device = await adapter?.requestDevice({
  requiredFeatures: adapter.features,
  requiredLimits: objLikeToObj(adapter.limits),
});
if (!device) throw "err";
window.wgpuDevice = device;
const wgsl = tw.convertSpirV2WGSL(new Uint32Array(cl_proc.buffer));
let shader = `override _cuda_wgx: u32;
override _cuda_wgy: u32;
override _cuda_wgz: u32;
override _cuda_shared: u32;
`;
shader += wgsl
  .replaceAll(
    /enable chromium_disable_uniformity_analysis;|@stride\(\d+\)/g,
    ""
  )
  .replaceAll(/840\w?/g, "_cuda_wgx")
  .replaceAll(/841\w?/g, "_cuda_wgy")
  .replaceAll(/842\w?/g, "_cuda_wgz")
  .replaceAll(/8453\w?/g, "_cuda_shared");
msg.innerText = shader;
const shaderModule = device.createShaderModule({
  code: shader, // The WGSL shader provided in the variable
});

const map = reflection;
/** @type Map<string, any> */
const kernels = new Map();
let printfString = "";
for (const line of map.split("\n")) {
  const [ty, name, ...parts] = line.split(",");
  const data = {};
  for (let i = 0; i < parts.length; i += 2) {
    data[parts[i]] = parts[i + 1];
  }
  if (ty === "kernel_decl")
    kernels.set(name, {
      args: [],
      dynamic_mem: false,
      printf: data["printf"] === "1",
    });
  else if (ty === "kernel") {
    const kernel = kernels.get(name);
    if (!kernel) continue;
    if (data["argKind"] === "local")
      kernel.dynamic_mem = +data["arrayElemSize"];
    if (!["buffer", "pod_ubo"].includes(data["argKind"])) continue;
    kernel.args.push(data);
  } else if (ty === "printf") {
    printfString += line + "\n";
  }
}
window.printfString = printfString;
const wgpuPrintfGroupLayout = device.createBindGroupLayout({
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "storage" },
    },
  ],
});
for (const [kernelName, kernel] of kernels) {
  /** @type GPUBindGroupLayoutEntry[] */
  const bindGroupLayoutDesc = [];
  /** @type number[] */
  const uniformBuffers = [];
  let hasGlobals = false;
  for (const { arg, argKind, binding, argSize, offset } of kernel.args) {
    if (
      !kernelName.startsWith(ChipVarInitPrefix) &&
      arg.startsWith(ChipVarPrefix)
    ) {
      hasGlobals = true;
      continue;
    }
    if (argKind === "pod_ubo") {
      const len = +argSize + +offset;
      if (+binding in uniformBuffers) {
        uniformBuffers[binding] = Math.max(uniformBuffers[binding], len);
      } else {
        uniformBuffers[binding] = len;
      }
    }

    if (bindGroupLayoutDesc.some((desc) => desc.binding === +binding)) continue;
    bindGroupLayoutDesc.push({
      binding: +binding,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: argKind === "buffer" ? "storage" : "uniform" },
    });
  }
  kernel.uniformBuffers = uniformBuffers;
  if (hasGlobals) {
    kernel.bindGroupLayoutDesc = bindGroupLayoutDesc;
  } else {
    kernel.bindGroupLayout = device.createBindGroupLayout({
      entries: bindGroupLayoutDesc,
    });
    kernel.pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [
        kernel.bindGroupLayout,
        // wgpuPrintfGroupLayout,
        ...(kernel.printf ? [wgpuPrintfGroupLayout] : []),
      ],
    });
  }
}

const wgpuPrintfBuffer = device.createBuffer({
  size: 1048576,
  usage:
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
});

var xterm = new Terminal();
xterm.open(document.getElementById("terminal"));

// Create master/slave objects
const { master, slave } = openpty();

// Connect the master object to xterm.js
xterm.loadAddon(master);

let mod = {
  pty: slave,
  preinitializedWebGPUDevice: device,
  wgpuShaderModule: shaderModule,
  wgpuKernelMap: kernels,
  wgpuGlobals: {},
  wgpuPrintfBuffer,
  wgpuPrintfStagingBuffer: device.createBuffer({
    size: 1048576,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  }),
  wgpuPrintfGroupLayout,
  wgpuPrintfBindGroup: device.createBindGroup({
    layout: wgpuPrintfGroupLayout,
    entries: [{ binding: 0, resource: { buffer: wgpuPrintfBuffer } }],
  }),
  wgpuAbortStagingBuffer: device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  }),
  preInit: () => {
    const FS = mod.FS;
    FS.writeFile("/printf.csv", printfString);
    mod.ENV["PRINTF_BUFFER_SIZE"] = wgpuPrintfBuffer.size;
  },
  /**
   * @param {number} code
   */
  onExit(code, ...args) {
    // xterm.reset();
    xterm.writeln(`\x1b[1;91mProcess exited with code ${code}`);
  },
  onAbort(...args) {
    console.log(args);
  },
  printErr(msg) {
    console.log("errmsg", msg);
  },
  dynamicLibraries: [
    URL.createObjectURL(new Blob([wasm], { type: "application/wasm" })),
  ],
  locateFile(path, prefix) {
    return path;
  },
};
await Module(mod);
window.Module = mod;
// const module = await Module();
// debugger;
// module['preinitializedWebGPUDevice'] = device;
