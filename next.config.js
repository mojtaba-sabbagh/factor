/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained `.next/standalone/` (server.js + the minimal
  // node_modules it traces) on top of the normal `.next` build, so a release can
  // be built off the host and shipped without installing dependencies there.
  output: "standalone",

  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // logo/seal/signature images travel as data URLs

    // A cPanel/CloudLinux account caps how many processes and threads a single
    // user may create. During `next build`, Next forks one child process per CPU
    // for "Collecting page data" (the default is os.cpus().length - 1, e.g. ~31
    // on a 32-core host) and every one of them starts its own thread pool, which
    // exhausts that limit:
    //   node[...]: pthread_create: Resource temporarily unavailable
    //   ⨯ Next.js build worker exited with code: null and signal: SIGABRT
    // Pinning the build to a single worker keeps it well under the limit. Raise
    // this (or delete it) on a VPS/dedicated machine.
    cpus: 1,

    // Compile with the main process instead of forking another build worker; one
    // fewer process/thread block on shared hosting.
    webpackBuildWorker: false,

    // Skip Next's worker_threads pool (webpack minification etc.); keeps the
    // build single-threaded to stay under the host's thread cap.
    workerThreads: false,
  },
};

module.exports = nextConfig;
