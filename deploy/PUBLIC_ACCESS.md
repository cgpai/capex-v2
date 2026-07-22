# CAPEX — Public exposure with IP allowlist

Expose CAPEX on a public IP/domain while restricting access to approved client IPs only.

## Allowed IPs (current)

| IP | Purpose |
|----|---------|
| `139.255.41.162` | Office / VPN |
| `118.137.76.95` | Developer device |

Verify your current public IP: `curl -s https://api.ipify.org`

## Layer 1 — nginx (recommended, VPS)

Use `deploy/nginx-capex-ip-allowlist.conf` inside the `server { }` block in front of `capex-web` and `capex-api`.

Health checks on the VPS itself should use localhost (bypasses nginx):

```bash
curl -fsS http://127.0.0.1:8082/health
curl -fsS http://127.0.0.1:8080/
```

## Layer 2 — Application (`IP_ALLOWLIST`)

Set on **both** `capex-web` and `capex-api` (runtime env, not build-arg):

```env
IP_ALLOWLIST=139.255.41.162,118.137.76.95
```

- Empty / unset → no IP restriction (local dev default).
- `127.0.0.1` / `::1` always allowed (container health, VPS localhost smoke tests).

## Local → public (demo on your machine)

1. Set in `capex-apps/.env.local` and `capexbe/.env`:
   ```env
   IP_ALLOWLIST=139.255.41.162,118.137.76.95
   ```
2. Bind BE to all interfaces (default `0.0.0.0:3001`).
3. Run FE with host binding: `npm run dev -- -H 0.0.0.0` (or production `npm start`).
4. Open router/firewall: forward public `:443` → your LAN machine, **or** use VPS nginx as reverse proxy.
5. Optional host firewall (macOS example — adjust interface):
   ```bash
   # Allow only the two IPs to ports 3000/3001 (Linux ufw similar)
   ```

## CI note

GitHub Actions public smoke test (`curl https://capex-api.cgp-ai.com/`) will **403** when IP allowlist is active. Keep localhost smoke on VPS (`127.0.0.1:8082`) or temporarily add the runner IP.

## Update allowlist

1. Edit `IP_ALLOWLIST` in VPS `.env` / compose.
2. Update `deploy/nginx-capex-ip-allowlist.conf`.
3. `docker compose up -d --force-recreate` + `sudo nginx -t && sudo systemctl reload nginx`.
