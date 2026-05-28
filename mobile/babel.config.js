module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // must be last
      'react-native-reanimated/plugin',
    ],
  };
};
