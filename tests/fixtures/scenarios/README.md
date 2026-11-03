# Reviewed scenario v1 fixtures

These five JSON exports preserve development, trigger, st01a, workbook and small-mechanics setup semantics. They are loaded directly by focused tests without browser/admin/API/database dependencies.

First listed libraryOrder entry is drawn first. Provenance identifies the legacy fixture source, not an authority or mutable server record. Original source presets remain narrow legacy automated fixtures; ordinary/manual composition now uses decks/scenarios.

To promote a new fixture: export a saved scenario from the lab; review canonical IDs, size, seed/order, profiles, zones and provenance; remove any accidental private data; commit JSON plus a focused semantic assertion. Do not point tests at mutable saved scenarios or copy live accounts. UUIDs are intentionally independent of the gameplay seed.

Current compatibility assertions live in tests/server/scenarios.test.ts. The fixtures' presence alone does not prove their assertions passed.
