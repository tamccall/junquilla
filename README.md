# JunQuilla

Junk mail management for Thunderbird. JunQuilla was written by **R Kent James** (Mesquilla) for Thunderbird 3; version 1.0 ports it to Thunderbird 140 ESR with the same features.

## Features

1. **Junk %** column: the adaptive filter's junk score (0–100) for each message, sortable, blank for unscored messages.
2. **Junk Status +** column: an icon showing the verdict (good, junk, unclassified) and who made it (you, the adaptive filter, a message filter, a server flag, the address book). Sorts by verdict, then source. Click a cell to toggle junk, exactly like Thunderbird's own Junk column.
3. Both columns are hidden in newsgroups.
4. **Uncertain** folders: a saved search under each Inbox listing messages scored 10–90, shown with counts and a distinct icon. Add or remove them from the options page.
5. **Junk Analysis Detail**: from the Message menu or the message list's right-click menu, a window listing the tokens the filter used for the first selected message.
6. Options for the filter's maximum token count and junk threshold. On first install, JunQuilla creates the Uncertain folders, raises the maximum token count to 300000 (unless you changed it) and stops "not junk" from marking messages unread. Upgrades from 0.2 are detected and left alone.

## Supported version

Thunderbird **140 ESR** only.

## Install

Download or build `junquilla-<version>.xpi`, then in Thunderbird open *Add-ons and Themes*, click the gear menu, choose *Install Add-on From File…*, and pick the file.

## Build

Requires Node.js 20 or newer and `zip`.

```bash
npm install          # addons-linter, for npm run lint
npm test && npm run build
npm run lint         # addons-linter on dist/junquilla-<version>.xpi
npm run check        # no minified or remote code, every Experiment documented
```

`src/` is packaged as-is into `dist/junquilla-<version>.xpi`; nothing is minified or transpiled.

JunQuilla uses Experiment APIs for the parts Thunderbird has no MailExtension API for. See [EXPERIMENTS.md](EXPERIMENTS.md).

## License

GPL-3.0 or later. See [src/LICENSE](src/LICENSE).
