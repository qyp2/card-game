# Firewall — implementation slot

No policy installed. Isolated profile: restrict SSH management, expose game HTTPS on host-only interface, keep Node/metrics private. Allow 80 only if redirect is intended. Disconnect staging access and verify routes before campaigns.

Demo profile needs outbound connector access and a distinct policy; the tunnel does not require public inbound origin ports. Check container publication rather than assuming host firewall coverage.

Proof: actual adapters/routes/listeners/effective rules and allowed/denied connections from relevant networks.
