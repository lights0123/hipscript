#include "hip/hip_runtime_api.h"
#include "impl.hpp"
#include "printf.hpp"

#include <cstring>
#include <emscripten.h>
#include <emscripten/em_macros.h>
#include <emscripten/html5_webgpu.h>
#include <emscripten/proxying.h>
#include <emscripten/threading.h>
#include <fstream>
#include <unordered_map>
#include <webgpu/webgpu_cpp.h>

// Global WebGPU device and queue
static wgpu::Instance instance;
static wgpu::Adapter adapter;
static wgpu::Device device;
static wgpu::Queue queue;

static emscripten::ProxyingQueue w_queue;

static std::unordered_map<const void *, const char *> KernelNameMap;
static std::unordered_map<const void *, wgpu::Buffer> VariableBufferMap;

// Initialize WebGPU device and queue if not already done
static void initializeWebGPU() {
  if (device != nullptr)
    return;

  // Get WebGPU adapter
  device = wgpu::Device::Acquire(emscripten_webgpu_get_device());
}
hipError_t EMSCRIPTEN_KEEPALIVE hipMalloc(void **ptr, size_t size) {
  if (!ptr)
    RETURN(hipErrorInvalidValue);
  if (size == 0) {
    *ptr = nullptr;
    return hipSuccess;
  }

  // Create buffer

  wgpu::Buffer buffer;
  std::pair d{&buffer, emscripten::ProxyingQueue::ProxyingCtx{}};
  w_queue.proxySyncWithCtx(emscripten_main_runtime_thread_id(), [&](auto ctx) {
    d.second = ctx;
    wgpu::BufferDescriptor bufferDesc = {};
    bufferDesc.usage = wgpu::BufferUsage::Storage | wgpu::BufferUsage::CopyDst |
                       wgpu::BufferUsage::CopySrc;
    bufferDesc.size = size;
    bufferDesc.mappedAtCreation = false;
    device.PushErrorScope(wgpu::ErrorFilter::OutOfMemory);
    device.PushErrorScope(wgpu::ErrorFilter::Validation);
    buffer = device.CreateBuffer(&bufferDesc);

    device.PopErrorScope(
        [](WGPUErrorType type, char const *message, void *ctx) {
          auto &data = *reinterpret_cast<decltype(d) *>(ctx);
          if (message) {
            printf("\x1b[1;93m%s\x1b[0m\n", message);
          }
          if (type) {
            *data.first = nullptr;
          }

          device.PopErrorScope(
              [](WGPUErrorType type, char const *message, void *ctx) {
                auto &data = *reinterpret_cast<decltype(d) *>(ctx);
                if (message) {
                  printf("\x1b[1;93m%s\x1b[0m\n", message);
                }
                if (type) {
                  *data.first = nullptr;
                }

                data.second.finish();
              },
              ctx);
        },
        &d);
  });
  if (!buffer) {
    RETURN(hipErrorOutOfMemory);
  }

  *ptr = reinterpret_cast<void *>(buffer.MoveToCHandle());
  return hipSuccess;
}

static uintptr_t user_buffer_start = 0;

hipError_t EMSCRIPTEN_KEEPALIVE hipFree(void *ptr) {
  if (ptr == nullptr)
    return hipSuccess;
  if (reinterpret_cast<uintptr_t>(ptr) < user_buffer_start) {
    RETURN(hipErrorInvalidValue);
  }

  std::pair d{false, emscripten::ProxyingQueue::ProxyingCtx{}};
  w_queue.proxySyncWithCtx(emscripten_main_runtime_thread_id(), [&](auto ctx) {
    d.second = ctx;
    device.PushErrorScope(wgpu::ErrorFilter::Validation);
    wgpu::Buffer buffer =
        wgpu::Buffer::Acquire(reinterpret_cast<WGPUBufferImpl *>(ptr));
    buffer = nullptr;

    device.PopErrorScope(
        [](WGPUErrorType type, char const *message, void *ctx) {
          auto &data = *reinterpret_cast<decltype(d) *>(ctx);
          if (message) {
            printf("\x1b[1;93m%s\x1b[0m\n", message);
          }
          if (type) {
            data.first = true;
          }

          data.second.finish();
        },
        &d);
  });
  RETURN(d.first ? hipErrorInvalidValue : hipSuccess);
}

extern "C" {
extern void wasm_hipMemcpy(decltype(emscripten_proxy_finish) cb,
                           em_proxying_ctx *, hipError_t *, void *dst,
                           const void *src, size_t sizeBytes,
                           hipMemcpyKind kind);
}

