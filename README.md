# cfb27-force-win

Mirror real-life college football results in a CFB27 dynasty by writing
`SeasonGame.ForceWin` — the game's own result-steering field — on schedule rows.

Unlike the ratings-based force-win tool (disparity math + probability curve),
this is deterministic: the real winner is the winner. No RNG.

## Run

```sh
npm install
npm run dev
```

Weekly flow: after each real-life week, run the tool, preview the forced games,
confirm, then sim that dynasty week. Re-running is idempotent.

## Layout

- `src/cli.ts` — interactive: save → team map → fetch real results → preview → confirm → write
- `src/reallife/espn.ts` — ESPN scoreboard source (free, keyless)
- `src/engine/planner.ts` — pure: match dynasty games to real games, assign winners
- `src/saveio/io.ts` — read SeasonGame/Team, write ForceWin with snapshot validation
- `teams.json` — ESPN full name → in-game DisplayName map (fill in from CLI warnings)
- `FORCE_WIN_MECHANICS.md` — what we learned from the vendored tool + what the
  real-life version needs
