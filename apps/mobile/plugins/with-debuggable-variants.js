/**
 * Ensures `debuggableVariants = []` in android/app/build.gradle.
 *
 * The React Native template skips JS bundling for every debuggable variant
 * ("By default is just 'debug'"). Meal Rescue never runs Metro on-device:
 * QA APKs must embed their own bundle, so NO variant may skip bundling.
 *
 * `expo prebuild --clean` regenerates build.gradle from the template, so this
 * setting has to be re-applied by a config plugin rather than edited by hand.
 */

const { withAppBuildGradle } = require('expo/config-plugins');

const TARGET_LINE = '    // debuggableVariants = ["liteDebug", "prodDebug"]';
const SNIPPET = `${TARGET_LINE}\n    debuggableVariants = []`;

module.exports = function withDebuggableVariants(config) {
  return withAppBuildGradle(config, (mod) => {
    const contents = mod.modResults.contents;
    if (contents.includes('debuggableVariants = []')) {
      return mod;
    }
    if (contents.includes(TARGET_LINE)) {
      mod.modResults.contents = contents.replace(TARGET_LINE, SNIPPET);
      return mod;
    }
    console.warn('[with-debuggable-variants] template line not found; JS bundling may be skipped for debug');
    return mod;
  });
};
