# Monitoring structure

**Status:** planning folders only. No Compose stack, collector, dashboard, rule or metric endpoint is implemented here.

Build one metric/panel/alert, then one capture-backed IDS rule, then Alloy/Loki investigation. A first isolated assessment uses raw evidence before this stack exists.

Folders: prometheus/ (scrapes/rules), grafana/ (dashboards), suricata/ (sensors/rules), exporter/ (EVE counts), alloy/ (collection), loki/ (search/retention).

Future Compose design must resolve container-to-host scrape reachability, sensor namespaces, private management listeners and total resource budgets. See [telemetry contract](../../lab/contracts/telemetry.md).
