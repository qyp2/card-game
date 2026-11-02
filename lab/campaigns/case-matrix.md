# Initial case matrix

All rows are planned; no results are asserted. Resource limits and exact payloads belong to each campaign.

| ID | Boundary / case | Required control / evidence |
|---|---|---|
| AUTH-01 | Anonymous / invalid / expired / revoked credentials | Current valid credential succeeds; no secret in logs |
| COOKIE-01 | Origin, custom header and CSRF mutations | Same-origin authorized write succeeds |
| SCOPE-01 | Public bearer/cookie cannot authorize admin | Fresh admin scope succeeds only where enabled |
| SEAT-01 | Foreign room and sibling-tab seat | Own seat resumes; rejection changes no state |
| DECK-01 | Foreign saved-deck read/update/use | Owner works; no foreign data returned |
| VIEW-01 | Opponent hidden cards/options and reconnect | Own authorized view works; inspect every outgoing path |
| ACTION-01 | Malformed/unknown/out-of-priority action | Valid same-state action works; no unauthorized mutation |
| REPLAY-01 | Repeated command ID and reconnect boundary | Record actual semantics; do not assume deduplication |
| RESOURCE-01 | Bounded action/connection/payload pressure | Benign baseline, CPU/RAM/disk/latency and stop thresholds |
| HOST-01 | Listeners, writable code paths and service permissions | Expected private routes and authorized runtime writes |
| SENSOR-01 | Selected IDS rule under actual transport | Attack/benign capture, parser/version and dropped-event checks |

Detection exercises and vulnerability findings are separate outcomes. Historical F02 is not a current disclosure claim.
