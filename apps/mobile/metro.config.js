const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Resolve @betintel/shared from vendored TypeScript source so Metro transforms
// it directly — bypasses npm pack semantics that strip dist/ from file: deps.
config.resolver.extraNodeModules = {
  '@betintel/shared': path.resolve(__dirname, '_vendor/shared'),
};

module.exports = withNativeWind(config, { input: './global.css' });
