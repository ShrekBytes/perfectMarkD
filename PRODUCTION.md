# Production checklist — what to do next

Ordered. Each step says who does it and how you'll know it's done. Steps marked
**[AI]** have a pasteable prompt at the bottom of that step.

Nothing here is a code change unless it says so. The app is feature-complete:
all six workstreams are `resolved`, the unit suite is green at 1,592 tests, and
`typecheck` and `lint` pass. What remains is your machine and a few real-money
tests.

**One decision to make before you start**, because it changes the shape of
everything after:

- **AI Actions are live at this launch.** You have a provider key, so step 5 is
  a real step with its own checklist, not something to defer. Nothing else in
  this list substitutes for it.
- **Do you want backups on?** `BACKUP_ENABLED` defaults to `0`. With it off
  there is no recovery path at all. Turning it on is one variable in step 7.

(If you later want a launch _without_ AI: unset `AI_API_KEY`, and the commands
simply do not exist for anyone — no upsell, nothing broken. The code supports
that; this launch doesn't use it.)

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

Then fill in `.env`. `.env.example` documents every key — these are the ones
that need a decision rather than a random string.

**Four are mandatory.** Compose refuses to start without them, each with an
error naming the key, so a missing one is never silent. Generate all four:

```sh
for k in SESSION_SECRET HISTORY_ENCRYPTION_KEY UMAMI_APP_SECRET \
         UMAMI_DB_PASSWORD; do echo "$k=$(openssl rand -hex 32)"; done
```

| Key                                     | Value                                                          |
| --------------------------------------- | -------------------------------------------------------------- |
| `SESSION_SECRET`                        | from the loop above                                            |
| `HISTORY_ENCRYPTION_KEY`                | from the loop — **without it the API refuses to boot**         |
| `UMAMI_DB_PASSWORD`, `UMAMI_APP_SECRET` | from the loop                                                  |
| `ADMIN_EMAIL`                           | your email; the first account registered with it becomes Admin |
| `AI_API_KEY`                            | your provider key — step 5 needs it                            |
| `SITE_ADDRESS`                          | `:80` — the tunnel terminates TLS, Caddy stays plain HTTP      |
| `EXPORT_CONCURRENCY`                    | `1` — see the note below                                       |
| `CADDY_HTTP_PORT`                       | `8901` — nginx already holds `:80` on this machine             |
| `BACKUP_ENABLED`                        | `0` for now                                                    |

> **Reusing an old `api-data` volume?** You must reuse that volume's
> `HISTORY_ENCRYPTION_KEY`, or its Export History stays undecryptable forever
> (every download fails the GCM tag check). Starting from a clean volume, which
> is acceptable here, fresh keys are correct.

> **`EXPORT_CONCURRENCY=1`, not the default 2.** Each Server Export is a full
> headless Chromium process. This machine has 7.5 GB RAM with ~2.3 GB free and
> swap already at 4.9 GB, so two concurrent renders is how the api gets
> OOM-killed. Two headless Chromiums on a laptop is the ceiling, not the goal.

**Done when:** `~/self-hosted/perfectmarkd/.env` exists with the four mandatory
keys plus `ADMIN_EMAIL` and `AI_API_KEY` filled, and
`git -C ~/self-hosted/perfectmarkd status` is clean.

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

## 5. AI Actions — configure and verify

Two halves, and the feature stays absent until **both** are in place: the key in
the environment, the provider config in the database. That split is deliberate
(ADR-0008) — the key never enters the settings table or a backup, while the
model can be changed without a redeploy.

1. `AI_API_KEY` should already be in `.env` from step 1. Confirm it's there and
   **not** in the settings table, a tracked file, or a log.
2. Restart the api to pick it up — the key is read at startup:
   `podman compose up -d api`. Rotating the key is also a restart.
3. `/admin` → **Settings** → AI provider. Set:
   - the **base URL** — any OpenAI-compatible endpoint; OpenRouter's API root is
     the default
   - the **model id** — pick it with the cost arithmetic in mind, because you
     pay per call
   - the **reasoning effort** — `off` / `low` / `medium` / `high`, default
     `medium`. Temperature is deliberately not configurable.
   - the **caps**: context window, max output tokens, max input characters.
     Size them to the model rather than guessing.
4. Set the **enabled flag** on. Without it, no AI surface exists for anyone and
   no upsell appears.
5. Run **Test connection.** Read what it reports: the model's published context
   length, max completion tokens, and price per million input/output tokens when
   the provider exposes them. A model the endpoint doesn't know fails here
   rather than for the first user. A mismatch between the provider's numbers and
   your caps is a **warning, not a silent correction** — read it.
6. Check the **worst-case cost of one AI Action** against the plan's monthly AI
   allowance (Pro 100, Premium 300). A pricey model should be a decision you
   made, not a surprise. The price shows as unknown if the provider didn't
   publish one.
7. Optionally set a **cheaper model for stylesheet edits** — they're short, so
   a smaller model can serve `/ss` while the main model handles markdown.
8. Confirm the **per-plan allowances** in the Limits section are what you intend
   to sell. Zero is legal and disables AI for that plan.

Then verify the copy still matches reality: the Privacy page's AI section and
its Cloudflare disclosure (landed in `4b2bd64`).

**Done when:**

- [ ] `/ai` in the editor opens the popup for an entitled account; `/ss` opens
      the same popup for the stylesheet
- [ ] An accepted proposal edits the Document as one undoable step
- [ ] The account page shows AI Actions remaining next to the export Quota
- [ ] `/admin` → Audit log shows the config change
- [ ] The kill switch behaves: turn it off, confirm the commands disappear
      entirely, turn it back on

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
