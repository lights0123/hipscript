#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#include "hip/spirv_hip.hh"

#define CHECK_ERR(f)                                                                     \
    if (cudaError_t e = (f)) {                                                           \
        printf("CUDA failure %s:%d: '%s'\n", __FILE__, __LINE__, cudaGetErrorString(e)); \
        exit(1);                                                                         \
    }

#define BLOCK_WIDTH 32
#define BLOCK_HEIGHT 8
// the grid size will be these divided by the block size
#define WORLD_WIDTH 512
#define WORLD_HEIGHT 32 * 11

// Must be multiple of 32 for bit-packing
static_assert(WORLD_WIDTH % 32 == 0);
static_assert(WORLD_HEIGHT % 32 == 0);

// For storing expanded state in shared memory (including halo cells)
#define SHARED_WIDTH (BLOCK_WIDTH + 2)
#define SHARED_HEIGHT (BLOCK_HEIGHT + 2)

__global__ void gameOfLife(uint32_t* d_grid, uint32_t* d_newGrid, int width, int height) {
    __shared__ uint32_t sharedMem[SHARED_HEIGHT][SHARED_WIDTH];

    // Calculate global indices
    int globalX = blockIdx.x * BLOCK_WIDTH + threadIdx.x;
    int globalY = blockIdx.y * BLOCK_HEIGHT + threadIdx.y;

    // Calculate packed indices
    int packedWidth = width / 32;  // Number of uint32_t per row
    int packedX = globalX / 32;    // Which uint32_t in the row
    int bitOffset = globalX % 32;  // Which bit in the uint32_t

    // Local indices for shared memory
    int localX = threadIdx.x + 1;
    int localY = threadIdx.y + 1;

    // Load and unpack cells into shared memory
    // Load center cells
    uint32_t packedCell = 0;
    if (globalY < height && packedX < packedWidth) {
        packedCell = d_grid[globalY * packedWidth + packedX];
    }

    // Each thread unpacks its bit and stores it in shared memory
    sharedMem[localY][localX] = (packedCell >> bitOffset) & 1;

    // Handle halo cells
    if (threadIdx.x == 0 && blockIdx.x > 0) {
        // Left edge - need last bit from previous packed word
        int prevPackedX = (globalX - 1) / 32;
        int prevBitOffset = 31;  // Last bit of previous word
        uint32_t prevWord = d_grid[globalY * packedWidth + prevPackedX];
        sharedMem[localY][0] = (prevWord >> prevBitOffset) & 1;
    }

    if (threadIdx.x == BLOCK_WIDTH - 1 && blockIdx.x < gridDim.x - 1) {
        // Right edge - need first bit from next packed word
        int nextPackedX = (globalX + 1) / 32;
        int nextBitOffset = 0;  // First bit of next word
        uint32_t nextWord = d_grid[globalY * packedWidth + nextPackedX];
        sharedMem[localY][localX + 1] = (nextWord >> nextBitOffset) & 1;
    }

    // Handle vertical edges (top/bottom)
    if (threadIdx.y == 0 && globalY > 0) {
        uint32_t topWord = d_grid[(globalY - 1) * packedWidth + packedX];
        sharedMem[0][localX] = (topWord >> bitOffset) & 1;
    }

    if (threadIdx.y == BLOCK_HEIGHT - 1 && globalY < height - 1) {
        uint32_t bottomWord = d_grid[(globalY + 1) * packedWidth + packedX];
        sharedMem[localY + 1][localX] = (bottomWord >> bitOffset) & 1;
    }

    // Handle corners
    if (threadIdx.x == 0 && threadIdx.y == 0 && blockIdx.x > 0 && globalY > 0) {
        int prevPackedX = (globalX - 1) / 32;
        uint32_t cornerWord = d_grid[(globalY - 1) * packedWidth + prevPackedX];
        sharedMem[0][0] = (cornerWord >> 31) & 1;
    }

    __syncthreads();

    // Calculate next generation using shared memory
    int neighbors = 0;

    // Count neighbors
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) continue;
            neighbors += sharedMem[localY + dy][localX + dx];
        }
    }

    // Apply Game of Life rules
    bool currentCell = sharedMem[localY][localX];
    bool newCell = currentCell;

    if (currentCell && (neighbors < 2 || neighbors > 3)) {
        newCell = false;
    } else if (!currentCell && neighbors == 3) {
        newCell = true;
    }

    __syncthreads();

    sharedMem[localY][localX] = newCell;

    __syncthreads();

    int tid = threadIdx.y * blockDim.x + threadIdx.x;
    int cellsWritten = blockDim.x * blockDim.y / 32;

    // TODO: make more efficient: if warp size == 32, then
    // 31 out of 32 threads sit idle (branch divergence)
    if (threadIdx.x % 32 == 0) {
        uint32_t packedResult = 0;

        // Pack 32 horizontal cells into one uint32_t
        for (int i = 0; i < 32 && (globalX + i) < width; i++) {
            bool cell = sharedMem[localY][localX + i];
            packedResult |= (cell << i);
        }

        // Write packed result to global memory
        d_newGrid[globalY * packedWidth + packedX] = packedResult;
    }
}

