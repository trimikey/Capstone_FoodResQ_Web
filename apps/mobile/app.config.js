const fs = require('fs');
const path = require('path');

// Dynamic config: allow loading Firebase config through EAS file env vars.
// For local builds, fall back to files on disk when they exist.
const appJson = require('./app.json');

function existingLocalFile(fileName) {
  const localPath = path.join(__dirname, fileName);
  return fs.existsSync(localPath) ? `./${fileName}` : undefined;
}

module.exports = ({ config }) => {
  const expo = { ...appJson.expo, ...config };
  const { googleServicesFile: _androidGoogleServicesFile, ...androidConfig } = expo.android ?? {};
  const { googleServicesFile: _iosGoogleServicesFile, ...iosConfig } = expo.ios ?? {};

  const androidGoogleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ?? existingLocalFile('google-services.json');
  const iosGoogleServicesFile =
    process.env.GOOGLE_SERVICE_INFO_PLIST ?? existingLocalFile('GoogleService-Info.plist');

  return {
    ...expo,
    android: {
      ...androidConfig,
      usesCleartextTraffic: true,
      ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
    },
    ios: {
      ...iosConfig,
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
    },
  };
};
