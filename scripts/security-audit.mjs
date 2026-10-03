import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));

assert(manifest.manifest_version === 3, 'manifest must use MV3');
assert(manifest.incognito === 'not_allowed', 'private-browsing access must be disabled');
assert(JSON.stringify(manifest.permissions) === JSON.stringify(['storage','scripting','activeTab']), 'API permissions exceed approved set');
assert(manifest.host_permissions === undefined, 'install-time host_permissions must not be present');
assert(JSON.stringify(manifest.optional_host_permissions) === JSON.stringify(['http://*/*','https://*/*']), 'optional host permissions differ from approved HTTP/HTTPS set');
assert(manifest.content_scripts === undefined, 'static all-site content scripts must not be present');
assert(manifest.browser_specific_settings?.gecko?.id === 'domain-notes@domainnotes-addon', 'unexpected permanent add-on ID');
assert(JSON.stringify(manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required) === JSON.stringify(['none']), 'data collection declaration must be none');
assert(manifest.content_security_policy?.extension_pages === "script-src 'self'; object-src 'none'; connect-src 'none'; img-src 'self'; media-src 'none'; frame-src 'none'; font-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none';", 'extension CSP is not the approved strict policy');

const resources = (manifest.web_accessible_resources || []).flatMap((entry) => entry.resources || []);
assert(JSON.stringify(resources) === JSON.stringify(['widget/widget.html']), 'only widget/widget.html may be web-accessible');

assert(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, 'runtime dependencies are not allowed');
assert(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0, 'unexpected development dependencies');

const runtimeDirs = ['background','content','options','popup','shared','widget'];
const files = [];
for (const dir of runtimeDirs) {
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:js|html)$/i.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(root, dir));
}

const dangerous = [
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\.innerHTML\s*=/, 'innerHTML assignment'],
  [/\.outerHTML\s*=/, 'outerHTML assignment'],
  [/insertAdjacentHTML\s*\(/, 'insertAdjacentHTML'],
  [/document\.write\s*\(/, 'document.write'],
  [/\bfetch\s*\(/, 'fetch() network call'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\s*\(/, 'WebSocket'],
  [/\bEventSource\s*\(/, 'EventSource'],
  [/sendBeacon\s*\(/, 'sendBeacon'],
  [/connectNative\s*\(/, 'native messaging'],
  [/externally_connectable/, 'externally_connectable']
];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  for (const [pattern, label] of dangerous) {
    if (pattern.test(source)) failures.push(`${rel}: prohibited ${label}`);
  }
  if (file.endsWith('.html')) {
    if (/<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//i.test(source)) failures.push(`${rel}: remote script source`);
    if (/<script\b(?![^>]*\bsrc=)[^>]*>\s*[^<\s]/i.test(source)) failures.push(`${rel}: inline executable script`);
  }
}

const backup = read('shared/backup.js');
assert(!/dn_internal/.test(backup), 'internal authentication state must not be exported by backup code');
const host = read('content/content.js');
assert(!/dn_notes|editorToDocument|renderDocument/.test(host), 'page host must not contain note/editor data logic');
const widget = read('widget/widget.js');
assert(/message\.auth !== auth/.test(widget), 'widget initialization must authenticate the page-host handshake');
assert(/event\.source !== parent/.test(widget), 'widget must reject non-parent init messages');

if (failures.length) {
  console.error(`Security audit failed (${failures.length} finding${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Security audit passed: ${files.length} runtime JS/HTML files checked, 0 findings.`);
