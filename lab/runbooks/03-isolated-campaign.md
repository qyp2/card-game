# 03 — First isolated assessment

**Status:** checklist; no attack has been executed.

- [ ] Stage pinned dependencies/images and scanner databases before disconnecting internet.
- [ ] Verify host-only adapter, routing, scope and target identity; freeze VM snapshot.
- [ ] Fill a campaign template and run manifest with bounded duration/rate/size and stop conditions.
- [ ] Establish a benign request and observable raw log/capture first.
- [ ] Run one in-scope ownership/auth case, plus its authorized control.
- [ ] Record observed behavior even when secure or inconclusive; do not require a vulnerability.
- [ ] Store raw evidence privately, triage a finding if justified, record detection gaps.
- [ ] Fix/retest a confirmed issue or document the negative baseline.
- [ ] Rebuild/reset the snapshot and reproduce the result.

Later campaigns add metrics, IDS and Loki context. Network flooding and malformed-frame cases require their own tighter resource limits; they are not default first-run exercises.
