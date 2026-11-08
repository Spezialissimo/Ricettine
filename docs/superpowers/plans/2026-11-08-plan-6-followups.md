# Plan 6 follow-ups

## PR A (security and ops quick wins)
- Trust in forwarded headers now follows the compose topology (`RICETTINE_TRUSTED_PROXIES`): direct `:8080` trusts no proxy; the Caddy overlays trust RFC 1918. The application.yml default (RFC 1918) still applies to dev and a bare `java -jar` run that is published directly, so do not expose that to the internet without a proxy. Native Linux is not safe by itself: IPv6 clients (docker-proxy), rootless Docker and localhost traffic arrive from a gateway address.