hipError_t EMSCRIPTEN_KEEPALIVE hipMemcpy(void *dst, const void *src,
                                          size_t sizeBytes,
                                          hipMemcpyKind kind) {
  if (sizeBytes == 0)
    return hipSuccess;
  if (!dst || !src)
    RETURN(hipErrorInvalidValue);

  if (kind == hipMemcpyHostToHost) {
    memcpy(dst, src, sizeBytes);
    return hipSuccess;
  }
  hipError_t res = hipErrorUnknown;
  w_queue.proxySyncWithCtx(emscripten_main_runtime_thread_id(), [&](auto ctx) {
    wasm_hipMemcpy(emscripten_proxy_finish, ctx.ctx, &res, dst, src, sizeBytes,
                   kind);
  });
  RETURN(res);
}
hipError_t EMSCRIPTEN_KEEPALIVE hipGetSymbolAddress(void **DevPtr,
                                                    const void *Symbol) {
  auto it = VariableBufferMap.find(Symbol);
  if (it == VariableBufferMap.end())
    RETURN(hipErrorInvalidSymbol);

  *DevPtr = it->second.Get();
  return hipSuccess;
}
hipError_t EMSCRIPTEN_KEEPALIVE hipMemcpyToSymbol(const void *Symbol,
                                                  const void *Src,
                                                  size_t SizeBytes,
                                                  size_t Offset,
                                                  hipMemcpyKind Kind) {
  assert(Offset == 0); // FIXME: fix
  void *data;
  if (hipError_t err = hipGetSymbolAddress(&data, Symbol))
    RETURN(err);
  return hipMemcpy(data, Src, SizeBytes, Kind);
}

struct PrintfData {
  printf_descriptor_map_t map;
  char *buffer;
  size_t bufferSize;
  PrintfData() {
    std::ifstream i("printf.csv");
    std::string line;
    while (std::getline(i, line)) {
      std::stringstream lineStream(line);
      std::string cell;
      printf_descriptor desc;
      uint32_t id;
      for (int i = 0; std::getline(lineStream, cell, ','); i++) {
        if (i == 2)
          id = std::strtol(cell.c_str(), nullptr, 10);
        if (i == 4) {
          std::string newString;
          for (int i = 0; i < cell.length(); i += 2) {
            std::string byte = cell.substr(i, 2);
            char chr = (char)(int)strtol(byte.c_str(), nullptr, 16);
            newString.push_back(chr);
          }
          desc.format_string = newString;
        }
        if (i == 6) {
          std::stringstream ss(cell);
          std::string str;
          while (getline(ss, str, ';')) {
            desc.arg_sizes.push_back(std::strtol(str.c_str(), nullptr, 10));
          }
        }
      }
      map[id] = desc;
    }

    bufferSize = std::strtol(getenv("PRINTF_BUFFER_SIZE"), nullptr, 10);
    buffer = new char[bufferSize];
  }
} static printfData;

// __attribute__((constructor)) static void initializePrintf() {

// }

// hipError_t hipSetupArgument(const void *Arg, size_t Size, size_t Offset) {
//   __builtin_trap();
// }

// hipError_t hipLaunchByPtr(const void *HostFunction) { __builtin_trap(); }
// hipError_t hipConfigureCall(dim3 GridDim, dim3 BlockDim, size_t SharedMem,
//                             hipStream_t Stream) {

//   __builtin_trap();
// }

struct CallConfig {
  dim3 GridDim;
  dim3 BlockDim;
  size_t SharedMem;
  hipStream_t Stream;
  CallConfig(dim3 TheGridDim, dim3 TheBlockDim, size_t TheSharedMem,
             hipStream_t TheStream)
      : GridDim(TheGridDim), BlockDim(TheBlockDim), SharedMem(TheSharedMem),
        Stream(TheStream) {}
};

static thread_local std::stack<CallConfig> CallConfigStack;

hipError_t EMSCRIPTEN_KEEPALIVE __hipPushCallConfiguration(
    dim3 GridDim, dim3 BlockDim, size_t SharedMem, hipStream_t Stream) try {
  // logDebug("__hipPushCallConfiguration()");

  CallConfigStack.emplace(GridDim, BlockDim, SharedMem, Stream);

  return hipSuccess;
} catch (...) {
  // logError("Unexpected error in hipPushCallConfiguration()");
  RETURN(hipErrorUnknown);
}

