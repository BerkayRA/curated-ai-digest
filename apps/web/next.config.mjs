/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@mega-bulten/brand',
    '@mega-bulten/shared',
    '@mega-bulten/db',
    '@mega-bulten/email',
    '@mega-bulten/delivery',
    '@mega-bulten/curation',
  ],
  // argon2 uses native Node.js addons (node:crypto) and must never be bundled
  // by webpack. Mark it as external so Next.js requires it at runtime instead.
  // Note: Next.js 14 uses the experimental key; this moves to a top-level key
  // in Next.js 15.
  experimental: {
    serverComponentsExternalPackages: ['argon2', 'exa-js', 'rss-parser'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next App Router injects inline bootstrap/hydration scripts; without
              // 'unsafe-inline' (or a per-request nonce) the app won't hydrate.
              // Pragmatic for this internal, auth-gated tool; nonce-based CSP is the
              // documented hardening step (see docs/SECURITY.md).
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self'",
              // 'self' (not 'none') so the email-preview srcdoc iframe is permitted.
              "frame-src 'self'",
              // Clickjacking protection (who may embed US) — pairs with X-Frame-Options.
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
  webpack: (config, { nextRuntime }) => {
    // Resolve .js extension imports in ESM workspace packages to .ts source files.
    // Workspace packages use NodeNext module resolution with explicit .js extensions,
    // but webpack resolves source .ts files directly via transpilePackages.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };

    // argon2 is a native Node.js addon. Externalize it ONLY for the Node.js server
    // build so it is required at runtime. It must NEVER be externalized (or imported)
    // for the Edge Runtime — middleware uses auth.config.ts which doesn't import it.
    if (nextRuntime === 'nodejs') {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'argon2',
      ];
    }

    return config;
  },
};

export default nextConfig;
