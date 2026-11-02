# Security lab workspace

**Status:** structure/templates only. No assessment tool or Linux deployment is implemented by these files. Start with the [revised goal/phase plan](../docs/security-lab-plan.md) and [decisions](../docs/security-lab-architecture.md).

See [delivery checks and next slices](STATUS.md) for what was verified and what remains open.

## Start here

1. [Inventory](inventory/README.md): name the isolated target and record scope.
2. [Runbooks](runbooks/README.md): Node locally → nginx → TLS → first campaign.
3. [Campaigns](campaigns/README.md): make a bounded case and retain reproducibility.
4. [Contracts](contracts/README.md): define telemetry and fuzzer responsibilities.
5. [Findings](findings/README.md): triage, remediate, retest and publish sanitized evidence.

| Folder | Owns |
|---|---|
| inventory/ | Target/profile and snapshot references |
| runbooks/ | Beginner checkpoints and eventual operational procedures |
| campaigns/ | Case matrix, campaign template and run manifest |
| contracts/ | Planned interface/data expectations, not implemented schemas |
| fuzz/ | Future independent Python stateful client and mutation runner |
| audit/ | Future host audit wrappers |
| scan/ | Future selected scanner wrappers |
| crypto/ | Optional later encrypted-log exercise |
| findings/ | Register, individual finding template, private evidence and reviewed publication |

Active tooling must eventually reject non-isolated profiles and out-of-scope targets. A Cloudflare demo is functional sharing only. No real secrets belong in templates. Raw output lives in ignored lab/runs/ or findings/evidence/; reviewed publication lives in findings/published/. A raw tool response is not a confirmed finding.

No lab runtime imports application implementation. Valid fuzzer seed contracts may be compared to public protocol definitions in a separate check; malformed mutations deliberately violate them.
