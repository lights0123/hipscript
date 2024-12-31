/*
 * This file is part of hipCPU, a HIP implementation based on OpenMP
 *
 * Copyright (c) 2018,2019 Aksel Alpay
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

#include <hip/hip_runtime.h>
#include <vector>
#include <cassert>
#include <stdexcept>
#include <string>
#include <iostream>

void check_error(hipError_t err)
{
  if(err != hipSuccess)
    throw std::runtime_error{"Caught hip error: "+std::to_string(static_cast<int>(err))};
}

template<class T>
__global__ void vector_add(const T* in_a, const T* in_b, T* out, int start, int num_elements)
{
  int gid = hipBlockIdx_x * hipBlockDim_x + hipThreadIdx_x;
  if(threadIdx.x == 0) {
    printf("%d: %d\n", blockIdx.x, gid);
  }
  
  if(gid >= start && gid < num_elements)
    out[gid] = in_a[gid] + in_b[gid];
}

__device__ int globaly = 5;
__constant__ int consty = 6;
__constant__ int constz;

__global__ void foo(int* in, int def) {
  extern __shared__ int shmem[];
  shmem[threadIdx.x] = in[threadIdx.x + constz] + globaly;
  __syncthreads();
  in[threadIdx.x] = shmem[blockDim.x - threadIdx.x - 1] + consty;
  printf("%s %d\n", "foo bar: ", in[threadIdx.x]);
  assert(consty > 5);
}

constexpr std::size_t buff_size = 1024;
constexpr std::size_t block_size = 16;

static_assert(buff_size % block_size == 0, 
              "buffer size must be a multiple of the block size");
  
int main()
{
  std::vector<int> in_a(buff_size);
  std::vector<int> in_b(buff_size);
  std::vector<int> result(buff_size);
  
  for(std::size_t i = 0; i < buff_size; ++i)
  {
    in_a[i] = static_cast<int>(i);
    in_b[i] = static_cast<int>(i+1);
  }
  
  int *d_in_a, *d_in_b, *d_result;
  check_error(hipMalloc((void**)&d_in_a, buff_size * sizeof(int)));
  check_error(hipMalloc((void**)&d_in_b, buff_size * sizeof(int)));
  check_error(hipMalloc((void**)&d_result, buff_size * sizeof(int)));
  
  check_error(hipMemcpy(d_in_a, in_a.data(), buff_size * sizeof(int), hipMemcpyHostToDevice));
  check_error(hipMemcpy(d_in_b, in_b.data(), buff_size * sizeof(int), hipMemcpyHostToDevice));
  
  vector_add<<<buff_size/block_size, block_size>>>(d_in_a, d_in_b, d_result, 0, buff_size);
  // hipLaunchKernelGGL(vector_add, buff_size/block_size, block_size, 0, 0, 
  //                    d_in_a, d_in_b, d_result, 0, buff_size);
  
  check_error(hipMemcpy(result.data(), d_result, buff_size * sizeof(int), hipMemcpyDeviceToHost));
  
  for(std::size_t i = 0; i < result.size(); ++i)
    assert(result[i] == (in_a[i] + in_b[i]));

  printf("verified!!!\n");
  
  for(int i = 0; i < 32; i++) {
    printf("%d, ", in_a[i]);
  }
  printf("\n");
  int offset = 4;
  check_error(hipMemcpyToSymbol(consty, &offset, sizeof(int)));
  foo<<<1, 32, 32 * sizeof(int)>>>(d_in_a, 5);

  int f[32];
  check_error(hipMemcpy(f, d_in_a, 32 * sizeof(int), hipMemcpyDeviceToHost));
  for(int i = 0; i < 32; i++) {
    printf("%d, ", f[i]);
  }
  printf("\n");
  vector_add<<<buff_size/block_size, block_size>>>(d_in_a, d_in_b, d_result, 0, buff_size);
}
