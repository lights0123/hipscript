addToLibrary({
    stop_bg_threads__postset: `if(ENVIRONMENT_IS_WORKER){self.onerror = (message, source, lineno, colno, e) => {
    if(!e.stack) throw e;
    err("WORKER_STACK\\n"+e.stack);
    }}`,
    stop_bg_threads() {
        checkMailbox = () => {};

        const ptr = _pthread_self();
        HEAP32[ptr >> 2] = ptr;
        Atomics.notify(HEAP32, ptr >> 2);
    }
});
