/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@mega-bulten/brand',
    '@mega-bulten/shared',
    '@mega-bulten/db',
    '@mega-bulten/email',
  ],
  // argon2 uses native Node.js addons (node:crypto) and must never be bundled
  // by webpack. Mark it as external so Next.js requires it at runtime instead.
  // Note: Next.js 14 uses the experimental key; this moves to a top-level key
  // in Next.js 15.
  experimental: {
    serverComponentsExternalPackages: ['argon2'],
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
