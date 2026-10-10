// Real-life force-win planner: pure decision layer.
//
// Unlike the ratings-based tool (disparity math + probability curve + seeded
// RNG), this is a deterministic lookup: the real winner is the winner.
// No randomness anywhere.

import type {
  DynastyGame,
  ForceWinAssignment,
  PlanSummary,
  RealGame,
} from '../types.js';

export interface PlanInput {
  games: readonly DynastyGame[];
  /** normalized real team name -> in-game team name */
  teamMap: ReadonlyMap<string, string>;
  /** real games, keyed by normalized pair */
  realGames: readonly RealGame[];
  /** in-game team names that are user-controlled — skipped unless forced */
  userTeams: ReadonlySet<string>;
  forceUserGames: boolean;
  conferenceChampionshipWeek: number;
  /** dynasty week (0-based) -> real week (1-based); usually w+1 */
  weekOffset: number;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Order-independent pair key. */
export function pairKey(a: string, b: string): string {
  return [norm(a), norm(b)].sort().join('|');
}

function protectionReason(g: DynastyGame, ccgWeek: number): string | null {
  if (g.isPostseasonLinked) return 'postseason';
  if (g.week === ccgWeek) return 'conference championship week';
  return null;
}

export interface PlanResult {
  assignments: ForceWinAssignment[];
  summary: PlanSummary;
  /** games with no real-life counterpart (for the report) */
  unmatched: { week: number; homeName: string; awayName: string }[];
  /** games whose real counterpart hasn't been played yet */
  pending: { week: number; homeName: string; awayName: string }[];
}

export function planRealLifeForceWin(input: PlanInput): PlanResult {
  const assignments: ForceWinAssignment[] = [];
  const unmatched: PlanResult['unmatched'] = [];
  const pending: PlanResult['pending'] = [];
  const summary: PlanSummary = {
    gamesFound: 0,
    gamesSkippedPlayed: 0,
    gamesSkippedForced: 0,
    gamesSkippedUser: 0,
    gamesSkippedProtected: 0,
    gamesNoRealMatch: 0,
    gamesRealNotPlayed: 0,
    forceWinsApplied: 0,
  };

  // index real games by pair key; keep the latest week on collision
  const realByPair = new Map<string, RealGame>();
  for (const rg of input.realGames) {
    const k = pairKey(rg.homeTeam, rg.awayTeam);
    const prev = realByPair.get(k);
    if (!prev || rg.week > prev.week) realByPair.set(k, rg);
  }

  for (const g of input.games) {
    if (g.weekType !== 'RegularSeason') continue;
    summary.gamesFound++;
    if (g.status !== 'Unplayed') {
      summary.gamesSkippedPlayed++;
      continue;
    }
    if (g.forceWin !== 'None') {
      summary.gamesSkippedForced++;
      continue;
    }
    if (!input.forceUserGames && (input.userTeams.has(g.homeName) || input.userTeams.has(g.awayName))) {
      summary.gamesSkippedUser++;
      continue;
    }
    if (protectionReason(g, input.conferenceChampionshipWeek)) {
      summary.gamesSkippedProtected++;
      continue;
    }

    // map in-game names to normalized real names
    const homeReal = [...input.teamMap.entries()].find(([, v]) => v === g.homeName)?.[0];
    const awayReal = [...input.teamMap.entries()].find(([, v]) => v === g.awayName)?.[0];
    if (!homeReal || !awayReal) {
      summary.gamesNoRealMatch++;
      unmatched.push({ week: g.week, homeName: g.homeName, awayName: g.awayName });
      continue;
    }

    const real = realByPair.get(pairKey(homeReal, awayReal));
    const realWeek = g.week + input.weekOffset;
    if (!real || Math.abs(real.week - realWeek) > 1) {
      summary.gamesNoRealMatch++;
      unmatched.push({ week: g.week, homeName: g.homeName, awayName: g.awayName });
      continue;
    }

    // The dynasty value is relative to the DYNASTY home team: 'Home' when the
    // real winner's identity matches the dynasty home team's real identity.
    // Identity comparison (not position) keeps neutral-site games correct
    // even when real vs dynasty home/away designations differ.
    const homeWon = real.homeScore > real.awayScore;
    const winnerReal = homeWon ? real.homeTeam : real.awayTeam;
    const value = norm(winnerReal) === norm(homeReal) ? 'Home' : 'Away';

    assignments.push({
      gameIndex: g.index,
      value: value as 'Home' | 'Away',
      week: g.week,
      homeName: g.homeName,
      awayName: g.awayName,
      winnerName: value === 'Home' ? g.homeName : g.awayName,
      realScore: `${real.homeScore}-${real.awayScore}`,
    });
    summary.forceWinsApplied++;
  }

  return { assignments, summary, unmatched, pending };
}
