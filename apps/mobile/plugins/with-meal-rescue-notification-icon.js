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
const METADATA_NAME = 'com.onesignal.NotificationIcon';
const DEFAULT_LOGO = './assets/notification-logo.png';

function androidManifestMod(manifest) {
  const application = manifest.manifest.application?.[0];
  if (!application) return manifest;

  const hasMetadata = (application['meta-data'] ?? []).some((m) => m.$?.['android:name'] === METADATA_NAME);

  if (!hasMetadata) {
    application['meta-data'] = [
      ...(application['meta-data'] ?? []),
      {
        $: {
          'android:name': METADATA_NAME,
          'android:resource': `@drawable/${ICON_RESOURCE_NAME}`,
        },
      },
    ];
  }

  return manifest;
}

module.exports = function withMealRescueNotificationIcon(config, props) {
  const logoPath = (props && props.logo) || DEFAULT_LOGO;

  config = withAndroidManifest(config, (modRes) => {
    modRes.modResults = androidManifestMod(modRes.modResults);
    return modRes;
  });

  config = withDangerousMod(config, [
    'android',
    (modRes) => {
      const projectRoot = modRes.modRequest.projectRoot;
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
