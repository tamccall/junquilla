/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

// Privileged module: loads Thunderbird modules whose name differs between
// 140 (ES module, *.sys.mjs) and 115 (JSM, *.jsm). Loaded through
// resource://junquilla/. The same helper is copied into the Experiment
// implementation.js files that need it before the substitution exists.

/**
 * Import esmURL (Thunderbird 140) or, if that fails, jsmURL (Thunderbird 115).
 *
 * @param {string} esmURL - ES module URL, loaded with importESModule
 * @param {string} jsmURL - JSM or ES module URL for 115
 * @returns {object} the module's exports
 */
export function importModule(esmURL, jsmURL) {
  try {
    return ChromeUtils.importESModule(esmURL);
  } catch (e) {
    return jsmURL.endsWith(".jsm")
      ? ChromeUtils.import(jsmURL)
      : ChromeUtils.importESModule(jsmURL);
  }
}
