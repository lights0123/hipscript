#include <hip/hip_runtime.h>

inline thread_local hipError_t CHIPTlsLastError = hipSuccess;

#define RETURN(x)                                                              \
  do {                                                                         \
    hipError_t err = (x);                                                      \
    if (err)                                                                   \
      CHIPTlsLastError = err;                                                  \
    return err;                                                                \
  } while (0)
