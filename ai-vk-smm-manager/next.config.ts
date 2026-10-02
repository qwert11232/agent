import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Шрифты для рендера слайдов читаются с диска в рантайме — явно кладём их
  // в бандл serverless-функций (иначе на Vercel: ENOENT …/assets/fonts/*.woff).
  outputFileTracingIncludes: {
    "/api/**/*": ["./assets/fonts/**/*"],
    "/**/*": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
