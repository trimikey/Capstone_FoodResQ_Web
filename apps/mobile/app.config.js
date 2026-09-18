const fs = require('fs');
const path = require('path');

// Dynamic config: cho phép nạp google-services.json qua EAS file environment variable
// (secret, không commit vào git). Khi build local, env không set → fallback file on-disk
// (./google-services.json, đã gitignore). Tránh GitHub secret scanning + EAS vẫn build được.
const appJson = require('./app.json');
const fs = require('fs');
const path = require('path');

function existingLocalFile(filePath) {
  if (!filePath || !filePath.startsWith('./')) return filePath;
  return fs.existsSync(path.join(__dirname, filePath)) ? filePath : undefined;
}

module.exports = ({ config }) => {
  const expo = { ...appJson.expo, ...config };
<<<<<<< HEAD
  const { googleServicesFile: _iosGoogleServicesFile, ...iosConfig } = expo.ios ?? {};
  const iosGoogleServicesFile =
    process.env.GOOGLE_SERVICE_INFO_PLIST ?? existingLocalFile(expo.ios?.googleServicesFile);
=======
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
>>>>>>> origin/master

  return {
    ...expo,
    android: {
      ...android,
      usesCleartextTraffic: true,
<<<<<<< HEAD
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? existingLocalFile(expo.android?.googleServicesFile),
    },
    ios: {
      ...iosConfig,
=======
      ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
    },
    ios: {
      ...ios,
>>>>>>> origin/master
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
    },
  };
};
