/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

// junquillaPrefs: read and write a short allow-list of Thunderbird prefs.
// See EXPERIMENTS.md for the internals used and why.

"use strict";

// All Experiment scripts of an add-on share one global, so everything except
// the exported class lives inside this function.
(function (exports) {
  const { ExtensionCommon } = ChromeUtils.importESModule(
    "resource://gre/modules/ExtensionCommon.sys.mjs"
  );
  const { ExtensionUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/ExtensionUtils.sys.mjs"
  );
  const { ExtensionError } = ExtensionUtils;

  const READABLE = {
    "mailnews.bayesian_spam_filter.junk_maxtokens": "int",
    "mail.adaptivefilters.junk_threshold": "int",
    "mail.spam.markAsNotJunkMarksUnRead": "bool",
    "extensions.junquilla.installed": "bool",
  };
  const WRITABLE = [
    "mailnews.bayesian_spam_filter.junk_maxtokens",
    "mail.adaptivefilters.junk_threshold",
  ];

  function get(name) {
    const type = Object.hasOwn(READABLE, name) ? READABLE[name] : null;
    if (!type) {
      throw new ExtensionError("pref-not-allowed");
    }
    if (Services.prefs.getPrefType(name) == Services.prefs.PREF_INVALID) {
      return null;
    }
    return type == "int" ? Services.prefs.getIntPref(name) : Services.prefs.getBoolPref(name);
  }

  function set(name, value) {
    if (!WRITABLE.includes(name)) {
      throw new ExtensionError("pref-not-allowed");
    }
    const number = Math.trunc(Number(value));
    if (!Number.isFinite(number)) {
      // Not a number at all; there is nothing to store.
      throw new ExtensionError("not-a-number");
    }
    // No range check: values are stored as entered (clarified in the spec).
    Services.prefs.setIntPref(name, number);
  }

  exports.junquillaPrefs = class extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
      return {
        junquillaPrefs: {
          async get(name) {
            return get(name);
          },
          async set(name, value) {
            set(name, value);
          },
        },
      };
    }

    onShutdown(isAppShutdown) {
      // Nothing to undo: pref values belong to the user.
    }
  };
})(this);
