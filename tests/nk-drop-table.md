# Eternum necklace drop table - SPEC D (user, 2026-11-18 5:44/5:45 PM CT; local, not deployed)

Rule: necklace (any of 7) <= 0.5x the Prismatic item chance from the same source, everywhere except act x3+3 (20%, 0.67x). Prismatic chance = P(at least one Prismatic item) per kill/chest at depth 101-110, from the loot formulas' exact per-roll Prismatic probabilities over 563,063 real kills/chests (tests/nk-pris-ref.json). Prismatic odds only rise deeper, so the rule holds at every depth.

NK_BASE 0.000012, NK_BASE_E 8.9e-7. 10,000 players on 7,200 real floors.

All seven: {"mean":778.1,"median":729,"p10":452,"p90":1172}
Prismatic Eternum extra depths: {"mean":499.4,"median":347,"p10":55,"p90":1132}
Prismatic Eternum depth: {"mean":1277.6,"median":1150,"p10":670,"p90":2035}
Necklace drops per depth: 0.0279

| Source | Necklace, any of the 7 | One specific | Prismatic Eternum (all 7 owned) | Prismatic item chance (depth 101-110) | Necklace ÷ Prismatic | Share of drops |
|---|---|---|---|---|---|---|
| normal | 0.0015% | 1 in 455,729 | 1 in 877,809 | 0.0031% | 0.50x | 1.5% |
| rare pack | 0.0045% | 1 in 154,321 | 1 in 297,247 | 0.0091% | 0.50x | 1.5% |
| elite | 0.0093% | 1 in 75,269 | 1 in 144,980 | 0.0186% | 0.50x | 7.3% |
| vault chest r0 | 0.0128% | 1 in 54,773 | 1 in 105,502 | 0.0256% | 0.50x | 0.2% |
| chest r0 | 0.0134% | 1 in 52,364 | 1 in 100,861 | 0.0304% | 0.44x | 0.5% |
| chest r1 | 0.0201% | 1 in 34,909 | 1 in 67,241 | 0.0430% | 0.47x | 0.5% |
| vault chest r1 | 0.0230% | 1 in 30,461 | 1 in 58,673 | 0.0460% | 0.50x | 0.6% |
| chest r2 | 0.0313% | 1 in 22,384 | 1 in 43,116 | 0.0626% | 0.50x | 2.3% |
| chest r3 | 0.0410% | 1 in 17,057 | 1 in 32,854 | 0.0821% | 0.50x | 1.5% |
| mini-boss x1 | 0.0444% | 1 in 15,766 | 1 in 30,367 | 0.0906% | 0.49x | 0.0% |
| vault chest r2 | 0.0454% | 1 in 15,420 | 1 in 29,701 | 0.0908% | 0.50x | 1.1% |
| royal goblin | 0.0535% | 1 in 13,091 | 1 in 25,215 | 0.18% | 0.30x | 0.1% |
| mini-boss x1 +1 overshield | 0.0622% | 1 in 11,261 | 1 in 21,691 | 0.13% | 0.47x | 0.0% |
| mini-boss x1 +2 overshield | 0.0799% | 1 in 8,759 | 1 in 16,871 | 0.16% | 0.50x | 0.0% |
| super elite | 0.0802% | 1 in 8,727 | 1 in 16,810 | 0.62% | 0.13x | 3.9% |
| vault chest r3 | 0.0808% | 1 in 8,665 | 1 in 16,690 | 0.16% | 0.50x | 1.2% |
| mini-boss x1 +3 overshield | 0.0977% | 1 in 7,166 | 1 in 13,803 | 0.22% | 0.44x | 0.3% |
| chest r4 | 0.11% | 1 in 6,545 | 1 in 12,608 | 0.23% | 0.46x | 1.8% |
| ultra elite | 0.13% | 1 in 5,236 | 1 in 10,086 | 1.1% | 0.13x | 0.5% |
| vault chest r4 | 0.16% | 1 in 4,363 | 1 in 8,403 | 0.32% | 0.50x | 1.2% |
| goblin (loot/gem/gold) | 0.17% | 1 in 4,188 | 1 in 8,066 | 1.5% | 0.11x | 5.8% |
| mini-boss x2 +3 overshield | 0.20% | 1 in 3,583 | 1 in 6,902 | 0.46% | 0.43x | 0.6% |
| hunter | 0.23% | 1 in 2,991 | 1 in 5,762 | 2.6% | 0.09x | 0.2% |
| mini-boss x3 +3 overshield | 0.29% | 1 in 2,389 | 1 in 4,601 | 0.68% | 0.43x | 0.9% |
| goblin king | 0.40% | 1 in 1,745 | 1 in 3,362 | 2.6% | 0.15x | 0.1% |
| act boss x1 | 3.0% | 1 in 233 | 1 in 449 | 8.1% | 0.37x | 3.7% |
| act boss x1 +1 overshield | 3.8% | 1 in 187 | 1 in 360 | 9.1% | 0.41x | 3.5% |
| act boss x1 +2 overshield | 4.5% | 1 in 156 | 1 in 300 | 10.2% | 0.44x | 3.3% |
| act boss x2 | 5.3% | 1 in 133 | 1 in 257 | 15.7% | 0.33x | 8.0% |
| act boss x1 +3 overshield | 5.3% | 1 in 133 | 1 in 257 | 10.9% | 0.48x | 2.0% |
| act boss x2 +1 overshield | 6.6% | 1 in 107 | 1 in 205 | 17.6% | 0.37x | 6.3% |
| act boss x3 | 7.5% | 1 in 93 | 1 in 180 | 22.5% | 0.33x | 9.0% |
| act boss x2 +2 overshield | 7.9% | 1 in 89 | 1 in 171 | 19.4% | 0.41x | 5.5% |
| act boss x2 +3 overshield | 9.2% | 1 in 76 | 1 in 147 | 21.1% | 0.43x | 2.7% |
| act boss x3 +1 overshield | 9.4% | 1 in 75 | 1 in 144 | 25.1% | 0.37x | 9.4% |
| act boss x3 +2 overshield | 11.3% | 1 in 62 | 1 in 120 | 27.4% | 0.41x | 7.6% |
| act boss x3 +3 overshield | 20.0% | 1 in 35 | 1 in 67 | 29.9% | 0.67x | 5.2% |

Earlier versions: A nk-rework-R.json, B nk-rework-B.json, C nk-rework-C-final.json
