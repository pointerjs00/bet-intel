const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

// Monorepo root — pnpm hoisted layout installs all packages here
const repoRoot = path.resolve(__dirname, '../..');

const config = getDefaultConfig(__dirname);

// Tell Metro to watch the root node_modules (hoisted pnpm layout)
config.watchFolders = [repoRoot];

// Look in root node_modules first, then app-local node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(repoRoot, 'node_modules'),
  path.resolve(__dirname, 'node_modules'),
];

// Resolve @betintel/shared from vendored TypeScript source so Metro transforms
// it directly — bypasses npm pack semantics that strip dist/ from file: deps.
config.resolver.extraNodeModules = {
  '@betintel/shared': path.resolve(__dirname, '_vendor/shared'),
};

module.exports = withNativeWind(config, { input: './global.css' });
