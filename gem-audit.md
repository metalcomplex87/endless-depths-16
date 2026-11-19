# Gem audit — exact numbers (2026-11-18)

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
