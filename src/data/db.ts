/**
 * "Banco" local em localStorage. Camada temporária até existir o back-end (ADR-001).
 * Toda leitura/escrita passa por aqui; telas NUNCA acessam localStorage diretamente —
 * elas usam os hooks de `src/data/hooks`, que chamam `src/data/services`.
 */
import type { BaseEntity, Database, ID, TableName } from "./types";
import { createSeed, SEED_VERSION } from "./seed";

const STORAGE_KEY = "draw:db";
export const ORG_ID = "org_draw";

let memory: Database | null = null;
const listeners = new Set<() => void>();

const isBrowser = () => typeof window !== "undefined";

export function loadDb(): Database {
  if (memory) return memory;
  if (isBrowser()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Database;
        if (parsed.version === SEED_VERSION) {
          memory = parsed;
          return memory;
        }
      }
    } catch {
      /* armazenamento indisponível ou corrompido → recria a seed */
    }
  }
  memory = createSeed();
  persist();
  return memory;
}

function persist() {
  if (!isBrowser() || !memory) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    /* cota excedida: mantém em memória */
  }
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Executa uma mutação atômica ("transação") e persiste. */
export function transaction<T>(fn: (db: Database) => T): T {
  const db = loadDb();
  const snapshot = JSON.stringify(db);
  try {
    const result = fn(db);
    persist();
    listeners.forEach((l) => l());
    return result;
  } catch (err) {
    memory = JSON.parse(snapshot) as Database; // rollback
    throw err;
  }
}

export function resetDb() {
  memory = createSeed();
  persist();
  listeners.forEach((l) => l());
}

/* ───────────── utilidades de tabela ───────────── */

let counter = 0;
/** Gera um id ordenável no tempo (inspirado em uuid v7). */
export function newId(prefix = ""): ID {
  counter = (counter + 1) % 4096;
  const ts = Date.now().toString(16).padStart(12, "0");
  const rand = Math.random().toString(16).slice(2, 14).padEnd(12, "0");
  const c = counter.toString(16).padStart(3, "0");
  const raw = `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${c}-${rand.slice(0, 4)}-${rand.slice(4, 12)}0000`;
  return prefix ? `${prefix}_${raw}` : raw;
}

export const nowIso = () => new Date().toISOString();

export function baseFields(actorId: ID | null): BaseEntity {
  const now = nowIso();
  return {
    id: newId(),
    organizationId: ORG_ID,
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    deletedAt: null,
  };
}

export function alive<T extends { deletedAt: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deletedAt);
}

export function findById<K extends TableName>(db: Database, table: K, id: ID | null | undefined) {
  if (!id) return undefined;
  return (db[table] as unknown as BaseEntity[]).find((r) => r.id === id) as
    | Database[K][number]
    | undefined;
}
