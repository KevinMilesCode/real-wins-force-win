// Real-life force-win tool: types.

/** One real-life completed game. */
export interface RealGame {
  homeTeam: string; // normalized, e.g. "Ohio State"
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  /** real-life week (1-based) */
  week: number;
  neutralSite: boolean;
  postseason: boolean;
}

/** One dynasty schedule row, reduced to plain data. */
export interface DynastyGame {
  /** SeasonGame row index */
  index: number;
  seasonYear: number; // internal counter
  week: number; // 0-based
  weekType: string; // 'RegularSeason' | ...
  status: string; // 'Unplayed' | ...
  forceWin: string; // 'None' | 'Home' | 'Away'
  isPostseasonLinked: boolean;
  homeTeamRow: number;
  awayTeamRow: number;
  homeName: string;
  awayName: string;
}

export interface ForceWinAssignment {
  gameIndex: number;
  value: 'Home' | 'Away';
  week: number;
  homeName: string;
  awayName: string;
  winnerName: string;
  realScore: string; // "35-28"
}

export interface PlanSummary {
  gamesFound: number;
  gamesSkippedPlayed: number;
  gamesSkippedForced: number;
  gamesSkippedUser: number;
  gamesSkippedProtected: number;
  gamesNoRealMatch: number;
  gamesRealNotPlayed: number;
  forceWinsApplied: number;
}

/** Pluggable real-life data source. */
export interface RealLifeSource {
  name: string;
  /** completed games for a real-life week (1-based) */
  fetchWeek(week: number): Promise<RealGame[]>;
}
