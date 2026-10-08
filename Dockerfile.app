FROM docker.io/node AS build

WORKDIR /build
ADD . .
RUN npm clean-install

WORKDIR /build/app
RUN npx vite build

FROM docker.io/caddy AS app

WORKDIR /public
COPY --from=build /build/app/dist .
COPY Caddyfile /etc/caddy/Caddyfile
