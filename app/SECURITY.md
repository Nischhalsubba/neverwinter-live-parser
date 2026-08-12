# Security Notes

## Current hardening

- `nodeIntegration` is disabled
- `contextIsolation` is enabled
- permission requests are denied
- webviews are blocked
- arbitrary navigation is blocked
- popup windows are denied
- automatic outbound web requests are blocked in the packaged runtime
- the app enforces a single running instance

## Data handling

- Neverwinter logs are read from local disk
- parser state stays local to the app
- error logs are stored locally in `.logs`

## Distribution note

Portable unsigned builds can still be flagged by Windows reputation or Smart App Control. That is a distribution trust issue, not a runtime parser permission issue. For public release, use proper Windows code signing.
