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

## 2026-11-18 (second build): saving, camp/floor objects, HUD, movement, Paramount shake

### Bulletproof saving
- **Save Game** writes localStorage, sessionStorage and IndexedDB. Each write is read back to verify it; localStorage is retried once, and on a quota error the redundant `_bak` copies are freed first (this profile's, then the others').
- **On-screen result:** a pill shows `✔ GAME SAVED` with every layer (device ✓/✗ · backup DB ✓/✗ · tab ✓/✗). If localStorage fails, a Save Code is copied during the same tap.
- **When everything fails:** you get `✖ SAVE FAILED` with the reason, and the Save Code panel opens with the code already copied.
- **Eviction:** `navigator.storage.persist()` is requested at boot and on every Save. The storage line reports whether the data is protected.
- **Rolling backups:** the last 5 saves per profile are kept in IndexedDB (`ed16_roll_p{n}_{i}`). Save Game always adds one, and autosaves add one at most every 45 s. At boot, if localStorage, sessionStorage and the IndexedDB main copy are all gone, the newest valid rolling backup is restored.
- **Autosave triggers:** `visibilitychange` (hidden), `pagehide`, `beforeunload` and `freeze`.
- **LOAD:**
  - The title LOAD code button is reachable at 360–430 px: the title block is anchored to the bottom, and on an empty profile LOAD is listed first.
  - The dock and menu LOAD use `locked && hasSave()`, so an empty profile can always load a code.

### Trophy case (camp only)
- **Footprint:** 2×2 at a fixed spot, top-left (15,26), on every visit and every profile.
- **Movement and interaction:** the case is solid, and bumping it from any of its 8 side tiles opens it.
- **Placement and state:** `placeTrophyCase` places it during camp generation. `leaveCamp` and `genFloor` clear `trophyAt`, and draw and bump both require `area === "camp"`, so a stale value carried on a saved dungeon floor is ignored.

### 2×2 chests and shrine
- **Coordinates:** chests (regular, buried, Resplendent) and the swarm shrine use (x,y) as the top-left of a 2×2 footprint (`Chest.fit = 1`, `Shrine.f = 1`).
- **Drawing:** chests use the same pixel art at 2× scale, with the glow and Resplendent trim kept.
- **Fitting (`fit2x2`):**
  - All four tiles must be plain room floor: no corridor, stairs or ring around stairs, portal, merchant, trader, drop, hazard, hero or enemy.
  - A spot is only accepted when the floor's flood-fill component count does not grow.
  - If no spot within 4 tiles qualifies, the chest stays 1×1 (`fit = 2`).
- **Old saves:** chests and shrines with no flag are fitted on their first frame (`visTick`).
- **Hazards:** they are placed after fitting and keep clear of the footprints. `refitIfSplit` re-fits if hazards or the artifact cave pinch a floor apart.
- **Opening:** bumping any footprint tile opens the chest.
- **Shrine swarm:**
  - The shrine is solid for enemies too, so they gather around it.
  - Swarm enemies follow a distance field to the shrine until they are within 2 tiles of it, or within 4 tiles of the hero. After that they hunt the hero, with a BFS when far away.
  - While the swarm runs, the shrine has a pulsing glow, a light column and a flashing ring.
  - The timer, kill counter and reward tiers are unchanged.

### Torch light
- **Rendering:** one cached radial-gradient sprite per flame colour. It is drawn with `lighter` compositing after the weather tint.
- **Darkness value** (`lightDark`, 0..1):
  - Weather: storm 0.55, rain 0.32, blizzard 0.30, lightning 0.22, snow 0.18, drizzle 0.16, drift/frost 0.12.
  - Dark biome: up to 0.45 from floor-tile luminance.
  - Depth: up to 0.22, plus dread.
- **Light size:** radius = 1.5 + 2.4·D tiles; alpha = 0.2 + 0.6·D, with a gentle two-sine flicker. Lightning flashes wash it out briefly.

### HUD
- **Bottom row:** laid out with measured widths: PL | area name (ellipsised) | gems + gold | BEST D.
- **Gold format:** below 100,000, gold shows full digits with separators; above that it is compact (12.6M g).
- **HP:** `calc()` rounds `maxHp` to an integer, and HP is clamped to max.
- **Camp peak card:** it has a separate **TOP PARAMOUNT** block. TOP PRISMATIC ULT counts regular Prismatic ults only, and old saves that filed Paramount under it are migrated.

