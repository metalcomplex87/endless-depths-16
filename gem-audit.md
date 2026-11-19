# Gem audit — v2 power curve (2026-11-19)

Requested by Metal Complex (voice, 2026-11-19): the best gems added only a trivial amount over the weakest. Now every rarity step is a clear jump, Prismatic is a big jump on top, and gems stay a secondary layer next to gear.

**Retroactive.** A gem stores only its type, rarity and stars (bag gems: `gt`, `rar`, `gs`; socketed: `{typ, rar, s}`). Every number below is computed at runtime from those, so gems already in the bag and gems already socketed in equipped or stashed gear use the new values as soon as a save loads. No save migration and no storage key changes (`ed16_` keys unchanged).

## Gem power

`power = tier × (1 + 0.15 × stars)`

- Tier: each rarity is **×1.5** the one below. Chipped 1, Fine 1.5, Clear 2.25, Bright 3.38, Vivid 5.06, Royal 7.59, Imperial 11.39. Prismatic is a further **×2.25** over Imperial, so 25.63.
- Stars: **+15% per star** at every rarity. The star caps are unchanged: Bright 1, Vivid 2, Royal 3, Imperial 4, Prismatic 10. A 10★ Prismatic gem (Golden) is ×2.5, power 64.07. Prismatic gems used to borrow the gear star curve (×60.9 at 10★). Now they use the same +15% per star.
- A max-star gem is always weaker than the next rarity at 0★, so combining up is always an upgrade.
- Jumps at 0★: **+50%** per tier from Chipped to Imperial (was +40% down to +12%). Prismatic is **+125%** over Imperial 0★ and **+41%** over Imperial 4★. Before, a Prismatic 0★ gem was 30% *weaker* than an Imperial 4★.

## What each power point does

| Type | Per gem |
| --- | --- |
| Diamond | +0.03% × power to Max HP, Atk and Def |
| Emerald | +0.04% × power to Max HP; Regen +0.0005% × power of Max HP per turn |
| Sapphire | +0.04% × power to Def. Every 3 turns it drops 1 frost patch (2 at power 5+, 3 at power 25+). Each patch deals `power × (0.4 + 0.03 × depth) + 0.01% × power × Atk` per turn and chills. |
| Ruby | Aura on foes within 2 tiles each turn: `power × (0.85 + 0.06 × depth) + 0.02% × power × Atk` |
| Citrine | +0.3 × power Magic Find. The rarity-bump chance is 6% per MF, and the combined total is still capped at 60%. |
| Topaz | Gold ×(1 + 0.06 × power), combined cap ×8. Goblins ×(1 + 0.054 × power), combined cap ×2.5. |
| Amethyst | Portals ×(1 + 0.054 × power), combined cap ×2.5. Rares and elites ×(1 + 0.045 × power), combined cap ×2.5. |

The percentage gems use the hero's stats **before gems**: base, gear, sets, stars. All gem percentages add on that same base, so gems never compound on each other. Socket bonuses are applied after gems and were not changed.

Tooltips show the gem power, the exact percentage, and the exact current amount for the loaded hero, for example "Gem power 25.63. +0.77% Max HP, Atk and Def (now +532 HP, +390 Atk, +373 Def)." Socketed gems now show the same line under each socket on the gear tooltip.

## Per tier, old → new (0★ and max ★)

Ruby is shown at depth 200. Citrine shows MF, with the rarity-bump chance in brackets.

