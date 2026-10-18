// Manual winners file: the source of truth for real-life results.
//
// Updated by hand each week. Format:
//
//   {
//     "season": 2026,
//     "weeks": {
//       "1": [
//         { "matchup": "Texas @ Ohio State", "winner": "Ohio State" },
//         { "matchup": "Mercer @ Alabama", "winner": "Alabama" }
//       ]
//     }
//   }
//
// - `matchup` is "AWAY @ HOME" in real-life team names (full names as they
//   appear in the team map, e.g. "Ohio State Buckeyes").
// - `winner` is the full real-life name of the winning team.
// - FCS games: list the REAL FCS school (e.g. "Mercer"). The matcher pairs
//   them to the in-game generic FCS team by (FBS team + week).
// - Only completed games go in. If it's not in the file, it's not forced.

import { readFileSync } from 'node:fs';

export interface WinnersFile {
  season: number;
  weeks: Record<string, { matchup: string; winner: string }[]>;
}

export interface ParsedWin {
  awayTeam: string; // real name, trimmed
  homeTeam: string; // real name, trimmed
  winner: string; // real name, trimmed
  week: number; // 1-based real week
}

export function loadWinnersFile(path: string): WinnersFile {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as WinnersFile;
  if (!raw.weeks) throw new Error(`${path}: missing "weeks"`);
  return raw;
}

/** "Texas @ Ohio State" -> { away: "Texas", home: "Ohio State" } */
export function parseMatchup(matchup: string): { away: string; home: string } {
  const parts = matchup.split('@');
  if (parts.length !== 2) throw new Error(`bad matchup (want "AWAY @ HOME"): ${matchup}`);
  const [away, home] = parts.map((s) => s.trim());
  if (!away || !home) throw new Error(`bad matchup (want "AWAY @ HOME"): ${matchup}`);
  return { away, home };
}

export function parseWinnersFile(path: string): ParsedWin[] {
  const file = loadWinnersFile(path);
  const out: ParsedWin[] = [];
  for (const [weekStr, games] of Object.entries(file.weeks)) {
    const week = Number(weekStr);
    for (const g of games) {
      const { away, home } = parseMatchup(g.matchup);
      const winner = g.winner.trim();
      if (winner !== away && winner !== home) {
        throw new Error(`week ${week}: winner "${g.winner}" not in matchup "${g.matchup}"`);
      }
      out.push({ awayTeam: away, homeTeam: home, winner, week });
    }
  }
  return out;
}
