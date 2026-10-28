/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {"/api/tools/pdf": ["./assets/fonts/**/*", "./assets/signatures/**/*", "./public/logo-black.png"]},
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
