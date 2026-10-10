// Save IO for the real-life force-win tool.
//
// Reads SeasonGame + Team, writes SeasonGame.ForceWin on matched rows.
// Table/field contract from FORCE_WIN_MECHANICS.md. Reuses the binary-ref
// helpers from the auto-recruit tool's table adapter.

import { createRequire } from 'node:module';
import { copyFileSync } from 'node:fs';
import type { DynastyGame, ForceWinAssignment } from '../types.js';

const require = createRequire(import.meta.url);

// SeasonGame uniqueId — confirmed against CFB27-Dynasty-Engine-Dev registry
// (app/src/saveio/cfb27/registry.ts: seasonGame: 4049338978).
// Team 3359508968, SeasonInfo 3123991521 are confirmed.
const SEASON_GAME_UID = 4049338978;
const TEAM_UID = 3359508968;
const SEASON_INFO_UID = 3123991521;

function parseRef(bin: unknown): { tableId: number; row: number } | null {
  if (typeof bin !== 'string' || bin.length < 32 || !/[1-9]/.test(bin)) return null;
  return { tableId: parseInt(bin.slice(0, 15), 2), row: parseInt(bin.slice(15), 2) };
}
function sf<T = unknown>(rec: any, field: string): T | undefined {
  try {
    return rec?.[field];
  } catch {
    return undefined;
  }
}

export async function openSave(savePath: string): Promise<any> {
  const { FranchiseFile } = require('madden-franchise');
  return new Promise((resolve, reject) => {
    const f = new FranchiseFile(savePath, { autoParse: false });
    f.on('ready', () => resolve(f));
    f.on('error', reject);
    f.parse();
  });
}

export interface ScheduleRead {
  games: DynastyGame[];
  userTeams: Set<string>;
  conferenceChampionshipWeek: number;
  currentWeek: number;
}

export async function readSchedule(file: any): Promise<ScheduleRead> {
  const sgT = file.getTableByUniqueId(SEASON_GAME_UID);
  const teamT = file.getTableByUniqueId(TEAM_UID);
  const seasonT = file.getTableByUniqueId(SEASON_INFO_UID);
  if (!sgT || !teamT) throw new Error('SeasonGame/Team tables not found (schema drift?)');
  await sgT.readRecords();
  await teamT.readRecords();
  if (seasonT) await seasonT.readRecords();

  const nameByRow = new Map<number, string>();
  const userTeams = new Set<string>();
  for (const r of teamT.records) {
    if (!r || r.isEmpty) continue;
    const name = sf<string>(r, 'DisplayName') ?? '';
    nameByRow.set(r.index ?? -1, name);
    if (sf(r, 'IsUserControlled')) userTeams.add(name);
  }

  const currentWeek = seasonT ? (sf<number>(seasonT.records[0], 'CurrentWeek') ?? 0) : 0;

  const games: DynastyGame[] = [];
  for (const row of sgT.records) {
    if (!row || row.isEmpty) continue;
    const homeRef = parseRef(sf(row, 'HomeTeam'));
    const awayRef = parseRef(sf(row, 'AwayTeam'));
    if (!homeRef || !awayRef) continue;
    const homeName = nameByRow.get(homeRef.row) ?? '';
    const awayName = nameByRow.get(awayRef.row) ?? '';
    if (!homeName || !awayName) continue;
    games.push({
      index: row.index ?? 0,
      seasonYear: sf<number>(row, 'SeasonYear') ?? 0,
      week: sf<number>(row, 'SeasonWeek') ?? 0,
      weekType: String(sf(row, 'SeasonWeekType') ?? ''),
      status: String(sf(row, 'GameStatus') ?? ''),
      forceWin: String(sf(row, 'ForceWin') ?? 'None'),
      isPostseasonLinked: !!sf(row, 'BowlGame') && sf(row, 'BowlGame') !== '0'.repeat(32),
      homeTeamRow: homeRef.row,
      awayTeamRow: awayRef.row,
      homeName,
      awayName,
    });
  }

  // TODO: conference championship week from schedule (week with CCG games)
  return { games, userTeams, conferenceChampionshipWeek: 14, currentWeek };
}

export interface WriteResult {
  backupPath: string;
  written: number;
}

/**
 * Write ForceWin on the assigned rows. All-or-nothing: validates the
 * snapshot fields are otherwise untouched before saving.
 */
export async function writeForceWins(
  file: any,
  savePath: string,
  assignments: ForceWinAssignment[],
): Promise<WriteResult> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${savePath}.bak-${stamp}`;
  copyFileSync(savePath, backupPath);

  const sgT = file.getTableByUniqueId(SEASON_GAME_UID);
  await sgT.readRecords();

  const SNAPSHOT = [
    'HomeTeam', 'AwayTeam', 'SeasonYear', 'SeasonWeek', 'SeasonWeekType',
    'GameStatus', 'HomeScore', 'AwayScore', 'BowlGame',
  ];
  for (const a of assignments) {
    const row = sgT.records[a.gameIndex];
    if (!row || row.isEmpty) throw new Error(`SeasonGame row ${a.gameIndex} missing`);
    const before = SNAPSHOT.map((f) => sf(row, f));
    row['ForceWin'] = a.value;
    const after = SNAPSHOT.map((f) => sf(row, f));
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(`row ${a.gameIndex}: non-ForceWin field changed — aborting`);
    }
  }
  await file.save();
  return { backupPath, written: assignments.length };
}
