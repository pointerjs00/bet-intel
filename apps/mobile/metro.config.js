const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

// Monorepo root — pnpm hoisted layout installs all packages here
const repoRoot = path.resolve(__dirname, '../..');

const config = getDefaultConfig(__dirname);

// Tell Metro to watch the root node_modules (hoisted pnpm layout)
config.watchFolders = [repoRoot];

// pnpm uses symlinks — Metro needs this to hash files resolved through symlinks
config.resolver.unstable_enableSymlinks = true;

// Look in root node_modules first, then app-local node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(repoRoot, 'node_modules'),
  path.resolve(__dirname, 'node_modules'),
];

// Resolve @betintel/shared directly from the monorepo TypeScript source so
// Metro transforms it — no dist/ build step required in development.
config.resolver.extraNodeModules = {
  '@betintel/shared': path.resolve(repoRoot, 'packages/shared/src'),
};

// The Expo virtual entry file uses relative `./node_modules/X` requires which
// only work when node_modules is local. In a pnpm hoisted monorepo it lives at
// the repo root. Intercept and strip the prefix so nodeModulesPaths takes over.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('./node_modules/')) {
    return context.resolveRequest(
      context,
      moduleName.slice('./node_modules/'.length),
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
