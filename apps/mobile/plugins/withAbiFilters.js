// Expo config plugin (plan #26): package only the ABIs listed in the Gradle property
// `reactNativeArchitectures`. Without abiFilters, prebuilt .so files from dependencies
// (ML Kit OCR, Skia, ...) ship for all 4 ABIs and the APK grows from ~45 MB to ~145 MB.
// Phone build: `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`
// Emulator build: `./gradlew assembleRelease -PreactNativeArchitectures=x86_64`
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = '// withAbiFilters';
const SNIPPET = `
        ${MARKER}
        ndk {
            abiFilters(*((findProperty('reactNativeArchitectures') ?: 'arm64-v8a').toString().split(',').collect { it.trim() }))
        }`;

module.exports = function withAbiFilters(config) {
  return withAppBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults.contents;
    if (!gradle.includes(MARKER)) {
      cfg.modResults.contents = gradle.replace(/defaultConfig\s*\{/, (m) => `${m}${SNIPPET}`);
    }
    return cfg;
  });
};
