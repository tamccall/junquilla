/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

// junquillaMenus: the Junk Analysis Detail item in the main Message menu.
// See EXPERIMENTS.md for the internals used and why.

"use strict";

// All Experiment scripts of an add-on share one global, so everything except
// the exported class lives inside this function.
(function (exports) {
  // Thunderbird 140 module URL first, then the 115 one. Same as
  // experiments/common/compat.mjs, copied here because it is needed before
  // the resource://junquilla/ substitution exists.
  function importModule(esmURL, jsmURL) {
    try {
      return ChromeUtils.importESModule(esmURL);
    } catch (e) {
      return jsmURL.endsWith(".jsm")
        ? ChromeUtils.import(jsmURL)
        : ChromeUtils.importESModule(jsmURL);
    }
  }

  const { ExtensionCommon } = ChromeUtils.importESModule(
    "resource://gre/modules/ExtensionCommon.sys.mjs"
  );
  const { ExtensionSupport } = importModule(
    "resource:///modules/ExtensionSupport.sys.mjs",
    "resource:///modules/ExtensionSupport.jsm"
  );

  const LISTENER_ID = "junquillaMenus";
  const ITEM_ID = "junquillaMessageMenuDetail";

  let itemLabel = null;
  const listeners = new Set();

  function notifyListeners() {
    for (const listener of listeners) {
      listener();
    }
  }

  function addItem(win) {
    const doc = win.document;
    const popup = doc.getElementById("messageMenuPopup");
    if (!popup || doc.getElementById(ITEM_ID)) {
      return;
    }
    const item = doc.createXULElement("menuitem");
    item.id = ITEM_ID;
    item.setAttribute("label", itemLabel);
    item.addEventListener("command", notifyListeners);
    popup.appendChild(item);
  }

  function removeItem(win) {
    win.document.getElementById(ITEM_ID)?.remove();
  }

  function addMessageMenuItem(label) {
    if (itemLabel !== null) {
      return;
    }
    itemLabel = label;
    // Also runs onLoadWindow for windows that are already open.
    ExtensionSupport.registerWindowListener(LISTENER_ID, {
      chromeURLs: ["chrome://messenger/content/messenger.xhtml"],
      onLoadWindow: addItem,
    });
  }

  // A persistent event, so choosing the item wakes the MV3 background when it
  // has been suspended (the background registers its listener at top level).
  exports.junquillaMenus = class extends ExtensionCommon.ExtensionAPIPersistent {
    PERSISTENT_EVENTS = {
      onMessageMenuDetail({ fire }) {
        const listener = async () => {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          fire.async();
        };
        listeners.add(listener);
        return {
          unregister() {
            listeners.delete(listener);
          },
          convert(newFire) {
            fire = newFire;
          },
        };
      },
    };

    getAPI(context) {
      return {
        junquillaMenus: {
          async addMessageMenuItem(label) {
            addMessageMenuItem(label);
          },
          onMessageMenuDetail: new ExtensionCommon.EventManager({
            context,
            module: "junquillaMenus",
            event: "onMessageMenuDetail",
            extensionApi: this,
          }).api(),
        },
      };
    }

    onShutdown(isAppShutdown) {
      if (isAppShutdown) {
        return;
      }
      if (itemLabel !== null) {
        ExtensionSupport.unregisterWindowListener(LISTENER_ID);
        for (const win of Services.wm.getEnumerator("mail:3pane")) {
          removeItem(win);
        }
        itemLabel = null;
      }
      listeners.clear();
    }
  };
})(this);
