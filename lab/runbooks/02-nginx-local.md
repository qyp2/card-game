# 02 — Add nginx, then local TLS

**Status:** checklist; examples exist, installation remains unverified.

- [ ] Read the existing deploy/nginx examples and explain static routes, API proxy and WebSocket upgrade.
- [ ] Start with HTTP on the private lab adapter; verify nginx → loopback Node independently.
- [ ] Record proxy headers and verify trusted client attribution; private metrics/inspection stay unavailable publicly.
- [ ] Add a lab CA/certificate trusted by the intended clients. Record names and trust installation; do not treat disabled verification as success.
- [ ] Select explicit HTTP redirect (port 80 intentionally allowed) or HTTP refusal, then align firewall and tests.
- [ ] Verify API misses remain JSON and supported public routes load the application.
- [ ] Verify a short two-client connection through nginx and certificate trust.
- [ ] Record nginx validation, listeners, logs and chosen timeout/heartbeat behavior.

Use root-owned read-only application/static deployment; runtime account writes data only. Exact service/firewall/certificate commands are a later implementation slice.
