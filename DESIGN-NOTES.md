# Endless Depths 16 — Design Notes

## Prismatic Ultimate Attacks (design note, 2026-11-17, from Metal Complex — IMPLEMENTED 2026-11-17)

Status: **implemented** in src/game.tsx (deployed 2026-11-17). Implementation notes:
- `ULT_CD` = 60000 (1 min per individual ultimate; Apex Chronos still shortens it). `PARA_CD` = 180000.
- Paramount unlocks when head, chest, arms, legs, right hand and left hand all hold a Prismatic item with an
  ultimate (a shield or 2H weapon leaves only 5, so no Paramount; the pet slot never counts).
- It is ready only when its own lockout is over and all six ultimates are off cooldown. Pressing it locks all six
  ultimates and the button for a shared 3 minutes (fixed, not shortened by Chronos). Keyboard: 0.
- Damage: for each enemy in view, the exact damage each of the six equipped ultimates would deal to it
  (same `ultDamage` formula as a single cast) is added up and doubled, then dealt as one hit labeled
  "Paramount Ultimate". It feeds the camp peak-damage board as a Prismatic ult hit.
- Saves: new optional fields `pa` (Save Code, ms left) and `paraAt` (full save); older saves load unchanged.
  Old 3-minute individual cooldowns are trimmed to 1 minute on load unless a Paramount lockout is active.
