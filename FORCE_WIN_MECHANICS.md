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

### 1. Winners file (manual — Kevin's call, no API)
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
  offset (dynasty week 0 == real week 1; verify against the save).
- **One side generic in-game FCS** (`DisplayName` starts with `"FCS "`):
  match by **(FBS team + week)** — find the winners-file entry that week
  involving the FBS team. The real FCS school name in the file is irrelevant
  to matching; only the FBS side matters.
- **Neither side mapped / ambiguous** → skip, reported as unmatched.

Neutral-site games match on pair regardless of home/away order; the winner
is resolved by team identity, not position, so designation flips don't matter.

### 4. Timing: one run at dynasty week 0 (preseason)
Fill `winners.json` with every completed real-life result, run once before
the season starts. Every dynasty game with a real result gets forced; games
with no real result yet are left alone to sim naturally. (Re-running stays
idempotent — already-forced/played games are skipped — but the intended flow
is a single preseason pass.)

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
