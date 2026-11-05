import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@node-rs/argon2", "@react-pdf/renderer"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=()" },
        ],
      },
    ];
  },
};
export default config;
