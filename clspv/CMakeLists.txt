# Copyright 2017 The Clspv Authors. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Define build type for clspv_core
# if (CLSPV_SHARED_LIB)
#   set(CLSPV_LIB_TYPE SHARED)
# else ()
#   set(CLSPV_LIB_TYPE STATIC)
# endif ()

# Core clspv library.  This contains support code for the driver, including
# the pass pipeline.
# add_library(clspv_core ${CLSPV_LIB_TYPE}
# )

set(LLVM_SUBPROJECT_TITLE "clspv")

set(CLSPV_LLVM_BINARY_DIR ${CMAKE_CURRENT_BINARY_DIR}/../..)
set(CLSPV_BINARY_DIR ${CMAKE_CURRENT_BINARY_DIR})
set(SPIRV_HEADERS_SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR})
set(CLSPV_INCLUDE_DIRS  ${CMAKE_CURRENT_SOURCE_DIR}/include)
set(SPIRV-Headers_SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR})
set(SPIRV_TOOLS_SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/third_party/SPIRV-Tools)
add_subdirectory(${SPIRV_TOOLS_SOURCE_DIR})
target_compile_options(SPIRV-Tools-opt PRIVATE "-w")
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/cmake)
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/reflection)
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/tools)

add_llvm_executable(clspv
${CMAKE_CURRENT_SOURCE_DIR}/Compiler.cpp
${CMAKE_CURRENT_SOURCE_DIR}/FrontendPlugin.cpp
${CMAKE_CURRENT_SOURCE_DIR}/Sampler.cpp
${CMAKE_CURRENT_SOURCE_DIR}/AddFunctionAttributesPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/AllocateDescriptorsPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ArgKind.cpp
${CMAKE_CURRENT_SOURCE_DIR}/AutoPodArgsPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/AnnotationToMetadataPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/BitcastUtils.cpp
${CMAKE_CURRENT_SOURCE_DIR}/Builtins.cpp
${CMAKE_CURRENT_SOURCE_DIR}/CallGraphOrderedFunctions.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ClusterPodKernelArgumentsPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ClusterConstants.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ComputeStructuredOrder.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ConstantEmitter.cpp
${CMAKE_CURRENT_SOURCE_DIR}/Constants.cpp
${CMAKE_CURRENT_SOURCE_DIR}/DeclarePushConstantsPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/DefineOpenCLWorkItemBuiltinsPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/DescriptorCounter.cpp
${CMAKE_CURRENT_SOURCE_DIR}/DirectResourceAccessPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/FeatureMacro.cpp
${CMAKE_CURRENT_SOURCE_DIR}/FixupBuiltinsPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/FixupStructuredCFGPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/FunctionInternalizerPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/HideConstantLoadsPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/InlineEntryPointsPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/InlineFuncWithImageMetadataGetterPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/InlineFuncWithPointerBitCastArgPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/InlineFuncWithPointerToFunctionArgPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/InlineFuncWithReadImage3DNonLiteralSampler.cpp
${CMAKE_CURRENT_SOURCE_DIR}/InlineFuncWithSingleCallSitePass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/KernelArgNamesToMetadataPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/Layout.cpp
${CMAKE_CURRENT_SOURCE_DIR}/LogicalPointerToIntPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/LongVectorLoweringPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/SetImageMetadataPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ThreeElementVectorLoweringPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/WrapKernelPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/LowerAddrSpaceCastPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/LowerPrivatePointerPHIPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/MultiVersionUBOFunctionsPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/NativeMathPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/NormalizeGlobalVariable.cpp
${CMAKE_CURRENT_SOURCE_DIR}/OpenCLInlinerPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/Option.cpp
${CMAKE_CURRENT_SOURCE_DIR}/Passes.cpp
${CMAKE_CURRENT_SOURCE_DIR}/PhysicalPointerArgsPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/PrintfPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/PushConstant.cpp
${CMAKE_CURRENT_SOURCE_DIR}/SPIRVOp.cpp
${CMAKE_CURRENT_SOURCE_DIR}/SPIRVProducerPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/RemoveUnusedArguments.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ReorderBasicBlocksPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ReplaceLLVMIntrinsicsPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ReplaceOpenCLBuiltinPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ReplacePointerBitcastPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/RewriteInsertsPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/RewritePackedStructs.cpp
${CMAKE_CURRENT_SOURCE_DIR}/SamplerUtils.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ScalarizePass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ShareModuleScopeVariables.cpp
${CMAKE_CURRENT_SOURCE_DIR}/SignedCompareFixupPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/SimplifyPointerBitcastPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/SpecConstant.cpp
${CMAKE_CURRENT_SOURCE_DIR}/SpecializeImageTypes.cpp
${CMAKE_CURRENT_SOURCE_DIR}/SplatArgPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/SplatSelectCondition.cpp
${CMAKE_CURRENT_SOURCE_DIR}/StripFreezePass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/Types.cpp
${CMAKE_CURRENT_SOURCE_DIR}/UBOTypeTransformPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/UndoBoolPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/UndoByvalPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/UndoGetElementPtrConstantExprPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/UndoInstCombinePass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/UndoSRetPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/UndoTranslateSamplerFoldPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/UndoTruncateToOddIntegerPass.cpp
${CMAKE_CURRENT_SOURCE_DIR}/ZeroInitializeAllocasPass.cpp
ADDITIONAL_HEADER_DIRS
${CMAKE_CURRENT_SOURCE_DIR}/third_party/SPIRV-Headers/include
DEPENDS
clspv_glsl
clspv_c_strings
clspv_reflection
clspv_baked_opencl_header
# clspv_builtin_library
# clspv64_builtin_library
  GENERATE_DRIVER
)
set(CLANG_INCLUDE_DIRS ${LLVM_MAIN_SRC_DIR}/../clang/include)

include_directories(${SPIRV_HEADERS_INCLUDE_DIRS})

include_directories(${LLVM_INCLUDE_DIRS})

include_directories(${CLANG_INCLUDE_DIRS})

include_directories(${CLSPV_INCLUDE_DIRS})
include_directories(${CLSPV_BINARY_DIR}/include)
include_directories(${CLSPV_BINARY_DIR}/../clang/include)
# set_property(GLOBAL APPEND PROPERTY LLVM_DRIVER_TOOLS clspv)

# Pass library.  Transformation passes and pass-specific support are
# defined here.  This must be loadable by LLVM opt for testing individual
# passes.
# add_library(clspv_passes OBJECT
# )