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
