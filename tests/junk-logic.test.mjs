import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ICON_IDS,
  UNCERTAIN_BOUNDS,
  displayPercent,
  firstRunDecision,
  percentSortKey,
  statusIconId,
  statusSortKey,
} from "../src/lib/junk-logic.mjs";

const ORIGINS = ["", "filter", "imapflag", "plugin", "user", "whitelist"];

test("displayPercent", () => {
  assert.equal(displayPercent(null), "");
  assert.equal(displayPercent(undefined), "");
  assert.equal(displayPercent(""), "");
  assert.equal(displayPercent("0"), "0");
  assert.equal(displayPercent("57"), "57");
});

test("percentSortKey puts unscored first and sorts numerically", () => {
  assert.equal(percentSortKey(""), 0);
  assert.equal(percentSortKey(null), 0);
  const values = ["100", "", "10", "9", "0"];
  const sorted = [...values].sort((a, b) => percentSortKey(a) - percentSortKey(b));
  assert.deepEqual(sorted, ["", "0", "9", "10", "100"]);
});

test("statusIconId reaches all 13 icon ids", () => {
  const seen = new Set();
  for (const score of ["0", "100", "", "50"]) {
    for (const origin of [...ORIGINS, "somethingelse"]) {
      seen.add(statusIconId(score, origin));
    }
  }
  assert.deepEqual([...seen].sort(), [...ICON_IDS].sort());
  assert.equal(ICON_IDS.length, 13);
  for (const id of ICON_IDS) {
    assert.doesNotMatch(id, /\W/, "ThreadPaneColumns rejects non-word icon ids");
  }
});

test("statusIconId maps verdicts and origins", () => {
  assert.equal(statusIconId("0", "user"), "gooduser");
  assert.equal(statusIconId("0", "plugin"), "goodbayes");
  assert.equal(statusIconId("100", "whitelist"), "junkwhite");
  assert.equal(statusIconId("100", "filter"), "junkfilter");
  assert.equal(statusIconId("100", "imapflag"), "junkflag");
  assert.equal(statusIconId("0", "novel-origin"), "good");
  assert.equal(statusIconId("100", "novel-origin"), "junk");
  assert.equal(statusIconId("100", ""), "junk");
  assert.equal(statusIconId("", "user"), "unclassified");
  assert.equal(statusIconId("42", "plugin"), "unclassified");
});

test("statusSortKey groups verdict first, then origin", () => {
  const goodKeys = ["0", "", "50"].flatMap((s) => ORIGINS.map((o) => statusSortKey(s, o)));
  const junkKeys = ORIGINS.map((o) => statusSortKey("100", o));
  assert.ok(Math.max(...goodKeys) < Math.min(...junkKeys));

  for (const score of ["0", "100"]) {
    const keys = ORIGINS.map((o) => statusSortKey(score, o));
    assert.deepEqual(keys, [...keys].sort((a, b) => a - b));
    assert.equal(new Set(keys).size, ORIGINS.length);
  }
  assert.equal(statusSortKey("100", "novel-origin"), statusSortKey("100", ""));
  assert.equal(statusSortKey("0", undefined), 0);
});

test("firstRunDecision follows the install-state table", () => {
  assert.equal(firstRunDecision({ installedPref: true, markerFound: false }), "skipped-installed");
  assert.equal(firstRunDecision({ installedPref: true, markerFound: true }), "skipped-installed");
  assert.equal(firstRunDecision({ installedPref: false, markerFound: true }), "skipped-upgrade");
  assert.equal(firstRunDecision({ installedPref: false, markerFound: false }), "ran");
});

test("UNCERTAIN_BOUNDS cover 10 to 90 inclusive", () => {
  assert.deepEqual(UNCERTAIN_BOUNDS, { greaterThan: 9, lessThan: 91 });
});
