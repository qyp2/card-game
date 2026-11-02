# Security lab plan — learn, demonstrate, assess and improve

**Revised:** 2 November 2026. **Delivery status:** structure and planning only for the Linux lab. Platform accounts, private player views, SQLite account/session/deck storage, admin UI and shared public sessions already exist. Installed Linux hardening, monitoring, detection and campaigns are not completed by this scaffold.

## Revised goal

First learn to run and explain the existing game behind nginx locally. Build a repeatable isolated security target, then demonstrate one complete assess → detect → investigate → fix → retest story. An optional domain through Cloudflare Tunnel is a separate invited-demo deployment. Detailed automation and tool configuration follow after this structure is reviewed.

The game does not need full public-product readiness, advanced animation or the admin Scenario Builder before this work. Keep game rules unchanged. Platform Milestone 7 is application scenario tooling, not this plan's Phase 7 report.

Start at [lab/README](../lab/README.md), the [architecture decisions](security-lab-architecture.md) and [beginner runbooks](../lab/runbooks/README.md).

## Two deployment profiles

| Profile | Path | Purpose | Assessment scope |
|---|---|---|---|
| Isolated lab | Kali → host-only Ubuntu nginx HTTPS → loopback Node | Linux, TLS, packet analysis, application security and detection | Explicitly inventoried lab endpoints; bounded campaigns |
| Invited demo | Browser → domain / Cloudflare → cloudflared → nginx → Node | Show a playable game and learn the proxy path | Functional checks only; no active scanners or flood tests |

Direct tunnel → Node is an optional later variant, not another required stack. Never tunnel the vulnerable assessment VM. Use separate instance IDs, databases, accounts, logs and secrets. A label alone is not isolation.

Offline operation means no internet route during a campaign. Provision pinned dependencies/images/scanner databases beforehand using a recorded staging/import process, then disconnect staging access and verify routes. A demo tunnel requires internet and cannot satisfy the offline profile.

## Current baseline

Implemented by platform work: versioned protocol/private views, account authentication, scoped game/admin sessions, fixed expiry/revocation, HttpOnly public browser families with CSRF protection, tab seat ownership, SQLite account/session/deck storage, saved decks, admin inspection and audit outbox, trusted navigation metadata.

Rooms/seats remain ephemeral. Node listen-host configuration, a metrics listener, JSON security telemetry and lab tooling are still implementation tasks. Historical permissive CORS, unauthenticated identity and private-view disclosure are historical findings only; assess the current commit before making a finding.

Existing [nginx examples](../deploy/nginx/README.md) and logrotate policy are source artifacts, not installed-host proof.

## Delivery order and phase boundaries

Keep phase numbers for traceability, but run a small Phase 5 baseline immediately after Phase 2. Logging/metrics/detection then enrich a repeat campaign; do not wait for the entire dashboard stack to start assessment.

| Phase | Next deliverable | Evidence before calling it implemented |
|---|---|---|
| 1 — auth foundation | Verify current controls and document current scopes | Existing platform reports plus focused regressions for changed behavior |
| 2 — learn / host | Node locally, nginx HTTP, local TLS, service user, firewall, snapshots/restore | Record each runbook checkpoint, actual listeners/routes and successful two-client path |
| 5a — early baseline | One bounded auth/ownership assessment, manual raw-log/PCAP triage | Exact scope/commit, reproducible test and controls; finding or explicit negative result |
| 3 — metrics / telemetry | Boundary counters, histogram, private scrape and security JSON events | Correct series, bounded labels, scrape reachability and redaction controls |
| 4 — network detection | Proven wire and loopback IDS rules using a pinned parser | Small PCAP proof first; attack/control samples, layer and known limitations |
| 4.5 — log investigation | Alloy → Loki plus source/time/request context | Positive ingestion control, synthetic-secret redaction, documented investigation queries |
| 5b — repeat assessment | Stateful Socket.IO and HTTP cases plus selected host/dependency/TLS checks | Campaign manifest, case matrix, raw private evidence and reviewed findings |
| 6 — remediate / retest | Fix confirmed issues and rerun affected cases/controls | Linked commit, before/after artifacts, regression evidence and dispositions |
| 7 — communicate | Rebuild guide, findings report, detection coverage, sanitized walkthrough | Another person can follow the report; all claims distinguish tested from planned |

### Phase 2 details to settle later

Use the supported runtime tested by CI, pin tool/package/image versions, record native dependency compatibility and the provisioning source. Service account reads application/dependency/static files; only runtime data is writable. Node and management listeners remain private. Select either explicit port-80 redirect service or refusal; firewall and acceptance must agree.

