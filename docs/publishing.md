# Publishing Domain Notes

Publish reviewed project files and synthetic screenshots only. Do not publish the handoff PDFs, browser profiles, local backups, account details, or signing credentials.

## Verify and package

```console
npm run check
python scripts/package.py
npx --yes web-ext@10.7.0 lint --source-dir dist/amo --warnings-as-errors --boring
```

`scripts/package-files.json` lists every approved source and runtime file. The packager includes only that inventory, rejects paths outside the project and symbolic links, uses fixed ZIP metadata, and writes SHA-256 checksums. Review inventory additions before building. A passing scanner is one check, not a guarantee that code has no vulnerabilities.

The outputs are `dist/Domain_Notes_Firefox_AMO_v1.0.0.zip`, `dist/Domain_Notes_Firefox_Source_v1.0.0.zip`, and `dist/SHA256SUMS.txt`. The unpacked `dist/amo` directory is for official linting.

## Firefox acceptance checks

Use Firefox desktop 142 or newer with a fresh test profile and synthetic notes. Android compatibility is not declared for this release. Verify these before submission:

- Fresh install starts with no website grants and global display off.
- Popup offers site and all-sites enable actions. Site enable requests only the current registrable domain and its subdomains.
- Grant, deny, and revoke site and global access; the UI reflects Firefox's actual grants and denial never causes an automatic retry.
- Global off preserves explicitly shown, permitted sites. Always hide takes precedence over global display.
- Typing and editor shortcuts do not bubble to the website. Same-domain tabs synchronize; unrelated domains keep separate notes.
- Formatting, mixed English/Hebrew/Arabic text, direction, dragging, resizing, collapse, and layout reset survive reload.
- Export/import preserves notes and preferences, excludes internal tokens and permission grants, and rejects malformed or unsafe data.
- Restricted pages fail gracefully. After Mozilla signing, verify persistence across a real Firefox restart; a temporary development install disappears on restart.

## GitHub

Use the public maintainer handle and its GitHub noreply address for commits. Enable private vulnerability reporting, secret scanning, and push protection. Keep Actions permissions read-only. Check the initial CI run before marking a release ready.

## Mozilla Add-ons

Use the Developer Hub's **On this site** option. Upload the AMO runtime ZIP after the checks above. Review the public author identity; use a pseudonym and leave optional email and personal links blank. Mozilla still receives the private account information needed for its service.

Name: **Domain Notes**

Summary: **Persistent notes for website domains, with rich text, RTL/LTR support, themes, and local backups.**

Description:

> Keep a note for an entire website domain. Domain Notes adds a small, movable note button on sites you choose, with automatic saving, rich text, English/Hebrew/Arabic support, writing direction controls, Light/Dark themes, and local JSON backup and restore.
>
> Website access is optional. Enable one domain or explicitly enable all normal HTTP/HTTPS websites. Firefox's restricted pages are unavailable.
>
> Notes and preferences stay in Firefox's local extension storage. There are no accounts in the add-on, cloud services, analytics, telemetry, remote code, or background network requests. Opening a note link navigates to that website normally.
>
> Notes and backups are not encrypted by Domain Notes. Protect your device and exported files. Private Browsing is disabled.

Homepage/source: https://github.com/anti-charm/domain-notes-firefox

Support: https://github.com/anti-charm/domain-notes-firefox/issues

Privacy policy: https://github.com/anti-charm/domain-notes-firefox/blob/main/PRIVACY.md

Reviewer notes:

> Firefox Manifest V3. Required APIs: storage, scripting, activeTab. HTTP/HTTPS hosts are optional and requested only after an explicit action. The extension-origin editor iframe authenticates initialization with an internal random token. The page host handles geometry and lifecycle only; note content is never sent to the parent page. Notes use sanitized structured JSON; HTML paste becomes plain text. Backups exclude the internal token and Firefox grants. Only HTTP/HTTPS links are rendered. Private Browsing is disabled and data collection is declared as none. Runtime code is readable and has no dependencies, minification, transpilation, or obfuscation. Public Suffix List data retains its MPL-2.0 notice and license. The source archive includes the tests and reproducible packaging instructions.

After approval, add the verified AMO install URL to the README and repository homepage. Publish tag `v1.0.0` and a GitHub release with the Mozilla-signed XPI, reviewed source ZIP, and checksums. Do not describe an unsigned ZIP as a normal Firefox installation.
