/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

"use strict";

for (const element of document.querySelectorAll("[data-i18n]")) {
  element.textContent = messenger.i18n.getMessage(element.dataset.i18n);
}

function render(detail) {
  document.getElementById("subject").textContent = detail.subject ?? "";
  const body = document.getElementById("tokens");
  // Rows stay in the order the classifier returned them.
  for (const { token, tokenPercent, runningPercent } of detail.tokens ?? []) {
    const row = document.createElement("tr");
    for (const value of [token, tokenPercent, runningPercent]) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
}

async function load() {
  const id = new URLSearchParams(location.search).get("messageId");
  const detail = await messenger.runtime.sendMessage({ type: "getDetail", messageId: Number(id) });
  if (!detail || detail.error) {
    console.error("junquilla:", detail?.error ?? "no reply");
    return;
  }
  render(detail);
}

load().catch((e) => console.error("junquilla:", e));
