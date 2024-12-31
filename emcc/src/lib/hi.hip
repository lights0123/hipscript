
// Constant memory for lookup table
__constant__ float const_lookup[256];

// Generic kernel template that uses both fixed and dynamic shared memory
template<typename T, int BLOCK_SIZE>
__global__ void processingKernel(T* input, T* output, int n, int dynamic_smem_size) {
    // Fixed-size shared memory
    __shared__ T fixed_shared[BLOCK_SIZE];
    // Dynamic shared memory - size determined at runtime
    extern __shared__ T dynamic_shared[];
    
    int tid = threadIdx.x;
    int gid = blockIdx.x * blockDim.x + threadIdx.x;
    
    // Basic bounds checking with assert
    // assert(tid < BLOCK_SIZE);
    
    // Load data into fixed shared memory
    if (gid < n) {
        fixed_shared[tid] = input[gid];
    }
    __syncthreads();
    
    // Use constant memory lookup and store in dynamic shared memory
    if (tid < dynamic_smem_size) {
        dynamic_shared[tid] = const_lookup[tid % 256] * fixed_shared[tid];
        // Debug print
        printf("Thread %d: dynamic_shared[%d] = \n", tid, tid );//(float)dynamic_shared[tid]);
    }
    __syncthreads();
    
    // Process and write results
    if (gid < n) {
        // Simple processing combining both shared memory results
        output[gid] = (tid < dynamic_smem_size) ? 
            fixed_shared[tid] + dynamic_shared[tid % dynamic_smem_size] :
            fixed_shared[tid];
    }
}

// Helper kernel to demonstrate more features
__global__ void initializeKernel(float* data, int n) {
    int gid = blockIdx.x * blockDim.x + threadIdx.x;
    if (gid < n) {
        data[gid] = gid * 0.1f;
        printf("Initializing data[%d] = \n", gid);//, data[gid]);
    }
}

int main() {
    const int N = 1024;
    const int BLOCK_SIZE = 256;
    const int DYNAMIC_SMEM_SIZE = 128;
    
    // Host arrays
    float *h_input, *h_output;
    // Device arrays
    float *d_input, *d_output;
    
    // Allocate host memory
    h_input = new float[N];
    h_output = new float[N];
    
    // Allocate device memory
    cudaMalloc(&d_input, N * sizeof(float));
    cudaMalloc(&d_output, N * sizeof(float));
    
    // Initialize constant memory lookup table
    float h_lookup[256];
    for (int i = 0; i < 256; i++) {
        h_lookup[i] = sinf(i * 0.1f);
    }
    cudaMemcpyToSymbol(const_lookup, h_lookup, 256 * sizeof(float));
    
    // Launch initialization kernel
    int num_blocks = (N + BLOCK_SIZE - 1) / BLOCK_SIZE;
    initializeKernel<<<num_blocks, BLOCK_SIZE>>>(d_input, N);
    
    // Launch main processing kernel
    size_t dynamic_smem_bytes = DYNAMIC_SMEM_SIZE * sizeof(float);
    processingKernel<float, BLOCK_SIZE><<<num_blocks, BLOCK_SIZE, dynamic_smem_bytes>>>(
        d_input, d_output, N, DYNAMIC_SMEM_SIZE);
    
    // Check for errors
    cudaError_t err = cudaGetLastError();
    if (err != cudaSuccess) {
        printf("CUDA Error: %s\n", cudaGetErrorString(err));
        return -1;
    }
    
    // Copy results back to host
    cudaMemcpy(h_output, d_output, N * sizeof(float), cudaMemcpyDeviceToHost);
    
    // Verify results (simple check)
    printf("First few output values:\n");
    for (int i = 0; i < 5; i++) {
        printf("output[%d] = %f\n", i, h_output[i]);
    }
    
    // Cleanup
    delete[] h_input;
    delete[] h_output;
    cudaFree(d_input);
    cudaFree(d_output);
    
    return 0;
}