### Movement Speed rework
- **Where it rolls:** any gear slot (head, chest, arms, legs, weapons, shields), with the existing chance by rarity (6% common up to 50% Prismatic). Pets and gems never roll it; the Windstrider pet ability and set bonuses are unchanged.
- **Per-item ceiling:** `mvItemCeil(ilvl) = 8 + 92·(min(ilvl,3000)/3000)^0.55`, capped at 100. Rarity scales it by 0.4 + 0.6·rar/7.
- **Roll:** max × (0.15 + 0.85·u³), so high rolls are rare. Set pieces take the better of two u.
- **Stars:** Prismatic star multipliers no longer scale Movement Speed.
- **Total cap:** +300% (`MV_CAP`). The Bag stats chip shows `Move speed +X% (cap 300%)`, plus the gear total when it is over the cap.
- **Old items:** `validItem` clamps existing rolls to the new per-item max, retroactively for equipped gear, the bag and the stash.
- **Speed behaviour:** movement stays tile-by-tile with the same collision, hazard and slide checks, so higher speed only shortens the step cooldown (0.24 s / (1 + mv/100)).

### Eternal Reapers (ult id 26, formerly "Event Horizon Reaping")
- **What changed:** its own show (`fx` 10, 2.9 s): four giant scythes sweep in from the screen corners, leaving rainbow crescents, then one colossal rainbow scythe rises over the hero and reaps a full circle.
- **SFX:** a singing-blade whoosh plus a slash impact per sweep, then the great scythe chord.
- **Unchanged:** damage, cooldown and every other ult. The name comes from the id, so saved items show it everywhere.

### Paramount: screen shake only
- **What it shakes:** the whole world view (floor included), with the beam anchored to the shaking hero. The HUD and the DOM touch controls do not move.
- **Curve (`paraShakeAmp`, px):**
  - 0 before impact (1.6 s).
  - Then 1.5 + 14.5·(0.3q + 0.7q³), plus a kick on every 0.4 s pulse, while the beam widens (to 4.0 s).
  - 18 during the full white (4.0–4.4 s).
  - Easing 18 → 4 as the white dims (to 5.8 s).
  - A residual 4 → 0 by 6.8 s.
- **Unchanged:** every other part of Paramount. Reduced-motion users get no shake.

## 2026-11-18 (11:45–12:xx CT): Prismatic Bulwark (A1) + linear star curve (C1); run speed v2
Approved by Metal Complex (voice, 11:45 / 11:50 CT). Source: BOSS-OPTIONS-2026-11-18.md options A1 and C1. B1 and every boss-side nerf are NOT implemented; Paramount unchanged.

**Star power.** `bwStars(eq)`: S = sum over equipped Prismatic items (all 7 slots, gems excluded) of (stars + 3). k = min(1, S/78). r = depth ramp 0 at d200 → 1 at d1300 (`bwRamp`). `bulwarkOf(eq, depth)` derives everything from equipped gear + current depth (nothing stored, so it applies retroactively to every profile). `calc` sets `Stats.bw`.
- Defence: max HP ×(1 + 0.6k + 2k·r) (in `calc`); damage reduction 45%·k on every enemy hit; resistance a further 30%·k off ranged shots and boss special attacks (`bwMitigate`, in `enemyAttack` and the shooter-gone branch of `resolveShot`); single-hit cap 60% − 25%·k of max HP (`applyHeroDmg`).
- A1 Last Stand (`applyHeroDmg`, after pet Phoenix/Second Soul): a lethal hit leaves 1 HP, 1.2 s immunity, cooldown 30 − S/4 s (min 10). Clock = `g.petAbiT`; `g.bwLsReady`, `g.bwImmUntil` are runtime only.
- Offence: damage vs bosses ×(1 + 1.5k) in `hurtEn` (not Paramount `src.p`); each basic attack also lands one "Prismatic Strike" for 0.55%·k·r of the boss's max HP (`heroAttack` strike, separate hit so on-hit effects don't scale off it).
- Enemy scaling (`mkEnemy` atk/HP want, hunter, `recapActAtk`, `mkActBoss`) now uses `calcFoe` = stats without the Bulwark, so foes are not re-tuned to cancel the new HP.
- Bag stats: two chips (Bulwark cap + Last Stand cd; star HP/DR/resist/boss dmg/%HP).
- Test hooks: bwSim / bwTier / bwGear / bwLive / bwHit; `simBwFight` (real calc + heroAttack on mkActBoss + enemyAttack). Test: tests/bulwark.mjs (screenshots-bulwark/, not published).

**Run speed v2.** Every slot incl. pets can roll it (`mvCanRoll` = not gem); ceiling `8 + 92·(min(ilvl,1000)/1000)^0.5` ×rarity (0.4 + 0.6·rar/7) → +100% at Prismatic ilvl 1000+; total cap 400% (`MV_CAP`). Load no longer clamps to the ilvl range: `mvFixItem` only limits 0..100, and once per item (marker `it.mvv = MVV = 2`, packed at index 25) restores to +100% any value exactly equal to the 11:11–11:28 builds' clamp ceiling (`mvOldClampMax`), undoing that clamp.

