// Copyright 2022 The clvk authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

#pragma once

// #include "context.hpp"
// #include "memory.hpp"

#include <unordered_map>
#include <vector>

struct printf_descriptor {
  std::string format_string;
  std::vector<uint32_t> arg_sizes;
};

using printf_descriptor_map_t = std::unordered_map<uint32_t, printf_descriptor>;

// Process the contents of the printf buffer and print the results to stdout
void cvk_printf(const char *printf_buffer, size_t buffer_size,
                const printf_descriptor_map_t &descriptors);
