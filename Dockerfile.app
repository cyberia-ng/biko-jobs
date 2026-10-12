FROM docker.io/node AS build

WORKDIR /build
ADD . .
RUN npm clean-install --ignore-scripts

WORKDIR /build/app
ARG BUILD_MODE="production"
RUN npx vite build --mode ${BUILD_MODE}

FROM docker.io/caddy AS app

WORKDIR /public
COPY --from=build /build/app/dist .
COPY Caddyfile /etc/caddy/Caddyfile
