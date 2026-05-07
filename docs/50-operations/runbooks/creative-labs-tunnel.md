# Creative Labs tunnel

How the Robot Command and Beam Bot Playground tiles on `/admin` reach Eric's home-dashboard, and what to do when they fall back to the error panel.

## Architecture

```
Team browser                acceleraterobotics.ai (Render)        Eric's MacBook
────────────                ──────────────────────────────        ──────────────
GET /cl/?zone=command  ─►   requireAuthPage gate
                            reads system_settings.creative_labs_url
                            ───────────────────────────────────►  *.trycloudflare.com
                                                                  cloudflared (PM2)
                                                                  ─►  localhost:3100
                                                                      home-dashboard (PM2)
                            ◄───────────────────────────────────  response
◄── HTML response           (helmet CSP applied, upstream
                             X-Frame-Options stripped)
```

The proxy lives in [`src/routes/creative-labs-proxy.js`](../../../src/routes/creative-labs-proxy.js). The tunnel URL is stored in the SQLite `system_settings` table under key `creative_labs_url` and edited via the **System** tab at `/admin/settings`.

## PM2 services on Eric's MacBook

| name | what it runs | port |
|---|---|---|
| `creative-labs` | home-dashboard (`server.js` from `~/Code/home-dashboard`) | 3100 |
| `creative-labs-tunnel` | `cloudflared tunnel --url http://localhost:3100 --no-autoupdate` (quick tunnel) | n/a — outbound |

Both services have `autorestart: true`. `creative-labs` lifts from `~/Code/home-dashboard/ecosystem.config.js`. `creative-labs-tunnel` was started ad-hoc; PM2 holds the command and will replay it on `pm2 restart`.

To survive a MacBook reboot, run once:

```bash
pm2 save
pm2 startup    # prints a sudo command — run it
```

## When the tile shows "Creative Labs tunnel unreachable"

Most common cause: the cloudflared quick tunnel rotated its hostname (happens on `pm2 restart creative-labs-tunnel`, MacBook reboot, or upstream Cloudflare disconnect).

### 1. Get the current URL from the MacBook

```bash
pm2 logs creative-labs-tunnel --nostream --lines 100 \
  | grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" \
  | tail -1
```

If nothing comes back, the tunnel process isn't healthy:

```bash
pm2 list                            # status should be 'online'
pm2 restart creative-labs-tunnel    # then re-run the grep above
```

### 2. Paste the URL into Settings → System

1. Go to `https://acceleraterobotics.ai/admin/settings`.
2. Click the **System** tab.
3. Paste the URL into "Creative Labs Tunnel URL" and click **Save**.

The `/cl/*` proxy caches the URL for 30s but the PUT handler invalidates the cache immediately, so the next click on Robot Command picks up the new URL.

### 3. Verify

Reload `/admin` and click **Robot Command** — you should see the Keenon C30 Cleaning Robot dashboard. If it still shows the fallback panel, check:

- Is `creative-labs` (home-dashboard) online in `pm2 list`?
- Does `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/` return 200 on the MacBook itself?
- Does Render reach the tunnel? `curl -I https://<tunnel-url>/` from anywhere external — expect 200.

## When the tile shows "Creative Labs URL not configured"

The DB row is empty. Same fix as above, just step 2 — paste the URL into Settings → System.

## Why the proxy exists at all

Eric's home network DNS (Pi-hole / similar at `192.168.1.1`) blocks `*.trycloudflare.com`. Iframing the tunnel URL directly worked for everyone on other networks but failed for Eric and anyone visiting his office Wi-Fi. The `/cl/*` proxy lets Render fetch the tunnel URL server-side — Render's network has no DNS filter — and serves the response under `acceleraterobotics.ai`, so browsers never resolve `*.trycloudflare.com`.

## Why it's still a quick tunnel

A **named** Cloudflare tunnel + Cloudflare Access (email allowlist) is the right long-term setup — stable hostname, no rotation, gated by team email. We deferred it because the auth flow needs an interactive Cloudflare login from Eric (one browser-tab click). When he has 5 minutes, switch via:

1. `cloudflared tunnel login` → click Authorize on the `acceleraterobotics.ai` zone.
2. `cloudflared tunnel create creative-labs`
3. `cloudflared tunnel route dns creative-labs creative-labs.acceleraterobotics.ai`
4. Replace the PM2 `creative-labs-tunnel` command to point at the named tunnel.
5. Paste `https://creative-labs.acceleraterobotics.ai` into Settings → System once. It never rotates again.
6. Set up a Cloudflare Access policy on that hostname with the team email allowlist.

The architecture in [`creative-labs-proxy.js`](../../../src/routes/creative-labs-proxy.js) doesn't change.

## Related code

- [`src/routes/creative-labs-proxy.js`](../../../src/routes/creative-labs-proxy.js) — proxy + URL cache + cache invalidation export
- [`src/routes/system-settings.js`](../../../src/routes/system-settings.js) — admin GET/PUT for the URL
- [`src/server.js`](../../../src/server.js) — `app.use('/cl', requireAuthPage, creativeLabsProxy)` mount + CSP
- [`pages/robot-command-embed.html`](../../../pages/robot-command-embed.html) — iframes `/cl/?zone=command`
- [`pages/beam-feed-embed.html`](../../../pages/beam-feed-embed.html) — iframes `/cl/beam-feed.html`
- [`public/admin-settings.html`](../../../public/admin-settings.html) — System tab
