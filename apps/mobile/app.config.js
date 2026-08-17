const fs = require('fs');
const path = require('path');

// Dynamic config: cho phép nạp google-services.json qua EAS file environment variable
// (secret, không commit vào git). Khi build local, env không set → fallback file on-disk
// (./google-services.json, đã gitignore). Tránh GitHub secret scanning + EAS vẫn build được.
const appJson = require('./app.json');

function existingLocalFile(filePath) {
  if (!filePath || !filePath.startsWith('./')) return filePath;
  return fs.existsSync(path.join(__dirname, filePath)) ? filePath : undefined;
}

module.exports = ({ config }) => {
  const expo = { ...appJson.expo, ...config };
  const { googleServicesFile: _iosGoogleServicesFile, ...iosConfig } = expo.ios ?? {};
  const iosGoogleServicesFile =
    process.env.GOOGLE_SERVICE_INFO_PLIST ?? existingLocalFile(expo.ios?.googleServicesFile);

  return {
    ...expo,
    android: {
      ...expo.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? existingLocalFile(expo.android?.googleServicesFile),
    },
    ios: {
      ...iosConfig,
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
    },
  };
};
