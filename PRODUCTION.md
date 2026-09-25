# Production checklist — what to do next

Ordered. Each step says who does it and how you'll know it's done. Steps marked
**[AI]** have a pasteable prompt at the bottom of that step.

Nothing here is a code change unless it says so. The app is feature-complete:
all six workstreams are `resolved`, the unit suite is green at 1,592 tests, and
`typecheck` and `lint` pass. What remains is your machine, a few real-money
tests, and a decision about AI.

**Two things to decide before you start**, because they change the shape of
everything after:

- **Do you want AI Actions live at launch?** If you don't have an `AI_API_KEY`
  to hand, skip step 5 entirely — the feature is absent by design when no key
  is configured, no upsell appears, and nothing breaks. Do not let it hold up
  the launch.
- **Do you want backups on?** `BACKUP_ENABLED` defaults to `0`. With it off
  there is no recovery path at all. Turning it on is one variable in step 7.

---

## 1. Create the deployment checkout

The stack is pulled from GHCR, but the _compose file and `.env`_ have to exist
on the host. Right now the repo only exists at `~/Documents/GitHub/perfectMarkD`;
the deployment expects `~/self-hosted/perfectmarkd`.

```sh
mkdir -p ~/self-hosted
git clone <your-remote> ~/self-hosted/perfectmarkd
cd ~/self-hosted/perfectmarkd
cp .env.example .env
```

Then fill in `.env`. Minimum viable:

| Key                                     | Value                                                             |
| --------------------------------------- | ----------------------------------------------------------------- |
| `SESSION_SECRET`                        | anything long and random                                          |
| `HISTORY_ENCRYPTION_KEY`                | anything long and random — **without it the API refuses to boot** |
| `ADMIN_EMAIL`                           | your email; the first account registered with it becomes Admin    |
| `SITE_ADDRESS`                          | `:80` — the tunnel terminates TLS, Caddy stays plain HTTP         |
| `UMAMI_DB_PASSWORD`, `UMAMI_APP_SECRET` | anything random                                                   |
| `EXPORT_CONCURRENCY`                    | `1` — see the note below                                          |
| `CADDY_HTTP_PORT`                       | `8901` — nginx already holds `:80` on this machine                |
| `BACKUP_ENABLED`                        | `0` for now                                                       |

Generate secrets with something like `openssl rand -hex 32`.

> **`EXPORT_CONCURRENCY=1`, not the default 2.** Each Server Export is a full
> headless Chromium process. This machine has 7.5 GB RAM with ~2.3 GB free and
> swap already at 4.9 GB, so two concurrent renders is how the api gets
> OOM-killed. Two headless Chromiums on a laptop is the ceiling, not the goal.

**Done when:** `~/self-hosted/perfectmarkd/.env` exists with the five required
keys filled, and `git -C ~/self-hosted/perfectmarkd status` is clean.

---

## 2. Bring the stack up

```sh
cd ~/self-hosted/perfectmarkd
systemctl --user enable --now podman.socket   # step zero; see docs/ops/hosting.md
podman compose pull
podman compose up -d --no-build
```

Nothing is built on this machine — both app images come from GHCR.

Check it:

```sh
podman compose ps                    # all four healthy
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8901/healthz   # 200
```

**Done when:** `api`, `caddy`, `umami`, `umami-db` are all up, and `/healthz`,
`/`, and `/pricing` each answer `200` on port 8901.

**If the api won't start,** read the actual error — don't retry blindly:

```sh
podman compose logs api --tail 50
```

A refusal mentioning a missing key means `.env` is incomplete. The API will not
boot without `HISTORY_ENCRYPTION_KEY`; that is deliberate.

---

## 3. Register the Admin and smoke-test locally

Open `http://localhost:8901` and register with your `ADMIN_EMAIL`. That account
gets the Admin flag. Then confirm `/admin` opens and shows the four tabs.

While you're in there, check the paid gates behave: export a document with
Client Export (the print dialog — free, no account needed), and confirm the
Inspector shows locks on the paid rows for a free account.

**Done when:** you're logged in as Admin, `/admin` renders, and Client Export
opens the browser's print dialog with a correctly paginated preview.

---

## 4. Set up the Cloudflare Tunnel — **yours alone, no AI**

