/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

// junquillaSetup: one-time first-run defaults, skipped for 0.2 upgrades.
// See EXPERIMENTS.md for the internals used and why.

"use strict";

// All Experiment scripts of an add-on share one global, so everything except
// the exported class lives inside this function.
(function (exports) {
  const { ExtensionCommon } = ChromeUtils.importESModule(
    "resource://gre/modules/ExtensionCommon.sys.mjs"
  );

  function ensureSubstitution(extension) {
    Services.io
      .getProtocolHandler("resource")
      .QueryInterface(Ci.nsIResProtocolHandler)
      .setSubstitution("junquilla", extension.rootURI);
  }

  // Same pref 0.2 wrote, so upgrades are recognized.
  const INSTALLED_PREF = "extensions.junquilla.installed";
  const MAXTOKENS_PREF = "mailnews.bayesian_spam_filter.junk_maxtokens";
  const MARK_UNREAD_PREF = "mail.spam.markAsNotJunkMarksUnRead";

  function runFirstRunIfNeeded(extension, uncertainName) {
    ensureSubstitution(extension);
    const { firstRunDecision } = ChromeUtils.importESModule(
      "resource://junquilla/lib/junk-logic.mjs"
    );
    const { scanUncertainURIs, addUncertain } = ChromeUtils.importESModule(
      "resource://junquilla/experiments/common/uncertain-folders.mjs"
    );

    const installedPref = Services.prefs.getBoolPref(INSTALLED_PREF, false);
    const markerFound = installedPref ? false : scanUncertainURIs().size > 0;
    const decision = firstRunDecision({ installedPref, markerFound });

    if (decision == "skipped-upgrade") {
      Services.prefs.setBoolPref(INSTALLED_PREF, true);
    } else if (decision == "ran") {
      // Set first, so a failure below can never cause a second run.
      Services.prefs.setBoolPref(INSTALLED_PREF, true);
      // Note: this does not update junquillaFolders' URI cache; the
      // background calls junquillaFolders.listUncertain() after "ran".
      addUncertain(uncertainName);
      if (!Services.prefs.prefHasUserValue(MAXTOKENS_PREF)) {
        Services.prefs.setIntPref(MAXTOKENS_PREF, 300000);
      }
      Services.prefs.setBoolPref(MARK_UNREAD_PREF, false);
    }
    console.log("junquilla first-run:", decision);
    return decision;
  }

  exports.junquillaSetup = class extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
      const { extension } = context;
      return {
        junquillaSetup: {
          async runFirstRunIfNeeded(uncertainName) {
            return runFirstRunIfNeeded(extension, uncertainName);
          },
        },
      };
    }

    onShutdown(isAppShutdown) {
      // Nothing to undo: first-run results are meant to persist.
    }
  };
})(this);
