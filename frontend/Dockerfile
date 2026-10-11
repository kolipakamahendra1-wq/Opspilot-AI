FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Rendered with envsubst at start. Defaults suit docker compose; Railway overrides them.
ENV PORT=80 BACKEND_URL=http://backend:8000 DNS_RESOLVER="127.0.0.11 ipv6=off"
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
