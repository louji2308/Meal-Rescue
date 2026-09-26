/**
 * Meal Rescue notification-logo config plugin.
 *
 * OneSignal's default Android small icon is the SDK bell; the app logo is
 * only used for the splash/launcher. This plugin, at `expo prebuild`, copies
 * the logo into the Android drawable resources as `ic_stat_meal_rescue` and
 * registers it via the `com.onesignal.NotificationIcon` manifest metadata, so
 * every push (spoiler alert, aftercare, promo) shows the Meal Rescue logo
 * instead of a tool default.
 *
 * iOS banner icons are always the App Store app icon (Apple requirement), so
 * there is deliberately nothing to do for iOS here.
 */

const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const ICON_RESOURCE_NAME = 'ic_stat_meal_rescue';

function androidManifestMod(manifest, config) {
  const logoPath = config.logo || './assets/notification-logo.png';
  const name = 'com.onesignal.NotificationIcon';

  const hasMetadata =
    manifest.manifest.application?.[0]?.['meta-data']?.some((m) => m.$?.['android:name'] === name) ??
    false;

  if (!hasMetadata) {
    manifest.manifest.application[0]['meta-data'] = [
      ...(manifest.manifest.application[0]['meta-data'] ?? []),
      {
        $: {
          'android:name': name,
          'android:resource': `@drawable/${ICON_RESOURCE_NAME}`,
        },
      },
    ];
  }

  return { ...manifest, _logoPath: logoPath };
}

module.exports = function withMealRescueNotificationIcon(config) {
  config = withAndroidManifest(config, (modRes) => {
    modRes.modResults = androidManifestMod(modRes.modResults, config);
    return modRes;
  });

  config = withDangerousMod(config, [
    'android',
    (modRes) => {
      const projectRoot = modRes.modRequest.projectRoot;
      const logoPath = modRes.modResults._logoPath;
      const source = path.resolve(projectRoot, logoPath);
      const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
      const drawableDir = path.join(resDir, 'drawable');
      if (!fs.existsSync(drawableDir)) fs.mkdirSync(drawableDir, { recursive: true });
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(drawableDir, `${ICON_RESOURCE_NAME}.png`));
      } else {
        console.warn(`[with-meal-rescue-notification-icon] logo not found: ${source}`);
      }
      return modRes.modResults;
    },
  ]);

  return config;
};