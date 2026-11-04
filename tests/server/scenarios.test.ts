import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { createGameApplication } from '@server/application';
import { newScenario, ScenarioSchema, ScenarioFixtureSchema, importScenario, validateDeck, type AuthResponse } from '@card-game/protocol';
import { buildScenarioRoom, scenarioRandom } from '@engine/scenario-setup';
import { getSetupPreset } from '@config';
import { buildTestDeck } from '@engine/room-factory';
import { SqliteStore } from '@server/stores/sqlite-store';
import { presetFixture, presetNames } from '@server/scenarios/presets';
import { buildCatalog } from '@server/catalog/catalog';
import { scenariosEnabled } from '@server/scenarios/service';
import { loadServerConfig } from '@server/config';
const password = 'scenario-lab-strong-passphrase-91';
const setup = () => ({ ...newScenario(), name: 'Choice demonstration', openingHandSize: 0, players: [{ life: 17, library: [{ cardId: 'land-red', quantity: 3 }], hand: [{ cardId: 'land-red', quantity: 1 }, { cardId: 'choice-practice', quantity: 1 }], graveyard: [], battlefield: [] }, { life: 23, library: [{ cardId: 'land-red', quantity: 4 }], hand: [], graveyard: [], battlefield: [] }] as ReturnType<typeof newScenario>['players'] });
describe('scenario contracts and independent fixtures', () => {
    it('requires all server capability gates and keeps ordinary development defaults out of fixture mode', () => {
        expect(loadServerConfig({}).fixturesEnabled).toBe(false);
        for (const configuration of [{ lab: { enabled: false }, inspectionEnabled: true, navigation: { purpose: 'lab' } }, { lab: { enabled: true }, inspectionEnabled: false, navigation: { purpose: 'lab' } }, { lab: { enabled: true }, inspectionEnabled: true, navigation: { purpose: 'live' } }, { lab: { enabled: true }, inspectionEnabled: true, navigation: { purpose: 'development' } }])
            expect(scenariosEnabled(loadServerConfig({}, configuration))).toBe(false);
        const lab = loadServerConfig({ NODE_ENV: 'development', CONFIG_FILE: 'deploy/profiles/scenario-lab.example.json' });
        expect(scenariosEnabled(lab)).toBe(true);
        expect(lab.http.port).toBe(3001);
        expect(lab.storage.databasePath).toContain('scenario-lab');
    });
    it('rejects unknown fields, invalid versions, duplicate/oversized counts, invalid fixed order and executable content', () => {
        const s = setup();
        expect(ScenarioSchema.safeParse(s).success).toBe(true);
        for (const bad of [{ ...s, schemaVersion: 2 }, { ...s, script: 'anything' }, { ...s, seed: -1 }, { ...s, players: [{ ...s.players[0], libraryOrder: ['choice-practice'] }, s.players[1]] }, { ...s, players: [{ ...s.players[0], library: [{ cardId: 'land-red', quantity: 251 }] }, s.players[1]] }])
            expect(ScenarioSchema.safeParse(bad).success).toBe(false);
        expect(() => importScenario(' '.repeat(65537))).toThrow();
        const f=presetFixture('workbook');const pretty=JSON.stringify(f,null,2);expect(importScenario(pretty)).toEqual(f);
        expect(() => importScenario('{}')).toThrow();
        expect(validateDeck({ name: 'Not standard', format: 'standard', cards: [{ cardId: 'choice-practice', quantity: 1 }] }, buildCatalog()).valid).toBe(false);
    });
    it.each(presetNames)('preserves %s order, opening hand, life and rule profile through a checked-in fixture', name => {
        const fixture = ScenarioFixtureSchema.parse(JSON.parse(readFileSync('tests/fixtures/scenarios/' + name + '.json', 'utf8')));
        expect(fixture).toEqual(presetFixture(name));
        const old = getSetupPreset(name), room = buildScenarioRoom('fixture', ['p1', 'p2'], fixture.scenario, { uuid: randomUUID, random: scenarioRandom(1) });
        const deck = buildTestDeck('p1', old, { uuid: randomUUID, random: scenarioRandom(1) }), hand = [];
        for (let i = 0; i < old.openingHandSize; i++)
            hand.push(deck.pop()!.blueprint.id);
        expect(room.players.p1.hand.map(c => c.blueprint.id)).toEqual(hand);
        expect(room.players.p1.deck.map(c => c.blueprint.id)).toEqual(deck.map(c => c.blueprint.id));
        expect(room.players.p1.life).toBe(old.startingLife);
        expect(room.setup?.scorch).toBe(!!old.scorch);
        expect(room.setup?.firstPlayerDrawsOnFirstTurn).toBe(old.firstPlayerDrawsOnFirstTurn);
    });
    it('reproduces seeded order while object identifiers stay independent, including explicit initial zones', () => {
        const s = setup();
        s.shuffle = 'seeded';
        s.seed = 918;
        s.players[0].library = [{ cardId: 'land-red', quantity: 8 }, { cardId: 'empire-servant', quantity: 8 }];
        s.players[0].battlefield = [{ cardId: 'empire-servant', quantity: 1 }];
        s.players[0].graveyard = [{ cardId: 'land-red', quantity: 1 }];
        s.openingHandSize = 2;
        const a = buildScenarioRoom('a', ['one', 'two'], s, { uuid: randomUUID, random: scenarioRandom(918) }), b = buildScenarioRoom('b', ['one', 'two'], s, { uuid: randomUUID, random: scenarioRandom(918) });
        expect(a.players.one.deck.map(c => c.blueprint.id)).toEqual(b.players.one.deck.map(c => c.blueprint.id));
        expect(a.players.one.deck[0].uuid).not.toBe(b.players.one.deck[0].uuid);
        expect(a.players.one.hand).toHaveLength(4);
        expect(a.players.one.graveyard).toHaveLength(1);
        expect(a.battlefield).toHaveLength(1);
        expect(a.players.one.hand.every(card => card.state.visibility === 'owner')).toBe(true);
        expect(a.players.one.deck.every(card => card.state.visibility === 'hidden')).toBe(true);
        expect(a.players.one.graveyard.every(card => card.state.visibility === 'public')).toBe(true);
        expect(a.battlefield.every(card => card.state.visibility === 'public')).toBe(true);
    });
});
describe('short real lab HTTP/socket acceptance', () => {
    let app: ReturnType<typeof createGameApplication>, url: string, admin: AuthResponse, one: AuthResponse, two: AuthResponse, other: AuthResponse;
    const sockets: Socket[] = [];
    beforeEach(async () => {
        app = createGameApplication({ environment: { NODE_ENV: 'test', DELTA_LOG_PATH: '' }, configuration: { lab: { enabled: true, maxRooms: 2 }, inspectionEnabled: true, navigation: { instanceId: 'acceptance-lab', purpose: 'lab' } } });
        await app.ready;
        const account = await app.auth.register({ username: 'operator', password });
        const r = app.auth.repository.findAccount(account.account!.id)!;
        app.auth.repository.saveAccount({ ...r, role: 'admin' });
        admin = await app.auth.login({ username: 'operator', password, scope: 'admin' });
        const second = await app.auth.register({ username: 'player-two', password }), third = await app.auth.register({ username: 'unassigned', password });
        const child = (id: string) => { const parent = app.auth.sessions.issue({ kind: 'account', id }, 'game', { kind: 'browser' }); return app.auth.gameTab(parent.record); };
        one = child(account.account!.id);
        two = child(second.account!.id);
        other = child(third.account!.id);
        await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
        url = 'http://127.0.0.1:' + (app.server.address() as {
            port: number;
        }).port;
    });
    afterEach(async () => { vi.restoreAllMocks(); sockets.splice(0).forEach(s => s.disconnect()); await new Promise<void>(resolve => app.io.close(() => resolve())); });
    const req = async (path: string, method = 'GET', body?: unknown, token: string | undefined = admin?.token) => fetch(url + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const save = async () => { const r = await req('/api/admin/scenarios', 'POST', { protocolVersion: 1, scenario: setup() }); expect(r.status).toBe(200); return (await r.json()).record; };
    const launch = async (record: any) => { const r = await req('/api/admin/scenarios/' + record.id + '/launch', 'POST', { protocolVersion: 1, expectedRevision: record.revision, participants: [one.account!.id, two.account!.id] }); expect(r.status).toBe(200); return (await r.json()).run; };
    function once(socket: Socket, event: string) { return new Promise<any>((resolve, reject) => { const timer = setTimeout(() => { socket.off(event, listener); reject(new Error('Timed out ' + event)); }, 2000); const listener = (v: any) => { clearTimeout(timer); resolve(v); }; socket.once(event, listener); }); }
    async function connect(session: AuthResponse, roomId: string) { const socket = io(url, { transports: ['websocket'], autoConnect: false, reconnection: false, auth: { protocolVersion: 1, token: session.token, roomId } }); sockets.push(socket); const snapshot = once(socket, 'roomSnapshot'); socket.connect(); return { socket, snapshot: await snapshot }; }
    it('saves a nonstandard scenario, launches assigned seats, plays, inspects, revises, resets snapshot and exports', async () => {
        const record = await save(), run = await launch(record);
        for (const session of [one, two])
            expect((await req('/api/lab/rooms/' + run.roomId + '/claim', 'POST', { protocolVersion: 1 }, session.token)).status).toBe(200);
        const a = await connect(one, run.roomId), b = await connect(two, run.roomId);
        expect(a.snapshot.room.players[a.snapshot.room.viewerId].life).toBe(17);
        const delta = once(a.socket, 'stateDelta'), otherDelta = once(b.socket, 'stateDelta');
        a.socket.emit('playerAction', { protocolVersion: 1, roomId: run.roomId, commandId: randomUUID(), actionId: 'play_land', zoneRevision: a.snapshot.room.players[a.snapshot.room.viewerId].hand.find((c: any) => c.definitionId === 'land-red').state.zoneRevision ?? 0, cardUuid: a.snapshot.room.players[a.snapshot.room.viewerId].hand.find((c: any) => c.definitionId === 'land-red').uuid });
        await Promise.all([delta, otherDelta]);
        const inspected = await req('/api/admin/rooms/' + run.roomId);
        expect(inspected.status).toBe(200);
        expect((await inspected.json()).room.battlefield).toHaveLength(1);
        const edited = { ...setup(), name: 'Revised', players: setup().players };
        edited.players[0].life = 99;
        expect((await req('/api/admin/scenarios/' + record.id, 'PUT', { protocolVersion: 1, expectedRevision: 1, scenario: edited })).status).toBe(200);
        expect(app.scenarios.run(run.roomId).snapshot.players[0].life).toBe(17);
        const reset = await req('/api/admin/scenarios/runs/' + run.roomId + '/reset', 'POST', { protocolVersion: 1 });
        expect(reset.status).toBe(200);
        const fresh = (await reset.json()).run;
        expect(fresh.roomId).not.toBe(run.roomId);
        expect(fresh.revision).toBe(1);
        expect(fresh.snapshot.name).toBe('Choice demonstration');
        expect(app.store.getRoom(run.roomId)).toBeUndefined();
        const exported = await (await req('/api/admin/scenarios/' + record.id + '/export')).json();
        expect(importScenario(JSON.stringify(exported.fixture)).scenario.name).toBe('Revised');
        const imported = await req('/api/admin/scenarios/import', 'POST', { protocolVersion: 1, fixture: exported.fixture });
        expect(imported.status).toBe(200);
        const importedRecord = (await imported.json()).record;
        const roundtrip = await (await req('/api/admin/scenarios/' + importedRecord.id + '/export')).json();
        expect(roundtrip.fixture.origin).toEqual(exported.fixture.provenance);
        const actions = app.store.audit.pendingAudit(1000).map(r => r.action);
        expect(actions).toEqual(expect.arrayContaining(['scenario.create', 'scenario.launch', 'scenario.update', 'scenario.reset', 'scenario.export']));
    });
    it('requires current admin scope, capability, canonical IDs and bounded strict requests', async () => {
        for (const token of ['', one.token, other.token])
            expect((await req('/api/admin/scenarios', 'GET', undefined, token)).status).toBe(token ? 403 : 401);
        const s = setup();
        s.players[0].hand = [{ cardId: 'unknown-canonical', quantity: 1 }];
        expect((await req('/api/admin/scenarios', 'POST', { protocolVersion: 1, scenario: s })).status).toBe(400);
        expect((await req('/api/admin/scenarios', 'POST', { protocolVersion: 1, scenario: setup(), enabled: true })).status).toBe(400);
        const actor = app.auth.repository.findAccount(admin.account!.id)!;
        app.auth.repository.saveAccount({ ...actor, role: 'player' });
        expect((await req('/api/admin/scenarios')).status).toBe(401);
    });
    it('denies unassigned/admin credentials and a sibling child claiming an occupied test seat; ordinary rooms cannot reset', async () => {
        const run = await launch(await save());
        const path = '/api/lab/rooms/' + run.roomId + '/claim';
        expect((await req(path, 'POST', { protocolVersion: 1 }, other.token)).status).toBe(403);
        expect((await req(path, 'POST', { protocolVersion: 1 }, admin.token)).status).toBe(403);
        expect((await req(path, 'POST', { protocolVersion: 1 }, one.token)).status).toBe(200);
        const parent = app.auth.sessions.issue({ kind: 'account', id: one.account!.id }, 'game', { kind: 'browser' }), sibling = app.auth.gameTab(parent.record);
        expect((await req(path, 'POST', { protocolVersion: 1 }, sibling.token)).status).toBe(409);
        expect((await req('/api/admin/scenarios/runs/' + randomUUID() + '/reset', 'POST', { protocolVersion: 1 })).status).toBe(404);
    });
    it('rejects stale revisions and leaves running snapshots after source deletion; audits storage failures atomically', async () => {
        const record = await save(), run = await launch(record);
        expect((await req('/api/admin/scenarios/' + record.id, 'PUT', { protocolVersion: 1, expectedRevision: 8, scenario: setup() })).status).toBe(409);
        const before = app.scenarios.repository.listScenarios(0, 100).total;
        vi.spyOn(app.store.audit, 'appendAudit').mockImplementationOnce(() => { throw new Error('audit disk failed'); });
        expect((await req('/api/admin/scenarios', 'POST', { protocolVersion: 1, scenario: setup() })).status).toBe(500);
        expect(app.scenarios.repository.listScenarios(0, 100).total).toBe(before);
        expect((await req('/api/admin/scenarios/' + record.id, 'DELETE', { protocolVersion: 1, expectedRevision: 1 })).status).toBe(200);
        expect(app.scenarios.run(run.roomId).snapshot).toEqual(record.scenario);
        expect((await req('/api/admin/scenarios/runs/' + run.roomId + '/reset', 'POST', { protocolVersion: 1 })).status).toBe(200);
    });
    it('bounds run resources, permits reset at capacity, releases stopped rooms and rejects stale references', async () => {
        const record = await save(), first = await launch(record), second = await launch(record);
        expect((await req('/api/admin/scenarios/' + record.id + '/launch', 'POST', { protocolVersion: 1, expectedRevision: 1, participants: [one.account!.id, two.account!.id] })).status).toBe(409);
        const reset = await req('/api/admin/scenarios/runs/' + first.roomId + '/reset', 'POST', { protocolVersion: 1 });
        expect(reset.status).toBe(200);
        expect((await req('/api/lab/rooms/' + first.roomId + '/claim', 'POST', { protocolVersion: 1 }, one.token)).status).toBe(404);
        expect((await req('/api/admin/scenarios/runs/' + second.roomId, 'DELETE', { protocolVersion: 1 })).status).toBe(200);
        expect(app.store.getRoom(second.roomId)).toBeUndefined();
        expect((await launch(record)).revision).toBe(1);
    });
    it('rolls back scenario/audit changes and ephemeral launches when transaction work fails', async () => {
        const before = app.store.audit.pendingAudit(1000).length;
        vi.spyOn(app.scenarios.repository, 'saveScenario').mockImplementationOnce(() => { throw new Error('storage failed'); });
        expect((await req('/api/admin/scenarios', 'POST', { protocolVersion: 1, scenario: setup() })).status).toBe(500);
        expect(app.scenarios.repository.listScenarios(0, 100).total).toBe(0);
        expect(app.store.audit.pendingAudit(1000).slice(before).some(e => e.action === 'scenario.create' && e.outcome === 'success')).toBe(false);
        const record = await save();
        expect(() => app.scenarios.atomic(() => { app.scenarios.launch(record.id, 1, [one.account!.id, two.account!.id], admin.account!.id); throw new Error('commit aborted'); })).toThrow();
        expect(app.scenarios.listRuns()).toEqual([]);
        expect(app.store.listRooms()).toEqual([]);
        const run = await launch(record);
        expect(() => app.scenarios.atomic(() => { app.scenarios.reset(run.roomId, admin.account!.id); throw new Error('reset commit aborted'); })).toThrow();
        expect(app.scenarios.listRuns()).toHaveLength(1);
        expect(app.store.getRoom(run.roomId)).toBeDefined();
    });
    it('rejects oversized bodies, incompatible imports, unsupported boards and revoked credentials', async () => {
        expect((await req('/api/admin/scenarios/import', 'POST', { protocolVersion: 1, fixture: { version: 8 } })).status).toBe(400);
        expect((await req('/api/admin/scenarios', 'POST', { protocolVersion: 1, scenario: setup(), extra: 'x'.repeat(33000) })).status).toBe(413);
        const s = setup();
        s.players[0].battlefield = [{ cardId: 'choice-practice', quantity: 1 }];
        expect((await req('/api/admin/scenarios', 'POST', { protocolVersion: 1, scenario: s })).status).toBe(400);
        const session = app.auth.sessions.validate(admin.token)!;
        app.auth.sessions.revoke(session, 'logout');
        expect((await req('/api/admin/scenarios')).status).toBe(401);
    });
    it('keeps live/lab data and credentials independent; live scenario execution is refused even for admins', async () => {
        const live = createGameApplication({ environment: { NODE_ENV: 'test' }, configuration: { lab: { enabled: true }, inspectionEnabled: true, navigation: { instanceId: 'live-acceptance', purpose: 'live' } } });
        await live.ready;
        await new Promise<void>(resolve => live.server.listen(0, '127.0.0.1', resolve));
        try {
            const endpoint = 'http://127.0.0.1:' + (live.server.address() as {
                port: number;
            }).port;
            expect((await fetch(endpoint + '/api/admin/scenarios', { headers: { Authorization: 'Bearer ' + admin.token } })).status).toBe(401);
            const x = await live.auth.register({ username: 'live-operator', password });
            const ar = live.auth.repository.findAccount(x.account!.id)!;
            live.auth.repository.saveAccount({ ...ar, role: 'admin' });
            const logged = await live.auth.login({ username: 'live-operator', password, scope: 'admin' });
            expect((await fetch(endpoint + '/api/admin/scenarios', { headers: { Authorization: 'Bearer ' + logged.token } })).status).toBe(404);
            expect((await req('/api/admin/scenarios', 'GET', undefined, logged.token)).status).toBe(401);
            expect((await (await fetch(endpoint + '/api/platform')).json()).capabilities.scenarios).toBe(false);
        }
        finally {
            await new Promise<void>(resolve => live.io.close(() => resolve()));
        }
    });
});
describe('scenario migration durability', () => {
    it('retains revisions across reopen, rejects stale updates and rolls back failed transactions', () => {
        const dir = mkdtempSync(join(tmpdir(), 'm7-scenarios-')), p = join(dir, 'lab.sqlite');
        let store = new SqliteStore(p);
        const record = { id: randomUUID(), revision: 1, scenario: setup(), createdAt: 1, updatedAt: 1 };
        try {
            expect(store.saveScenario(record, 0)).toBe(true);
            store.close();
            store = new SqliteStore(p);
            expect(store.findScenario(record.id)).toEqual(record);
            expect(store.saveScenario({ ...record, revision: 2 }, 8)).toBe(false);
            expect(() => store.scenarioTransaction(() => { store.deleteScenario(record.id, 1); throw new Error('rollback'); })).toThrow();
            expect(store.findScenario(record.id)).toEqual(record);
        }
        finally {
            store.close();
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
