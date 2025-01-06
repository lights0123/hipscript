add_llvm_tool(spirv-tools-opt
  ${CMAKE_CURRENT_SOURCE_DIR}/../third_party/SPIRV-Tools/tools/opt/opt.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../third_party/SPIRV-Tools/tools/io.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../third_party/SPIRV-Tools/tools/util/cli_consumer.cpp
  # ADDITIONAL_HEADER_DIRS
  # clspv_builtin_library
  # clspv64_builtin_library
  DEPENDS
  SPIRV-Tools-static
  GENERATE_DRIVER)
set_property(GLOBAL APPEND PROPERTY LLVM_DRIVER_OBJLIBS SPIRV-Tools-static SPIRV-Tools-opt)
# add_dependencies(spirv-tools-opt SPIRV-Tools-static)
include_directories(${SPIRV_TOOLS_SOURCE_DIR}/include)
include_directories(${SPIRV_TOOLS_SOURCE_DIR})
include_directories(${SPIRV_HEADERS_INCLUDE_DIRS})
# include_directories(${CLSPV_INCLUDE_DIRS})
# include_directories(${CLSPV_BINARY_DIR}/include)
