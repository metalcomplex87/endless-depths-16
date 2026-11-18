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
- Visual (about 4.9 s, damage lands at 2.25 s): world darkens and game time runs at 30%; six beams in each
  ultimate's color rise into a rotating rainbow sigil with a counter-rotating hexagram; it collapses into a
  white-gold singularity, then detonates: white-gold flash, heavy screen shake, full-screen rainbow
  shockwave, 46 prismatic glass shards, a unique layered sound sting, and a "PARAMOUNT" title card with
  the combined damage number and struck/slain count. Canvas-only, fixed-size buffers (phone-safe).

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