- Visual v2 (revised 2026-11-17 after Metal Complex's feedback; about 6.4 s; damage lands at the 4.0 s explosion):
  - 0-1.6 s charge: world darkens, game time runs at 30%, glints of light sparkle and drift into a swelling
    glow on the hero; rising charging whine with sparkle ticks.
  - 1.6 s impact: a massive white-gold beam slams down onto the hero instantly - hard screen shake, impact
    ring, quick arcing lightning bolts shooting outward (re-rolled every ~60 ms).
  - 1.6-4.0 s: the beam slowly widens until it fills the screen while the screen whites out; sound is a
    continuous deep roaring, crackling beam hum that builds.
  - 4.0 s climactic explosion: damage lands, full white, then the white clears over a rainbow shockwave and
    flying debris; deep explosion sound. Only the combined damage number (plus struck/slain) is shown -
    no "Paramount" title text in the finisher.
  - Canvas-only, fixed-size buffers; measured no frame-rate drop vs idle under 4x CPU throttle.
- Visual + sound v3 (2026-11-17, "more visually intense, way more epic sound"; same structure and timings,
  about 6.8 s, damage still at the 4.0 s explosion, no "Paramount" word in the finisher):
  - Charge: up to 100 twinkling glints, 40 converging energy streaks, 30 spiralling motes, swelling core,
    a light column forming above the hero, heat-shimmer lines, 12 glowing ground cracks with ground glow,
    dark vignette, red/cyan chromatic flicker near the end of the charge.
  - Beam: hue-shifting corona (2.1x width), gold gradient body, white-hot core, six spiral ribbons in the six
    ult colours, impact pulse rings every 0.4 s, 16 thick three-layer branching lightning bolts re-rolled every
    50 ms, 70 rising embers, chromatic flicker, stronger shake (44 at impact, 26-40 pulses every 0.4 s).
  - Explosion: bloom, 28 rotating light rays, five layered shockwave rings (rainbow / white / gold),
    rainbow afterglow arcs, coloured debris, shake 52.
  - Performance: the whole overlay is drawn into one 1x off-screen layer (game canvas is 3x) and laid on top in
    a single draw; lightning, rays and debris are batched into a few paths.
  - Sound (`paraSfx`, WebAudio): own bus -> DynamicsCompressor (limiter-style) -> the SFX volume node, so
    the SFX volume and mute apply. Synthetic 3.2 s stereo reverb, 0.29 s feedback delay, waveshaper distortion.
    Layers: sub rumble 30-44 Hz with tremolo; 9-voice detuned rising saw stack (Shepard-like, 3 octaves,
    sweeping lowpass, AM) plus noise riser; 26 panned glint pings; formant "choir" pad; impact (sub drop
    160->26 Hz, noise burst, 6 inharmonic metallic partials); beam roar 1.6-4.0 s (swept, LFO-modulated
    saws/squares, band-passed noise sweep, rising hum); 44 panned crackles synced to the lightning re-rolls;
    explosion (two sub booms, distorted saw boom, sweeping noise burst into the reverb and delay, 46 debris
    crackles, 6 ringing harmonic partials).

## Wall damage (2026-11-17, from Metal Complex) — IMPLEMENTED
- Decision: walls are destroyed for real (not visual-only). It reuses the Wall Breaker pickaxe's guard
  `canBreakWall`: only plain wall tiles, never the outer map-edge ring, portals or camp objects; floor and stairs
  tiles are never changed. Broken walls and cracks already persist in saves (floor snapshot map, `ck` cracks),
  the minimap cache keys on `wallVer` (bumped), and visibility is recomputed. Only on normal dungeon floors
  (not camp, vault, secret arena, goblin cave).
- Gear power: `gp` = average over head, chest, arms, legs, right hand, left hand of
  `min(1, 0.8*rarity/7 + 0.2*min(stars,10)/10 + 0.1 if golden)` (empty slot = 0; Prismatic rarity = 7).
  Wall power `wp = gp^2` (starter gear ~0, Rare ~0.05, Mythic 4* ~0.29, Relic 4* ~0.59, Prismatic 10* = 1).
- Normal attacks (chip only, never break; crack capped at 50%): per hit chance `wp * 0.05` plain /
  `wp * 0.4` crit / `wp * 0.7` super crit to crack a wall next to the target by `wp * 0.08 / 0.18 / 0.3`,
  with chunks flying.
- Individual ultimates (crack only, never break; capped at 95%): walls within `2 + round(3*wp)` tiles,
  each with chance `0.2 + 0.6*wp`, cracked by `(0.12 + 0.5*wp) * random(0.6..1.2)`, up to 40 tiles.
- Paramount (always huge): walls are ripped away progressively during the beam and fully at the explosion
  within radius `4 + 2*max(wp, 0.5)` (5-6 tiles), the 2-tile ring beyond is heavily cracked (50-90%),
  chunks of the wall sprite fly outward; finisher shows "N WALLS".

## Pet drop rate
- `PET_CH` back to 5% of random drops (briefly 10%, reverted 2026-11-17). Camp pet chest unchanged.

### Standing rule: individual ultimate cooldown
- Each individual Prismatic ultimate cooldown changes from **3 minutes to 1 minute**.

### New tier: the Paramount Ultimate
- Name: **Paramount** (meaning "above everything else"). Checked unused in src/
  ("Apocalyptic" and "Cataclysmic" already appear in the game, so they were skipped).
- Unlock: the character has **all 6 Prismatic gear pieces equipped** (armor + weapons, 6 slots),
  giving 6 individual ultimates.
- When unlocked, a new single button appears: the Paramount Ultimate.
- Pressing it fires **all six equipped ultimates at once**.
- Damage: the game calculates the exact damage of the six individual ultimates tied to those
  specific equipped Prismatic pieces, adds them up, then **doubles the total** (2x combined).
- Downside: using it puts **all six individual ultimates AND the Paramount button on a
  3-minute cooldown** before any of them can be used again.

### Player choice
- Use the six ultimates individually, each on its own 1-minute cooldown, OR
- Press the one Paramount button for 2x the combined damage of those six ultimates,
  with a shared 3-minute cooldown on everything.

### Visual requirement (added 2026-11-17)
- The Paramount Ultimate must look far more extravagant and visually stunning than any
  individual ultimate — its own unique, special effect, not just the six played together.
- Concept (proposed, to be refined when built): screen darkens and time briefly slows; six
  Prismatic beams (one per equipped piece, in that piece's ultimate color) rise from the hero and
  converge into a rotating rainbow sigil overhead; the sigil collapses into a white-gold singularity,
  then detonates in a full-screen prismatic shockwave with shattering-glass light shards, screen
  shake, a unique sound sting, and a huge combined damage number with a "PARAMOUNT" title card.

## Update 2026-11-18 (items 1-22, from Metal Complex) — IMPLEMENTED

General rules for this update:
- Everything stays in `src/game.tsx`. Storage keys are unchanged (`ed16_save_v1_p1/p2/p3` and so on). Every new save
  field is optional, in both the full save and the Save Code, so old saves load unchanged (missing = default/0).
- **Retroactive rule:** loot changes apply to everything already owned: equipped gear and pets, the bag, the stash,
  in every profile.
  - The Prismatic star curve and gem stars are worked out from the star count every time, so old items show the new
    numbers the moment they load.
  - Stored-data repairs (sockets) run on load for whichever profile is loaded.
- Wall safety is unchanged. Paramount and ultimates never break walls in camp, vaults, caves or secret arenas
  (`wallDmgOk`). Buried chests use the same rule.

### Loot, stars and gems (items 1-10)
- **Prismatic star curve:** each star multiplies the whole item (base atk/def/block, every bonus, star abilities, pet
  power and its ultimate).
  - Stars 1-5 give x1.30 each; stars 6-10 give x1.75 each.
  - Totals: 0* x1, 1* x1.30, 3* x2.20, 5* x3.71, 7* x11.37, 10* x60.9. Before this, 10* was x16.4 and stars 1-5 added nothing.
  - Lower rarities: stars add star abilities only.
- **Gem icons:** each of the 8 rarity tiers has its own cut, from a chipped pebble up to a Prismatic star cut with a
  halo. A Golden gem gets a gold crown setting. High-tier gems glint on the ground.
- **Gem stars:** same merge rule as gear. Three gems with the same type, rarity and stars make one gem a star higher,
  up to the rarity's cap, then the next rarity.
  - Star caps: Normal/Magic/Rare 0, Legendary 1, Mythic 2, Ethereal 3, Relic 4, Prismatic 10.
  - A 10-star Prismatic gem turns Golden.
  - Socket bonus: lower rarities +15% per star; Prismatic gems use the Prismatic star curve.
- **Cave portals:**
  - An alert only fires for a portal that is really drawn on screen and reachable. A portal is always placed on
    reachable floor.
  - Caves you visited keep their state: the portal stays open and the loot never refills.
  - Super caves: Celestial Treasury (0.45% per eligible floor) and Royal Goblin Warren (0.25%).

### Walls, cracks and weather (items 10-12)
- **Floor cracks** (cosmetic only, never saved): stand in one spot and keep fighting, and cracks spread under the
  hero. More Prismatics and more gear power make them spread faster and wider (cap 64 cells).
- Each equipped Prismatic adds wall-crack chance and crack size on top of the gear-power chipping. Cracks never
  break a wall by themselves.
- **Weather:** depth 50+, purely visual. 55% of floors stay clear.
  - 9 types: Light Snow, Blowing Snow, Drifting Snow, Ice & Frost, Light Rain, Heavy Rain, Distant Lightning,
    Thunderstorm, Windstorm.
  - Each floor gets a stable seed. Weather adds a tint, particles, lightning, quiet ambient sound and a floor-entry label.

### Bigger floors and portal scaling (items 13-14)
- **Floor sizes:** from depth 25, each 25 depths unlocks one more tier: 44, 50, 56, 61, 65, 68, 70, 72 tiles square.
  - Normal floors have double weight.
  - Example odds: depth 26: 67% Normal / 33% Large. Depth 100: 33% Normal, 17% for each of 4 bigger tiers.
    Depth 175+: 22% Normal, 11% for each of the 7 bigger tiers.
- **Portal scaling:** on bigger floors every cave type gets (scale - 1) extra rolls at its normal chance, where
  scale = walkable tiles / `NORMAL_WALK` (640).
  - Measured walkable tiles: Normal ~763, Large ~1014, Larger ~1318, Huge ~1640, Vast ~1897, Immense ~2110,
    Colossal ~2253, Titanic ~2395.
  - Measured cave portals per floor: Normal ~0.06-0.09, Titanic ~0.28-0.30.

### Item 15 — Shrine swarm
- **Spawning:** past depth 25 (not on act-boss floors, camp, caves or vaults), each floor has a seeded 5% chance of a
  shrine. It is placed on the reachable floor tile nearest the centre.
- **The event:** bump the shrine to start a 60-second swarm, and the shrine is used at once.
  - Enemies spawn off-screen, 6-20 tiles away. Cap 40 alive, an opening burst of 18, then 6 per second.
  - A timer and kill counter show on screen. Swarm enemies give 60% XP and very little loot of their own.
- **Death or leaving:** dying ends the event, and the shrine stays spent (saved per floor, `sud` / `shrUsedD`).
- **Reward tiers by kills** (gold = (40 + depth x 18) x multiplier):

  | Tier | Kills | Items | Min rarity | ilvl bonus | Gold | Gems | Prismatic |
  |---|---|---|---|---|---|---|---|
  | Bronze | 25 | 2 | 1 | +0 | x4 | 0 | – |
  | Silver | 60 | 3 | 2 | +2 | x8 | 0 | – |
  | Gold | 110 | 4 | 3 | +4 | x14 | 1 | – |
  | Mythic | 170 | 5 | 4 | +6 | x22 | 1 | – |
  | Relic | 240 | 6 | 5 | +8 | x32 | 2 | 35% chance |
  | Prismatic | 300 | 7 | 6 | +10 | x45 | 3 | guaranteed |

### Item 16 + 20 — Lava-sealed artifact caves, trophy case, Resplendent Chest
- **Where caves appear:** only on lava-eligible floors past depth 25 (clear or wind weather, never on act floors),
  with a seeded roll of `ART_CH` = 0.1% per floor.
  - Measured placement success is ~97%. The effective rate is about 0.1% of eligible floors.
  - Prismatic drops measured on the same floors (normal monsters and chests, not counting act bosses or swarms):
    0.4% (depth 26-51), 0.7% (depth 101), 1.1% (depth 201-501).
  - So a cave is 4-11x rarer than a Prismatic drop. It started at 0.15%; that was lowered to keep it well below.
- **Shape:** a fixed pocket cut into solid rock: a 3x3 lava moat, a landing tile, a hidden door, a 3x3 chamber and a pedestal.
- **The sealing rule:** pocket walls cannot be destroyed. Wall Breaker, cracks, ultimates and Paramount wall-ripping
  all skip them (`artLocked`).
  - Hazards, pools, melting and teleports never touch the pocket.
  - There are exactly two ways across:
    1. a Waterwalker / Lavastrider item;
    2. a Paramount, which turns the moat into obsidian.
  - The connectivity test proves this every time:
    - not reachable without the affix, even after wall attacks and a single ult;
    - reachable with the affix;
    - reachable after a Paramount;
    - 0 locked walls broken.
- **Either-or rule:** every cave holds exactly ONE prize. It is an ancient artifact OR a Resplendent Chest, never both
  and never empty.
  - The split is 50/50 per cave, decided when the cave is generated. The cave spawn rate is unchanged.
  - Once all 50 artifacts are owned, caves keep spawning and always hold the chest.
  - The test checks 58 caves: 0 with both, 0 empty, and every cave after 50/50 holds a chest.
- **Artifacts:** 50 unique artifacts, never a duplicate.
  - Banner: "ANCIENT ARTIFACT DISCOVERED: NAME (N/50)".
  - Trophy case: the 🏆 button, or the trophy stand in camp. It has 50 slots: silhouettes with "???" for unfound
    artifacts, and a found count.
- **Resplendent Chest:** vivid gold with a pulsing aura and sparkles.
  - Loot = three act bosses with three overshields each, through the normal boss-loot function
    (measured ~30 items plus about 37k gold at depth 31).
  - Banner: "RESPLENDENT CHEST OPENED!".

### Item 17 — Water, lava and ice
- **Where:** past depth 25 on dungeon floors only (never camp, caves, vaults or act floors), seeded per floor.
  - Water appears on 32% of floors; pool counts scale with floor area.
  - Lava appears on 26% of floors, only when the weather is clear or wind.
  - Cold weather (snow, blizzard, drift, frost) freezes pools of 8+ tiles, either whole or as a frozen rim around open water.
- **Never blocking:** every pool is undone if it would cut off any tile that was reachable before. Stairs, portals,
  shrines, chests, traders and the cave front are kept clear. Tested over 1,360 floors on every size tier: 0 failures.
- **Crossing:** water and lava cannot be crossed without the new affix "Waterwalker / Lavastrider".
  - The affix rolls on gear and pets. Gear chance by rarity: 0, 0, 0.3%, 0.6%, 1.2%, 2%, 3%, 4.5%.
    Pets: 0, 0, 0.5%, 1%, 1.8%, 3%, 4.5%, 6.5%.
  - A hero already standing on water or lava, or inside a cave pocket, can always walk out.
- **Ice:** walkable, and the hero slides with momentum (up to 8 tiles, slowing down). Any input steers. The slide
  stops at anything solid, so it can never trap the player.

### Item 18 — Gibs on hazards
- Water: pieces splash and ripple, then sink.
- Lava: pieces flare with embers and smoke the moment they touch, then burn away.
- Ice: pieces glide with low friction and stop or fade at the ice edge.
- The effects buffer is capped at 140 particles, and the normal shard and particle caps still apply.

### Item 19 — Ultimates and terrain (replaces the earlier lava-to-obsidian idea)
- **Single Prismatic ultimate:** melts ice back into water within 3 + round(3 x max(0.3, wall power)) tiles (4-6).
  Water and lava are not changed. The hero's tile and any ice that keeps a path open stay frozen.
- **Paramount:** within paramount radius + 4, ice and water boil into a walkable dry pit with a big steam burst, and
  lava hardens into walkable obsidian.
- Both results are saved with the floor.

### Item 21 — Pets and chests; buried chests
- **Pets:** they no longer open any chest (dungeon, Resplendent or camp pet chest), but still pick up what drops out.
- **Buried chests:** each wall tile destroyed by Wall Breaker or Paramount has a 4% chance to reveal a buried chest.
  - Cap: 2 per floor. They appear only where wall destruction is allowed.
  - The chest has normal rarity for the depth, comes with a dust burst and the message "Buried chest uncovered!",
    and is saved with the floor.

### Item 22 — Socket circles fixed
- **Root cause:** the bag/detail cell drew socket pips twice. They were baked into the bottom of the icon image AND
  drawn again by the HTML `.dc-pips` overlay. In the 46px detail cell the two rows showed as 8 circles for a
  4-socket item.
  - Icon caches were keyed by item id only, so pips could also go stale.
- **Fix:**
  - Cells use a pip-free icon and draw one live overlay from the item's sockets.
  - Ground drops draw live pips.
  - Caches are keyed by id + pips + socket signature.
  - Layout handles up to 8 sockets (rows of 4).
- **Repair on load:** items with more than 4 sockets are trimmed to 4. Filled sockets are kept first, and any extra
  gems go to the gem bag, not lost. Richard's save needed 0 repairs; the display was the only bug.

## Update 2026-11-18 — item 23: Prismatic ultimate redesign

All 50 regular Prismatic ultimates now play their own scripted "show" (src: `ultShowStart` / `ultShowTick` / `drawUltShows`, placed just before `ultFx`).
Paramount is untouched: same beam, visuals, sound, damage and cooldown (it never used `ultFx`).

- **Unchanged:** damage, `ultDamage`, star multipliers, cooldowns, targets (every visible living enemy), and terrain rules.
  Damage still lands at cast, as before; the show is visual only.
- **Ids unchanged.** Items store `ult` (0–49), and names are derived from `UWORD[element][row] + UPAT[pattern]`.
  Renames therefore apply retroactively to every saved item, in every profile, the stash and the Save Code.
  Nothing is migrated.
- **10 patterns** (`i % 10`). Each takes the element colour plus a rainbow accent, and gold for golden items:
  0. Storm → **Starfall**: rainbow meteors fall on each foe, then burst on impact.
  1. Nova → **Supernova**: a star swells over the hero, then layered rainbow shock rings sweep the screen.
  2. **Collapse**: motes are dragged into a dark core, which then detonates.
  3. **Tempest**: a dark storm front, then forked rainbow lightning on every foe.
  4. **Cataclysm**: glowing fissures crack outward, then erupt in columns of light.
  5. Rain → **Lances**: wide rainbow sky lances (narrower than Paramount's beam) rake the ground.
  6. **Reaping**: a giant spectral scythe sweeps round the hero, and souls rise from the struck.
  7. **Judgement**: runic sigils brand each foe, then pillars of light slam down.
  8. **Crossfire**: emitters at the screen edges fire searing beams that cross the field.
  9. **Maelstrom**: a towering rotating rainbow cyclone tears across the foes.
- **Duration:** 2.0–2.6 s (`UDUR`).
- **Limits:**
  - At most 3 shows at once (`USHOW_CAP`); targets per show are capped at 24.
  - Particles go through `burst()`, so they share the existing 600-particle cap.
  - Every draw is wrapped in try/catch, so a show can never break the frame.
  - A show is dropped when the floor's map changes (`s.map !== g.map`). It is not cleared in `genFloor`, because `genFloor` also runs for off-screen helper games.
- **SFX:** a distinct per-pattern layer in `case "ult"` (base pitch by element), on top of the existing `playMagic(ultSnd(v))`.
- **Performance:** in headless Chrome at 412×780 DPR2, the max frame was 17 ms for 48 of 50 ults. There were single 100 ms and 133 ms spikes (ids 30 and 35), probably GC.
- **Screenshots:** `screenshots-ults/`.
  - `seq-p{pattern}-{id}-{t}s.png`: frame sequences at 0.25, 0.6, 1.0 and 1.5 s for ids 0–9.
  - `ult-{id}-{name}.png`: one shot each for ids 10–49.
  - Contact sheets: `contact-*.png`. Data: `ults.json`.

### Fix found while building item 23: the Jax seed re-decoded on every save
- **Problem:**
  - `saveGame → mainSaveBlob/currentRaw → migrateProfiles → ensureJaxSeed` decoded the embedded Jax seed code on *every* save.
  - That runs `decodeCode → newGame → genFloor`, which reset per-floor module state and resized the global `MW`/`MH` to the seed floor's size in the middle of live play.
  - It also cleared the new ult shows instantly.
- **Fix:**
  - The seed is now decoded once per session and cached (`jaxSeedCache`).
  - The live `MW`/`MH` are restored after that one decode.
- The Jax seeding rules themselves are unchanged.