Define SSH access from the host/management subnet, an actual systemd unit, resource budgets for the entire stack, audit/AIDE baselines, log rotation and restore drills. Existing application backup/migration guidance remains authoritative: take pre-upgrade backups with the matching old release.

### Phases 3–4.5 details to settle later

Instrument server boundaries, not game-rule modules. Proposed metrics retain the existing names: actions by bounded action/result, action duration, active rooms, connections, auth outcomes and delta-log bytes. Normalize unknown actions to a fixed value; do not label by raw input, account, room or token. Establish baseline traffic before choosing thresholds and alert durations.

Use the [telemetry contract](../lab/contracts/telemetry.md). Pin Suricata and prove WebSocket decoding under the actual masking/compression/fragmentation/transport settings. Wire sees encrypted visitor traffic only in the direct nginx lab; loopback sees the proxy hop. Authenticated identity and failed-join semantics belong to application evidence first. This is IDS; IPS needs a separate inline/blocking experiment.

Ship journald, nginx, auditd and sensor EVE through Alloy to Loki. Prometheus stores numerical series; Loki stores searchable records. Raw logs can be investigated before Loki exists. A cross-source workflow is not an automatic raw-log SQL join.

### Phase 5 scope

Use [campaign and result templates](../lab/campaigns/README.md), [fuzzer boundaries](../lab/contracts/fuzzing.md) and the [case matrix](../lab/campaigns/case-matrix.md). Include anonymous, guest, account, sibling-tab and admin subjects. Inventory endpoints and credentials by reference, never by secret value.

Begin with one meaningful ownership test and its benign control. Add selected recon/TLS, host audit, dependency analysis, browser-cookie/CSRF, revocation, malformed input and bounded resource tests. Raw wire framing requires separate lower-level tools; a valid Socket.IO client does not create every malformed frame.

All active campaigns use the isolated profile. A test attempt triggering a detector is detection evidence, not automatically a vulnerability. Never manufacture a current finding to satisfy an alert quota. Historical vulnerable commits, if used, must be separately identified and isolated.

### Phase 6 scope

Fix confirmed findings; do not schedule already-implemented CORS, Helmet or private projections as new work. Record accepted risk, false positives and unresolved issues honestly.

Encryption is an optional separately designed learning slice after the first remediation loop. AES-GCM already authenticates ciphertext. Specify nonce/key lifecycle, rotation, envelope version and tamper handling; log deletion/reordering requires its own threat model. Existing JSONL readers and rotation need an explicit integration decision before formats change.

## Learning ramp

1. Start the built game through Node and explain what runs where.
2. Put nginx in front using HTTP on the private network.
3. Add locally trusted TLS; verify the API and Socket.IO transport.
4. Freeze a VM snapshot and record the first bounded campaign.
5. Add one metric, one panel and one alert before expanding.
6. Prove one Suricata rule with attack and benign PCAPs.
7. Add Alloy/Loki and a time/source/request-based investigation.
8. Fix a finding, retest and publish a sanitized walkthrough.
9. Optionally build a separate invited domain demo.

No fixed calendar commitment: this is a first pass through several tools. Instrumentation, capture/parser discovery, native installs and correlation design need their own checkpoints.

## Verification and evidence

The standing local code gate remains focused logic, short relevant integration, architecture checks and affected typechecks/builds. No browser smoke, long socket/full-suite run is required by this scaffold. Actual host/TLS, two-client walkthrough and tool detections must later be observed and recorded; a build does not prove them.

Record commit, config hash, tool versions, VM snapshot, UTC timestamps, target/profile, result and evidence locations. Keep raw captures and credentials private. Publish reviewed text/JSON extracts only. Use positive logging controls alongside synthetic-secret redaction checks.

Each detector records attack sample, benign sample, expected/observed result, latency, blind spots and missed/dropped-event handling. One quiet normal match is an initial check, not a false-positive-rate measurement.

## Structure and ownership

- [deploy/profiles](../deploy/profiles/README.md): application override examples and separation requirements.
- [deploy](../deploy/README.md): eventual runtime/proxy/hardening and monitoring artifacts.
- [lab/inventory](../lab/inventory/README.md): scope and target identity.
- [lab/contracts](../lab/contracts/README.md): telemetry and independent fuzzer boundaries.
- [lab/runbooks](../lab/runbooks/README.md): learning/provisioning/campaign steps.
- [lab/campaigns](../lab/campaigns/README.md): case matrix and reproducibility.
- [lab/findings](../lab/findings/README.md): register, finding template and publication boundary.

Detailed executable deployment/scanner/fuzzer configurations remain future work. No tools are installed, services started, secrets provisioned or targets scanned by this structure.
