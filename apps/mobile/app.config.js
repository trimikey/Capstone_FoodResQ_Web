// Dynamic config: cho phép nạp google-services.json qua EAS file environment variable
// (secret, không commit vào git). Khi build local, env không set → fallback file on-disk
// (./google-services.json, đã gitignore). Tránh GitHub secret scanning + EAS vẫn build được.
const appJson = require('./app.json');
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const expo = { ...appJson.expo, ...config };
  const { googleServicesFile: _androidGoogleServicesFile, ...android } = expo.android ?? {};
  const { googleServicesFile: _iosGoogleServicesFile, ...ios } = expo.ios ?? {};
  const localAndroidGoogleServices = path.join(__dirname, 'google-services.json');
  const localIosGoogleServices = path.join(__dirname, 'GoogleService-Info.plist');
  const androidGoogleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ??
    (fs.existsSync(localAndroidGoogleServices) ? './google-services.json' : null);
  const iosGoogleServicesFile =
    process.env.GOOGLE_SERVICE_INFO_PLIST ??
    (fs.existsSync(localIosGoogleServices) ? './GoogleService-Info.plist' : null);

  return {
    ...expo,
    android: {
      ...android,
      usesCleartextTraffic: true,
      ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
    },
    ios: {
      ...ios,
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
    },
  };
};
