# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration keeps nothing in `/data`. The Headscale API key is stored by
Gladys in the integration configuration; it is sent only to the Headscale
address of the configuration, in the `Authorization` header, and never
written to the logs. The key gives full access to the Headscale API, but the
integration only reads (`GET` requests on the machines and routes). The
tailnet IP addresses of the machines are published to Gladys only when the
"Publish the IP addresses" option is on, and never written to the logs. The
"Accept a self-signed certificate" option turns off the certificate check for
this server only.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Headscale and the Tailscale clients.
