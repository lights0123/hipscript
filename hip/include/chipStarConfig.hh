/*
 * Copyright (c) 2022 chipStar developers
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

#ifndef CHIP_CONFIG_H
#define CHIP_CONFIG_H

#define CHIPSTAR_MAJOR_VERSION 1
#define CHIPSTAR_MINOR_VERSION 1
#define CHIPSTAR_PATCH_VERSION 00

#define CHIPSTAR_VERSION "1.1.00"

// not implemented yet
#undef OCML_BASIC_ROUNDED_OPERATIONS

#define CHIP_SOURCE_DIR "/home/ben/Documents/Projects/cuda-web/chipStar"

#define CHIP_BUILD_DIR "/home/ben/Documents/Projects/cuda-web/chipStar/build"

#define CHIP_INSTALL_DIR "/home/ben/Documents/Projects/cuda-web/chipStar/build/install"

/* #undef CHIP_CLANG_PATH */

#define HAS_FILESYSTEM 1

/* #undef HAS_EXPERIMENTAL_FILESYSTEM */

#define CHIP_DEFAULT_WARP_SIZE 32

// Non-zero integer if the chipStar is built in debug mode.
#define CHIP_DEBUG_BUILD 1

#define CHIP_USE_INTEL_USM

/* #undef CHIP_L0_FIRST_TOUCH */

/* #undef CHIP_ENABLE_NON_COMPLIANT_DEVICELIB_CODE */

/* #undef CHIP_FAST_MATH */

#define CHIP_ERROR_IF_NOT_IMPLEMENTED

#define CHIP_DEFAULT_JIT_FLAGS "-cl-kernel-arg-info -cl-std=CL3.0"

/* #undef CHIP_MALI_GPU_WORKAROUNDS */

#define HAVE_OPENCL 1

#define HAVE_LEVEL0 1

#define SPDLOG_ACTIVE_LEVEL SPDLOG_LEVEL_TRACE

#endif
