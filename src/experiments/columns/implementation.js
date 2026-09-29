/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

// junquillaColumns: the Junk % and Junk Status + message list columns.
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
  const { ThreadPaneColumns } = importModule(
    "chrome://messenger/content/ThreadPaneColumns.mjs",
    "chrome://messenger/content/thread-pane-columns.mjs"
  );

  function ensureSubstitution(extension) {
    Services.io
      .getProtocolHandler("resource")
      .QueryInterface(Ci.nsIResProtocolHandler)
      .setSubstitution("junquilla", extension.rootURI);
  }

  // Column ids are saved in each folder's columnStates. NEVER change them.
  const COLUMN_IDS = ["junquillaJunkPercent", "junquillaJunkStatus"];
  // ThreadPaneColumns gives each cell the class `${id.toLowerCase()}-column`.
  const STATUS_CELL_SELECTOR = ".junquillajunkstatus-column";

  let registered = false;
  let stopTracking = null;
  const paneListeners = new WeakMap(); // about:3pane window -> listeners

  /**
   * Hide both columns while a newsgroup is shown, without saving that.
   *
   * Column visibility is saved per folder in 140. Mail folders restore their
   * own state on every folder change, so nothing has to be undone when the
   * user leaves a newsgroup (research R5).
   *
   * If the user changes columns while a newsgroup is shown, Thunderbird saves
   * the whole column list, including our forced hidden=true, into that
   * newsgroup's columnStates. That is harmless: it only affects newsgroups,
   * where the columns are always hidden anyway, so the R5 fallback (filtering
   * our ids out of the saved state) is not applied.
   */
  function applyNewsVisibility(win) {
    if (!win.gFolder?.getFlag(Ci.nsMsgFolderFlags.Newsgroup)) {
      return;
    }
    const columns = win.threadPane?.columns;
    if (!columns) {
      return;
    }
    let changed = false;
    for (const column of columns) {
      if (COLUMN_IDS.includes(column.id) && !column.hidden) {
        column.hidden = true;
        changed = true;
      }
    }
    if (changed) {
      win.threadPane.updateColumns();
    }
  }

  /**
   * Clicking a Junk Status + cell toggles junk exactly like the built-in Junk
   * column: custom icon cells have no click handling of their own, so the
   * click is turned into Thunderbird's own toggle-spam event, which runs
   * gDBView.applyCommandToIndices(junk|unjunk) and trains the filter.
   */
  function onStatusClick(win, event) {
    if (event.button != 0) {
      return;
    }
    const cell = event.target.closest?.(STATUS_CELL_SELECTOR);
    const row = cell?.closest('tr[is="thread-row"]');
    if (!row) {
      return;
    }
    let index = row.index;
    if (!Number.isInteger(index)) {
      index = win.threadTree?.getIndexOfItem?.(row) ?? parseInt(row.dataset.index, 10);
    }
    if (!Number.isInteger(index) || index < 0) {
      return;
    }
    const hdr = win.gDBView?.getMsgHdrAt(index);
    if (!hdr) {
      return;
    }
    const isJunk = hdr.getStringProperty("junkscore") == "100";
    // Stop the click so it does not also change the selection.
    event.stopPropagation();
    event.preventDefault();
    win.threadPane.treeTable.dispatchEvent(
      new win.CustomEvent("toggle-spam", {
        bubbles: true,
        detail: { index, isJunk },
      })
    );
  }

  function attach(win) {
    const onFolderChanged = () => {
      applyNewsVisibility(win);
      // The pane may restore the folder's saved columns after this event;
      // apply again once that has happened.
      win.setTimeout(() => applyNewsVisibility(win), 0);
    };
    const onClick = (event) => onStatusClick(win, event);
    win.addEventListener("folderURIChanged", onFolderChanged);
    const treeTable = win.threadPane?.treeTable;
    treeTable?.addEventListener("click", onClick, true);
    paneListeners.set(win, { onFolderChanged, onClick, treeTable });
    applyNewsVisibility(win);
  }

  function detach(win) {
    const listeners = paneListeners.get(win);
    if (!listeners) {
      return;
    }
    win.removeEventListener("folderURIChanged", listeners.onFolderChanged);
    listeners.treeTable?.removeEventListener("click", listeners.onClick, true);
    paneListeners.delete(win);
  }

  function register(extension, labels) {
    if (registered) {
      return;
    }
    ensureSubstitution(extension);
    const { ICON_IDS, displayPercent, percentSortKey, statusIconId, statusSortKey } =
      ChromeUtils.importESModule("resource://junquilla/lib/junk-logic.mjs");
    const { trackPanes } = ChromeUtils.importESModule(
      "resource://junquilla/experiments/common/pane-tracker.mjs"
    );
    const statusText = (id) => labels.statusText?.[id] ?? id;
    const iconUrl = (id) => extension.rootURI.resolve(`icons/${id}.png`);

    // The callbacks only read header properties: no database opens and no
    // async work per row (SC-003).
    ThreadPaneColumns.addCustomColumn("junquillaJunkPercent", {
      name: labels.junkPercentName,
      hidden: true,
      sortable: true,
      resizable: true,
      textCallback: (hdr) => displayPercent(hdr.getStringProperty("junkpercent")),
      sortCallback: (hdr) => percentSortKey(hdr.getStringProperty("junkpercent")),
    });

    const statusOf = (hdr) =>
      statusIconId(hdr.getStringProperty("junkscore"), hdr.getStringProperty("junkscoreorigin"));
    ThreadPaneColumns.addCustomColumn("junquillaJunkStatus", {
      name: labels.junkStatusName,
      hidden: true,
      sortable: true,
      resizable: false,
      icon: true,
      iconHeaderUrl: iconUrl("junk-col-plus"),
      iconCellDefinitions: ICON_IDS.map((id) => ({
        id,
        url: iconUrl(id),
        title: statusText(id),
        alt: statusText(id),
      })),
      iconCallback: statusOf,
      // Used for the header rows when grouped by sort.
      textCallback: (hdr) => statusText(statusOf(hdr)),
      sortCallback: (hdr) =>
        statusSortKey(
          hdr.getStringProperty("junkscore"),
          hdr.getStringProperty("junkscoreorigin")
        ),
    });

    registered = true;
    stopTracking = trackPanes(attach, detach);
  }

  function unregister() {
    if (stopTracking) {
      stopTracking();
      stopTracking = null;
    }
    if (!registered) {
      return;
    }
    for (const id of COLUMN_IDS) {
      try {
        ThreadPaneColumns.removeCustomColumn(id);
      } catch (e) {
        console.error("junquilla: removing column failed", id, e);
      }
    }
    registered = false;
  }

  exports.junquillaColumns = class extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
      const { extension } = context;
      return {
        junquillaColumns: {
          async register(labels) {
            register(extension, labels);
          },
          async unregister() {
            unregister();
          },
        },
      };
    }

    onShutdown(isAppShutdown) {
      if (isAppShutdown) {
        return;
      }
      unregister();
      // This namespace owns the add-on-wide cleanup, so an update or re-enable
      // does not load stale modules (research R12).
      Services.obs.notifyObservers(null, "startupcache-invalidate");
      Services.io
        .getProtocolHandler("resource")
        .QueryInterface(Ci.nsIResProtocolHandler)
        .setSubstitution("junquilla", null);
    }
  };
})(this);
