import type { ScenarioRecord } from '@card-game/protocol';
export interface ScenarioRepository {
    scenarioTransaction<T>(operation: () => T): T;
    listScenarios(offset: number, limit: number): {
        records: ScenarioRecord[];
        total: number;
    };
    findScenario(id: string): ScenarioRecord | undefined;
    saveScenario(record: ScenarioRecord, expectedRevision: number): boolean;
    deleteScenario(id: string, expectedRevision: number): boolean;
}
export class MemoryScenarioRepository implements ScenarioRepository {
    private records = new Map<string, ScenarioRecord>();
    scenarioTransaction<T>(operation: () => T): T { const previous = structuredClone(this.records); try {
        return operation();
    }
    catch (e) {
        this.records = previous;
        throw e;
    } }
    listScenarios(offset: number, limit: number) { const records = [...this.records.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)); return { records: structuredClone(records.slice(offset, offset + limit)), total: records.length }; }
    findScenario(id: string) { const r = this.records.get(id); return r && structuredClone(r); }
    saveScenario(record: ScenarioRecord, expectedRevision: number) { if ((this.records.get(record.id)?.revision ?? 0) !== expectedRevision)
        return false; this.records.set(record.id, structuredClone(record)); return true; }
    deleteScenario(id: string, expectedRevision: number) { return this.records.get(id)?.revision === expectedRevision && this.records.delete(id); }
}