| Gem | Old power | New power | Diamond old → new | Emerald HP old → new | Sapphire Def old → new | Ruby aura d200 old → new | Citrine MF old → new | Topaz gold old → new | Amethyst portals old → new |
|---|---|---|---|---|---|---|---|---|---|
| Chipped (Normal) 0★ | 1.00 | 1.00 | +4 HP / +1 Atk / +1 Def → +0.03% each | +8 HP → +0.04% | +1 Def → +0.04% | 14 → 13 + 0.02% Atk | 1 (6%) → 0.3 (1.8%) | ×1.12 → ×1.06 | ×1.18 → ×1.05 |
| Fine (Magic) 0★ | 1.40 | 1.50 | +6 HP / +1 Atk / +1 Def → +0.045% each | +11 HP → +0.06% | +2 Def → +0.06% | 19 → 19 + 0.03% Atk | 1.4 (8.4%) → 0.45 (2.7%) | ×1.17 → ×1.09 | ×1.25 → ×1.08 |
| Clear (Rare) 0★ | 1.80 | 2.25 | +7 HP / +2 Atk / +2 Def → +0.0675% each | +14 HP → +0.09% | +2 Def → +0.09% | 24 → 29 + 0.045% Atk | 1.8 (10.8%) → 0.675 (4.05%) | ×1.22 → ×1.14 | ×1.32 → ×1.12 |
| Bright (Legendary) 0★ | 2.20 | 3.38 | +9 HP / +2 Atk / +2 Def → +0.101% each | +18 HP → +0.135% | +3 Def → +0.135% | 29 → 43 + 0.0675% Atk | 2.2 (13.2%) → 1.01 (6.08%) | ×1.26 → ×1.20 | ×1.40 → ×1.18 |
| Bright (Legendary) 1★ | 2.53 | 3.88 | +10 HP / +3 Atk / +3 Def → +0.116% each | +20 HP → +0.155% | +3 Def → +0.155% | 33 → 50 + 0.0776% Atk | 2.53 (15.2%) → 1.16 (6.99%) | ×1.30 → ×1.23 | ×1.46 → ×1.21 |
| Vivid (Mythic) 0★ | 2.60 | 5.06 | +10 HP / +3 Atk / +3 Def → +0.152% each | +21 HP → +0.203% | +3 Def → +0.203% | 34 → 65 + 0.101% Atk | 2.6 (15.6%) → 1.52 (9.11%) | ×1.31 → ×1.30 | ×1.47 → ×1.27 |
| Vivid (Mythic) 2★ | 3.38 | 6.58 | +14 HP / +3 Atk / +3 Def → +0.197% each | +27 HP → +0.263% | +4 Def → +0.263% | 44 → 85 + 0.132% Atk | 3.38 (20.3%) → 1.97 (11.8%) | ×1.41 → ×1.39 | ×1.61 → ×1.36 |
| Royal (Ethereal) 0★ | 3.00 | 7.59 | +12 HP / +3 Atk / +3 Def → +0.228% each | +24 HP → +0.304% | +4 Def → +0.304% | 39 → 98 + 0.152% Atk | 3 (18%) → 2.28 (13.7%) | ×1.36 → ×1.46 | ×1.54 → ×1.41 |
| Royal (Ethereal) 3★ | 4.35 | 11.01 | +17 HP / +4 Atk / +4 Def → +0.33% each | +35 HP → +0.44% | +5 Def → +0.44% | 57 → 141 + 0.22% Atk | 4.35 (26.1%) → 3.3 (19.8%) | ×1.52 → ×1.66 | ×1.78 → ×1.59 |
| Imperial (Relic) 0★ | 3.40 | 11.39 | +14 HP / +3 Atk / +3 Def → +0.342% each | +27 HP → +0.456% | +4 Def → +0.456% | 45 → 146 + 0.228% Atk | 3.4 (20.4%) → 3.42 (20.5%) | ×1.41 → ×1.68 | ×1.61 → ×1.62 |
| Imperial (Relic) 4★ | 5.44 | 18.23 | +22 HP / +5 Atk / +5 Def → +0.547% each | +44 HP → +0.729% | +7 Def → +0.729% | 71 → 234 + 0.365% Atk | 5.44 (32.6%) → 5.47 (32.8%) | ×1.65 → ×2.09 | ×1.98 → ×1.98 |
| Prismatic 0★ | 3.80 | 25.63 | +15 HP / +4 Atk / +4 Def → +0.769% each | +30 HP → +1.03% | +5 Def → +1.03% | 50 → 329 + 0.513% Atk | 3.8 (22.8%) → 7.69 (46.1%) | ×1.46 → ×2.54 | ×1.68 → ×2.38 |
| Prismatic 10★ (Golden) | 231.57 | 64.07 | +926 HP / +232 Atk / +232 Def → +1.92% each | +1853 HP → +2.56% | +278 Def → +2.56% | 2977 → 823 + 1.28% Atk | 232 (60%) → 19.2 (60%) | ×8.00 → ×4.84 | ×2.50 → ×2.50 |

## Gems vs gear (24 sockets = 6 slots × 4, all Diamond)

The gem share is the stat added by gems as a % of the stat added by gear. These are from `__ED16_PRIS.gems.gearProbe`, using real `calc` on generated gear.

| Depth / gear | Chipped 0★ | Imperial 4★ | Prismatic 0★ | Prismatic 5★ | Prismatic 10★ (Golden) |
| --- | --- | --- | --- | --- | --- |
| d50, Legendary 1★ (gear +1.4k HP / +0.7k Atk) | ~1% | ~15–19% | ~21–29% | ~32–47% | ~46–82% (HP share is high because base HP is a big part at d50) |
| d200, Relic 3★ (gear +14.8k HP / +7k Atk) | ~0.8% | ~14% | ~19–21% | ~33–37% | ~46–52% |
| d500, Prismatic 5★ (gear +805k HP / +300k Atk) | 0.7% | 13% | 18.5% | 32% | 46% |
| d500, Prismatic 10★ (gear +15.4M HP / +5M Atk) | 0.7% | 13% | 18.5% | 32% | 46% |

The old flat values gave 0.003–3% of gear at d500, even with Golden gems.

Richard save COPY (lvl 197, depth 200, 23 socketed gems): gems now add **+2,168 HP, +1,070 Atk, +2,225 Def** (3.1% / 2.1% / 4.6% of the totals). Before, they added +86 HP, +14 Atk, +32 Def. The Ruby aura went from 93 to about 860 damage per turn.

## Boss fights

