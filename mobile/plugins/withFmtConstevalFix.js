const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * React Native 0.76 bundles fmt 11.0.2, whose `basic_format_string` constructor
 * is marked `consteval`. Newer Apple Clang (Xcode 16.3+) rejects the way fmt
 * calls it ("call to consteval function ... is not a constant expression").
 *
 * fmt 11.0.2 defines FMT_USE_CONSTEVAL *unconditionally* (no #ifndef guard), so
 * a `-DFMT_USE_CONSTEVAL=0` compiler flag gets overwritten by the header and has
 * no effect. The only reliable fix is to patch the header so the FMT_CONSTEVAL
 * macro expands to nothing, turning the constructor into a plain function.
 *
 * The patch runs inside the Podfile `post_install` hook, which executes after
 * CocoaPods has downloaded the git-based fmt pod into the sandbox. It is
 * idempotent and survives `expo prebuild --clean`.
 */
const INJECT = `
    # Injected by withFmtConstevalFix: neutralize fmt's consteval constructor,
    # which newer Apple Clang rejects. fmt 11.0.2 forces FMT_USE_CONSTEVAL on, so
    # a compiler define can't override it -- patch the header directly.
    fmt_base_h = File.join(installer.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base_h)
      fmt_src = File.read(fmt_base_h)
      fmt_patched = fmt_src.sub(/^#\\s*define\\s+FMT_CONSTEVAL\\s+consteval\\s*$/, '#  define FMT_CONSTEVAL')
      if fmt_patched != fmt_src
        File.write(fmt_base_h, fmt_patched)
        Pod::UI.puts '[withFmtConstevalFix] Neutralized FMT_CONSTEVAL in fmt/base.h'
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

      if (contents.includes('withFmtConstevalFix')) {
        return cfg;
      }

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
