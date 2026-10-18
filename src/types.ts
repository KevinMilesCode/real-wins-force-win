// Real-life force-win tool: types.

/** One dynasty schedule row, reduced to plain data. */
export interface DynastyGame {
  /** SeasonGame row index */
  index: number;
  seasonYear: number; // internal counter
  week: number; // 0-based
  weekType: string; // 'RegularSeason' | ...
  status: string; // 'Unplayed' | ...
  forceWin: string; // 'None' | 'Home' | 'Away'
  /** SeasonGame.IsSimmed — true on the pre-decided "quirk" rows */
  isSimmed: boolean;
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
  /**
   * True when the row must first be reverted to unplayed (the pre-decided
   * quirk): GameStatus -> Unplayed, IsSimmed -> false, all scores -> 0.
   *
   */
  reset: boolean;
}

export interface PlanSummary {
  gamesFound: number;
  gamesSkippedPlayed: number;
  gamesSkippedForced: number;
  gamesSkippedUser: number;
  gamesSkippedProtected: number;
  gamesNoRealMatch: number;
  gamesReset: number;
  forceWinsApplied: number;
}
