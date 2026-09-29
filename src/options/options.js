/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

"use strict";

for (const element of document.querySelectorAll("[data-i18n]")) {
  element.textContent = messenger.i18n.getMessage(element.dataset.i18n);
}

// Uncertain folders.
const buttons = [document.getElementById("add"), document.getElementById("remove")];

async function runFolderAction(type) {
  for (const button of buttons) {
    button.disabled = true;
  }
  try {
    await messenger.runtime.sendMessage({ type });
  } catch (e) {
    console.error("junquilla:", e);
  } finally {
    for (const button of buttons) {
      button.disabled = false;
    }
  }
}

document.getElementById("add").addEventListener("click", () => runFolderAction("addUncertain"));
document.getElementById("remove").addEventListener("click", () => runFolderAction("removeUncertain"));

// Junk filter settings. Values are saved as entered, with no validation.
const prefInputs = {
  maxTokens: document.getElementById("maxTokens"),
  threshold: document.getElementById("threshold"),
};

async function loadPrefs() {
  const prefs = await messenger.runtime.sendMessage({ type: "getPrefs" });
  for (const [key, input] of Object.entries(prefInputs)) {
    input.value = prefs?.[key] ?? "";
  }
}

for (const [key, input] of Object.entries(prefInputs)) {
  input.addEventListener("change", () => {
    // An empty field is not a value; don't turn it into 0.
    if (input.value === "") {
      return;
    }
    messenger.runtime
      .sendMessage({ type: "setPref", key, value: input.value })
      .catch((e) => console.error("junquilla:", e));
  });
}

loadPrefs().catch((e) => console.error("junquilla:", e));
