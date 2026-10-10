# Force-Win Mechanics — What We Need for the Real-Life Version

## The core mechanic (from the vendored tool)

CFB27 has a native `SeasonGame.ForceWin` enum field (`'None' | 'Home' | 'Away'`).
Writing `'Home'` or `'Away'` on a schedule row **pre-decides that game's simmed
result in the favorite's favor without touching a single player rating**.
This is the game's own steering mechanism — the vendored tool
(`cfb27-force-win` v0.5, ArtVsTheWorld/"Ace", MIT, already ported in
`CFB27-Dynasty-Engine-Dev/app/src/engine/forceWin.ts`) uses it, and so will we.

The write is surgical: only the `ForceWin` field changes. The ported writer
validates with a before/after snapshot that nothing else on the row moved
(`HomeTeam`, `AwayTeam`, `SeasonYear`, `SeasonWeek`, `SeasonWeekType`,
`GameStatus`, `HomeScore`, `AwayScore`, `BowlGame` must be byte-identical).

## How the ratings-based tool decides (what we're replacing)

For each eligible game it computes a **disparity score** from team ratings:

- Base strength: `0.3×OVR + 0.15×OFF + 0.15×DEF + 0.4×positionComposite`
  (position composite weights QB 0.10 through DB 0.13, ST 0.05)
- Matchup advantage: passing/rushing offense vs pass/run defense + ST
- Final: `0.6×baseDiff + 0.4×matchup + homeField(±1, 0 neutral)`
- Adjustments: rivalry ×0.75 (compresses), FCS mismatch ×1.25 (when favorite
  is >5 OVR better)
- Probability curve: disparity 4.5→10%, 10→50%, 17→85%, 24→95% (0 below 4.5)
- Seeded roll per game: force the favorite iff roll < probability

**We replace ALL of this with real life.** No disparity, no curve, no RNG —
the real winner is deterministic. The planner becomes a lookup, not a lottery.

## Protections (keep these)

The vendored tool skips a game when any of these hold — all still apply:

1. Already played (`GameStatus != 'Unplayed'`) — never rewrite history
2. Already forced (`ForceWin != 'None'`) — never double-force
3. Postseason-linked (`BowlGame` ref populated) or conference-championship week
4. Either team unresolvable (missing/invalid ratings row)
5. User-controlled team involved — **open question**: still skip, or force?

New protections for the real-life version:

6. **No real-life counterpart** — dynasty matchup has no real game (fictional
   scheduling, FCS filler) → skip. Optionally fall back to ratings-based force.
7. **Real game not yet played** — only force games whose real result exists.

## Table contract

| Table | UniqueId | Fields read |
|---|---|---|
| SeasonGame | (see registry) | `HomeTeam`, `AwayTeam` (binary refs), `SeasonYear`, `SeasonWeek`, `SeasonWeekType`, `GameStatus`, `HomeScore`, `AwayScore`, `ForceWin`, `BowlGame` |
| Team | 3359508968 | `DisplayName`, `TeamIndex` (for name mapping; ratings NOT needed for real-life version) |
| SeasonInfo | 3123991521 | `CurrentWeek`, `CurrentYear` (internal season counter) |

`SeasonGame.SeasonYear` matches the internal counter (`SeasonInfo.CurrentYear`),
NOT the display year. `SeasonWeek` is 0-based. Team identity comes from
decoding the `HomeTeam`/`AwayTeam` binary refs (32-char, 15-bit tableId +
17-bit row) — the saveio layer owns this, the planner only sees team names.

## What the real-life version needs

### 1. Real-life data source
Options, easiest first:

- **ESPN scoreboard API** (free, keyless): `site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=YYYYMMDD&groups=...`
  per-week scoreboards with teams + scores + status. No auth, but unofficial.
- **CollegeFootballData (CFBD) API**: official-ish, needs free API key.
  `/games?year=2026&week=N&seasonType=regular` returns completed games with
  scores. Better structured, key required.

Recommendation: ESPN for v1 (no key, no signup), CFBD as fallback. Both give
final scores; we only need winner, not margin.

### 2. Team name mapping
Real-life names ("Ohio State Buckeyes") → in-game `DisplayName` ("Ohio State").
Needs a mapping table (~138 FBS teams). Mostly trivial string normalization
(strip mascot, handle "Texas A&M" / "Miami (FL)" / "Ole Miss" edge cases).
Ship a `teams.json` map; CLI warns on unmapped names.

### 3. Game matching
Dynasty game `(home, away, week)` → real game. Match on **team pair +
real-week window**: the dynasty week N maps to real-life week N of the 2026
season (both 0-based or both 1-based — verify against the save). Neutral-site
and rivalry games match on pair regardless of home/away order.

Edge cases:
- Dynasty has a matchup real life doesn't (conference realignment,
  user-customized schedules) → skip (protection #6)
- Real life has the matchup on a different week (bye shifts) → match within
  ±1 week window, prefer exact
- FCS opponents: real FCS results exist on ESPN/CFBD but the in-game FCS
  teams are generic ("FCS East") → skip unless mapped

### 4. Timing (key difference from the ratings tool)
The ratings tool runs **preseason** (all decisions upfront). The real-life
tool runs **weekly through the season**: each run forces only games whose
real counterpart has a final score. Re-running is idempotent (skips already-
forced/played games). Recommended: run after each real-life week, before
simming that dynasty week.

### 5. Write path (same as vendored)
`SeasonGame.ForceWin = 'Home' | 'Away'` on matched rows only. Same safety:
dry-run preview → confirm → backup → write → snapshot-validate. All-or-
nothing per run.

## Open questions for Kevin

1. **Data source**: ESPN (keyless) or CFBD (keyed, cleaner)?
2. **User teams**: force their games to real results too, or always skip?
3. **No-match games**: skip silently, or fall back to the ratings-based force
   for those?
4. **Postseason**: real-life bowls/playoff mirrored too, or regular season only?
5. **Week mapping**: verify dynasty week 0 == real week 1 (check against save).
