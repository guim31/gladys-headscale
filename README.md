# Headscale for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration for
[Headscale](https://headscale.net), the open source, self-hosted control
server for Tailscale clients: the machines of your tailnet, online or not,
right in Gladys. It is meant for those who **host their own Headscale server**;
it does not read the Tailscale cloud service.

## Features

- **One device per machine**: online, last seen, days before its key expires
  (for machines whose key expires), advertised and enabled routes, and its
  tailnet IP addresses when the configuration allows it (off by default).
- **One "Headscale" device**: online machines, machines.
- **Dashboard widget** _Headscale machines_: keys that expire within 7 days
  first, then who is online, then when the others were last seen.
- **Scene triggers**: _Headscale machine offline_, _Headscale machine back
  online_, _Machine key about to expire_ (30, 14, 7, 3, 1 day(s) or expired),
  for one machine, one user or any.
- Machines of every user, or of some users only.
- Read only: Gladys changes nothing on Headscale.
- Four languages: English, French, German, Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- Headscale 0.22 or later, reachable from Gladys (its `server_url`, or its
  address and port, 8080 by default).
- An API key: `headscale apikeys create --expiration 365d` (90 days without
  `--expiration`).

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-headscale`.
2. In the **Configuration** screen, enter the server address and the API key,
   then **Test the connection**.
3. In the **Discovery** tab, add the machines to follow.

The full documentation, shown by Gladys, is in [`docs/`](docs/en.md)
([fr](docs/fr.md), [de](docs/de.md), [es](docs/es.md)).

## How it works

- REST API `/api/v1`, `Authorization: Bearer <API key>`, read only.
- **0.23 and later**: `GET /api/v1/node`. **0.22**: `GET /api/v1/machine` (the
  client falls back to it on a 404 and remembers it).
- **Routes**: carried by the node since 0.26 (`availableRoutes`,
  `approvedRoutes`); before, `GET /api/v1/routes` (`advertised`, `enabled`).
  The exit node (`0.0.0.0/0` and `::/0`) counts as one route.
- **Online** is the `online` flag of Headscale (the machine holds its
  connection to the server). **Key expiry**: `expiry` null or `0001-01-01`
  means the key never expires; a logged out machine gets a past date (its
  logout time, or `1970-01-01T00:02:03Z`, the sentinel of the Tailscale
  client): expired.
- The API is read every 30 s to 5 min (1 min by default), on the integration's
  own timer: the devices are published with `should_poll: false`. Nothing is
  written to `/data`. The tailnet addresses never reach the logs.

## Checked on real servers

Run in Docker, on a dedicated bridge network, with no port published:
Headscale **0.22.3**, **0.23.0**, **0.26.1** and **0.29.5**
(`headscale/headscale`), each with users, an API key, and Tailscale clients
(`tailscale/tailscale`, userspace networking) registered with a pre-auth key,
one advertising a subnet route and an exit node, then stopped to go offline.
The answers are recorded, keys anonymized, in `test/fixtures/headscale/`. The
integration image ran under the constraints of the Gladys sandbox (read-only
root, no capability, 256 MB) against Headscale 0.29.5: reading, routes, a
machine going offline, a refused API key, a wrong address. A real Gladys
instance was not used (the tests use the fake Gladys of the SDK).

## Limitations

- One Headscale server per installation.
- Read only: no route approval, key renewal or machine deletion.
- The steps of _Machine key about to expire_ are seen while the integration
  runs: a step crossed while it was stopped is not sent afterwards.
- A machine is identified by its Headscale ID: deleted and registered again, it
  is a new device in Gladys.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Headscale (`test/helpers/fakeHeadscale.js`) built from the
fixtures. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Headscale](https://github.com/juanfont/headscale) (BSD-3-Clause), by Juan
  Font and its contributors: this integration only talks to its REST API; no
  code was copied. The API model comes from its OpenAPI files
  (`gen/openapiv2`).
- The cover shows the official Headscale logo, from
  [`docs/assets/logo`](https://github.com/juanfont/headscale/tree/main/docs/assets/logo)
  of the Headscale repository (BSD-3-Clause).
- The architecture and the conformity tests follow
  [gladys-zerotier](https://github.com/guim31/gladys-zerotier) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the Headscale
project or Tailscale Inc. "Tailscale" is a trademark of Tailscale Inc.

## License

Apache-2.0
