# Changelog

## 1.1.3

- Added the Obsidian community plugin ESLint ruleset and a `npm run lint` check.
- Removed inline source maps from the production bundle.
- Removed bundled `image-type` and Node-oriented path/stream/buffer usage from runtime code.
- Replaced Node/browser APIs flagged by Obsidian review with Obsidian-safe alternatives where applicable.
- Kept the remote-image upload fixes from 1.1.2, including duplicate skipping, format normalization, progress notices, and failed temporary-file cleanup.
