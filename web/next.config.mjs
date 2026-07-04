/** @type {import('next').NextConfig} */
const isStatic = process.env.STATIC_EXPORT === "1";
export default {
  reactStrictMode: false,
  devIndicators: false,
  transpilePackages: ["@veritas/shared"],
  ...(isStatic
    ? { output: "export", images: { unoptimized: true } }
    : { async rewrites() { return [{ source: "/api/:path*", destination: "http://localhost:8787/api/:path*" }]; } }),
};
