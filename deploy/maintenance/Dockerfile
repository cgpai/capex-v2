FROM nginx:1.27-alpine

COPY deploy/maintenance/nginx.conf /etc/nginx/conf.d/default.conf

COPY capex-apps/public/capex-v2.html /usr/share/nginx/html/index.html
COPY capex-apps/public/capex-v2.html /usr/share/nginx/html/capex-v2.html
COPY capex-apps/public/capex-pro-favicon.svg /usr/share/nginx/html/capex-pro-favicon.svg
COPY capex-apps/public/images/login-bg.png /usr/share/nginx/html/images/login-bg.png

EXPOSE 80
