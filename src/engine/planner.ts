// Real-life force-win planner: pure decision layer.
//
// Deterministic lookup: the real winner (from the manual winners file) is
// the winner. No disparity math, no probability curve, no RNG.
//
// Matching:
//   - Both teams mapped -> pair lookup by (teams, week ±1).
//   - One side generic in-game FCS ("FCS ...") -> match by (FBS team + week):
//     find the winners-file entry that week involving the FBS team.
//   - Else -> unmatched (skipped, reported).

import type { DynastyGame, ForceWinAssignment, PlanSummary } from '../types.js';
import type { ParsedWin } from '../reallife/winners.js';

export interface PlanInput {
  games: readonly DynastyGame[];
  /** real team name -> in-game DisplayName */
  teamMap: ReadonlyMap<string, string>;
  wins: readonly ParsedWin[];
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

/** In-game generic FCS teams: DisplayName starts with "FCS ". */
export function isGenericFcs(inGameName: string): boolean {
  return norm(inGameName).startsWith('fcs ');
}

function protectionReason(g: DynastyGame, ccgWeek: number): string | null {
  if (g.isPostseasonLinked) return 'postseason';
  if (g.week === ccgWeek) return 'conference championship week';
  return null;
}

export interface PlanResult {
  assignments: ForceWinAssignment[];
  summary: PlanSummary;
  unmatched: { week: number; homeName: string; awayName: string; reason: string }[];
}

export function planRealLifeForceWin(input: PlanInput): PlanResult {
  const assignments: ForceWinAssignment[] = [];
  const unmatched: PlanResult['unmatched'] = [];
  const summary: PlanSummary = {
    gamesFound: 0,
    gamesSkippedPlayed: 0,
    gamesSkippedForced: 0,
    gamesSkippedUser: 0,
    gamesSkippedProtected: 0,
    gamesNoRealMatch: 0,
    forceWinsApplied: 0,
  };

  // reverse map: in-game name -> real name
  const realByInGame = new Map<string, string>();
  for (const [real, inGame] of input.teamMap) realByInGame.set(inGame, real);

  // index wins by pair key
  const winsByPair = new Map<string, ParsedWin[]>();
  for (const w of input.wins) {
    const k = pairKey(w.homeTeam, w.awayTeam);
    if (!winsByPair.has(k)) winsByPair.set(k, []);
    winsByPair.get(k)!.push(w);
  }
  // index wins by real team -> entries (for FCS matching)
  const winsByTeam = new Map<string, ParsedWin[]>();
  for (const w of input.wins) {
    for (const t of [w.homeTeam, w.awayTeam]) {
      const k = norm(t);
      if (!winsByTeam.has(k)) winsByTeam.set(k, []);
      winsByTeam.get(k)!.push(w);
    }
  }

  const noMatch = (g: DynastyGame, reason: string) => {
    summary.gamesNoRealMatch++;
    unmatched.push({ week: g.week, homeName: g.homeName, awayName: g.awayName, reason });
  };

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

    const realWeek = g.week + input.weekOffset;
    const homeReal = realByInGame.get(g.homeName);
    const awayReal = realByInGame.get(g.awayName);
    const homeIsFcs = !homeReal && isGenericFcs(g.homeName);
    const awayIsFcs = !awayReal && isGenericFcs(g.awayName);

    let win: ParsedWin | null = null;

    if (homeReal && awayReal) {
      // standard: pair lookup within ±1 week
      const cands = (winsByPair.get(pairKey(homeReal, awayReal)) ?? []).filter(
        (w) => Math.abs(w.week - realWeek) <= 1,
      );
      // prefer exact week
      win = cands.find((w) => w.week === realWeek) ?? cands[0] ?? null;
    } else if ((homeIsFcs || awayIsFcs) && (homeReal || awayReal)) {
      // FCS game: match by the FBS team's real games that week
      const fbsReal = homeReal ?? awayReal!;
      const cands = (winsByTeam.get(norm(fbsReal)) ?? []).filter((w) => Math.abs(w.week - realWeek) <= 1);
      const exact = cands.filter((w) => w.week === realWeek);
      const pool = exact.length ? exact : cands;
      if (pool.length === 1) {
        win = pool[0];
      } else if (pool.length > 1) {
        noMatch(g, `FBS team ${fbsReal} has ${pool.length} real games near week ${realWeek}`);
        continue;
      }
    }

    if (!win) {
      noMatch(g, homeIsFcs || awayIsFcs ? 'FCS game, no real game for the FBS team that week' : 'no winners-file entry for this matchup');
      continue;
    }

    // Dynasty value is relative to the DYNASTY home team, by identity.
    const winnerInGame = input.teamMap.get(win.winner);
    let value: 'Home' | 'Away';
    if (winnerInGame) {
      value = winnerInGame === g.homeName ? 'Home' : 'Away';
    } else {
      // winner is a real FCS school: the FBS side lost -> winner is the
      // dynasty FCS side
      const fbsInGame = input.teamMap.get(win.homeTeam === win.winner ? win.awayTeam : win.homeTeam);
      value = fbsInGame === g.homeName ? 'Away' : 'Home';
    }

    assignments.push({
      gameIndex: g.index,
      value,
      week: g.week,
      homeName: g.homeName,
      awayName: g.awayName,
      winnerName: value === 'Home' ? g.homeName : g.awayName,
      realScore: `${win.awayTeam} @ ${win.homeTeam}`,
    });
    summary.forceWinsApplied++;
  }

  return { assignments, summary, unmatched };
}
