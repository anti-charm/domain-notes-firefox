# Security Policy

## Supported versions

Security fixes are provided for the current public release of Domain Notes. Users should update to the newest version available through Mozilla Add-ons.

## Reporting a vulnerability

Do **not** disclose suspected security vulnerabilities in a public GitHub issue.

Use GitHub's private [Report a vulnerability](https://github.com/anti-charm/domain-notes-firefox/security/advisories/new) workflow. The repository maintainer must enable private vulnerability reporting before the public launch.

Please include:

- affected Domain Notes version;
- Firefox version and operating system;
- reproduction steps;
- expected and observed behavior;
- security impact;
- proof-of-concept material when safe to provide privately.

Reports will be reviewed on a best-effort basis. Public disclosure should wait until a fix or mitigation is available and coordinated with the maintainer.

## Security design principles

- minimum necessary WebExtension permissions;
- optional website access requested at runtime;
- no remote code or telemetry;
- isolated extension-origin editor iframe;
- structured allow-listed note data instead of arbitrary HTML storage;
- untrusted backup validation/sanitization;
- strict extension CSP;
- no private-browsing support for persistent notes.

## Limits of protection

Local notes and backups are not encrypted. A compromised device or browser profile is outside the isolation boundary. A website controls the outer page and can hide, cover, move, or replace the iframe. Use the extension's note manager for sensitive work on untrusted pages.

Automated tests, static scanning, and Mozilla validation reduce risk; they do not establish that all vulnerabilities have been found.
