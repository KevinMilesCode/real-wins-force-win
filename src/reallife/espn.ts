// ESPN scoreboard data source (free, keyless).
//
// Unofficial API; for v1 use. Falls back to CFBD (keyed) if ESPN changes.
// We only need winners, not margins.

import type { RealGame, RealLifeSource } from '../types.js';

interface EspnTeam {
  displayName: string;
  name: string;
  abbreviation: string;
}
interface EspnCompetitor {
  homeAway: 'home' | 'away';
  winner: boolean;
  score: string;
  team: EspnTeam;
}
interface EspnEvent {
  name: string;
  date: string;
  status: { type: { completed: boolean } };
  neutralSite: boolean;
  season: { type: number }; // 2 = regular season, 3 = postseason
  week: { number: number };
  competitions: [{ competitors: EspnCompetitor[]; neutralSite: boolean }];
}

/** Minimal cleanup of ESPN names. The teams.json mapping (full ESPN name ->
 * in-game DisplayName) is the source of truth; the CLI warns on unmapped. */
export function normalizeTeamName(full: string): string {
  return full
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/’/g, "'")
    .replace(/^Texas A&M.*/i, 'Texas A&M Aggies');
}

export class EspnSource implements RealLifeSource {
  name = 'espn';
  constructor(private season: number = 2026) {}

  async fetchWeek(week: number): Promise<RealGame[]> {
    const url =
      `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard` +
      `?seasontype=2&week=${week}&year=${this.season}&groups=80&limit=200`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ESPN scoreboard week ${week}: HTTP ${res.status}`);
    const data = (await res.json()) as { events: EspnEvent[] };
    const games: RealGame[] = [];
    for (const ev of data.events ?? []) {
      if (!ev.status?.type?.completed) continue;
      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const home = comp.competitors.find((c) => c.homeAway === 'home');
      const away = comp.competitors.find((c) => c.homeAway === 'away');
      if (!home || !away) continue;
      games.push({
        homeTeam: normalizeTeamName(home.team.displayName || home.team.name),
        awayTeam: normalizeTeamName(away.team.displayName || away.team.name),
        homeScore: parseInt(home.score, 10),
        awayScore: parseInt(away.score, 10),
        week: ev.week?.number ?? week,
        neutralSite: !!comp.neutralSite,
        postseason: ev.season?.type === 3,
      });
    }
    return games;
  }
}
