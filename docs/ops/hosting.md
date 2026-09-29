# Hosting notes: what the stack does and does not need

Findings from setting up the Compose deployment on a rootless-podman host
(ADR-0010). They are here because each one answers a question every self-hoster
asks, and the answer is "nothing" — a job that never has anything to do is worse
than no job, because it looks like a safeguard that isn't one.

Deployment layout, the backup timer, and the restore procedure are in
[README's Deployment section](../../README.md#deployment) and
[restore.md](restore.md). This file is only about the things you should *not*
build.

## The WAL does not need a checkpoint job

The api sets `journal_mode = WAL` (`apps/server/src/db/database.ts`) and never
touches `wal_autocheckpoint`, so SQLite's default of 1000 pages applies. That is
enough: measured against a scratch database with the same pragmas, inserting
50,000 rows in 5,000-row batches grew the WAL to 4,420,792 bytes and then
**plateaued** while the main database kept growing (4 KB → 8.6 MB) —
auto-checkpoint firing at the threshold.

The WAL only runs away under a long-lived read snapshot, and the server holds one
connection with no long read transactions. A nightly `wal_checkpoint` timer would
be a job that never had anything to do.

## Logs do not need rotation config

The api and caddy containers log to **journald** (`LogConfig.Type` is `journald`),
and journald bounds and vacuums itself — on this project's host, 47.8 MB used
with a default `/etc/systemd/journald.conf` and 40 GB free on its filesystem.
Nothing to configure unless you want a tighter cap than the default.

## `restart: unless-stopped` is not a boot mechanism

All four services declare `restart: unless-stopped` in `docker-compose.yml`, and
that is enough to bring the stack back after a crash. It is **not** enough to
bring it back after a reboot, because podman is daemonless: there is no daemon to
restart, so nothing re-runs the compose file at boot. On a rootless-podman host
you need one of:

- **A user unit that runs `podman compose up -d --no-build` at boot.** Keeps
  `docker-compose.yml` the single definition and reconciles the running stack
  with the file on every boot. Needs `podman.socket` enabled
  (`systemctl --user enable --now podman.socket`) and `DOCKER_HOST` pointing at
  the podman socket — the same pair the backup unit already uses (see
  [restore.md](restore.md#installing-the-nightly-timer)).
- **`systemctl --user enable podman-restart.service`.** One command, no new file,
  and it honours the restart policy already in the compose file. What it does
  *not* do is reconcile with the compose file — it restores the containers as
  they were created, so a change to `docker-compose.yml` is not picked up.

Either way, `loginctl enable-linger` has to be on or the user manager is not
running at boot.

This is host configuration, not a project concern: which of the two you pick
depends on your machine's systemd setup and nothing else, and the published
images and `docker-compose.yml` are identical either way. The project's contract
stops at "the deployment is `podman compose pull && podman compose up -d
--no-build` from a checkout on this host".

## The published images are amd64 only

This is the one constraint on that contract rather than a host detail, and it is
the thing to fix before the move rather than after it.

Both application images are built in CI on an `ubuntu-latest` runner by
`docker/build-push-action` with no `platforms:` input
(`.github/workflows/images.yml`), so each publishes for the runner's own
architecture: **`linux/amd64` only**. The Umami image is built the same way
(`.github/workflows/umami-image.yml`, ADR-0012) and is `linux/amd64` for the
same reason. `ghcr.io/shrekbytes/perfectmarkd-{caddy,api}` and
`perfectmarkd-umami` are therefore all single-arch, while the `postgres:15-alpine`
dependency in `docker-compose.yml` is upstream's and is multi-arch.

Nothing is blocked today: this project's host is x86_64. The gap is with
ADR-0010's deferred move, which names a `t4g.micro` — AWS Graviton, arm64.
`podman compose pull` would fetch an image the host cannot execute and the api
would fail to start with an exec format error, which reads like a broken image
rather than a missing architecture.

The fix is a multi-arch build — `platforms: linux/amd64,linux/arm64` on the
buildx step, which the workflows already set up — or a rebuild on the new host.
**Neither is done.** Building both architectures on every push roughly doubles
the image build, so it is worth doing at the move rather than in advance; the
point of recording it here is that it is a decision to make on the day, not a
surprise to debug on the day.
