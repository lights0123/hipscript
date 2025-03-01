#include <cstdio>
#include <vector>

#define CHECK_ERR(f)                                                                     \
    if (cudaError_t e = (f)) {                                                           \
        printf("CUDA failure %s:%d: '%s'\n", __FILE__, __LINE__, cudaGetErrorString(e)); \
        exit(1);                                                                         \
    }

// Constant memory: Special read-only memory visible to all threads
// Great for lookup tables and constants used by all threads

// (currently, HipScript emulates constant memory as a standard read-write
// global variable with no special performance advantages.)
__constant__ float deviceConstants[256];

// This is a CUDA kernel - code that runs on the GPU
// __global__ means it's called from CPU and runs on GPU
// Each thread runs this code independently

// Kernels can be generic: the compiler will find every usage by the host-side
// code and generate a corresponding kernel
template <typename T>
__global__ void simpleKernel(T *input, T *output, int n) {
    // Thread indexing with a 1D block and 1D grid:
    // threadIdx.x - position within a block (like a local ID)
    // blockIdx.x - which block this thread is in
    // blockDim.x - size of each block
    // This calculation gives each thread a unique global ID
    int idx = blockIdx.x * blockDim.x + threadIdx.x;

    // Shared memory: Fast memory shared between threads in the same block is
    // declared with __shared__. In this example, every input element is read
    // twice by different threads within a block, so memory bandwidth is reduced
    // by moving it on-chip first
    __shared__ T sharedData[256];

    // Load data into shared memory
    // Each thread loads one element
    if (idx < n) sharedData[threadIdx.x] = input[idx];

    // Synchronize threads in this block
    // All threads must reach this point before any can continue
    __syncthreads();

    // Early exit if this thread is beyond our data size.
    // Needed since each block has a fixed size. For example, with a block size
    // of 256 and a input size of 513, 3 blocks must be launched with the last
    // one only processing one element.
    if (idx >= n) return;

    // Do some computation using shared memory and constant memory
    auto result = sharedData[blockDim.x - threadIdx.x - 1] +
                  sharedData[threadIdx.x] * deviceConstants[threadIdx.x % 256];

    // Debug print (format string and values are written to a special buffer by
    // the GPU, then formatted by the CPU afterwards)
    printf("Thread %d computed %f\n", idx, result);

    // Write result to global memory
    output[idx] = result;
}

int main() {
    const int N = 1000;
    const int threadsPerBlock = 256;
    const size_t size = N * sizeof(float);
    // Calculate number of blocks needed
    // (N + threadsPerBlock - 1) / threadsPerBlock is ceiling division
    const int numBlocks = (N + threadsPerBlock - 1) / threadsPerBlock;

    // Host (CPU) arrays
    std::vector<float> hostInput(N);
    std::vector<float> hostOutput(N);
    float hostConstants[256];

    // Device (GPU) arrays
    float *deviceInput, *deviceOutput;

    // Initialize host data
    for (int i = 0; i < N; i++) {
        hostInput[i] = i;
    }
    for (int i = 0; i < 256; i++) {
        hostConstants[i] = 1.0f / (i + 1);
    }

    // Allocate GPU memory
    CHECK_ERR(cudaMalloc(&deviceInput, size));
    CHECK_ERR(cudaMalloc(&deviceOutput, size));

    // Copy data to GPU
    CHECK_ERR(cudaMemcpy(deviceInput, hostInput.data(), size, cudaMemcpyHostToDevice));
    // ToSymbol required for global variables
    CHECK_ERR(cudaMemcpyToSymbol(deviceConstants, hostConstants, 256 * sizeof(float)));

    // Launch kernel
    // <<<numBlocks, threadsPerBlock>>> is CUDA launch syntax
    // numBlocks = number of thread blocks
    // threadsPerBlock = threads per block
    simpleKernel<<<numBlocks, threadsPerBlock>>>(deviceInput, deviceOutput, N);

    // Copy results back to CPU
    CHECK_ERR(cudaMemcpy(hostOutput.data(), deviceOutput, size, cudaMemcpyDeviceToHost));

    // Print first few results
    for (int i = 0; i < 5; i++) {
        printf("hostOutput[%d] = %f\n", i, hostOutput[i]);
    }

    // Cleanup
    CHECK_ERR(cudaFree(deviceInput));
    CHECK_ERR(cudaFree(deviceOutput));
}
