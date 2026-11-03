export const scenariosSchema = `
CREATE TABLE scenarios (
 id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL CHECK(revision>0),
 content TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
) STRICT;
`;
