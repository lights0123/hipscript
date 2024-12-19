#pragma once
#include <errno.h>
#include <sys/types.h>
#include <assert.h>
#include <unistd.h>
#include <sys/mman.h>
#include <__header_dirent.h>
#include <__mode_t.h>

extern "C" {
           struct statvfs {
               unsigned long  f_bsize;    /* Filesystem block size */
               unsigned long  f_frsize;   /* Fragment size */
               fsblkcnt_t     f_blocks;   /* Size of fs in f_frsize units */
               fsblkcnt_t     f_bfree;    /* Number of free blocks */
               fsblkcnt_t     f_bavail;   /* Number of free blocks for
                                             unprivileged users */
               fsfilcnt_t     f_files;    /* Number of inodes */
               fsfilcnt_t     f_ffree;    /* Number of free inodes */
               fsfilcnt_t     f_favail;   /* Number of free inodes for
                                             unprivileged users */
               unsigned long  f_fsid;     /* Filesystem ID */
               unsigned long  f_flag;     /* Mount flags */
               unsigned long  f_namemax;  /* Maximum filename length */
           };

	   inline int statvfs(const char * path, struct statvfs * buf) {
        errno = ENOTSUP;
        return -1;
	   }
       inline int fstatvfs(int fd, struct statvfs *buf) {
        errno = ENOTSUP;
        return -1;
       }

       inline int fchown(int, uid_t, gid_t) {
        errno = ENOTSUP;
        return -1;
       }

       inline int posix_madvise(void *addr, size_t len, int advice)
{
	if (advice == MADV_DONTNEED) return 0;
    errno = ENOTSUP;
	return -1;
}

       int mprotect(void *, size_t, int) __attribute__((weak_import))
{
    errno = ENOTSUP;
	return -1;
}
}
inline int __wasilibc_dttoif(int x) {
    switch (x) {
        case DT_DIR: return S_IFDIR;
        case DT_CHR: return S_IFCHR;
        case DT_BLK: return S_IFBLK;
        case DT_REG: return S_IFREG;
        case DT_FIFO: return S_IFIFO;
        case DT_LNK: return S_IFLNK;
#ifdef DT_SOCK
        case DT_SOCK: return S_IFSOCK;
#endif
        case DT_UNKNOWN:
        default:
	    return S_IFSOCK;
    }
}

#define STATVFS statvfs
#define FSTATVFS fstatvfs
#define STATVFS_F_FRSIZE(vfs) vfs.f_frsize

#define F_RDLCK 0
#define F_WRLCK 1
#define F_UNLCK 2
#define F_GETLK  5
#define F_SETLK  6
#define F_SETLKW 7
