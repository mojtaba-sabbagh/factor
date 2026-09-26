/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // logo/seal/signature images travel as data URLs
  },
};

module.exports = nextConfig;
