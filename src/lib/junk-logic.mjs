/* This Source Code is subject to the terms of the GNU General Public License,
 * version 3 or later. See the LICENSE file at the root of this add-on. */

// Pure JunQuilla logic. This module MUST NOT use any Mozilla globals: it is
// imported both by the Experiments (through resource://junquilla/) and by the
// node:test unit tests.

/** Icon ids for the Junk Status + cells. Each maps to icons/<id>.png. */
export const ICON_IDS = [
  "good",
  "goodbayes",
  "goodfilter",
  "goodflag",
  "gooduser",
  "goodwhite",
  "junk",
  "junkbayes",
  "junkfilter",
  "junkflag",
  "junkuser",
  "junkwhite",
  "unclassified",
];

// junkscoreorigin value -> icon suffix. Anything else uses the bare icon.
const ORIGIN_SUFFIX = {
  user: "user",
  plugin: "bayes",
  whitelist: "white",
  filter: "filter",
  imapflag: "flag",
};

// Alphabetical, so the numeric key keeps 0.2's string sort order (research R3).
const ORIGIN_ORDER = ["", "filter", "imapflag", "plugin", "user", "whitelist"];

// junkscore values, as nsIJunkMailPlugin.IS_SPAM_SCORE / IS_HAM_SCORE.
const SPAM_SCORE = "100";
const HAM_SCORE = "0";

/** Search bounds for the Uncertain folders: 10 to 90 inclusive. */
export const UNCERTAIN_BOUNDS = { greaterThan: 9, lessThan: 91 };

function isEmpty(value) {
  return value === null || value === undefined || value === "";
}

/** Text for the Junk % cell: the score, or "" when the message is unscored. */
export function displayPercent(junkpercent) {
  return isEmpty(junkpercent) ? "" : String(junkpercent);
}

/** Numeric sort key for Junk %: unscored sorts first, then by score. */
export function percentSortKey(junkpercent) {
  if (isEmpty(junkpercent)) {
    return 0;
  }
  return 1 + parseInt(junkpercent, 10);
}

/** The Junk Status + icon id for a message's verdict and origin. */
export function statusIconId(junkscore, origin) {
  let verdict;
  if (junkscore === SPAM_SCORE) {
    verdict = "junk";
  } else if (junkscore === HAM_SCORE) {
    verdict = "good";
  } else {
    return "unclassified";
  }
  return verdict + (ORIGIN_SUFFIX[origin] ?? "");
}

/** Numeric sort key for Junk Status +: verdict first, then origin. */
export function statusSortKey(junkscore, origin) {
  const verdictRank = junkscore === SPAM_SCORE ? 1 : 0;
  const originRank = Math.max(0, ORIGIN_ORDER.indexOf(origin ?? ""));
  return verdictRank * 100 + originRank;
}

/**
 * Whether first-run setup should happen (data-model §5).
 *
 * @param {object} state
 * @param {boolean} state.installedPref - extensions.junquilla.installed
 * @param {boolean} state.markerFound - a marked Uncertain folder exists
 * @returns {"skipped-installed"|"skipped-upgrade"|"ran"}
 */
export function firstRunDecision({ installedPref, markerFound }) {
  if (installedPref) {
    return "skipped-installed";
  }
  if (markerFound) {
    return "skipped-upgrade";
  }
  return "ran";
}
