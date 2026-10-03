# Release verification

Version 1.0.0 was checked on 2026-10-03 before publication.

- 90 automated tests passed, including concurrent saves, stale-editor conflicts, deletion/import invalidation, permission activation, domain grouping, formatting sanitization, backup validation, and message boundaries.
- The local security audit checked 18 runtime JavaScript/HTML files with zero findings.
- Mozilla web-ext 10.7.0 lint reported zero errors, notices, or warnings on the packaged runtime.
- An independent source review identified data-loss and startup defects; these were fixed and reviewed again with no remaining Critical or Important finding identified.
- Firefox desktop 157, in an isolated test profile, loaded the packaged runtime with zero website grants. Synthetic mixed English/Hebrew/Arabic notes saved successfully.
- Firefox's real optional-permission prompt was denied and then granted successfully. A synthetic local HTTP website received the widget; the outer page could not read its extension-origin document. Removing the grant removed the live widget. No extension script errors were reported.
- Runtime and source archives use fixed reviewed inventories, deterministic ZIP metadata, and SHA-256 checksums. Publication files exclude private handoff documents, browser profiles, notes/backups, credentials, and personal filesystem paths.

These checks reduce risk; they are not an absolute security guarantee. Android and persistence after installing a Mozilla-signed build have not been acceptance-tested. Temporary development installations disappear on browser restart. Notes and exported backups are unencrypted, and a hostile webpage can cover or imitate the floating UI; use the separate note manager for untrusted pages.