This is deliberately not delegated. In the Cloudflare dashboard:

1. Create a Tunnel (already have `cloudflared` on this machine for other
   services — reuse or create a new one, your call).
2. Add a public hostname: `perfectmarkd.00022000.xyz` → `http://localhost:8901`.
3. Point DNS at the tunnel. The hostname does not exist yet.

Then, from this machine:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://perfectmarkd.00022000.xyz/
```

**Done when:** `https://perfectmarkd.00022000.xyz` serves the app over HTTPS.

> The tunnel is outbound-only: no port forwarding, no static IP, no inbound
> firewall rules. Your home IP is never exposed. See ADR-0010.

---

## 5. AI Actions — optional, and skippable

**Skip this whole step if you don't have a provider key.** The feature is absent
until one is configured, which is the designed behaviour, not a broken state.

If you do want it, six items — the full list with rationale is in
`.scratch/launch/issues/06-launch-checklist.md`:

1. Put `AI_API_KEY` in `~/self-hosted/perfectmarkd/.env`. **Never in the
   settings table, never in a tracked file, never in a log** (ADR-0008).
2. `podman compose up -d api` to restart and pick up the key. Rotating the key
   is also a restart.
3. `/admin` → Settings → AI provider: set the base URL, model id, and reasoning
   effort. An OpenAI-compatible endpoint is all that's needed; OpenRouter is
   the default root.
4. Size the caps to the model's actual window, using Test connection's reported
   numbers as the reference. A mismatch is a warning, not a silent correction.
5. Run **Test connection** and read the published context length, output cap,
   and price it reports.
6. Decide the kill switch deliberately — on or off — and confirm the panel's
   worst-case-cost readout against the plan's monthly AI allowance.

Then confirm the copy still matches: the Privacy page's AI section and the
Cloudflare disclosure (both landed in `4b2bd64`).

**Done when:** `/ai` and `/ss` work in the editor for an entitled account, or
the commands are correctly absent.

---

## 6. Run the browser and boundary matrix

Real browsers, against the public URL this time, not localhost.

```sh
pnpm --filter @perfectmarkd/web test:e2e
```

That suite drives the production bundle in Chromium. Then by hand, in
**Chrome, Edge, Firefox, and Safari**:

- [ ] Preview renders, paginated, with page numbers
- [ ] Client Export → print dialog → _Save as PDF_ produces matching geometry
- [ ] Server Export completes end-to-end and lands in Export History (Premium)
- [ ] Firefox and Safari print correctly — if `@page` is off, the app already
      shows a "best results in Chrome" notice; confirm it appears

Boundaries:

- [ ] A payload near 50 MB is accepted
- [ ] A document over the page cap (300 Pro / 1000 Premium) is refused with the
      right message, not a crash
- [ ] Empty and error states render

**Done when:** all four browsers pass and no boundary case errors.

---

## 7. Backups — decide, then enable

**The Admin's machine has no backup remote configured**, so local-only is the
current state and that's a legitimate answer. Local-only still covers "I deleted
the wrong thing"; it does not cover losing the machine.

```sh
# install the timer (user unit — rootless podman)
mkdir -p ~/.config/systemd/user
cp ops/perfectmarkd-backup.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now perfectmarkd-backup.timer
systemctl --user list-timers perfectmarkd-backup.timer
```

Then set `BACKUP_ENABLED=1` in `.env` and run it once by hand to watch it work:
`ops/backup.sh`. You should see a `SQLite format 3` dump with `quick_check ok`
and a staged history mirror.

> **What backups deliberately miss:** the `umami-db-data` volume. There's no
> `pg_dump` — analytics history is regenerable, so it's not covered. Your SQLite
> database and Export History _are_. Details in `docs/ops/admin.md`.

**Done when:** the timer is listed, and one manual run produced a verified dump.

---

## 8. Survive a reboot

Nothing currently starts this stack at boot. `restart: unless-stopped` survives
a crash, not a reboot — podman is daemonless, so nothing re-runs the compose
file.

The two options are written up in `docs/ops/hosting.md`. The one-command version:

```sh
systemctl --user enable podman-restart.service
```

It honours the restart policy already in the compose file. The other option is a
user unit running `podman compose up -d --no-build` at boot, which additionally
reconciles with the compose file. Either is fine; the second is better if you
expect to edit `docker-compose.yml` on the host.

