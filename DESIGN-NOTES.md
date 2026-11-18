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