## 2026-11-18 (13:19 CT): boss scaling from depth 500 (option O6) + smaller chest sprite with rarity aura
Approved O6 of BOSS-SCALING-D500-OPTIONS.md (not O6b). Bosses only (`isBossFoe`), depth >= 500 only (`O6_D0`). No player-side change; A1/C1, run speed and Paramount unchanged.
- **O2 raise-only gear-matched HP** (`o6Apply` / `o6TargetMul`, run lazily on a boss's first hit, in `hurtEn` and `applyHpDmg`): T = 150 − 80k s (k = Bulwark star power / 78), N = T / RT_ATK, Pn = expected swing damage × C1 boss bonus, pct = C1 %-strike, sh = (max HP + shield) / max HP; HP = max(HP_now, Pn / (1/N − pct) / sh). If pct ≥ 1/N the factor is `O6_MAXMUL` (1e6). Max HP, current HP, shield and overshield pools are scaled together (`scaleBossPools`). Flags on the enemy: `o6`, `o6m`.
- **O3 star-tiered per-second cap** (`o6Gate`): a boss loses at most (2% + 1.5%·k) of max HP per second, measured before shields absorb, token bucket with one second of budget (`o6t`, `o6b`), clock `g.petAbiT`; includes DoTs/effect damage via `applyHpDmg`, the C1 %-strike and ults. Paramount (`src.p`) is exempt. Excess shows "RESIST".
- **O5 light phases** (`o6PhaseClamp`, `o6PhaseAfter`): at 75/50/25% HP a non-Paramount hit stops at the threshold and the boss is invulnerable for 4 s (`o6ph`, `o6inv`); it still acts; no extra shield. Paramount passes thresholds without triggering transitions. Clock-reset guard after reload.
- Test hooks: o6Sim (real fight to the end on a 0.33 s clock, basic or full combat, on/off), o6Log, o6Para. Test: tests/o6.mjs (screenshots-o6/, not published).
- **Chests:** 2x2 footprint unchanged; sprite drawn at `CHEST_BIG_W` = 30 px (1.25 tiles), centred, crisp (cached 24 px sprite, nearest-neighbour), small shadow, rarity outline. New `chestAuraFx`: cached radial aura per rarity (`CHEST_AURA_R`, `CHEST_AURA_A`, pulsing) + rising sparks (`CHEST_SPARKS` = 1/2/3/4/6 by rarity); reduced motion → static aura, no sparks. Legacy 1x1 chests get the aura too. Hook chestShowAll; screenshots-chests/ (not published).

## 2026-11-18 (13:31 / 13:34 CT): Eternal Reapers rewrite (ult id 26) + act-boss skull on the minimap
**Eternal Reapers** (id 26 only; name unchanged; damage, targets, cooldown untouched; purely the show + sound):
- Timing: 4 corner sweeps start at `UREAP_T0` = 0.06/0.27/0.48/0.69 s, each `UREAP_SW` = 0.32 s (was 0.55, ease-in-out cubic `reapEase` so it accelerates through the middle); great rainbow scythe at `UREAP_BIG` = 0.98 s, 0.2 s rise/wind-up, one full clockwise revolution in 0.46 s, shockwave; show length `UREAP_DUR` = 2.35 s.
- Size: sweep radius = max(0.95·min(W,H), 0.55·screen diagonal) from a corner pivot (`reapSweep`), blade 0.5·min(W,H); finale radius 0.66·min(W,H), blade 0.62 of that. Scales with the view, so it fits phones.
- **Blade-first fix:** `uScythe(..., lead)` now draws in a frame where +y is the direction of travel; the blade leaves the snath head and hooks FORWARD, concave white cutting edge on the leading side, dark spine trailing. `lead` = sweep direction (+1 clockwise sweeps 1 & 3 and the finale, −1 counter-clockwise sweeps 2 & 4). The old shape put the blade on the trailing side (and the CCW sweeps were rotated 180°), so it hit spine-first. Blades draw with source-over so they read as solid steel. Motion-blur ghosts trail behind.
- Trails: white core + rainbow halo + blood-red underlayer arc that lingers; sparks shed from the edge.
- Hits (`reapHitInfo` precomputes when each target is cut and the blade's travel direction there; `reapStrike` on each hit event): flinch flash (`e.hit`), knockback nudge along the blade's path (`bump`/`bdx`/`bdy`, visual only, no position change), `spawnBlood` toward the travel direction, red/gold burst, shake 4 (5 on the finale); drawn cut = 3 claw lines along the path, blood droplets flung forward, sparks, glow.
- SFX (`sfx("ult")` case 10): per sweep a steel-leaving-sheath scrape + rising bandpass whoosh + struck-metal ring (inharmonic partials 1/2.76/5.4/8.93, ~1.1 s decay); finale: drawn-blade ring, long whoosh, ring, low boom. Per hit: new `sfx("reapHit")` = wet slash + flesh thud + steel tick, throttled to >= 50 ms apart and at most 14 per cast (`UREAP_HIT_GAP`, `UREAP_HIT_MAX`).
- Test hooks: reapLog, reapFreeze, reapSheet. Test: tests/reapmm.mjs; screenshots-reaper/ (contact-sheet.png, not published).

**Act-boss minimap marker:** on an act floor (`isActFloor`, the floor before camp; not camp/vault) every live act boss (`e.act`, cls 2) gets a pulsing 5x5 red pixel skull with dark outline and halo (`mmBossSkull`) at its live position on the minimap and the enlarged map, even in unexplored fog. Only the marker is drawn; `g.seen` is untouched. It is clamped inside the map frame and disappears when the boss dies. Reduced motion → no pulse. Drawn per frame from live state, so existing saves get it immediately. Hook mmBoss; screenshots-mmboss/ (not published).

## Prismatic combine rules — confirmed design (Metal Complex voice, 2026-11-18 1:49 PM CT) — IMPLEMENTED (2026-11-18, approved 1:51 PM CT)
Originally design rules only; implemented in the same deploy as the Eternal Reapers rewrite (see "Implementation" below). Sits alongside the existing Prismatic combine and Dual Titan (PRT_DUAL) notes.

Current code for reference (lookup 2026-11-18): weapons — 3 identical types keep the type, mixed 1H/2H rolls a random weapon of that handedness (may repeat an input type); pets — result keeps the first input's pet type (`it.pt = a.pt` in makeCombined) and inherits ability/rare power (e.g. Dual Titan) from the highest-star input (petAbiFromInputs / petRareFromInputs); pets never grant an ultimate (ultsOf skips pets) and do not count toward Paramount (PARA_GEAR = head, chest, arms, legs, rh, lh).

Confirmed rules (target behavior):
1. Combining Prismatic pets always produces a totally new pet with new abilities — never the same pet as the inputs.
2. Every combined Prismatic pet must offer an ultimate ability.
3. That ultimate can change depending on the pet and the combination.
4. Same for any Prismatic item combination: when Prismatic items combine into an upgraded Prismatic item, the ultimate it grants can change with the combination.
5. Only exception: combining three of the exact same Prismatic type — the "always becomes something different" rule does not apply in that case.

Open question (asked 2026-11-18, awaiting answer): should a Prismatic pet's ultimate get its own button/cooldown and count toward the six pieces Paramount needs?

## Eternum necklaces — design rules (Metal Complex voice, 2026-11-18 1:54 PM CT) — NOT YET IMPLEMENTED
Design only; no Eternum necklaces exist in the code or earlier notes as of this entry. Sits alongside the Prismatic pet / combine rules above.
1. Eternum necklaces are the only item in the game that never auto-equips. Each of their unique affixes can be as powerful as the next, so the player decides which one to wear.
2. When the player obtains their first Eternum necklace, a new dedicated bag section appears with exactly seven slots that hold only the seven Eternum necklaces and nothing else.
3. That section does not exist until the first Eternum necklace is obtained; once it appears, the player can pick and choose which of the seven to equip at any time.
4. Pickup alert (added 1:58 PM CT): picking up an Aeternum/Eternum necklace triggers a notification completely unlike every other notifier in the game — highly attention-grabbing, with its own unique rapid chime/tune (a quick 'da-da-da-da-da-da-da-da-da-da-da' run of notes) used for nothing else, so any player stops and wonders what just happened.
(Spelling: the user has said both 'Eternum' and 'Aeternum'; confirm the final in-game name before implementing.)
5. Drop presentation (added 1:59 PM CT): the pet never auto-picks up an Eternum necklace; it falls to the ground. A unique, unmistakable beam of golden energy shines from the ceiling straight down onto the necklace and stays on it until it is picked up. The necklace lies on the ground giving off a heavenly, sparkling golden light. A golden bar across the top of the beam reads "Eternum Necklace" (or similar). The drop plays the rapid da-da-da-da chime and sound effect from rule 4. Rules 1-4 are unchanged.

### Implementation (2026-11-18, approved 1:51 PM CT)
- "Exact same type" (`combineSameType`): pets = same pet type `pt`; weapons = same weapon kind; armor = same slot kind AND same base design `d[0]` (armor always shares its slot, so the base is what makes it the "same" piece).
- **Pets** (`makeCombined`): three Prismatic pets that are not all the same type -> a pet type none of the inputs had (re-rolled until it differs; 100 types), fresh `petAbiRoll` ability and `petRareRoll` rare power, no inheritance. Three of the same type keep the type and the old highest-star ability/rare inheritance. Mythic -> Prismatic pet combines keep the first input's type as before (rule 1 is about Prismatic pets).
- **Ultimates on combine:** every Prismatic result (armor, weapon, pet; never shield) rolls a new ultimate (`ri(50)`, may match an input by chance); three of the exact same type keep the primary (equipped) input's ultimate.
- **Pet ultimates:** `makePet` rolls `ult` for Prismatic pets; `validItem` keeps pet ults and gives every existing Prismatic pet without one a stable ult derived from its seed (`petUltOf`), on every profile, equipped, bag and stash; non-Prismatic pets carry none. `ultsOf` includes the pet (shields still excluded) -> own button (7th button fits the 2-column grid; key 7 on keyboard), own independent cooldown, same damage formula (`ultDamage`) as armor/weapon ults.
- **Paramount** (`paraPieces`): unlocks with any six Prismatic ultimates among head, chest, arms, legs, rh, lh, pet. Chosen rule: the six gear slots are used first (an existing full set behaves exactly as before); the pet fills in only when a gear slot has no ultimate (e.g. a shield in the left hand). Never seven. Only the six used are locked for the 3 minutes. Beam/visuals/shake/damage formula unchanged.
- Bulwark already counts all 7 slots incl. pet; fuse multiplier is per-item (unchanged). Test: tests/combine.mjs (17 checks), hook `__ED16_PRIS.combineRules`, `__ED16_HZ.ultLive`.

## Water, ice and lava — design rules (Metal Complex voice, 2026-11-18 1:57 PM CT) — NOT YET IMPLEMENTED
Design only; game code unchanged as of this note. Sits alongside the Prismatic pet combine rules and Eternum necklace rules above.
- Water: no longer blocks the player's path. The player can walk through water, with splashing sound effects while moving through it. All other existing water rules still apply, including that certain abilities can completely evaporate water.
- Ice: a regular (non-Paramount) ultimate that hits ice melts it into water. A Paramount attack evaporates both ice and water.
- Lava: unchanged. It still blocks the path completely. The only way past it is a Paramount attack, which turns lava into obsidian the player can walk across.

## 2026-11-18 (14:05 CT): O6 retune (approved) — act-boss fights 1-3 min at d500+
Only O6 levers changed; player side, A1/C1, Paramount and everything else untouched.
- Root cause of the long 13:19 fights: the HP match ignored the act boss's phase shield refills (`actBossPhase`: 2 full refills from act 2 up), so pools were ~2-3x too big; and when the C1 %-strike alone was fast the HP was raised x1e6, which made the fight pace = the %-strike.
- `o6PoolMul(e)` = (max HP + shield x (1 + refills)) / max HP, used by the HP match and the cap.
- HP match: HP = N*Pn / max(sh/4, sh - N*pct), N = (T - transitions)/0.33 s, T = `O6_T0` - `O6_TK`*k = 206 - 75k s (0* ~189, 5* ~160, 10* ~131); was 150 - 80k.
- Lowering: only for a star-free kit (`o6ZeroStar`: every equipped Prismatic has 0 stars) may the matched HP go BELOW the natural HP, floor `O6_MINMUL` = 1e-6 (d2000 0*: x0.0068, d3000 0*: x0.000027). Starred kits are never lowered.
- If the match leaves the boss as is (factor 1 = kit already slower than the target), O6 adds no cap and no transitions to that boss.
- Per-second cap: (`O6_CAP0` + `O6_CAPK`*k) of the whole pool = 0.6% + 0.44%*k per second (0* 0.70%/s, 5* 0.87%/s, 10* 1.04%/s); was 2% + 1.5%*k of max HP. Sets full-combat time ~149/122/104 s.
- Transitions: still 3 (75/50/25%), `O6_PH_T` 3 s (was 4).
- Saves: bosses scaled by the 13:19 build (`o6` = 1) are un-scaled by their stored factor and re-matched once (`O6_VER` = 2), keeping the HP fraction.
- Known gap (needs a decision): starred kits that are slow even without O6 (5* at d2000/d3000 ~5.3-5.6 min, 10* at d3000 ~3.5 min) are unchanged, so deep 0* gear now finishes faster than deep 5* gear. Letting the lowering apply to all kits would put 5* at ~2.7/2.0 min and 10* at ~2.2/1.7 min everywhere.
- Test: tests/o6.mjs (8 checks), hooks o6Tune (test-only), o6Migrate.

## Eternum necklace affixes — chosen so far (Metal Complex voice, 2026-11-18 2:41 PM CT) — NOT YET IMPLEMENTED
Eight standard necklaces planned; six chosen, two slots open. Colors are suggestions.
1. Storm Crown [offensive, electric blue]: every third attack calls lightning chaining between up to 6 enemies.
2. Grave Toll [offensive, ghostly teal]: every enemy you kill rises as a ghost that fights for you for 20 s.
3. Phalanx of the Dead, war version [offensive, sickly green]: six sword skeletons march around you and stab anything in reach (no blocking); each kill they get gives the group +5% damage, stacking to +50% until you leave the floor; a broken skeleton rebuilds after 4 s; if all six break at once they burst into a bone-shard storm.
4. Second Heartbeat [protective, crimson]: when you'd die you split into two of you at half HP each; you only die if both fall; the survivor is whole again after 10 s.
5. Echo Self [offensive, silver]: a ghostly copy of you repeats every attack and spell you used 1 s earlier at full damage.
6. Snow Globe [protective, frosty ice white]: below 40% HP a glass globe seals you for 3 s (immune) and nearby enemies slide as if on ice; 30 s cooldown.
Dropped: Titan's Grip, Wound Return (earlier keepers, later replaced), Puppeteer, Bone March.

### Necklace affixes — balance pass (2026-11-18 2:45 PM CT, proposed to user; supersedes numbers above)
Seven chosen, one slot open. Offensive target ≈ +50% effective damage; protective target ≈ one save per 30–60 s.
- Storm Crown: every 3rd attack, lightning hits up to 6 enemies at 100% weapon damage each.
- Grave Toll: killed enemies rise as ghosts for 15 s at 40% of your damage, max 5 at once.
- Phalanx of the Dead (war): 6 sword skeletons, 8% of your damage each, +5% per kill up to +50% for the floor; rebuild 4 s; all-six-break bone-shard storm.
- Echo Self: copy repeats attacks/spells 1 s later at 50% damage.
- Second Heartbeat: on lethal hit split into two at half HP each, both at FULL damage (damage doubles while split); survivor whole after 10 s; 3-minute cooldown.
- Snow Globe: below 40% HP, 3 s immune globe + enemies slide on ice; 45 s cooldown.
- Prism Guard [protective, diamond rainbow shimmer, very visible sparkle on character]: diamond shell blocks one full hit every 6 s, then fires a rainbow beam at the attacker for 200% weapon damage.

### Necklace affixes — update 2026-11-18 2:47 PM CT
- Snow Globe REMOVED (user wants exactly two protective: Second Heartbeat, Prism Guard).
- NEW Neon Skyfall [offensive, multicolor neon red/green/blue/violet]: while you move, ceiling laser beams strike random enemies within ~5 tiles twice per second for 25% weapon damage each; each leaves a glowing scorch mark burning enemies in it for 10% of your damage per second for 3 s (~+50% effective damage).
Current seven: Storm Crown, Grave Toll, Phalanx of the Dead (war), Echo Self, Neon Skyfall (offensive); Second Heartbeat, Prism Guard (protective). One slot open.

### Necklace icon gem colors (2026-11-18 2:50 PM CT) — visual/mnemonic only, NOT tied to socketable gems
Storm Crown sapphire blue; Grave Toll amethyst purple; Phalanx of the Dead (war) peridot lime; Echo Self opal white; Neon Skyfall topaz yellow; Second Heartbeat ruby red; Prism Guard emerald green; 8th (unchosen) reserved citrine orange.

## Eternum necklaces — DEPLOYED with spec D (2026-11-18 ~6:25 PM CT). First implemented locally ~4:45 PM CT.
Supersedes the earlier drop-rule drafts (depth 201 / ~600 / ~470). Snow Globe removed. Locked rules (Metal Complex voice, 3:40 PM CT):
- The seven standard necklaces drop only from depth 101 (after depth 100 is completed). Tuned so an average player has all seven around depth 500.
- Source scaling: normal enemies least likely, rising through rare packs, chests by rarity, elites, vault chests, royal goblins, super/ultra elites, loot goblins, mini-bosses (more with boss power and overshields), hunters, the Goblin King, and act bosses. Act bosses with x2-x3 boss power and up to 3 overshields are by far the most likely.
- Prismatic Eternum: cannot drop until all seven are owned. Same source scaling. Rarer than any single standard necklace (per roll about 2.8x rarer than one specific necklace). Tuned to about 500 more depths on average after the seventh.
- Every source stays at least about 4x rarer than a Prismatic item from that same source. The lowest margins are vault chest r0 at about 3.8x (few samples) and act boss x3 +3 overshield at 4.3x.

Code: chance per roll = NK_BASE (0.000012) x weight for any of the seven, picked evenly. Prismatic Eternum = NK_BASE_E (0.00000062) x weight, only once all seven are owned, and only one can be on the ground at a time.
- Weights: normal 1, rare pack 1.25, chest r0-r4 2/3/6/10/16, vault chests x2, elite 4, royal goblin 8, super elite 12, ultra elite 20, loot/gem/gold goblin 25.
- More weights: mini-boss 30 x(1 + 0.25 per extra boss-power step) x(1 + 0.25 per overshield), hunter 35, Goblin King 60.
- Act boss: 4400 x boss power (x1-x3) x(1 + 0.5 per overshield). That ranges from 5.3% (x1) to 39.6% (x3 with 3 overshields) per kill.
- Swarm and split children never roll. The full per-source table is in tests/nk-drop-table.md.

Simulation (tests/_nkcollect.mjs + _nkmc.mjs): it replayed the game's own genFloor at every depth from 101 to 2500, 3 floors per depth (7,200 floors). Each floor was fully cleared through kill() and openChest(), and every cave/vault/arena portal it rolled was entered and cleared. Then 10,000 simulated players were run on top of that.
- Gear "full" means a full Prismatic set equipped. That gear unlocks boss power and overshields, and it was used as the tuning baseline.
- All seven: mean depth 507, median 475, p10 300, p90 760.
- Prismatic Eternum: mean +497 depths after the seventh (median +338, p10 +55, p90 +1141). That is mean depth 1004, median 865.
- Sensitivity: a player with NO Prismatic gear gets no boss power or overshields, so collecting is about 3x slower (all seven around depth 1530).
- Assumes the player clears whole floors and enters the caves. Skipping content pushes these depths later.

Verification (local headless, throwaway profiles; 28 + 36 + 8 + 4 checks):
- tests/necklaces.mjs, tests/necklaces2.mjs: depth gating, every source, real kill()/openChest(), Prismatic gating, pet, pickup, duplicates, equip rules, bag section, alert and chime.
- tests/necklaces3.mjs + _nkbeam.py: the beam screenshot check.
- tests/nksave.mjs: save round trip on a copy of Richard's save.
- smoke.mjs ran on a copy root: 14/14. recover.mjs had the same 2 pre-existing failures as the live build's committed results.
- Icons come from necklace-icons/ (kept out of git and publish) and are embedded as 64 px data URLs.

### Prismatic Eternum drop effect (deployed 2026-11-18 ~6:25 PM CT with spec D)
- Beam about 2.5–3x wider than a standard necklace: a 200px rainbow glow, 9 rotating hue bands, hue stripes travelling upward, and a pulsing white core that stops just above the gem. The PE icon is redrawn on top so the light never hides it.
- A 4-ring rainbow halo with a white heart, 64 swirling rising stars, a 40-star falling shower, and a rainbow name bar ("PRISMATIC ETERNUM / wear two necklaces at once").
- A 2.6 s burst when it drops: a rainbow screen wash, 4 expanding shockwave rings, 24 rays and a 50-star burst. It also adds a white flash of 0.6 and a screen shake of 6.
- A rainbow banner "PRISMATIC ETERNUM!" / "The rainbow necklace has fallen - follow the light!" that lasts 8 s.
- A fanfare of about 3 s (nkChime v=7): a 16-note run, a held chord, sparkle pings and high final tones.
- Standard necklaces are unchanged. Screenshots are in screenshots-necklaces/ (git-ignored).

### Eternum drop rates - rework (local, not deployed — 2026-11-18 ~5:45 PM CT)
- The act boss x3 + 3 overshields is still the single best source, but it now gives 11.9% for any of the seven (was 39.6%). Act bosses run from 10.0% (x1) to 11.9% and always rise with boss power and with overshields: weight 8300 × (1 + 0.05 per extra power step) × (1 + 0.03 per overshield).
- Other sources were raised (normal ×3.5, elite ×6.6, chests ×6–12, mini-bosses ×3.7–6.3, goblins/hunters/King ×3–6.4) so the overall pace stays the same:
  - all seven: mean 509, median 480, p10 314, p90 740
  - Prismatic Eternum: +500 mean (median +353), reached at depth mean 1009 / median 885
  - (10,000 players on 7,200 real floors)
- NK_BASE stays 1.2e-5. NK_BASE_E is 5e-7, so the Prismatic Eternum is about 3.4x rarer per roll than one specific necklace.
- Rule kept: every source is still rarer than a Prismatic item from the same source. The margin is now thin, about 1.25–1.3x, for normal, rare pack, elite and most chests.
- Ladder: normal < rare < elite < royal < super < ultra < goblin < hunter < King < mini-bosses < act bosses. Hunters and the King now sit below all mini-bosses.
- A uniform raise (×11 on every non-boss source) would also hit 500/+500. It breaks the Prismatic rule for 13 sources: normal 2.4x more common, rare pack 2.2x, vault r0 2.9x, mini-bosses up to 2.2x.
- Full table: tests/nk-drop-table.md. Scripts: tests/_nkrework.mjs, _nkfinal2.mjs, _nkreport.mjs.

### Eternum drop rates - FINAL (user's choice 5:25 PM CT; local, not deployed)
- **Supersedes the "rework" section above.** The user picked the uniform alternative.
- **Act bosses:** weight 4400 × (1 + 0.2 per extra power step) × (1 + 0.116 per overshield). That gives 5.3% (x1) up to 10.0% (x3 + 3 overshields, was 39.6%), always rising with power and with overshields.
- **Every other source:** 11× its original weight. Normal 11, rare 13.75, elite 44, royal 88, super 132, ultra 220, goblin 275, hunter 385, King 660, mini 330 (with the same 0.25/0.25 scaling as before). Chests 22/33/66/110/176; vault chests 44/66/132/220/352.
- **Base rates:** NK_BASE 1.2e-5, NK_BASE_E 4.6e-7.
- **Simulation (10,000 players on 7,200 real floors):**
  - all seven: mean 502, median 470, p10 311, p90 731
  - Prismatic Eternum: +512 mean (median +375), reached at depth mean 1013 / median 896
- **Rule the user accepted breaking:** 13 sources are now more common than a Prismatic item from the same source — normal, rare pack, elite, chest r3, vault r0–r3, and the mini-bosses (x1, x1+1, x1+2, x2+3, x3+3). The full numbers are in tests/nk-drop-table.md.

### Eternum drop rates - SPEC C (user, 5:37 PM CT; replaces A and B; local, not deployed)
- **Act bosses:** weight 2500 × (1 + 0.75 per extra power step) × (1 + 0.5555 per overshield).
  - x1 is 3.0% for any of the seven; x3 alone is 7.5%.
  - x3 + 3 overshields is 20.0%, the only case at 20%. The next highest is x3 + 2 at 15.8%.
- **Every other source:** 5.57× its original weight. The best non-boss source, mini-boss x3 + 3 overshields, is 0.53%.
- **Base rates:** NK_BASE 1.2e-5, NK_BASE_E 6.5e-7, so the Prismatic Eternum is about 2.6x rarer per roll than one specific necklace.
- **Simulation (10,000 players on 7,200 real floors):**
  - all seven: mean 603, median 560, p10 364, p90 890
  - Prismatic Eternum: +497 mean (median +346), reached at depth mean 1100
- **Prismatic-item rule (waived by the user):** broken for normal ×1.22, rare pack ×1.12, vault chest r0 ×1.47 and mini-boss x3+3 ×1.12.
- B's weights are saved in tests/nk-rework-B.json and nk-rework-B-params.json; the table is in tests/nk-drop-table.md.

### Eternum drop rates - SPEC D (user, 5:44/5:45 PM CT; replaces C; DEPLOYED 2026-11-18 ~6:25 PM CT)
- **Rule:** from every source, a necklace (any of the seven) is at most 0.5x as likely as a Prismatic item from that same source. The one exception is act x3 + 3 overshields: 20%, which is 0.67x its 29.9% Prismatic chance.
- **How the Prismatic chances were measured:** P(at least one Prismatic item) per kill or chest, at depth 101–110, where Prismatic odds are lowest. They come from the loot formulas: an `NK_PX` test hook adds up the exact Prismatic probability of every roll (rollRar / actLootPick / jackpotRar / seLootPick) during real kill() / openChest() calls. That covered about 590k kills/chests (tests/nk-pris-ref.json). Deeper floors only raise Prismatic odds, so the rule holds at every depth.
- **Act bosses:** weight 2500 × (1 + 0.75 per extra power step) × (1 + 0.25 per overshield), with an extra ×1.524 only for x3 + 3.
  - x1 is 3.0%. The next highest after x3 + 3 is x3 + 2 at 11.3%.
- **Mini-bosses:** 37 × (1 + 1.0 per extra power step) × (1 + 0.4 per overshield).
- **Other sources:** min(spec C weight, 0.5x the Prismatic cap).
- **Base rates:** NK_BASE 1.2e-5, NK_BASE_E 8.9e-7.
- **Simulation (10,000 players on 7,200 real floors):**
  - all seven: mean 778, median 729, p10 452, p90 1172 — up from 603
  - Prismatic Eternum: +499 mean (median +347), reached at depth mean 1278
- **Saved earlier versions:** C in tests/nk-rework-C-final.json; the table is in tests/nk-drop-table.md.

- **Deployed** to https://metalcomplex87.github.io/endless-depths-16/ on 2026-11-18 ~6:25 PM CT (America/Chicago), together with the Prismatic Eternum drop effect and the rest of the necklace system. The test-only `NK_PX` hook stays inert in production unless a test enables it. Necklace rate-tuning scratch (`tests/_nk*`, `tests/nk-rework-*.json`, `screenshots-necklaces/`, `necklace-icons/`) and the usual options/audit/screenshots material were kept out of the publish.
