# Contributing

Use issues for ordinary bugs and feature requests. For vulnerabilities, use [private reporting](https://github.com/anti-charm/domain-notes-firefox/security/advisories/new).

Please use synthetic notes and example domains in reports and screenshots. Do not attach your browser profile, exported notes, passwords, or account details.

## Local checks

Node.js 22 or newer runs the tests and security audit without installing packages:

```console
node --test tests/*.test.js
node scripts/security-audit.mjs
```

With npm available, `npm run check` runs both. Python 3.10 or newer is needed only to create release ZIPs:

```console
python scripts/package.py
npx --yes web-ext@10.7.0 lint --source-dir dist/amo --warnings-as-errors --boring
```

Load `manifest.json` through Firefox's `about:debugging` for development. Use a fresh test profile with harmless sample notes. Temporary add-ons disappear when Firefox restarts.

Preserve optional website access, local storage, the isolated editor, safe structured notes, and the absence of runtime dependencies or network code. Add behavior tests for changes to permission handling, imports, or security boundaries. Include the relevant checks and Firefox version in pull requests.
