/*
Copyright (c) 2015 - 2023 Advanced Micro Devices, Inc. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

#ifndef HIP_INCLUDE_HIP_MATH_FUNCTIONS_H
#define HIP_INCLUDE_HIP_MATH_FUNCTIONS_H

// Some standard header files, these are included by hc.hpp and so want to make them avail on both
// paths to provide a consistent include env and avoid "missing symbol" errors that only appears
// on NVCC path:

#if !defined(__HIPCC_RTC__)
#include <hip/hip_common.h>
#endif

#if (defined(__HIP_PLATFORM_HCC__) || defined(__HIP_PLATFORM_AMD__)) &&                            \
    !(defined(__HIP_PLATFORM_NVCC__) || defined(__HIP_PLATFORM_NVIDIA__)) &&                       \
    !(defined(__HIP_PLATFORM_CLANG__) || defined(__HIP_PLATFORM_SPIRV__))
#include <hip/amd_detail/amd_math_functions.h>

#elif (defined(__HIP_PLATFORM_NVCC__) || defined(__HIP_PLATFORM_NVIDIA__)) &&                      \
    !(defined(__HIP_PLATFORM_HCC__) || defined(__HIP_PLATFORM_AMD__)) &&                           \
    !(defined(__HIP_PLATFORM_CLANG__) || defined(__HIP_PLATFORM_SPIRV__))
//#include <hip/nvidia_detail/math_functions.h>

#elif (defined(__HIP_PLATFORM_CLANG__) || defined(__HIP_PLATFORM_SPIRV__)) &&                      \
    !(defined(__HIP_PLATFORM_HCC__) || defined(__HIP_PLATFORM_AMD__)) &&                           \
    !(defined(__HIP_PLATFORM_NVCC__) || defined(__HIP_PLATFORM_NVIDIA__))
#include "hip/spirv_hip_devicelib.hh"

#else
#error("Must define exactly one of __HIP_PLATFORM_AMD__, __HIP_PLATFORM_NVIDIA__ or __HIP_PLATFORM_SPIRV__");
#endif // HIP PLATFORM SELECTIONf
#endif // HIP_INCLUDE_HIP_MATH_FUNCTIONS_H
