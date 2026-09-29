/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

// junquillaJunk: the adaptive filter's token-level analysis of one message.
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

  // Never leave the detail window waiting forever.
  const TIMEOUT_MS = 30000;

  function getJunkDetail(extension, messageId) {
    const hdr = extension.messageManager.get(messageId);
    if (!hdr) {
      throw new ExtensionError("invalid-message");
    }
    const subject = hdr.mime2DecodedSubject;
    const uri = hdr.folder.generateMessageURI(hdr.messageKey) + "?fetchCompleteMessage=true";
    const plugin = Cc["@mozilla.org/messenger/filter-plugin;1?name=bayesianfilter"].getService(
      Ci.nsIJunkMailPlugin
    );

    return new Promise((resolve) => {
      const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      timer.initWithCallback(
        () => resolve({ subject, tokens: [] }),
        TIMEOUT_MS,
        Ci.nsITimer.TYPE_ONE_SHOT
      );
      const listener = {
        QueryInterface: ChromeUtils.generateQI(["nsIMsgTraitDetailListener"]),
        // Since XPIDL arrays became JS arrays there is no count argument.
        onMessageTraitDetails(msgUri, proTrait, tokenStrings, tokenPercents, runningPercents) {
          timer.cancel();
          resolve({
            subject,
            tokens: tokenStrings.map((token, i) => ({
              token,
              tokenPercent: tokenPercents[i],
              runningPercent: runningPercents[i],
            })),
          });
        },
      };
      plugin.detailMessage(uri, plugin.JUNK_TRAIT, plugin.GOOD_TRAIT, listener);
    });
  }

  exports.junquillaJunk = class extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
      const { extension } = context;
      return {
        junquillaJunk: {
          async getJunkDetail(messageId) {
            return getJunkDetail(extension, messageId);
          },
        },
      };
    }

    onShutdown(isAppShutdown) {
      // Nothing to undo: this namespace changes no state.
    }
  };
})(this);
