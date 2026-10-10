// force-win CLI: manual winners file -> ForceWin assignments.
//
// ONE run at dynasty week 0 (preseason). Loads every completed real-life
// result from the winners file and forces those matchups; games with no
// real result yet are left alone to sim naturally.

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseWinnersFile } from './reallife/winners.js';
import { planRealLifeForceWin } from './engine/planner.js';
import { openSave, readSchedule, writeForceWins } from './saveio/io.js';

const rl = createInterface({ input, output });
const ask = (q: string) => rl.question(q);
async function confirm(q: string): Promise<boolean> {
  const a = (await ask(`${q} [y/N] `)).trim().toLowerCase();
  return a === 'y' || a === 'yes';
}

async function main(): Promise<void> {
  console.log('CFB27 Force Win — manual real-life winners (one run at week 0)\n');

  const savePath = (await ask('Dynasty save path: ')).trim();
  if (!savePath) throw new Error('no save path given');

  console.log('Opening save…');
  const file = await openSave(savePath);
  const sched = await readSchedule(file);
  console.log(`  ${sched.games.length} schedule rows, current week ${sched.currentWeek}`);

  // team mapping: real name -> in-game DisplayName (FCS schools need no entry)
  const mapPath = (await ask('Team map file [teams.json]: ')).trim() || 'teams.json';
  let teamMap = new Map<string, string>();
  if (existsSync(mapPath)) {
    const raw = JSON.parse(readFileSync(mapPath, 'utf8'));
    teamMap = new Map(Object.entries(raw).filter(([k]) => !k.startsWith('_')) as [string, string][]);
    console.log(`  ${teamMap.size} mapped teams`);
  } else {
    console.log('  no team map — only FCS matching will work. Create teams.json first.');
  }

  const winnersPath = (await ask('Winners file [winners.json]: ')).trim() || 'winners.json';
  const wins = parseWinnersFile(winnersPath);
  console.log(`  ${wins.length} real results loaded`);

  // warn on winners-file teams with no mapping (excluding FCS schools)
  const seenReal = new Set(wins.flatMap((w) => [w.homeTeam, w.awayTeam]));
  for (const name of [...seenReal].sort()) {
    if (!teamMap.has(name)) console.log(`  unmapped (assumed FCS): ${name}`);
  }

  const forceUser = await confirm('Force user-team games too?');
  const plan = planRealLifeForceWin({
    games: sched.games,
    teamMap,
    wins,
    userTeams: sched.userTeams,
    forceUserGames: forceUser,
    conferenceChampionshipWeek: sched.conferenceChampionshipWeek,
    weekOffset: 0, // verified vs real save: dynasty week N == real week N
  });

  console.log('\n--- FORCE-WIN PREVIEW ---');
  for (const a of plan.assignments) {
    console.log(`  wk${a.week} ${a.awayName} @ ${a.homeName} -> ${a.winnerName} wins`);
  }
  const s = plan.summary;
  console.log(
    `\nforcing ${s.forceWinsApplied} games | skipped: played ${s.gamesSkippedPlayed}, ` +
      `forced ${s.gamesSkippedForced}, user ${s.gamesSkippedUser}, protected ${s.gamesSkippedProtected} | ` +
      `no match ${s.gamesNoRealMatch}`,
  );
  if (plan.unmatched.length) {
    console.log('unmatched:');
    for (const u of plan.unmatched.slice(0, 12))
      console.log(`  wk${u.week} ${u.awayName} @ ${u.homeName} — ${u.reason}`);
    if (plan.unmatched.length > 12) console.log(`  …and ${plan.unmatched.length - 12} more`);
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
    JSON.stringify(
      { createdAt: new Date().toISOString(), winnersFile: winnersPath, assignments: plan.assignments, summary: s },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error('FATAL', e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(() => rl.close());
