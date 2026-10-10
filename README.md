# cfb27-force-win

Mirror real-life college football results in a CFB27 dynasty by writing
`SeasonGame.ForceWin` — the game's own result-steering field — on schedule rows.

Deterministic: the real winner (from your manual winners file) is the winner.
No RNG, no live lookups.

## Run

```sh
npm install
npm run dev
```

One run at dynasty week 0 (preseason). The tool reads the schedule from your
save, matches it against `winners.json`, previews every forced game, and
writes on your confirmation. Re-running is idempotent.

## Inputs

- `winners.json` — manually maintained real-life results, grouped by real
  week: `{ "matchup": "Texas @ Ohio State", "winner": "Ohio State" }`.
  Only completed games go in. FCS games list the real FCS school
  (`{ "matchup": "Mercer @ Alabama", "winner": "Alabama" }`) — the matcher
  pairs them to the in-game generic FCS team by (FBS team + week).
- `teams.json` — real team name → in-game DisplayName map (verified against
  a real save; FCS schools need no entry).

## Layout

- `src/cli.ts` — interactive: save → team map → winners file → preview → confirm → write → verify
- `src/reallife/winners.ts` — manual winners-file parser + validation
- `src/engine/planner.ts` — pure: match dynasty games to real games, assign winners
- `src/saveio/io.ts` — read SeasonGame/Team, write ForceWin with snapshot validation, verify writes
- `FORCE_WIN_MECHANICS.md` — mechanics, matching rules, the pre-decided quirk

## Pre-decided quirk

Week-0 saves can carry rows the game pre-decided (`IsSimmed=true` with
scores). The tool offers to reset those rows to unplayed before forcing —
see `FORCE_WIN_MECHANICS.md` §5.
