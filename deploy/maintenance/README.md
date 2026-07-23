# Deploy halaman maintenance CAPEX ke VPS

Ganti stack **capex-web + capex-be** dengan satu halaman HTML statis (UI sama login Capex Pro + tombol **Buka Capex App V2** → Power Apps).

Sumber HTML: [`capex-apps/public/capex-v2.html`](../../capex-apps/public/capex-v2.html)

---

## Prasyarat di VPS

- Docker + Docker Compose
- Nginx host proxy ke `127.0.0.1:8080` (sama seperti `capex-web` lama)
- Repo sudah di-pull di server (atau copy folder `deploy/maintenance` + `capex-apps/public`)

---

## Langkah deploy (disarankan)

### 1. SSH ke VPS

```bash
ssh ubuntu@YOUR_VPS_HOST
```

### 2. Pull kode terbaru

```bash
cd /path/to/capex   # root monorepo
git pull origin main
```

### 3. Stop aplikasi lama

```bash
cd /ops-agentic/workspaces/developer-aldryan/capex-deploy   # sesuaikan path deploy kamu

docker compose stop capex-web capex-api
# Opsional — tidak jalan lagi:
# docker compose rm -f capex-web capex-api
```

### 4. Jalankan halaman maintenance

```bash
cd /path/to/capex/deploy/maintenance
chmod +x deploy.sh
./deploy.sh
```

Atau manual:

```bash
cd /path/to/capex/deploy/maintenance
docker compose up -d --build --force-recreate
```

### 5. Verifikasi

```bash
curl -sI http://127.0.0.1:8080/ | head -5
```

Buka domain publik di browser — harus tampil card **Maintenance** + tombol Power Apps.

---

## Port & nginx

| Service lama | Port bind |
|--------------|-----------|
| `capex-web` | `127.0.0.1:8080 → 3000` |
| **maintenance** | `127.0.0.1:8080 → 80` |

Nginx di host **tidak perlu diubah** selama masih `proxy_pass http://127.0.0.1:8080`.

Contoh blok nginx (referensi):

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

IP allowlist tetap bisa dipakai — lihat [`../nginx-capex-ip-allowlist.conf`](../nginx-capex-ip-allowlist.conf).

---

## Rollback ke app penuh

```bash
cd /ops-agentic/workspaces/developer-aldryan/capex-deploy
docker compose stop capex-maintenance   # dari folder maintenance
docker compose up -d capex-web capex-api
```

---

## Deploy tanpa Docker (nginx static saja)

Copy file ke server:

```bash
rsync -avz capex-apps/public/capex-v2.html user@vps:/var/www/capex/index.html
rsync -avz capex-apps/public/images/ user@vps:/var/www/capex/images/
rsync -avz capex-apps/public/capex-pro-favicon.svg user@vps:/var/www/capex/
```

Nginx:

```nginx
root /var/www/capex;
index index.html;
location / { try_files $uri $uri/ /index.html; }
```

---

## Edit konten

Ubah teks / link Power Apps di:

`capex-apps/public/capex-v2.html`

Lalu rebuild:

```bash
cd deploy/maintenance && docker compose up -d --build --force-recreate
```
