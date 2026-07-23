CAPEX Maintenance — static site (upload ke VPS)

Isi folder:
  index.html          halaman utama
  images/login-bg.png background
  capex-pro-favicon.svg

UPLOAD dari Mac (ganti IP_PUBLIK):
  scp -r deploy/maintenance/site ubuntu@IP_PUBLIK:/tmp/capex-site

Di VPS (paste):
  sudo mkdir -p /var/www/capex
  sudo cp -r /tmp/capex-site/* /var/www/capex/
  sudo chown -R www-data:www-data /var/www/capex

Nginx — arahkan root ke /var/www/capex (atau proxy ke static server):
  root /var/www/capex;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }

Reload:
  sudo nginx -t && sudo systemctl reload nginx

Cek:
  curl -sI http://127.0.0.1/ | head -3
