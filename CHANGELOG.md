# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-20

### Added

- The machines of your self-hosted Headscale server in Gladys (Headscale 0.22
  or later, an API key, read only).
- One device per machine: online, last seen, days before its key expires,
  advertised and enabled routes, and its IP addresses when the configuration
  allows it (off by default).
- One "Headscale" device: online machines, machines.
- Scene triggers: a machine goes offline, comes back online, its key expires
  in 30, 14, 7, 3 or 1 day(s) or just expired; for one machine, one user or
  any.
- A dashboard widget: keys about to expire, who is online, when the others
  were last seen.
- A choice of users to follow, a refresh interval from 30 seconds to 5
  minutes, a self-signed certificate accepted on request.
- Feature names, messages, widget and documentation in English, French, German
  and Spanish.

[Unreleased]: https://github.com/guim31/gladys-headscale/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-headscale/releases/tag/v1.0.0
