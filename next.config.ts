import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // The project sits in a folder whose path contains a trailing space, so keep the
    // filesystem root explicit rather than letting Turbopack infer the git root.
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
