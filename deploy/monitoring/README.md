# deploy/monitoring/

**Status:** empty. Planned in Phases 3, 4 and 4.5.

## Belongs here

| File | Purpose | Phase |
|---|---|---|
| `docker-compose.yml` | Prometheus + Grafana + Loki + Promtail + Suricata | 3, 4, 4.5 |
| `prometheus.yml` | Scrape config for the app and Suricata exporter | 3 |
| `alerts.yml` | Alert rules with documented PromQL | 3 |
| `grafana/` | Provisioned datasources + dashboard JSON | 3, 4.5 |
| `suricata/` | `suricata.yaml` and custom `cardgame.rules`, one config per interface | 4 |
| `exporter/` | `eve.json` → Prometheus counters | 4 |
| `loki/` | Retention and scrape configuration | 4.5 |
| `README.md` | PromQL reference with expected output | 3 |

## Metric names the app must expose

Defined in the plan (Phase 3). Summary:

- `cardgame_actions_total{action,result}`
- `cardgame_action_duration_seconds` (histogram)
- `cardgame_rooms_active`
- `cardgame_socket_connections`
- `cardgame_auth_attempts_total{result}`
- `cardgame_delta_log_bytes`

## Two sensors, not one

TLS terminates at nginx, so a sensor on the host-only interface sees ciphertext. Application
fields — `playerAction` frames, `playerId`/session binding, `joinRoom` enumeration — exist only
in the plaintext nginx→node stream on loopback. Every rule must be bound to the interface that
can observe it, and the binding recorded next to the rule. See plan Phase 4.

## Prometheus carries counts; Loki carries records

The `eve.json` exporter is lossy by design: counters and last-seen timestamps, not raw alert
records. Raw records ship to Loki in Phase 4.5 alongside `journald`, `auditd` and nginx logs,
so a finding can be triaged (which account, which address, what payload) rather than merely
counted.

## Verification

- All series present in Prometheus after a scrape
- Dashboard renders live data during a two-client game
- Each alert fires when triggered and resolves when cleared
- Each Suricata rule fires on its scripted reproduction, on its documented interface, and
  stays silent during normal play
- All four Loki sources queryable; each correlation query returns a non-empty result during a
  scripted attack
- Retention configured and its disk cost recorded
- No credential material reaches Loki, verified end to end through the shipping path
