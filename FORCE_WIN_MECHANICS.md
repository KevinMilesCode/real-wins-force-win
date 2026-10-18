# Force-Win Mechanics

## The core mechanic

CFB27 has a native `SeasonGame.ForceWin` enum field (`'None' | 'Home' | 'Away'`).
Writing `'Home'` or `'Away'` on a schedule row **pre-decides that game's simmed
result in the favorite's favor without touching a single player rating**.
This is the game's own steering mechanism, used by the community *CFB 27
Automatic Force Win* tool (ArtVsTheWorld, MIT) that this project builds on.

The write is surgical: only the `ForceWin` field changes. The writer
validates with a before/after snapshot that nothing else on the row moved
(`HomeTeam`, `AwayTeam`, `SeasonYear`, `SeasonWeek`, `SeasonWeekType`,
`GameStatus`, `HomeScore`, `AwayScore`, `BowlGame` must be byte-identical).

## Real results instead of ratings

The upstream tool derives a win probability from team ratings and rolls a
seeded die per game. This project replaces all of that with real life: no
disparity, no curve, no RNG. The planner is a lookup, not a lottery.

## Protections

A game is skipped when any of these hold:

1. Already played (`GameStatus != 'Unplayed'`) — never rewrite history
2. Already forced (`ForceWin != 'None'`) — never double-force
3. Postseason-linked (`BowlGame` ref populated) or conference-championship week
4. Either team unresolvable (missing/invalid ratings row)
5. User-controlled team involved — forced like any other game (`forceUserGames`).

Real-life specific:

6. **No real-life counterpart** — dynasty matchup has no real game (fictional
   scheduling, FCS filler) → skip and report it as unmatched.
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

## Inputs and matching

### 1. Winners file (manual, no API)
`winners.json`, updated by hand each week:

```json
{
  "season": 2026,
  "weeks": {
    "1": [
      { "matchup": "Texas @ Ohio State", "winner": "Ohio State" },
      { "matchup": "Mercer @ Alabama", "winner": "Alabama" }
    ]
  }
}
```

- `matchup` is `"AWAY @ HOME"` in the same names used in `teams.json`.
- Only completed games go in — if it's not in the file, it's not forced.
- The CLI validates: winner must be one of the two matchup teams.

### 2. Team name mapping
`teams.json`: real name → in-game `DisplayName`. FCS schools need **no entry**
(see FCS handling below). The CLI warns on winners-file names with no mapping.

### 3. Game matching
- **Both teams mapped**: pair lookup, real week within ±1 of dynasty week +
  offset 0 (verified 2026-10-10 against a real week-0 save: dynasty week N == real-life week N; week 0 holds real week 1's Thursday/Friday games, covered by the ±1 window).
- **One side generic in-game FCS** (`DisplayName` starts with `"FCS "`):
  match by **(FBS team + week)** — find the winners-file entry that week
  involving the FBS team. The real FCS school name in the file is irrelevant
  to matching; only the FBS side matters.
- **Neither side mapped / ambiguous** → skip, reported as unmatched.

Neutral-site games match on pair regardless of home/away order; the winner
is resolved by team identity, not position, so designation flips don't matter.

### 4. Pre-decided quirk rows (reset option)
A week-0 save can carry rows the game pre-decided: `GameStatus` is
`HomeWon`/`AwayWon` with `IsSimmed=true` and real-looking scores (in the
verified save: the 11-game 8/29 slate), even though the season hasn't
started. The upstream tool skips these (`status !== 'Unplayed'`), and
`ForceWin` on an already-simmed row likely no-ops in-game anyway.

With `resetPredecided` on, a matched quirk row is reverted first —
`GameStatus` → `Unplayed`, `IsSimmed` → false, all scores/quarters/OT and
`GameOfTheWeekScore` → 0 — then forced normally. Only rows with `IsSimmed=true` are ever reset; a
row the user actually played is never touched. Rows with no real result are
left alone (not wiped). The writer snapshot-validates the wider field list
on reset rows; everything else on the row must be untouched.

### 5. Write path
`SeasonGame.ForceWin = 'Home' | 'Away'` on matched rows only. Same safety:
dry-run preview → confirm → backup → write → snapshot-validate. All-or-
nothing per run.

## Design decisions

1. **Data source** — no real-time lookup; results live in a manually
   maintained `winners.json`.
2. **User teams** — their games are forced to the real result too.
3. **No-match games** — left alone and reported as unmatched with the reason.
   No ratings-based fallback.
4. **Postseason** — not applicable to a single week-0 run; postseason games
   have not been played yet.
5. **Week mapping** — `weekOffset: 0` (dynasty week N is real week N),
   verified against a real week-0 save.
