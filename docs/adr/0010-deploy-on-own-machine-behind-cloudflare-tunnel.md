# Deploy on the Admin's own machine behind a Cloudflare Tunnel, not a VPS

Launch serves the Compose stack (caddy + api + umami) from the Admin's own
machine, published at the real domain through a Cloudflare Tunnel. `cloudflared`
opens an outbound connection to Cloudflare's edge, so the deployment needs no
port forwarding, no static IP, and no inbound firewall rules, and the Admin's
home IP is never exposed. TLS terminates at Cloudflare's edge, which leaves
Caddy on plain HTTP behind it — the Caddyfile's automatic ACME path stays
documented for a directly-exposed host but is unused here. The VPS move is
deferred, not rejected: the AWS Student-credit box considered on 2026-09-13
remains an option alongside a small Hetzner instance, and the launch/03
backup/restore flow is the migration path in either case.

Trade-offs accepted deliberately. The service is reachable only while the
machine is awake and online, so uptime is the Admin's home uptime rather than a
provider's SLA. Home upload bandwidth caps Server Export throughput and is the
first thing to break under real traffic. And every user request passes through
Cloudflare's edge — a third party in the transport path that the application
itself makes no requests to.

The Privacy page names that edge (corrected 2026-09-28, superseding the
no-transport-disclosure decision recorded here on 2026-09-24). Its "What is
never done" section says what Cloudflare is — a network provider relaying the
request, not an analytics or tracking service, and not used to measure anyone —
and that a Server Export payload rides the same path. The no-third-party claim
is scoped to what the app loads, which is true: a live audit of every public
route found same-origin requests only, fonts and analytics included. The
earlier reasoning for silence does not hold. "No page loads anything from
another company's server" is accurate about the app and misleading about the
deployment when a reader cannot see the tunnel that carries them, and a privacy
page whose value is that it is not misleading should not be the page that
misleads. This restores the requirement the 2026-09-24 edit superseded here,
and on the launch-chrome spec, that the page state the edge plainly.

Against all of that: zero server rent before there is revenue, and the machine
is already the dev/prod-parity environment where Chromium, the Compose stack,
and rootless podman have all been verified.

Revisit when availability expectations outgrow a home machine, when bandwidth
becomes the bottleneck rather than render time, or when a small VPS is trivially
covered by revenue.
