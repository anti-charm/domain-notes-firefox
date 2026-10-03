# Privacy Policy - Domain Notes

**Effective date:** 2026-10-03

Domain Notes is designed to work locally in Firefox.

The developer cannot see your notes. Domain Notes does not encrypt its local storage or backups. People or software with access to your device, browser profile, or exported files may read them. Device backup or cloud-folder services may copy those files independently of this add-on.

## Data stored

Domain Notes stores the following on the user's device using Firefox `browser.storage.local`:

- note content and supported formatting;
- per-domain layout, visibility, and writing-direction preferences;
- global theme and accent preferences;
- an internal random authentication token used only to secure communication between the extension's page host and isolated editor iframe.

## Data transmitted

Domain Notes does **not** transmit user data to the developer or to any external service. It has no analytics, telemetry, advertising SDK, remote API, cloud account, remote JavaScript, or extension-initiated network requests.

## Website permissions

Website permissions are optional and requested only when the user enables Domain Notes on a site or globally. They are used to place the extension's launcher/editor host on permitted HTTP/HTTPS pages. Domain Notes does not use those permissions to collect browsing history or website content for transmission.

## JSON backup

Export is initiated by the user and creates a local JSON file containing notes and persistent user settings. The internal authentication token and Firefox permission grants are not exported. The backup file is plain JSON and is **not encrypted by Domain Notes**, so users should store it appropriately if their notes contain sensitive information. Import reads a file selected by the user and sanitizes its contents before storing them.

## Private browsing

Domain Notes is disabled in Private Browsing because its purpose is to save persistent notes.

## External links

HTTP/HTTPS links written into notes can be opened by the user. Opening a link is normal browser navigation to that destination; Domain Notes does not proxy or monitor the request.

## Website interaction

The editor uses an extension-origin iframe so ordinary website scripts cannot directly read its document or receive its keyboard events. A hostile website can still hide, move, cover, or replace the on-page UI. Open the note manager from Firefox's extension controls when the page is untrusted; no add-on can guarantee privacy on a compromised device.

## Removal

Removing the extension causes Firefox to remove its extension storage according to Firefox's extension-data behavior. A launcher already present in an open webpage may remain visually until that page is refreshed because extension code can no longer run after removal.

## Contact and security reports

For security vulnerabilities, use the private vulnerability-reporting mechanism in the project's GitHub repository rather than a public issue.
