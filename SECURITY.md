# Security Policy

## Supported version

Security fixes are applied to the current `main` branch and to desktop artifacts produced from validated releases.

## Reporting a vulnerability

Do not open a public issue for suspected vulnerabilities, exposed credentials, unsafe Electron behavior, or privacy-sensitive findings.

Use GitHub's private vulnerability reporting feature when available. If private reporting is unavailable, contact the repository owner privately through the contact information on the GitHub profile.

Do not include real credentials, personal data, or destructive proof-of-concept material in a report.

## Repository security baseline

Maintained releases are expected to pass:

- lockfile-backed dependency installation and an npm audit with no accepted known vulnerabilities;
- CodeQL analysis for JavaScript and TypeScript;
- type checks, unit tests, production renderer/main-process builds, stress tests, responsiveness tests, and Windows packaging checks;
- least-privilege GitHub Actions permissions and immutable third-party Action pins;
- Node 24 LTS and a pinned npm major/minor toolchain;
- secret-free source control and environment-specific credentials stored outside the repository.

Electron-specific security settings and preload/main-process boundaries are treated as release-critical code. A passing automated scan reduces known risk but cannot prove that software is risk-free.