Act-boss fights are paced by the O6 cap, so gems do not move them. In `o6Sim`, run with every socket holding Diamond+Ruby Prismatic 0/5/10★ gems, the typical times are unchanged. d500 is 2.0 min at 5★ and 1.7 min at 10★. d2000 5★ is about 4.3 min. d3000 is 5.6 min at 5★ and about 3.2 min at 10★. The occasional short runs (40–110 s) also appear with no gems, from random gear rolls.

## Fits (unchanged)

- A non-Prismatic gem fits only its own color socket.
- A Prismatic gem fits any socket, including a Prismatic socket.
- A Prismatic socket accepts **only** Prismatic gems. A migrated non-Prismatic gem can stay in that socket after the layout change, but it does not count toward the socket bonus and cannot be re-inserted.

---

## Previous version (2026-11-18, superseded)


Gem **effects are unchanged**. Tooltips now show the exact numbers the game already used, instead of a short flavor line plus a generic “Socket power” multiplier.

Power of one socketed gem: `p = (1 + 0.4 × rarity) × star multiplier`.

- Rarity quality: Chipped 0 … Imperial 6, Prismatic 7 → p at 0★ is **1.0, 1.4, 1.8, 2.2, 2.6, 3.0, 3.4, 3.8**.
- Stars: non-Prismatic **+15% per star** (capped by that rarity’s star max). Prismatic gems use the Prismatic star curve (same as gear). 10★ Prismatic gems are Golden.

## Before (flavor only)

| Type | Tooltip |
| --- | --- |
| Diamond | All attributes rise. |
| Ruby | A burning aura harms nearby foes. |
| Sapphire | Frost patches slowly form around you and chill foes. |
| Emerald | Vitality and recovery. |
| Citrine | Richer drops (Magic Find). |
| Topaz | More gold from fights, and goblins appear more often. |
| Amethyst | More loot portals and rare encounters. |

Each also showed a generic “Socket power 1 / 1.4 / … / 3.8” and the star cap.

## After (0-star, every quality)

Numbers use the live formulas. Ruby aura is shown at **depth 200** (it scales with depth: `max(1, round((1+p)×0.85 + depth×0.06×p))`).

| Type | Chipped (p=1.0) | Fine (1.4) | Clear (1.8) | Bright (2.2) | Vivid (2.6) | Royal (3.0) | Imperial (3.4) | Prismatic (3.8) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Diamond** | +4 HP, +1 Atk, +1 Def | +6 HP, +1 Atk, +1 Def | +7 HP, +2 Atk, +2 Def | +9 HP, +2 Atk, +2 Def | +10 HP, +3 Atk, +3 Def | +12 HP, +3 Atk, +3 Def | +14 HP, +3 Atk, +3 Def | +15 HP, +4 Atk, +4 Def |
| **Ruby** (d200) | Aura 14 dmg/turn adjacent | 19 | 24 | 29 | 34 | 39 | 45 | 50 |
| **Sapphire** | +1 Def, 1 frost patch (pwr 1) every 3 turns | +2 Def, 1 patch (1) | +2 Def, 1 patch (1) | +3 Def, 1 patch (1) | +3 Def, 2 patches (2) | +4 Def, 2 patches (2) | +4 Def, 2 patches (2) | +5 Def, 2 patches (2) |
| **Emerald** | +8 HP, +0.2 Regen | +11 HP, +0.3 | +14 HP, +0.4 | +18 HP, +0.4 | +21 HP, +0.5 | +24 HP, +0.6 | +27 HP, +0.7 | +30 HP, +0.8 |
| **Citrine** | +1 MF, 6% rarity bump* | +1.4, 8.4% | +1.8, 10.8% | +2.2, 13.2% | +2.6, 15.6% | +3, 18% | +3.4, 20.4% | +3.8, 22.8% |
| **Topaz** | Gold ×1.1, goblins ×1.2 | ×1.2 / ×1.3 | ×1.2 / ×1.3 | ×1.3 / ×1.4 | ×1.3 / ×1.5 | ×1.4 / ×1.5 | ×1.4 / ×1.6 | ×1.5 / ×1.7 |
| **Amethyst** | Portals ×1.2, rares ×1.2 | ×1.3 / ×1.2 | ×1.3 / ×1.3 | ×1.4 / ×1.3 | ×1.5 / ×1.4 | ×1.5 / ×1.5 | ×1.6 / ×1.5 | ×1.7 / ×1.6 |

\*Citrine’s rarity bump applies only below Ethereal; the combined chance from all Citrine is capped at 60%. Topaz gold is capped at ×8, goblins at ×2.5. Amethyst portal and rare chances are each capped at ×2.5. Those caps are on the **combined** total of every matching gem, not one gem alone.

Sapphire grows a second frost patch once `p ≥ 2.5` (Vivid and up at 0★, or a Bright with enough stars).

## Fits

- A non-Prismatic gem fits only its own color socket.
- A Prismatic gem fits any socket, including a Prismatic socket.
- A Prismatic socket accepts **only** Prismatic gems. A migrated non-Prismatic gem can stay in that socket after the layout change, but it does not count toward the socket bonus and cannot be re-inserted.
