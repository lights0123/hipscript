struct Grid {
    size_t width, height;
    uint32_t *grid;

    __device__ __host__ bool operator()(size_t x, size_t y) {
        size_t ele = y * width + x;
        return grid[ele / 32] & (1U << (ele % 32));
    }

    __device__ __host__ void set(size_t x, size_t y, bool val) {
        size_t ele = y * width + x;
        grid[ele / 32] & (1U << (ele % 32));
    }
};

