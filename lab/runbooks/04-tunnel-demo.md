# 04 — Optional invited domain demo

**Status:** design checklist only; no tunnel configured.

Target path: invited browser → Cloudflare → cloudflared → nginx → loopback Node. Direct connector → Node is an optional later variant.

- [ ] Provision a separate demo instance, database, accounts, logs and connector credentials.
- [ ] Configure approved HTTPS hostname and same-origin public apps; retain production cookie/security settings.
- [ ] Set invitation/Cloudflare Access policy; verify actual visitor admission.
- [ ] Verify trusted client-address handling and scope-separated admin access; keep admin local initially.
- [ ] Verify static/API/socket routes, authenticated saves and reconnect behavior.
- [ ] Keep management, metrics, log backends and inspection private.
- [ ] Record the difference between edge TLS, encrypted tunnel and local proxy hop.
- [ ] Record how to stop the demo/connector and revoke connector credentials.

This is not an offline lab. No active scanner/fuzzer/flood campaign targets this hostname. Cloudflare WAF does not validate gameplay messages inside an established WebSocket; server controls remain necessary.
