/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: false,
  transpilePackages: ["@veritas/shared"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://localhost:8787/api/:path*" }];
  },
};
