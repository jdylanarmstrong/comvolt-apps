const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * React Native 0.76's bundled `fmt` library uses `consteval` in a way that
 * newer Xcode/Clang toolchains reject ("call to consteval function ... is not
 * a constant expression"). Defining FMT_USE_CONSTEVAL=0 forces `fmt` to fall
 * back to `constexpr`, which compiles cleanly.
 *
 * This is applied as a config plugin so it survives `expo prebuild --clean`.
 */
const INJECT = `
    installer.pods_project.targets.each do |fmt_target|
      fmt_target.build_configurations.each do |fmt_config|
        fmt_config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
        fmt_config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_USE_CONSTEVAL=0'
      end
    end
`;

module.exports = function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        'Podfile'
      );
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes('FMT_USE_CONSTEVAL=0')) {
        return cfg;
      }

      // Inject our build-setting loop at the top of the existing
      // `post_install do |installer|` block.
      contents = contents.replace(
        /post_install do \|installer\|\n/,
        (match) => match + INJECT
      );

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
