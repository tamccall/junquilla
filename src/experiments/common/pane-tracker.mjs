/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

// Privileged module shared by the junquillaColumns and junquillaFolders
// Experiments. Loaded through resource://junquilla/.

import { importModule } from "./compat.mjs";

const { ExtensionSupport } = importModule(
  "resource:///modules/ExtensionSupport.sys.mjs",
  "resource:///modules/ExtensionSupport.jsm"
);

const MESSENGER_URL = "chrome://messenger/content/messenger.xhtml";

let nextListenerId = 0;

/**
 * Track every about:3pane content window, now and in the future.
 *
 * Lifecycle:
 * - For each messenger.xhtml window (open now or opened later), every
 *   mail3PaneTab in gTabmail is inspected. Once the tab's about:3pane
 *   document has finished loading, onAttach(paneWindow) is called.
 * - Tabs opened later are picked up through the tabmail TabOpen event.
 * - Each pane window is attached at most once (tracked in a WeakSet).
 * - Pane windows that close are not reported; callers should only keep
 *   state that is safe to drop with the window.
 * - stop() unregisters every listener and calls onDetach(paneWindow) for each
 *   attached pane window that is still open.
 *
 * @param {function(Window):void} onAttach
 * @param {function(Window):void} onDetach
 * @returns {function():void} stop
 */
export function trackPanes(onAttach, onDetach) {
  const listenerId = `junquilla-panes-${nextListenerId++}`;
  const attached = new WeakSet();
  // Strong refs are needed to detach on stop(); closed windows are skipped.
  const attachedList = [];
  const tabOpenListeners = new Map(); // messenger window -> listener
  const loadListeners = []; // [browser, listener]

  function attachPane(paneWin) {
    if (!paneWin || attached.has(paneWin)) {
      return;
    }
    attached.add(paneWin);
    attachedList.push(Cu.getWeakReference(paneWin));
    try {
      onAttach(paneWin);
    } catch (e) {
      console.error("junquilla: pane attach failed", e);
    }
  }

  function watchTab(tab) {
    if (tab?.mode?.name != "mail3PaneTab") {
      return;
    }
    const browser = tab.chromeBrowser;
    if (!browser) {
      return;
    }
    const paneWin = browser.contentWindow;
    if (
      paneWin?.location?.href == "about:3pane" &&
      paneWin.document.readyState == "complete"
    ) {
      attachPane(paneWin);
      return;
    }
    const onLoad = () => {
      const win = browser.contentWindow;
      if (win?.location?.href == "about:3pane") {
        attachPane(win);
      }
    };
    browser.addEventListener("load", onLoad, true);
    loadListeners.push([browser, onLoad]);
  }

  function watchMessenger(win) {
    const tabmail = win.gTabmail ?? win.document.getElementById("tabmail");
    if (!tabmail || tabOpenListeners.has(win)) {
      return;
    }
    // The first tab may not exist yet; TabOpen reports it when it does.
    const onTabOpen = (event) => watchTab(event.detail?.tabInfo);
    tabmail.tabContainer.addEventListener("TabOpen", onTabOpen);
    tabOpenListeners.set(win, onTabOpen);
    for (const tab of tabmail.tabInfo ?? []) {
      watchTab(tab);
    }
  }

  ExtensionSupport.registerWindowListener(listenerId, {
    chromeURLs: [MESSENGER_URL],
    onLoadWindow(win) {
      watchMessenger(win);
    },
    onUnloadWindow(win) {
      tabOpenListeners.delete(win);
    },
  });

  return function stop() {
    ExtensionSupport.unregisterWindowListener(listenerId);
    for (const [win, listener] of tabOpenListeners) {
      try {
        win.gTabmail?.tabContainer.removeEventListener("TabOpen", listener);
      } catch (e) {
        // The window may already be closing.
      }
    }
    tabOpenListeners.clear();
    for (const [browser, listener] of loadListeners) {
      browser.removeEventListener("load", listener, true);
    }
    loadListeners.length = 0;
    for (const ref of attachedList) {
      const paneWin = ref.get();
      if (paneWin && !paneWin.closed) {
        try {
          onDetach(paneWin);
        } catch (e) {
          console.error("junquilla: pane detach failed", e);
        }
      }
    }
    attachedList.length = 0;
  };
}
