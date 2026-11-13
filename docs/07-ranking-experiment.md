# Optional Elo-style ranking experiment

Discovery currently filters for reciprocal preferences and municipality, then pages by member ID. The Elo-style module is offline only. It compares two ranking strategies on an aggregate outcome and assigns ratings to the strategies. It never scores individual members or changes the live deck.

`compareStrategies` starts each strategy at 1500 and updates both ratings from observed success rates and the rating difference. The update size grows with the smaller of the gym capacity, eligible members, and opted-in members, within a fixed cap. An update requires a pool of at least 50, 40 distinct participants and 30 observations per arm. These are development thresholds, not evidence of statistical significance. The expected-score calculation borrows the Elo idea of converting rating differences into expected outcomes. [FIDE rating regulations](https://handbook.fide.com/chapter/B022024)

If running a future experiment, use randomized assignments, a fixed evaluation window and a predeclared outcome such as reciprocal matches per eligible opportunity. Supply aggregate counts from consented exposure and outcome events, deduplicated at ingestion. Use gym size only when capacity is known and participation is explicitly consented. Keep gym memberships and small counts out of client responses. Use broader regional cohorts when individual gyms cannot meet thresholds. Unknown capacity and sparse cohorts leave the control unchanged. Review exposure distribution, safety outcomes, and uncertainty before any rollout decision.

Run `node --test packages/ranking/elo.test.mjs` from the repository root.