hipError_t EMSCRIPTEN_KEEPALIVE __hipPopCallConfiguration(
    dim3 *GridDim, dim3 *BlockDim, size_t *SharedMem, hipStream_t *Stream) try {

  // logDebug("__hipPopCallConfiguration()");

  // __hipPopCallConfiguration() is called almost immediately after
  // __hipPushCallConfiguration() so this should never be empty.
  assert(CallConfigStack.size());

  *GridDim = CallConfigStack.top().GridDim;
  *BlockDim = CallConfigStack.top().BlockDim;
  *SharedMem = CallConfigStack.top().SharedMem;
  *Stream = CallConfigStack.top().Stream;
  CallConfigStack.pop();

  return hipSuccess;
} catch (...) {
  // logError("Unexpected error in hipPopCallConfiguration()");
  RETURN(hipErrorUnknown);
}

extern "C" {
extern void wasm_hipLaunchKernel(decltype(emscripten_proxy_finish) cb,
                                 em_proxying_ctx *, hipError_t *,
                                 const char *kernel, uint32_t gx, uint32_t gy,
                                 uint32_t gz, uint32_t bx, uint32_t by,
                                 uint32_t bz, void **Args, size_t SharedMem,
                                 char *printfBuffer);
}

hipError_t EMSCRIPTEN_KEEPALIVE hipLaunchKernel(const void *HostFunction,
                                                dim3 GridDim, dim3 BlockDim,
                                                void **Args, size_t SharedMem,
                                                hipStream_t Stream) {
  auto kernel = KernelNameMap[HostFunction];

  hipError_t res = hipErrorUnknown;

  w_queue.proxySyncWithCtx(emscripten_main_runtime_thread_id(), [&](auto ctx) {
    wasm_hipLaunchKernel(emscripten_proxy_finish, ctx.ctx, &res, kernel,
                         GridDim.x, GridDim.y, GridDim.z, BlockDim.x,
                         BlockDim.y, BlockDim.z, Args, SharedMem,
                         printfData.buffer);
  });

  auto printfSize = *(reinterpret_cast<const uint32_t *>(printfData.buffer));
  if (*(reinterpret_cast<const uint32_t *>(printfData.buffer))) {
    cvk_printf(printfData.buffer, printfData.bufferSize, printfData.map);
  }

  if (res == hipErrorAssert) {
    exit(1);
  }

  RETURN(res);
}
extern "C" void **EMSCRIPTEN_KEEPALIVE
__hipRegisterFatBinary(const void *Data) {
  return nullptr;
}
extern "C" unsigned int EMSCRIPTEN_KEEPALIVE __hipRegisterFunction(
    void **Data, const void *HostFunction, char *DeviceFunction,
    const char *FuncDeviceName, unsigned int ThreadLimit, void *Tid, void *Bid,
    dim3 *BlockDim, dim3 *GridDim, int *WSize) {
  KernelNameMap[HostFunction] = FuncDeviceName;
  return 0;
}

extern "C" {
extern void wasm_hipRegisterVar(void *buffer, const char *namePtr, int size,
                                int constant);
}
extern "C" void EMSCRIPTEN_KEEPALIVE __hipRegisterVar(
    void **Data,
    void *Var,        // The shadow variable in host code
    char *HostName,   // Variable name in host code
    char *DeviceName, // Variable name in device code
    int Ext,          // Whether this variable is external
    int Size,         // Size of the variable
    int Constant,     // Whether this variable is constant
    int Global        // Unknown, always 0
) {
  initializeWebGPU();
  wgpu::BufferDescriptor bufferDesc = {};
  bufferDesc.usage = wgpu::BufferUsage::CopyDst | wgpu::BufferUsage::CopySrc;
  bufferDesc.usage |= // Constant ? wgpu::BufferUsage::Uniform :
      wgpu::BufferUsage::Storage;
  bufferDesc.size = Size;
  bufferDesc.label = DeviceName;
  wgpu::Buffer buffer = device.CreateBuffer(&bufferDesc);
  VariableBufferMap[Var] = buffer;
  user_buffer_start = reinterpret_cast<uintptr_t>(buffer.Get());
  wasm_hipRegisterVar(buffer.Get(), DeviceName, Size, Constant);
}

extern "C" void EMSCRIPTEN_KEEPALIVE __hipUnregisterFatBinary(void *Data) {}

extern "C" char EMSCRIPTEN_KEEPALIVE *__hip_fatbin_ = nullptr;
