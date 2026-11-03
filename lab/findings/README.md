# lab/findings/

**Status:** empty. Populated in Phases 5 and 6.

## Belongs here

- `register.md` — the findings table (created in Phase 5)
- `evidence/` — redacted artifacts: ZAP reports, PCAPs, fuzzer JSON, scan output

## Register columns

Every finding records:

| Column | Meaning |
|---|---|
| ID | `F-01`, `F-02`, … |
| Title | Short description |
| Severity | CVSS score and band |
| Component | File or endpoint affected |
| Reproduction | Steps a second person can follow |
| Evidence | Path under `evidence/` |
| Detected by | Suricata rule id, Grafana alert name, or a Loki correlation query — or `none` |
| Remediation | Commit hash |
| Re-test | Pass / fail with date |

## Rules

- Evidence is redacted before it is committed — no tokens, keys, or real credentials.
- A finding without reproduction steps is not a finding.
- A finding without a re-test result stays open.
- A finding detected only by a counter is weaker evidence than one with a log query attached.
  Record which layer observed it (wire, loopback, application metric, log correlation) and
  which did not; a detection gap is itself a finding.
