const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

module.exports = phase => {
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    reactStrictMode: true,
    // Keep dev and production build artifacts separate so a build or stale cache
    // cannot knock the running dev server's vendor chunks out from under it.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };

  return nextConfig;
};
