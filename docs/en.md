# Headscale

Follow the machines of your [Headscale](https://headscale.net) server in
Gladys: one device per machine (online or not, last seen, days before its key
expires, advertised and enabled routes), one "Headscale" device with the
machines online and in total, a dashboard widget, and scene triggers when a
machine goes offline, comes back, or when its key is about to expire.

Headscale is the open source, self-hosted control server compatible with the
Tailscale clients. This integration is for those who **host their own
Headscale server**; it does not read the Tailscale cloud service. It was tested
against real Headscale servers 0.22.3, 0.23.0, 0.26.1 and 0.29.5 in Docker,
with Tailscale clients registered and then stopped. Feedback welcome on the
[Gladys forum](https://community.gladysassistant.com) or in the
[issues](https://github.com/guim31/gladys-headscale/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A Headscale server, version 0.22 or later, reachable from Gladys: its public
  address (`server_url`) or its address and port on your network (8080 by
  default).
- An API key of this server. Gladys only reads: it changes nothing on
  Headscale.

## Set up

1. On the Headscale server, create an API key (see below) and copy it: it is
   shown only once.
2. In Gladys, install the integration, then open its **Configuration** screen.
3. **Server address**: the `server_url` of Headscale
   (`https://headscale.example.com`), or its IP address and port
   (`192.168.1.2:8080`). An address without `http://` or `https://` is read
   as http, port 8080 when none is given.
4. **API key**: the key created at step 1.
5. **Accept a self-signed certificate**: only for an https address whose
   certificate is not signed by a known authority.
6. **Users to follow**: Headscale user names, separated by commas. Empty: the
   machines of every user.
7. **Publish the IP addresses**: off by default. On, each machine gets an
   **IP addresses** feature with its tailnet addresses.
8. **Refresh interval**: 1 minute by default. Each reading costs one request
   (two before Headscale 0.26).
9. **Language of the names**: the language of the feature names and of the
   dates, French by default.
10. Save, then press **Test the connection**: it says how many machines are
    followed and online. The devices then appear in the **Discovery** tab of
    the integration: add the ones you want.

### The API key

On the Headscale server (or in its container):

```sh
headscale apikeys create --expiration 365d
```

Without `--expiration`, the key expires after 90 days, and Gladys then shows
"API key refused". `headscale apikeys list` lists the keys and their expiry,
`headscale apikeys expire --prefix <prefix>` revokes one. The key gives full
access to the Headscale API: keep it private. The integration only reads the
list of machines (and of routes before 0.26).

### Which address?

Gladys calls Headscale from its Docker container. If Headscale runs on the
same machine, give the address of the machine on your network, never
`127.0.0.1`. Behind a reverse proxy, the public `https://` address works too.

## The devices

**Headscale** (one device):

| Feature         | What it shows                         |
| --------------- | ------------------------------------- |
| Online machines | Machines connected to the server now  |
| Machines        | Machines followed (after user filter) |

**Each machine** (its name in Headscale, followed by `(Headscale)`):

| Feature           | What it shows                                                                  |
| ----------------- | ------------------------------------------------------------------------------ |
| Online            | Yes while the machine holds its connection to the server                       |
| Last seen         | When it went offline; while online, when it came online                        |
| Key expires in    | Days before the key of the machine expires, 0 once expired                     |
| Advertised routes | Subnet routes the machine announces (the exit node counts as one)              |
| Enabled routes    | Of these, the ones approved on the server                                      |
| IP addresses      | Its tailnet addresses, only with **Publish the IP addresses** (off by default) |

**Key expires in** only exists for a machine whose key expires: Headscale can
disable expiry per machine (`headscale nodes expire --disable` on recent
versions), and tagged machines often have none. If a key starts to expire
later, Gladys proposes **Update** in the Discovery tab. A machine that logs
out gets an expired key in Headscale: it shows 0.

A machine is identified by its Headscale ID: deleting it from Headscale and
registering it again creates a new device in Gladys.

## Dashboard

The **Headscale machines** widget shows the machines online and in total,
then one row per machine: the ones whose key expires within 7 days first (in
orange, in red once expired), then the online ones, then the others with the
time they were last seen.

## Scenes

### Triggers

- **Headscale machine offline**: a machine left the server (switched off, out
  of network, logged out).
- **Headscale machine back online**: a machine connected again.
- **Machine key about to expire**: the key of a machine expires in 30, 14, 7,
  3 or 1 day(s), or just expired. Its **Days left (empty: any)** filter keeps
  one of these steps.

Each trigger can be limited to one machine (**Machine (empty: any)**) or to
the machines of one user (**Headscale user (empty: any)**, the exact user
name). They give the variables **Machine name** and **Headscale user**, plus
**Days left** and **Expiry date** for the key. No event is sent at the first
reading after a start or a change of configuration, nor for a machine that
just appeared: the previous state is unknown. The steps of the key are seen
while the integration runs: a step crossed while it was stopped is not sent
afterwards.

### Scene ideas

- When the key of a machine expires in 7 days, send yourself a message with
  its **Machine name** and **Expiry date**, to renew it in time.
- When the remote NAS that keeps your backups goes offline, send a message.
- When the phone of a member of the family comes back online on the tailnet,
  in the evening, turn on the light of the entrance.

## Troubleshooting

- **"API key refused"**: the key was mistyped, revoked or expired (90 days by
  default): create a new one.
- **"Headscale does not answer"**: check the address and the port, and that
  Gladys can reach them (firewall, `127.0.0.1` from a container).
- **"Certificate refused"**: the https certificate is not signed by a known
  authority. If it is yours, turn on **Accept a self-signed certificate**.
- **"No Headscale API at this address"**: the address points to another
  service (the reverse proxy's login page, the metrics port…) or to a Headscale
  older than 0.22.
- **No machine in the Discovery tab**: press **Test the connection**; if it
  says no machine belongs to the users of the configuration, check the user
  names (or empty the field).

## Limits

- One Headscale server per installation of the integration.
- Read only: the integration does not approve routes, renew keys nor delete
  machines. That stays with the `headscale` command or your web interface.
- **Online** is what Headscale says: a machine counts online while its
  connection to the server is open, which says nothing about the traffic
  between machines.
- The **Machine key about to expire** steps are not stored: a step crossed
  while the integration was stopped is lost.
- Not affiliated with the Headscale project nor with Tailscale Inc. Tailscale
  is a trademark of Tailscale Inc.
