# Socket bonus design (2026-11-18)

A piece of gear with **every socket filled by a proper-color gem** gains one bonus. Pets and gems never have a bonus. The bonus is computed from the item (seed, rarity, stars) — nothing new is stored — so it applies retroactively to every existing item.

## When it is on

- Every socket on the piece must contain a gem that **fits that socket’s color**.
- Regular sockets (Diamond … Amethyst) accept that color, or any Prismatic gem (wild).
- **Prismatic sockets** (every socket on Prismatic gear) accept **only Prismatic gems**.
- A wrong-color or empty socket, or a leftover non-Prismatic gem in a migrated Prismatic socket, leaves the bonus **inactive**. The name and numbers still show in the tooltip as “Socket bonus (inactive): …”.

## Magnitude

```
regular:     (0.40 + 0.10 × rarity) × (1 + 0.10 × stars)
Prismatic:   0.90 × (1 + 0.10 × stars)
```

| | 0★ | 5★ | 10★ |
| --- | --- | --- | --- |
| Normal (rar 0) | 0.40 | — | — |
| Relic (rar 6) | 1.00 | 1.40 at 4★ cap | — |
| Prismatic | 0.90 | 1.35 | 1.80 |

Tooltip numbers (HP, % crit, gold, and so on) use this magnitude, so higher rarity and more stars make the same bonus stronger.

## Identity and the Prismatic re-roll

- Regular and Prismatic gear use **separate pools** (14 bonuses each, no shared ids).
- Which bonus a piece gets is a hash of `item.seed` and rarity. Prismatic gear also hashes the **star count**, so combining into a new star value **re-rolls** a new bonus from the Prismatic pool. The new roll is deterministic on that seed + star value and is stronger because magnitude rises with stars.
- Combining never reduces socket count. Existing gems stay. On a 2★+ Prismatic result, the piece is raised to **4 Prismatic sockets** (the cap).

## Regular pool

| Id | Name | Effect at magnitude *m* |
| --- | --- | --- |
| hp | Vital Core | +10m Max HP |
| atk | Keen Edge | +3m Atk |
| def | Hardened Plate | +4m Def |
| crit | Precision | +1.2m% Crit |
| spd | Swift Hands | +1.1m Attack Speed |
| regen | Mending | +0.25m Regen / turn |
| mv | Light Step | +3m Move |
| block | Guard | +2m% Block |
| ward | Aegis | +6m Ward |
| ls | Bloodletting | 1.6m% lifesteal (combined cap 12%) |
| gold | Gilded | +8m% gold find |
| mf | Fortune | +0.35m Magic Find |
| cdr | Quickening | 2.2m% ultimate cooldown (combined cap 20%) |
| dr | Bulwark Veil | 1.8m% damage reduction (combined cap 15%) |

## Prismatic pool (separate)

| Id | Name | Effect at magnitude *m* |
| --- | --- | --- |
| chain | Chain Lightning | (7 + 0.8m)% chance on hit to arc 22m% of the blow to a nearby foe |
| overshield | Prism Ward | Every 8 turns, gain 8m overshield (Ward) |
| ultRefund | Time Fracture | On kill, refund (4 + 1.2m)% of remaining ultimate cooldown (cap 20%) |
| goldRain | Gold Rain | On kill, a gold shower worth (8 + 4m) + depth-scaled gold |
| doublestrike | Double Strike | (2.2 + 0.6m)% chance to strike a second time for 70% damage |
| aura | Prismatic Aura | Aura: max(1, 2 + 3m) Prismatic damage to adjacent foes each turn |
| nova | Crit Nova | On crit, a nova deals 16m% of the blow to nearby foes |
| lifebloom | Lifebloom | On kill, heal (1.4 + 0.5m)% of Max HP |
| starfall | Starfall | Every 6 turns, a star falls for 8m% of Atk on a nearby foe |
| mirrorward | Mirror Ward | 2.0m% chance to ignore a hit (combined cap 12%) |
| fortunestorm | Fortune Storm | +10m% gold find and +0.40m Magic Find |
| bloodprism | Blood Prism | 1.8m% lifesteal (shares the 12% cap with Bloodletting) |
| arcaneecho | Arcane Echo | (6 + 0.6m)% chance on hit to echo 18m% of the blow |
| aegiscycle | Aegis Cycle | +8m Ward and +0.2m Regen / turn |

Proc rates stay modest at 10★ (m = 1.80) so a fully socketed Prismatic set does not pull 5★ / 10★ deep boss TTK out of the ~3.5–5.6 minute window.

## Sockets on Prismatic gear (retroactive)

- Every socket on Prismatic gear is Prismatic-colored (color 7). `unpackItem` / `validItem` now allow that color (the old `c ≤ 6` clamp would have stripped it).
- **2★+ Prismatic** always has the maximum of 4 sockets, on drops and on combines.
- Combine never goes below the number of sockets carried in; leftover gems stay.
- Load walks equipped, bag, gem bag, stash, drops, merchant, and floor snapshots and applies this layout. Official Richard save is not rewritten.
