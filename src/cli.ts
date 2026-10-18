// force-win CLI: manual winners file -> ForceWin assignments.
//
// ONE run at dynasty week 0 (preseason). Loads every completed real-life
// result from the winners file and forces those matchups; games with no
// real result yet are left alone to sim naturally.

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseWinnersFile } from './reallife/winners.js';
import { planRealLifeForceWin } from './engine/planner.js';
import { openSave, readSchedule, writeForceWins, verifyForceWins } from './saveio/io.js';

const rl = createInterface({ input, output });
const ask = (q: string) => rl.question(q);
async function confirm(q: string): Promise<boolean> {
  const a = (await ask(`${q} [y/N] `)).trim().toLowerCase();
  return a === 'y' || a === 'yes';
}

/** Locate an input file: the exe's own folder first (packaged), then CWD. */
function locateFile(name: string): string | null {
  return (
    [join(dirname(process.execPath), name), join(process.cwd(), name)].find((p) => existsSync(p)) ?? null
  );
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
  let teamMap = new Map<string, string>();
  const mapPath = locateFile('teams.json');
  if (mapPath) {
    const raw = JSON.parse(readFileSync(mapPath, 'utf8'));
    teamMap = new Map(Object.entries(raw).filter(([k]) => !k.startsWith('_')) as [string, string][]);
    console.log(`  ${teamMap.size} mapped teams`);
  } else {
    console.warn('  teams.json not found — FCS-only matching will be limited.');
  }

  const winnersPath = locateFile('winners.json');
  if (!winnersPath) {
    throw new Error('winners.json not found (looked next to the executable and in the current directory)');
  }
  const wins = parseWinnersFile(winnersPath);
  console.log(`  ${wins.length} real results loaded`);

  const plan = planRealLifeForceWin({
    games: sched.games,
    teamMap,
    wins,
    userTeams: sched.userTeams,
    forceUserGames: true,
    conferenceChampionshipWeek: sched.conferenceChampionshipWeek,
    weekOffset: 0, // verified vs real save: dynasty week N == real week N
    resetPredecided: true,
  });

  const resets = plan.assignments.filter((a) => a.reset);
  const forces = plan.assignments.filter((a) => !a.reset);
  console.log('\n--- FORCE-WIN PREVIEW ---');
  for (const a of forces) {
    console.log(`  wk${a.week} ${a.awayName} @ ${a.homeName} -> ${a.winnerName} wins`);
  }
  if (resets.length) {
    console.log('\n--- RESET + FORCE (pre-decided quirk rows reverted to unplayed first) ---');
    for (const a of resets) {
      console.log(`  wk${a.week} ${a.awayName} @ ${a.homeName} -> RESET, then ${a.winnerName} wins`);
    }
  }
  const s = plan.summary;
  console.log(
    `\nforcing ${s.forceWinsApplied} games (${s.gamesReset} resets) | skipped: played ${s.gamesSkippedPlayed}, ` +
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
  if (!(await confirm('Commit to save?'))) {
    console.log('Aborted — save untouched.');
    return;
  }

  const result = await writeForceWins(file, savePath, plan.assignments);

  // verify: re-read the rows and confirm ForceWin landed
  console.log('Verifying writes…');
  const verify = await verifyForceWins(file, plan.assignments);
  const failed = verify.filter((v) => !v.ok);

  console.log('\n================ RESULT ================');
  if (!failed.length) {
    console.log(`  SUCCESS — ${verify.length} games forced${result.reset ? ` (${result.reset} quirk rows reset first)` : ''}.`);
  } else {
    console.log(`  PARTIAL — ${verify.length - failed.length} succeeded, ${failed.length} FAILED:`);
    for (const f of failed.slice(0, 10)) {
      console.log(`    ! wk${f.week} ${f.awayName} @ ${f.homeName} — expected ${f.expected}, found ${f.found}`);
    }
    if (failed.length > 10) console.log(`    …and ${failed.length - 10} more`);
  }
  if (plan.unmatched.length) {
    console.log(`  ${plan.unmatched.length} games had no real-life match (left to sim):`);
    for (const u of plan.unmatched.slice(0, 5)) {
      console.log(`    - wk${u.week} ${u.awayName} @ ${u.homeName} (${u.reason})`);
    }
    if (plan.unmatched.length > 5) console.log(`    …and ${plan.unmatched.length - 5} more`);
  }
  console.log(`  Backup: ${result.backupPath}`);
  console.log('========================================');

  writeFileSync(
    'forcewin-manifest.json',
    JSON.stringify(
      { createdAt: new Date().toISOString(), winnersFile: winnersPath, assignments: plan.assignments, summary: s, verifyFailed: failed },
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
