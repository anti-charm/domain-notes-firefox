# Changelog

## 1.0.0 - 2026-10-03

First publishable release candidate.

### Added
- Persistent per-domain notes.
- Rich-text formatting, colors, fonts, sizes, and bullet lists.
- English, Hebrew, Arabic, and RTL/LTR support.
- Per-site layout and visibility controls.
- Light/Dark themes and accent colors.
- Cross-tab synchronization.
- Complete JSON backup/restore.
- Extension-origin iframe isolation for the editor.
- Runtime optional host permissions for per-domain or global website access.
- Reproducible local security audit.
- Explicit current-domain and all-sites permission actions, with grant/revocation status.
- Clean, reproducible runtime/source packaging and Windows/Linux CI.

### Fixed
- Permission requests retain the originating click's activation in Firefox.
- The security audit resolves Windows paths and spaces correctly.
- Minimum Firefox versions match the built-in no-data-collection declaration.
- Concurrent writes preserve notes and site preferences; stale editors cannot overwrite newer content, deletions, or imports.
- Dirty editor timers are drained or canceled before rerendering, deleting, or importing.
- Per-site registrations use collision-free IDs; authentication initializes once across tabs.
- Revoking website access removes existing widgets and refreshes permission controls.

### Security
- No install-time all-sites host permission.
- Private browsing disabled.
- Strict CSP; no remote code, telemetry, or extension-initiated network requests.
- Imported data sanitized and prototype-pollution keys rejected.
- Paste and drop accept plain text; resource CSP blocks extension network connections and external images.
