/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

import { ICON_IDS } from "./lib/junk-logic.mjs";

const DETAIL_MENU_ID = "junquilla-detail";
const PREF_NAMES = {
  maxTokens: "mailnews.bayesian_spam_filter.junk_maxtokens",
  threshold: "mail.adaptivefilters.junk_threshold",
};

// Message router for the options and detail pages. Each handler returns a
// promise (or value) that becomes the sendMessage reply.
const handlers = {};

messenger.runtime.onMessage.addListener((msg) => {
  const handler = handlers[msg?.type];
  if (!handler) {
    return Promise.resolve({ error: "unknown-message" });
  }
  return Promise.resolve(handler(msg));
});

function t(key, ...subs) {
  return messenger.i18n.getMessage(key, subs);
}

// Uncertain folders (options page).
handlers.addUncertain = () => messenger.junquillaFolders.addUncertain(t("uncertainFolderName"));
handlers.removeUncertain = () => messenger.junquillaFolders.removeUncertain();

// Junk filter settings (options page).
handlers.getPrefs = async () => ({
  maxTokens: await messenger.junquillaPrefs.get(PREF_NAMES.maxTokens),
  threshold: await messenger.junquillaPrefs.get(PREF_NAMES.threshold),
});
handlers.setPref = ({ key, value }) =>
  messenger.junquillaPrefs.set(PREF_NAMES[key], value).then(() => ({ ok: true }));

// Junk Analysis Detail.
handlers.getDetail = ({ messageId }) =>
  messenger.junquillaJunk
    .getJunkDetail(messageId)
    .catch((e) => ({ error: String(e.message ?? e) }));

async function openDetail(messageId) {
  await messenger.windows.create({
    type: "popup",
    url: "detail/detail.html?messageId=" + messageId,
    width: 500,
    height: 400,
  });
}

// Event listeners are registered at top level so the MV3 background wakes
// for them.
messenger.menus.onClicked.addListener((info) => {
  if (info.menuItemId != DETAIL_MENU_ID) {
    return;
  }
  const first = info.selectedMessages?.messages?.[0];
  if (first) {
    openDetail(first.id).catch((e) => console.error("junquilla:", e));
  }
});

messenger.junquillaMenus.onMessageMenuDetail.addListener(async () => {
  try {
    const [tab] = await messenger.mailTabs.query({ active: true, currentWindow: true });
    if (!tab) {
      return;
    }
    const selected = await messenger.mailTabs.getSelectedMessages(tab.id);
    const first = selected?.messages?.[0];
    // With nothing selected, do nothing (US4 #2).
    if (first) {
      await openDetail(first.id);
    }
  } catch (e) {
    console.error("junquilla:", e);
  }
});

// First run: once per profile, skipped for 0.2 upgrades.
async function firstRun() {
  const decision = await messenger.junquillaSetup.runFirstRunIfNeeded(t("uncertainFolderName"));
  if (decision === "ran") {
    // Refresh the folder pane styling for the folders just created.
    await messenger.junquillaFolders.listUncertain();
  }
}

function firstRunSafely() {
  firstRun().catch((e) => console.error("junquilla:", e));
}

messenger.runtime.onInstalled.addListener(firstRunSafely);
messenger.runtime.onStartup.addListener(firstRunSafely);

async function init() {
  // Each feature is wired separately, so one failure cannot block the others.
  try {
    await messenger.junquillaColumns.register({
      junkPercentName: t("colJunkPercentLabel"),
      junkStatusName: t("colJunkStatusPlusLabel"),
      statusText: Object.fromEntries(ICON_IDS.map((id) => [id, t("status_" + id)])),
    });
  } catch (e) {
    console.error("junquilla:", e);
  }

  try {
    // Reports a duplicate-id error when the MV3 background restarts; the
    // callback reads lastError so that is ignored.
    messenger.menus.create(
      { id: DETAIL_MENU_ID, title: t("detailTitle"), contexts: ["message_list"] },
      () => void messenger.runtime.lastError
    );
  } catch (e) {
    // Already created.
  }

  try {
    await messenger.junquillaMenus.addMessageMenuItem(t("detailTitle"));
  } catch (e) {
    console.error("junquilla:", e);
  }
}

init();
