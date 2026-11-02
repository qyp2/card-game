# EVE exporter — implementation slot

Planned counters only; raw records stay private and later flow to Loki. Specify event identity, offsets, rotation/restart, counter resets, duplicates, malformed input and loss handling. Labels stay bounded; no raw payload/account/address labels.

Future tests cover append, rename/truncation, restart, repeats and unreadable data. Expose backlog/parse errors; exporter health does not imply capture health.
