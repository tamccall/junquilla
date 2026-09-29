/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

// junquillaFolders: create/remove the Uncertain saved searches and style them
// in the folder pane. See EXPERIMENTS.md for the internals used and why.

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
  const { MailServices } = importModule(
    "resource:///modules/MailServices.sys.mjs",
    "resource:///modules/MailServices.jsm"
  );

  function ensureSubstitution(extension) {
    Services.io
      .getProtocolHandler("resource")
      .QueryInterface(Ci.nsIResProtocolHandler)
      .setSubstitution("junquilla", extension.rootURI);
  }

  const ATTR_UNCERTAIN = "data-junquilla-uncertain";
  const ATTR_HAS_MESSAGES = "data-junquilla-has-messages";
  const ROW_SELECTOR = 'li[is="folder-tree-row"]';

  let started = false;
  let folders = null; // uncertain-folders.mjs
  let sheetURL = null;
  let stopTracking = null;
  let uncertainURIs = new Set();
  const panes = new Map(); // about:3pane window -> MutationObserver

  function folderTreeOf(win) {
    return win.document.getElementById("folderTree");
  }

  function tagRow(row) {
    // Folder rows expose their folder URI as row.uri.
    const uri = row.uri;
    if (uri && uncertainURIs.has(uri)) {
      const folder = MailServices.folderLookup.getFolderForURL(uri);
      row.setAttribute(ATTR_UNCERTAIN, "true");
      row.setAttribute(ATTR_HAS_MESSAGES, String((folder?.getTotalMessages(false) ?? 0) > 0));
    } else if (row.hasAttribute(ATTR_UNCERTAIN)) {
      row.removeAttribute(ATTR_UNCERTAIN);
      row.removeAttribute(ATTR_HAS_MESSAGES);
    }
  }

  function tagSubtree(node) {
    if (node.nodeType != node.ELEMENT_NODE) {
      return;
    }
    if (node.matches(ROW_SELECTOR)) {
      tagRow(node);
    }
    for (const row of node.querySelectorAll(ROW_SELECTOR)) {
      tagRow(row);
    }
  }

  function untagAll(win) {
    for (const row of win.document.querySelectorAll(`[${ATTR_UNCERTAIN}]`)) {
      row.removeAttribute(ATTR_UNCERTAIN);
      row.removeAttribute(ATTR_HAS_MESSAGES);
    }
  }

  function retagAll() {
    for (const win of panes.keys()) {
      const tree = folderTreeOf(win);
      if (tree) {
        tagSubtree(tree);
      }
    }
  }

  function attach(win) {
    if (panes.has(win)) {
      return;
    }
    win.windowUtils.loadSheetUsingURIString(sheetURL, win.windowUtils.AUTHOR_SHEET);
    const observer = new win.MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          tagSubtree(node);
        }
      }
    });
    const tree = folderTreeOf(win);
    if (tree) {
      observer.observe(tree, { childList: true, subtree: true });
      tagSubtree(tree);
    }
    panes.set(win, observer);
  }

  function detach(win) {
    const observer = panes.get(win);
    if (!observer) {
      return;
    }
    observer.disconnect();
    panes.delete(win);
    try {
      win.windowUtils.removeSheetUsingURIString(sheetURL, win.windowUtils.AUTHOR_SHEET);
    } catch (e) {
      // The sheet was not loaded in this window.
    }
    untagAll(win);
  }

  // Keeps data-junquilla-has-messages current as messages match or stop
  // matching the saved search.
  const folderListener = {
    QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),
    onFolderIntPropertyChanged(folder, property) {
      if (property != "TotalMessages" || !uncertainURIs.has(folder.URI)) {
        return;
      }
      for (const win of panes.keys()) {
        for (const row of win.document.querySelectorAll(`[${ATTR_UNCERTAIN}]`)) {
          if (row.uri == folder.URI) {
            tagRow(row);
          }
        }
      }
    },
  };

  function start(extension) {
    if (started) {
      return;
    }
    started = true;
    ensureSubstitution(extension);
    folders = ChromeUtils.importESModule(
      "resource://junquilla/experiments/common/uncertain-folders.mjs"
    );
    const { trackPanes } = ChromeUtils.importESModule(
      "resource://junquilla/experiments/common/pane-tracker.mjs"
    );
    sheetURL = extension.rootURI.resolve("experiments/folders/folderpane.css");
    uncertainURIs = folders.scanUncertainURIs();
    MailServices.mailSession.AddFolderListener(
      folderListener,
      Ci.nsIFolderListener.intPropertyChanged
    );
    stopTracking = trackPanes(attach, detach);
  }

  function stop() {
    if (!started) {
      return;
    }
    started = false;
    stopTracking?.();
    stopTracking = null;
    // trackPanes only reports windows that are still open.
    for (const win of [...panes.keys()]) {
      detach(win);
    }
    MailServices.mailSession.RemoveFolderListener(folderListener);
    uncertainURIs = new Set();
  }

  function rescan() {
    uncertainURIs = folders.scanUncertainURIs();
    retagAll();
    return [...uncertainURIs];
  }

  exports.junquillaFolders = class extends ExtensionCommon.ExtensionAPI {
    // Declared with "events": ["startup"] in manifest.json, so the folder
    // pane is styled from startup, before the background calls anything.
    onStartup() {
      start(this.extension);
    }

    getAPI(context) {
      const { extension } = context;
      return {
        junquillaFolders: {
          async addUncertain(name) {
            start(extension);
            const result = folders.addUncertain(name);
            rescan();
            return result;
          },
          async removeUncertain() {
            start(extension);
            const result = folders.removeUncertain();
            rescan();
            return result;
          },
          // Also re-scans, so the background can refresh the styling after
          // junquillaSetup created folders through the shared module (the
          // URI cache here does not see those).
          async listUncertain() {
            start(extension);
            return rescan();
          },
        },
      };
    }

    onShutdown(isAppShutdown) {
      if (isAppShutdown) {
        return;
      }
      // The Uncertain folders themselves stay as ordinary saved searches.
      stop();
    }
  };
})(this);
