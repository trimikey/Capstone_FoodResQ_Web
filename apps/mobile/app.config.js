// Dynamic config: cho phép nạp google-services.json qua EAS file environment variable
// (secret, không commit vào git). Khi build local, env không set → fallback file on-disk
// (./google-services.json, đã gitignore). Tránh GitHub secret scanning + EAS vẫn build được.
const appJson = require('./app.json');

module.exports = ({ config }) => {
  const expo = { ...appJson.expo, ...config };
  return {
    ...expo,
    android: {
      ...expo.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? expo.android?.googleServicesFile,
    },
    ios: {
      ...expo.ios,
      googleServicesFile:
        process.env.GOOGLE_SERVICE_INFO_PLIST ?? expo.ios?.googleServicesFile,
    },
  };
};
