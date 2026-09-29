/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

// Privileged module shared by the junquillaFolders and junquillaSetup
// Experiments: find, create, and remove the Uncertain saved searches.
// Loaded through resource://junquilla/.

import { importModule } from "./compat.mjs";

const { MailServices } = importModule(
  "resource:///modules/MailServices.sys.mjs",
  "resource:///modules/MailServices.jsm"
);
const { VirtualFolderHelper } = importModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs",
  "resource:///modules/VirtualFolderWrapper.jsm"
);
const { UNCERTAIN_BOUNDS } = ChromeUtils.importESModule(
  "resource://junquilla/lib/junk-logic.mjs"
);

/** dBFolderInfo property that marks a JunQuilla folder. Shared with 0.2: NEVER change it. */
export const MARKER = "Junquilla.Uncertain";

/** Yields the Inbox of every server that has one. */
export function* inboxes() {
  for (const server of MailServices.accounts.allServers) {
    let inbox = null;
    try {
      inbox = server.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
    } catch (e) {
      continue;
    }
    if (inbox) {
      yield inbox;
    }
  }
}

function isMarked(folder) {
  if (!folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    return false;
  }
  try {
    return folder.msgDatabase.dBFolderInfo.getBooleanProperty(MARKER, false);
  } catch (e) {
    return false;
  }
}

/** The marked Uncertain folder directly under inbox, or null. */
export function findMarked(inbox) {
  let children;
  try {
    children = inbox.subFolders;
  } catch (e) {
    return null;
  }
  return children.find(isMarked) ?? null;
}

/** URIs of every marked Uncertain folder. */
export function scanUncertainURIs() {
  const uris = new Set();
  for (const inbox of inboxes()) {
    const folder = findMarked(inbox);
    if (folder) {
      uris.add(folder.URI);
    }
  }
  return uris;
}

function junkPercentTerm(session, op, value) {
  const term = session.createTerm();
  term.attrib = Ci.nsMsgSearchAttrib.JunkPercent;
  const termValue = term.value;
  // value.attrib must be set before the value itself.
  termValue.attrib = Ci.nsMsgSearchAttrib.JunkPercent;
  termValue.junkPercent = value;
  term.value = termValue;
  term.op = op;
  term.booleanAnd = true;
  return term;
}

function commitDatabase(db) {
  const type = Ci.nsMsgDBCommitType.kLargeCommit;
  if (typeof db.commit == "function") {
    db.commit(type);
  } else {
    db.Commit(type);
  }
}

/**
 * Create a marked Uncertain folder (junk percent 10–90) under each Inbox that
 * has none. An Inbox with an unmarked child of the same name is skipped and
 * that folder is left untouched.
 *
 * @param {string} name - localized folder name
 * @returns {{created: number, skipped: number}}
 */
export function addUncertain(name) {
  let created = 0;
  let skipped = 0;
  for (const inbox of inboxes()) {
    if (findMarked(inbox) || inbox.containsChildNamed(name)) {
      skipped++;
      continue;
    }
    try {
      const session = Cc["@mozilla.org/messenger/searchSession;1"].createInstance(
        Ci.nsIMsgSearchSession
      );
      session.addScopeTerm(Ci.nsMsgSearchScope.offlineMail, inbox);
      session.appendTerm(
        junkPercentTerm(session, Ci.nsMsgSearchOp.IsGreaterThan, UNCERTAIN_BOUNDS.greaterThan)
      );
      session.appendTerm(
        junkPercentTerm(session, Ci.nsMsgSearchOp.IsLessThan, UNCERTAIN_BOUNDS.lessThan)
      );
      const result = VirtualFolderHelper.createNewVirtualFolder(
        name,
        inbox,
        [inbox],
        session.searchTerms,
        false
      );
      // createNewVirtualFolder returns a VirtualFolderWrapper.
      const folder = result?.virtualFolder ?? result;
      const db = folder.msgDatabase;
      db.dBFolderInfo.setBooleanProperty(MARKER, true);
      commitDatabase(db);
      created++;
    } catch (e) {
      console.error("junquilla: creating Uncertain folder failed", inbox.URI, e);
      skipped++;
    }
  }
  return { created, skipped };
}

/**
 * Delete every marked Uncertain folder. Unmarked folders are never touched.
 *
 * @returns {{removed: number}}
 */
export function removeUncertain() {
  let removed = 0;
  for (const inbox of inboxes()) {
    const folder = findMarked(inbox);
    if (!folder) {
      continue;
    }
    try {
      folder.deleteSelf(null);
      removed++;
    } catch (e) {
      console.error("junquilla: removing Uncertain folder failed", folder.URI, e);
    }
  }
  return { removed };
}
