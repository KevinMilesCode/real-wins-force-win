// force-win CLI: real-life results -> ForceWin assignments.
//
// Flow:
//   1. save path -> read schedule
//   2. fetch real-life results (ESPN) for weeks up to the current real week
//   3. plan (dry run) -> preview forced games
//   4. confirm -> write SeasonGame.ForceWin -> backup
//
// Idempotent: re-running skips already-forced/played games. Run weekly.

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { EspnSource } from './reallife/espn.js';
import { planRealLifeForceWin } from './engine/planner.js';
import { openSave, readSchedule, writeForceWins } from './saveio/io.js';
import type { RealGame } from './types.js';

const rl = createInterface({ input, output });
const ask = (q: string) => rl.question(q);
async function confirm(q: string): Promise<boolean> {
  const a = (await ask(`${q} [y/N] `)).trim().toLowerCase();
  return a === 'y' || a === 'yes';
}

async function main(): Promise<void> {
  console.log('CFB27 Force Win — real-life results\n');

  const savePath = (await ask('Dynasty save path: ')).trim();
  if (!savePath) throw new Error('no save path given');

  console.log('Opening save…');
  const file = await openSave(savePath);
  const sched = await readSchedule(file);
  console.log(`  ${sched.games.length} schedule rows, current week ${sched.currentWeek}`);

  // team mapping: real ESPN name -> in-game DisplayName
  const mapPath = (await ask('Team map file [teams.json]: ')).trim() || 'teams.json';
  let teamMap = new Map<string, string>();
  if (existsSync(mapPath)) {
    const raw = JSON.parse(readFileSync(mapPath, 'utf8'));
    teamMap = new Map(Object.entries(raw).filter(([k]) => !k.startsWith('_')) as [string, string][]);
  } else {
    console.log('  no team map — every game will be unmatched. Create teams.json first.');
  }

  const season = Number((await ask('Real-life season year [2026]: ')).trim() || 2026);
  const thruWeek = Number((await ask('Fetch real results thru week [7]: ')).trim() || 7);
  const source = new EspnSource(season);

  console.log('Fetching real-life results…');
  const realGames: RealGame[] = [];
  for (let w = 1; w <= thruWeek; w++) {
    const gs = await source.fetchWeek(w);
    console.log(`  week ${w}: ${gs.length} completed games`);
    realGames.push(...gs);
  }

  // warn on real teams with no mapping
  const seenReal = new Set(realGames.flatMap((g) => [g.homeTeam, g.awayTeam]));
  for (const name of [...seenReal].sort()) {
    if (!teamMap.has(name)) console.log(`  unmapped real team: ${name}`);
  }

  const forceUser = await confirm('Force user-team games too?');
  const plan = planRealLifeForceWin({
    games: sched.games,
    teamMap,
    realGames,
    userTeams: sched.userTeams,
    forceUserGames: forceUser,
    conferenceChampionshipWeek: sched.conferenceChampionshipWeek,
    weekOffset: 1, // dynasty week 0 == real week 1
  });

  console.log('\n--- FORCE-WIN PREVIEW ---');
  for (const a of plan.assignments) {
    console.log(`  wk${a.week} ${a.awayName} @ ${a.homeName} -> ${a.winnerName} wins (${a.realScore})`);
  }
  const s = plan.summary;
  console.log(
    `\nforcing ${s.forceWinsApplied} games | skipped: played ${s.gamesSkippedPlayed}, ` +
      `forced ${s.gamesSkippedForced}, user ${s.gamesSkippedUser}, protected ${s.gamesSkippedProtected} | ` +
      `no real match ${s.gamesNoRealMatch}`,
  );
  if (plan.unmatched.length) {
    console.log('unmatched (no real-life counterpart):');
    for (const u of plan.unmatched.slice(0, 10)) console.log(`  wk${u.week} ${u.awayName} @ ${u.homeName}`);
    if (plan.unmatched.length > 10) console.log(`  …and ${plan.unmatched.length - 10} more`);
  }

  if (!plan.assignments.length) {
    console.log('Nothing to force.');
    return;
  }
  if (!(await confirm('\nWrite these ForceWin assignments to the save?'))) {
    console.log('Aborted — save untouched.');
    return;
  }

  const result = await writeForceWins(file, savePath, plan.assignments);
  console.log(`Done. ${result.written} games forced. Backup: ${result.backupPath}`);
  writeFileSync(
    'forcewin-manifest.json',
    JSON.stringify({ createdAt: new Date().toISOString(), season, thruWeek, assignments: plan.assignments, summary: s }, null, 2),
  );
}

main()
  .catch((e) => {
    console.error('FATAL', e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(() => rl.close());
