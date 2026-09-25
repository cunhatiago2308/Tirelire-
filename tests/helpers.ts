/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlValue } from '../src/db/types.ts';
import { migrate } from '../src/db/schema.ts';

/** In-memory database exposing the same async API as expo-sqlite. */
export async function makeDb(): Promise<Db> {
  const raw = new DatabaseSync(':memory:');
  const db: Db = {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, params: SqlValue[]) {
      const r = raw.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getAllAsync<T>(sql: string, params: SqlValue[]) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[]) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async withTransactionAsync(task) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  await migrate(db);
  return db;
}