Also **disable sleep** — this is a laptop, and a sleeping machine is a down
service. Then reboot and confirm it comes back.

**Done when:** after a reboot, all four containers are up with no manual action.

---

## 9. The real-money test

Nothing above proves the payment path works, because nothing above sends
crypto. This step does, and it costs a few dollars.

1. Register a second account (a real one, not the Admin).
2. Pick Pro, 1 month, create the Order. Note the **reference code** and the
   exact amount and wallet shown.
3. Send the funds yourself, on the network stated.
4. Submit the txid.
5. In `/admin` → Verification: confirm the amount matches exactly, the
   transaction is confirmed, and the sender is plausible. Then **Verify &
   grant**.
6. Confirm the gates opened: Server Export, custom page size, Custom
   Stylesheet, custom fonts, AI Actions.
7. **Test expiry:** grant a 1-month plan, then set a custom expiry date in the
   past via the dialog, and confirm the gates re-lock and a clear notice
   appears. Settings must survive — gated, not wiped.
8. **Test reject:** create another Order, submit a deliberately wrong amount,
   reject it with a reason, and confirm the user sees the reason and can
   resubmit.

**Done when:** the full Order → Verification → gates → expiry → re-lock cycle
works, in both directions.

---

## 10. Final audits

- [ ] **Third-party request audit** — open the public site with DevTools →
      Network, exercise every surface, and confirm the only non-origin requests
      are the AI provider call _after_ you submit. Cloudflare's edge is
      infrastructure in the path and is disclosed as such. Anything else is a
      bug.
- [ ] **No content on disk** — export a document with a recognisable string in
      it, then `grep` the SQLite dump and the history directory. Server Export
      payloads must not be there.
- [ ] **No content in logs** — `podman compose logs | grep <that string>`.
- [ ] **AGPL source offer** — `LICENSE` is present, README says AGPL-3.0, and
      the self-host instructions work. Already true; confirm.
- [ ] **Docs accurate** — the Privacy page matches reality (it should, after
      `4b2bd64`); the runbooks in `docs/ops/` match what the panel does.
- [ ] **Full pipeline green** — `pnpm lint && pnpm typecheck && pnpm test`,
      plus `pnpm --filter @perfectmarkd/core test:golden` and
      `pnpm --filter @perfectmarkd/web test:e2e`.

---

## 11. Announce

Only after 10 is all-green. Drafts for Show HN, the Obsidian community, and
r/Markdown. The pitch is the AGPL angle plus the print-exact promise: preview,
client print, and server PDF are pixel-identical by construction, so what you
see is what the PDF is.

---

## If you want AI to help with a step

**[AI] Step 2 — bring up the stack and diagnose**

```
Read ~/self-hosted/perfectmarkd/docker-compose.yml and docs/ops/hosting.md, then
run `podman compose pull && podman compose up -d --no-build` and report what came
up. If any container is not healthy, run `podman compose logs <service> --tail 50`
and tell me the actual error — do not retry or work around it. Then curl /healthz,
/ and /pricing on port 8901 and report the status codes. Do not modify any file;
if something needs changing, tell me what and why.
```

**[AI] Step 7 — install and verify backups**

```
In ~/self-hosted/perfectmarkd, read ops/backup.sh, ops/perfectmarkd-backup.service,
and docs/ops/restore.md. Install the timer as a user unit per restore.md, set
BACKUP_ENABLED=1, and run ops/backup.sh once by hand. Report the exit code, whether
PRAGMA quick_check reported ok, and the size of the dump. Then set the timer back
to a sane state and tell me exactly what you changed. Do not configure a backup
remote — there isn't one.
```

**[AI] Step 10 — the log and disk content audit**

```
Using this repo's test tooling, write a throwaway script that exports a document
containing a unique marker string, then greps the SQLite database and the
/api-data history directory for that marker, and greps the container logs for it.
Report whether the marker appears in any of the three. Delete the throwaway script
and the test document afterwards. Do not modify app code.
```

**[AI] Anything about the code itself** — there is nothing left to build. If you
find yourself wanting to change app behaviour, the answer is almost certainly a
new ticket under `.scratch/`, not a drive-by edit.
