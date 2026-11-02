# Telemetry contract draft

**Status:** planned. Current server console output is formatted text with metadata, not a complete JSON security-event stream. Existing auth audit messages lack full source/request context.

## Event fields

| Field | Purpose |
|---|---|
| schemaVersion, timestamp (UTC), instanceId, source, event | Event identity and ordering context |
| outcome, reasonCode | Bounded result classification |
| requestId / connectionId | Server-assigned proxy/application linkage where supported |
| clientAddress, peerAddress, attributionMethod | Verified visitor source versus actual proxy hop |
| accountId, session reference, roomId, commandId | Optional non-secret context; never raw session tokens |
| campaignId | Only trusted test-run context, clearly separated from attacker-provided input |

Never emit passwords, hashes, tokens, CSRF values, cookies or authorization headers. Prefer allowlisted fields over full payload logging. Key-based metadata redaction alone does not sanitize arbitrary strings.

## Collection and correlation

nginx supplies request/connection context; Node links authenticated commands to its connection. Wire EVE uses external flow/time; loopback EVE uses proxy-hop flow/time and sensor identity. Loopback address alone cannot identify the original visitor. Define the exact mapping and uncertainties before claiming account attribution. nginx access logs may only close a long-lived socket request when the connection ends.

Use synchronized clocks, sensor IDs and recorded transport settings. Investigation may be several time-bounded queries; Loki is not an arbitrary raw-log join engine. Use Alloy, not Promtail.

Labels stay low-cardinality (source, environment, event class); account/request/room/address values stay parsed fields or structured metadata. Metrics normalize unknown actions and expose no user-supplied label strings.

## Failure and proof

Plan collector positions across rotation/restart, EVE exporter offsets/counter resets, duplicate/dropped records, audit backlog, queue/disk limits, access control and retention. Choose each service's RAM/disk budget before enabling captures.

Prove a harmless event arrives before testing a synthetic credential canary. Prove secrets are redacted before emission and absent downstream; absence with a broken pipeline is not a pass. Capture files can still contain credentials, so protect raw captures independently.

Metrics listener/private routing and container-to-host scrape reachability require an explicit design and negative external-access check. Alert delay includes scrape, evaluation and configured hold duration; it is not guaranteed to equal one scrape interval.
