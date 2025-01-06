# Copyright 2020 The Clspv Authors. All rights reserved.
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

add_llvm_tool(clspv-reflection
  ${CMAKE_CURRENT_SOURCE_DIR}/main.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/ReflectionParser.cpp
  # ADDITIONAL_HEADER_DIRS
  # clspv_builtin_library
  # clspv64_builtin_library
  DEPENDS
  SPIRV-Tools-static
  GENERATE_DRIVER)
set_property(GLOBAL APPEND PROPERTY LLVM_DRIVER_OBJLIBS SPIRV-Tools-static)
add_dependencies(clspv-reflection SPIRV-Tools-static)
include_directories(${SPIRV_TOOLS_SOURCE_DIR}/include)
include_directories(${SPIRV_HEADERS_INCLUDE_DIRS})
include_directories(${CLSPV_INCLUDE_DIRS})
include_directories(${CLSPV_BINARY_DIR}/include)
# target_include_directories(clspv-reflection PRIVATE
#   ${CMAKE_CURRENT_SOURCE_DIR}
#   ${CLSPV_INCLUDE_DIRS}
#   ${SPIRV_HEADERS_INCLUDE_DIRS}
#   ${SPIRV_TOOLS_SOURCE_DIR}/include)

# target_link_libraries(clspv-reflection PRIVATE SPIRV-Tools-static)

# set_target_properties(clspv-reflection PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CLSPV_BINARY_DIR}/bin)

# if(ENABLE_CLSPV_TOOLS_INSTALL)
#   install(TARGETS clspv-reflection
#     RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
# endif(ENABLE_CLSPV_TOOLS_INSTALL)

