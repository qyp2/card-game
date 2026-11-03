import { randomUUID } from 'node:crypto';
import { ScenarioSchema, type Scenario, type ScenarioRecord, type ScenarioRun, type ScenarioProvenance } from '@card-game/protocol';
import { getBlueprint } from '@card-game/engine/library/card-catalog';
import { buildScenarioRoom, scenarioRandom } from '@card-game/engine/engine/scenario-setup';
import type { ScenarioRepository } from './repository';
import type { RoomRuntime } from '../rooms/room-runtime';
import type { AuthService } from '../auth/service';
import type { ServerConfig } from '../config';
import type { SessionRecord } from '../auth/account-store';
import { AuthError } from '../auth/errors';
export const scenariosEnabled = (config: ServerConfig) => config.lab.enabled && config.navigation.purpose === 'lab' && config.inspectionEnabled;
export class ScenarioService {
    private runs = new Map<string, ScenarioRun>();
    private pendingRemovals: string[] | null = null;
    constructor(readonly repository: ScenarioRepository, private runtime: RoomRuntime, private auth: AuthService, private config: ServerConfig, private now = Date.now) { }
    atomic<T>(operation: () => T): T {
        const previous = structuredClone(this.runs);
        this.pendingRemovals = [];
        let result: T;
        try {
            result = this.repository.scenarioTransaction(() => this.auth.sessions.atomic(operation));
        }
        catch (error) {
            for (const id of this.runs.keys())
                if (!previous.has(id) && this.runtime.isTestRoom(id))
                    this.runtime.removeTestRoom(id);
            this.runs = previous;
            this.pendingRemovals = null;
            throw error;
        }
        const removals = this.pendingRemovals;
        this.pendingRemovals = null;
        for (const id of removals ?? [])
            this.runtime.removeTestRoom(id);
        return result;
    }
    private removeRun(id: string) { if (this.pendingRemovals)
        this.pendingRemovals.push(id);
    else
        this.runtime.removeTestRoom(id); this.runs.delete(id); }
    private validate(input: unknown): Scenario {
        const parsed = ScenarioSchema.safeParse(input);
        if (!parsed.success)
            throw new AuthError(400, 'Invalid or unsupported scenario.');
        for (const p of parsed.data.players)
            for (const entries of [p.library, p.hand, p.graveyard, p.battlefield])
                for (const e of entries)
                    try {
                        getBlueprint(e.cardId);
                    }
                    catch {
                        throw new AuthError(400, 'Unknown canonical card: ' + e.cardId);
                    }
        for (const p of parsed.data.players)
            for (const e of p.battlefield) {
                const c = getBlueprint(e.cardId);
                if (!c.cardTypes.some(t => ['Creature', 'Land', 'Artifact', 'Relic', 'Enchantment'].includes(t)) || c.subTypes?.includes('Aura'))
                    throw new AuthError(400, 'Unsupported initial battlefield card.');
            }
        return parsed.data;
    }
    get(id: string) { const r = this.repository.findScenario(id); if (!r)
        throw new AuthError(404, 'Scenario unavailable.'); return r; }
    save(input: unknown, id?: string, expectedRevision = 0, importedFrom?: ScenarioProvenance): ScenarioRecord {
        const scenario = this.validate(input), previous = id ? this.get(id) : undefined;
        if (previous && expectedRevision !== previous.revision)
            throw new AuthError(409, 'Scenario changed. Reload before saving.');
        if (!previous && this.repository.listScenarios(0, 1).total >= this.config.lab.maxScenarios)
            throw new AuthError(409, 'Scenario capacity reached.');
        const record = { id: previous?.id ?? randomUUID(), revision: (previous?.revision ?? 0) + 1, scenario, createdAt: previous?.createdAt ?? this.now(), updatedAt: this.now(), ...((previous?.importedFrom ?? importedFrom) ? { importedFrom: previous?.importedFrom ?? importedFrom } : {}) };
        if (!this.repository.saveScenario(record, previous?.revision ?? 0))
            throw new AuthError(409, 'Scenario changed. Reload before saving.');
        return record;
    }
    delete(id: string, revision: number) { this.get(id); if (!this.repository.deleteScenario(id, revision))
        throw new AuthError(409, 'Scenario changed. Reload before deletion.'); }
    listRuns() { for (const id of this.runs.keys())
        if (!this.runtime.isTestRoom(id))
            this.runs.delete(id); return structuredClone([...this.runs.values()]); }
    run(id: string) { this.listRuns(); const r = this.runs.get(id); if (!r)
        throw new AuthError(404, 'Test room unavailable.'); return structuredClone(r); }
    launch(id: string, revision: number, participants: [
        string,
        string
    ], actorId: string) {
        const record = this.get(id);
        if (record.revision !== revision)
            throw new AuthError(409, 'Launch requires the current saved revision.');
        return this.createRun(record, participants, actorId);
    }
    private createRun(record: ScenarioRecord, participants: [
        string,
        string
    ], actorId: string, replacing = false) {
        if (participants[0] === participants[1] || participants.some(id => { const a = this.auth.repository.findAccount(id); return !a || a.disabled; }))
            throw new AuthError(400, 'Choose two distinct enabled lab accounts.');
        if (this.listRuns().length - (replacing ? 1 : 0) >= this.config.lab.maxRooms)
            throw new AuthError(409, 'Test room capacity reached.');
        const roomId = randomUUID(), players: [
            string,
            string
        ] = [randomUUID(), randomUUID()];
        const room = buildScenarioRoom(roomId, players, this.validate(record.scenario), { uuid: randomUUID, random: scenarioRandom(record.scenario.seed) });
        this.runtime.installTestRoom(room, scenarioRandom(record.scenario.seed));
        const run = { roomId, scenarioId: record.id, revision: record.revision, snapshot: structuredClone(record.scenario), participants: [...participants] as [
                string,
                string
            ], createdAt: this.now(), actorId };
        this.runs.set(roomId, run);
        return structuredClone(run);
    }
    stop(id: string) { this.run(id); this.removeRun(id); }
    reset(id: string, actorId: string) {
        const old = this.run(id);
        // Reset uses the launch snapshot even if the source was edited/deleted.
        // Build first; a setup/capacity failure must preserve the existing room.
        const next = this.createRun({ id: old.scenarioId, revision: old.revision, scenario: old.snapshot, createdAt: old.createdAt, updatedAt: old.createdAt }, old.participants, actorId, true);
        this.removeRun(id);
        return next;
    }
    claim(id: string, session: SessionRecord) {
        const run = this.run(id);
        if (session.scope !== 'game' || session.kind === 'browser' || session.subject.kind !== 'account')
            throw new AuthError(403, 'Use a signed-in lab game tab.');
        const index = run.participants.indexOf(session.subject.id);
        if (index < 0)
            throw new AuthError(403, 'This account is not assigned to this test room.');
        // Room players are generated by the server and never accepted from a request.
        const room = this.runtimeRoom(id);
        const playerId = index === 0 ? room.player1Id : room.player2Id!;
        this.auth.claimSeat(session, id, playerId);
        return this.auth.info(session, id);
    }
    private runtimeRoom(id: string) { const room = this.runtime.testRoom(id); if (!room)
        throw new AuthError(404, 'Test room unavailable.'); return room; }
}
