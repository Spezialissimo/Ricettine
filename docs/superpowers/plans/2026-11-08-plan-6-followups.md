# Plan 6 follow-ups

## PR A (security and ops quick wins)
- Default `compose.yaml` publishes `:8080` directly. On Docker Desktop and Colima (VM networking) the app sees the VM gateway (RFC 1918) as the peer, so it counts as a trusted proxy and a client could still set `X-Forwarded-For` there. On native Linux Docker the real client address is preserved and the header is ignored. Local development only; production goes through Caddy. Consider documenting it in the README.
