module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated v4 dùng worklets plugin — BẮT BUỘC đặt cuối danh sách plugins
    plugins: ['react-native-worklets/plugin'],
  };
};
