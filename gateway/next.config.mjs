// Minimal Next.js 16 config for the Path A gateway scaffold.
// No security headers, no i18n, no MDX — only the path alias pointing to the
// workspace open-sse package so @omniroute/open-sse resolves correctly.
const nextConfig = {
  // Suppress the "This is NOT the Next.js you know" notice in dev output
  reactStrictMode: true,
};

export default nextConfig;
