# CAPEX via Cursor Tunnel (Port Forward)

Expose local CAPEX tanpa router port-forward — pakai **Cursor Ports** + Microsoft dev tunnels.

## Prasyarat

- `make run` — FE `:3000`, BE `:3001` (BE cukup localhost, BFF proxy otomatis)
- Login GitHub/Microsoft di Cursor (untuk tunnel auth)

> **Penting:** `cursor tunnel user show` harus **logged in**. Kalau belum:
> ```bash
> cursor tunnel user login
> ```
> Tanpa login, port forward Cursor akan timeout / "site can't be reached".

## Alternatif cepat (cloudflared)

Jika Cursor tunnel bermasalah:
```bash
make run          # terminal 1
make tunnel-cf      # terminal 2 — prints https://....trycloudflare.com
```

## WebSocket error (`WebSocket connection to ws://... failed`)

Normal saat pakai **`make run` (dev)** + tunnel HTTPS. Penyebab: Next.js HMR coba connect `ws://localhost:3000` dari browser tunnel.

**Fix (pilih satu):**

```bash
# A — Recommended: production + tunnel (no WebSocket)
make run-tunnel-demo

# B — Dev tanpa HMR
make run-tunnel    # terminal 1
make tunnel-cf     # terminal 2
```

Error HMR **tidak** memblokir login/API — tapi console penuh error. Pakai opsi A/B untuk demo bersih.

1. **Start app**
   ```bash
   make run
   ```

2. **Forward port di Cursor**
   - Buka panel **Ports** (tab bawah, atau `View → Ports`)
   - Klik **Forward a Port**
   - Masukkan `3000`
   - Klik kanan port → **Port Visibility → Public**
   - Copy URL yang muncul, contoh:
     `https://xxxx-3000.inc1.devtunnels.ms`

3. **Bagikan URL tunnel** ke device yang diizinkan (office / mobile).

4. **Login app**
   - Password: `http://<tunnel-url>/`
   - Demo: `http://<tunnel-url>/sabet`

## Env (sudah diset)

```env
CURSOR_TUNNEL_MODE=true
# IP_ALLOWLIST opsional — tunnel bypass otomatis via host .devtunnels.ms
```

Hanya perlu forward **port 3000** — API lewat BFF `/api/be`, tidak perlu expose 3001.

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `spawn code-tunnel ENOENT` | Pastikan `code-tunnel` ada di `Cursor.app/Contents/Resources/app/bin/` |
| Port forward gagal | `cursor tunnel user login` lalu coba lagi |
| 403 Forbidden | Set `CURSOR_TUNNEL_MODE=true` di `.env.local`, restart `make run` |
| Tunnel mati saat Cursor ditutup | Biarkan Cursor terbuka atau `cursor tunnel --no-sleep` |

## Stop tunnel

- Ports panel → klik **X** pada forward
- Atau: `cursor tunnel kill`