// Host function to initialize the grid with bit-packing
void initializeGrid(uint32_t* grid, int width, int height) {
    int packedWidth = width / 32;
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < packedWidth; x++) {
            uint32_t packedCell = 0;
            for (int bit = 0; bit < 32; bit++) {
                if (rand() % 2) {
                    packedCell |= (1u << bit);
                }
            }
            grid[y * packedWidth + x] = packedCell;
        }
    }
}

void printGrid(uint32_t* grid, int width, int height) {
    // Sixel uses 6 pixels per vertical line, so calculate dimensions
    int sixelHeight = (height + 5) / 6;  // Round up to nearest multiple of 6

    // Print sixel header with dimensions
    printf("\033Pq\"1;1;%d;%d\n", width, height);

    // Define colors: 0 for background (black), 1 for live cells (green)
    printf("#0;2;0;0;0#1;2;0;100;0\n");

    // Process grid in strips of 6 pixels high (sixel format)
    for (int y = 0; y < height; y += 6) {
        // Select color for live cells
        printf("#1");

        for (int x = 0; x < width; x++) {
            uint8_t sixelChar = 0;

            // Build sixel character for this column (6 pixels)
            for (int subY = 0; subY < 6 && (y + subY) < height; subY++) {
                int currentY = y + subY;
                int packedX = x / 32;
                int bitOffset = x % 32;
                bool cell = (grid[currentY * (width / 32) + packedX] >> bitOffset) & 1;

                if (cell) {
                    sixelChar |= (1 << subY);
                }
            }

            printf("%c", sixelChar + 63);  // Sixel data starts at ASCII 63
        }

        // Move to next row of sixels
        printf("$-");  // $ moves carriage to first column, next row
    }

    // End sixel output
    printf("\033\\\n");
}


int main() {
    int width = WORLD_WIDTH;
    int height = WORLD_HEIGHT;
    int packedWidth = width / 32;
    size_t size = packedWidth * height * sizeof(uint32_t);

    // Allocate host memory
    uint32_t* h_grid = (uint32_t*)malloc(size);
    uint32_t* h_newGrid = (uint32_t*)malloc(size);

    // Initialize grid
    initializeGrid(h_grid, width, height);

    // Allocate device memory
    uint32_t *d_grid, *d_newGrid;
    CHECK_ERR(cudaMalloc(&d_grid, size));
    CHECK_ERR(cudaMalloc(&d_newGrid, size));

    // Copy initial grid to device
    CHECK_ERR(cudaMemcpy(d_grid, h_grid, size, cudaMemcpyHostToDevice));

    // Set up grid and block dimensions
    dim3 blockDim(BLOCK_WIDTH, BLOCK_HEIGHT);
    dim3 gridDim((width + BLOCK_WIDTH - 1) / BLOCK_WIDTH,
                 (height + BLOCK_HEIGHT - 1) / BLOCK_HEIGHT);

    // Main simulation loop
    int generations = 200;
    for (int gen = 0; gen < generations; gen++) {
        gameOfLife<<<gridDim, blockDim>>>(d_grid, d_newGrid, width, height);

        std::swap(d_grid, d_newGrid);

        CHECK_ERR(cudaMemcpy(h_grid, d_grid, size, cudaMemcpyDeviceToHost));
        printGrid(h_grid, width, height);
        printf("^^ Generation %d ^^\n", gen);
        usleep(1000 * 100);
    }

    // Cleanup
    free(h_grid);
    free(h_newGrid);
    CHECK_ERR(cudaFree(d_grid));
    CHECK_ERR(cudaFree(d_newGrid));
}
