# Independent fuzzer contract draft

**Status:** planned Python tooling; no dependencies installed or runner implemented.

Use python-socketio for stateful application events. Independence is a useful second implementation, not proof that Node clients are unsuitable. Do not import defender runtime validators into mutation generation.

Valid seed fixtures track event names, protocol version and required fields through a separate drift check. Mutation cases intentionally violate those contracts. Low-level Engine.IO/WebSocket framing needs separate tooling because a normal library emits valid framing.

Future runner requirements: allowlisted isolated target/profile, redirect revalidation, external credential references, explicit rate/duration/payload limits, cancellation, deterministic mutation seed and reset hooks. Record settings without secrets.

Results: secure-observed, suspected-vulnerability, inconclusive, error or skipped, with expected/observed behavior and a benign control. A crash/rejection/counter alone does not establish exploitability. Final triage belongs in the findings register.

Cover HTTP cookie/CSRF and saved-deck ownership as well as sockets. Test revoked/expired/admin/game/sibling-tab subjects, room membership, priority/choices, hidden information and bounded resource use. Replay tests distinguish trace IDs from duplicate-command handling.
