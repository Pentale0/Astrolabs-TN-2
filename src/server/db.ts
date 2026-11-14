import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadCatalog } from '../engine/catalog.ts';
import { systemClock, type Clock } from '../engine/clock.ts';
import {
  DEFAULT_CREW,
  defaultScenarioForCrew,
  generateCrewScenarioData,
} from '../engine/seed.ts';
import type {
  BadgeAwardRecord,
  CheckinRecord,
  CrewMember,
  MeasurementRecord,
  SymptomRecord,
} from '../shared/types.ts';

export class VigilDatabase {
  db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS crew_member (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        environment TEXT NOT NULL,
        baseline_mass_kg REAL NOT NULL,
        mission_start_date TEXT NOT NULL,
        avatar_color TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkin (
        id TEXT PRIMARY KEY,
        crew_id TEXT NOT NULL REFERENCES crew_member(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        note TEXT
      );

      CREATE TABLE IF NOT EXISTS measurement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        crew_id TEXT NOT NULL REFERENCES crew_member(id) ON DELETE CASCADE,
        checkin_id TEXT NOT NULL REFERENCES checkin(id) ON DELETE CASCADE,
        indicator_id TEXT NOT NULL,
        value REAL NOT NULL,
        value2 REAL,
        measured_at TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_measurement_crew_ind_time
        ON measurement (crew_id, indicator_id, measured_at);

      CREATE TABLE IF NOT EXISTS symptom_report (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        crew_id TEXT NOT NULL REFERENCES crew_member(id) ON DELETE CASCADE,
        checkin_id TEXT NOT NULL REFERENCES checkin(id) ON DELETE CASCADE,
        symptom_id TEXT NOT NULL,
        severity INTEGER NOT NULL,
        reported_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_symptom_crew_time
        ON symptom_report (crew_id, symptom_id, reported_at);

      CREATE TABLE IF NOT EXISTS badge_award (
        crew_id TEXT NOT NULL REFERENCES crew_member(id) ON DELETE CASCADE,
        badge_id TEXT NOT NULL,
        earned_at TEXT NOT NULL,
        PRIMARY KEY (crew_id, badge_id)
      );
    `);
  }

  ensureSeeded(clock: Clock = systemClock) {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM crew_member').get() as { cnt: number };
    if (row.cnt === 0) {
      this.resetAndSeedAll(clock);
    }
  }

  resetAndSeedAll(clock: Clock = systemClock) {
    const catalog = loadCatalog();
    const now = clock.now();

    this.db.exec('DELETE FROM badge_award; DELETE FROM symptom_report; DELETE FROM measurement; DELETE FROM checkin; DELETE FROM crew_member;');

    const insertCrew = this.db.prepare(`
      INSERT INTO crew_member (id, name, role, environment, baseline_mass_kg, mission_start_date, avatar_color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of DEFAULT_CREW) {
      insertCrew.run(
        c.id,
        c.name,
        c.role,
        c.environment,
        c.baseline_mass_kg,
        c.mission_start_date,
        c.avatar_color
      );
      this.applyScenarioForCrew(c, defaultScenarioForCrew(c.id), catalog, now);
    }
  }

  applyScenarioForCrew(
    crew: CrewMember,
    scenarioId: string,
    catalog = loadCatalog(),
    now = systemClock.now()
  ) {
    this.db.prepare('DELETE FROM badge_award WHERE crew_id = ?').run(crew.id);
    this.db.prepare('DELETE FROM symptom_report WHERE crew_id = ?').run(crew.id);
    this.db.prepare('DELETE FROM measurement WHERE crew_id = ?').run(crew.id);
    this.db.prepare('DELETE FROM checkin WHERE crew_id = ?').run(crew.id);

    const data = generateCrewScenarioData(crew, scenarioId, catalog, now);

    const insCk = this.db.prepare(
      'INSERT INTO checkin (id, crew_id, created_at, note) VALUES (?, ?, ?, ?)'
    );
    for (const ck of data.checkins) {
      insCk.run(ck.id, ck.crew_id, ck.created_at, ck.note);
    }

    const insM = this.db.prepare(
      'INSERT INTO measurement (crew_id, checkin_id, indicator_id, value, value2, measured_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const m of data.measurements) {
      insM.run(m.crew_id, m.checkin_id, m.indicator_id, m.value, m.value2, m.measured_at, m.status);
    }

    const insS = this.db.prepare(
      'INSERT INTO symptom_report (crew_id, checkin_id, symptom_id, severity, reported_at) VALUES (?, ?, ?, ?, ?)'
    );
    for (const s of data.symptoms) {
      insS.run(s.crew_id, s.checkin_id, s.symptom_id, s.severity, s.reported_at);
    }

    const insB = this.db.prepare(
      'INSERT OR IGNORE INTO badge_award (crew_id, badge_id, earned_at) VALUES (?, ?, ?)'
    );
    for (const b of data.badges) {
      insB.run(b.crew_id, b.badge_id, b.earned_at);
    }
  }

  listCrew(): CrewMember[] {
    return this.db
      .prepare('SELECT id, name, role, environment, baseline_mass_kg, mission_start_date, avatar_color FROM crew_member ORDER BY id')
      .all() as unknown as CrewMember[];
  }

  getCrew(crewId: string): CrewMember | null {
    const row = this.db
      .prepare('SELECT id, name, role, environment, baseline_mass_kg, mission_start_date, avatar_color FROM crew_member WHERE id = ?')
      .get(crewId) as unknown as CrewMember | undefined;
    return row ?? null;
  }

  updateCrew(
    crewId: string,
    patch: Partial<Pick<CrewMember, 'name' | 'role' | 'environment' | 'baseline_mass_kg'>>
  ): CrewMember | null {
    const existing = this.getCrew(crewId);
    if (!existing) return null;
    const updated: CrewMember = {
      ...existing,
      ...patch,
    };
    this.db
      .prepare(
        'UPDATE crew_member SET name = ?, role = ?, environment = ?, baseline_mass_kg = ? WHERE id = ?'
      )
      .run(
        updated.name,
        updated.role,
        updated.environment,
        updated.baseline_mass_kg,
        crewId
      );
    return updated;
  }

  getCrewData(crewId: string): {
    checkins: CheckinRecord[];
    measurements: MeasurementRecord[];
    symptoms: SymptomRecord[];
    badges: BadgeAwardRecord[];
  } {
    const checkins = this.db
      .prepare('SELECT id, crew_id, created_at, note FROM checkin WHERE crew_id = ? ORDER BY created_at ASC')
      .all(crewId) as unknown as CheckinRecord[];
    const measurements = this.db
      .prepare(
        'SELECT id, crew_id, checkin_id, indicator_id, value, value2, measured_at, status FROM measurement WHERE crew_id = ? ORDER BY measured_at ASC, id ASC'
      )
      .all(crewId) as unknown as MeasurementRecord[];
    const symptoms = this.db
      .prepare(
        'SELECT id, crew_id, checkin_id, symptom_id, severity, reported_at FROM symptom_report WHERE crew_id = ? ORDER BY reported_at ASC, id ASC'
      )
      .all(crewId) as unknown as SymptomRecord[];
    const badges = this.db
      .prepare('SELECT crew_id, badge_id, earned_at FROM badge_award WHERE crew_id = ? ORDER BY earned_at ASC')
      .all(crewId) as unknown as BadgeAwardRecord[];

    return { checkins, measurements, symptoms, badges };
  }

  insertCheckinBundle(
    checkin: CheckinRecord,
    measurements: Array<Omit<MeasurementRecord, 'id'>>,
    symptoms: Array<Omit<SymptomRecord, 'id'>>,
    newBadges: BadgeAwardRecord[]
  ) {
    this.db
      .prepare('INSERT INTO checkin (id, crew_id, created_at, note) VALUES (?, ?, ?, ?)')
      .run(checkin.id, checkin.crew_id, checkin.created_at, checkin.note);

    const insM = this.db.prepare(
      'INSERT INTO measurement (crew_id, checkin_id, indicator_id, value, value2, measured_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const m of measurements) {
      insM.run(m.crew_id, m.checkin_id, m.indicator_id, m.value, m.value2, m.measured_at, m.status);
    }

    const insS = this.db.prepare(
      'INSERT INTO symptom_report (crew_id, checkin_id, symptom_id, severity, reported_at) VALUES (?, ?, ?, ?, ?)'
    );
    for (const s of symptoms) {
      insS.run(s.crew_id, s.checkin_id, s.symptom_id, s.severity, s.reported_at);
    }

    const insB = this.db.prepare(
      'INSERT OR IGNORE INTO badge_award (crew_id, badge_id, earned_at) VALUES (?, ?, ?)'
    );
    for (const b of newBadges) {
      insB.run(b.crew_id, b.badge_id, b.earned_at);
    }
  }
}

export function resolveDbPath(): string {
  const dataDir = process.env.VIGIL_DATA_DIR
    ? path.resolve(process.env.VIGIL_DATA_DIR)
    : path.resolve(process.cwd(), 'data');
  return path.join(dataDir, 'vigil.db');
}
