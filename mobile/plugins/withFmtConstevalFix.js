const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * React Native 0.76's bundled `fmt` library uses `consteval` in a way that
 * newer Xcode/Clang toolchains reject ("call to consteval function ... is not
 * a constant expression"). Defining FMT_USE_CONSTEVAL=0 forces `fmt` to fall
 * back to `constexpr`, which compiles cleanly.
 *
 * Applied to every Pods target as a preprocessor definition. The Ruby is
 * written to handle GCC_PREPROCESSOR_DEFINITIONS being nil, a String, or an
 * Array (CocoaPods is inconsistent), so the define always lands correctly.
 *
 * This is a config plugin so it survives `expo prebuild --clean`.
 */
const INJECT = `
    # Injected by withFmtConstevalFix: fix fmt consteval build error on newer Xcode
    installer.pods_project.targets.each do |fmt_target|
      fmt_target.build_configurations.each do |fmt_config|
        defs = fmt_config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)']
        defs = [defs] unless defs.is_a?(Array)
        defs << 'FMT_USE_CONSTEVAL=0' unless defs.include?('FMT_USE_CONSTEVAL=0')
        fmt_config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs
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

      // Inject into the existing `post_install do |installer|` block.
      const marker = /post_install do \|installer\|[^\n]*\n/;
      if (marker.test(contents)) {
        contents = contents.replace(marker, (match) => match + INJECT);
      } else {
        throw new Error(
          'withFmtConstevalFix: could not find `post_install do |installer|` in Podfile'
        );
      }

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
