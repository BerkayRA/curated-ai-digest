/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@mega-bulten/brand',
    '@mega-bulten/shared',
    '@mega-bulten/db',
    '@mega-bulten/email',
  ],
  webpack: (config) => {
    // Resolve .js extension imports in ESM workspace packages to .ts source files.
    // Workspace packages use NodeNext module resolution with explicit .js extensions,
    // but webpack resolves source .ts files directly via transpilePackages.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
