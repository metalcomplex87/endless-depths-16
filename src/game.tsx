import { useState, useEffect, useRef, useGrokTheme } from "grok/canvas";

// STORAGE KEYS ARE STABLE ACROSS DEPLOYS. Never rename these, or existing
// player saves will not load: ed16_save_v1_p1/p2/p3 and their _bak keys,
// ed16_stash_v1_pN / _bak, ed16_profile_mig_v1, ed16_best, ed16_lvl, ed16_lock.
// Future edits belong in /workspace/ed16-web/src, not the Cursor canvas.

const TS = 24;
const BASE_VW = 240;
const BASE_VH = 300;
let VW = BASE_VW;
let VH = BASE_VH;
const PX = 3;
const HUD = 30;
const MSGH = 22;
let VIEWH = VH - HUD - MSGH;
// CSS px per game pixel of the old letterboxed 240×300 view on a ~412×344 canvas (~27.5px tiles).
const VIEW_MARGIN = 4;
const VIEW_REF_SCALE = 275 / 240;
const VIEW_MIN_SCALE = 0.8;
type PlayView = { vw: number; vh: number; cssW: number; cssH: number; scale: number; viewH: number };
function computePlayView(availW: number, availH: number): PlayView {
  const aw = Math.max(80, Math.floor(availW - VIEW_MARGIN * 2));
  const ah = Math.max(72, Math.floor(availH));
  let scale = Math.min(VIEW_REF_SCALE, ah / BASE_VH, aw / BASE_VW);
  if (!(scale >= VIEW_MIN_SCALE)) scale = VIEW_MIN_SCALE;
  const vw = Math.max(BASE_VW, Math.round(aw / scale));
  scale = aw / Math.max(1, vw);
  let vh = Math.max(HUD + 80 + MSGH, Math.round(ah / scale));
  if (vh * scale > ah + 0.5) vh = Math.max(HUD + 80 + MSGH, Math.floor(ah / scale));
  return { vw, vh, cssW: aw, cssH: Math.min(ah, Math.round(vh * scale)), scale: aw / vw, viewH: vh - HUD - MSGH };
}
function setPlayView(v: PlayView): void {
  const changed = v.vw !== VW || v.vh !== VH;
  VW = v.vw; VH = v.vh; VIEWH = v.viewH;
  if (changed) IP.camOk = false;
  try {
    (window as unknown as { __ED16_VIEW?: object }).__ED16_VIEW = { vw: VW, vh: VH, viewH: VIEWH, tilesX: VW / TS, tilesY: VIEWH / TS, cssW: v.cssW, cssH: v.cssH, scale: v.scale };
    if (document.documentElement && document.documentElement.dataset) {
      document.documentElement.dataset.ed16Vw = String(VW);
      document.documentElement.dataset.ed16Vh = String(VH);
    }
  } catch { /* tests only */ }
}
function applyPlayViewToCss(v: PlayView, stageW: number, stageH: number): void {
  const de = document.documentElement;
  const left = Math.max(0, (stageW - v.cssW) / 2);
  const top = Math.max(0, (stageH - v.cssH) / 2);
  de.style.setProperty("--ed-cv-w", v.cssW + "px");
  de.style.setProperty("--ed-cv-h", v.cssH + "px");
  de.style.setProperty("--ed-cv-left", left + "px");
  de.style.setProperty("--ed-cv-top", top + "px");
  de.style.setProperty("--ed-hud-css", (HUD * (v.cssH / Math.max(1, v.vh))) + "px");
}
function resizeGameCanvas(): void {
  const cv = document.querySelector("canvas.dc-cv") as HTMLCanvasElement | null;
  if (!cv) return;
  const w = VW * PX, h = VH * PX;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
}
function playScale(): number {
  try {
    const w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ed-cv-w"));
    if (w > 0 && VW > 0) return w / VW;
  } catch { /* ignore */ }
  return VIEW_REF_SCALE;
}
function hudRightPad(): number { return Math.max(22, Math.round(30 / Math.max(0.6, playScale()))); }
function noticeLeft(): number { return Math.max(24, Math.round(34 / Math.max(0.6, playScale())) + 2); }
const MW = 44;
const MH = 44;
const BAG = 50;
const GEM_BAG = 30;
const BAG_GROW = 20;
// Persist caps: a save keeps the current floor (and the previous one) plus full character
// progress, never an unbounded history of logs, visited floors, or kill lists.
const SAVE_CHEST_CAP = 40;
const SAVE_DROP_CAP = 80;
const SAVE_GROUND_CAP = 80;
const SAVE_VAULT_MAX = 200000;
const INV_COLS = 6;
const ICON = 52;
const GOLD = "#ffd840";
const SKIN = "#f0c090";
const HAIR = "#5a3418";
const DK = "#120c14";
const BONE = "#e8e0d0";

type WT = "sword" | "axe" | "mace" | "spear" | "dagger" | "greatsword" | "greataxe" | "warhammer" | "bow" | "crossbow" | "staff" | "shield" | "scythe" | "flail" | "katana" | "nodachi" | "claws" | "handxbow" | "wand" | "beamsword";
type AK = "head" | "chest" | "arms" | "legs";
type Kind = AK | WT | "pet" | "gem";
type EqKey = "head" | "chest" | "arms" | "legs" | "rh" | "lh" | "pet";
type Bonus = "hp" | "atk" | "def" | "crit" | "spd" | "regen" | "mv";
type Trait = "fast" | "regen" | "split" | "ranged" | "brutal";
type Mode = "title" | "play" | "dead";
type Pt = (x: number, y: number, w: number, h: number, c: string) => void;
type Eq = Record<EqKey, Item | null>;
type El = "holy" | "fire" | "frost" | "elec" | "hell" | "void" | "dark";
type Shape = "bolt" | "nova" | "chain" | "meteor" | "beam" | "pillar" | "blades" | "rupture" | "summon" | "cloud";
type PType = "orbs" | "aura" | "thorns" | "retal" | "pulse" | "steps" | "halo" | "field" | "ward" | "sentinel";
interface Spell { el: El; sh: Shape; mod: number; ch: number; pw: number; r: number; name: string }
interface Passive { el: El; ty: PType; mod: number; pw: number; name: string }
interface Fx { k: string; x: number; y: number; x2: number; y2: number; t: number; max: number; c: string; c2: string; r: number; seed: number; fired: boolean }
interface Ground { x: number; y: number; t: number; el: El; dmg: number }
interface Ally { t: number; el: El; pw: number; ph: number }
interface Trader { x: number; y: number; stock: Item[] }
type MerchId = "helmet" | "gloves" | "chest" | "boots" | "twoHand" | "oneHand" | "pet" | "gem";
interface ChestDeal { price: number; buys: number }
interface Merchant { x: number; y: number }
interface Ult { n: string; el: El; pat: number; c2: string; i: number }

interface Item { id: number; seed: number; kind: Kind; rar: number; ilvl: number; name: string; atk: number; def: number; block: number; bonus: Partial<Record<Bonus, number>>; d: number[]; spells?: Spell[]; pas?: Passive[]; ult?: number; ef?: number[][]; pt?: number; set?: number; st?: number[][]; wel?: El; sk?: { c: number; g?: { typ: number; rar: number } }[]; gt?: number; golden?: boolean; pab?: number }
interface WInfo { n: string; two: boolean; dmg: number; spd: number; crit: number; reach: number; range: number; magic: boolean; cleave: boolean; pierce: number; stun: number; knock: number; grip: number; note: string; bases: string[] }
interface Fam { n: string; v: string[]; h: number[]; s: number; e: string; hp: number; atk: number; def: number; min: number; tr: Trait | null }
interface En { id: number; x: number; y: number; ax: number; ay: number; f: number; v: number; cls: number; hp: number; mhp: number; atk: number; def: number; xp: number; name: string; tr: Trait[]; stun: number; child: boolean; hit: number; bump: number; bdx: number; bdy: number; awake: boolean; face: number; pal: string[]; burn: number; burnD: number; slow: number; weak: number; fear: number; gob?: number; hunt?: number; bl?: number; blD?: number; poi?: number; poD?: number; doom?: number; doomD?: number; chm?: number; mk?: number; dis?: number; at?: number; ra?: number; rare?: number; pack?: number; lead?: number; elW?: El; elR?: El[]; shd?: number; mshd?: number; act?: number; phase?: number; abt?: number; abc?: number; abCd?: number; abIntro?: boolean; se?: number; bN?: number; packId?: number }
interface Drop { x: number; y: number; item: Item | null; pot: boolean; gold: number }
interface Chest { x: number; y: number; open: boolean; rar: number; starter?: boolean; items?: Item[] }
interface Torch { x: number; y: number; typ: number; dir: number; ph: number }
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number; g: number; k?: number; ang?: number; spin?: number; gib?: boolean }
interface ES { combo: number; cid: number; chg: number; rush: number; rage: number; hits: number; aegis: number; decoy: number; dodge: number; eth: number; tr: number; trT: number; wind: boolean; last: boolean; iron: boolean; still: boolean; moved: number; free: number; frz: number; q: number[][] }
interface PShot { x0: number; y0: number; x1: number; y1: number; t: number; max: number; pt: number; rar: number; hit: boolean }
interface Float { x: number; y: number; txt: string; c: string; life: number }
interface Shot { x0: number; y0: number; x1: number; y1: number; t: number; c: string; max?: number; dmg?: number; tx?: number; ty?: number; from?: number; typ?: number }
interface Banner { txt: string; sub: string; c: string; rar: number; t: number }
interface Stats { maxHp: number; atk: number; def: number; crit: number; spd: number; block: number; regen: number; reach: number; range: number; magic: boolean; cleave: boolean; pierce: number; stun: number; ward: number; mv: number }
interface Hero { x: number; y: number; ax: number; ay: number; face: number; dir?: number; hp: number; bump: number; bdx: number; bdy: number; as?: number }
interface FloorSnap {
  d: number; map: string; seen: string; chests: Chest[]; drops: Drop[];
  trader: Trader | null; portal: { x: number; y: number; kind?: "vault" | "camp" | "proceed" } | null; ground: Ground[];
  theme: number; campSpot?: { x: number; y: number }; gobT: number; floorTurn: number;
  cracks?: string;
}
interface Game {
  mode: Mode; depth: number; map: Uint8Array; seen: Uint8Array; vis: Uint8Array; theme: number; tiles: HTMLCanvasElement[];
  hero: Hero; lvl: number; xp: number; gold: number; gems?: number; potions: number; eq: Eq; bag: Item[];
  en: En[]; pend: En[]; chests: Chest[]; drops: Drop[]; parts: Part[]; floats: Float[]; shots: Shot[];
  msgs: { t: string; c: string }[]; banner: Banner | null; turn: number; best: number; bestLvl: number;
  flash: number; flashC: string; shake: number; regenAcc: number; kills: number; lvlFx: number; deadT: number; time: number;
  fx: Fx[]; ground: Ground[]; allies: Ally[]; echo: Spell[]; ward: number; autoEq: boolean; music: boolean;
  trader: Trader | null; merchant?: Merchant | null; shopOpen: boolean; gambOpen?: boolean; chestShop?: Partial<Record<MerchId, ChestDeal>>; chestTypes?: Record<string, ChestDeal>; chestTypeMig?: boolean; chestReveal?: { it: Item; t: number; phase: "open" | "show"; sku?: string } | null; merchSub?: { oneHand?: WT; twoHand?: WT }; ultAt: number; ultAtA?: number; ultAts?: Partial<Record<EqKey, number>>; mmBig: boolean; toast: number; saveT: number; floorTurn: number; deaths: number; spT?: number;
  portal: { x: number; y: number; kind?: "vault" | "camp" | "proceed" } | null; vault: string | null; gobT: number; locked: boolean;
  torches: Torch[];
  area?: "dungeon" | "camp" | "vault"; actCleared?: number; stash: Item[]; stashGold: number; bankGold?: number; stashOpen?: boolean;
  campSpot?: { x: number; y: number }; stashAt?: { x: number; y: number }; restAt?: { x: number; y: number }; fireAt?: { x: number; y: number };
  gambler?: { x: number; y: number } | null; gambPity?: number;
  mvAcc?: number; es?: ES; pshots?: PShot[]; petDmg?: number; pSnap?: [En, number][]; pDps?: number; thSeen?: number[]; thShift?: number; thNew?: boolean;
  rt?: boolean; pcd?: number; acd?: number; qd?: number[]; wt?: number;
  autoCombine?: boolean;
  gemBag?: Item[];
  bagCap?: number;
  gemCap?: number;
  actCampAt?: number; paused?: boolean;
  front?: number; snapPrev?: FloorSnap | null; snapCur?: FloorSnap | null;
  lootToast?: number; lootToastTxt?: string;
  petAbiT?: number; petAegisUntil?: number; petAegisCd?: number; petStormCd?: number; petTwinUntil?: number; petTwinCd?: number; petTwinAcc?: number; petHarvest?: number; petPhoenixD?: number; petAbiPet?: number; petAbiFx?: { n: string; t: number; c: string };
  muted: boolean; notify: () => void; sfx: (n: string, v?: number) => void;
  wallBreak?: boolean; cracks?: number[]; digAt?: { x: number; y: number }; digClock?: number; wallVer?: number;
  warn?: { txt: string; sub: string; c: string; t: number; max: number }; warnGobs?: number[]; warnPort?: string;
}

// ---------- data ----------
const RN = ["Gray", "Blue", "Yellow", "Orange", "Purple", "Cyan", "Red", "Prismatic"];
// Display labels only (saves/codes store the numeric tier, so renaming is safe). RN keeps the colour names.
const RT = ["Normal", "Magic", "Rare", "Legendary", "Mythic", "Ethereal", "Relic", "Prismatic"];
const RC = ["#b4b4bc", "#4aa0ff", "#ffd840", "#ff8c1a", "#c060ff", "#40f0ff", "#ff3030", "#ff60e0"];
const RW = [61, 23, 10, 5, 2.0, 0.85, 0.18, 0.06];
const RAR_F_EXP = 0.5;
const RAR_F_CAP = 1.65;
let bagSalvNoted = false;
let onItemDropped: ((it: Item) => void) | null = null;
const RM = [1, 1.6, 2.5, 4, 6, 9, 14, 60];
const HPCH = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1, 1];
const NBON = [0, 1, 1, 2, 2, 3, 4, 5];
const PRICE = [1, 2, 4, 9, 22, 55, 150, 1500];
const MAT: string[][] = [
  ["#8a8a92", "#c4c4cc", "#4a4a52"], ["#a8b4c4", "#e8f0fc", "#5a6474"], ["#b07838", "#e8b068", "#6a4418"],
  ["#3e3650", "#7a6c98", "#1c1628"], ["#d8d0b0", "#fff8e4", "#8a8064"], ["#58c8c0", "#b8fff8", "#24706c"],
];
const MATN = ["Iron", "Steel", "Bronze", "Obsidian", "Bone", "Mithril"];
const GEMS = ["#40c0ff", "#ff4060", "#60ff80", "#c060ff", "#ffd040"];
const PRE: string[][] = [
  ["Rusty", "Worn", "Plain", "Crude", "Old", "Chipped"],
  ["Fine", "Sturdy", "Keen", "Tempered", "Polished", "Balanced"],
  ["Gilded", "Noble", "Royal", "Ornate", "Golden", "Regal"],
  ["Blazing", "Heroic", "Fabled", "Sunforged", "Titanic", "Valiant"],
  ["Arcane", "Eldritch", "Voidtouched", "Astral", "Shadow", "Runic"],
  ["Celestial", "Opaline", "Frostfire", "Starborn", "Ethereal", "Radiant"],
  ["Apocalyptic", "Godslayer", "Infernal", "Doomforged", "Cataclysmic", "Worldbreaker"],
  ["Prismatic", "Chromatic", "Iridescent", "Kaleidoscopic", "Aurora", "Spectral"],
];
const SUF = ["of Might", "of the Bear", "of Embers", "of Storms", "of the Fox", "of Ruin", "of Valor", "of the Void", "of Dawn", "of Thorns", "of the Titan", "of Eternity"];
const ABASE: Record<AK, string[]> = {
  head: ["Cap", "Helm", "Coif", "Hood", "Greathelm", "Sallet"],
  chest: ["Cuirass", "Hauberk", "Jerkin", "Scale Mail", "Battle Robe", "Brigandine"],
  arms: ["Bracers", "Banded Vambraces", "Spiked Bracers", "Chain Sleeves", "Arm Wraps", "Armguards"],
  legs: ["Greaves", "Banded Greaves", "Chain Leggings", "Plate Boots", "Wrapped Boots", "Fur Boots"],
};
const ALBL: Record<AK, string> = { head: "Helmet", chest: "Chest Armor", arms: "Arm Armor", legs: "Leg Armor / Boots" };
const SLOTMUL: Record<AK, number> = { head: 0.8, chest: 1.3, arms: 0.7, legs: 0.9 };
const ARMOR_K: AK[] = ["head", "chest", "arms", "legs"];
const WEAP_K: WT[] = ["sword", "axe", "mace", "spear", "dagger", "greatsword", "greataxe", "warhammer", "bow", "crossbow", "staff", "shield", "scythe", "flail", "katana", "nodachi", "claws", "handxbow", "wand", "beamsword"];
const EQK: EqKey[] = ["head", "chest", "arms", "legs", "rh", "lh", "pet"];
const EQL: Record<EqKey, string> = { head: "Helmet", chest: "Chest", arms: "Gloves", legs: "Boots", rh: "R. Hand", lh: "L. Hand", pet: "Pet" };
const BNAME: Record<Bonus, string> = { hp: "Max HP", atk: "Attack", def: "Defense", crit: "Crit %", spd: "Double Strike %", regen: "Regen / turn", mv: "Movement Speed" };

const wi = (n: string, two: boolean, dmg: number, spd: number, crit: number, o: Partial<WInfo>, note: string, bases: string[]): WInfo =>
  ({ n, two, dmg, spd, crit, reach: 1, range: 0, magic: false, cleave: false, pierce: 0, stun: 0, knock: 0, grip: 20, note, bases, ...o });
const WI: Record<WT, WInfo> = {
  sword: wi("Sword", false, 1.0, 10, 8, {}, "Balanced one-hander.", ["Longsword", "Leafblade", "Saber", "Sawblade", "Flamesword", "Broadsword"]),
  axe: wi("Axe", false, 1.15, 0, 6, { cleave: true }, "Cleaves: hits all adjacent foes for 50%.", ["Hatchet", "Bearded Axe", "Twinaxe", "Cleaver Axe", "Moon Axe", "Spike Axe"]),
  mace: wi("Mace", false, 1.05, 5, 5, { pierce: 0.5 }, "Crushes: ignores 50% of enemy defense.", ["Mace", "Flanged Mace", "Morningstar", "Cube Mace", "Star Mace", "Crown Mace"]),
  spear: wi("Spear", false, 0.9, 5, 6, { reach: 2 }, "Reach 2: strikes foes two tiles away.", ["Spear", "Pike", "Trident", "Halberd", "Winged Spear", "Needle Lance"]),
  dagger: wi("Dagger", false, 0.65, 45, 20, {}, "Fast: big double-strike and crit chance.", ["Dagger", "Kris", "Kukri", "Shiv", "Wavedagger", "Cleaver"]),
  greatsword: wi("Two-Handed Sword", true, 1.8, 5, 10, { cleave: true }, "Two-handed. Cleaves adjacent foes.", ["Greatsword", "Claymore", "Great Scimitar", "Ripper", "Flamberge", "Executioner"]),
  greataxe: wi("Two-Handed Axe", true, 2.0, 0, 12, { cleave: true }, "Two-handed. Huge hits, cleaves.", ["Greataxe", "Bearded Greataxe", "Labrys", "Headsman Axe", "Moonreaver", "Spiked Greataxe"]),
  warhammer: wi("Warhammer", true, 1.9, 0, 6, { pierce: 0.5, stun: 0.25 }, "Two-handed. 25% stun, ignores 50% defense.", ["Warhammer", "Spiked Hammer", "Twin Maul", "Clawhammer", "Great Maul", "War Pick"]),
  bow: wi("Bow", true, 1.1, 10, 12, { range: 5, grip: 14 }, "Two-handed. Shoots foes up to 5 tiles away in a line.", ["Shortbow", "Recurve", "Longbow", "Composite Bow", "Horn Bow", "Blade Bow"]),
  crossbow: wi("Heavy Crossbow", true, 1.7, 0, 10, { range: 6, pierce: 0.3, grip: 17 }, "Two-handed. Range 6, heavy bolts, can Super Crit.", ["Heavy Crossbow", "Arbalest", "Siege Bow", "Great Crossbow", "Ballista", "War Arbalest"]),
  staff: wi("Staff", true, 1.0, 0, 8, { range: 4, magic: true, grip: 18 }, "Two-handed. Fires a bolt of its rolled element (range 4). Ignores defense, can Super Crit.", ["Orb Staff", "Crook", "Fork Staff", "Crystal Staff", "Skull Staff", "Ring Staff"]),
  shield: wi("Shield", false, 0, 0, 0, {}, "Off hand only. Adds defense and block chance.", ["Round Shield", "Heater", "Kite Shield", "Tower Shield", "Buckler", "Spiked Shield"]),
  scythe: wi("Scythe", true, 1.9, 0, 10, { grip: 18 }, "Two-handed. Wide sweeping arc hits nearby foes.", ["Scythe", "War Scythe", "Reaper", "Harvest Blade", "Grave Scythe", "Soulscythe"]),
  flail: wi("Flail", false, 1.2, 5, 6, { pierce: 0.35, stun: 0.12, knock: 0.15, grip: 18 }, "One-hander. Can stun, knock back, or ignore armor.", ["Flail", "Chain Flail", "Spiked Flail", "Ball Flail", "War Flail", "Star Flail"]),
  katana: wi("Katana", false, 0.95, 22, 16, { grip: 18 }, "Fast one-hander. High crit, pairs with a shield or offhand.", ["Katana", "Uchigatana", "Wakizashi", "Tachi", "Shinken", "Ko-Katana"]),
  nodachi: wi("Great Katana", true, 1.75, 0, 12, { grip: 19 }, "Two-handed. Frontal 3-tile slash.", ["Nodachi", "Odachi", "Great Katana", "Dai-Katana", "Nagamaki", "O-Katana"]),
  claws: wi("Hand Claws", false, 0.8, 30, 14, { grip: 14 }, "One-hander. Dual-wield for a fast 3-blade rake and bleed.", ["Hand Claws", "Katar", "Bagh Nakh", "Tiger Claws", "Rake Fists", "Blade Claws"]),
  handxbow: wi("Hand Crossbow", false, 1.05, 18, 10, { range: 4, pierce: 0.15, grip: 15 }, "One-handed. Range 4, dual-wieldable with any 1H weapon.", ["Hand Crossbow", "Pistol Crossbow", "Wrist Bow", "Light Crossbow", "Bolt Pistol", "Pocket Arbalest"]),
  wand: wi("Wand", false, 0.9, 12, 8, { range: 4, magic: true, grip: 16 }, "One-handed. Fires a bolt of its rolled element (range 4). Dual-wieldable with any 1H weapon, including another wand.", ["Wand", "Rod", "Baton", "Charm Wand", "Focus Wand", "Star Wand"]),
  beamsword: wi("Beam Sword", false, 1.1, 12, 10, { pierce: 0.2, grip: 16 }, "One-handed energy blade. Slight armor pierce, colored glow. Dual-wieldable with any 1H weapon.", ["Beam Sword", "Saber", "Phase Blade", "Light Blade", "Plasma Sword", "Sunsaber"]),
};
const ONE_HAND_WEPS: WT[] = (Object.keys(WI) as WT[]).filter((k: WT) => k !== "shield" && !WI[k].two);
const TWO_HAND_WEPS: WT[] = (Object.keys(WI) as WT[]).filter((k: WT) => !!WI[k].two);

const fam = (n: string, v: string[], h: number[], s: number, e: string, hp: number, atk: number, def: number, min: number, tr: Trait | null): Fam => ({ n, v, h, s, e, hp, atk, def, min, tr });
const FAMS: Fam[] = [
  fam("Slime", ["Green Slime", "Acid Ooze", "Magma Slime", "Frost Jelly", "Void Blob"], [110, 75, 15, 195, 275], 60, "#ffffff", 0.8, 0.8, 0.5, 1, "split"),
  fam("Bat", ["Cave Bat", "Blood Bat", "Fire Bat", "Frost Bat", "Shadow Bat"], [30, 350, 20, 200, 270], 35, "#ff4040", 0.5, 0.8, 0.3, 1, "fast"),
  fam("Rat", ["Sewer Rat", "Plague Rat", "Ember Rat", "Dire Rat", "Rat King"], [30, 90, 15, 0, 45], 30, "#ff3030", 0.6, 0.7, 0.4, 1, null),
  fam("Skeleton", ["Skeleton", "Bone Warrior", "Burnt Skeleton", "Frost Skeleton", "Skeleton Lord"], [45, 40, 20, 200, 280], 15, "#ff4030", 1, 1, 1, 1, null),
  fam("Goblin", ["Goblin", "Goblin Scout", "Goblin Shaman", "Goblin Brute", "Goblin Warlord"], [100, 80, 60, 120, 140], 45, "#ffe040", 0.8, 0.9, 0.6, 1, null),
  fam("Spider", ["Cave Spider", "Venom Spider", "Lava Spider", "Ice Spider", "Phase Spider"], [30, 100, 10, 190, 280], 40, "#ff3030", 0.7, 1.1, 0.5, 2, null),
  fam("Zombie", ["Zombie", "Ghoul", "Burning Corpse", "Frozen Dead", "Plague Lord"], [90, 60, 15, 190, 120], 25, "#ffee60", 1.3, 0.9, 0.6, 2, "regen"),
  fam("Orc", ["Orc", "Orc Berserker", "Fire Orc", "Iron Orc", "Orc Chieftain"], [95, 0, 20, 210, 60], 35, "#ff3020", 1.4, 1.2, 1, 4, null),
  fam("Kobold", ["Kobold", "Kobold Trapper", "Kobold Pyro", "Kobold Sentry", "Kobold Chief"], [25, 55, 10, 190, 300], 40, "#ffe040", 0.7, 0.9, 0.6, 1, null),
  fam("Wraith", ["Wraith", "Banshee", "Ash Wraith", "Frost Wraith", "Void Reaver"], [220, 180, 10, 200, 280], 30, "#80ffff", 0.9, 1.2, 0.4, 5, "ranged"),
  fam("Golem", ["Clay Golem", "Stone Golem", "Magma Golem", "Ice Golem", "Obsidian Golem"], [25, 40, 15, 195, 270], 25, "#ffa020", 2, 1.1, 2, 6, null),
  fam("Demon", ["Imp", "Fiend", "Hellspawn", "Frost Fiend", "Pit Lord"], [0, 340, 15, 200, 280], 55, "#ffff60", 1.1, 1.3, 0.8, 8, null),
  fam("Cultist", ["Cultist", "Zealot", "Flame Acolyte", "Frost Acolyte", "Void Priest"], [0, 280, 20, 200, 260], 45, "#ff40ff", 0.8, 1.1, 0.6, 3, "ranged"),
  fam("Mimic", ["Mimic", "Greedy Mimic", "Ember Mimic", "Frost Mimic", "Void Mimic"], [30, 45, 15, 195, 275], 50, "#ff3030", 1.5, 1.4, 1.2, 3, null),
  fam("Dragonkin", ["Drakeling", "Wyrmkin", "Fire Drake", "Frost Drake", "Elder Drake"], [120, 90, 10, 195, 280], 50, "#ffe040", 1.6, 1.4, 1.2, 10, null),
  fam("Beetle", ["Dung Beetle", "Horn Beetle", "Fire Beetle", "Ice Beetle", "Scarab Lord"], [30, 120, 15, 195, 50], 50, "#ff4040", 1, 0.9, 1.6, 2, null),
  fam("Myconid", ["Myconid", "Sporeling", "Ember Cap", "Frost Cap", "Deathcap"], [0, 280, 25, 190, 100], 50, "#201010", 1, 0.8, 0.7, 2, "regen"),
  fam("Eye", ["Floating Eye", "Gazer", "Burning Eye", "Frost Eye", "Void Watcher"], [200, 120, 10, 190, 280], 50, "#ffffff", 0.8, 1.2, 0.5, 4, "ranged"),
  fam("Serpent", ["Snake", "Viper", "Fire Serpent", "Ice Serpent", "Naga"], [100, 70, 15, 195, 280], 50, "#ffe040", 0.9, 1.1, 0.6, 2, "fast"),
  fam("Knight", ["Dark Knight", "Death Knight", "Hellknight", "Frost Knight", "Void Knight"], [230, 280, 10, 200, 270], 20, "#ff3030", 1.6, 1.3, 1.8, 9, null),
  fam("Elemental", ["Wisp", "Storm Elemental", "Fire Elemental", "Ice Elemental", "Void Elemental"], [60, 220, 20, 190, 280], 70, "#ffffff", 1.1, 1.3, 0.7, 7, null),
  fam("Lich", ["Necromancer", "Bone Mage", "Ash Lich", "Frost Lich", "Archlich"], [270, 140, 20, 200, 290], 40, "#60ff80", 1.2, 1.5, 0.8, 12, "ranged"),
  fam("Troll", ["Troll", "Cave Troll", "Lava Troll", "Frost Troll", "Abyss Troll"], [110, 30, 15, 195, 270], 35, "#ffe040", 2, 1.3, 1, 7, "regen"),
];
const DEEP = ["Ancient", "Abyssal", "Eldritch", "Primordial", "Cosmic"];
const TRAITS: Trait[] = ["fast", "regen", "split", "ranged", "brutal"];
const TRN: Record<Trait, string> = { fast: "Swift", regen: "Undying", split: "Splitting", ranged: "Hexing", brutal: "Brutal" };

// ---------- elements, spells, passives ----------
const ELS: El[] = ["holy", "fire", "frost", "elec", "hell", "void", "dark"];
const ELN: Record<El, string> = { holy: "Holy", fire: "Fire", frost: "Frost", elec: "Storm", hell: "Hellfire", void: "Void", dark: "Shadow" };
const ELC: Record<El, string> = { holy: "#fff2a0", fire: "#ff7a20", frost: "#80e0ff", elec: "#9aa8ff", hell: "#ff2a40", void: "#c040ff", dark: "#a888d8" };
const EL2: Record<El, string> = { holy: "#ffffff", fire: "#ffe060", frost: "#ffffff", elec: "#ffffff", hell: "#ffb000", void: "#2a0040", dark: "#ff3060" };
const ELD: Record<El, string> = { holy: "x1.75 vs undead & demons, heals you", fire: "burns over time", frost: "slows, may freeze", elec: "arcs to a nearby foe", hell: "heavy, leaves burning ground", void: "pulls, ignores defense, % HP damage", dark: "lifesteal, weakens, may terrify" };
const SHAPES: Shape[] = ["bolt", "nova", "chain", "meteor", "beam", "pillar", "blades", "rupture", "summon", "cloud"];
const SHN: Record<Shape, string> = { bolt: "Bolt", nova: "Nova", chain: "Chain", meteor: "Meteor", beam: "Beam", pillar: "Pillar", blades: "Blades", rupture: "Rupture", summon: "Spirit", cloud: "Cloud" };
const SHF: Record<Shape, number> = { bolt: 1.3, nova: 0.75, chain: 0.85, meteor: 1.5, beam: 1.0, pillar: 1.25, blades: 0.9, rupture: 1.1, summon: 0.55, cloud: 0.35 };
const SMOD = ["Twin", "Greater", "Wide", "Swift", "Lingering", "Piercing", "Echoing", "Unstable"];
const SMODD = ["casts twice", "+50% power", "+1 radius", "+5% proc chance", "effects last 2 turns longer", "ignores defense", "echoes again next turn", "random x1-3 damage"];
const PTYPES: PType[] = ["orbs", "aura", "thorns", "retal", "pulse", "steps", "halo", "field", "ward", "sentinel"];
const PTN: Record<PType, string> = { orbs: "Orbs", aura: "Aura", thorns: "Thorns", retal: "Retribution", pulse: "Pulse", steps: "Footsteps", halo: "Halo", field: "Field", ward: "Ward", sentinel: "Sentinel" };
const PTD: Record<PType, string> = { orbs: "orbiting orbs strike a nearby foe each turn", aura: "damages adjacent foes each turn", thorns: "hurts whoever hits you", retal: "chance to nova when hit", pulse: "nova every few turns", steps: "leaves damaging footprints", halo: "heals you each turn and smites nearby foes", field: "slows and harms foes within 2", ward: "spectral shield absorbs damage, recharges", sentinel: "spirit eye fires at foes in range" };
const PMOD = ["Vast", "Rapid", "Potent", "Twin", "Enduring"];
const PMODD = ["+1 radius", "triggers more often", "+50% power", "double effect", "element effects last longer"];
const SPCH = [0, 0.4, 0.75, 1, 1, 1, 1, 1];
const PSCH = [0, 0.25, 0.55, 0.85, 1, 1, 1, 1];
const SPW = [0, 0.4, 0.55, 0.8, 1.1, 1.55, 2.2, 6.5];
const SCH = [0, 7, 9, 11, 13, 16, 19, 36];
const SRAD = [1, 1, 1, 1, 2, 2, 3, 4];
const PPW = [0, 0.13, 0.2, 0.3, 0.43, 0.6, 0.85, 2.4];
const UNDEAD = [3, 6, 9, 11, 19, 21];
function wepNeedsEl(k: Kind): boolean { return k === "wand" || k === "staff" || k === "beamsword"; }
function ensureWepEl(it: Item): El {
  if (it.wel && (ELS as string[]).includes(it.wel)) return it.wel;
  const fromSp = (it.spells ?? []).find((s: Spell) => s && (ELS as string[]).includes(s.el));
  if (fromSp) { it.wel = fromSp.el; return it.wel; }
  const sr = rng32((it.seed || 1) * 17 + 13);
  it.wel = ELS[Math.floor(sr() * ELS.length)];
  return it.wel;
}
function itemWepEl(it: Item | null | undefined): El | null {
  if (!it || !wepNeedsEl(it.kind)) return null;
  return ensureWepEl(it);
}
function weaponEl(eq: Eq): El | null {
  const main = eq.rh ?? (eq.lh && eq.lh.kind !== "shield" ? eq.lh : null);
  return itemWepEl(main);
}
function heroShotTyp(eq: Eq, magic: boolean): number {
  if (magic) return 4;
  const k = (eq.rh ? eq.rh.kind : (eq.lh && eq.lh.kind !== "shield" ? eq.lh.kind : ""));
  return (k === "crossbow" || k === "handxbow") ? 1 : 0;
}
function applyWepEl(g: Game, e: En, el: El, dmg: number, light: boolean): void {
  if (e.hp <= 0) return;
  if (el === "fire") { e.burn = Math.max(e.burn, light ? 2 : 3); e.burnD = Math.max(e.burnD, Math.max(1, Math.round(dmg * (light ? 0.18 : 0.25)))); }
  else if (el === "frost") { e.slow = Math.max(e.slow, light ? 2 : 3); }
  else if (el === "hell") addGround(g, e.x, e.y, "hell", light ? 2 : 3, Math.max(1, Math.round(dmg * 0.2)));
  else if (el === "void" && e.hp > 0 && e.cls < 2 && !light) pullEn(g, e);
  else if (el === "dark") { heal(g, dmg * (light ? 0.08 : 0.14), false); e.weak = Math.max(e.weak, 2); }
  else if (el === "elec") {
    let nxt: En | null = null, bd = 4;
    for (const o of g.en) { if (o === e || o.hp <= 0) continue; const dd = Math.abs(o.x - e.x) + Math.abs(o.y - e.y); if (dd > 0 && dd <= bd) { bd = dd; nxt = o; } }
    if (nxt) { const arc = Math.max(1, Math.round(dmg * 0.35)); withHit({ dx: nxt.x - e.x, dy: nxt.y - e.y }, () => { hurtEn(g, nxt, arc); floatTxt(g, nxt.x, nxt.y - 0.2, String(arc), ELC.elec); if (nxt.hp <= 0) kill(g, nxt); }); }
  }
}
function magicWepRaw(e: En, el: El, raw: number): number {
  let d = raw;
  if (el === "holy" && UNDEAD.includes(e.f)) d *= 1.75;
  if (el === "hell") d *= 1.3;
  d *= elMul(e, el);
  if (el === "void") d += e.mhp * (e.cls === 2 ? 0.008 : 0.02);
  return d;
}
function makeSpell(rar: number, sr: () => number): Spell {
  const el = ELS[Math.floor(sr() * 7)], sh = SHAPES[Math.floor(sr() * 10)], mod = Math.floor(sr() * 8);
  let ch = SCH[rar], pw = SPW[rar], r = SRAD[rar];
  if (mod === 1) pw *= 1.5;
  if (mod === 2) r += 1;
  if (mod === 3) ch += 5;
  return { el, sh, mod, ch, pw: Math.round(pw * 100) / 100, r, name: SMOD[mod] + " " + ELN[el] + " " + SHN[sh] };
}
function makePassive(rar: number, sr: () => number): Passive {
  const el = ELS[Math.floor(sr() * 7)], ty = PTYPES[Math.floor(sr() * 10)], mod = Math.floor(sr() * 5);
  const pw = PPW[rar] * (mod === 2 ? 1.5 : 1);
  return { el, ty, mod, pw: Math.round(pw * 100) / 100, name: PMOD[mod] + " " + ELN[el] + " " + PTN[ty] };
}
function spellDesc(sp: Spell): string {
  const area = sp.sh === "nova" ? ", radius " + (sp.r + 1) : ["meteor", "pillar", "blades", "cloud"].includes(sp.sh) ? ", radius " + sp.r : "";
  return sp.ch + "% on hit: " + sp.name + " (" + Math.round(sp.pw * SHF[sp.sh] * 100) + "% ATK" + area + ") - " + ELD[sp.el] + "; " + SMODD[sp.mod];
}
function pasDesc(p: Passive): string {
  const amt = p.ty === "ward" ? Math.round(p.pw * 40 * (p.mod === 3 ? 1.5 : 1)) + "% max HP shield" : Math.round(p.pw * 100) + "% ATK";
  return p.name + ": " + PTD[p.ty] + " (" + amt + ") - " + ELD[p.el] + "; " + PMODD[p.mod];
}
function weaponSpells(eq: Eq): Spell[] {
  const out: Spell[] = [];
  if (eq.rh && eq.rh.spells) out.push(...eq.rh.spells);
  if (eq.lh && eq.lh.kind !== "shield" && eq.lh.spells) out.push(...eq.lh.spells);
  return out;
}
// ---------- ultimates (Prismatic weapons) ----------
const ULT_CD = 180000;
const UPAT = ["Storm", "Nova", "Collapse", "Tempest", "Cataclysm", "Rain", "Reaping", "Judgement", "Crossfire", "Maelstrom"];
const UDESC = ["meteors crash onto every foe", "colossal novas sweep the screen", "the world implodes, then detonates", "lightning chains between every foe", "the ground splits in eight directions", "a deluge of falling bolts", "a spectral scythe reaps all", "pillars of judgement strike each foe", "searing beams cross the screen", "a spiral maelstrom of bolts"];
const UWORD: Record<El, string[]> = {
  holy: ["Seraphic", "Divine", "Angelic", "Radiant", "Sanctified"],
  fire: ["Meteor", "Inferno", "Phoenix", "Solar", "Ember"],
  frost: ["Glacial", "Frost", "Blizzard", "Permafrost", "Rime"],
  elec: ["Thunder", "Lightning", "Tesla", "Skyfire", "Voltaic"],
  hell: ["Hellfire", "Brimstone", "Infernal", "Demonfire", "Abyssal"],
  void: ["Void", "Singularity", "Event Horizon", "Null", "Starless"],
  dark: ["Shadow", "Reaper", "Umbral", "Nightfall", "Soul"],
};
const ULTS: Ult[] = Array.from({ length: 50 }, (_: unknown, i: number): Ult => {
  const pat = i % 10, row = Math.floor(i / 10);
  const el = ELS[(pat + row * 3) % 7];
  return { n: UWORD[el][row] + " " + UPAT[pat], el, pat, c2: "hsl(" + ((i * 47) % 360) + ",95%,65%)", i };
});
function ultDesc(u: number): string {
  const x = ULTS[u] ?? ULTS[0];
  return "\u2605 ULTIMATE: " + x.n + " - " + UDESC[x.pat] + ". Hits every enemy in view. Damage scales with your Attack, the item's level, your level versus the depth, and (if Prismatic) star power and how many Prismatic ultimates are fused. Can kill any foe, including bosses. 3 min cooldown.";
}
function ultWeapon(eq: Eq): Item | null {
  if (eq.rh && eq.rh.ult !== undefined) return eq.rh;
  if (eq.lh && eq.lh.kind !== "shield" && eq.lh.ult !== undefined) return eq.lh;
  return null;
}

function allPassives(eq: Eq): Passive[] {
  const out: Passive[] = [];
  for (const k of ["head", "chest", "arms", "legs", "lh"] as EqKey[]) { const it = eq[k]; if (it && it.pas) out.push(...it.pas); }
  return out;
}
const BOSSN = ["Grax", "Mordak", "Vel'Thar", "Skorn", "Ixalia", "Brutok", "Zerath", "Nyx", "Malgor", "Thrul", "Kezra", "Ozrik"];
const BOSST = ["Tyrant", "Overlord", "Devourer", "Colossus", "Ravager", "Monarch"];
const THEMES = [
  { n: "Forgotten Crypt", f: ["#3a3a48", "#444456", "#2c2c38"], w: ["#1c1c26", "#5a5a70", "#2a2a38"] },
  { n: "Mossy Caverns", f: ["#2e3a26", "#38462e", "#222c1c"], w: ["#141c10", "#4a6038", "#24301c"] },
  { n: "Magma Depths", f: ["#3a2220", "#482a26", "#2a1614"], w: ["#1c0c0a", "#7a3020", "#3a1410"] },
  { n: "Frozen Halls", f: ["#2c3c4c", "#36485a", "#22303e"], w: ["#101c28", "#6a90b0", "#2a4058"] },
  { n: "Sunken Temple", f: ["#1e3a3a", "#264646", "#162c2c"], w: ["#0a1a1c", "#3a7a70", "#1a3a38"] },
  { n: "Bone Pits", f: ["#3c3428", "#483e32", "#2c261c"], w: ["#1c1810", "#8a7a5a", "#3a3020"] },
  { n: "Void Sanctum", f: ["#2a1e3c", "#342648", "#1e142c"], w: ["#0e0818", "#5a3a8a", "#22143a"] },
  { n: "Gilded Vault", f: ["#3a3220", "#463c28", "#2a2416"], w: ["#1a140a", "#a08030", "#3a2c10"] },
];

// ---------- helpers ----------
let NID = 1;
const R = (): number => Math.random();
const ri = (n: number): number => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const hsl = (h: number, s: number, l: number): string => "hsl(" + h + "," + Math.min(100, s) + "%," + l + "%)";
const rng32 = (seed: number): (() => number) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const isArmor = (k: Kind): k is AK => k === "head" || k === "chest" || k === "arms" || k === "legs";
const isTwo = (it: Item | null): boolean => !!it && !isArmor(it.kind) && it.kind !== "pet" && !!(WI[it.kind as WT] && WI[it.kind as WT].two);
const isOneHand = (it: Item | null): boolean => !!it && !isArmor(it.kind) && it.kind !== "pet" && it.kind !== "shield" && !!(WI[it.kind as WT] && !WI[it.kind as WT].two);
// 8-direction facing: 0=S, 1=SE, 2=E, 3=NE, 4=N, 5=NW, 6=W, 7=SW
const DIR_DXY: number[][] = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
function dirFromDelta(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  const ang = Math.atan2(-dy, dx);
  let oct = Math.round(ang / (Math.PI / 4));
  if (oct === -4 || oct === 4) return 6;
  if (oct === 0) return 2;
  if (oct === 1) return 3;
  if (oct === 2) return 4;
  if (oct === 3) return 5;
  if (oct === -1) return 1;
  if (oct === -2) return 0;
  return 7;
}
function dirFace(d: number): number { return (d === 5 || d === 6 || d === 7) ? -1 : 1; }
function dirFromFace(face: number): number { return face < 0 ? 6 : 2; }
function setHeroDir(h: Hero, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  h.dir = dirFromDelta(dx, dy);
  h.face = dirFace(h.dir);
}
function heroDir(h: Hero): number {
  return (typeof h.dir === "number" && h.dir >= 0 && h.dir <= 7) ? (h.dir | 0) : dirFromFace(h.face);
}
// Keyboard and on-screen 8-way joystick. Q/E/Z/C and numpad 7/9/1/3 are diagonals; WASD/arrows still chord.
const KEY_DIRS: Record<string, number[]> = {
  arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
  arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
  q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1],
};
const CODE_DIRS: Record<string, number[]> = {
  Numpad7: [-1, -1], Numpad8: [0, -1], Numpad9: [1, -1],
  Numpad4: [-1, 0], Numpad6: [1, 0],
  Numpad1: [-1, 1], Numpad2: [0, 1], Numpad3: [1, 1],
};
function keyTok(ev: { key: string; code: string }): string {
  return ev.code in CODE_DIRS ? ev.code : ev.key.toLowerCase();
}
function keyDir(ev: { key: string; code: string }): number[] | undefined {
  return CODE_DIRS[ev.code] ?? KEY_DIRS[ev.key.toLowerCase()];
}
function heldDelta(held: Iterable<string>): number[] {
  let x = 0, y = 0;
  for (const k of held) {
    const d = CODE_DIRS[k] ?? KEY_DIRS[k];
    if (d) { x += d[0]; y += d[1]; }
  }
  if (x === 0 && y === 0) return [0, 0];
  return [Math.sign(x), Math.sign(y)];
}
function stickDir(dx: number, dy: number, deadX = 13, deadY = 15): number[] {
  if (Math.abs(dx) < deadX && Math.abs(dy) < deadY) return [0, 0];
  return DIR_DXY[dirFromDelta(dx, dy)];
}
// Virtual joystick: small dead zone as a fraction of the base radius (min 10px).
const STICK_DEAD = 0.16;
function stickFromCenter(px: number, py: number, radius: number, deadFrac = STICK_DEAD): { dx: number; dy: number; kx: number; ky: number } {
  const dist = Math.hypot(px, py);
  const travel = Math.max(8, radius * 0.58);
  const dead = Math.max(10, radius * deadFrac);
  let kx = 0, ky = 0;
  if (dist > 0.5) {
    const t = Math.min(1, dist / travel);
    kx = (px / dist) * t * travel;
    ky = (py / dist) * t * travel;
  }
  if (dist < dead) return { dx: 0, dy: 0, kx, ky };
  const d = DIR_DXY[dirFromDelta(px, py)];
  return { dx: d[0], dy: d[1], kx, ky };
}
function publishPad(held: boolean, dx: number, dy: number, step = false): void {
  try {
    const w = window as unknown as { __ED16_PAD?: { held: boolean; dx: number; dy: number; steps: number[][] } };
    const prev = w.__ED16_PAD || { held: false, dx: 0, dy: 0, steps: [] };
    const steps = Array.isArray(prev.steps) ? prev.steps : [];
    if (step && (dx !== 0 || dy !== 0)) steps.push([dx, dy]);
    w.__ED16_PAD = { held, dx, dy, steps };
    if (document.documentElement && document.documentElement.dataset) document.documentElement.dataset.ed16Pad = held ? (dx + "," + dy) : "";
  } catch { /* tests only */ }
}
const baseHp = (L: number): number => 40 + 10 * (L - 1);
const baseAtk = (L: number): number => Math.round(3 + 1.4 * (L - 1));
const xpNeed = (L: number): number => Math.round(40 * Math.pow(L, 1.6));
const dmgF = (a: number, d: number): number => Math.max(1, (a * a) / (a + Math.max(0, d)));
const EN_ATK_EXP_CAP_D = 1000;
function enemyAtkAt(d: number): number {
  const d0 = Math.max(1, d);
  const dEff = Math.min(d0, EN_ATK_EXP_CAP_D);
  const base = (3 + 1.6 * dEff) * safePow(1.07, dEff);
  const scaled = d0 <= EN_ATK_EXP_CAP_D ? base : base * (d0 / EN_ATK_EXP_CAP_D);
  return safeNum(scaled);
}
// Historic generic HP curve (9+6d)*1.06^d blew up past d100 (~1e18 by d500). In play, HP is
// want-based (beatable with the current kit). This fallback only applies when there is no kit,
// and it tracks the historic curve through d100 then grows linearly so it cannot explode.
const EN_HP_EXP_CAP_D = 100;
function enemyHpFloor(d: number, famHp: number, cm: number): number {
  const dEff = Math.min(Math.max(1, d), EN_HP_EXP_CAP_D);
  const base = (9 + 6 * dEff) * Math.pow(1.06, dEff) * famHp * cm;
  const scaled = d <= EN_HP_EXP_CAP_D ? base : base * (d / EN_HP_EXP_CAP_D);
  return Math.max(1, Math.round(scaled));
}
function combatSwingMul(st: Stats, two: boolean): number {
  const c = Math.min(0.75, st.crit / 100);
  const psc = two && c > 0 ? c * (Math.max(18, st.crit * 0.55) / 100) : 0;
  const cm = (1 - c) * 1 + Math.max(0, c - psc) * 2 + psc * 3;
  const ds = Math.min(0.9, st.spd / 100);
  return cm * (1 + 0.8 * ds);
}
function combatTargetHits(cls: number, d: number): number {
  const t = Math.max(0, d - 1);
  if (cls <= 0) return 3.7 + Math.min(2.3, t * 0.05);
  if (cls === 1) return 8.5 + Math.min(6.5, t * 0.14);
  return 21 + Math.min(12, t * 0.22);
}
function combatAtkPct(cls: number, d: number): number {
  const t = Math.max(0, d - 1);
  if (cls <= 0) return 0.09 + Math.min(0.05, t * 0.0012);
  if (cls === 1) return 0.125 + Math.min(0.04, t * 0.001);
  return 0.145 + Math.min(0.035, t * 0.001);
}
function combatAtkCap(cls: number): number { return [0.15, 0.18, 0.20][Math.max(0, Math.min(2, cls))]; }
function atkForHit(dmg: number, def: number): number { return (dmg + Math.sqrt(dmg * dmg + 4 * dmg * Math.max(0, def))) / 2; }
function actFightSec(act: number): number { return 50 + Math.min(40, (Math.max(1, act) - 1) * 4); }
const RT_TICK = 0.36; // world tick (statuses, passives, pet, regen, turn counter) every 0.36 s
const RT_MV = 0.24; // hero step cooldown at +0% Movement Speed (divided by the Movement Speed multiplier)
const RT_ATK = 0.33; // hero attack / action cooldown (same as the idle auto-attack timing)
const kindLabel = (k: Kind): string => (k === "gem" ? "Gem (socket into gear)" : k === "pet" ? "Pet (companion slot)" : isArmor(k) ? ALBL[k] : WI[k as WT].n + (WI[k as WT].two ? " (2H)" : k === "shield" ? " (off hand)" : " (1H)"));
const salvageVal = (it: Item): number => {
  const stars = it.st ? it.st.length : 0;
  const base = (2 + it.ilvl * 0.7) * (SALV_RM[it.rar] ?? 1) * (1 + 0.28 * stars) * (it.set !== undefined ? 1.2 : 1) * (it.golden ? 4 : 1);
  return Math.max(1, Math.round(base));
};
const potionCost = (d: number): number => 20 + d * 5;
const POT_DEATH = 3;
const POT_CH_NORM = 0.14;
const POT_CH_RARE = 0.28;
const POT_CH_ELITE = 0.55;
const POT_CH_SE = 0.70;
const POT_CH_CHEST = 0.28;
const POT_CH_VAULT = 0.50;
const POT_BOSS_N = 2;
const POT_ACT_N = 2;
const POT_FLOOR_BASE = 2;
const POT_FLOOR_SPAN = 3;
const EARLY_SAFE_MAX = 5;
function earlySafeDepth(d: number): boolean { return d > 0 && d <= EARLY_SAFE_MAX; }
function potionPointerShouldFire(ev: { button?: number }): boolean { return ev.button === undefined || ev.button === 0; }
function potionClickIsDuplicate(now: number, lastPtrAt: number, windowMs = 400): boolean { return lastPtrAt > 0 && now - lastPtrAt < windowMs; }
function padLeaveReleases(hasCapture: boolean): boolean { return !hasCapture; }
function isPotionKey(ev: { key: string }): boolean { return ev.key.toLowerCase() === "h"; }
const RAMP_START = 6;
const RAMP_END = 1000;
const EN_BASE_D6 = 26;
const EN_BASE_CAP = 50;
const EN_CAP_D6 = 54;
const EN_CAP_MAX = 80;
const PACKS_D6 = 1.4;
const PACKS_CAP = 2.8;
const ELITE_CH_D6 = 0.16;
const ELITE_CH_CAP = 0.48;
function rampT(d: number): number {
  if (d <= RAMP_START) return 0;
  if (d >= RAMP_END) return 1;
  return Math.pow((d - RAMP_START) / (RAMP_END - RAMP_START), 0.7);
}
const RAR_F_LIFT = 1.2;
const PRIS_F_EXP = 1.4;
const PRIS_BONUS_END = 0.4;
const JACKPOT_BLEND = 0.60;
// raw61: Prismatic-gated Super Elites / multi-boss (inactive until wired; gate-off must not call these rolls)
const SE_BLEND = 0.38;
const SE_CM = 4.6;
const SE_AM = 1.55;
const SE_DM = 1.45;
const SE_XM = 7;
const SE_CAP = 0.19;
const SE_FLOOR_CH0 = 0.14;
const SE_FLOOR_CH1 = 0.28;
const SE_GOLD = 11;
const SE_COL = "#ff3a20";
const SE_COL2 = "#ffb040";
const CHEST_SET_CH = 0.03;
const STAR_CH1_END = 0.12;
const STAR_GEOM_END = 0.28;
const SOCK_DEPTH_K = 0.14;
const BOSS_RAR_W0 = [1.2, 1.6, 2.2, 48.5, 21, 12, 7, 5, 1.5];
const BOSS_RAR_W1 = [0.3, 0.5, 0.8, 24, 18, 16, 14, 11, 15.4];
const LOOT_RAR_FLOOR = 0.00005; // 0.005%; every rarity stays possible from every gear-loot source
function lootRarFloorW(w: number[]): number[] {
  const out = w.slice();
  let tot = 0;
  for (const v of out) tot += Math.max(0, v);
  if (tot <= 0) return out.map(() => 1);
  const minW = LOOT_RAR_FLOOR * tot;
  for (let i = 0; i < out.length; i++) if (!(out[i] > minW)) out[i] = minW;
  return out;
}
function eliteChance(d: number): number {
  // Floors 1-5 still spawn elites, but as lesser elites (see mkEnemy). Rate matches d6 (16%).
  if (earlySafeDepth(d)) return ELITE_CH_D6;
  return ELITE_CH_D6 + (ELITE_CH_CAP - ELITE_CH_D6) * rampT(d);
}
function expectedPacks(d: number): number {
  if (earlySafeDepth(d)) return 0;
  return PACKS_D6 + (PACKS_CAP - PACKS_D6) * rampT(d);
}
function rollPacks(d: number): number {
  const e = expectedPacks(d);
  const n = Math.floor(e);
  return n + (R() < (e - n) ? 1 : 0);
}
const TILE_UP = 3;
const POST_ACT0 = 200;
const ACT_POST_PER = 1.028;
const PRIS_STAR_MUL = 1.75;
const PRIS_STAR_BASE = 5;
const BIG_NUM_MAX = 1e300;
function dreadT(d: number): number { return rampT(d); }
function dreadStage(d: number): string {
  const t = dreadT(d);
  if (t <= 0.02) return "bright and playful: warm cheerful palette, major-key chipper music, clean floors, friendly torchlight";
  if (t < 0.18) return "a first hint of unease: slightly cooler tint, softer major-to-dorian lean, a few faint floor cracks";
  if (t < 0.35) return "unease: desaturated palette, dorian/minor music, more cracks and bones, torches a shade redder";
  if (t < 0.55) return "unsettling: sickly yellow-green wash, minor mode, blood stains and chains begin, sparse percussion";
  if (t < 0.75) return "dread: crimson creeping in, phrygian intervals, lower drones, ash in the air, hellfire-leaning torches, a soft vignette";
  return "hellish: deep crimson and ember, locrian grind, detuned drones and noise, lava seams and bones, heavy ash, marked vignette (tiles stay full-bright)";
}
function safeNum(n: number): number {
  if (typeof n !== "number" || !isFinite(n)) return 0;
  if (n > BIG_NUM_MAX) return BIG_NUM_MAX;
  if (n < -BIG_NUM_MAX) return -BIG_NUM_MAX;
  return n;
}
function safeMul(a: number, b: number): number { return safeNum(a * b); }
function safePow(b: number, e: number): number {
  if (e <= 0) return 1;
  if (!isFinite(b) || !isFinite(e)) return 1;
  return safeNum(Math.pow(b, e));
}
function safeRound(n: number): number {
  n = safeNum(n);
  if (Math.abs(n) >= 1e15) return n;
  return Math.round(n);
}
function fmtBig(n: number): string {
  n = safeNum(n);
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a < 10000) {
    const r = Math.round(a * 10) / 10;
    return sign + (Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : r.toString());
  }
  const units = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  let i = 0; let v = a;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  if (i >= units.length - 1 && v >= 1000) return sign + a.toExponential(2).replace("e+", "e");
  const d = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return sign + v.toFixed(d) + units[i];
}
function prisStarMulN(stars: number): number { return safePow(PRIS_STAR_MUL, Math.max(0, (stars | 0) - PRIS_STAR_BASE)); }
function prisStarMul(it: Item | null | undefined): number {
  if (!it || it.rar < 7) return 1;
  return prisStarMulN(it.st ? it.st.length : 0);
}
function itemAtk(it: Item): number { return safeRound(safeMul(it.atk, prisStarMul(it))); }
function itemDef(it: Item): number { return safeRound(safeMul(it.def, prisStarMul(it))); }
function itemBlock(it: Item): number { return safeRound(safeMul(it.block, prisStarMul(it))); }
function itemBonus(it: Item, b: Bonus): number { return safeMul(it.bonus[b] ?? 0, prisStarMul(it)); }
function actPostMul(act: number): number { return safePow(ACT_POST_PER, Math.max(0, Math.max(1, act) - POST_ACT0)); }
function actLootF(act: number): number {
  const base = 1.2 + Math.max(1, act) * 0.025;
  if (act <= POST_ACT0) return base;
  return safeMul(base, safePow(1.012, act - POST_ACT0));
}
function actExtraLoot(act: number): { gems: number; goldMul: number } {
  if (act <= POST_ACT0) return { gems: 0, goldMul: 1 };
  const k = act - POST_ACT0;
  return { gems: Math.min(6, Math.floor(k / 20)), goldMul: safePow(1.015, k) };
}
function layoutMetrics(vpW: number, vpH: number, safeBottom = 0, chrome = 0, safeTop = 0): { vpH: number; padCell: number; padSize: number; utilH: number; padH: number; saveH: number; dockH: number; canvasMax: number; saveBottom: number; dockBottom: number; fits: boolean } {
  // vpH is the visible visual-viewport height. Safe-area insets and any simulated
  // browser chrome are subtracted so the HUD, canvas, and dock all fit with no scroll.
  // The joystick is sized as large as leftover space allows; the canvas shrinks first.
  const h = Math.max(1, vpH - chrome - safeTop - safeBottom);
  const w = Math.max(1, vpW);
  const tight = h < 700 || w <= 360;
  const compact = h < 620 || w <= 360;
  const saveH = tight ? 36 : 42;
  const utilH = tight ? 36 : 40;
  const utilBlock = utilH + 4; // .dc-util top padding
  const ctrlPad = tight ? 6 : 8;
  // Save Game (full width), Save Code / LOAD, and Profiles — three dock rows under the stick.
  const saveRows = 3;
  const saveGap = 6;
  const saveBlockH = saveH * saveRows + saveGap * (saveRows - 1);
  const chromeExceptPad = utilBlock + ctrlPad + 6 + saveBlockH + ctrlPad + 4;
  const minCanvas = compact ? 200 : 260;
  const potionMin = compact ? 96 : 112;
  const padMaxH = Math.max(120, h - chromeExceptPad - minCanvas);
  const padMaxW = Math.max(120, w - potionMin - (tight ? 6 : 8) - 8);
  const padMin = compact ? 128 : 148;
  const padCap = compact ? 196 : 228;
  const padSize = Math.max(padMin, Math.min(padMaxH, padMaxW, padCap));
  const padH = padSize;
  const padCell = padSize;
  const dockH = ctrlPad + padH + 6 + saveBlockH + ctrlPad;
  const canvasMax = Math.max(72, h - utilBlock - dockH - 4);
  const dockBottom = h;
  const saveBottom = dockBottom;
  const chromeMin = utilBlock + dockH + 72;
  const fits = canvasMax >= 72 && chromeMin <= h + 0.5;
  return { vpH: h, padCell, padSize, utilH, padH, saveH, dockH, canvasMax, saveBottom, dockBottom, fits };
}
function layoutFitsPhone(w: number, h: number, chrome = 0, safeBottom = 0): boolean { return layoutMetrics(w, h, safeBottom, chrome).fits; }
const WRAP_MAX = 440;
const NOTICE_H = 32;
const NOTICE_GAP = 4;
const NOTICE_LEFT = 24;
type HudRect = { x: number; y: number; w: number; h: number };
function bossBarH(n: number, act: boolean): number {
  if (n <= 0) return 0;
  if (n === 1) return act ? 22 : 17;
  return 12 + n * 13;
}
function hudBossOff(n: number, act: boolean): { mm: number; notice: number } {
  if (n <= 0) return { mm: 3, notice: 8 };
  if (n === 1) return { mm: act ? 28 : 23, notice: 26 };
  const h = bossBarH(n, act);
  return { mm: 3 + h + 3, notice: 3 + h + 2 };
}
function mmBox(boss: boolean, actBoss: boolean, big: boolean, nBoss = 1): HudRect {
  const n = boss ? Math.max(1, nBoss) : 0;
  const off = hudBossOff(n, actBoss);
  const ms2 = big ? 4 : 1;
  const mw = MW * ms2, mh = MH * ms2;
  const mx0 = big ? Math.round((VW - mw) / 2) : VW - mw - 3;
  const my0 = big ? HUD + Math.round((VIEWH - mh) / 2) : HUD + off.mm;
  return { x: mx0 - 4, y: my0 - 4, w: mw + 8, h: mh + 8 };
}
function noticeBox(mm: HudRect, boss: boolean, big = false, nBoss = 1): HudRect {
  const left = noticeLeft();
  if (big) {
    const y = HUD + 2;
    const h = Math.max(16, Math.min(NOTICE_H, mm.y - NOTICE_GAP - y));
    return { x: left, y, w: VW - left - 8, h };
  }
  const n = boss ? Math.max(1, nBoss) : 0;
  const y = HUD + hudBossOff(n, false).notice;
  const w = Math.max(80, mm.x - NOTICE_GAP - left);
  return { x: left, y, w, h: NOTICE_H };
}
function rectsOverlap(a: HudRect, b: HudRect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
}
function stageCanvasLayout(vpW: number, vpH: number, safeBottom = 0, safeTop = 0, safeLeft = 0, safeRight = 0): { stageW: number; stageH: number; canvasW: number; canvasH: number; canvasLeft: number; canvasTop: number; view: PlayView } {
  const m = layoutMetrics(vpW, vpH, safeBottom, 0, safeTop);
  const stageW = Math.max(1, Math.min(WRAP_MAX, vpW) - safeLeft - safeRight);
  const stageH = Math.max(1, m.canvasMax + 4);
  const view = computePlayView(stageW, m.canvasMax);
  return { stageW, stageH, canvasW: view.cssW, canvasH: view.cssH, canvasLeft: Math.max(0, (stageW - view.cssW) / 2), canvasTop: Math.max(0, (stageH - view.cssH) / 2), view };
}
function overlayBtnsCanvas(vpW: number, vpH: number, safeBottom = 0): { lock: HudRect; wbrk: HudRect } {
  const sc = playScale();
  const s = 28 / Math.max(0.6, sc);
  const y0 = HUD + 4 / Math.max(0.6, sc);
  return { lock: { x: 4 / Math.max(0.6, sc), y: y0, w: s, h: s }, wbrk: { x: 4 / Math.max(0.6, sc), y: y0 + s + 4 / Math.max(0.6, sc), w: s, h: s } };
}
const WARN_SEC = 3.2;
const NOTICE_WARN_H = 52;
function warnBox(mm: HudRect, boss: boolean, big = false, nBoss = 1): HudRect {
  const base = noticeBox(mm, boss, big, nBoss);
  if (big) return base;
  const room = (HUD + VIEWH) - base.y - 8;
  return { x: base.x, y: base.y, w: base.w, h: Math.max(base.h, Math.min(NOTICE_WARN_H, room)) };
}
function lootCavePortal(g: Game): { x: number; y: number } | null {
  if (!g.portal || g.vault) return null;
  return portalKind(g) === "vault" ? g.portal : null;
}
function fireScreenWarn(g: Game, gob: En | null, portal: boolean): void {
  const gobTxt = "\u26A0 GOBLIN SPOTTED!";
  const portTxt = "\u26A0 LOOT CAVE PORTAL!";
  let txt = portTxt, sub = "A treasure vault entrance is in view!", c = "#c060ff";
  if (gob && portal) { txt = gobTxt; sub = portTxt; c = GOLD; }
  else if (gob) { txt = gobTxt; sub = (gob.name || "A goblin") + " is in view!"; c = gob.gob === 2 ? "#40e0ff" : (gob.gob === 3 ? GOLD : "#ffb060"); }
  g.warn = { txt, sub, c, t: WARN_SEC, max: WARN_SEC };
  g.flash = Math.max(g.flash, 0.4);
  g.flashC = c;
  g.shake = Math.max(g.shake, 4);
  g.sfx(gob ? "gob" : "portal");
  msg(g, txt + (gob && portal ? " " + portTxt : ""), c);
}
function scanScreenAlerts(g: Game): void {
  if (g.mode !== "play") return;
  const visGobs = g.en.filter((e: En) => e.hp > 0 && !!e.gob && !!g.vis[e.y * MW + e.x]);
  const prev = new Set(g.warnGobs ?? []);
  const newGobs = visGobs.filter((e: En) => !prev.has(e.id));
  const port = lootCavePortal(g);
  const portVis = !!(port && g.vis[port.y * MW + port.x]);
  const portKey = portVis && port ? (g.depth + ":" + port.x + "," + port.y) : "";
  const newPort = portVis && portKey !== (g.warnPort ?? "");
  g.warnGobs = visGobs.map((e: En) => e.id);
  g.warnPort = portVis ? portKey : "";
  if (newGobs.length || newPort) fireScreenWarn(g, newGobs[0] ?? null, newPort);
}
const PHONE_LAYOUTS: [number, number][] = [[360, 640], [375, 667], [390, 844], [412, 915]];
function isPauseKey(ev: { key?: string }): boolean { return (ev.key || "").toLowerCase() === "p"; }
const MODE_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MODE_DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MODE_MINOR = [0, 2, 3, 5, 7, 8, 10];
const MODE_PHRYG = [0, 1, 3, 5, 7, 8, 10];
const MODE_LOCR = [0, 1, 3, 5, 6, 8, 10];
function dreadScale(t: number): number[] {
  if (t < 0.2) return MODE_MAJOR;
  if (t < 0.4) return MODE_DORIAN;
  if (t < 0.6) return MODE_MINOR;
  if (t < 0.85) return MODE_PHRYG;
  return MODE_LOCR;
}
function dreadSong(s: Song, t: number): Song {
  if (t <= 0) return s;
  return { ...s, sc: dreadScale(t), bpm: Math.max(60, Math.round(s.bpm * (1 - 0.22 * t))), root: s.root - Math.round(5 * t), echo: (s.echo ?? 0.16) + 0.22 * t };
}
function floorFront(g: Game): number {
  const f = Math.max(1, Math.floor(g.front || 0), g.depth);
  g.front = f;
  return f;
}
function actEverCleared(g: Game, d: number = g.depth): boolean {
  return (g.actCleared ?? 0) >= d;
}
function needReturnStairs(g: Game): boolean {
  return g.depth === floorFront(g) - 1;
}
function canGoBack(g: Game, ignoreLock = false): boolean {
  if (g.mode !== "play" || uiBlocked(g) || g.paused || !!g.vault || (g.area ?? "dungeon") !== "dungeon" || g.depth <= 1) return false;
  if (!ignoreLock && g.locked) return false;
  return g.depth === floorFront(g);
}
function packMapBits(a: Uint8Array, bits: number): string {
  const n = Math.ceil(a.length * bits / 8);
  const b = new Uint8Array(n);
  for (let i = 0; i < a.length; i++) {
    const v = a[i] & ((1 << bits) - 1);
    const bit = i * bits, bi = bit >> 3, o = bit & 7;
    b[bi] |= (v << o) & 255;
    if (o + bits > 8 && bi + 1 < b.length) b[bi + 1] |= v >> (8 - o);
  }
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function unpackMapBits(s: string, bits: number, len: number): Uint8Array {
  const a = new Uint8Array(len);
  if (!s) return a;
  let bin = "";
  try { bin = atob(s); } catch { return a; }
  const mask = (1 << bits) - 1;
  for (let i = 0; i < len; i++) {
    const bit = i * bits, bi = bit >> 3, o = bit & 7;
    if (bi >= bin.length) break;
    let v = bin.charCodeAt(bi) >> o;
    if (o + bits > 8 && bi + 1 < bin.length) v |= bin.charCodeAt(bi + 1) << (8 - o);
    a[i] = v & mask;
  }
  return a;
}
function packDrop(d: Drop): Drop {
  return { x: d.x, y: d.y, pot: !!d.pot, gold: typeof d.gold === "number" ? d.gold : 0, item: d.item ? d.item : null };
}
function captureFloor(g: Game): FloorSnap {
  const portal = g.portal && g.portal.kind === "camp" && needReturnStairs(g) === false && !actEverCleared(g)
    ? null
    : (g.portal ? { x: g.portal.x, y: g.portal.y, kind: g.portal.kind } : null);
  return {
    d: g.depth,
    map: packMapBits(g.map, 2),
    seen: packMapBits(g.seen, 1),
    chests: (g.chests || []).map((c: Chest) => packChest(c)).slice(0, SAVE_CHEST_CAP),
    drops: (g.drops || []).filter((d: Drop) => d && (d.pot || (d.gold || 0) > 0 || d.item)).map((d: Drop) => packDrop(d)).slice(0, SAVE_DROP_CAP),
    trader: g.trader,
    portal,
    ground: Array.isArray(g.ground) ? g.ground.slice(0, SAVE_GROUND_CAP) : [],
    theme: g.theme,
    campSpot: g.campSpot ? { x: g.campSpot.x, y: g.campSpot.y } : undefined,
    gobT: g.gobT || 0,
    floorTurn: g.floorTurn || 0,
    cracks: packCracks(g) || undefined,
  };
}
function unpackFloorSnap(raw: unknown): FloorSnap | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.d !== "number" || !isFinite(s.d) || s.d < 1) return null;
  if (typeof s.map !== "string" || typeof s.seen !== "string") return null;
  const portalIn = s.portal as { x: number; y: number; kind?: "vault" | "camp" | "proceed" } | undefined;
  const portal = portalIn && typeof portalIn === "object" && inb(portalIn.x, portalIn.y) ? { x: portalIn.x, y: portalIn.y, kind: portalIn.kind } : null;
  const camp = s.campSpot as { x?: number; y?: number } | undefined;
  return {
    d: Math.floor(s.d),
    map: s.map,
    seen: s.seen,
    chests: Array.isArray(s.chests) ? (s.chests as Chest[]).filter((c: Chest) => c && inb(c.x, c.y)).map((c: Chest) => packChest(c)) : [],
    drops: Array.isArray(s.drops) ? (s.drops as Drop[]).filter((d: Drop) => d && inb(d.x, d.y)).map((d: Drop) => packDrop(d)).filter((d: Drop) => d.pot || d.gold > 0 || d.item) : [],
    trader: (s.trader && typeof s.trader === "object") ? s.trader as Trader : null,
    portal,
    ground: Array.isArray(s.ground) ? s.ground as Ground[] : [],
    theme: typeof s.theme === "number" && isFinite(s.theme) ? Math.floor(s.theme) : 0,
    campSpot: camp && typeof camp.x === "number" && typeof camp.y === "number" && inb(camp.x, camp.y) ? { x: camp.x, y: camp.y } : undefined,
    gobT: typeof s.gobT === "number" && isFinite(s.gobT) ? s.gobT : 0,
    floorTurn: typeof s.floorTurn === "number" && isFinite(s.floorTurn) ? Math.floor(s.floorTurn) : 0,
    cracks: typeof s.cracks === "string" ? s.cracks : undefined,
  };
}
function ensureStairTile(g: Game, tile: number, preferFar = true): { x: number; y: number } | null {
  for (let k = 0; k < MW * MH; k++) if (g.map[k] === tile) return { x: k % MW, y: (k / MW) | 0 };
  const hx = g.hero.x, hy = g.hero.y;
  let best: { x: number; y: number; sc: number } | null = null;
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    if (g.map[y * MW + x] !== 1) continue;
    if (x === hx && y === hy) continue;
    const sc = preferFar ? Math.abs(x - hx) + Math.abs(y - hy) : -(Math.abs(x - hx) + Math.abs(y - hy));
    if (!best || sc > best.sc) best = { x, y, sc };
  }
  if (!best) return null;
  g.map[best.y * MW + best.x] = tile;
  return { x: best.x, y: best.y };
}
function placeNearTile(g: Game, tile: number): void {
  const st = ensureStairTile(g, tile, tile === 2);
  const cands: number[][] = [];
  const consider = (x: number, y: number): void => {
    if (!inb(x, y) || g.map[y * MW + x] === 0 || g.map[y * MW + x] === 2 || g.map[y * MW + x] === TILE_UP) return;
    if (chestAt(g, x, y) || (g.portal && g.portal.x === x && g.portal.y === y) || merchAt(g, x, y)) return;
    cands.push([x, y]);
  };
  if (st) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      consider(st.x + dx, st.y + dy);
    }
  }
  if (!cands.length) {
    for (let y = 1; y < MH - 1 && !cands.length; y++) for (let x = 1; x < MW - 1; x++) consider(x, y);
  }
  const p = cands.length ? cands[0] : [g.hero.x, g.hero.y];
  g.hero.x = p[0]; g.hero.y = p[1]; g.hero.ax = p[0]; g.hero.ay = p[1];
}
function roomsFromMap(map: Uint8Array): { x: number; y: number; w: number; h: number }[] {
  const seen = new Uint8Array(MW * MH);
  const rooms: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    const k0 = y * MW + x;
    if (map[k0] === 0 || seen[k0]) continue;
    let minx = x, maxx = x, miny = y, maxy = y;
    const q = [[x, y]];
    seen[k0] = 1;
    while (q.length) {
      const [cx, cy] = q.pop()!;
      if (cx < minx) minx = cx; if (cx > maxx) maxx = cx;
      if (cy < miny) miny = cy; if (cy > maxy) maxy = cy;
      const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < 4; i++) {
        const nx = cx + nbs[i][0], ny = cy + nbs[i][1];
        if (!inb(nx, ny)) continue;
        const nk = ny * MW + nx;
        if (map[nk] === 0 || seen[nk]) continue;
        seen[nk] = 1;
        q.push([nx, ny]);
      }
    }
    rooms.push({ x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 });
  }
  return rooms;
}
function spawnMonstersOnMap(g: Game): void {
  g.en = []; g.pend = []; g.shots = []; g.fx = []; g.echo = []; g.allies = [];
  const map = g.map;
  const rooms = roomsFromMap(map);
  const used = new Set<number>();
  used.add(g.hero.y * MW + g.hero.x);
  const stairs: number[][] = [];
  for (let k = 0; k < MW * MH; k++) if (map[k] === 2 || map[k] === TILE_UP) { used.add(k); stairs.push([k % MW, (k / MW) | 0]); }
  for (const c of g.chests) used.add(c.y * MW + c.x);
  for (const d of g.drops) used.add(d.y * MW + d.x);
  if (g.merchant) used.add(g.merchant.y * MW + g.merchant.x);
  if (g.portal) used.add(g.portal.y * MW + g.portal.x);
  const d = g.depth;
  const actFl = isActFloor(d);
  const cell = (ri0: number): number[] | null => {
    if (!rooms.length) return pickWalk(g, used, g.hero.x, g.hero.y, 8, 5);
    const rm = rooms[Math.max(0, Math.min(rooms.length - 1, ri0))];
    for (let t = 0; t < 80; t++) {
      const x = rm.x + ri(rm.w), y = rm.y + ri(rm.h), k = y * MW + x;
      if (map[k] === 1 && !used.has(k)) { used.add(k); return [x, y]; }
    }
    return pickWalk(g, used, g.hero.x, g.hero.y, 8, 5);
  };
  const nEn = enBase(d);
  const eliteCh = eliteChance(d);
  for (let i = 0; i < nEn; i++) {
    const c = pickWalk(g, used, g.hero.x, g.hero.y, 8, 5);
    if (c) g.en.push(mkEnemy(g, c[0], c[1], R() < eliteCh ? 1 : 0));
  }
  const nPacks = rollPacks(d);
  for (let i = 0; i < nPacks; i++) spawnRarePack(g, used, g.hero.x, g.hero.y);
  if (actFl) {
    const c = cell(rooms.length ? rooms.length - 1 : 0) || pickWalk(g, used, g.hero.x, g.hero.y, 8, 5);
    if (c) g.en.push(mkActBoss(g, c[0], c[1]));
  } else if (d > EARLY_SAFE_MAX && R() < 0.07) {
    const c = cell(1);
    if (c) g.en.push(mkEnemy(g, c[0], c[1], 2));
  }
  if (d > EARLY_SAFE_MAX && rooms.length > 2 && R() < Math.min(0.5, 0.2 + d * 0.01)) {
    const ri0 = 1 + ri(Math.max(1, rooms.length - 1));
    const c = cell(ri0);
    if (c) {
      const ch = mkEnemy(g, c[0], c[1], 1);
      ch.hp = ch.mhp = Math.round(ch.mhp * 1.5); ch.atk = Math.round(ch.atk * 1.15); ch.xp = Math.round(ch.xp * 1.8); ch.name = "Champion " + ch.name;
      g.en.push(ch);
    }
  }
  if (d > EARLY_SAFE_MAX && rooms.length > 2 && R() < 0.3) {
    const c = cell(1 + ri(Math.max(1, rooms.length - 1)));
    if (c) { const m = mkEnemy(g, c[0], c[1], 1); m.awake = true; m.name = "Roaming " + m.name; m.hp = m.mhp = Math.round(m.mhp * 1.25); m.xp = Math.round(m.xp * 1.5); g.en.push(m); }
  }
  if (d >= 3 && rooms.length > 2) {
    const mul = gemGobMul(g);
    const gr = R();
    const gk = gr < GOB_CH * mul ? 1 : gr < (GOB_CH + GOB_GEM_CH) * mul ? 2 : gr < (GOB_CH + GOB_GEM_CH + GOB_GOLD_CH) * mul ? 3 : 0;
    if (gk) { const c = cell(1 + ri(Math.max(1, rooms.length - 1))); if (c) g.en.push(mkGoblin(g, c[0], c[1], gk)); }
  }
  if (d > EARLY_SAFE_MAX && d >= HUNTER_MIN_DEPTH && rooms.length > 2 && R() < HUNTER_CHANCE) {
    const c = cell(Math.max(1, rooms.length - 1));
    if (c) {
      const hu = mkHunter(g, c[0], c[1]);
      g.en.push(hu);
    }
  }
}
function restoreFloor(g: Game, snap: FloorSnap, nearTile: number): void {
  g.depth = snap.d;
  g.map = unpackMapBits(snap.map, 2, MW * MH);
  g.seen = unpackMapBits(snap.seen, 1, MW * MH);
  g.vis = new Uint8Array(MW * MH);
  g.theme = snap.theme || themeOf(g.depth);
  g.thShift = themeShift(g);
  THDREAD = dreadT(g.depth);
  g.tiles = makeTiles(g.theme, g.thShift);
  g.chests = snap.chests.slice();
  g.drops = snap.drops.slice();
  g.trader = null;
  g.ground = Array.isArray(snap.ground) ? snap.ground.slice() : [];
  g.portal = snap.portal && inb(snap.portal.x, snap.portal.y) ? { x: snap.portal.x, y: snap.portal.y, kind: snap.portal.kind } : null;
  g.campSpot = snap.campSpot;
  g.gobT = 0;
  g.floorTurn = 0;
  g.vault = null;
  g.area = "dungeon";
  g.shopOpen = false; g.stashOpen = false; g.gambOpen = false;
  g.restAt = undefined; g.stashAt = undefined; g.fireAt = undefined;
  g.cracks = unpackCracks(snap.cracks, g.map); g.digAt = undefined; g.digClock = undefined;
  placeNearTile(g, nearTile);
  spawnMonstersOnMap(g);
  if (isActFloor(g.depth) && actEverCleared(g)) openCampPortal(g);
  if (needReturnStairs(g)) ensureStairTile(g, 2, true);
  computeVis(g);
  placeTorches(g);
}
function applyActFloorOnEnter(g: Game): void {
  if (!isActFloor(g.depth) || g.area === "camp" || g.vault) return;
  g.en = g.en.filter((e: En) => !e.act && !(isActFloor(g.depth) && e.cls === 2 && !e.hunt && !e.gob));
  const used = new Set<number>();
  used.add(g.hero.y * MW + g.hero.x);
  const c = pickWalk(g, used, g.hero.x, g.hero.y, 8, 5);
  if (c) g.en.push(mkActBoss(g, c[0], c[1]));
  if (actEverCleared(g)) openCampPortal(g);
}
function starPriceMul(it: Item): number {
  const n = it.st ? it.st.length : 0;
  let m = 1 + 0.35 * n;
  if (it.rar >= 7 && n > PRIS_STAR_BASE) m = safeMul(m, prisStarMul(it));
  if (it.golden) m = safeMul(m, 3);
  return m;
}
function priceOf(it: Item): number {
  const ilvl = Math.max(1, it.ilvl);
  const base = (40 + ilvl * 12) * (PRICE[Math.max(0, Math.min(7, it.rar))] ?? 1);
  return Math.max(1, safeRound(safeMul(base, starPriceMul(it))));
}
const sellVal = (it: Item): number => Math.round(salvageVal(it) * 1.5);
const inb = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < MW && y < MH;

function rarF(f: number, d: number = 1): number {
  const lift = 1 + RAR_F_LIFT * rampT(d);
  return Math.min(RAR_F_CAP * lift, Math.max(1, f) * lift);
}
const PRIS_DROP_MULT = 0.25;
// Scale the Prismatic slot of a weight or odds vector to PRIS_DROP_MULT of its current
// value, and redistribute the removed mass proportionally across every other slot
// (Set Relic included in 9-way tables) so relative odds among non-Prismatic tiers stay the same.
function scalePrisDrop(p: number[], prisIndex: number): number[] {
  const out = p.map((v: number) => Math.max(0, v));
  if (prisIndex < 0 || prisIndex >= out.length) return out;
  const old = out[prisIndex];
  const neu = old * PRIS_DROP_MULT;
  const removed = old - neu;
  out[prisIndex] = neu;
  if (removed <= 0) return out;
  let rest = 0;
  for (let i = 0; i < out.length; i++) if (i !== prisIndex) rest += out[i];
  if (rest > 0) {
    for (let i = 0; i < out.length; i++) if (i !== prisIndex) out[i] += removed * out[i] / rest;
  }
  return out;
}
function rollRarWRaw(f: number, min: number, d: number = 1): number[] {
  const ff = rarF(f, d);
  const raw = RW.map((v: number, i: number) => {
    if (i < min) return 0;
    let w = v * Math.pow(ff, i === 7 ? PRIS_F_EXP : i * RAR_F_EXP);
    if (i === 7) w *= (1 + Math.min(PRIS_BONUS_END, Math.max(0, d) / 150));
    return w;
  });
  return lootRarFloorW(raw);
}
function rollRarW(f: number, min: number, d: number = 1): number[] {
  return scalePrisDrop(rollRarWRaw(f, min, d), 7);
}
function rollRar(f: number, min: number, d: number = 1): number {
  const w = rollRarW(f, min, d);
  let tot = 0;
  for (const v of w) tot += v;
  let r = R() * tot;
  for (let i = 0; i < 8; i++) { r -= w[i]; if (r <= 0) return i; }
  return 6;
}
function bossRarW(d: number): number[] {
  const t = actBossLootT(Math.max(1, d));
  return lootRarFloorW(BOSS_RAR_W0.map((v: number, i: number) => v * (1 - t) + BOSS_RAR_W1[i] * t));
}
function bossRarOddsRaw(d: number): number[] {
  const w = bossRarW(d);
  let tot = 0; for (const v of w) tot += v;
  return w.map((v: number) => (tot > 0 ? v / tot : 0));
}
function bossRarOdds(d: number): number[] { return scalePrisDrop(bossRarOddsRaw(d), 8); }
function bossPlainOdds(d: number): number[] {
  const p = bossRarOdds(d);
  return [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[8]];
}
function actLootPick(d: number): { rar: number; set: boolean } {
  const p = bossRarOdds(d);
  let r = R();
  for (let i = 0; i < 9; i++) {
    r -= p[i];
    if (r <= 0) return { rar: i === 8 ? 7 : (i === 7 ? 6 : i), set: i === 7 };
  }
  return { rar: 3, set: false };
}
function jackpotRarW(d: number = 1): number[] {
  const eW = rollRarWRaw(1.22, 0, d);
  let eTot = 0; for (const v of eW) eTot += v;
  const elite = eW.map((v: number) => (eTot > 0 ? v / eTot : 0));
  const bo = bossRarOddsRaw(d);
  const boss = [bo[0], bo[1], bo[2], bo[3], bo[4], bo[5], bo[6], bo[8]];
  const high: number[] = [];
  for (let i = 3; i < 8; i++) high.push(elite[i] + JACKPOT_BLEND * (boss[i] - elite[i]));
  let highSum = 0; for (const v of high) highSum += v;
  const lowMass = Math.max(0, 1 - highSum);
  let eLow = elite[0] + elite[1] + elite[2];
  const w = [0, 0, 0, high[0], high[1], high[2], high[3], high[4]];
  for (let i = 0; i < 3; i++) w[i] = lowMass * (eLow > 0 ? elite[i] / eLow : 1 / 3);
  return scalePrisDrop(lootRarFloorW(w), 7);
}
function jackpotRar(d: number = 1): number {
  const w = jackpotRarW(d);
  let tot = 0; for (const v of w) tot += v;
  let r = R() * tot;
  for (let i = 0; i < 8; i++) { r -= w[i]; if (r <= 0) return i; }
  return 3;
}
function prisGated(g: Game): boolean {
  for (const k of EQK) {
    const it = g.eq[k];
    if (it && it.rar >= 7) return true;
  }
  return false;
}
function seDepthMul(d: number): number {
  const mid = 1 + 0.55 * rampT(d);
  if (d <= RAMP_END) return mid;
  return safeNum(mid * (1 + 0.25 * (d - RAMP_END) / RAMP_END));
}
function seTargetHits(d: number): number {
  const t = Math.max(0, d - 1);
  return 13 + Math.min(10, t * 0.18);
}
function seAtkPct(d: number): number {
  const t = Math.max(0, d - 1);
  return 0.135 + Math.min(0.038, t * 0.001);
}
function seFloorChance(d: number): number {
  if (earlySafeDepth(d)) return 0;
  return SE_FLOOR_CH0 + (SE_FLOOR_CH1 - SE_FLOOR_CH0) * rampT(d);
}
function seBossEscorts(d: number): number {
  return 2 + Math.round(2 * rampT(d));
}
function bossTripleChance(d: number): number {
  return 0.05 + 0.03 * rampT(d);
}
function bossDoubleChance(d: number): number {
  return 0.18 + 0.06 * rampT(d);
}
function rollBossCopies(d: number): number {
  const r = R();
  const tr = bossTripleChance(d);
  if (r < tr) return 3;
  if (r < tr + bossDoubleChance(d)) return 2;
  return 1;
}
function eliteOdds9Raw(d: number): number[] {
  const w = rollRarWRaw(1.22, 0, d);
  let tot = 0; for (const v of w) tot += v;
  const p = w.map((v: number) => (tot > 0 ? v / tot : 0));
  const conv = (1 - PET_CH) * 0.45 * SET_CH(Math.max(1, d));
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 7; i++) out[i] = p[i] * (1 - conv);
  out[7] = (1 - p[7]) * conv;
  out[8] = p[7];
  return out;
}
function eliteOdds9(d: number): number[] { return scalePrisDrop(eliteOdds9Raw(d), 8); }
function superEliteOdds9(d: number): number[] {
  const el = eliteOdds9Raw(d);
  const bo = bossRarOddsRaw(d);
  const t = SE_BLEND;
  const w = el.map((v: number, i: number) => v * (1 - t) + bo[i] * t);
  const floored = lootRarFloorW(w);
  let tot = 0; for (const v of floored) tot += v;
  return scalePrisDrop(floored.map((v: number) => (tot > 0 ? v / tot : 0)), 8);
}
function seLootPick(d: number): { rar: number; set: boolean } {
  const p = superEliteOdds9(d);
  let r = R();
  for (let i = 0; i < 9; i++) {
    r -= p[i];
    if (r <= 0) return { rar: i === 8 ? 7 : (i === 7 ? 6 : i), set: i === 7 };
  }
  return { rar: 3, set: false };
}
function isPackBoss(e: En): boolean {
  return e.cls === 2 && !e.hunt && !e.gob && !e.child;
}
function packRemain(g: Game, e: En): number {
  if (e.packId === undefined) return 0;
  let n = 0;
  for (const o of g.en) if (o.hp > 0 && isPackBoss(o) && o.packId === e.packId) n++;
  return n;
}
function lootRarBucket(it: Item): number { return it.set !== undefined ? 6 : it.rar; }
function invStars(it: Item): number { return it.st ? it.st.length : 0; }
function cmpInvItems(a: Item, b: Item): number {
  const ra = lootRarBucket(a), rb = lootRarBucket(b);
  if (rb !== ra) return rb - ra;
  const sa = invStars(a), sb = invStars(b);
  if (sb !== sa) return sb - sa;
  return (a.id | 0) - (b.id | 0);
}
function sortInventory(g: Game): void {
  g.bag.sort(cmpInvItems);
  ensureGemBag(g).sort(cmpInvItems);
}
function bagIndexById(bag: Item[], id: number): number {
  for (let i = 0; i < bag.length; i++) if (bag[i].id === id) return i;
  return -1;
}

function bonusVal(b: Bonus, ilvl: number, rar: number): number {
  const rm = RM[rar];
  if (b === "hp") return Math.max(3, Math.round((4 + 2.5 * ilvl) * rm * 0.35));
  if (b === "atk" || b === "def") return Math.max(1, Math.round((1 + 0.5 * ilvl) * rm * 0.5));
  if (b === "crit") return Math.round(2 + rar * 1.5 + R() * 2);
  if (b === "spd") return Math.round(3 + rar * 2 + R() * 3);
  if (b === "mv") return mvRoll(ilvl, rar);
  return Math.max(0.1, Math.round((0.15 + 0.04 * ilvl) * rm * 5) / 10);
}

function makeItem(ilvl: number, rar: number, kind?: Kind, depth?: number): Item {
  const dlt = depth ?? ilvl;
  if (kind === "gem") return makeGem(rar, undefined, ilvl);
  const k0: Kind = kind ?? (R() < PET_CH ? "pet" : R() < 0.45 ? pick(ARMOR_K) : pick(WEAP_K));
  if (k0 === "pet") return makePet(ilvl, rar, dlt);
  const k: AK | WT = k0;
  const seed = Math.floor(R() * 2147483646) + 1;
  const sr = rng32(seed);
  const d = [Math.floor(sr() * 6), Math.floor(sr() * 5), Math.floor(sr() * 4), Math.floor(sr() * 6)];
  const rm = RM[rar];
  const v = (): number => 0.9 + sr() * 0.2;
  let atk = 0, def = 0, block = 0;
  if (isArmor(k)) def = Math.max(1, Math.round((1.5 + 0.9 * ilvl) * SLOTMUL[k] * rm * v()));
  else if (k === "shield") { def = Math.max(1, Math.round((2 + 1.1 * ilvl) * rm * v())); block = 8 + rar * 3; }
  else atk = Math.max(1, Math.round((4 + 1.5 * ilvl) * WI[k].dmg * rm * v()));
  const bonus: Partial<Record<Bonus, number>> = {};
  let nb = NBON[rar] + (rar === 0 && R() < 0.25 ? 1 : 0) + ((rar === 2 || rar === 4) && R() < 0.5 ? 1 : 0);
  if (R() < HPCH[rar]) bonus.hp = bonusVal("hp", ilvl, rar);
  const pool: Bonus[] = ["atk", "def", "crit", "spd", "regen", "hp"];
  let guard = 0;
  while (Object.keys(bonus).length < nb && guard < 40) {
    guard++;
    const b = pool[Math.floor(sr() * pool.length)];
    if (bonus[b] === undefined) bonus[b] = bonusVal(b, ilvl, rar);
  }
  if (isArmor(k) && R() < MVCH[rar]) bonus.mv = bonusVal("mv", ilvl, rar);
  nb = 0;
  let spells: Spell[] | undefined;
  let pas: Passive[] | undefined;
  if (!isArmor(k) && k !== "shield") { const n = rar >= 7 ? 2 + (sr() < 0.5 ? 1 : 0) : rar >= 6 ? 2 : sr() < SPCH[rar] ? 1 : 0; if (n) { spells = []; for (let i = 0; i < n; i++) spells.push(makeSpell(rar, sr)); } }
  else { const n = rar >= 7 ? 3 : rar >= 6 ? 2 : sr() < PSCH[rar] ? 1 : 0; if (n) { pas = []; for (let i = 0; i < n; i++) pas.push(makePassive(rar, sr)); } }
  const ult = rar >= 7 && k !== "shield" ? Math.floor(sr() * 50) : undefined;
  const base = isArmor(k) ? ABASE[k][d[0]] : WI[k].bases[d[0]];
  const pre = PRE[rar][Math.floor(sr() * 6)];
  const suf = rar >= 1 ? " " + SUF[Math.floor(sr() * SUF.length)] : "";
  const name = pre + " " + MATN[d[3]] + " " + base + suf;
  const ef = rollEf(k, rar);
  const st = rollStars(k, rar, false, dlt);
  const it: Item = { id: NID++, seed, kind: k, rar, ilvl, name, atk, def, block, bonus, d, spells, pas, ult, ef, st };
  if (wepNeedsEl(k)) ensureWepEl(it);
  rollSockets(it, dlt);
  return it;
}

function eqStarCapped(eq: Eq, cap: number): Eq {
  const one = (it: Item | null): Item | null => {
    if (!it || !it.st || it.st.length <= cap) return it;
    const c = { ...it, st: it.st.slice(0, cap) };
    return c;
  };
  return { head: one(eq.head), chest: one(eq.chest), arms: one(eq.arms), legs: one(eq.legs), rh: one(eq.rh), lh: one(eq.lh), pet: one(eq.pet) };
}
function calc(lvl: number, eq: Eq): Stats {
  const s: Stats = { maxHp: baseHp(lvl), atk: baseAtk(lvl), def: 0, crit: 5, spd: 0, block: 0, regen: 0, reach: 1, range: 0, magic: false, cleave: false, pierce: 0, stun: 0, ward: 0, mv: 0 };
  const rh = eq.rh, lh = eq.lh;
  const main = rh ?? (lh && lh.kind !== "shield" ? lh : null);
  if (main) {
    const w = WI[main.kind as WT];
    s.crit += w.crit; s.spd += w.spd; s.reach = w.reach; s.range = w.range; s.magic = w.magic; s.cleave = w.cleave; s.pierce = w.pierce; s.stun = w.stun;
  }
  if (rh) s.atk += itemAtk(rh);
  if (lh) {
    if (lh.kind === "shield") { s.def += itemDef(lh); s.block += itemBlock(lh); }
    else if (rh) {
      const bothClaw = rh.kind === "claws" && lh.kind === "claws";
      s.atk += safeRound(itemAtk(lh) * (bothClaw ? 0.85 : 0.7));
      s.spd += bothClaw ? 22 : 10;
    }
    else s.atk += itemAtk(lh);
  }
  for (const k of EQK) {
    const it = eq[k];
    if (!it) continue;
    if (isArmor(it.kind)) s.def += itemDef(it);
    s.maxHp += itemBonus(it, "hp"); s.atk += itemBonus(it, "atk"); s.def += itemBonus(it, "def"); s.crit += itemBonus(it, "crit"); s.spd += itemBonus(it, "spd"); s.regen += itemBonus(it, "regen"); s.mv += itemBonus(it, "mv");
  }
  for (const p of allPassives(eq)) if (p.ty === "ward") s.ward += Math.round(s.maxHp * p.pw * 0.4 * (p.mod === 3 ? 1.5 : 1));
  applySetsToStats(s, eq);
  applyStarStats(s, eq);
  applyGemStats(s, eq);
  s.crit = Math.min(75, s.crit); s.spd = Math.min(90, s.spd); s.block = Math.min(60, s.block); s.regen = Math.round(s.regen * 10) / 10; s.mv = Math.min(MV_CAP, Math.round(s.mv));
  return s;
}

function eqTarget(it: Item, hand?: "rh" | "lh"): EqKey {
  if (it.kind === "gem") return "rh";
  if (isArmor(it.kind)) return it.kind;
  if (it.kind === "shield") return "lh";
  if (it.kind === "pet") return "pet";
  if (WI[it.kind as WT] && WI[it.kind as WT].two) return "rh";
  return hand ?? "rh";
}

function simEq(eq: Eq, it: Item, hand?: "rh" | "lh"): { eq: Eq; back: Item[] } {
  const n: Eq = { ...eq };
  const back: Item[] = [];
  const tgt = eqTarget(it, hand);
  const cur = n[tgt];
  if (cur) back.push(cur);
  if (!isArmor(it.kind)) {
    if (isTwo(it) && n.lh) { back.push(n.lh); n.lh = null; }
    if (tgt === "lh" && isTwo(n.rh) && n.rh) { back.push(n.rh); n.rh = null; }
  }
  n[tgt] = it;
  return { eq: n, back };
}

// ---------- pixel painters ----------
let DRAW_T = 0;
function prisHue(t: number, seed: number, off = 0): number {
  return ((t * 140 + seed * 47 + off) % 360 + 360) % 360;
}
function prisHexRgb(c: string): number[] | null {
  if (!c || c[0] !== "#") return null;
  let h = c.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (!isFinite(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function prisTint(c: string, t: number, seed: number): string {
  // Hue-cycle the piece's own pixels: keep the original lightness so dark iron stays dark
  // and bright steel stays bright, which stays readable on the 1px in-world sprite.
  const rgb = prisHexRgb(c);
  const hue = Math.floor(prisHue(t, seed));
  if (!rgb) return hsl(hue, 100, 65);
  const lum = (rgb[0] + rgb[1] + rgb[2]) / 3;
  const L = lum < 40 ? 38 : lum < 100 ? 55 : lum < 180 ? 68 : 82;
  return hsl(hue, 100, L);
}
function drawPrisPiece(p: Pt, it: Item, draw: (pp: Pt) => void): void {
  if (it.rar < 7) { draw(p); return; }
  const box = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  const t = DRAW_T, seed = (it.seed || it.id) | 0;
  const oc = hsl(Math.floor(prisHue(t, seed, 50)), 100, 78);
  const pp: Pt = (x: number, y: number, w: number, h: number, c: string): void => {
    if (x < box.x0) box.x0 = x;
    if (y < box.y0) box.y0 = y;
    if (x + w - 1 > box.x1) box.x1 = x + w - 1;
    if (y + h - 1 > box.y1) box.y1 = y + h - 1;
    p(x, y, w, h, prisTint(c, t, seed + x * 3 + y));
  };
  draw(pp);
  if (box.x1 < box.x0) return;
  const x = box.x0, y = box.y0, w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  // 1px hue-cycling outline around this piece (a tight silhouette at s=1, a clear rim on the large portrait).
  p(x - 1, y, 1, h, oc); p(x + w, y, 1, h, oc); p(x, y - 1, w, 1, oc); p(x, y + h, w, 1, oc);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const ph = t * 3.2 + seed * 0.17 + i * 1.7;
    const sx = Math.round(x + (Math.sin(ph) * 0.5 + 0.5) * Math.max(0, w - 1));
    const sy = Math.round(y + (Math.cos(ph * 1.31 + i) * 0.5 + 0.5) * Math.max(0, h - 1));
    p(sx, sy, 1, 1, i % 2 ? "#ffffff" : hsl(Math.floor(prisHue(t, seed, i * 80)), 100, 90));
  }
}
function painter(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: number, flip: boolean, fw: number): Pt {
  return (x: number, y: number, w: number, h: number, c: string): void => {
    ctx.fillStyle = c;
    const xx = flip ? fw - x - w : x;
    ctx.fillRect(ox + xx * s, oy + y * s, w * s, h * s);
  };
}
const off = (p: Pt, dx: number, dy: number): Pt => (x: number, y: number, w: number, h: number, c: string): void => p(x + dx, y + dy, w, h, c);

function drawHelm(p: Pt, it: Item, onHero: boolean): void {
  const [m, l, k] = MAT[it.d[3]];
  const b = it.d[0], v = it.d[1], c = it.d[2], r = it.rar;
  const tc = r >= 1 ? RC[r] : k;
  if (c === 2) { const pc = r >= 1 ? RC[r] : "#c03030"; p(4, -3, 2, 3, pc); p(6, -2, 2, 2, pc); p(2, -1, 2, 2, pc); }
  let by = 9;
  if (b === 0) { p(2, 0, 6, 1, m); p(1, 1, 8, 3, m); p(2, 1, 4, 1, l); p(0, 3, 10, 1, k); by = 3; }
  else if (b === 1) { p(3, 0, 4, 1, m); p(2, 1, 6, 1, m); p(1, 2, 8, 6, m); p(2, 1, 3, 1, l); p(2, 2, 1, 4, l); p(1, 8, 8, 1, k); by = 8; }
  else if (b === 2) { p(2, 0, 6, 1, m); p(1, 1, 8, 9, m); for (let yy = 1; yy < 10; yy += 2) for (let xx = 1 + ((yy >> 1) % 2); xx < 9; xx += 2) p(xx, yy, 1, 1, k); }
  else if (b === 3) { p(4, -1, 2, 1, m); p(3, 0, 4, 1, m); p(2, 1, 6, 1, m); p(1, 2, 8, 7, m); p(0, 8, 10, 2, k); p(3, 0, 1, 3, l); p(1, 2, 1, 6, l); }
  else if (b === 4) { p(1, 0, 8, 10, m); p(1, 0, 8, 1, l); p(2, 1, 1, 8, l); p(1, 9, 8, 1, k); }
  else { p(2, 0, 6, 1, m); p(1, 1, 8, 7, m); p(0, 4, 2, 5, m); p(2, 1, 4, 1, l); p(0, 8, 2, 1, k); p(8, 6, 2, 1, k); by = 8; }
  const fx = 3, fy = 4, fw = 6, fh = 4;
  if (v === 0) {
    if (onHero) { p(fx, fy, fw, fh, SKIN); p(fx + 3, fy + 1, 1, 1, DK); p(fx + 5, fy + 1, 1, 1, DK); }
    else p(fx, fy, fw, fh, "#1a1420");
  } else {
    p(fx, fy, fw, fh, m);
    if (v === 1) p(fx, fy + 1, fw, 1, DK);
    else if (v === 2) { for (let i = 0; i < fw; i += 2) p(fx + i, fy, 1, fh - 1, DK); }
    else if (v === 3) { p(fx, fy + 1, fw, 1, DK); p(fx + 3, fy + 1, 1, fh - 1, DK); }
    else { p(fx, fy, fw, fh, l); p(fx + 2, fy + 1, 1, 1, DK); p(fx + 4, fy + 1, 1, 1, DK); p(fx + 2, fy + 3, 3, 1, k); }
  }
  if (c === 1) { const hc = r >= 2 ? "#fff4d0" : "#d8ccb0"; p(-1, 2, 2, 1, hc); p(-2, 0, 1, 2, hc); p(9, 2, 2, 1, hc); p(10, 0, 1, 2, hc); }
  if (c === 3) { p(2, -2, 1, 2, l); p(4, -3, 2, 3, l); p(7, -2, 1, 2, l); }
  if (r >= 1) p(1, by, 8, 1, tc);
  if (r >= 2) { p(1, by - 1, 1, 1, GOLD); p(8, by - 1, 1, 1, GOLD); if (c === 1 || c === 3) p(4, -1, 2, 1, GOLD); }
  if (r >= 3) { p(4, 1, 2, 2, RC[r]); p(4, 1, 1, 1, "#ffffff"); }
}

function drawChest(p: Pt, it: Item): void {
  const [m, l, k] = MAT[it.d[3]];
  const b = it.d[0], e = it.d[1], s = it.d[2], r = it.rar;
  const tc = r >= 1 ? RC[r] : k;
  if (b === 4) { p(1, 0, 10, 9, m); p(5, 0, 2, 9, l); p(1, 8, 10, 1, k); }
  else p(1, 0, 10, 7, m);
  if (b === 0) { p(2, 1, 2, 5, l); p(10, 1, 1, 5, k); }
  else if (b === 1) { for (let y = 0; y < 7; y++) for (let x = 1 + (y % 2); x < 11; x += 2) p(x, y, 1, 1, k); }
  else if (b === 2) { for (let y = 0; y < 7; y += 2) p(6, y, 1, 1, k); p(3, 1, 1, 4, l); p(8, 1, 1, 4, k); }
  else if (b === 3) { for (let y = 0; y < 6; y += 2) for (let x = 1 + ((y >> 1) % 2); x < 11; x += 2) { p(x, y, 1, 1, l); p(x, y + 1, 1, 1, k); } }
  else if (b === 5) { for (let y = 1; y < 6; y += 2) for (let x = 2; x < 11; x += 3) p(x, y, 1, 1, l); p(1, 0, 1, 7, k); }
  const ec = r >= 1 ? RC[r] : k;
  if (e === 1) { p(5, 1, 2, 4, ec); p(4, 2, 4, 1, ec); }
  else if (e === 2) { p(5, 1, 2, 1, ec); p(4, 2, 1, 2, ec); p(7, 2, 1, 2, ec); p(5, 4, 2, 1, ec); }
  else if (e === 3) { p(3, 2, 2, 1, ec); p(5, 3, 2, 1, ec); p(7, 2, 2, 1, ec); }
  else if (e === 4) { p(3, 1, 6, 3, BONE); p(4, 2, 1, 1, DK); p(7, 2, 1, 1, DK); p(4, 4, 4, 1, BONE); }
  if (b !== 4) { p(1, 6, 10, 1, k); p(5, 6, 2, 1, r >= 2 ? GOLD : l); }
  if (s === 1) { p(-1, 0, 3, 2, l); p(-1, 2, 3, 1, m); p(10, 0, 3, 2, l); p(10, 2, 3, 1, m); }
  else if (s === 2) { p(-1, 0, 3, 3, m); p(-2, -1, 1, 2, l); p(10, 0, 3, 3, m); p(12, -1, 1, 2, l); }
  else if (s === 3) { p(-1, 0, 3, 1, m); p(-1, 1, 3, 1, l); p(-1, 2, 3, 1, k); p(10, 0, 3, 1, m); p(10, 1, 3, 1, l); p(10, 2, 3, 1, k); }
  if (r >= 1) p(1, 0, 10, 1, tc);
  if (r >= 2 && s > 0) { p(0, 0, 1, 1, GOLD); p(11, 0, 1, 1, GOLD); }
  if (r >= 3) { p(5, 2, 2, 2, RC[r]); p(5, 2, 1, 1, "#ffffff"); }
}

function drawArm(p: Pt, it: Item): void {
  const [m, l, k] = MAT[it.d[3]];
  const g = it.d[0], h = it.d[1], x = it.d[2], r = it.rar;
  const tc = r >= 1 ? RC[r] : k;
  if (g === 5) { p(-1, 0, 5, 2, l); p(0, 2, 3, 4, m); } else { p(0, 0, 3, 6, m); p(0, 0, 1, 6, l); }
  if (g === 1) { p(0, 1, 3, 1, k); p(0, 3, 3, 1, k); }
  else if (g === 2) { p(-1, 2, 1, 1, l); p(3, 2, 1, 1, l); p(-1, 4, 1, 1, l); p(3, 4, 1, 1, l); }
  else if (g === 3) { for (let yy = 0; yy < 6; yy++) p((yy % 2) * 2, yy, 1, 1, k); }
  else if (g === 4) { p(0, 0, 1, 1, k); p(1, 1, 1, 1, k); p(2, 2, 1, 1, k); p(0, 3, 1, 1, k); p(1, 4, 1, 1, k); p(2, 5, 1, 1, k); }
  if (h === 0) p(0, 6, 3, 1, SKIN);
  else if (h === 1) p(0, 6, 3, 1, k);
  else if (h === 2) { p(0, 6, 3, 1, m); p(0, 7, 1, 1, l); p(2, 7, 1, 1, l); }
  else if (h === 3) { p(-1, 4, 5, 2, l); p(0, 6, 3, 1, SKIN); }
  else { p(0, 6, 3, 1, k); p(3, 6, 1, 1, l); p(-1, 6, 1, 1, l); }
  if (x === 1) p(1, 1, 1, 1, r >= 2 ? GOLD : l);
  else if (x === 2) p(0, 3, 3, 1, tc);
  else if (x === 3) p(0, 2, 3, 1, l);
  if (r >= 1) p(0, 5, 3, 1, tc);
  if (r >= 3) p(1, 3, 1, 1, RC[r]);
}

function drawLeg(p: Pt, it: Item): void {
  const [m, l, k] = MAT[it.d[3]];
  const st = it.d[0], kn = it.d[1], bt = it.d[2], r = it.rar;
  const tc = r >= 1 ? RC[r] : k;
  p(0, 0, 3, 6, m); p(0, 0, 1, 6, l);
  if (st === 1) { p(0, 1, 3, 1, k); p(0, 4, 3, 1, k); }
  else if (st === 2) { for (let yy = 0; yy < 6; yy++) p((yy % 2) * 2, yy, 1, 1, k); }
  else if (st === 3) p(-1, 2, 5, 2, l);
  else if (st === 4) { p(0, 1, 1, 1, k); p(1, 2, 1, 1, k); p(2, 3, 1, 1, k); p(0, 4, 1, 1, k); p(1, 5, 1, 1, k); }
  else if (st === 5) { p(-1, 3, 5, 2, "#d8c8a8"); p(-1, 4, 5, 1, "#a89878"); }
  if (kn === 1) p(0, 2, 3, 2, l);
  else if (kn === 2) { p(0, 2, 3, 2, l); p(3, 2, 1, 1, l); }
  else if (kn === 3) { p(0, 0, 3, 3, l); p(0, 3, 3, 1, k); }
  else if (kn === 4) { p(1, 1, 1, 1, r >= 2 ? GOLD : k); p(1, 3, 1, 1, r >= 2 ? GOLD : k); }
  p(0, 6, 3, 2, k);
  if (bt === 0) p(3, 7, 1, 1, k);
  else if (bt === 1) p(3, 7, 2, 1, k);
  else if (bt === 2) { p(0, 6, 3, 1, l); p(3, 6, 1, 2, l); }
  else { p(3, 7, 1, 1, k); p(4, 6, 1, 1, k); }
  if (r >= 1) p(0, 5, 3, 1, tc);
  if (r >= 3) p(1, 2, 1, 1, RC[r]);
}

const SHROWS: number[][] = [
  [6, 8, 10, 10, 10, 10, 10, 10, 8, 6], [10, 10, 10, 10, 10, 8, 8, 6, 4, 2], [8, 10, 10, 10, 8, 8, 6, 6, 4, 4, 2, 2],
  [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], [0, 0, 4, 6, 6, 6, 6, 4], [6, 8, 10, 10, 10, 10, 10, 10, 8, 6],
];
function drawShield(p: Pt, it: Item): void {
  const [m, l, k] = MAT[it.d[3]];
  const sh = it.d[0], em = it.d[1], bd = it.d[2], r = it.rar;
  const tc = r >= 1 ? RC[r] : k;
  const rows = SHROWS[sh];
  rows.forEach((w: number, i: number) => {
    if (!w) return;
    const x0 = 5 - w / 2;
    p(x0, i, w, 1, m);
    if (bd === 1 || bd === 3) { p(x0, i, 1, 1, l); p(x0 + w - 1, i, 1, 1, k); }
    if (r >= 1) { p(x0, i, 1, 1, tc); p(x0 + w - 1, i, 1, 1, tc); }
  });
  if (bd === 3) { const w0 = rows[sh === 4 ? 2 : 0]; p(5 - w0 / 2, sh === 4 ? 2 : 0, w0, 1, k); }
  if (bd === 2) { const sc = r >= 2 ? GOLD : l; p(2, 3, 1, 1, sc); p(7, 3, 1, 1, sc); p(2, 6, 1, 1, sc); p(7, 6, 1, 1, sc); }
  const ec = r >= 1 ? RC[r] : k;
  if (em === 1) { p(4, 2, 2, 5, ec); p(2, 4, 6, 1, ec); }
  else if (em === 2) { p(2, 3, 2, 1, ec); p(4, 4, 2, 1, ec); p(6, 3, 2, 1, ec); p(2, 5, 2, 1, ec); p(4, 6, 2, 1, ec); p(6, 5, 2, 1, ec); }
  else if (em === 3) { p(4, 3, 2, 3, r >= 1 ? ec : GOLD); p(3, 4, 4, 1, r >= 1 ? ec : GOLD); p(4, 2, 2, 1, l); p(4, 6, 2, 1, l); }
  else if (em === 4) { p(3, 3, 4, 3, BONE); p(3, 4, 1, 1, DK); p(6, 4, 1, 1, DK); p(4, 6, 2, 1, BONE); }
  if (sh === 5) { p(4, 4, 2, 2, l); p(4, 3, 2, 1, "#ffffff"); }
  if (r >= 3) { p(4, 1, 2, 1, RC[r]); p(4, 1, 1, 1, "#ffffff"); }
}

function drawWeapon(p: Pt, it: Item): void {
  const k = it.kind as WT;
  const [m, l, dk] = MAT[it.d[3]];
  const a = it.d[0], b = it.d[1], c = it.d[2], r = it.rar;
  const tc = r >= 1 ? RC[r] : dk;
  const W1 = "#7a4c26", W2 = "#3e2614";
  const wrap = c % 2 === 0 ? W2 : r >= 2 ? GOLD : "#8a2a2a";
  const handle = (y0: number, y1: number): void => { for (let y = y0; y <= y1; y++) p(4, y, 1, 1, y % 2 === 0 ? W1 : wrap); };
  const pommel = (y: number): void => {
    if (c === 0) { p(3, y, 3, 2, m); p(3, y, 1, 1, l); }
    else if (c === 1) { p(3, y, 3, 1, dk); p(4, y + 1, 1, 1, dk); }
    else if (c === 2) { p(3, y, 3, 1, m); p(4, y + 1, 1, 2, l); }
    else { p(3, y, 3, 1, m); p(3, y + 1, 1, 1, m); p(5, y + 1, 1, 1, m); }
  };
  const gem = (x: number, y: number): void => { if (r >= 3) p(x, y, 1, 1, RC[r]); };
  if (k === "sword" || k === "greatsword" || k === "dagger") {
    const bl = k === "dagger" ? 8 : k === "sword" ? 13 : 15;
    const bw = k === "greatsword" ? 5 : 3;
    const hl = k === "dagger" ? 3 : k === "sword" ? 5 : 6;
    const yG = 21 - hl;
    const top = yG - bl;
    for (let i = 0; i < bl; i++) {
      const y = top + i;
      const fr = i / bl;
      let w = i === 0 ? 1 : i === 1 ? bw - 2 : bw;
      let ofs = 0;
      if (a === 1 && fr > 0.25 && fr < 0.6) w = bw + 2;
      else if (a === 2) ofs = Math.round((1 - fr) * (1 - fr) * 2);
      else if (a === 4) ofs = Math.round(Math.sin(i * 0.9));
      else if (a === 5) w = fr < 0.35 ? bw + 1 : bw;
      const x0 = 4 - Math.floor(w / 2) + ofs;
      p(x0, y, w, 1, m);
      p(x0, y, 1, 1, l);
      if (a === 3 && i % 2 === 0 && i > 1) p(x0 + w, y, 1, 1, l);
      if (w >= 3 && i > 2 && i < bl - 1) p(x0 + Math.floor(w / 2), y, 1, 1, r >= 3 && i % 3 === 0 ? RC[r] : dk);
    }
    if (b === 0) p(1, yG, 7, 1, dk);
    else if (b === 1) { p(1, yG, 7, 1, m); p(1, yG - 1, 1, 1, m); p(7, yG - 1, 1, 1, m); }
    else if (b === 2) { p(2, yG, 5, 1, m); p(3, yG - 1, 3, 1, dk); }
    else if (b === 3) { p(2, yG, 5, 1, m); p(6, yG + 1, 1, 2, m); p(2, yG + 1, 1, 1, m); }
    else { p(0, yG, 9, 1, m); p(0, yG - 1, 1, 1, l); p(8, yG - 1, 1, 1, l); }
    if (r >= 1) p(4, yG, 1, 1, tc);
    if (r >= 2) { p(1, yG, 1, 1, GOLD); p(7, yG, 1, 1, GOLD); }
    handle(yG + 1, 21);
    pommel(22);
    return;
  }
  if (k === "axe" || k === "greataxe") {
    const big = k === "greataxe";
    const top = big ? 1 : 4;
    const hh = big ? 8 : 6;
    const hw = big ? 4 : 3;
    const hy = top + 1;
    handle(top, 21);
    pommel(22);
    if (b === 1) p(4, top - 2, 1, 2, l);
    for (let i = 0; i < hh; i++) {
      const fr = (i + 0.5) / hh;
      let w = 1 + Math.round((hw - 1) * Math.sin(Math.PI * fr));
      if (a === 1) w = i < hh / 2 ? 2 : 2 + Math.round(((i - hh / 2) / (hh / 2)) * (hw - 1));
      else if (a === 3) w = hw;
      else if (a === 4) w = i < 2 || i >= hh - 2 ? hw + 1 : 2;
      const y = hy + i;
      p(5, y, w, 1, m);
      p(4 + w, y, 1, 1, b === 3 && i === Math.floor(hh / 2) ? DK : l);
      if (a === 2) { p(4 - w, y, w, 1, m); p(4 - w, y, 1, 1, l); }
    }
    if (a === 5) { p(1, hy + 2, 3, 1, dk); p(0, hy + 2, 1, 1, l); }
    if (b === 2) { p(5, hy + 1, 1, 1, r >= 2 ? GOLD : dk); p(5, hy + hh - 2, 1, 1, r >= 2 ? GOLD : dk); }
    if (b === 4 && a !== 2 && a !== 5) p(2, hy + 1, 2, 3, dk);
    if (r >= 1) p(4, hy, 1, hh, tc);
    gem(6, hy + Math.floor(hh / 2));
    return;
  }
  if (k === "mace" || k === "warhammer") {
    const big = k === "warhammer";
    const top = big ? 2 : 5;
    handle(top + 5, 21);
    pommel(22);
    if (!big) {
      if (a === 3) { p(2, top, 5, 5, m); p(2, top, 5, 1, l); }
      else if (a === 4) { p(4, top - 1, 1, 7, m); p(1, top + 2, 7, 1, m); p(3, top + 1, 3, 3, m); p(4, top + 1, 1, 1, l); }
      else { p(3, top, 3, 5, m); p(2, top + 1, 5, 3, m); p(3, top + 1, 1, 1, l); }
      if (a === 1) { p(1, top + 1, 1, 3, l); p(7, top + 1, 1, 3, l); p(4, top - 1, 1, 1, l); }
      if (a === 2) { p(4, top - 2, 1, 2, l); p(0, top + 2, 2, 1, l); p(7, top + 2, 2, 1, l); p(1, top, 1, 1, l); p(7, top, 1, 1, l); p(1, top + 4, 1, 1, l); p(7, top + 4, 1, 1, l); }
      if (a === 5) { p(2, top - 2, 1, 2, GOLD); p(4, top - 2, 1, 2, GOLD); p(6, top - 2, 1, 2, GOLD); }
    } else {
      if (a === 0) { p(1, top, 7, 5, m); p(1, top, 7, 1, l); }
      else if (a === 1) { p(2, top, 5, 5, m); p(0, top + 2, 2, 1, l); p(7, top + 1, 2, 3, m); p(2, top, 5, 1, l); }
      else if (a === 2) { p(0, top, 9, 4, m); p(0, top, 9, 1, l); p(4, top + 4, 1, 1, dk); }
      else if (a === 3) { p(1, top, 7, 5, m); p(1, top, 7, 1, l); for (let i = 0; i < 4; i++) p(1 + i * 2, top + 5, 1, 1, l); }
      else if (a === 4) { p(0, top - 1, 9, 6, m); p(0, top - 1, 9, 1, l); p(0, top + 4, 9, 1, dk); }
      else { p(4, top, 5, 2, m); p(0, top, 4, 2, m); p(0, top + 2, 1, 2, m); p(8, top + 2, 1, 2, l); p(3, top - 1, 3, 1, l); }
    }
    if (b === 1) p(2, top + 2, 5, 1, dk);
    else if (b === 2) { p(2, top + 1, 1, 1, r >= 2 ? GOLD : dk); p(6, top + 3, 1, 1, r >= 2 ? GOLD : dk); }
    else if (b === 3) p(4, top - 3, 1, 2, l);
    else if (b === 4) p(3, top + 5, 3, 1, l);
    if (r >= 1) p(4, top + 4, 1, 1, tc);
    gem(4, top + 2);
    return;
  }
  if (k === "spear") {
    handle(5, 21);
    pommel(22);
    if (a === 0 || a === 4) { p(4, 0, 1, 1, l); p(3, 1, 3, 3, m); p(4, 1, 1, 3, l); p(4, 4, 1, 1, m); if (a === 4) p(2, 5, 5, 1, dk); }
    else if (a === 1) { p(4, 0, 1, 1, m); p(3, 1, 3, 1, m); p(2, 2, 5, 1, m); p(4, 3, 1, 2, m); p(4, 1, 1, 1, l); }
    else if (a === 2) { p(2, 0, 1, 4, m); p(4, 0, 1, 4, l); p(6, 0, 1, 4, m); p(2, 4, 5, 1, m); }
    else if (a === 3) { p(4, 0, 1, 5, l); p(5, 1, 3, 3, m); p(8, 1, 1, 3, l); p(2, 2, 2, 1, m); }
    else { p(4, 0, 1, 5, l); p(3, 4, 3, 1, m); }
    if (b === 1) p(5, 5, 1, 3, "#c03030");
    else if (b === 2) p(3, 7, 3, 1, m);
    else if (b === 3) { p(3, 7, 3, 1, m); p(3, 10, 3, 1, m); }
    else if (b === 4) p(5, 5, 1, 3, tc);
    if (r >= 1) p(3, 5, 3, 1, tc);
    gem(4, 2);
    return;
  }
  if (k === "staff") {
    const gc = (it.wel && ELC[it.wel]) || GEMS[b];
    for (let y = 3; y <= 21; y++) p(4, y, 1, 1, y % 3 === 0 ? wrap : W1);
    p(3, 22, 3, 1, m);
    if (a === 0) { p(3, 0, 3, 3, gc); p(3, 0, 1, 1, "#ffffff"); p(3, 3, 3, 1, m); }
    else if (a === 1) { p(4, 1, 1, 2, W1); p(5, 0, 2, 1, W1); p(7, 1, 1, 2, W1); p(6, 3, 1, 1, W1); p(6, 2, 1, 1, gc); }
    else if (a === 2) { p(2, 0, 1, 4, W1); p(6, 0, 1, 4, W1); p(3, 3, 3, 1, W1); p(3, 1, 3, 2, gc); }
    else if (a === 3) { p(4, -1, 1, 1, gc); p(3, 0, 3, 3, gc); p(4, 0, 1, 3, "#ffffff"); p(3, 3, 3, 1, m); }
    else if (a === 4) { p(3, 0, 3, 3, BONE); p(3, 1, 1, 1, gc); p(5, 1, 1, 1, gc); p(4, 3, 1, 1, BONE); }
    else { p(3, 0, 3, 1, m); p(2, 1, 1, 3, m); p(6, 1, 1, 3, m); p(3, 4, 3, 1, m); p(4, 2, 1, 1, gc); }
    if (c >= 2) p(3, 7, 3, 1, m);
    if (r >= 1) p(4, 4, 1, 1, tc);
    if (r >= 2) p(3, 5, 3, 1, GOLD);
    return;
  }
  if (k === "bow") {
    const tall = a === 2;
    const y0 = tall ? 1 : 4, y1 = tall ? 23 : 22, mid = 13;
    const limb = c < 2 ? "#8a5a2a" : m;
    const sc = ["#e8e8e8", "#d0c090", "#c04040", "#60a0ff", "#80ff80"][b];
    if (BOWPULL > 0.5) {
      const half = (y1 - y0) / 2;
      for (let y = y0; y <= y1; y++) p(2 - Math.round(BOWPULL * (1 - Math.abs(y - mid) / half)), y, 1, 1, sc);
      const ax = 2 - Math.round(BOWPULL);
      p(ax, mid, 8 - ax, 1, "#c8a070"); p(8, mid - 1, 1, 3, "#d8d8e0"); p(9, mid, 1, 1, "#ffffff"); p(ax, mid - 1, 1, 1, "#e04040"); p(ax, mid + 1, 1, 1, "#e04040");
    } else p(2, y0, 1, y1 - y0 + 1, sc);
    for (let y = y0; y <= y1; y++) {
      const t2 = (y - mid) / ((y1 - y0) / 2);
      let x = 2 + Math.round(3 * (1 - t2 * t2));
      if (a === 1 && (y - y0 < 2 || y1 - y < 2)) x += 1;
      p(x, y, 1, 1, a === 3 && y % 3 === 0 ? (r >= 2 ? GOLD : dk) : limb);
      if (a === 5 && y % 4 === 0 && Math.abs(y - mid) > 2) p(x + 1, y, 1, 1, l);
    }
    if (a === 4) { p(1, y0 - 1, 3, 1, BONE); p(1, y1 + 1, 3, 1, BONE); }
    p(5, mid - 1, 1, 3, wrap === W2 ? W2 : wrap);
    if (r >= 1) { p(2, y0, 1, 1, tc); p(2, y1, 1, 1, tc); }
    gem(5, mid);
    return;
  }
  if (k === "crossbow") {
    p(4, 6, 1, 13, W1); p(3, 19, 3, 4, W1); p(3, 19, 1, 4, W2);
    p(4, 1, 1, 5, "#c0c0c0"); p(4, 0, 1, 1, l);
    if (a === 0) p(0, 6, 9, 1, m);
    else if (a === 1) { p(0, 8, 1, 1, m); p(1, 7, 2, 1, m); p(3, 6, 3, 1, m); p(6, 7, 2, 1, m); p(8, 8, 1, 1, m); }
    else if (a === 2) { p(0, 6, 9, 1, m); p(0, 5, 1, 1, m); p(8, 5, 1, 1, m); }
    else if (a === 3) { p(0, 6, 9, 2, m); p(0, 6, 9, 1, l); }
    else if (a === 4) { p(1, 6, 7, 1, m); p(1, 7, 1, 1, m); p(7, 7, 1, 1, m); }
    else { p(0, 6, 9, 1, m); p(0, 5, 1, 2, l); p(8, 5, 1, 2, l); }
    p(1, 8, 7, 1, "#d8d8d8");
    if (b === 1) p(4, 10, 1, 3, m);
    else if (b === 2) { p(3, 3, 3, 1, m); p(3, 2, 1, 1, m); p(5, 2, 1, 1, m); }
    else if (b === 3) { p(4, 12, 1, 1, GOLD); p(4, 15, 1, 1, GOLD); }
    else if (b === 4) p(5, 9, 1, 3, l);
    p(5, 16, 1, 2, dk);
    if (r >= 1) { p(0, 6, 1, 1, tc); p(8, 6, 1, 1, tc); }
    gem(4, 11);
    return;
  }
  if (k === "scythe") {
    handle(6, 21); pommel(22);
    p(4, 2, 1, 5, m); p(3, 1, 1, 2, m); p(2, 0, 2, 1, l); p(5, 1, 3, 1, m); p(6, 2, 3, 1, m); p(7, 3, 2, 1, l); p(8, 4, 1, 1, l);
    if (a === 1) { p(1, 0, 1, 1, l); p(5, 3, 1, 1, dk); }
    if (a === 2) p(5, 0, 3, 1, m);
    if (r >= 1) p(4, 6, 1, 1, tc);
    gem(7, 2);
    return;
  }
  if (k === "flail") {
    handle(10, 21); pommel(22);
    p(4, 9, 1, 1, "#c0c0c0"); p(5, 8, 1, 1, "#c0c0c0"); p(5, 7, 1, 1, "#c0c0c0"); p(6, 6, 1, 1, "#c0c0c0");
    p(5, 2, 5, 4, m); p(6, 1, 3, 6, m); p(6, 2, 1, 1, l); p(8, 4, 1, 1, l);
    if (a === 1 || a === 2) { p(5, 1, 1, 1, l); p(9, 1, 1, 1, l); p(5, 6, 1, 1, l); p(9, 6, 1, 1, l); }
    if (r >= 1) p(7, 3, 1, 1, tc);
    gem(7, 4);
    return;
  }
  if (k === "katana" || k === "nodachi") {
    const big = k === "nodachi";
    const bl = big ? 16 : 13;
    const hl = big ? 7 : 5;
    const yG = 21 - hl;
    const top = yG - bl;
    for (let i = 0; i < bl; i++) {
      const fr = i / bl;
      const ofs = Math.round((1 - fr) * (1 - fr) * (big ? 3 : 2));
      const w = i === 0 ? 1 : (big && i < 3 ? 2 : 2);
      const x0 = 4 - Math.floor(w / 2) + ofs;
      p(x0, top + i, w, 1, m);
      p(x0, top + i, 1, 1, l);
    }
    p(2, yG, 5, 1, dk); p(3, yG - 1, 3, 1, m);
    if (r >= 1) p(4, yG, 1, 1, tc);
    if (r >= 2) { p(2, yG, 1, 1, GOLD); p(6, yG, 1, 1, GOLD); }
    handle(yG + 1, 21); pommel(22);
    gem(4, top + 3);
    return;
  }
  if (k === "claws") {
    p(2, 16, 5, 3, W1); p(2, 17, 5, 1, wrap); p(3, 19, 3, 2, W1); pommel(21);
    p(2, 5, 1, 12, m); p(4, 3, 1, 14, m); p(6, 5, 1, 12, m);
    p(2, 5, 1, 1, l); p(4, 3, 1, 1, l); p(6, 5, 1, 1, l);
    if (a === 1) { p(1, 8, 1, 1, l); p(7, 8, 1, 1, l); }
    if (a === 2) { p(2, 4, 1, 1, l); p(6, 4, 1, 1, l); }
    if (r >= 1) p(4, 16, 1, 1, tc);
    gem(4, 10);
    return;
  }
  if (k === "handxbow") {
    p(4, 8, 1, 10, W1); p(3, 17, 3, 3, W1); p(3, 17, 1, 3, W2);
    p(1, 8, 7, 1, m); p(2, 7, 5, 1, m); p(1, 9, 7, 1, "#d8d8d8");
    p(4, 4, 1, 4, "#c0c0c0"); p(4, 3, 1, 1, l);
    if (r >= 1) { p(1, 8, 1, 1, tc); p(7, 8, 1, 1, tc); }
    gem(4, 12);
    return;
  }
  if (k === "wand") {
    const elc = (it.wel && ELC[it.wel]) || GEMS[b];
    const el2 = (it.wel && EL2[it.wel]) || "#ffffff";
    handle(10, 21); pommel(22);
    if (a === 0 || a === 3) { p(3, 2, 3, 3, elc); p(4, 1, 1, 1, el2); p(4, 3, 1, 1, "#ffffff"); p(3, 5, 3, 1, m); }
    else if (a === 1) { p(4, 1, 1, 3, W1); p(3, 0, 3, 1, W1); p(2, 1, 1, 2, W1); p(6, 1, 1, 2, W1); p(4, 2, 1, 1, elc); }
    else if (a === 2) { p(4, 0, 1, 1, el2); p(3, 1, 3, 1, elc); p(2, 2, 5, 2, elc); p(4, 4, 1, 1, m); }
    else if (a === 4) { p(4, 0, 1, 2, elc); p(2, 2, 5, 1, elc); p(4, 3, 1, 2, elc); p(3, 5, 3, 1, m); }
    else { p(3, 1, 3, 1, m); p(2, 2, 5, 3, elc); p(4, 3, 1, 1, el2); p(3, 5, 3, 1, m); }
    if (c >= 2) p(3, 8, 3, 1, m);
    if (r >= 1) p(4, 9, 1, 1, tc);
    if (r >= 2) p(3, 7, 3, 1, GOLD);
    return;
  }
  if (k === "beamsword") {
    const elc = (it.wel && ELC[it.wel]) || (r >= 1 ? RC[r] : l);
    const el2 = (it.wel && EL2[it.wel]) || "#ffffff";
    const yG = 16;
    const top = 0;
    for (let i = 0; i < 15; i++) {
      const y = top + i;
      const w = i === 0 ? 1 : (i < 3 ? 2 : 3);
      const x0 = 4 - Math.floor(w / 2);
      p(x0 - 1, y, w + 2, 1, elc);
      p(x0, y, w, 1, el2);
      p(4, y, 1, 1, "#ffffff");
    }
    p(2, yG, 5, 2, dk); p(3, yG, 3, 1, m); p(4, yG, 1, 1, elc);
    if (r >= 1) p(2, yG, 1, 1, tc);
    if (r >= 2) { p(2, yG, 1, 1, GOLD); p(6, yG, 1, 1, GOLD); }
    handle(yG + 2, 21); pommel(22);
    gem(4, 4);
    return;
  }
}

function drawItem(p: Pt, it: Item): void {
  const k = it.kind;
  if (k === "head") drawHelm(p, it, false);
  else if (k === "chest") drawChest(p, it);
  else if (k === "arms") { drawArm(p, it); drawArm(off(p, 6, 0), it); }
  else if (k === "legs") { drawLeg(p, it); drawLeg(off(p, 6, 0), it); }
  else if (k === "shield") drawShield(p, it);
  else if (k === "pet") drawPetSprite(p, it.pt ?? 0);
  else if (k === "gem") drawGemIcon(p, it);
  else drawWeapon(p, it);
}
function drawGemIcon(p: Pt, it: Item): void {
  const t = Math.max(0, Math.min(6, it.gt ?? 0));
  const c = GEMT[t].c;
  const k = "#1a1020", l = "#ffffff";
  p(4, 1, 4, 1, c); p(3, 2, 6, 1, c); p(2, 3, 8, 5, c); p(3, 8, 6, 1, c); p(4, 9, 4, 1, c);
  p(4, 3, 2, 2, l); p(3, 4, 1, 2, k);
  if (it.rar >= 7) { p(1, 1, 1, 1, "#ff60e0"); p(10, 1, 1, 1, "#40f0ff"); p(1, 9, 1, 1, GOLD); p(10, 9, 1, 1, "#ff60e0"); }
}
function iconBox(k: Kind): number[] {
  if (k === "head") return [-2, -3, 14, 13];
  if (k === "chest") return [-2, -1, 16, 10];
  if (k === "arms" || k === "legs") return [-1, 0, 11, 8];
  if (k === "shield") return [0, 0, 10, 12];
  if (k === "pet") return [0, 0, 16, 16];
  if (k === "gem") return [1, 1, 11, 10];
  return [0, -1, 9, 25];
}
const ICONC = new Map<number, HTMLCanvasElement>();
const ICONU = new Map<number, string>();
const SOCK_PIP_ICON = 9;
const SOCK_PIP_DROP = 5;
function socketPipLayout(n: number, area: number, pip: number, gap = 2): { x: number; y: number }[] {
  const k = Math.max(0, Math.min(4, n));
  const total = k * pip + Math.max(0, k - 1) * gap;
  const x0 = Math.max(1, Math.floor((area - total) / 2));
  const y = area - pip - 2;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < k; i++) out.push({ x: x0 + i * (pip + gap), y });
  return out;
}
function drawSocketPips(x: CanvasRenderingContext2D, ox: number, oy: number, it: Item, pip: number, gap = 2): void {
  if (!it || !it.sk || !it.sk.length) return;
  const n = Math.min(4, it.sk.length);
  for (let i = 0; i < n; i++) {
    const z = it.sk[i];
    const r = pip / 2;
    const cx = ox + r, cy = oy + r;
    x.beginPath();
    x.arc(cx, cy, Math.max(1.5, r - 1), 0, Math.PI * 2);
    x.fillStyle = z.g ? GEMT[z.g.typ].c : "rgba(8,8,12,0.15)";
    x.fill();
    x.lineWidth = 2;
    x.strokeStyle = "#000000";
    x.stroke();
    x.beginPath();
    x.arc(cx, cy, Math.max(1.2, r - 1.6), 0, Math.PI * 2);
    x.lineWidth = 1.6;
    x.strokeStyle = GEMT[z.c].c;
    x.stroke();
    ox += pip + gap;
  }
}
function iconCanvas(it: Item): HTMLCanvasElement {
  const got = ICONC.get(it.id);
  if (got) return got;
  const c = document.createElement("canvas");
  c.width = ICON; c.height = ICON;
  const x = c.getContext("2d");
  if (x) {
    const [bx, by, bw, bh] = iconBox(it.kind);
    const s = Math.max(1, Math.floor((ICON - 2) / Math.max(bw, bh)));
    const ox = Math.round((ICON - bw * s) / 2 - bx * s);
    const oy = Math.round((ICON - bh * s) / 2 - by * s);
    drawItem(painter(x, ox, oy, s, false, 0), it);
    if (it.sk && it.sk.length) {
      const layout = socketPipLayout(it.sk.length, ICON, SOCK_PIP_ICON, 2);
      if (layout.length) drawSocketPips(x, layout[0].x, layout[0].y, it, SOCK_PIP_ICON, 2);
    }
  }
  ICONC.set(it.id, c);
  return c;
}
function bustIcon(it: Item): void {
  ICONC.delete(it.id);
  ICONU.delete(it.id);
}
function iconURL(it: Item): string {
  const got = ICONU.get(it.id);
  if (got) return got;
  let u = "";
  try { u = iconCanvas(it).toDataURL(); } catch { u = ""; }
  ICONU.set(it.id, u);
  return u;
}
const MERCH_ICONU = new Map<string, string>();
function merchEmblemKind(sku: string): Kind {
  if (sku === "helmet") return "head";
  if (sku === "gloves") return "arms";
  if (sku === "chest") return "chest";
  if (sku === "boots") return "legs";
  if (sku === "pet") return "pet";
  if (sku === "gem") return "gem";
  // Category rows pass "oneHand" / "twoHand" until a subtype is picked; those are not Kind values.
  if (sku === "oneHand") return ONE_HAND_WEPS[0];
  if (sku === "twoHand") return TWO_HAND_WEPS[0];
  return sku as Kind;
}
function merchSampleItem(sku: string): Item {
  const kind = merchEmblemKind(sku);
  const i = allChestSkus().indexOf(sku);
  // Appearance dice must be present: every armor/weapon drawer reads MAT[it.d[3]]. An empty d
  // threw, merchIconURL cached "", and the 44x44 shop <img> rendered as a blank box.
  const it: Item = { id: -2000 - Math.max(0, i), seed: 1, kind, rar: 3, ilvl: 1, name: merchKindLabel(kind) || sku, atk: 0, def: 0, block: 0, bonus: {}, d: [0, 0, 0, 0], pt: kind === "pet" ? 0 : undefined, gt: kind === "gem" ? 0 : undefined };
  if (wepNeedsEl(kind)) it.wel = "fire";
  return it;
}
function drawMerchChestIcon(ctx: CanvasRenderingContext2D, sku: string, size: number, open = 0): void {
  ctx.clearRect(0, 0, size, size);
  const sc0 = size / 48;
  ctx.save();
  ctx.scale(sc0, sc0);
  const p: Pt = (x: number, y: number, w: number, h: number, c: string): void => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  p(6, 22, 36, 20, "#6a3a12");
  p(6, 22, 36, 3, "#3a2008");
  p(7, 24, 34, 16, "#a06020");
  p(6, 38, 36, 4, "#5a3010");
  p(21, 30, 6, 6, GOLD);
  p(22, 31, 4, 4, "#fff0a0");
  const ly = 14 - Math.round(open * 10);
  p(5, ly, 38, 10, "#8a4a18");
  p(5, ly, 38, 3, "#d4a04a");
  p(5, ly + 8, 38, 2, "#3a2008");
  try {
    const it = merchSampleItem(sku);
    const [bx, by, bw, bh] = iconBox(it.kind);
    const sc = Math.max(1, Math.floor(16 / Math.max(1, bw, bh)));
    const ox = Math.round(24 - (bx + bw / 2) * sc);
    const oy = Math.round((8 - open * 6) - (by + bh / 2) * sc);
    drawItem(painter(ctx, ox, oy, sc, false, 0), it);
    const two = !!(WI[it.kind as WT] && WI[it.kind as WT].two);
    if (two) {
      p(30, 34, 15, 8, "#1a1020");
      ctx.fillStyle = GOLD;
      ctx.font = "bold 7px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("2H", 37.5, 38);
    }
  } catch { /* chest body already drawn — keep a visible box if the emblem fails */ }
  ctx.restore();
}
function merchIconURL(sku: string, open = 0): string {
  const key = sku + ":" + (open >= 0.5 ? "1" : "0");
  const got = MERCH_ICONU.get(key);
  if (got) return got;
  let u = "";
  try {
    const c = document.createElement("canvas");
    c.width = 48; c.height = 48;
    const x = c.getContext("2d");
    if (x) drawMerchChestIcon(x, sku, 48, open);
    u = c.toDataURL();
  } catch { u = ""; }
  // Do not cache an empty URL; a first-paint failure would otherwise leave a permanent blank <img>.
  if (u) MERCH_ICONU.set(key, u);
  return u;
}

// ---------- hero animation ----------
// A Pose is purely visual: it never touches game state, so animations can't block input or turn logic.
interface Pose { la: number; lb: number; ua: number; ub: number; arm: number; bob: number; sway: number; wa: number; wx: number; wy: number; glow: number; pull: number }
const P0: Pose = { la: 0, lb: 0, ua: 0, ub: 0, arm: 0, bob: 0, sway: 0, wa: 0, wx: 0, wy: 0, glow: 0, pull: 0 };
let BOWPULL = 0;
const CAPE = ["#7a2236", "#a03448", "#4a1020"];
// Attack keyframes: [t, weaponAngle(deg), handX, handY, lunge(px), bob, glow, bowPull] - 7 keys each (rest, wind-up x2, strike, impact, follow-through, recover)
const ATK_KEYS: number[][][] = [
  [[0, 0, 0, 0, 0, 0, 0, 0], [0.14, -70, -2, -3, -1, 0, 0, 0], [0.3, -118, -3, -5, -2, -1, 0, 0], [0.42, 30, 2, -1, 3, 0, 0, 0], [0.52, 105, 3, 2, 4, 1, 0, 0], [0.72, 132, 2, 3, 2, 1, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]],
  [[0, 0, 0, 0, 0, 0, 0, 0], [0.14, 70, -2, 0, -1, 0, 0, 0], [0.3, 90, -5, 0, -2, 0, 0, 0], [0.42, 90, 3, 0, 3, 0, 0, 0], [0.52, 90, 7, 0, 5, 0, 0, 0], [0.72, 90, 4, 0, 2, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]],
  [[0, 0, 0, 0, 0, 0, 0, 0], [0.15, -45, -1, -5, -1, -1, 0, 0], [0.38, -120, -2, -8, -2, -2, 0, 0], [0.5, -10, 1, -5, 2, 0, 0, 0], [0.58, 100, 3, 2, 4, 2, 0, 0], [0.78, 112, 3, 3, 2, 2, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]],
  [[0, 0, 0, 0, 0, 0, 0, 0], [0.15, 0, 2, -1, 0, 0, 0, 2], [0.42, 0, 2, -1, -1, 0, 0, 6], [0.5, 0, 2, -1, -1, 0, 0, 0], [0.58, 0, 0, -1, -2, 0, 0, 0], [0.78, 0, 1, 0, -1, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]],
  [[0, 0, 0, 0, 0, 0, 0, 0], [0.15, -15, 0, -3, 0, -1, 0.3, 0], [0.4, -25, -1, -6, -1, -1, 1, 0], [0.5, 30, 3, -2, 2, 0, 1.3, 0], [0.6, 45, 4, -1, 3, 0, 0.7, 0], [0.8, 20, 2, 0, 1, 0, 0.2, 0], [1, 0, 0, 0, 0, 0, 0, 0]],
  [[0, 0, 0, 0, 0, 0, 0, 0], [0.15, 60, 0, 0, 0, 0, 0, 0], [0.4, 90, 1, -1, 0, 0, 0, 0], [0.48, 90, 1, -1, 0, 0, 0, 0], [0.56, 90, -2, -1, -3, 0, 0, 0], [0.78, 90, 0, -1, -1, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]],
  [[0, 0, 0, 0, 0, 0, 0, 0], [0.16, -80, -3, -4, -1, -1, 0, 0], [0.36, -150, -4, -6, -2, -1, 0, 0], [0.48, 20, 3, -2, 4, 0, 0, 0], [0.62, 130, 4, 3, 5, 1, 0, 0], [0.8, 150, 2, 4, 2, 1, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]],
  [[0, 0, 0, 0, 0, 0, 0, 0], [0.14, 40, -1, -2, 0, 0, 0, 0], [0.32, 160, 0, -3, 0, 0, 0, 0], [0.48, 280, 2, -1, 2, 0, 0, 0], [0.6, 400, 3, 1, 3, 1, 0, 0], [0.78, 430, 2, 2, 1, 1, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]],
  [[0, 0, 0, 0, 0, 0, 0, 0], [0.12, -50, -2, -3, -1, 0, 0, 0], [0.28, -110, -3, -4, -2, -1, 0, 0], [0.4, 25, 2, -1, 3, 0, 0, 0], [0.52, 95, 3, 2, 4, 1, 0, 0], [0.72, 110, 2, 2, 2, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]],
  [[0, 0, 0, 0, 0, 0, 0, 0], [0.16, -85, -3, -5, -1, -1, 0, 0], [0.36, -140, -4, -6, -2, -2, 0, 0], [0.48, 15, 3, -2, 4, 0, 0, 0], [0.62, 125, 4, 3, 5, 1, 0, 0], [0.8, 140, 2, 3, 2, 1, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]],
  [[0, 0, 0, 0, 0, 0, 0, 0], [0.1, -30, 0, -2, 0, 0, 0, 0], [0.25, 40, 2, 0, 2, 0, 0, 0], [0.4, -20, 1, -3, 1, 0, 0, 0], [0.55, 50, 3, 1, 3, 1, 0, 0], [0.75, 20, 1, 0, 1, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0]],
];
const ATK_DUR = [0.32, 0.26, 0.4, 0.36, 0.4, 0.34, 0.44, 0.38, 0.26, 0.4, 0.22];
const ATK_NAME = ["slash", "thrust", "smash", "draw", "cast", "crossbow", "scythe", "flail", "katana", "nodachi", "claws"];
// 0 slash, 1 thrust, 2 smash, 3 bow, 4 staff, 5 crossbow, 6 scythe sweep, 7 flail spin, 8 katana slash, 9 nodachi, 10 claw rake
function animKind(eq: Eq): number {
  const w = eq.rh ?? (eq.lh && eq.lh.kind !== "shield" ? eq.lh : null);
  if (!w) return 1;
  const k = w.kind;
  if (k === "sword" || k === "axe") return 0;
  if (k === "spear" || k === "dagger") return 1;
  if (k === "bow") return 3;
  if (k === "crossbow" || k === "handxbow") return 5;
  if (k === "staff" || k === "wand") return 4;
  if (k === "scythe") return 6;
  if (k === "flail") return 7;
  if (k === "katana") return 8;
  if (k === "nodachi") return 9;
  if (k === "claws") return 10;
  if (k === "beamsword") return 0;
  return 2;
}
function poseAt(kind: number, pr: number): number[] {
  const K = ATK_KEYS[kind] ?? ATK_KEYS[0];
  let i = 1;
  while (i < K.length - 1 && pr > K[i][0]) i++;
  const a = K[i - 1], b = K[i];
  let u = b[0] > a[0] ? Math.max(0, Math.min(1, (pr - a[0]) / (b[0] - a[0]))) : 1;
  u = u * u * (3 - 2 * u);
  const r: number[] = [];
  for (let j = 1; j < 8; j++) r.push(a[j] + (b[j] - a[j]) * u);
  r[0] = r[0] * Math.PI / 180;
  return r;
}
function drawWeaponAt(ctx: CanvasRenderingContext2D, it: Item, px: number, py: number, s: number, face: number, ang: number): void {
  ctx.save();
  ctx.translate(px, py);
  if (face < 0) ctx.scale(-1, 1);
  if (ang) ctx.rotate(ang);
  drawPrisPiece(painter(ctx, -4 * s, -WI[it.kind as WT].grip * s, s, false, 0), it, (q: Pt) => drawWeapon(q, it));
  ctx.restore();
}
// Returns [tipX, tipY, pivotX, pivotY, reach] of the main-hand weapon (screen px) for trails, or null.
function drawHero(ctx: CanvasRenderingContext2D, sx: number, sy: number, s: number, face: number, eq: Eq, swing: number, ps?: Pose, dir?: number): number[] | null {
  const q = ps ?? P0;
  const d = (typeof dir === "number" && dir >= 0 && dir <= 7) ? (dir | 0) : (face < 0 ? 6 : 2);
  const flip = (d === 5 || d === 6 || d === 7);
  const p = painter(ctx, sx, sy, s, flip, 24);
  const o = (dx: number, dy: number): Pt => off(p, dx, dy);
  const rh = eq.rh, lh = eq.lh;
  const b = Math.round(q.bob), cs = Math.max(-3, Math.min(1, Math.round(q.sway)));
  const back = d === 3 || d === 4 || d === 5;
  const side = d === 2 || d === 6;
  const qBack = d === 3 || d === 5;
  const qFront = d === 1 || d === 7;
  if (back) {
    p(5, 9 + b, 14, 8, CAPE[0]); p(6, 10 + b, 12, 6, CAPE[1]); p(4 + cs, 17 + b, 16, 3, CAPE[0]); p(5 + cs, 20 + b, 14, 1, CAPE[2]);
  } else if (side) {
    p(7, 10 + b, 8, 6, CAPE[0]); p(8, 11 + b, 2, 5, CAPE[1]); p(6 + cs, 16 + b, 8, 2, CAPE[0]); p(6 + cs, 18 + b, 7, 1, CAPE[2]);
  } else {
    p(5, 10 + b, 3, 6, CAPE[0]); p(5, 10 + b, 1, 5, CAPE[1]); p(4 + Math.min(0, cs + 1), 16 + b, 3, 2, CAPE[0]); p(4 + cs, 18 + b, 3, 1, CAPE[2]);
  }
  const wepGrip = (it: Item): number => (WI[it.kind as WT] && WI[it.kind as WT].grip) || 4;
  const drawOffWep = (behind: boolean): void => {
    if (lh && lh.kind !== "shield") {
      const ox = behind ? 16 : (side ? 7 : 2);
      drawPrisPiece(o(ox, 16 - wepGrip(lh) + b), lh, (q: Pt) => drawWeapon(q, lh));
    }
  };
  const drawSh = (): void => {
    if (lh && lh.kind === "shield") drawPrisPiece(o(Math.round(-q.arm * 0.5) + (back ? 12 : 0), 10 + b), lh, (q: Pt) => drawShield(q, lh));
  };
  const drawLegs = (): void => {
    const spread = side ? [10, 13] : back ? [8, 14] : [8, 13];
    spread.forEach((lx: number, i: number) => {
      const x = lx + Math.round(i ? q.lb : q.la), y = 15 - Math.round(i ? q.ub : q.ua);
      if (eq.legs) drawPrisPiece(o(x, y), eq.legs, (q: Pt) => drawLeg(q, eq.legs!));
      else { p(x, y, 3, 6, "#4a3a5a"); p(x, y + 6, 3, 2, "#2a1a10"); p(x + (side ? 0 : 3), y + 7, 1, 1, "#2a1a10"); }
    });
  };
  const arm = (x: number, y: number): void => { if (eq.arms) drawPrisPiece(o(x, y), eq.arms, (q: Pt) => drawArm(q, eq.arms!)); else { p(x, y, 3, 3, "#5a7a3a"); p(x, y + 3, 3, 4, SKIN); } };
  const drawBody = (): void => {
    if (side) {
      arm(8 - Math.round(q.arm * 0.5), 10 + b);
      if (eq.chest) drawPrisPiece(o(8, 9 + b), eq.chest, (q: Pt) => drawChest(q, eq.chest!));
      else { p(9, 9 + b, 7, 7, "#5a7a3a"); p(10, 10 + b, 2, 4, "#7a9a52"); p(9, 15 + b, 7, 1, "#3a2a1a"); }
    } else {
      arm((back ? 6 : 5) - Math.round(q.arm), 10 + b);
      if (eq.chest) drawPrisPiece(o(6, 9 + b), eq.chest, (q: Pt) => drawChest(q, eq.chest!));
      else { p(7, 9 + b, 10, 7, "#5a7a3a"); p(8, 10 + b, 2, 4, "#7a9a52"); p(7, 15 + b, 10, 1, "#3a2a1a"); p(11, 15 + b, 2, 1, "#a08040"); }
    }
  };
  const drawHead = (): void => {
    if (back) {
      if (!eq.head) { p(7, 2 + b, 10, 6, HAIR); p(8, 1 + b, 8, 3, HAIR); p(6, 4 + b, 1, 3, HAIR); p(17, 4 + b, 1, 3, HAIR); }
      p(8, 3 + b, 8, 6, SKIN);
      p(8, 2 + b, 8, 5, HAIR);
      if (qBack) p(15, 6 + b, 1, 2, SKIN);
      if (eq.head) drawPrisPiece(o(7, b), eq.head, (q: Pt) => drawHelm(q, eq.head!, false));
    } else if (side) {
      if (!eq.head) p(10, 2 + b, 1, 5, HAIR);
      p(10, 2 + b, 7, 8, SKIN); p(10, 1 + b, 7, 2, HAIR); p(10, 3 + b, 3, 4, HAIR);
      p(15, 5 + b, 1, 1, DK); p(16, 6 + b, 1, 1, "#c07060");
      if (eq.head) drawPrisPiece(o(9, b), eq.head, (q: Pt) => drawHelm(q, eq.head!, true));
    } else if (qFront) {
      if (!eq.head) p(7 + (cs < -1 ? -1 : 0), 2 + b, 1, cs < 0 ? 5 : 4, HAIR);
      p(8, 2 + b, 8, 8, SKIN); p(8, 1 + b, 8, 2, HAIR); p(8, 3 + b, 2, 4, HAIR);
      p(12, 5 + b, 1, 1, DK); p(15, 5 + b, 1, 1, DK); p(15, 8 + b, 2, 1, "#c07060");
      if (eq.head) drawPrisPiece(o(7, b), eq.head, (q: Pt) => drawHelm(q, eq.head!, true));
    } else {
      if (!eq.head) p(7 + (cs < -1 ? -1 : 0), 2 + b, 1, cs < 0 ? 5 : 4, HAIR);
      p(8, 2 + b, 8, 8, SKIN); p(8, 1 + b, 8, 2, HAIR); p(8, 3 + b, 2, 4, HAIR);
      p(13, 5 + b, 1, 1, DK); p(15, 5 + b, 1, 1, DK); p(14, 8 + b, 2, 1, "#c07060");
      if (eq.head) drawPrisPiece(o(7, b), eq.head, (q: Pt) => drawHelm(q, eq.head!, true));
    }
  };
  const drawNearArm = (): void => {
    const ax = side ? 15 : 16;
    arm(ax + Math.max(-3, Math.min(4, Math.round(q.arm + q.wx * 0.6))), 10 + b + Math.max(-5, Math.min(2, Math.round(q.wy * 0.6))));
  };
  let tip: number[] | null = null;
  const drawMainWep = (): void => {
    if (!rh) return;
    const wi = WI[rh.kind as WT];
    const gr = wi ? wi.grip : 4;
    const wx = Math.round(q.wx), wy = Math.round(q.wy);
    const hx = (side ? 16 : 17) + swing + wx;
    const fsign = flip ? -1 : 1;
    const px = flip ? sx + (24 - hx) * s : sx + hx * s, py = sy + (16 + b + wy) * s;
    if (!q.wa && q.pull < 0.5) drawPrisPiece(o((back ? 8 : 13) + swing + wx, 16 - gr + b + wy), rh, (q2: Pt) => drawWeapon(q2, rh));
    else { BOWPULL = q.pull; drawWeaponAt(ctx, rh, px, py, s, fsign, q.wa); BOWPULL = 0; }
    const L = (gr - 1) * s;
    tip = [px + fsign * Math.sin(q.wa) * L, py - Math.cos(q.wa) * L, px, py, L];
    if (q.glow > 0.05) {
      const gc = rh.rar >= 1 ? RC[rh.rar] : "#c080ff";
      ctx.globalAlpha = Math.min(0.75, q.glow * 0.55); ctx.fillStyle = gc;
      ctx.beginPath(); ctx.arc(tip[0], tip[1], (2 + q.glow * 3) * s, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = Math.min(1, q.glow); ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(tip[0], tip[1], (0.8 + q.glow) * s, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
  };
  if (back) {
    drawOffWep(true); drawMainWep(); drawSh();
    drawLegs(); drawBody(); drawHead(); drawNearArm();
  } else if (side) {
    drawOffWep(true);
    if (lh && lh.kind === "shield") drawSh();
    drawLegs(); drawBody(); drawHead(); drawNearArm(); drawMainWep();
  } else {
    drawOffWep(false);
    drawLegs(); drawBody(); drawHead(); drawNearArm(); drawMainWep();
    drawSh();
  }
  return tip;
}
// Render-side animation state (never saved, never read by game logic).
const HA = { h: null as Hero | null, as: 0, t0: -99, dur: 0.3, kind: 0, adx: 1, ady: 0, last: -99, wph: 0, mv: 0, trail: [] as number[][] };
function heroAnimTick(g: Game, dt: number, moved: number): void {
  const h = g.hero;
  if (HA.h !== h) { HA.h = h; HA.as = h.as ?? 0; HA.t0 = -99; HA.last = -99; HA.trail = []; HA.wph = 0; HA.mv = 0; }
  const as = h.as ?? 0;
  if (as !== HA.as) {
    HA.as = as;
    const gap = g.time - HA.last;
    HA.last = g.time;
    HA.kind = animKind(g.eq);
    // fit the swing inside the current attack rhythm so fast auto-attacks still show the strike
    HA.dur = Math.max(0.16, Math.min(ATK_DUR[HA.kind], gap * 0.92));
    HA.t0 = g.time; HA.adx = h.bdx; HA.ady = h.bdy; HA.trail = [];
  }
  if (moved > 0.0005) {
    HA.mv = Math.min(1, HA.mv + dt * 12);
    const before = Math.floor(HA.wph * 2);
    HA.wph += moved * 0.5;
    if (Math.floor(HA.wph * 2) !== before) burst(g, h.ax * TS + 12 + (Math.random() - 0.5) * 6, h.ay * TS + 22, 3, ["#8a7c6c", "#6a5e50", "#b0a090"], 14, -12);
  } else HA.mv = Math.max(0, HA.mv - dt * 6);
}
// Current pose: 8-frame walk cycle, idle breathing, or a weapon-specific attack.
function heroPose(g: Game, t: number): { q: Pose; lunge: number; pr: number } {
  const q: Pose = { ...P0 };
  const mv = HA.h === g.hero ? HA.mv : 0;
  const a = (Math.floor(HA.wph * 8) % 8) / 8 * Math.PI * 2;
  const hd = heroDir(g.hero);
  const sideStep = hd === 2 || hd === 6;
  const frontStep = hd === 0 || hd === 1 || hd === 7;
  if (mv > 0.01) {
    const str = sideStep ? 2.05 : frontStep ? 1.55 : 1.35;
    q.la = Math.sin(a) * str * mv; q.lb = -q.la;
    q.ua = Math.max(0, Math.cos(a)) * (sideStep ? 1.15 : 1.5) * mv; q.ub = Math.max(0, -Math.cos(a)) * (sideStep ? 1.15 : 1.5) * mv;
    q.arm = -q.la * (sideStep ? 1.05 : 0.9);
    q.bob = Math.abs(Math.sin(a)) < 0.5 ? -mv : 0;
  } else q.bob = Math.sin(t * 2.4) > 0.45 ? -1 : 0;
  q.sway = mv * (-2 + Math.sin(a * 2) * 0.7) + (1 - mv) * Math.sin(t * 1.3) * 0.8;
  let lunge = 0, pr = -1;
  if (HA.h === g.hero) {
    const r = (g.time - HA.t0) / HA.dur;
    if (r >= 0 && r < 1) {
      pr = r;
      const k = poseAt(HA.kind, r);
      q.wa = k[0]; q.wx = k[1]; q.wy = k[2]; lunge = k[3]; q.bob = k[4] + (mv > 0.5 ? q.bob : 0); q.glow = k[5]; q.pull = HA.kind === 3 ? k[6] : 0;
      q.arm *= 0.3;
    }
  }
  return { q, lunge, pr };
}
// Motion trails, impact flash and cast/bow effects, drawn over the hero.
function drawAtkFx(ctx: CanvasRenderingContext2D, g: Game, tip: number[] | null, pr: number, hsx: number, hsy: number, camX: number, camY: number): void {
  if (pr < 0) return;
  const K = ATK_KEYS[HA.kind];
  const face = g.hero.face;
  const w = g.eq.rh;
  const col = w && w.rar >= 1 ? RC[w.rar] : "#e8f0ff";
  const s0 = K[2][0], s1 = K[5][0], imp = K[4][0];
  if (tip && pr >= s0 - 0.02 && pr <= s1) {
    HA.trail.push([tip[0] - hsx, tip[1] - hsy]);
    if (HA.trail.length > 7) HA.trail.shift();
  }
  const fade = pr <= s1 ? 1 : Math.max(0, 1 - (pr - s1) / 0.15);
  if (fade > 0 && HA.trail.length > 1 && (HA.kind <= 2 || HA.kind === 4)) {
    ctx.lineCap = "round";
    for (let i = 1; i < HA.trail.length; i++) {
      const a0 = HA.trail[i - 1], a1 = HA.trail[i];
      ctx.globalAlpha = fade * (i / HA.trail.length) * 0.8; ctx.strokeStyle = i === HA.trail.length - 1 ? "#ffffff" : col;
      ctx.lineWidth = HA.kind === 2 ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(a0[0] + hsx, a0[1] + hsy); ctx.lineTo(a1[0] + hsx, a1[1] + hsy); ctx.stroke();
    }
    ctx.lineCap = "butt";
  }
  // sweeping arc for slash / smash
  if (tip && (HA.kind === 0 || HA.kind === 2 || HA.kind === 6 || HA.kind === 7 || HA.kind === 8 || HA.kind === 9) && pr >= s0 && pr <= s1 + 0.12) {
    const wa0 = K[2][1] * Math.PI / 180, wa1 = poseAt(HA.kind, Math.min(pr, s1))[0];
    const ang = (wa: number): number => (face < 0 ? -Math.PI / 2 - wa : wa - Math.PI / 2);
    ctx.globalAlpha = 0.35 * fade; ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(tip[2], tip[3], tip[4] * 0.8, ang(wa0), ang(wa1), face < 0); ctx.stroke();
    ctx.globalAlpha = 0.6 * fade; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(tip[2], tip[3], tip[4], ang(wa0), ang(wa1), face < 0); ctx.stroke();
  }
  // thrust speed lines
  if (tip && HA.kind === 1 && pr >= K[3][0] - 0.05 && pr <= s1) {
    ctx.globalAlpha = 0.6 * fade; ctx.fillStyle = col;
    for (const dy of [-2, 0, 2]) ctx.fillRect(Math.round(tip[0] - face * (dy === 0 ? 10 : 6) - (face < 0 ? 0 : 0)), Math.round(tip[1] + dy), dy === 0 ? 10 : 6, 1);
  }
  // impact flash on the target tile (melee)
  if ((HA.kind <= 2 || HA.kind === 6 || HA.kind === 7 || HA.kind === 8 || HA.kind === 9 || HA.kind === 10) && Math.abs(pr - imp) < 0.1) {
    const k = 1 - Math.abs(pr - imp) / 0.1;
    const tx = Math.round((g.hero.ax + HA.adx) * TS - camX + 12), ty = Math.round((g.hero.ay + HA.ady) * TS - camY + 12);
    ctx.globalAlpha = k; ctx.fillStyle = "#ffffff";
    const r = Math.round(2 + k * 5);
    ctx.fillRect(tx - r, ty, r * 2 + 1, 1); ctx.fillRect(tx, ty - r, 1, r * 2 + 1); ctx.fillRect(tx - 1, ty - 1, 3, 3);
    ctx.globalAlpha = k * 0.7; ctx.strokeStyle = HA.kind === 2 ? GOLD : col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(tx, ty, 3 + (1 - k) * (HA.kind === 2 ? 12 : 8), 0, 6.2832); ctx.stroke();
  }
  // bow / crossbow release flash, staff release burst + rune circle
  if ((HA.kind === 3 || HA.kind === 5) && tip && Math.abs(pr - K[3][0]) < 0.07) {
    ctx.globalAlpha = 0.9; ctx.fillStyle = "#fff8d0";
    const fx = HA.kind === 5 ? tip[0] : tip[2] + face * 6;
    ctx.fillRect(Math.round(fx) - 1, Math.round(HA.kind === 5 ? tip[1] : tip[3] - 2) - 1, 3, 3);
  }
  if (HA.kind === 4) {
    const gl = poseAt(4, pr)[5];
    if (gl > 0.2) { ctx.globalAlpha = Math.min(0.6, gl * 0.45); ctx.strokeStyle = col === "#e8f0ff" ? "#c080ff" : col; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(hsx + 12, hsy + 22, 10, 3, 0, 0, 6.2832); ctx.stroke(); }
    if (tip && Math.abs(pr - K[3][0]) < 0.1) { const k = 1 - Math.abs(pr - K[3][0]) / 0.1; ctx.globalAlpha = k * 0.8; ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.arc(tip[0], tip[1], 3 + (1 - k) * 9, 0, 6.2832); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}

function drawEnemy(p: Pt, f: number, c: string[], t: number): void {
  const [m, l, d, e] = c;
  const a = Math.floor(t * 4) % 2;
  const K = "#140c10", Wt = "#f4f0e8";
  switch (f) {
    case 0: p(2, 5 + a, 8, 6 - a, m); p(1, 7, 10, 4, m); p(3, 4 + a, 6, 1, m); p(3, 6 + a, 2, 1, l); p(1, 10, 10, 1, d); p(4, 7, 1, 2, K); p(7, 7, 1, 2, K); p(4, 7, 1, 1, e); p(7, 7, 1, 1, e); break;
    case 1: p(5, 4, 2, 4, m); p(5, 3, 1, 1, m); p(6, 3, 1, 1, m); p(5, 5, 1, 1, e); p(6, 5, 1, 1, e);
      if (a) { p(1, 2, 4, 2, d); p(7, 2, 4, 2, d); p(0, 1, 2, 1, d); p(10, 1, 2, 1, d); p(2, 4, 2, 1, l); p(8, 4, 2, 1, l); }
      else { p(1, 5, 4, 2, d); p(7, 5, 4, 2, d); p(0, 7, 2, 1, d); p(10, 7, 2, 1, d); p(2, 5, 2, 1, l); p(8, 5, 2, 1, l); }
      break;
    case 2: p(2, 7, 7, 3, m); p(2, 7, 7, 1, l); p(8, 6, 3, 3, m); p(9, 5, 1, 1, l); p(10, 7, 1, 1, e); p(11, 8, 1, 1, "#e8a0a0"); p(0, 8, 2, 1, "#e8a0a0"); p(0, 7 + a, 1, 1, "#e8a0a0"); p(3, 10, 1, 1, d); p(7, 10, 1, 1, d); break;
    case 3: p(4, 0, 4, 4, l); p(4, 1, 1, 1, K); p(6, 1, 1, 1, K); p(4, 1, 1, 1, e); p(5, 4, 2, 1, m); p(5, 5, 2, 4, m); p(4, 5, 4, 1, l); p(4, 7, 4, 1, l); p(3, 5, 1, 4, m); p(8, 5, 1, 4, m); p(4, 9, 4, 1, m); p(4, 10, 1, 2, m); p(7, 10, 1, 2, m); p(10, 2 + a, 1, 6, "#c0c8d0"); p(9, 7 + a, 3, 1, d); break;
    case 4: p(4, 2, 4, 4, m); p(2, 3, 2, 1, m); p(8, 3, 2, 1, m); p(5, 3, 1, 1, e); p(7, 3, 1, 1, e); p(5, 5, 2, 1, d); p(4, 6, 4, 4, d); p(3, 6, 1, 3, m); p(8, 6, 1, 3, m); p(4, 10, 1, 2, d); p(7, 10, 1, 2, d); p(9, 4 + a, 1, 4, "#c0c0c0"); break;
    case 5: p(3, 5, 7, 3, d); p(4, 4, 5, 4, m); p(5, 4, 2, 1, l); p(5, 5, 1, 1, e); p(7, 5, 1, 1, e);
      for (let i = 0; i < 4; i++) { const yy = 3 + i * 2 - (a && i % 2 ? 1 : 0); p(0, yy, 3, 1, d); p(10, yy, 2, 1, d); p(0, yy + 1, 1, 1, d); p(11, yy + 1, 1, 1, d); }
      break;
    case 6: p(3, 1, 4, 4, m); p(5, 2, 1, 1, e); p(3, 1, 4, 1, d); p(3, 5, 4, 5, d); p(4, 6, 1, 2, m); p(7, 5 + a, 4, 1, m); p(7, 7, 4, 1, m); p(3, 10, 1, 2, d); p(6, 10, 1, 2, d); break;
    case 7: p(3, 1, 6, 4, m); p(4, 4, 1, 1, Wt); p(7, 4, 1, 1, Wt); p(4, 2, 1, 1, e); p(7, 2, 1, 1, e); p(2, 5, 8, 5, d); p(3, 6, 6, 1, l); p(1, 5, 1, 4, m); p(10, 5, 1, 4, m); p(3, 10, 2, 2, d); p(7, 10, 2, 2, d); p(11, 1 + a, 1, 8, "#6a4424"); p(9, 1 + a, 2, 3, "#c0c0c0"); break;
    case 8: p(5, 3, 4, 3, m); p(9, 4, 2, 2, m); p(7, 4, 1, 1, e); p(4, 6, 4, 4, m); p(5, 7, 2, 3, l); p(1, 8, 3, 1, m); p(0, 7 + a, 1, 1, m); p(4, 10, 1, 2, d); p(7, 10, 1, 2, d); p(10, 1, 1, 9, "#8a6a4a"); p(10, 0, 1, 1, "#d0d0d0"); break;
    case 9: p(3, 1, 6, 4, d); p(2, 3, 8, 6, d); p(2, 2, 8, 1, m); p(4, 3, 4, 3, K); p(5, 4, 1, 1, e); p(7, 4, 1, 1, e); p(2, 9, 2, 2 - a, d); p(5, 9, 2, 1 + a, d); p(8, 9, 2, 2 - a, d); p(1, 5, 1, 2, l); p(10, 5, 1, 2, l); break;
    case 10: p(4, 0, 4, 3, m); p(5, 1, 2, 1, e); p(1, 3, 10, 5, m); p(2, 3, 3, 1, l); p(6, 4, 1, 2, d); p(3, 6, 1, 1, d); p(0, 4, 2, 6, d); p(10, 4, 2, 6, d); p(3, 8, 2, 4, d); p(7, 8, 2, 4, d); break;
    case 11: p(3, 0, 1, 2, Wt); p(8, 0, 1, 2, Wt); p(3, 2, 6, 3, m); p(4, 3, 1, 1, e); p(7, 3, 1, 1, e); p(0, 3 - a, 3, 4, d); p(9, 3 - a, 3, 4, d); p(4, 5, 4, 4, m); p(5, 6, 2, 2, l); p(4, 9, 1, 3, d); p(7, 9, 1, 3, d); p(9, 9, 2, 1, m); p(11, 8, 1, 1, m); break;
    case 12: p(4, 0, 4, 2, m); p(3, 2, 6, 9, m); p(4, 2, 4, 3, K); p(5, 3, 1, 1, e); p(7, 3, 1, 1, e); p(5, 6, 2, 2, l); p(3, 10, 6, 1, d); p(10, 1, 1, 10, "#5a3a2a"); p(9, 0, 3, 2, a ? e : l); break;
    case 13: p(1, 5, 10, 6, m); p(1, 2 - a, 10, 3, m); p(1, 4 - a, 10, 2 + a, K); p(2, 4 - a, 1, 1, Wt); p(4, 4 - a, 1, 1, Wt); p(7, 4 - a, 1, 1, Wt); p(9, 4 - a, 1, 1, Wt); p(4, 5, 3, 1, "#e04060"); p(1, 8, 10, 1, d); p(5, 8, 2, 2, GOLD); p(3, 2 - a, 1, 1, e); p(8, 2 - a, 1, 1, e); break;
    case 14: p(6, 1, 4, 3, m); p(10, 2, 2, 2, m); p(6, 0, 1, 1, l); p(8, 2, 1, 1, e); p(3, 4, 6, 5, m); p(4, 5, 3, 3, l); p(0, 2 + a, 4, 3, d); p(0, 9, 3, 1, m); p(4, 9, 1, 3, d); p(7, 9, 1, 3, d); break;
    case 15: p(2, 3, 8, 7, m); p(6, 3, 1, 7, d); p(3, 4, 2, 2, l); p(9, 5, 2, 3, d); p(11, 3, 1, 3, l); p(10, 6, 1, 1, e); p(1, 5 + a, 1, 1, d); p(1, 8 - a, 1, 1, d); p(3, 10, 1, 1, d); p(7, 10, 1, 1, d); break;
    case 16: p(2, 0, 8, 1, m); p(1, 1, 10, 4, m); p(3, 2, 2, 1, l); p(7, 1, 2, 2, l); p(2, 4, 8, 1, d); p(4, 5, 4, 6, BONE); p(5, 6, 1, 1, K); p(7, 6, 1, 1, K); p(4, 11, 1, 1, d); p(7, 11, 1, 1, d); p(3, 7 + a, 1, 2, BONE); p(8, 7 - a, 1, 2, BONE); break;
    case 17: p(3, 2, 6, 6, Wt); p(2, 3, 8, 4, Wt); p(5, 4, 3, 3, m); p(6, 5, 1, 1, K); p(3, 1, 6, 1, d); p(2, 4, 1, 1, "#e04050"); p(9, 5, 1, 1, "#e04050"); p(3, 8, 1, 3 - a, d); p(6, 8, 1, 2 + a, d); p(8, 8, 1, 3 - a, d); break;
    case 18: p(2, 9, 8, 2, m); p(1, 7, 2, 2, m); p(2, 6, 6, 2, m); p(7, 4, 2, 2, m); p(6, 2, 4, 3, m); p(7, 2, 2, 1, l); p(8, 3, 1, 1, e); p(3, 10, 6, 1, l); p(3, 7, 4, 1, l); if (a) p(10, 4, 2, 1, "#e04060"); break;
    case 19: p(4, 0, 4, 4, m); p(5, 2, 3, 1, e); p(5, -1, 2, 1, e); p(3, 4, 6, 5, m); p(4, 5, 2, 3, l); p(1, 4, 3, 5, d); p(2, 5, 1, 3, l); p(10, 0 + a, 1, 8, l); p(9, 7 + a, 3, 1, d); p(4, 9, 1, 3, d); p(7, 9, 1, 3, d); break;
    case 20: p(4, 3, 4, 6, m); p(3, 5, 6, 3, m); p(4 + a, 1, 2, 2, l); p(6 - a, 0, 1, 2, l); p(2, 4 - a, 1, 2, l); p(9, 4 + a, 1, 2, l); p(5, 5, 1, 1, Wt); p(7, 5, 1, 1, Wt); p(3, 9, 6, 2, d); p(4 + a, 11, 3, 1, d); break;
    case 21: p(4, 0, 4, 1, GOLD); p(4, -1, 1, 1, GOLD); p(7, -1, 1, 1, GOLD); p(4, 1, 4, 3, BONE); p(4, 2, 1, 1, e); p(6, 2, 1, 1, e); p(3, 4, 6, 7, m); p(5, 4, 2, 7, l); p(3, 10, 6, 1, d); p(2, 6, 1, 1, BONE); p(10, 0, 1, 11, d); p(9, -1, 3, 2, a ? e : Wt); break;
    default: p(1, 2, 9, 7, m); p(2, 3, 5, 2, l); p(7, 1, 4, 3, m); p(9, 2, 1, 1, e); p(10, 3, 2, 1, d); p(0, 4, 2, 7 - a, d); p(9, 5, 2, 6 + a, d); p(3, 9, 2, 3, d); p(6, 9, 2, 3, d); break;
  }
}

// Rare boss: sprite rendered once per frame to a small offscreen canvas, then drawn with a pulsing purple outline + glow
// (one blurred draw per frame, so it stays cheap on phones).
let BOSS_CV: HTMLCanvasElement | null = null, BOSS_TINT: HTMLCanvasElement | null = null;
const BOSS_GLOW = "#b040ff";
function drawBossGlow(ctx: CanvasRenderingContext2D, e: En, sx: number, sy: number, flip: boolean, t: number): void {
  const W = 48, O = 6;
  try {
    if (!BOSS_CV) { BOSS_CV = document.createElement("canvas"); BOSS_CV.width = W; BOSS_CV.height = W; }
    if (!BOSS_TINT) { BOSS_TINT = document.createElement("canvas"); BOSS_TINT.width = W; BOSS_TINT.height = W; }
    const bc = BOSS_CV.getContext("2d"), tc = BOSS_TINT.getContext("2d");
    if (!bc || !tc) throw new Error("no ctx");
    bc.clearRect(0, 0, W, W);
    drawEnemy(painter(bc, O, O, 3, flip, 12), e.f, e.pal, t + e.id);
    tc.globalCompositeOperation = "source-over"; tc.clearRect(0, 0, W, W); tc.drawImage(BOSS_CV, 0, 0);
    tc.globalCompositeOperation = "source-in"; tc.fillStyle = BOSS_GLOW; tc.fillRect(0, 0, W, W); tc.globalCompositeOperation = "source-over";
    const hu = !!e.hunt;
    const pulse = 0.5 + 0.5 * Math.sin(t * (hu ? 7 : 4));
    const x0 = sx - 6 - O, y0 = sy - 12 - O;
    if (hu) { // shadowy afterimages trailing behind the Hunter
      ctx.globalAlpha = 0.22; ctx.drawImage(BOSS_TINT, x0 - (flip ? -7 : 7), y0 + 1);
      ctx.globalAlpha = 0.12; ctx.drawImage(BOSS_TINT, x0 - (flip ? -13 : 13), y0 + 2);
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.shadowColor = hu ? "#e040ff" : BOSS_GLOW; ctx.shadowBlur = hu ? 8 + pulse * 12 : 5 + pulse * 9;
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    ctx.drawImage(BOSS_TINT, x0 - 2, y0); ctx.shadowBlur = 0;
    ctx.drawImage(BOSS_TINT, x0 + 2, y0); ctx.drawImage(BOSS_TINT, x0, y0 - 2); ctx.drawImage(BOSS_TINT, x0, y0 + 2);
    ctx.restore();
    ctx.drawImage(BOSS_CV, x0, y0);
    if (hu) { // glaring eyes
      ctx.globalAlpha = 0.6 + 0.4 * pulse; ctx.fillStyle = "#ff60ff";
      ctx.fillRect(sx + 6 + Math.round(Math.random() * 12), sy - 10 + Math.round(Math.random() * 6), 1, 1);
      ctx.globalAlpha = 1;
    }
  } catch {
    drawEnemy(painter(ctx, sx - 6, sy - 12, 3, flip, 12), e.f, e.pal, t + e.id);
  }
}
// Sprite-shaped (not box) outlines: render the enemy once to a reused offscreen
// canvas, tint it, and stamp it at 1px offsets. Cheap on phones (no shadowBlur).
let SPR_CV: HTMLCanvasElement | null = null, SPR_TINT: HTMLCanvasElement | null = null;
const SPR_W = 40, SPR_PAD = 8;
function sprPrepare(e: En, flip: boolean, t: number, col: string): [HTMLCanvasElement, HTMLCanvasElement] | null {
  try {
    if (!SPR_CV) { SPR_CV = document.createElement("canvas"); SPR_CV.width = SPR_W; SPR_CV.height = SPR_W; }
    if (!SPR_TINT) { SPR_TINT = document.createElement("canvas"); SPR_TINT.width = SPR_W; SPR_TINT.height = SPR_W; }
    const bc = SPR_CV.getContext("2d"), tc = SPR_TINT.getContext("2d");
    if (!bc || !tc) return null;
    bc.clearRect(0, 0, SPR_W, SPR_W);
    drawEnemy(painter(bc, SPR_PAD, SPR_PAD, 2, flip, 12), e.f, e.pal, t + e.id);
    tc.globalCompositeOperation = "source-over"; tc.clearRect(0, 0, SPR_W, SPR_W); tc.drawImage(SPR_CV, 0, 0);
    tc.globalCompositeOperation = "source-in"; tc.fillStyle = col; tc.fillRect(0, 0, SPR_W, SPR_W); tc.globalCompositeOperation = "source-over";
    return [SPR_CV, SPR_TINT];
  } catch { return null; }
}
function sprOutline(ctx: CanvasRenderingContext2D, e: En, sx: number, sy: number, flip: boolean, t: number, col: string, alpha: number, thick: number): void {
  const pair = sprPrepare(e, flip, t, col);
  if (!pair) { drawEnemy(painter(ctx, sx, sy, 2, flip, 12), e.f, e.pal, t + e.id); return; }
  const [cv, tint] = pair, x0 = sx - SPR_PAD, y0 = sy - SPR_PAD;
  ctx.save();
  ctx.globalAlpha = alpha;
  const offs: number[][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  if (thick > 1) offs.push([-2, 0], [2, 0], [0, -2], [0, 2]);
  for (const [dx, dy] of offs) ctx.drawImage(tint, x0 + dx, y0 + dy);
  ctx.restore();
  ctx.drawImage(cv, x0, y0);
}
function sprShimmer(ctx: CanvasRenderingContext2D, e: En, sx: number, sy: number, flip: boolean, t: number, col: string, alpha: number): void {
  const pair = sprPrepare(e, flip, t, col);
  if (!pair) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(pair[1], sx - SPR_PAD, sy - SPR_PAD);
  ctx.restore();
}
const CHN = ["Normal Chest", "Magic Chest", "Rare Chest", "Legendary Chest", "Mythic Chest"];
const CHW = [60, 25, 10, 4, 1];
const CHBODY = [["#8a8a92", "#c4c4cc", "#4a4a52", "#6a6a72"], ["#2a5a9a", "#4aa0ff", "#1a3a6a", "#7ec0ff"], ["#a06a30", "#ffd840", "#6a4418", "#ffe898"], ["#a05010", "#ff8c1a", "#6a2a08", "#ffc070"], ["#6a30a0", "#c060ff", "#3a1860", "#e0a0ff"]];
function chestW(d: number, vault: boolean): number[] {
  const t = Math.max(0, d - 1);
  if (vault) return [22, 32, 26, 14, 6];
  return [Math.max(32, 62 - t * 0.2), 23, 9 + t * 0.06, 3.2 + t * 0.03, 0.7 + t * 0.015];
}
function rollChestRar(d: number, vault: boolean): number {
  const w = chestW(d, vault);
  let tot = 0; for (const v of w) tot += v;
  let r = R() * tot;
  for (let i = 0; i < 5; i++) { r -= w[i]; if (r <= 0) return i; }
  return 4;
}
function packChest(c: Chest): Chest {
  const o: Chest = { x: c.x, y: c.y, open: !!c.open, rar: Math.max(0, Math.min(4, Math.floor(Number(c.rar) || 0))) };
  if (c.starter) o.starter = true;
  if (c.starter && !o.open && Array.isArray(c.items)) {
    o.items = c.items.map((it: unknown) => validItem(it)).filter((it: Item | null): it is Item => !!it);
  }
  return o;
}
function chestLoot(rar: number, vlt: boolean, d: number): { n: number; f: number; min: number; ilvl: number; goldMul: number } {
  const n = [1, 1, 2, 2, 3][rar] + (R() < [0, 0.4, 0, 0.5, 0.4][rar] ? 1 : 0);
  return { n, f: [1.0, 1.06, 1.12, 1.2, 1.3][rar], min: [0, 0, 0, 0, 1][rar], ilvl: d + [0, 0, 1, 2, 3][rar] + (vlt ? 1 : 0), goldMul: [1, 1.5, 2.2, 3.5, 6][rar] };
}
function drawLootChest(p: Pt, open: boolean, rar: number = 0): void {
  const cr = Math.max(0, Math.min(4, rar | 0));
  const [body, trim, dk, lite] = CHBODY[cr];
  if (open) { p(1, 1, 10, 2, body); p(1, 5, 10, 6, dk); p(2, 5, 8, 2, "#1a0c08"); p(1, 8, 10, 1, dk); p(1, 1, 10, 1, trim); }
  else {
    p(1, 3, 10, 3, body); p(1, 3, 10, 1, lite); p(1, 6, 10, 5, dk); p(1, 6, 10, 1, dk); p(1, 10, 10, 1, dk);
    p(5, 5, 2, 3, trim); p(1, 3, 1, 8, trim); p(10, 3, 1, 8, trim);
    if (cr >= 2) { p(3, 4, 1, 1, lite); p(8, 4, 1, 1, lite); }
    if (cr >= 4) { p(4, 8, 4, 1, trim); p(5, 7, 2, 1, lite); }
  }
}
let CH_CV: HTMLCanvasElement | null = null, CH_TINT: HTMLCanvasElement | null = null;
function chestGlow(ctx: CanvasRenderingContext2D, sx: number, sy: number, rar: number, t: number, open: boolean): void {
  if (rar < 1 || open) return;
  try {
    if (!CH_CV) { CH_CV = document.createElement("canvas"); CH_CV.width = 32; CH_CV.height = 32; }
    if (!CH_TINT) { CH_TINT = document.createElement("canvas"); CH_TINT.width = 32; CH_TINT.height = 32; }
    const bc = CH_CV.getContext("2d"), tc = CH_TINT.getContext("2d");
    if (!bc || !tc) return;
    bc.clearRect(0, 0, 32, 32);
    drawLootChest(painter(bc, 4, 4, 2, false, 0), false, rar);
    tc.globalCompositeOperation = "source-over"; tc.clearRect(0, 0, 32, 32); tc.drawImage(CH_CV, 0, 0);
    tc.globalCompositeOperation = "source-in"; tc.fillStyle = RC[rar]; tc.fillRect(0, 0, 32, 32); tc.globalCompositeOperation = "source-over";
    const pulse = 0.45 + 0.35 * Math.sin(t * (3 + rar));
    ctx.save(); ctx.globalAlpha = pulse;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) ctx.drawImage(CH_TINT, sx - 4 + dx, sy - 4 + dy);
    if (rar >= 3) { ctx.globalAlpha = pulse * 0.5; for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) ctx.drawImage(CH_TINT, sx - 4 + dx, sy - 4 + dy); }
    ctx.restore();
  } catch { /* ignore */ }
}

function aura(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rar: number, t: number): void {
  if (rar < 3) return;
  const c = RC[rar];
  const pulse = 0.5 + 0.5 * Math.sin(t * (rar >= 6 ? 9 : 4));
  ctx.globalAlpha = 0.18 + 0.17 * pulse;
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(cx, cy, r * (0.85 + 0.15 * pulse), 0, 6.2832); ctx.fill();
  if (rar >= 4) {
    ctx.globalAlpha = 0.25 + 0.5 * pulse; ctx.strokeStyle = c; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.08, 0, 6.2832); ctx.stroke();
  }
  if (rar >= 5) {
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 6; i++) {
      const an = t * 2.2 + i * 1.047;
      const rr = r * (0.7 + 0.35 * Math.sin(t * 3 + i));
      ctx.fillStyle = i % 2 ? "#ffffff" : c;
      ctx.fillRect(Math.round(cx + Math.cos(an) * rr), Math.round(cy + Math.sin(an) * rr), 1, 1);
    }
  }
  if (rar >= 6) {
    const fc = ["#ff3030", "#ff8020", "#ffe040"];
    for (let i = 0; i < 10; i++) {
      const fx = cx - r + ((i * 7.3 + t * 9) % (2 * r));
      const life = (t * 1.6 + i * 0.37) % 1;
      ctx.globalAlpha = 1 - life;
      ctx.fillStyle = fc[i % 3];
      ctx.fillRect(Math.round(fx), Math.round(cy + r * 0.7 - life * r * 1.8), 2, 2);
    }
    if (Math.floor(t * 7) % 9 === 0) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = "#fff2a0"; ctx.beginPath();
      ctx.moveTo(cx - r * 0.6, cy - r); ctx.lineTo(cx - r * 0.2, cy - r * 0.3); ctx.lineTo(cx - r * 0.5, cy - r * 0.1); ctx.lineTo(cx, cy + r * 0.5); ctx.stroke();
    }
  }
  if (rar >= 7) {
    for (let i = 0; i < 14; i++) {
      const an = t * 3 + i * 0.4488;
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "hsl(" + Math.floor((t * 200 + i * 26) % 360) + ",100%,65%)";
      ctx.fillRect(Math.round(cx + Math.cos(an) * r * 1.18), Math.round(cy + Math.sin(an) * r * 1.18), 2, 2);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- world ----------
function makeTiles(th: number, shift: number = 0): HTMLCanvasElement[] {
  const T = themePal(th, shift);
  const [, , , , fs, ws, amb, dk] = TH50D[th % 50];
  THLT = T.lt; THAMB = { k: amb, c: T.amb };
  const sr = rng32(th * 977 + 13);
  const out: HTMLCanvasElement[] = [];
  const mk = (fn: (x: CanvasRenderingContext2D) => void): void => {
    const c = document.createElement("canvas"); c.width = TS; c.height = TS;
    const x = c.getContext("2d");
    if (x) fn(x);
    out.push(c);
  };
  const F = T.f, W = T.w;
  for (let v = 0; v < 3; v++) mk((x: CanvasRenderingContext2D) => {
    const p = (a: number, b: number, w: number, h: number, c: string): void => { x.fillStyle = c; x.fillRect(a, b, w, h); };
    p(0, 0, TS, TS, F[0]);
    if (fs === 0) { p(0, 0, TS, 1, F[2]); p(0, 0, 1, TS, F[2]); if (v === 1) { p(12, 0, 1, 12, F[2]); p(0, 12, TS, 1, F[2]); } }
    else if (fs === 1) { p(0, 0, TS, 1, F[2]); p(0, 0, 1, TS, F[2]); p(0, 12, TS, 1, F[2]); p(v === 2 ? 8 : 12, 0, 1, 12, F[2]); p(v === 1 ? 6 : 16, 12, 1, 12, F[2]); p(1, 1, 10, 1, F[1]); }
    else if (fs === 2) { p(0, 0, TS, TS, F[0]); for (let i = 0; i < 3 + v; i++) { let cx = Math.floor(sr() * TS), cy = Math.floor(sr() * TS); for (let k = 0; k < 7; k++) { p(cx, cy, 1, 1, F[2]); cx = (cx + (sr() < 0.5 ? 1 : 0) + TS) % TS; cy = (cy + (sr() < 0.6 ? 1 : -1) + TS) % TS; } } }
    else if (fs === 3) { p(0, 0, 12, 12, F[1]); p(12, 12, 12, 12, F[1]); p(0, 0, TS, 1, F[2]); p(0, 0, 1, TS, F[2]); }
    else if (fs === 4) { for (let r = 0; r < 4; r++) { p(0, r * 6, TS, 1, F[2]); p(((r * 7 + v * 5) % 20) + 2, r * 6, 1, 6, F[2]); } p(3, 2, 6, 1, F[1]); }
    else if (fs === 5) { for (let i = 0; i < 5; i++) { const cx = (i * 9 + v * 4) % 20 + 2, cy = (i * 7 + v * 3) % 18 + 3; p(cx - 2, cy - 1, 5, 3, F[1]); p(cx - 2, cy + 2, 5, 1, F[2]); } }
    else if (fs === 6) { for (let r = 0; r < 4; r++) { const y = 3 + r * 6 + v; for (let xx = 0; xx < TS; xx++) if ((xx + r * 3) % 8 < 4) p(xx, y + (xx % 8 < 2 ? 0 : 1), 1, 1, F[1]); } }
    else { for (let i = 0; i < 4 + v * 2; i++) { const cx = Math.floor(sr() * 22), cy = Math.floor(sr() * 22); p(cx, cy, 2 + Math.floor(sr() * 3), 2, F[1]); p(cx + 1, cy - 1, 1, 1, F[2]); } }
    for (let i = 0; i < 10; i++) p(Math.floor(sr() * TS), Math.floor(sr() * TS), sr() < 0.3 ? 2 : 1, 1, sr() < 0.5 ? F[1] : F[2]);
  });
  mk((x: CanvasRenderingContext2D) => { // wall top
    x.fillStyle = W[0]; x.fillRect(0, 0, TS, TS);
    x.fillStyle = W[2];
    for (let i = 0; i < 6; i++) x.fillRect(Math.floor(sr() * TS), Math.floor(sr() * TS), 2, 1);
    if (ws === 2) { x.fillStyle = W[1]; x.globalAlpha = 0.35; x.fillRect(4, 4, 3, 3); x.fillRect(15, 12, 2, 2); x.globalAlpha = 1; }
    if (ws === 4) { x.fillStyle = hsl(110, 45, 30); for (let i = 0; i < 5; i++) x.fillRect(Math.floor(sr() * 22), Math.floor(sr() * 22), 2, 2); }
    x.fillStyle = W[1]; x.fillRect(0, TS - 1, TS, 1); x.fillStyle = "rgba(255,255,255,0.10)"; x.fillRect(0, 0, TS, 1);
  });
  mk((x: CanvasRenderingContext2D) => { // wall face
    const p = (a: number, b: number, w: number, h: number, c: string): void => { x.fillStyle = c; x.fillRect(a, b, w, h); };
    p(0, 0, TS, TS, W[1]); p(0, 0, TS, 4, W[0]);
    if (ws === 0 || ws === 4) { for (let row = 0; row < 4; row++) { const y = 4 + row * 5; p(0, y, TS, 1, W[2]); for (let bx = (row % 2) * 6; bx < TS; bx += 12) p(bx, y, 1, 5, W[2]); } }
    else if (ws === 1) { for (let i = 0; i < 7; i++) { const cx = Math.floor(sr() * 20), cy = 5 + Math.floor(sr() * 14); p(cx, cy, 4 + Math.floor(sr() * 4), 3, sr() < 0.5 ? W[2] : W[0]); } }
    else if (ws === 2) { for (let i = 0; i < 4; i++) { const cx = 2 + i * 6; p(cx, 8 + (i % 2) * 3, 3, 12 - (i % 2) * 3, W[2]); p(cx + 1, 9 + (i % 2) * 3, 1, 6, "#ffffff"); } }
    else if (ws === 3) { p(0, 4, TS, 1, W[2]); p(0, 14, TS, 1, W[2]); p(11, 4, 1, 20, W[2]); for (const [a, b] of [[2, 6], [20, 6], [2, 16], [20, 16]]) p(a, b, 2, 2, "#d8d8e0"); }
    else { for (let i = 0; i < 4; i++) { const cx = 1 + i * 6; p(cx, 7 + (i % 2) * 5, 4, 3, "#d8d0c0"); p(cx + 1, 8 + (i % 2) * 5, 1, 1, "#100818"); p(cx + 2, 8 + (i % 2) * 5, 1, 1, "#100818"); } }
    if (ws === 4) { for (let i = 0; i < 3; i++) { const cx = 3 + i * 8; p(cx, 4, 1, 6 + i * 3, hsl(110, 50, 32)); p(cx - 1, 7 + i * 2, 2, 1, hsl(110, 55, 40)); } }
    x.fillStyle = "rgba(255,255,255,0.12)"; x.fillRect(0, 5, TS, 1);
    x.fillStyle = "rgba(0,0,0,0.35)"; x.fillRect(0, TS - 2, TS, 2);
  });
  mk((x: CanvasRenderingContext2D) => {
    x.fillStyle = F[0]; x.fillRect(0, 0, TS, TS);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = ["#6a6a78", "#4a4a58", "#2c2c38", "#141420"][i];
      x.fillRect(3 + i * 2, 3 + i * 4, 18 - i * 4, 4);
    }
    x.fillStyle = "#000000"; x.fillRect(9, 19, 6, 3);
    x.fillStyle = GOLD; x.fillRect(2, 2, 2, 2); x.fillRect(20, 2, 2, 2);
  });
  mk((x: CanvasRenderingContext2D) => drawDecor(x, dk, T.dc)); // tile 6: decor overlay
  mk((x: CanvasRenderingContext2D) => { // tile 7: stairs up
    x.fillStyle = F[0]; x.fillRect(0, 0, TS, TS);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = ["#6a6a78", "#4a4a58", "#2c2c38", "#141420"][i];
      x.fillRect(3 + i * 2, 17 - i * 4, 18 - i * 4, 4);
    }
    x.fillStyle = "#80ffd0"; x.fillRect(11, 3, 2, 8); x.fillRect(8, 5, 8, 2); x.fillRect(9, 3, 6, 2); x.fillRect(10, 1, 4, 2);
    x.fillStyle = GOLD; x.fillRect(2, 20, 2, 2); x.fillRect(20, 20, 2, 2);
  });
  return out;
}

function mkEnemy(g: Game, x: number, y: number, cls: number, opts?: { full?: boolean; se?: boolean }): En {
  const d = g.depth;
  const avail: number[] = [];
  FAMS.forEach((f: Fam, i: number) => { if (f.min <= d) avail.push(i); });
  const fi = pick(avail);
  const f = FAMS[fi];
  const tier = Math.floor((d - 1) / 5);
  let v = Math.max(0, Math.min(4, tier + (R() < 0.3 ? 1 : 0) - (R() < 0.25 ? 1 : 0)));
  let pre = "";
  if (tier >= 5) { v = ri(5); pre = DEEP[Math.min(DEEP.length - 1, tier - 5)] + " "; }
  const se = !!(opts && opts.se);
  const lesser = !se && cls === 1 && earlySafeDepth(d) && !(opts && opts.full);
  const cm = se ? SE_CM : lesser ? 1.3 : [1, 2.8, 8][cls], am = se ? SE_AM : lesser ? 1.3 : [1, 1.35, 1.7][cls], dm = se ? SE_DM : lesser ? 1.1 : [1, 1.3, 1.6][cls], xm = se ? SE_XM : lesser ? 1.5 : [1, 3.5, 15][cls];
  const tr: Trait[] = [];
  if (f.tr) tr.push(f.tr);
  if (cls === 1 && !lesser) { let t2 = pick(TRAITS); if (tr.includes(t2)) t2 = "brutal"; if (!tr.includes(t2)) tr.push(t2); }
  else if (lesser && R() < 0.25) {
    const weakT: Trait[] = ["fast", "regen"];
    const t2 = pick(weakT);
    if (!tr.includes(t2)) tr.push(t2);
  }
  const hp = enemyHpFloor(d, f.hp, cm);
  let atk = enemyAtkAt(d) * f.atk * am;
  let hpv = hp;
  if (g.eq) {
    const hs = calc(g.lvl, g.eq);
    const main = g.eq.rh ?? (g.eq.lh && g.eq.lh.kind !== "shield" ? g.eq.lh : null);
    const two = isTwo(main);
    const edef = (0.5 + 0.85 * d) * f.def * dm * (hs.magic ? 0 : 1 - hs.pierce);
    const ev = dmgF(hs.atk, edef) * combatSwingMul(hs, two);
    const fam = 0.9 + 0.1 * Math.min(2, f.hp);
    const hits = se ? seTargetHits(d) : lesser ? combatTargetHits(0, d) * 1.3 : combatTargetHits(cls, d);
    const want = ev * hits * fam * (0.96 + R() * 0.08);
    // Want-only: beatable with the current kit at every depth. The historic 1.06^d floor
    // is not allowed to pad (it overtook want around d100-d250 and reached ~1e18 by d500).
    const sm = se ? seDepthMul(d) : 1;
    hpv = Math.max(1, se ? safeRound(safeMul(want, sm)) : Math.round(want));
    const ap = se ? seAtkPct(d) : lesser ? combatAtkPct(0, d) * 1.3 : combatAtkPct(cls, d);
    const D = hs.maxHp * ap * f.atk * am;
    atk = Math.max(atk, atkForHit(D, hs.def));
    if (se) atk = safeMul(atk, sm);
  }
  if (tr.includes("brutal")) atk *= 1.3;
  if (g.eq) { const hs = calc(g.lvl, g.eq); const C = hs.maxHp * (se ? SE_CAP : lesser ? 0.16 : combatAtkCap(cls)); atk = Math.min(atk, atkForHit(C, hs.def)); }
  const base = pre + f.v[v];
  const lesserTag = lesser && tr.length && (!f.tr || tr[tr.length - 1] !== f.tr) ? TRN[tr[tr.length - 1]] + " " : "";
  const name = se ? "Super Elite " + (tr.length ? TRN[tr[tr.length - 1]] + " " : "") + base : cls === 2 ? pick(BOSSN) + " the " + base + " " + pick(BOSST) : lesser ? "Lesser " + lesserTag + base : cls === 1 ? TRN[tr[tr.length - 1]] + " " + base : base;
  const h = f.h[v];
  const pal = [hsl(h, f.s, 45), hsl(h, f.s + 10, 68), hsl(h, f.s, 24), f.e];
  const e0: En = { id: NID++, x, y, ax: x, ay: y, f: fi, v, cls, hp: hpv, mhp: hpv, atk: Math.max(1, se ? safeRound(safeNum(atk)) : Math.round(atk)), def: se ? safeRound((0.5 + 0.8 * d) * f.def * dm) : Math.round((0.5 + 0.8 * d) * f.def * dm), xp: se ? safeRound((6 + 4 * d) * xm) : Math.round((6 + 4 * d) * xm), name, tr, stun: 0, child: false, hit: 0, bump: 0, bdx: 0, bdy: 0, awake: false, face: -1, pal, burn: 0, burnD: 0, slow: 0, weak: 0, fear: 0 };
  if (se) e0.se = 1;
  rollAffix(e0, lesser);
  maybeGiveRanged(e0, f.n);
  return e0;
}
function maybeGiveRanged(e: En, famN: string): void {
  if (e.tr.includes("ranged") || e.gob || e.hunt) return;
  const table: Record<string, [number, string[]]> = {
    Skeleton: [0.32, ["Skeleton Archer", "Bone Crossbowman", "Skeletal Marksman"]],
    Spider: [0.22, ["Spitting Spider", "Web Spitter"]],
    Myconid: [0.25, ["Spore Spitter", "Spitting Myconid"]],
    Serpent: [0.2, ["Spitting Serpent", "Naga Spitter"]],
    Elemental: [0.28, ["Spark Caster", "Bolt Caster"]],
    Demon: [0.2, ["Fire Spitter", "Hell Caster"]],
    Goblin: [0.22, ["Goblin Archer", "Goblin Hexer"]],
    Dragonkin: [0.18, ["Drake Spitter"]],
  };
  const row = table[famN];
  if (!row) return;
  const ch = e.cls === 0 ? row[0] : e.cls === 1 ? row[0] * 0.5 : 0;
  if (R() >= ch) return;
  e.tr = e.tr.concat(["ranged"]);
  if (e.cls === 0) e.name = pick(row[1]);
}
function shotTyp(e: En): number {
  const n = e.name;
  if (/Spit|Spore|Drake|Web|Acid/i.test(n)) return 2;
  if (/Caster|Hexer|Lich|Acolyte|Priest|Wraith|Eye|Shaman|Necromancer/i.test(n)) return 3;
  return 1;
}
function fireEnemyShot(g: Game, e: En, st: Stats, mul: number): void {
  const h = g.hero;
  const dist = Math.abs(e.x - h.x) + Math.abs(e.y - h.y);
  const fly = 0.32 + Math.min(0.18, dist * 0.045);
  const dmg = Math.max(1, Math.round(e.atk * mul * (e.weak > 0 ? 0.7 : 1)));
  g.shots.push({ x0: e.ax * TS + 12, y0: e.ay * TS + 12, x1: h.ax * TS + 12, y1: h.ay * TS + 12, t: fly, max: fly, c: e.pal[3], dmg, tx: h.x, ty: h.y, from: e.id, typ: shotTyp(e) });
  e.ra = 2;
  e.bump = 0.5; e.bdx = Math.sign(h.x - e.x); e.bdy = Math.sign(h.y - e.y);
  g.sfx("ehit");
}
function resolveShot(g: Game, s: Shot): void {
  if (!s.dmg || s.tx === undefined || s.ty === undefined || g.mode !== "play") return;
  const h = g.hero;
  if (h.x !== s.tx || h.y !== s.ty) { floatTxt(g, s.tx, s.ty, "DODGE", "#80ffc0"); return; }
  let src: En | null = null;
  if (s.from !== undefined) src = g.en.find((o: En) => o.id === s.from) ?? null;
  const st = calc(g.lvl, g.eq);
  if (src && src.hp > 0) enemyAttack(g, src, (s.dmg / Math.max(1, src.atk)), st);
  else {
    // shooter gone: still apply the stored hit if the hero stayed put
    if (R() * 100 < st.block) { floatTxt(g, h.x, h.y, "BLOCK", "#80c0ff"); g.sfx("block"); return; }
    let dmg = s.dmg as number;
    if (g.ward > 0) { const ab = Math.min(g.ward, dmg); g.ward -= ab; dmg -= ab; }
    if (dmg > 0) applyHeroDmg(g, dmg, 3);
  }
}


const enemyAt = (g: Game, x: number, y: number): En | null => { for (const e of g.en) if (e.hp > 0 && e.x === x && e.y === y) return e; for (const e of g.pend) if (e.x === x && e.y === y) return e; return null; };
const chestAt = (g: Game, x: number, y: number): Chest | null => { for (const c of g.chests) if (!c.open && c.x === x && c.y === y) return c; return null; };
const walkable = (g: Game, x: number, y: number): boolean => inb(x, y) && g.map[y * MW + x] !== 0 && !enemyAt(g, x, y) && !chestAt(g, x, y) && !merchAt(g, x, y) && !campBlocked(g, x, y);

function los(g: Game, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0, n = 0;
  while (!(x === x1 && y === y1) && n < 40) {
    n++;
    if (!(x === x0 && y === y0) && g.map[y * MW + x] === 0) return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return true;
}
function computeVis(g: Game): void {
  g.vis.fill(0);
  const h = g.hero, RR = 6;
  for (let dy = -RR; dy <= RR; dy++) for (let dx = -RR; dx <= RR; dx++) {
    if (dx * dx + dy * dy > RR * RR + 2) continue;
    const x = h.x + dx, y = h.y + dy;
    if (!inb(x, y)) continue;
    if (los(g, h.x, h.y, x, y)) { g.vis[y * MW + x] = 1; g.seen[y * MW + x] = 1; }
  }
  maybeActBossIntro(g);
  scanScreenAlerts(g);
}

function announce(t: string): void {
  try {
    (window as unknown as { __ED16_LAST_MSG?: string }).__ED16_LAST_MSG = t;
    document.documentElement.dataset.ed16Msg = t;
    if (/Imported|press Save Game|saves on this device/i.test(t)) {
      (window as unknown as { __ED16_IMPORT_MSG?: string }).__ED16_IMPORT_MSG = t;
      document.documentElement.dataset.ed16Import = t;
    }
  } catch { /* ignore */ }
}
function msg(g: Game, t: string, c: string): void { g.msgs.push({ t, c }); if (g.msgs.length > 6) g.msgs.shift(); announce(t); }
function burst(g: Game, x: number, y: number, n: number, cols: string[], sp: number, grav: number): void {
  for (let i = 0; i < n && g.parts.length < 600; i++) {
    const an = R() * 6.2832, v = sp * (0.3 + R() * 0.7), life = 0.4 + R() * 0.6;
    g.parts.push({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v - sp * 0.2, life, max: life, c: pick(cols), s: R() < 0.3 ? 2 : 1, g: grav });
  }
}
type HitCtx = { dx?: number; dy?: number; ox?: number; oy?: number };
let HIT_CTX: HitCtx | null = null;
let GIB_SKIP_SAVE = false;
const HIT_DIR = new WeakMap<En, { dx: number; dy: number }>();
function normDir(dx: number, dy: number): { dx: number; dy: number } | null {
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-6)) return null;
  return { dx: dx / len, dy: dy / len };
}
function heroToEn(g: Game, e: En): { dx: number; dy: number } | null {
  return normDir(e.x - g.hero.x, e.y - g.hero.y) || normDir((e.ax ?? e.x) - (g.hero.ax ?? g.hero.x), (e.ay ?? e.y) - (g.hero.ay ?? g.hero.y));
}
function withHit<T>(ctx: HitCtx, fn: () => T): T {
  const prev = HIT_CTX;
  HIT_CTX = ctx;
  try { return fn(); } finally { HIT_CTX = prev; }
}
function markHitDir(g: Game, e: En): void {
  const ctx = HIT_CTX;
  let d: { dx: number; dy: number } | null = null;
  if (ctx) {
    if (ctx.ox !== undefined && ctx.oy !== undefined) d = normDir(e.x - ctx.ox, e.y - ctx.oy);
    if (!d && (ctx.dx !== undefined || ctx.dy !== undefined)) d = normDir(ctx.dx ?? 0, ctx.dy ?? 0);
  }
  if (!d) d = heroToEn(g, e);
  if (d) HIT_DIR.set(e, d);
  else HIT_DIR.delete(e);
}
function hitDirOf(g: Game, e: En): { dx: number; dy: number } {
  const stamped = HIT_DIR.get(e);
  HIT_DIR.delete(e);
  if (stamped && (stamped.dx !== 0 || stamped.dy !== 0)) return stamped;
  return heroToEn(g, e) || ((): { dx: number; dy: number } => { const an = R() * 6.2832; return { dx: Math.cos(an), dy: Math.sin(an) }; })();
}
function burstGib(g: Game, x: number, y: number, n: number, cols: string[], sp: number, grav: number, dx: number, dy: number): void {
  let dir = normDir(dx, dy);
  if (!dir) { const an = R() * 6.2832; dir = { dx: Math.cos(an), dy: Math.sin(an) }; }
  const base = Math.atan2(dir.dy, dir.dx);
  const CONE = 0.65;
  for (let i = 0; i < n && g.parts.length < 500; i++) {
    const an = base + (R() - 0.5) * 2 * CONE, v = sp * (0.55 + R() * 0.55), life = 0.45 + R() * 0.55;
    g.parts.push({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, life, max: life, c: pick(cols), s: R() < 0.4 ? 3 : 2, g: grav, ang: R() * 6.2832, spin: (R() - 0.5) * 10, gib: true });
  }
}
function floatTxt(g: Game, x: number, y: number, txt: string, c: string): void { const p = visOf(g, x, y); g.floats.push({ x: p[0] * TS + 12, y: p[1] * TS + 2, txt, c, life: 0.9 }); }
function setBanner(g: Game, txt: string, sub: string, c: string, rar: number, t: number): void {
  if (g.banner && g.banner.t > 0.4 && g.banner.rar > rar) return;
  g.banner = { txt, sub, c, rar, t };
  announce(txt + (sub ? " — " + sub : ""));
}

function genFloor(g: Game): void {
  clearCracks(g);
  const map = new Uint8Array(MW * MH);
  const rooms: { x: number; y: number; w: number; h: number }[] = [];
  const carve = (x: number, y: number): void => { if (x > 0 && y > 0 && x < MW - 1 && y < MH - 1) map[y * MW + x] = 1; };
  const tunnel = (ax: number, ay: number, bx: number, by: number): void => {
    let cx = ax, cy = ay;
    if (R() < 0.5) { while (cx !== bx) { carve(cx, cy); cx += Math.sign(bx - cx); } while (cy !== by) { carve(cx, cy); cy += Math.sign(by - cy); } }
    else { while (cy !== by) { carve(cx, cy); cy += Math.sign(by - cy); } while (cx !== bx) { carve(cx, cy); cx += Math.sign(bx - cx); } }
    carve(bx, by);
  };
  for (let tries = 0; tries < 600 && rooms.length < 15; tries++) {
    const w = 4 + ri(6), h = 4 + ri(5), x = 1 + ri(MW - w - 2), y = 1 + ri(MH - h - 2);
    let ok = true;
    for (const r of rooms) if (x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y) { ok = false; break; }
    if (!ok) continue;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) carve(xx, yy);
    rooms.push({ x, y, w, h });
  }
  type Rm = { x: number; y: number; w: number; h: number };
  const ctr = (r: Rm): number[] => [r.x + (r.w >> 1), r.y + (r.h >> 1)];
  const rd = (a: Rm, b: Rm): number => { const p = ctr(a), q = ctr(b); return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]); };
  const link = (a: Rm, b: Rm): void => { const p = ctr(a), q = ctr(b); tunnel(p[0], p[1], q[0], q[1]); };
  for (let i = 1; i < rooms.length; i++) link(rooms[i - 1], rooms[i]);
  for (let i = 0; i < rooms.length; i++) {
    const me = rooms[i];
    const near = rooms.filter((r: Rm) => r !== me).sort((a: Rm, b: Rm) => rd(a, me) - rd(b, me)).slice(0, 2);
    for (const r of near) if (R() < 0.85) link(me, r);
  }
  for (let i = 0; i < 3 && rooms.length > 3; i++) link(pick(rooms), pick(rooms));
  const r0 = rooms[0];
  const far = rooms.slice(1).sort((a: Rm, b: Rm) => rd(b, r0) - rd(a, r0));
  const rl = far[0] ?? r0;
  const sc = ctr(rl);
  const sx = sc[0], sy = sc[1];
  const actFl = isActFloor(g.depth);
  const alreadyCleared = actFl && actEverCleared(g);
  const needDown = !actFl || needReturnStairs(g);
  const r2 = rooms.length >= 6 ? far.slice(1).sort((a: Rm, b: Rm) => rd(b, r0) + rd(b, rl) - rd(a, r0) - rd(a, rl))[0] : undefined;
  const st2 = r2 ? ctr(r2) : null;
  if (needDown) {
    map[sy * MW + sx] = 2;
    if (st2) map[st2[1] * MW + st2[0]] = 2;
  }
  g.campSpot = actFl ? { x: sx, y: sy } : undefined;
  g.map = map;
  g.seen = new Uint8Array(MW * MH);
  g.vis = new Uint8Array(MW * MH);
  g.theme = themeOf(g.depth);
  if (!g.thSeen) g.thSeen = [];
  g.thNew = !g.thSeen.includes(g.theme);
  if (g.thNew) g.thSeen.push(g.theme);
  g.thShift = themeShift(g);
  THDREAD = dreadT(g.depth);
  g.tiles = makeTiles(g.theme, g.thShift);
  efFloor(g);
  g.hero.x = r0.x + (r0.w >> 1); g.hero.y = r0.y + (r0.h >> 1);
  if (g.depth >= 2) {
    let ux = g.hero.x, uy = r0.y;
    if (map[uy * MW + ux] === 0) { ux = g.hero.x; uy = g.hero.y; }
    if (ux === g.hero.x && uy === g.hero.y) {
      if (g.hero.y + 1 < r0.y + r0.h) g.hero.y++;
      else if (g.hero.x + 1 < r0.x + r0.w) g.hero.x++;
      else if (g.hero.x - 1 >= r0.x) g.hero.x--;
    }
    if (map[uy * MW + ux] !== 0) map[uy * MW + ux] = TILE_UP;
  }
  g.hero.ax = g.hero.x; g.hero.ay = g.hero.y;
  g.en = []; g.pend = []; g.chests = []; g.drops = []; g.shots = []; g.floats = []; g.ground = []; g.fx = []; g.echo = [];
  bagSalvNoted = false;
  g.trader = null; g.shopOpen = false; g.stashOpen = false; g.floorTurn = 0;
  g.portal = null; g.vault = null; g.gobT = 0; g.warnGobs = []; g.warnPort = ""; g.warn = undefined;
  g.area = "dungeon"; g.restAt = undefined; g.stashAt = undefined; g.fireAt = undefined;
  GENINFO.rooms = rooms.slice();
  GENINFO.nEn = 0; GENINFO.nCorr = 0; GENINFO.nRoom = 0; GENINFO.nRare = 0; GENINFO.nPack = 0;
  const used = new Set<number>();
  used.add(g.hero.y * MW + g.hero.x); used.add(sy * MW + sx);
  if (st2) used.add(st2[1] * MW + st2[0]);
  for (let k = 0; k < MW * MH; k++) if (map[k] === TILE_UP) used.add(k);
  const cell = (ri0: number): number[] | null => {
    const ok = (x: number, y: number) => {
      if (Math.abs(x - g.hero.x) + Math.abs(y - g.hero.y) < 8) return false;
      if (Math.abs(x - sx) + Math.abs(y - sy) < 5) return false;
      if (st2 && Math.abs(x - st2[0]) + Math.abs(y - st2[1]) < 5) return false;
      return true;
    };
    for (let t = 0; t < 80; t++) {
      const rm = rooms[Math.max(0, Math.min(rooms.length - 1, ri0))];
      const x = rm.x + ri(rm.w), y = rm.y + ri(rm.h);
      const k = y * MW + x;
      if (map[k] === 1 && !used.has(k) && ok(x, y)) { used.add(k); return [x, y]; }
    }
    return pickWalk(g, used, g.hero.x, g.hero.y, 8, 5);
  };
  const d = g.depth;
  const nEn = enBase(d);
  const eliteCh = eliteChance(d);
  for (let i = 0; i < nEn; i++) {
    const c = pickWalk(g, used, g.hero.x, g.hero.y, 8, 5);
    if (c) g.en.push(mkEnemy(g, c[0], c[1], R() < eliteCh ? 1 : 0));
  }
  const nPacks = rollPacks(d);
  for (let i = 0; i < nPacks; i++) spawnRarePack(g, used, g.hero.x, g.hero.y);
  const bossFloor = !actFl && d > EARLY_SAFE_MAX && R() < 0.07;
  if (actFl) {
    const c = cell(Math.max(0, rooms.indexOf(rl))) || [sx, sy];
    if (c) g.en.push(mkActBoss(g, c[0], c[1]));
    const ab = g.en[g.en.length - 1];
    if (!(g.banner && g.banner.txt === "YOU ARE BEING HUNTED!")) setBanner(g, "ACT " + actOf(d) + " BOSS", (ab ? ab.name : "A great foe") + (alreadyCleared ? " has returned" : " bars the way to camp"), "#ff6060", 8, 3.4);
  } else if (bossFloor) {
    const c = cell(1 + ri(rooms.length - 1));
    if (c) g.en.push(mkEnemy(g, c[0], c[1], 2));
  }
  if (d > EARLY_SAFE_MAX && rooms.length > 2 && R() < Math.min(0.5, 0.2 + d * 0.01)) {
    const ri0 = 1 + ri(rooms.length - 1);
    const c = cell(ri0);
    if (c) {
      const ch = mkEnemy(g, c[0], c[1], 1);
      ch.hp = ch.mhp = Math.round(ch.mhp * 1.5); ch.atk = Math.round(ch.atk * 1.15); ch.xp = Math.round(ch.xp * 1.8); ch.name = "Champion " + ch.name;
      g.en.push(ch);
      const nb = 2 + ri(2);
      for (let i = 0; i < nb; i++) {
        const c2 = cell(ri0);
        if (!c2) break;
        const b = mkEnemy(g, c2[0], c2[1], 0);
        b.hp = b.mhp = Math.round(b.mhp * 1.8); b.atk = Math.round(b.atk * 1.25); b.xp = Math.round(b.xp * 2); b.name = "Brute " + b.name;
        g.en.push(b);
      }
    }
  }
  if (d > EARLY_SAFE_MAX && rooms.length > 2 && R() < 0.3) {
    const c = cell(1 + ri(rooms.length - 1));
    if (c) { const m = mkEnemy(g, c[0], c[1], 1); m.awake = true; m.name = "Roaming " + m.name; m.hp = m.mhp = Math.round(m.mhp * 1.25); m.xp = Math.round(m.xp * 1.5); g.en.push(m); }
  }
  // traders live at camp only (raw30); no dungeon shops
  // rare treasure portal (~4% of floors from depth 2) — skipped on act floors
  // loot goblins from depth 3: classic 6% (was 3%), Gem Goblin 2.5%, Gold Goblin 2.5%; at most one per floor
  if (!actFl && d >= 2 && rooms.length > 2 && R() < 0.04 * gemPortalMul(g)) { const c = cell(1 + ri(rooms.length - 1)); if (c) g.portal = { x: c[0], y: c[1], kind: "vault" }; }
  if (d >= 3 && rooms.length > 2) {
    const mul = gemGobMul(g);
    const gr = R();
    const gk = gr < GOB_CH * mul ? 1 : gr < (GOB_CH + GOB_GEM_CH) * mul ? 2 : gr < (GOB_CH + GOB_GEM_CH + GOB_GOLD_CH) * mul ? 3 : 0;
    if (gk) { const c = cell(1 + ri(rooms.length - 1)); if (c) g.en.push(mkGoblin(g, c[0], c[1], gk)); }
  }
  // rare Hunter (the goblin's aggressive opposite): spawns awake in a far room and never stops chasing
  if (d > EARLY_SAFE_MAX && d >= HUNTER_MIN_DEPTH && rooms.length > 2 && R() < HUNTER_CHANCE) {
    const hr = far[Math.min(1, far.length - 1)] ?? rl;
    const c = cell(Math.max(1, rooms.indexOf(hr)));
    if (c) {
      const hu = mkHunter(g, c[0], c[1]);
      g.en.push(hu);
      setBanner(g, "YOU ARE BEING HUNTED!", hu.name + " has your scent - it will not stop", "#e040ff", 8, 3.2);
      msg(g, hu.name + " is hunting you! It is faster than you - stand and fight.", "#e080ff");
      g.sfx("hunt");
    }
  }
  for (const e of g.en) { GENINFO.nEn++; if (inRoom(e.x, e.y)) GENINFO.nRoom++; else GENINFO.nCorr++; }
  const nCh = 2 + ri(3);
  for (let i = 0; i < nCh; i++) { const c = cell(ri(rooms.length)); if (c) g.chests.push({ x: c[0], y: c[1], open: false, rar: rollChestRar(d, false) }); }
  const nPot = POT_FLOOR_BASE + ri(POT_FLOOR_SPAN);
  for (let i = 0; i < nPot; i++) { const c = cell(ri(rooms.length)); if (c) g.drops.push({ x: c[0], y: c[1], item: null, pot: true, gold: 0 }); }
  const nGold = 2 + ri(3);
  for (let i = 0; i < nGold; i++) { const c = cell(ri(rooms.length)); if (c) g.drops.push({ x: c[0], y: c[1], item: null, pot: false, gold: Math.round((6 + d * 4) * (0.5 + R())) }); }
  if (R() < GEM_CH_FLOOR) {
    const c = cell(ri(rooms.length));
    if (c) g.drops.push({ x: c[0], y: c[1], item: makeGem(rollGemRar(d), ri(7), Math.max(1, d)), pot: false, gold: 0 });
  }
  computeVis(g);
  placeTorches(g);
  if (actFl && alreadyCleared) openCampPortal(g);
  const floorNote = actFl ? (alreadyCleared ? " - ACT BOSS returns \u00b7 camp portal open" : " - ACT BOSS!") : (bossFloor ? " - a boss lurks here!" : "");
  msg(g, "Depth " + d + ": " + themeName(g) + (g.thNew ? " (new area " + (g.thSeen ?? []).length + "/50)" : "") + floorNote, (actFl || bossFloor) ? "#ff6060" : "#c8c0ff");
  efFloorEnd(g);
  maybeSpawnPrisThreats(g);
}
const HUNTER_CHANCE = 0.025; // ~2.5% of floors
const HUNTER_MIN_DEPTH = 4;
const HUNTER_HP_MUL = 0.8, HUNTER_ATK_MUL = 0.8; // per hit vs a boss (ATK ramps 1.0 -> 0.8 over depths 4-12); it acts 1.5x per turn, so ~1.2x a boss's damage per turn
const HUNTN = ["Nightstalker", "Soul Reaver", "Dread Hunter", "Shade Stalker", "Grave Hound", "Void Tracker"];
// Boss-level HP and damage (built as a boss, then x0.8), no traits, acts 1.5x per turn (see endTurn), immune to slow/fear, awake from the start.
function mkHunter(g: Game, x: number, y: number): En {
  const e = mkEnemy(g, x, y, 2);
  const wi = FAMS.findIndex((f: Fam) => f.n === "Wraith");
  if (wi >= 0) e.f = wi;
  e.v = 4; e.tr = []; e.hunt = 1; e.awake = true;
  e.hp = e.mhp = Math.round(e.mhp * HUNTER_HP_MUL);
  const hm = 1 - (1 - HUNTER_ATK_MUL) * Math.min(1, Math.max(0, (g.depth - 4) / 8));
  if (g.eq) {
    const hs = calc(g.lvl, g.eq);
    e.atk = Math.max(1, Math.round(atkForHit(hs.maxHp * combatAtkCap(2) * hm, hs.def)));
  } else e.atk = Math.max(1, Math.round(e.atk * hm));
  e.xp = Math.round(e.xp * 1.3);
  e.name = "The " + pick(HUNTN);
  e.pal = ["#2a0a3a", "#9a30d0", "#0e0418", "#ff3cff"];
  return e;
}
// Relentless pursuit: BFS distance field from the hero over the whole floor (no leash), step to the closest free neighbour.
function huntMove(g: Game, e: En): void {
  const h = g.hero;
  const field = (solid: boolean): Int16Array => {
    const dist = new Int16Array(MW * MH).fill(-1);
    const s0 = h.y * MW + h.x;
    dist[s0] = 0;
    const q = [s0];
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi], x = k % MW, y = (k / MW) | 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, ny = y + oy;
        if (!inb(nx, ny)) continue;
        const nk = ny * MW + nx;
        if (dist[nk] !== -1 || g.map[nk] === 0 || (solid && (chestAt(g, nx, ny) || merchAt(g, nx, ny)))) continue;
        dist[nk] = dist[k] + 1;
        q.push(nk);
      }
    }
    return dist;
  };
  let dist = field(true);
  if (dist[e.y * MW + e.x] < 0) dist = field(false); // walled off by a chest: path through it and wait at it
  const cur = dist[e.y * MW + e.x] < 0 ? 1 << 14 : dist[e.y * MW + e.x];
  let best: number[] | null = null, bd = cur, side: number[] | null = null, shove: En | null = null;
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = e.x + ox, ny = e.y + oy;
    if (!inb(nx, ny)) continue;
    const dd = dist[ny * MW + nx];
    if (dd < 0 || (nx === h.x && ny === h.y)) continue;
    if (!walkable(g, nx, ny)) { const o = enemyAt(g, nx, ny); if (o && o !== e && o.cls < 2 && dd < cur && !shove) shove = o; continue; }
    if (dd < bd) { bd = dd; best = [nx, ny]; } else if (dd === cur && !side) side = [nx, ny];
  }
  if (!best && shove) { // barge through a lesser monster blocking the corridor
    const ox = e.x, oy = e.y; if (shove.x !== e.x) e.face = shove.x > e.x ? 1 : -1;
    e.x = shove.x; e.y = shove.y; shove.x = ox; shove.y = oy; return;
  }
  if (!best && side) { // the way is blocked by another monster: step around it
    const [cx, cy] = [e.x * 2 - side[0], e.y * 2 - side[1]];
    if (Math.abs(side[0] - h.x) + Math.abs(side[1] - h.y) <= Math.abs(cx - h.x) + Math.abs(cy - h.y) + 1) best = side;
  }
  if (best) { if (best[0] !== e.x) e.face = best[0] > e.x ? 1 : -1; e.x = best[0]; e.y = best[1]; }
}
// ======================= movement speed (armor only) =======================
const MV_CAP = 200; // per item and total, in %
const MV_TYPICAL = 100; // soft cap for ordinary rolls
const MVCH = [0.06, 0.1, 0.15, 0.2, 0.26, 0.32, 0.4, 0.5];
let MVMUL = 1; // 1 + total move speed / 100: walk animation, hold-to-walk repeat and key repeat all speed up by this
function mvRoll(ilvl: number, rar: number, isSet: boolean = false): number {
  const typ = Math.max(1, Math.round((2 + rar * 8) * (1 + Math.min(ilvl, 60) / 60) * (0.75 + R() * 0.5)));
  const base = Math.min(MV_TYPICAL, typ);
  const jack = rar >= 7 ? 0.035 : isSet ? 0.008 : rar >= 6 ? 0.005 : 0;
  if (jack <= 0 || R() >= jack) return base;
  if (rar >= 7 && R() < 0.015) return MV_CAP;
  const u = R();
  return Math.min(199, 101 + Math.round(Math.pow(u, 5) * 98));
}

// ======================= 100 unique effects: 50 weapon on-hit (0-49) + 50 armor passives (50-99) =======================
interface EfDef { n: string; c: string; s: boolean; d: (p: number) => string }
const esOf = (g: Game): ES => g.es ?? (g.es = { combo: 0, cid: -1, chg: 0, rush: 0, rage: 0, hits: 0, aegis: 0, decoy: 0, dodge: 0, eth: 0, tr: 0, trT: 0, wind: false, last: false, iron: false, still: false, moved: 0, free: 0, frz: 0, q: [] });
const efc = (b: number, p: number): number => Math.min(0.6, b * p);
const pc = (v: number): string => Math.round(v) + "%";
const cs = (b: number, p: number): string => pc(efc(b, p) * 100) + " chance";
const EFX: EfDef[] = [
  { n: "Vampiric Edge", c: "#ff3060", s: false, d: (p) => "Heal " + pc(4 * p) + " of all damage you deal" },
  { n: "Chain Spark", c: "#9ab0ff", s: true, d: (p) => cs(0.12, p) + " on hit: lightning bounces to " + (2 + Math.floor(p)) + " more foes" },
  { n: "Cinderbrand", c: "#ff7a20", s: true, d: (p) => cs(0.25, p) + ": ignite the target, burning " + pc(15 * p) + " of the hit per turn" },
  { n: "Frostbite", c: "#80e0ff", s: true, d: (p) => cs(0.25, p) + ": chill (slow 2 turns), sometimes freezing it solid" },
  { n: "Executioner", c: "#ff4040", s: true, d: (p) => "Instantly slay non-boss foes below " + pc(6 * p) + " HP" },
  { n: "Crit Cascade", c: "#ffd840", s: true, d: (p) => "Critical hits have " + pc(efc(0.35, p) * 100) + " to cascade into 1-2 bonus strikes" },
  { n: "Spirit Call", c: "#fff2a0", s: true, d: (p) => cs(0.05, p) + ": summon a guardian spirit for 4 turns" },
  { n: "Time Warp", c: "#c0a0ff", s: true, d: (p) => cs(0.04, p) + ": freeze time around you (stuns nearby foes 1 turn)" },
  { n: "Gold Strike", c: GOLD, s: false, d: (p) => cs(0.1, p) + ": the blow knocks loose gold coins" },
  { n: "Armor Shred", c: "#b0b0c0", s: false, d: (p) => "Hits often strip " + pc(6 * p) + " of the target's armor (stacks)" },
  { n: "Hemorrhage", c: "#d01030", s: true, d: (p) => cs(0.25, p) + ": cause bleeding that scales with the foe's max HP" },
  { n: "Venom", c: "#60ff40", s: false, d: () => "Every hit adds a stack of poison (up to 5 stacks)" },
  { n: "Thunderclap", c: "#a0c0ff", s: true, d: (p) => cs(0.08, p) + ": shockwave knocks back and damages adjacent foes" },
  { n: "Repulse Blow", c: "#e0c080", s: true, d: (p) => cs(0.2, p) + ": knock the target back; slam bonus if it hits a wall" },
  { n: "Echo Blade", c: "#80ffe0", s: true, d: (p) => cs(0.15, p) + ": the hit echoes again next turn for 40%" },
  { n: "Doom Mark", c: "#8040c0", s: true, d: (p) => cs(0.05, p) + ": mark the target - in 3 turns it takes 150% of the hit again" },
  { n: "Soul Harvest", c: "#c080ff", s: false, d: (p) => "Killing blows heal " + pc(4 * p) + " of your max HP" },
  { n: "Meteor Call", c: "#ff9040", s: true, d: (p) => cs(0.04, p) + ": a meteor crashes onto the target area" },
  { n: "Holy Smite", c: "#fff8c0", s: true, d: (p) => cs(0.08, p) + ": a pillar of light smites (x2 vs undead) and heals you" },
  { n: "Void Rift", c: "#c040ff", s: true, d: (p) => cs(0.05, p) + ": a rift drags nearby foes toward the target" },
  { n: "Shatter", c: "#c8f4ff", s: true, d: (p) => "Slowed or stunned foes take +" + pc(30 * p) + " bonus damage" },
  { n: "Overpower", c: "#ff9060", s: false, d: (p) => "Hits often add bonus damage equal to " + pc(2 * p) + " of your max HP" },
  { n: "Giant Slayer", c: "#ffb060", s: false, d: (p) => "+" + pc(12 * p) + " damage to foes with more max HP than you" },
  { n: "Berserk Edge", c: "#ff5030", s: false, d: (p) => "Deal up to +" + pc(40 * p) + " damage the more HP you are missing" },
  { n: "Combo Chain", c: "#ffe080", s: false, d: (p) => "Repeated hits on one foe stack +" + pc(5 * p) + " damage (up to 5 stacks)" },
  { n: "Ricochet", c: "#f0e0b0", s: true, d: (p) => cs(0.2, p) + ": the blow ricochets into another foe for 50%" },
  { n: "Piercing Lance", c: "#d0e8ff", s: true, d: () => "Hits pierce into the foe standing behind the target" },
  { n: "Whirlwind", c: "#d0d8e0", s: true, d: (p) => cs(0.08, p) + ": spin and hit every adjacent foe" },
  { n: "Terror Strike", c: "#a888d8", s: true, d: (p) => cs(0.1, p) + ": terrify the target so it flees for 2 turns" },
  { n: "Sapping Blow", c: "#9070b0", s: false, d: (p) => cs(0.3, p) + ": weaken the target (it deals 30% less damage)" },
  { n: "Charm", c: "#ff80ff", s: true, d: (p) => cs(0.025, p) + ": charm a normal foe - it fights for you for 3 turns" },
  { n: "Plunder", c: "#ff80a0", s: false, d: (p) => cs(0.015, p) + ": knock a healing potion loose" },
  { n: "Mana Surge", c: "#80a0ff", s: true, d: (p) => cs(0.05, p) + ": unleash one of your weapon spells for free" },
  { n: "Static Charge", c: "#c0d0ff", s: true, d: (p) => "Every 5th hit discharges a lightning nova (" + pc(60 * p) + " ATK)" },
  { n: "Blood Pact", c: "#b00020", s: false, d: (p) => "Hits deal +" + pc(20 * p) + " damage but cost 1% of your HP (above 20%)" },
  { n: "Earthsplitter", c: "#c09060", s: true, d: (p) => cs(0.06, p) + ": the ground splits in a line through the target" },
  { n: "Hellbrand", c: "#ff2a40", s: true, d: (p) => cs(0.15, p) + ": brand the ground beneath the target with hellfire" },
  { n: "Miasma", c: "#80c060", s: true, d: (p) => cs(0.07, p) + ": release a choking cloud around the target" },
  { n: "Frost Nova", c: "#a0f0ff", s: true, d: (p) => cs(0.05, p) + ": a frost nova freezes everything next to you" },
  { n: "Lightning Rod", c: "#b0b8ff", s: true, d: (p) => cs(0.08, p) + ": call lightning down on a random foe in sight" },
  { n: "Reaper's Toll", c: "#9a9ab0", s: false, d: (p) => "+" + pc(50 * p) + " damage to non-boss foes below 30% HP" },
  { n: "Midas Touch", c: GOLD, s: false, d: (p) => "Killing blows turn the foe to gold (+" + pc(100 * p) + " gold)" },
  { n: "Siphon Ward", c: "#9ae8ff", s: false, d: (p) => "Hits restore a spectral ward worth " + pc(8 * p) + " of the damage" },
  { n: "Haste Strike", c: "#80ffc0", s: true, d: (p) => cs(0.03, p) + ": gain a free turn - enemies don't act" },
  { n: "Disarm", c: "#c0c0c0", s: true, d: (p) => cs(0.06, p) + ": disarm the target, cutting its attack by 20%" },
  { n: "Banish", c: "#e0a0ff", s: true, d: (p) => cs(0.015, p) + ": banish a non-boss foe far across the floor" },
  { n: "Starfall", c: "#fff0a0", s: true, d: (p) => cs(0.05, p) + ": three falling stars strike nearby foes" },
  { n: "Kinslayer", c: "#ff8080", s: true, d: (p) => pc(20 * p) + " of each hit spreads to nearby foes of the same kind" },
  { n: "Corpse Burst", c: "#ffb040", s: true, d: () => "Foes you kill explode, damaging those around them" },
  { n: "Prism Ray", c: "#ff60e0", s: true, d: (p) => cs(0.04, p) + ": fire a rainbow beam through every foe in a line" },
  // ---- armor passives (50-99) ----
  { n: "Thornmail", c: "#a0d080", s: true, d: (p) => "Reflect " + pc(20 * p) + " of melee and ranged damage taken" },
  { n: "Vampiric Aura", c: "#ff3060", s: true, d: (p) => "Drain adjacent foes each turn (" + pc(8 * p) + " ATK) and heal half" },
  { n: "Mirror Image", c: "#c0e0ff", s: true, d: (p) => cs(0.06, p) + " when hit: spawn mirror images that absorb this and the next 2 hits" },
  { n: "Gold Find", c: GOLD, s: false, d: (p) => "+" + pc(20 * p) + " gold from kills and pickups" },
  { n: "Magic Find", c: "#c060ff", s: false, d: (p) => cs(0.06, p) + " for Normal through Mythic drops to be upgraded one rarity" },
  { n: "Second Wind", c: "#60ff80", s: false, d: (p) => "Once per floor, dropping below 25% HP heals " + pc(Math.min(60, 30 * p)) },
  { n: "Last Stand", c: "#ffd0a0", s: false, d: () => "Once per floor, a lethal blow leaves you at 1 HP" },
  { n: "Regrowth", c: "#80ff80", s: false, d: (p) => "Regenerate " + (Math.round(5 * p) / 10) + "% max HP every turn, even in combat" },
  { n: "Bulwark", c: "#a0b0c0", s: false, d: (p) => "Big hits (over 15% max HP) lose " + pc(Math.min(70, 30 * p)) + " of the excess" },
  { n: "Spiked Carapace", c: "#c04040", s: false, d: () => "Foes that hit you start bleeding" },
  { n: "Frost Armor", c: "#80e0ff", s: false, d: () => "Foes that hit you are chilled (slowed 2 turns)" },
  { n: "Static Shell", c: "#9aa8ff", s: true, d: (p) => cs(0.2, p) + " when hit: arcs of lightning strike the attacker and a neighbor" },
  { n: "Phoenix Plume", c: "#ff8030", s: true, d: (p) => "Below 50% HP, hits have " + pc(efc(0.08, p) * 100) + " to erupt in a fire nova" },
  { n: "Guardian Spirit", c: "#fff2a0", s: true, d: (p) => "A guardian spirit joins you every " + Math.max(8, Math.round(25 / p)) + " turns" },
  { n: "Shadow Step", c: "#8080a0", s: false, d: () => "After each kill, the next attack against you misses" },
  { n: "Sprinter's Rush", c: "#80ffc0", s: false, d: (p) => "Moving 3 tiles in a row makes your next hit deal +" + pc(30 * p) },
  { n: "Retribution", c: "#fff8c0", s: true, d: (p) => "Every " + Math.max(3, Math.round(6 / p)) + " hits taken unleash a holy nova" },
  { n: "Iron Skin", c: "#c0c8d0", s: false, d: () => "The first hit you take on each floor deals no damage" },
  { n: "Adrenaline", c: "#ff6040", s: false, d: (p) => "Below 35% HP you deal +" + pc(25 * p) + " damage" },
  { n: "Battle Trance", c: "#ffa040", s: false, d: (p) => "Kills grant +" + pc(4 * p) + " damage for 10 turns (stacks 5x)" },
  { n: "Treasure Hunter", c: GOLD, s: false, d: (p) => "Chests hold " + pc(100 * p) + " extra gold" },
  { n: "Scavenger", c: "#ff80a0", s: false, d: (p) => cs(0.04, p) + " for slain foes to drop a healing potion" },
  { n: "Wisdom", c: "#b090ff", s: false, d: (p) => "+" + pc(10 * p) + " experience from kills" },
  { n: "Lucky Charm", c: "#80ff80", s: false, d: (p) => cs(0.03, p) + " that a hit heals you instead of hurting" },
  { n: "Counterstrike", c: "#ffffff", s: true, d: (p) => cs(0.12, p) + " to instantly strike back at an adjacent attacker" },
  { n: "Stoneform", c: "#a09080", s: false, d: (p) => "Take " + pc(Math.min(50, 12 * p)) + " less damage on turns you stand your ground" },
  { n: "Evasive Footwork", c: "#c0ffc0", s: false, d: (p) => "After moving, " + cs(0.1, p) + " to dodge attacks" },
  { n: "Deflector", c: "#e0e0ff", s: true, d: (p) => cs(0.25, p) + " to deflect ranged shots back at the shooter" },
  { n: "Soul Ward", c: "#9ae8ff", s: false, d: (p) => "Kills grant a spectral ward worth " + pc(3 * p) + " of max HP" },
  { n: "Blood Rage", c: "#ff2020", s: false, d: (p) => "Damage taken builds rage; your next hit spends it for up to +" + pc(50 * p) },
  { n: "Plague Bearer", c: "#70d040", s: false, d: () => "Foes next to you catch poison" },
  { n: "Holy Aegis", c: "#fff6c0", s: true, d: () => "Every 12 turns a holy aegis forms and blocks the next hit" },
  { n: "Time Dilation", c: "#c0a0ff", s: true, d: (p) => cs(0.06, p) + " when hit: time slows for every foe within 3 tiles" },
  { n: "Repulsor", c: "#e0c080", s: true, d: (p) => cs(0.2, p) + " when hit: hurl the attacker 2 tiles away" },
  { n: "Starlight", c: "#fff0a0", s: true, d: (p) => "Every 6 turns a star falls on a foe in sight (" + pc(70 * p) + " ATK)" },
  { n: "Inferno Heart", c: "#ff6020", s: true, d: () => "Slain foes leave burning ground behind" },
  { n: "Frozen Heart", c: "#a0f0ff", s: true, d: () => "Dropping below 30% HP freezes everything around you (15-turn cooldown)" },
  { n: "Gold Guard", c: GOLD, s: false, d: (p) => "Spend gold to absorb " + pc(Math.min(40, 20 * p)) + " of each hit (1g per point)" },
  { n: "Pickpocket", c: GOLD, s: false, d: (p) => cs(0.1, p) + " to pick an attacker's pocket for gold" },
  { n: "Bounty Hunter", c: "#ffb060", s: false, d: (p) => "Elites and bosses give +" + pc(50 * p) + " gold and sometimes an extra item" },
  { n: "Cartographer", c: "#80ffff", s: false, d: (p) => cs(0.3, p) + " to sense the stairs on arriving at a floor" },
  { n: "Lockpicker", c: "#ffd080", s: false, d: (p) => cs(0.2, p) + " for chests to hold an extra item" },
  { n: "Hearty", c: "#ff80a0", s: false, d: (p) => "Potions heal " + pc(25 * p) + " more" },
  { n: "Alchemist", c: "#a0ffa0", s: false, d: (p) => cs(0.08, p) + " that drinking a potion doesn't use it up" },
  { n: "Beastmaster's Bond", c: "#ffc080", s: false, d: (p) => "Summoned spirits +" + pc(40 * p) + " damage, your pet +" + pc(15 * p) },
  { n: "Echo Armor", c: "#80ffe0", s: false, d: (p) => cs(0.08, p) + " that your spells echo a second time" },
  { n: "Arcane Conduit", c: "#a080ff", s: false, d: (p) => "Weapon spells trigger " + pc(20 * p) + " more often" },
  { n: "Unstoppable", c: "#80c0ff", s: true, d: (p) => "Blocked attacks reflect " + pc(50 * p) + " of their force" },
  { n: "Wraith Form", c: "#b0b0ff", s: true, d: (p) => cs(0.03, p) + " when hit: become a wraith, immune for 2 turns" },
  { n: "Doomsayer", c: "#c06080", s: false, d: (p) => "Foes that hit you are marked: you deal them +" + pc(20 * p) + " damage" },
];
const EF_NAMES_UNIQUE = EFX.length === 100;
function rollEf(k: Kind, rar: number): number[][] | undefined {
  const n = rar >= 7 ? 3 : rar >= 6 ? 2 : rar >= 5 ? (R() < 0.5 ? 2 : 1) : rar >= 4 ? 1 : R() < [0.04, 0.1, 0.22, 0.45][rar] ? 1 : 0;
  if (!n || (k as string) === "pet") return undefined;
  const base = isArmor(k) || k === "shield" ? 50 : 0;
  const out: number[][] = [];
  const used = new Set<number>();
  while (out.length < n) { const id = base + ri(50); if (used.has(id)) continue; used.add(id); out.push([id, Math.round((0.6 + rar * 0.2 + R() * 0.3) * 100) / 100]); }
  return out;
}
function efDesc(e: number[]): string { const d = EFX[e[0]]; return d ? d.n + ": " + d.d(e[1]) : ""; }
function efP(g: Game, id: number): number {
  let s = 0;
  for (const k of EQK) { const it = g.eq[k]; if (it && it.ef) for (const e of it.ef) if (e[0] === id) s += e[1]; }
  return Math.min(3, s);
}
const okMinor = (e: En): boolean => e.cls < 2 && !e.gob && !e.hunt;
function efSfx(g: Game, id: number): void { if (EFX[id] && EFX[id].s) g.sfx("mx", efSnd(id)); }
function efDmg(g: Game, e: En, raw: number, c: string, pierce: number = 0.5): number {
  if (e.hp <= 0 || !(raw > 0)) return 0;
  const dmg = Math.max(1, Math.round(dmgF(raw, e.def * pierce) * (0.9 + R() * 0.2)));
  markHitDir(g, e);
  e.hp -= dmg; e.hit = 0.18; e.awake = true;
  floatTxt(g, e.x + (R() - 0.5) * 0.6, e.y - 0.3, String(dmg), c);
  if (e.hp <= 0) kill(g, e);
  return dmg;
}
function pushEn(g: Game, e: En, fx: number, fy: number, n: number): number {
  const dx = Math.sign(e.x - fx), dy = Math.sign(e.y - fy);
  let moved = 0;
  for (let i = 0; i < n; i++) {
    const nx = e.x + dx, ny = e.y + dy;
    if ((dx === 0 && dy === 0) || !walkable(g, nx, ny) || (nx === g.hero.x && ny === g.hero.y)) break;
    e.x = nx; e.y = ny; moved++;
  }
  return moved;
}
function stepToward(g: Game, e: En, x: number, y: number): void {
  const dx = Math.sign(x - e.x), dy = Math.sign(y - e.y);
  for (const [ox, oy] of [[dx, 0], [0, dy]]) { if (ox === 0 && oy === 0) continue; const nx = e.x + ox, ny = e.y + oy; if (walkable(g, nx, ny) && !(nx === g.hero.x && ny === g.hero.y) && !(nx === x && ny === y)) { e.x = nx; e.y = ny; return; } }
}
// damage multiplier from armor effects on your own strikes
function efDmgMul(g: Game, tg: En, st: Stats): number {
  const es = esOf(g);
  let m = 1, p = 0;
  if ((p = efP(g, 68)) > 0 && g.hero.hp < st.maxHp * 0.35) m += 0.25 * p;
  if ((p = efP(g, 69)) > 0) m += es.tr * 0.04 * p;
  if ((p = efP(g, 65)) > 0 && es.rush >= 3) m += 0.3 * p;
  if ((p = efP(g, 79)) > 0) m += es.rage * 0.5 * p;
  if ((p = efP(g, 99)) > 0 && (tg.mk ?? 0) > 0) m += 0.2 * p;
  return m;
}
function efAfterStrike(g: Game): void { const es = esOf(g); if (es.rush >= 3) es.rush = 0; es.rage = 0; }
function efOnHit(g: Game, tg: En, dmg: number, crit: boolean, st: Stats, died: boolean): void {
  for (const k of ["rh", "lh"] as EqKey[]) {
    const it = g.eq[k];
    if (!it || !it.ef || isArmor(it.kind) || it.kind === "shield") continue;
    for (const e of it.ef) if (e[0] < 50) efHit1(g, e[0], e[1], tg, dmg, crit, st, died);
  }
}
function efHit1(g: Game, id: number, p: number, tg: En, dmg: number, crit: boolean, st: Stats, died: boolean): void {
  const h = g.hero, es = esOf(g), c = EFX[id].c;
  const tx = tg.ax * TS + 12, ty = tg.ay * TS + 12, hx = h.ax * TS + 12, hy = h.ay * TS + 12;
  const alive = tg.hp > 0;
  const snd = (): void => efSfx(g, id);
  switch (id) {
    case 0: heal(g, dmg * 0.04 * p, false); break;
    case 1: if (R() < efc(0.12, p)) {
      let cur = tg; const hit: En[] = [tg]; const n = 2 + Math.floor(p);
      for (let i = 0; i < n; i++) {
        let nx: En | null = null, bd = 99;
        for (const o of g.en) { if (o.hp <= 0 || hit.includes(o)) continue; const dd = Math.abs(o.x - cur.x) + Math.abs(o.y - cur.y); if (dd <= 4 && dd < bd) { bd = dd; nx = o; } }
        if (!nx) break;
        fxAdd(g, "arc", cur.ax * TS + 12, cur.ay * TS + 12, nx.ax * TS + 12, nx.ay * TS + 12, 0.3, c, "#ffffff", 1);
        efDmg(g, nx, st.atk * 0.3 * p, c); hit.push(nx); cur = nx;
      }
      snd();
    } break;
    case 2: if (alive && R() < efc(0.25, p)) { tg.burn = Math.max(tg.burn, 3); tg.burnD = Math.max(tg.burnD, Math.max(1, Math.round(dmg * 0.15 * p))); burst(g, tx, ty, 8, [c, "#ffe060"], 50, -40); snd(); } break;
    case 3: if (alive && R() < efc(0.25, p)) { tg.slow = Math.max(tg.slow, 2); if (okMinor(tg) && R() < 0.15) { tg.stun = Math.max(tg.stun, 1); floatTxt(g, tg.x, tg.y - 0.6, "FROZEN", "#c8f4ff"); } burst(g, tx, ty, 8, [c, "#ffffff"], 40, 20); snd(); } break;
    case 4: if (alive && okMinor(tg) && tg.hp < tg.mhp * 0.06 * p) { floatTxt(g, tg.x, tg.y - 0.7, "EXECUTE", c); fxAdd(g, "pillar", tx, ty, 0, 0, 0.35, c, "#ffffff", 8); markHitDir(g, tg); tg.hp = 0; kill(g, tg); snd(); } break;
    case 5: if (crit && alive && R() < efc(0.35, p)) { efDmg(g, tg, st.atk * 0.6, c); if (R() < 0.5) efDmg(g, tg, st.atk * 0.3, c); floatTxt(g, tg.x, tg.y - 0.9, "CASCADE", c); burst(g, tx, ty, 10, [c, "#ffffff"], 90, 40); snd(); } break;
    case 6: if (R() < efc(0.05, p) && g.allies.length < 4) { g.allies.push({ t: 4, el: "holy", pw: st.atk * 0.3 * p, ph: R() * 6.28 }); fxAdd(g, "ring", hx, hy, 0, 0, 0.35, c, "#ffffff", TS); floatTxt(g, h.x, h.y - 0.9, "SPIRIT", c); snd(); } break;
    case 7: if (R() < efc(0.04, p)) { for (const o of nearEnemies(g, h.x, h.y, 2)) { if (okMinor(o)) o.stun = Math.max(o.stun, 1); else o.slow = Math.max(o.slow, 2); } fxAdd(g, "ring", hx, hy, 0, 0, 0.6, c, "#ffffff", 2.5 * TS); floatTxt(g, h.x, h.y - 0.9, "TIME WARP", c); snd(); } break;
    case 8: if (R() < efc(0.1, p)) { const n = Math.max(1, Math.round((1 + g.depth * 0.3) * p)); g.gold += n; floatTxt(g, tg.x, tg.y - 0.9, "+" + n + "g", GOLD); burst(g, tx, ty, 6, [GOLD, "#fff0a0"], 60, 80); g.sfx("coin"); } break;
    case 9: if (alive && R() < 0.5) { tg.def = Math.max(0, Math.round(tg.def * (1 - 0.06 * p))); burst(g, tx, ty, 4, ["#a0a0a0", c], 40, 60); } break;
    case 10: if (alive && R() < efc(0.25, p)) { tg.bl = 3; tg.blD = Math.max(tg.blD ?? 0, Math.max(1, Math.round(Math.min(tg.mhp * 0.01 * p, st.atk * 0.4 * p)))); burst(g, tx, ty, 6, ["#c00020", c], 40, 80); snd(); } break;
    case 11: if (alive) { tg.poi = Math.min(5, (tg.poi ?? 0) + 1); tg.poD = Math.max(tg.poD ?? 0, Math.max(1, Math.round(st.atk * 0.04 * p))); if (R() < 0.3) burst(g, tx, ty, 3, [c, "#40ff40"], 20, -20); } break;
    case 12: if (R() < efc(0.08, p)) { for (const o of nearEnemies(g, h.x, h.y, 1)) { if (o.hp <= 0) continue; if (okMinor(o)) pushEn(g, o, h.x, h.y, 1); efDmg(g, o, st.atk * 0.4, c); } fxAdd(g, "ring", hx, hy, 0, 0, 0.4, c, "#ffffff", 1.5 * TS); g.shake = Math.max(g.shake, 3); snd(); } break;
    case 13: if (alive && okMinor(tg) && R() < efc(0.2, p)) { if (pushEn(g, tg, h.x, h.y, 1) === 0) { efDmg(g, tg, st.atk * 0.3, c); floatTxt(g, tg.x, tg.y - 0.7, "SLAM", c); } snd(); } break;
    case 14: if (alive && R() < efc(0.15, p)) es.q.push([tg.id, Math.max(1, dmg * 0.4), 1, 14]); break;
    case 15: if (alive && !tg.doom && R() < efc(0.05, p)) { tg.doom = 3; tg.doomD = Math.max(1, Math.round(dmg * 1.5)); floatTxt(g, tg.x, tg.y - 0.8, "DOOMED", c); snd(); } break;
    case 16: if (died) heal(g, st.maxHp * 0.04 * p, true); break;
    case 17: if (R() < efc(0.04, p)) { fxAdd(g, "meteor", tx, ty, 0, 0, 0.55, c, "#ffe060", 1.5 * TS); for (const o of nearEnemies(g, tg.x, tg.y, 1)) efDmg(g, o, st.atk, c); snd(); } break;
    case 18: if (R() < efc(0.08, p)) { fxAdd(g, "pillar", tx, ty, 0, 0, 0.4, c, "#ffffff", 10); if (alive) efDmg(g, tg, st.atk * 0.6 * (UNDEAD.includes(tg.f) ? 2 : 1), c); heal(g, st.maxHp * 0.01, false); snd(); } break;
    case 19: if (R() < efc(0.05, p)) { for (const o of nearEnemies(g, tg.x, tg.y, 3)) if (o !== tg && okMinor(o)) stepToward(g, o, tg.x, tg.y); fxAdd(g, "vortex", tx, ty, 0, 0, 0.6, c, "#2a0040", 22); snd(); } break;
    case 20: if (alive && (tg.slow > 0 || tg.stun > 0)) { efDmg(g, tg, dmg * 0.3 * p, c); if (R() < 0.3) { floatTxt(g, tg.x, tg.y - 0.8, "SHATTER", c); snd(); } } break;
    case 21: if (alive && R() < 0.5) efDmg(g, tg, st.maxHp * 0.02 * p, c); break;
    case 22: if (alive && tg.mhp > st.maxHp) efDmg(g, tg, dmg * 0.12 * p, c); break;
    case 23: { const m = 1 - h.hp / st.maxHp; if (alive && m > 0.1) efDmg(g, tg, dmg * m * 0.4 * p, c); } break;
    case 24: { if (es.cid === tg.id) es.combo = Math.min(5, es.combo + 1); else { es.combo = 0; es.cid = tg.id; } if (alive && es.combo > 0) { efDmg(g, tg, dmg * es.combo * 0.05 * p, c); if (es.combo === 5 && R() < 0.3) floatTxt(g, tg.x, tg.y - 0.9, "COMBO x5", c); } } break;
    case 25: if (R() < efc(0.2, p)) { const l = nearEnemies(g, tg.x, tg.y, 3).filter((o: En) => o !== tg); if (l.length) { const o = pick(l); fxAdd(g, "bolt", tx, ty, o.ax * TS + 12, o.ay * TS + 12, 0.2, c, "#ffffff", 3); efDmg(g, o, dmg * 0.5, c); snd(); } } break;
    case 26: { const o = enemyAt(g, tg.x + Math.sign(tg.x - h.x), tg.y + Math.sign(tg.y - h.y)); if (o && o !== tg) { fxAdd(g, "beam", tx, ty, o.ax * TS + 12, o.ay * TS + 12, 0.25, c, "#ffffff", 3); efDmg(g, o, dmg * 0.6 * Math.min(1.5, p), c); snd(); } } break;
    case 27: if (R() < efc(0.08, p)) { for (const o of nearEnemies(g, h.x, h.y, 1)) if (o !== tg) efDmg(g, o, st.atk * 0.7, c); fxAdd(g, "blades", hx, hy, 0, 0, 0.5, c, "#ffffff", 22); snd(); } break;
    case 28: if (alive && okMinor(tg) && R() < efc(0.1, p)) { tg.fear = Math.max(tg.fear, 2); floatTxt(g, tg.x, tg.y - 0.6, "FEAR", c); snd(); } break;
    case 29: if (alive && R() < efc(0.3, p)) tg.weak = Math.max(tg.weak, 3); break;
    case 30: if (alive && tg.cls === 0 && !tg.gob && !tg.hunt && R() < efc(0.025, p)) { tg.chm = 3; floatTxt(g, tg.x, tg.y - 0.8, "CHARMED", c); burst(g, tx, ty, 10, [c, "#ffc0ff"], 50, -40); snd(); } break;
    case 31: if (R() < efc(0.015, p)) { g.drops.push({ x: tg.x, y: tg.y, item: null, pot: true, gold: 0 }); floatTxt(g, tg.x, tg.y - 1, "POTION!", c); } break;
    case 32: if (R() < efc(0.05, p)) { const sps = weaponSpells(g.eq); const t2 = alive ? tg : nearestEnemy(g, 6); if (t2) { if (sps.length) castSpell(g, sps[0], t2, st, true); else { fxAdd(g, "bolt", hx, hy, t2.ax * TS + 12, t2.ay * TS + 12, 0.24, c, "#ffffff", 4); efDmg(g, t2, st.atk * 0.8, c); } floatTxt(g, h.x, h.y - 0.9, "SURGE", c); snd(); } } break;
    case 33: { es.chg++; if (es.chg >= 5) { es.chg = 0; fxAdd(g, "ring", hx, hy, 0, 0, 0.45, c, "#ffffff", 2.5 * TS); for (const o of nearEnemies(g, h.x, h.y, 2)) efDmg(g, o, st.atk * 0.6 * p, c); snd(); } } break;
    case 34: { if (h.hp > st.maxHp * 0.2) h.hp = Math.max(1, h.hp - Math.round(st.maxHp * 0.01)); if (alive) efDmg(g, tg, dmg * 0.2 * p, c); } break;
    case 35: if (R() < efc(0.06, p)) { const line = lineTiles(g, h.x, h.y, tg.x, tg.y, 4); for (const [x, y] of line) { const o = enemyAt(g, x, y); if (o) efDmg(g, o, dmg * 0.7, c); } const end = line.length ? line[line.length - 1] : [tg.x, tg.y]; fxAdd(g, "spikes", hx, hy, end[0] * TS + 12, end[1] * TS + 12, 0.5, c, "#ffffff", 6); snd(); } break;
    case 36: if (R() < efc(0.15, p)) { addGround(g, tg.x, tg.y, "hell", 3, Math.max(1, Math.round(st.atk * 0.2 * p))); snd(); } break;
    case 37: if (R() < efc(0.07, p)) { for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) addGround(g, tg.x + xx, tg.y + yy, "dark", 3, Math.max(1, Math.round(st.atk * 0.12 * p))); fxAdd(g, "cloud", tx, ty, 0, 0, 0.8, c, "#40ff60", 1.5 * TS); snd(); } break;
    case 38: if (R() < efc(0.05, p)) { for (const o of nearEnemies(g, h.x, h.y, 1)) { if (okMinor(o)) o.stun = Math.max(o.stun, 1); o.slow = Math.max(o.slow, 2); } fxAdd(g, "ring", hx, hy, 0, 0, 0.5, c, "#ffffff", 1.5 * TS); snd(); } break;
    case 39: if (R() < efc(0.08, p)) { const o = randomNear(g, 5); if (o) { fxAdd(g, "pillar", o.ax * TS + 12, o.ay * TS + 12, 0, 0, 0.35, c, "#ffffff", 8); efDmg(g, o, st.atk * 0.9, c); snd(); } } break;
    case 40: if (alive && okMinor(tg) && tg.hp < tg.mhp * 0.3) efDmg(g, tg, dmg * 0.5 * p, c); break;
    case 41: if (died) { const n = Math.max(1, Math.round((2 + g.depth * 1.2) * p)); g.gold += n; floatTxt(g, tg.x, tg.y - 1.2, "MIDAS +" + n + "g", GOLD); burst(g, tx, ty, 14, [GOLD, "#fff0a0", "#ffffff"], 80, 60); g.sfx("coin"); } break;
    case 42: { const cap = Math.max(st.ward, st.maxHp * 0.15); g.ward = Math.min(cap, g.ward + dmg * 0.08 * p); } break;
    case 43: if (R() < efc(0.03, p)) { es.free = 1; floatTxt(g, h.x, h.y - 0.9, "HASTE!", c); fxAdd(g, "ring", hx, hy, 0, 0, 0.3, c, "#ffffff", TS); snd(); } break;
    case 44: if (alive && !tg.dis && R() < efc(0.06, p)) { tg.dis = 1; tg.atk = Math.max(1, Math.round(tg.atk * 0.8)); floatTxt(g, tg.x, tg.y - 0.8, "DISARMED", c); snd(); } break;
    case 45: if (alive && okMinor(tg) && R() < efc(0.015, p)) {
      for (let k = 0; k < 60; k++) { const x = ri(MW), y = ri(MH); if (g.map[y * MW + x] === 1 && Math.abs(x - h.x) + Math.abs(y - h.y) > 12 && walkable(g, x, y)) { fxAdd(g, "vortex", tx, ty, 0, 0, 0.6, c, "#2a0040", 18); floatTxt(g, tg.x, tg.y - 0.8, "BANISHED", c); tg.x = x; tg.y = y; tg.ax = x; tg.ay = y; snd(); break; } }
    } break;
    case 46: if (R() < efc(0.05, p)) { for (let i = 0; i < 3; i++) { const o = randomNear(g, 4); if (o) { fxAdd(g, "bolt", hx, hy - 20, o.ax * TS + 12, o.ay * TS + 12, 0.25, c, "#ffffff", 3); efDmg(g, o, dmg * 0.4, c); } } snd(); } break;
    case 47: { let any = false; for (const o of g.en) if (o !== tg && o.hp > 0 && o.f === tg.f && Math.abs(o.x - tg.x) + Math.abs(o.y - tg.y) <= 5) { efDmg(g, o, dmg * 0.2 * p, c); fxAdd(g, "arc", tx, ty, o.ax * TS + 12, o.ay * TS + 12, 0.25, c, "#ffffff", 1); any = true; } if (any) snd(); } break;
    case 48: if (died) { const dm = Math.min(tg.mhp * 0.25, st.atk * 2 * p); for (const o of nearEnemies(g, tg.x, tg.y, 1)) efDmg(g, o, dm, c); fxAdd(g, "ring", tx, ty, 0, 0, 0.4, c, "#ffe060", 1.5 * TS); burst(g, tx, ty, 20, [c, "#ffe060", tg.pal[1]], 100, 60); snd(); } break;
    case 49: if (R() < efc(0.04, p)) { const dx = Math.sign(tg.x - h.x), dy = Math.sign(tg.y - h.y); const line = lineTiles(g, h.x, h.y, h.x + dx * 6, h.y + dy * 6, 6); for (const [x, y] of line) { const o = enemyAt(g, x, y); if (o) efDmg(g, o, dmg, "hsl(" + ri(360) + ",100%,65%)"); } const end = line.length ? line[line.length - 1] : [tg.x, tg.y]; fxAdd(g, "beam", hx, hy, end[0] * TS + 12, end[1] * TS + 12, 0.4, "hsl(" + ri(360) + ",100%,60%)", "#ffffff", 6); snd(); } break;
    default: break;
  }
}
// armor: before damage lands (returns the damage that gets through)
function efPreHurt(g: Game, e: En, dmgIn: number, st: Stats, ranged: boolean): number {
  const es = esOf(g), h = g.hero;
  let dmg = dmgIn, p = 0;
  const say = (t: string, id: number): number => { floatTxt(g, h.x, h.y - 0.5, t, EFX[id].c); return 0; };
  if (es.eth > 0) return say("WRAITH", 98);
  if (es.aegis > 0) { es.aegis = 0; fxAdd(g, "ward", h.ax * TS + 12, h.ay * TS + 12, 0, 0, 0.4, EFX[81].c, "#ffffff", 18); efSfx(g, 81); return say("AEGIS", 81); }
  if (es.decoy > 0) { es.decoy--; return say("MIRROR", 52); }
  if (es.dodge > 0) { es.dodge = 0; return say("DODGE", 64); }
  if (efP(g, 67) > 0 && !es.iron) { es.iron = true; return say("IRON SKIN", 67); }
  if ((p = efP(g, 52)) > 0 && R() < efc(0.06, p)) { es.decoy = 2; fxAdd(g, "ring", h.ax * TS + 12, h.ay * TS + 12, 0, 0, 0.4, EFX[52].c, "#ffffff", TS); efSfx(g, 52); return say("MIRROR IMAGE", 52); }
  if ((p = efP(g, 76)) > 0 && es.moved > 0 && R() < efc(0.1, p)) return say("EVADE", 76);
  if ((p = efP(g, 77)) > 0 && ranged && R() < efc(0.25, p)) { fxAdd(g, "bolt", h.ax * TS + 12, h.ay * TS + 12, e.ax * TS + 12, e.ay * TS + 12, 0.2, EFX[77].c, "#ffffff", 3); efDmg(g, e, dmg, EFX[77].c, 0); efSfx(g, 77); return say("DEFLECT", 77); }
  if ((p = efP(g, 73)) > 0 && R() < efc(0.03, p)) { heal(g, dmg, true); return say("LUCKY!", 73); }
  if ((p = efP(g, 75)) > 0 && es.still) dmg *= 1 - Math.min(0.5, 0.12 * p);
  if ((p = efP(g, 58)) > 0) { const cap = st.maxHp * 0.15; if (dmg > cap) dmg = cap + (dmg - cap) * (1 - Math.min(0.7, 0.3 * p)); }
  if ((p = efP(g, 87)) > 0 && g.gold > 0) { const ab = Math.min(g.gold, Math.round(dmg * Math.min(0.4, 0.2 * p))); if (ab > 0) { g.gold -= ab; dmg -= ab; floatTxt(g, h.x - 0.3, h.y - 0.6, "-" + ab + "g", GOLD); } }
  dmg = Math.max(0, Math.round(dmg));
  if (efP(g, 56) > 0 && !es.last && dmg >= h.hp) { dmg = Math.max(0, Math.ceil(h.hp) - 1); es.last = true; g.flash = 0.3; g.flashC = EFX[56].c; floatTxt(g, h.x, h.y - 0.9, "LAST STAND", EFX[56].c); }
  return dmg;
}
// armor: after a hit landed and you survived
function efPostHurt(g: Game, e: En, dmg: number, st: Stats): void {
  const es = esOf(g), h = g.hero;
  let p = 0;
  const adj = Math.abs(e.x - h.x) + Math.abs(e.y - h.y) <= 1;
  const hx = h.ax * TS + 12, hy = h.ay * TS + 12;
  if ((p = efP(g, 55)) > 0 && !es.wind && h.hp > 0 && h.hp < st.maxHp * 0.25) { es.wind = true; heal(g, st.maxHp * Math.min(0.6, 0.3 * p), true); floatTxt(g, h.x, h.y - 0.9, "SECOND WIND", EFX[55].c); }
  if (dmg > 0) {
    if ((p = efP(g, 50)) > 0 && e.hp > 0) { efDmg(g, e, dmg * 0.2 * p, EFX[50].c, 0); if (g.turn % 3 === 0) efSfx(g, 50); }
    if ((p = efP(g, 79)) > 0) es.rage = Math.min(1, es.rage + dmg / st.maxHp);
  }
  if (efP(g, 59) > 0 && e.hp > 0) { e.bl = 2; e.blD = Math.max(e.blD ?? 0, Math.max(1, Math.round(st.atk * 0.15 * efP(g, 59)))); }
  if (efP(g, 60) > 0 && e.hp > 0) e.slow = Math.max(e.slow, 2);
  if ((p = efP(g, 61)) > 0 && e.hp > 0 && R() < efc(0.2, p)) { fxAdd(g, "arc", hx, hy, e.ax * TS + 12, e.ay * TS + 12, 0.3, EFX[61].c, "#ffffff", 1); efDmg(g, e, st.atk * 0.5, EFX[61].c); const o = nearEnemies(g, e.x, e.y, 2).find((q: En) => q !== e); if (o) { fxAdd(g, "arc", e.ax * TS + 12, e.ay * TS + 12, o.ax * TS + 12, o.ay * TS + 12, 0.3, EFX[61].c, "#ffffff", 1); efDmg(g, o, st.atk * 0.5, EFX[61].c); } efSfx(g, 61); }
  if ((p = efP(g, 62)) > 0 && h.hp < st.maxHp * 0.5 && R() < efc(0.08, p)) { fxAdd(g, "ring", hx, hy, 0, 0, 0.5, EFX[62].c, "#ffe060", 2.5 * TS); for (const o of nearEnemies(g, h.x, h.y, 2)) { efDmg(g, o, st.atk * 0.8, EFX[62].c); o.burn = Math.max(o.burn, 2); o.burnD = Math.max(o.burnD, Math.round(st.atk * 0.1)); } efSfx(g, 62); }
  if ((p = efP(g, 66)) > 0) { es.hits++; if (es.hits >= Math.max(3, Math.round(6 / p))) { es.hits = 0; fxAdd(g, "ring", hx, hy, 0, 0, 0.5, EFX[66].c, "#ffffff", 2.5 * TS); for (const o of nearEnemies(g, h.x, h.y, 2)) efDmg(g, o, st.atk * 1.2, EFX[66].c); efSfx(g, 66); } }
  if ((p = efP(g, 74)) > 0 && adj && e.hp > 0 && R() < efc(0.12, p)) { efDmg(g, e, st.atk * 0.8, EFX[74].c); floatTxt(g, e.x, e.y - 0.8, "COUNTER", EFX[74].c); efSfx(g, 74); }
  if ((p = efP(g, 82)) > 0 && R() < efc(0.06, p)) { for (const o of nearEnemies(g, h.x, h.y, 3)) o.slow = Math.max(o.slow, 2); fxAdd(g, "vortex", hx, hy, 0, 0, 0.6, EFX[82].c, "#ffffff", 30); floatTxt(g, h.x, h.y - 0.9, "TIME SLOWS", EFX[82].c); efSfx(g, 82); }
  if ((p = efP(g, 83)) > 0 && adj && e.hp > 0 && okMinor(e) && R() < efc(0.2, p)) { pushEn(g, e, h.x, h.y, 2); burst(g, e.ax * TS + 12, e.ay * TS + 12, 8, [EFX[83].c, "#ffffff"], 70, 30); efSfx(g, 83); }
  if (efP(g, 86) > 0 && es.frz <= 0 && h.hp < st.maxHp * 0.3) { es.frz = 15; for (const o of nearEnemies(g, h.x, h.y, 2)) { if (okMinor(o) && Math.abs(o.x - h.x) + Math.abs(o.y - h.y) <= 1) o.stun = Math.max(o.stun, 1); o.slow = Math.max(o.slow, 2); } fxAdd(g, "ring", hx, hy, 0, 0, 0.5, EFX[86].c, "#ffffff", 2.5 * TS); floatTxt(g, h.x, h.y - 0.9, "FROZEN HEART", EFX[86].c); efSfx(g, 86); }
  if ((p = efP(g, 88)) > 0 && R() < efc(0.1, p)) { const n = Math.max(1, Math.round(1 + g.depth * 0.5)); g.gold += n; floatTxt(g, e.x, e.y - 0.8, "+" + n + "g", GOLD); }
  if ((p = efP(g, 98)) > 0 && R() < efc(0.03, p)) { es.eth = 2; floatTxt(g, h.x, h.y - 0.9, "WRAITH FORM", EFX[98].c); fxAdd(g, "ward", hx, hy, 0, 0, 0.5, EFX[98].c, "#ffffff", 18); efSfx(g, 98); }
  if (efP(g, 99) > 0 && e.hp > 0) e.mk = 5;
}
function efOnBlock(g: Game, e: En, mul: number): void { const p = efP(g, 97); if (p > 0 && e.hp > 0) { efDmg(g, e, e.atk * mul * 0.5 * p, EFX[97].c, 0); efSfx(g, 97); } }
function efOnKill(g: Game, e: En): void {
  const es = esOf(g); let p = 0;
  if (efP(g, 64) > 0) es.dodge = 1;
  if (efP(g, 69) > 0) { es.tr = Math.min(5, es.tr + 1); es.trT = 10; }
  if ((p = efP(g, 71)) > 0 && R() < efc(0.04, p)) g.drops.push({ x: e.x, y: e.y, item: null, pot: true, gold: 0 });
  if ((p = efP(g, 78)) > 0) { const st = calc(g.lvl, g.eq); g.ward = Math.min(Math.max(st.ward, st.maxHp * 0.15), g.ward + st.maxHp * 0.03 * p); }
  if ((p = efP(g, 85)) > 0) { const dm = Math.max(1, Math.round(calc(g.lvl, g.eq).atk * 0.2 * p)); addGround(g, e.x, e.y, "fire", 3, dm); for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) addGround(g, e.x + ox, e.y + oy, "fire", 2, dm); efSfx(g, 85); }
}
const efGoldMul = (g: Game, e: En | null): number => 1 + 0.2 * efP(g, 53) + (e && e.cls >= 1 ? 0.5 * efP(g, 89) : 0) + (setCounts(g.eq)[7] >= 2 ? 0.25 : 0);
// enemy status ticks from effects (bleed, poison, doom, marks); returns true if it died
function efEnemyTick(g: Game, e: En): boolean {
  if ((e.bl ?? 0) > 0) { e.bl = (e.bl ?? 1) - 1; const d = e.blD ?? 1; markHitDir(g, e); e.hp -= d; e.hit = 0.12; floatTxt(g, e.x, e.y - 0.2, String(d), "#d01030"); }
  if ((e.poi ?? 0) > 0) { const d = (e.poD ?? 1) * (e.poi ?? 1); markHitDir(g, e); e.hp -= d; floatTxt(g, e.x + 0.2, e.y - 0.1, String(d), "#60ff40"); if (R() < 0.25) e.poi = (e.poi ?? 1) - 1; }
  if ((e.doom ?? 0) > 0) { e.doom = (e.doom ?? 1) - 1; if (e.doom === 0 && e.hp > 0) { const d = e.doomD ?? 1; markHitDir(g, e); e.hp -= d; e.hit = 0.25; floatTxt(g, e.x, e.y - 0.6, "DOOM " + d, EFX[15].c); fxAdd(g, "pillar", e.ax * TS + 12, e.ay * TS + 12, 0, 0, 0.4, EFX[15].c, "#ff60ff", 10); efSfx(g, 15); } }
  if ((e.mk ?? 0) > 0) e.mk = (e.mk ?? 1) - 1;
  if (e.hp <= 0) { kill(g, e); return true; }
  return false;
}
// a charmed foe attacks its allies instead of you
function charmAct(g: Game, e: En): void {
  let best: En | null = null, bd = 99;
  for (const o of g.en) { if (o === e || o.hp <= 0) continue; const d = Math.abs(o.x - e.x) + Math.abs(o.y - e.y); if (d <= 4 && d < bd) { bd = d; best = o; } }
  if (!best) return;
  if (bd === 1) { e.bump = 1; e.bdx = Math.sign(best.x - e.x); e.bdy = Math.sign(best.y - e.y); const d = Math.max(1, Math.round(dmgF(e.atk, best.def))); withHit({ dx: best.x - e.x, dy: best.y - e.y }, () => { markHitDir(g, best); best.hp -= d; best.hit = 0.2; best.awake = true; floatTxt(g, best.x, best.y, String(d), "#ff80ff"); if (best.hp <= 0) kill(g, best); }); }
  else stepToward(g, e, best.x, best.y);
}
// armor effects every turn (+ the echo queue)
function efTurn(g: Game, st: Stats): void {
  const es = esOf(g), h = g.hero;
  let p = 0;
  if (es.q.length) {
    const keep: number[][] = [];
    for (const q of es.q) { q[2]--; if (q[2] > 0) { keep.push(q); continue; } const e = g.en.find((o: En) => o.id === q[0] && o.hp > 0); if (e) { fxAdd(g, "blades", e.ax * TS + 12, e.ay * TS + 12, 0, 0, 0.35, EFX[q[3]].c, "#ffffff", 12); efDmg(g, e, q[1], EFX[q[3]].c); efSfx(g, q[3]); } }
    es.q = keep;
  }
  if (es.eth > 0) es.eth--;
  if (es.frz > 0) es.frz--;
  if (es.trT > 0) { es.trT--; if (es.trT === 0) es.tr = 0; }
  if ((p = efP(g, 51)) > 0) { let tot = 0; for (const o of nearEnemies(g, h.x, h.y, 1)) tot += efDmg(g, o, st.atk * 0.08 * p, EFX[51].c, 0.2); if (tot > 0) { heal(g, tot * 0.5, false); if (g.turn % 3 === 0) efSfx(g, 51); } }
  if ((p = efP(g, 57)) > 0) heal(g, st.maxHp * 0.005 * p, false);
  if ((p = efP(g, 63)) > 0 && g.turn % Math.max(8, Math.round(25 / p)) === 0 && g.allies.length < 4) { g.allies.push({ t: 6, el: "holy", pw: st.atk * 0.25 * p, ph: R() * 6.28 }); fxAdd(g, "ring", h.ax * TS + 12, h.ay * TS + 12, 0, 0, 0.35, EFX[63].c, "#ffffff", TS); efSfx(g, 63); }
  if (efP(g, 80) > 0) for (const o of nearEnemies(g, h.x, h.y, 1)) if (R() < 0.2) { o.poi = Math.min(5, (o.poi ?? 0) + 1); o.poD = Math.max(o.poD ?? 0, Math.max(1, Math.round(st.atk * 0.03 * efP(g, 80)))); }
  if (efP(g, 81) > 0 && !es.aegis && g.turn % 12 === 0) { es.aegis = 1; fxAdd(g, "ward", h.ax * TS + 12, h.ay * TS + 12, 0, 0, 0.4, EFX[81].c, "#ffffff", 18); }
  if ((p = efP(g, 84)) > 0 && g.turn % 6 === 0) { const o = randomNear(g, 5); if (o) { fxAdd(g, "pillar", o.ax * TS + 12, o.ay * TS + 12, 0, 0, 0.4, EFX[84].c, "#ffffff", 9); efDmg(g, o, st.atk * 0.7 * p, EFX[84].c); efSfx(g, 84); } }
}
function efFloor(g: Game): void { const es = esOf(g); es.wind = false; es.last = false; es.iron = false; es.q = []; es.combo = 0; es.cid = -1; es.free = 0; }
function efFloorEnd(g: Game): void { const p = efP(g, 90); if (p > 0 && R() < efc(0.3, p)) revealStairs(g); }
// ======================= pets / companions =======================
const PET_CH = 0.05; // share of random drops that are pets
const PET_RANGE = 6;
// each shot = this share of your Attack (before armor); tuned so a pet adds ~10-25% of your damage by rarity
const PSH = [0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.23, 0.28]; // share of your own damage per turn
const PARCH = ["Slime", "Bird", "Cat", "Hound", "Bat", "Bug", "Serpent", "Golem", "Spirit", "Drake"];
const PETN = [
  "Gel Cub", "Ooze Pup", "Magma Slime", "Frost Jelly", "Toxic Blob", "Star Gel", "Mimic Drop", "Crystal Ooze", "Shadow Goo", "Royal Slime",
  "Ember Finch", "Storm Crow", "Frost Owl", "Sun Hawk", "Night Raven", "Thunderbird", "Jade Parrot", "Phoenix Chick", "Gale Swift", "Spirit Heron",
  "Lynx Kit", "Shadow Cat", "Lion Cub", "Snow Leopard", "Tiger Cub", "Spectral Cat", "Sand Cat", "Mana Panther", "Storm Ocelot", "Moon Cat",
  "Wolf Pup", "Hellhound Pup", "Frost Wolf", "Jackal", "Spirit Fox", "War Hound", "Dire Pup", "Coyote", "Kitsune", "Bone Hound",
  "Fruit Bat", "Vampire Bat", "Ember Bat", "Ice Bat", "Thunder Bat", "Void Bat", "Ghost Bat", "Crystal Bat", "Blood Bat", "Moon Bat",
  "Cave Spider", "Jewel Beetle", "Firefly", "Scorpion", "Mantis", "Bone Spider", "Frost Mite", "Storm Wasp", "Gold Scarab", "Shadow Tick",
  "Grass Snake", "Salamander", "Ice Wyrmling", "Cobra", "Sea Serpent", "Basilisk Hatchling", "Gecko", "Axolotl", "Lightning Eel", "Naga Hatchling",
  "Pebble Golem", "Clockwork Drone", "Iron Imp", "Crystal Golem", "Mud Golem", "Lava Golem", "Brass Owl", "Rune Totem", "Scrap Bot", "Ice Golem",
  "Wisp", "Will-o'-Wisp", "Poltergeist", "Banshee Child", "Lantern Ghost", "Soul Flame", "Shade", "Cherub", "Imp", "Djinn Spark",
  "Drakeling", "Frost Drake", "Storm Drake", "Void Dragonling", "Gold Dragonling", "Griffin Chick", "Baby Hydra", "Unicorn Foal", "Owlbear Cub", "Baby Kraken",
];
const PROJN = ["Orb", "Arrow", "Fang", "Spark", "Flame", "Shard", "Leaf", "Bubble", "Skull", "Star"];
const HUEN = ["Crimson", "Ember", "Amber", "Golden", "Lime", "Jade", "Teal", "Azure", "Cobalt", "Violet", "Orchid", "Rose"];
const petHue = (pt: number): number => (pt * 37 + 11) % 360;
const petPB = (pt: number): number => (Math.floor(pt / 10) + (pt % 10)) % 12; // (shape, hue band) is unique for every type
const petCol = (pt: number): string => "hsl(" + (petPB(pt) * 30 + 6) + ",95%,62%)";
const petProjName = (pt: number): string => HUEN[petPB(pt)] + " " + PROJN[petShape(pt)];
function makePet(ilvl: number, rar: number, depth?: number): Item {
  const pt = ri(100);
  const it: Item = { id: NID++, seed: Math.floor(R() * 2147483646) + 1, kind: "pet", rar, ilvl, name: PRE[rar][ri(6)] + " " + PETN[pt], atk: 0, def: 0, block: 0, bonus: {}, d: [0, 0, 0, 0], pt };
  const st = rollStars("pet", rar, false, depth ?? ilvl);
  if (st) it.st = st;
  if (rar >= 7) it.pab = petAbiRoll(it);
  return it;
}
const petPower = (lvl: number, it: Item): number => {
  const stars = it.st ? it.st.length : 0;
  return PSH[Math.max(0, Math.min(7, it.rar))] * Math.min(1, (it.ilvl + 4) / (lvl + 4)) * (1 + 0.12 * stars) * prisStarMul(it);
};
const PET_ABI_N = ["Guardian Aegis", "Prismatic Storm", "Soul Harvest", "Phoenix Bond", "Mirror Twin", "Fortune's Eye"];
const PET_ABI_STAR = 0.08;
function petAbiMul(it: Item): number { return 1 + PET_ABI_STAR * (it.st ? it.st.length : 0); }
function petAbiRoll(it: Item): number {
  const s = (((it.seed >>> 0) * 1103515245) + (((it.pt ?? 0) + 1) * 12345)) >>> 0;
  return s % 6;
}
function ensurePetAbi(it: Item): void {
  if (it.kind !== "pet" || it.rar < 7) { it.pab = undefined; return; }
  if (it.pab === undefined || it.pab < 0 || it.pab > 5) it.pab = petAbiRoll(it);
}
function petAbiFromInputs(a: Item, b: Item, c: Item, out: Item): number {
  const stars = (it: Item): number => it.st ? it.st.length : 0;
  const top = Math.max(stars(a), stars(b), stars(c));
  const tied = [a, b, c].filter((x: Item) => stars(x) === top && x.pab !== undefined && x.pab >= 0 && x.pab <= 5);
  if (tied.length === 1) return tied[0].pab as number;
  if (tied.length > 1) {
    let s = 0;
    for (const x of tied) s ^= (x.seed >>> 0);
    return tied[(s >>> 0) % tied.length].pab as number;
  }
  return petAbiRoll(out);
}
function petAbiOf(g: Game, id?: number): Item | null {
  const it = g.eq.pet;
  if (!it || it.kind !== "pet" || it.rar < 7) return null;
  ensurePetAbi(it);
  if (id !== undefined && it.pab !== id) return null;
  return it;
}
function showPetAbiFx(g: Game, n: string, c: string): void {
  g.petAbiFx = { n, t: (g.petAbiT ?? 0) + 1.2, c };
  g.petAbiPet = g.eq.pet ? g.eq.pet.id : undefined;
  floatTxt(g, g.hero.x, g.hero.y - 0.7, n, c);
}
function petAbiSec(turns: number): number { return Math.max(1, Math.round(turns)); }
function tryPetAegis(g: Game, st: Stats): void {
  const it = petAbiOf(g, 0);
  if (!it) return;
  const now = g.petAbiT ?? 0;
  if ((g.petAegisUntil ?? 0) > now) return;
  if ((g.petAegisCd ?? 0) > now) return;
  if (g.hero.hp / Math.max(1, st.maxHp) >= 0.3) return;
  const mul = petAbiMul(it);
  g.petAegisUntil = now + 3 * mul;
  g.petAegisCd = now + 90 / mul;
  const heal = Math.round(st.maxHp * 0.25 * mul);
  g.hero.hp = Math.min(st.maxHp, g.hero.hp + heal);
  showPetAbiFx(g, "AEGIS", "#ffe080");
  floatTxt(g, g.hero.x, g.hero.y - 0.35, "+" + heal, "#80ff80");
}
function tryPetPhoenix(g: Game, st: Stats): boolean {
  const it = petAbiOf(g, 3);
  if (!it) return false;
  if ((g.petPhoenixD ?? -1) === g.depth) return false;
  g.petPhoenixD = g.depth;
  const mul = petAbiMul(it);
  const frac = Math.min(1, 0.5 * mul);
  g.hero.hp = Math.max(1, Math.round(st.maxHp * frac));
  showPetAbiFx(g, "PHOENIX", "#ff8040");
  burst(g, g.hero.ax * TS + 12, g.hero.ay * TS + 12, 70, ["#ff8040", "#ffe040", "#ffffff"], 140, 50);
  const raw = st.atk * 8 * mul;
  for (const e of nearEnemies(g, g.hero.x, g.hero.y, 3)) {
    if (e.hp <= 0) continue;
    const dmg = Math.max(1, safeRound(magicWepRaw(e, ultBestEl(e), raw)));
    withHit({ ox: g.hero.x, oy: g.hero.y }, () => { hurtEn(g, e, dmg); if (e.hp <= 0) kill(g, e); });
  }
  g.sfx("sparkle");
  return true;
}
function applyHeroDmg(g: Game, dmg: number, shake: number): void {
  const now = g.petAbiT ?? 0;
  if ((g.petAegisUntil ?? 0) > now) {
    floatTxt(g, g.hero.x, g.hero.y, "IMMUNE", "#ffe080");
    return;
  }
  if (dmg <= 0) return;
  const st = calc(g.lvl, g.eq);
  if (dmg >= g.hero.hp && tryPetPhoenix(g, st)) return;
  g.hero.hp -= dmg;
  floatTxt(g, g.hero.x, g.hero.y, "-" + dmg, "#ff5050");
  g.shake = Math.max(g.shake, shake);
  g.sfx("hurt");
  if (g.hero.hp <= 0) { heroDie(g); return; }
  tryPetAegis(g, st);
}
function petStorm(g: Game, mul: number): void {
  const st = calc(g.lvl, g.eq);
  const raw = st.atk * 10 * mul;
  showPetAbiFx(g, "STORM", "#c040ff");
  fxAdd(g, "ring", g.hero.ax * TS + 12, g.hero.ay * TS + 12, 0, 0, 0.45, "#ff80ff", "#40ffff", 3.2 * TS);
  const stunT = petAbiSec(1 * mul / RT_TICK);
  for (const e of nearEnemies(g, g.hero.x, g.hero.y, 3)) {
    const dmg = Math.max(1, safeRound(magicWepRaw(e, ultBestEl(e), raw)));
    withHit({ ox: g.hero.x, oy: g.hero.y }, () => { hurtEn(g, e, dmg); if (e.cls === 0) e.stun = Math.max(e.stun, stunT); if (e.hp <= 0) kill(g, e); });
  }
  g.sfx("sparkle");
}
function petHarvestOnKill(g: Game): void {
  const it = petAbiOf(g, 2);
  if (!it) return;
  const mul = petAbiMul(it);
  const need = Math.max(8, Math.round(25 / mul));
  g.petHarvest = (g.petHarvest ?? 0) + 1;
  if ((g.petHarvest ?? 0) < need) return;
  g.petHarvest = 0;
  const st = calc(g.lvl, g.eq);
  const heal = Math.round(st.maxHp * Math.min(1, 0.3 * mul));
  g.hero.hp = Math.min(st.maxHp, g.hero.hp + heal);
  g.potions++;
  showPetAbiFx(g, "HARVEST", "#80ff80");
  floatTxt(g, g.hero.x, g.hero.y - 0.35, "+" + heal, "#80ff80");
}
function petFortuneDrop(g: Game, e: En, drop: (it: Item) => void): void {
  const it = petAbiOf(g, 5);
  if (!it || e.child || e.gob || e.hunt) return;
  if (!(e.cls >= 1 || e.act)) return;
  const mul = petAbiMul(it);
  STAR_LUCK = mul;
  drop(makeItem(g.depth + (e.cls === 2 || e.act ? 1 : 0), rollRar(e.act ? 1.4 : 1.22, 0, g.depth)));
  STAR_LUCK = 1;
}
function petAbiTick(g: Game, dt: number): void {
  const now = (g.petAbiT ?? 0) + dt;
  g.petAbiT = now;
  const it = petAbiOf(g);
  if (!it) return;
  const mul = petAbiMul(it);
  const id = it.pab ?? -1;
  if (id === 1 && (g.petStormCd ?? 0) <= now) {
    petStorm(g, mul);
    g.petStormCd = now + 20 / mul;
  }
  if (id === 4) {
    if ((g.petTwinUntil ?? 0) <= now && (g.petTwinCd ?? 0) <= now) {
      g.petTwinUntil = now + 8 * mul;
      g.petTwinCd = now + 45 / mul;
      g.petTwinAcc = 0;
      showPetAbiFx(g, "MIRROR TWIN", "#c0e0ff");
    }
    if ((g.petTwinUntil ?? 0) > now) {
      g.petTwinAcc = (g.petTwinAcc ?? 0) + dt;
      const st = calc(g.lvl, g.eq);
      while ((g.petTwinAcc ?? 0) >= RT_ATK) {
        g.petTwinAcc = (g.petTwinAcc as number) - RT_ATK;
        const tg = findTarget(g, st);
        if (!tg) break;
        const dx = Math.sign(tg.x - g.hero.x), dy = Math.sign(tg.y - g.hero.y);
        heroAttack(g, tg, st, Math.abs(tg.x - g.hero.x) + Math.abs(tg.y - g.hero.y), dx, dy, true);
      }
    }
  }
}
function petAbiTitle(it: Item): string {
  ensurePetAbi(it);
  const n = PET_ABI_N[it.pab ?? 0] || "Prismatic Gift";
  const stars = it.st ? it.st.length : 0;
  return n + "  x" + (Math.round(petAbiMul(it) * 100) / 100) + (stars ? "  (" + stars + "\u2605)" : "");
}
function petAbiDesc(it: Item): string {
  ensurePetAbi(it);
  const mul = petAbiMul(it);
  const id = it.pab ?? 0;
  const s = (n: number): string => { const v = Math.round(n * 10) / 10; return String(v); };
  if (id === 0) return "When you drop below 30% HP after a nonlethal hit, gain " + s(3 * mul) + "s full immunity and heal " + s(25 * mul) + "% HP. " + s(90 / mul) + "s cooldown. A lethal blow is Phoenix Bond's job.";
  if (id === 1) return "Every " + s(20 / mul) + "s: a rainbow nova deals " + s(10 * mul) + "x weapon damage in a 3-tile radius and stuns normal foes for " + s(1 * mul) + "s. Elites and bosses take the damage only.";
  if (id === 2) return "Every " + Math.max(8, Math.round(25 / mul)) + " kills: heal " + s(Math.min(100, 30 * mul)) + "% HP and refill one potion charge.";
  if (id === 3) return "Once per floor, a lethal hit revives you at " + s(Math.min(100, 50 * mul)) + "% HP with a fiery explosion. Direct resign still kills.";
  if (id === 4) return "Every " + s(45 / mul) + "s: an " + s(8 * mul) + "s mirror clone of you auto-attacks at full power with your gear.";
  return "Elites and bosses take +" + s(20 * mul) + "% damage and drop +1 extra item with better star odds.";
}
function petLines(it: Item, lvl: number): string[] {
  const pt = it.pt ?? 0;
  const lines = ["Companion: " + PETN[pt] + " (" + PARCH[Math.floor(pt / 10)] + ")",
    "Fires a " + petProjName(pt) + " at the nearest foe in sight every turn (range " + PET_RANGE + ")",
    "Each shot: " + Math.round(petPower(lvl, it) * 100) + "% of your damage per turn" + (it.ilvl < lvl ? " (weaker below your level)" : "") + (it.st && it.st.length ? "  " + starBadge(it) + (it.rar >= 7 && it.st.length > 5 ? "  power x" + fmtBig(prisStarMul(it)) : "") : ""),
    "Pets never die and follow you everywhere. Same rarity colors and star rules as other gear (combine 3 of the same rarity and stars)."];
  if (it.rar >= 7) { lines.push(petAbiTitle(it), petAbiDesc(it)); }
  return lines;
}
function drawPetSprite(p: Pt, pt: number): void {
  const a = Math.floor(pt / 10), v = pt % 10, hu = petHue(pt);
  const B = hsl(hu, 62, 50), L = hsl(hu, 75, 72), D = hsl(hu, 55, 28), K = "#100818";
  const E = v % 3 === 0 ? "#ff3030" : v % 3 === 1 ? "#ffffff" : "#ffe040", Y = "#ffb020";
  if (a === 0) { p(3, 8, 10, 6, B); p(4, 6, 8, 2, B); p(5, 5, 6, 1, B); p(4, 7, 3, 2, L); p(5, 9, 2, 2, K); p(9, 9, 2, 2, K); p(3, 14, 10, 1, D); }
  else if (a === 1) { p(5, 6, 6, 6, B); p(9, 3, 4, 4, B); p(13, 4, 2, 1, Y); p(11, 4, 1, 1, K); p(3, 7, 4, 3, D); p(2, 10, 3, 2, D); p(7, 12, 1, 2, Y); p(9, 12, 1, 2, Y); p(6, 8, 3, 2, L); }
  else if (a === 2) { p(3, 8, 9, 4, B); p(10, 4, 5, 5, B); p(10, 3, 1, 1, B); p(14, 3, 1, 1, B); p(11, 6, 1, 1, E); p(13, 6, 1, 1, E); p(4, 12, 1, 2, D); p(10, 12, 1, 2, D); p(1, 6, 2, 3, B); p(2, 5, 1, 1, B); p(4, 9, 6, 1, L); }
  else if (a === 3) { p(2, 7, 10, 5, B); p(11, 4, 4, 5, B); p(15, 6, 1, 2, D); p(11, 3, 2, 2, D); p(13, 5, 1, 1, E); p(3, 12, 2, 3, D); p(9, 12, 2, 3, D); p(0, 6, 2, 2, B); p(3, 8, 7, 1, L); }
  else if (a === 4) { p(6, 6, 4, 5, B); p(1, 5, 5, 3, D); p(10, 5, 5, 3, D); p(0, 7, 2, 2, D); p(14, 7, 2, 2, D); p(6, 4, 1, 2, B); p(9, 4, 1, 2, B); p(7, 7, 1, 1, E); p(8, 7, 1, 1, E); p(7, 9, 2, 1, L); }
  else if (a === 5) { p(4, 6, 8, 6, B); p(8, 6, 1, 6, D); p(6, 3, 4, 3, D); p(2, 7, 2, 1, K); p(12, 7, 2, 1, K); p(2, 10, 2, 1, K); p(12, 10, 2, 1, K); p(6, 1, 1, 2, K); p(9, 1, 1, 2, K); p(5, 8, 2, 2, L); p(7, 4, 1, 1, E); }
  else if (a === 6) { p(1, 10, 4, 3, B); p(4, 8, 4, 3, B); p(7, 10, 4, 3, B); p(10, 6, 4, 4, B); p(12, 7, 1, 1, E); p(14, 8, 2, 1, "#ff3050"); p(2, 12, 8, 1, L); p(5, 9, 2, 1, D); }
  else if (a === 7) { p(4, 5, 8, 7, B); p(5, 1, 6, 4, D); p(6, 2, 1, 1, E); p(9, 2, 1, 1, E); p(2, 6, 2, 5, D); p(12, 6, 2, 5, D); p(5, 12, 2, 3, D); p(9, 12, 2, 3, D); p(7, 7, 1, 3, L); }
  else if (a === 8) { p(4, 3, 8, 8, B); p(5, 2, 6, 1, B); p(5, 11, 2, 2, B); p(9, 11, 2, 3, B); p(7, 12, 2, 2, B); p(5, 4, 2, 2, L); p(6, 6, 1, 2, K); p(9, 6, 1, 2, K); }
  else { p(3, 7, 8, 5, B); p(10, 3, 5, 4, B); p(11, 2, 1, 1, L); p(13, 4, 1, 1, E); p(4, 3, 5, 4, D); p(0, 9, 3, 2, B); p(4, 12, 2, 2, D); p(8, 12, 2, 2, D); p(4, 10, 6, 1, L); }
  // per-variant features so all 100 look different even inside one family
  if (v % 4 === 1) { p(6, 0, 1, 2, L); p(9, 0, 1, 2, L); }
  if (v % 5 === 2) { p(5, 10, 1, 1, L); p(8, 9, 1, 1, L); p(10, 10, 1, 1, L); }
  if (v >= 7) p(7, 8, 2, 1, v === 9 ? GOLD : "#40e0ff");
  if (v === 3 || v === 8) p(1, 14, 14, 1, D);
}
const PETC = new Map<number, HTMLCanvasElement>();
function petCanvas(pt: number): HTMLCanvasElement {
  const got = PETC.get(pt);
  if (got) return got;
  const c = document.createElement("canvas"); c.width = 16; c.height = 16;
  const x = c.getContext("2d");
  if (x) drawPetSprite(painter(x, 0, 0, 1, false, 0), pt);
  PETC.set(pt, c);
  return c;
}
const PETP = { x: 0, y: 0, ok: false };
function petPos(g: Game): number[] { return PETP.ok ? [PETP.x, PETP.y] : [g.hero.ax * TS + 12, g.hero.ay * TS + 6]; }
function petFollow(g: Game, dt: number): void {
  const h = g.hero;
  const homeX = h.ax * TS + 12 - h.face * 15, homeY = h.ay * TS + 2 + Math.sin(g.time * 3.1) * 2;
  if (!g.eq.pet) { PETP.x = homeX; PETP.y = homeY; PETP.ok = true; return; }
  const tgt = (uiBlocked(g) || g.mode !== "play" || g.area === "camp") ? null : petLootTarget(g);
  const tx = tgt ? tgt.x * TS + 12 : homeX, ty = tgt ? tgt.y * TS + 12 : homeY;
  if (!PETP.ok || Math.abs(PETP.x - tx) + Math.abs(PETP.y - ty) > 200) { PETP.x = tgt ? homeX : tx; PETP.y = tgt ? homeY : ty; PETP.ok = true; if (!tgt) return; }
  const k = Math.min(1, dt * (tgt ? 5.5 : 7) * MVMUL);
  PETP.x += (tx - PETP.x) * k; PETP.y += (ty - PETP.y) * k;
  if (tgt && Math.hypot(PETP.x - tx, PETP.y - ty) < 9) {
    const px = PETP.x / TS, py = PETP.y / TS;
    if (tgt.kind === "chest" && tgt.chest && !tgt.chest.open) {
      openChest(g, tgt.chest);
    } else if (tgt.kind === "drop" && tgt.drop) {
      const ok = collectDrop(g, tgt.drop, px, py);
      if (ok) {
        g.drops = g.drops.filter((d: Drop) => d !== tgt.drop);
        burst(g, tx, ty, 10, [GOLD, "#ffffff"], 36, 30);
        g.sfx("coin");
      }
    }
  }
}
function petSnap(g: Game): void { g.pSnap = g.en.filter((e: En) => e.hp > 0).map((e: En): [En, number] => [e, e.hp]); }
function petTurn(g: Game, st: Stats): void {
  const it = g.eq.pet;
  if (!it || it.kind !== "pet" || it.pt === undefined) return;
  const h = g.hero;
  let best: En | null = null, bd = 99;
  for (const e of g.en) { if (e.hp <= 0 || !g.vis[e.y * MW + e.x]) continue; const d = Math.abs(e.x - h.x) + Math.abs(e.y - h.y); if (d <= PET_RANGE && d < bd && los(g, h.x, h.y, e.x, e.y)) { bd = d; best = e; } }
  // the pet deals a rarity share of what you have been dealing per turn (moving average of your real damage, incl. crits/spells/effects)
  let dealt = 0;
  if (g.pSnap) for (const s of g.pSnap) dealt += Math.max(0, s[1] - Math.max(0, s[0].hp));
  if (!best) { petSnap(g); return; }
  g.pDps = (g.pDps ?? Math.max(1, st.atk * 0.7)) * 0.8 + dealt * 0.2;
  let dmg = Math.max(1, Math.round(Math.max(g.pDps, st.atk * 0.25) * petPower(g.lvl, it) * (1 + 0.15 * efP(g, 94)) * (0.9 + R() * 0.2)));
  if (setCounts(g.eq)[3] >= 2) dmg = Math.round(dmg * 1.3);
  const pp = petPos(g);
  if (!g.pshots) g.pshots = [];
  if (g.pshots.length < 10) g.pshots.push({ x0: pp[0], y0: pp[1], x1: best.ax * TS + 12, y1: best.ay * TS + 12, t: 0, max: 0.16 + bd * 0.03, pt: it.pt, rar: it.rar, hit: false });
  withHit({ dx: best.ax * TS + 12 - pp[0], dy: best.ay * TS + 12 - pp[1] }, () => {
    hurtEn(g, best, dmg);
    g.petDmg = (g.petDmg ?? 0) + dmg;
    floatTxt(g, best.x + 0.3, best.y - 0.1, String(dmg), petCol(it.pt));
    g.sfx("mx", petSnd(it.pt));
    if (setCounts(g.eq)[3] >= 4 && best.hp > 0) { const d2 = Math.max(1, Math.round(dmg * 0.5)); hurtEn(g, best, d2); if (g.pshots && g.pshots.length < 10) g.pshots.push({ x0: pp[0], y0: pp[1], x1: best.ax * TS + 12, y1: best.ay * TS + 12, t: 0, max: 0.12, pt: it.pt, rar: it.rar, hit: false }); floatTxt(g, best.x, best.y - 0.5, String(d2), petCol(it.pt)); }
    if (best.hp <= 0) kill(g, best);
  });
  petSnap(g);
}
function petShotTick(g: Game, dt: number): void {
  if (!g.pshots || !g.pshots.length) return;
  for (const s of g.pshots) {
    s.t += dt;
    if (!s.hit && s.t >= s.max) { s.hit = true; const c = s.rar >= 7 ? "hsl(" + Math.floor((g.time * 200) % 360) + ",100%,65%)" : petCol(s.pt); if (g.parts.length < 380) burst(g, s.x1, s.y1, 2 + s.rar * 3, [c, "#ffffff", RC[s.rar]], 40 + s.rar * 12, 30); }
    else if (!s.hit && s.rar >= 4 && g.parts.length < 300 && Math.random() < 0.15 * (s.rar - 3)) { const pr = s.t / s.max; burst(g, s.x0 + (s.x1 - s.x0) * pr, s.y0 + (s.y1 - s.y0) * pr - Math.sin(pr * Math.PI) * 10, 1, [petCol(s.pt), "#ffffff"], 15, -20); }
  }
  g.pshots = g.pshots.filter((s: PShot) => s.t < s.max + 0.05);
}
function drawPetHead(ctx: CanvasRenderingContext2D, sh: number, x: number, y: number, ang: number, c: string, sz: number): void {
  ctx.fillStyle = c; ctx.strokeStyle = c;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const at = (dx: number, dy: number): number[] => [x + dx * ca - dy * sa, y + dx * sa + dy * ca];
  const poly = (pts: number[][]): void => { ctx.beginPath(); pts.forEach((q: number[], i: number) => { const r = at(q[0] * sz, q[1] * sz); if (i === 0) ctx.moveTo(r[0], r[1]); else ctx.lineTo(r[0], r[1]); }); ctx.closePath(); ctx.fill(); };
  if (sh === 0) { ctx.beginPath(); ctx.arc(x, y, 2 * sz, 0, 6.283); ctx.fill(); }
  else if (sh === 1) { ctx.lineWidth = Math.max(1, sz * 0.8); const a0 = at(-4 * sz, 0); ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(x, y); ctx.stroke(); poly([[2, 0], [-1, -1.6], [-1, 1.6]]); }
  else if (sh === 2) poly([[2.5, 0], [-1.5, -1.8], [-0.5, 0], [-1.5, 1.8]]);
  else if (sh === 3) { ctx.fillRect(x - 2.5 * sz, y - 0.5 * sz, 5 * sz, sz); ctx.fillRect(x - 0.5 * sz, y - 2.5 * sz, sz, 5 * sz); }
  else if (sh === 4) { ctx.beginPath(); ctx.arc(x, y, 1.8 * sz, 0, 6.283); ctx.fill(); poly([[-1, -1.4], [-4, 0], [-1, 1.4]]); }
  else if (sh === 5) poly([[2.6, 0], [0, -1.2], [-2.6, 0], [0, 1.2]]);
  else if (sh === 6) poly([[2.4, 0], [0.6, -1.4], [-2, 0], [0.6, 1.4]]);
  else if (sh === 7) { ctx.lineWidth = Math.max(1, sz * 0.7); ctx.beginPath(); ctx.arc(x, y, 2.2 * sz, 0, 6.283); ctx.stroke(); }
  else if (sh === 8) { ctx.fillRect(x - 1.8 * sz, y - 1.8 * sz, 3.6 * sz, 3 * sz); ctx.fillStyle = "#100818"; ctx.fillRect(x - 1.2 * sz, y - 1 * sz, sz, sz); ctx.fillRect(x + 0.3 * sz, y - 1 * sz, sz, sz); }
  else poly([[2.8, 0], [0.6, -0.6], [0, -2.8], [-0.6, -0.6], [-2.8, 0], [-0.6, 0.6], [0, 2.8], [0.6, 0.6]]);
}
function drawPetShots(ctx: CanvasRenderingContext2D, g: Game, camX: number, camY: number, t: number): void {
  if (!g.pshots) return;
  for (const s of g.pshots) {
    if (s.hit) continue;
    const pr = Math.min(1, s.t / s.max), r = s.rar;
    const c = r >= 7 ? "hsl(" + Math.floor((t * 300) % 360) + ",100%,65%)" : petCol(s.pt);
    const pos = (q: number): number[] => [s.x0 + (s.x1 - s.x0) * q - camX, s.y0 + (s.y1 - s.y0) * q - camY - Math.sin(q * Math.PI) * 10];
    const [x, y] = pos(pr);
    const [px, py] = pos(Math.max(0, pr - 0.05));
    const ang = Math.atan2(y - py, x - px);
    const segs = 2 + r * 2; // trail length scales with rarity
    for (let i = segs; i >= 1; i--) { const q = pr - i * 0.035; if (q <= 0) continue; const [qx, qy] = pos(q); ctx.globalAlpha = (1 - i / (segs + 1)) * (0.25 + r * 0.06); ctx.fillStyle = i % 2 && r >= 5 ? "#ffffff" : c; const sz = Math.max(1, 3 - i * 0.25 + r * 0.25); ctx.fillRect(qx - sz / 2, qy - sz / 2, sz, sz); }
    if (r >= 2) { ctx.globalAlpha = 0.18 + r * 0.035; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 3 + r * 1.1 + Math.sin(t * 20) * (r >= 5 ? 1.2 : 0), 0, 6.283); ctx.fill(); }
    if (r >= 6) { ctx.globalAlpha = 0.5; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 5 + r + Math.sin(t * 14) * 2, 0, 6.283); ctx.stroke(); }
    ctx.globalAlpha = 1;
    drawPetHead(ctx, petShape(s.pt), x, y, ang, c, 1 + r * 0.12);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  ctx.globalAlpha = 1;
}
function drawPet(ctx: CanvasRenderingContext2D, g: Game, camX: number, camY: number, t: number): void {
  const it = g.eq.pet;
  if (!it || it.pt === undefined || g.mode === "dead") return;
  const [wx, wy] = petPos(g);
  const x = Math.round(wx - camX - 8), y = Math.round(wy - camY - 10);
  const r = it.rar, c = r >= 7 ? "hsl(" + Math.floor((t * 160) % 360) + ",100%,62%)" : RC[r];
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x + 3, y + 17, 10, 2);
  if (r >= 2) { ctx.globalAlpha = 0.1 + r * 0.035 + Math.sin(t * 3) * 0.04; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 8, y + 8, 8 + r * 1.2, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; }
  if (r >= 4) for (let i = 0; i < r - 2; i++) { const a = t * (1.5 + r * 0.2) + i * 6.283 / (r - 2); ctx.fillStyle = i % 2 ? "#ffffff" : c; ctx.fillRect(Math.round(x + 8 + Math.cos(a) * (10 + r)), Math.round(y + 8 + Math.sin(a) * (5 + r * 0.5)), 2, 2); }
  if (r >= 6) { ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t * 5); ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.strokeRect(x - 2.5, y - 2.5, 21, 21); ctx.globalAlpha = 1; }
  ctx.save();
  if (r >= 7) {
    const flip = g.hero.face < 0;
    drawPrisPiece(painter(ctx, x, y, 1, flip, 16), it, (q: Pt) => drawPetSprite(q, it.pt as number));
  } else if (g.hero.face < 0) { ctx.translate(x + 16, y); ctx.scale(-1, 1); ctx.drawImage(petCanvas(it.pt), 0, 0); }
  else ctx.drawImage(petCanvas(it.pt), x, y);
  ctx.restore();
  const fx = g.petAbiFx;
  if (fx && (g.petAbiT ?? 0) < fx.t) {
    ctx.globalAlpha = Math.max(0.35, Math.min(1, fx.t - (g.petAbiT ?? 0)));
    ctx.fillStyle = "#100814";
    ctx.fillRect(x - 6, y - 10, 28, 8);
    ctx.fillStyle = fx.c; ctx.font = "6px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(fx.n, x + 8, y - 4);
    ctx.globalAlpha = 1; ctx.textAlign = "left";
  }
}
// ======================= procedural magic SFX: one unique synthesized sound per ability =======================
// IDs: 0-559 weapon spells (element x shape x modifier), 560-909 armor passives, 910-959 ultimates, 960-1059 the 100 effects, 1060-1159 pets.
interface MV { n: number; f: number; f2: number; d: number; w: number; v: number; t: number }
const petShape = (pt: number): number => pt % 10;
const SND_N = 1160;
const WAVES: OscillatorType[] = ["sine", "triangle", "square", "sawtooth"];
const NFILT: BiquadFilterType[] = ["lowpass", "bandpass", "highpass"];
const spellSnd = (sp: Spell): number => Math.max(0, ELS.indexOf(sp.el)) * 80 + Math.max(0, SHAPES.indexOf(sp.sh)) * 8 + Math.max(0, Math.min(7, Math.floor(sp.mod)));
const pasSnd = (p: Passive): number => 560 + Math.max(0, ELS.indexOf(p.el)) * 50 + Math.max(0, PTYPES.indexOf(p.ty)) * 5 + Math.max(0, Math.min(4, Math.floor(p.mod)));
const ultSnd = (u: number): number => 910 + Math.max(0, Math.min(49, u));
const efSnd = (i: number): number => 960 + i;
const petSnd = (pt: number): number => 1060 + Math.max(0, Math.min(99, pt));
// element timbre: base pitch, oscillator wave, noise filter, noise colour
const ELT = [[1046, 0, 2, 5200], [196, 3, 0, 1800], [1568, 1, 2, 6400], [784, 2, 1, 3200], [98, 3, 0, 900], [65, 0, 1, 420], [147, 1, 1, 720]];
const r1 = (v: number): number => Math.round(v * 10) / 10;
const MVC = new Map<number, MV[]>();
function magicVoice(id: number): MV[] {
  const got = MVC.get(id);
  if (got) return got;
  const out: MV[] = [];
  const o = (f: number, f2: number, d: number, w: number, v: number, t: number): void => { out.push({ n: 0, f: r1(Math.max(30, f)), f2: r1(Math.max(30, f2)), d: r3(d), w: ((w % 4) + 4) % 4, v: r3(v), t: r3(t) }); };
  const nz = (f: number, f2: number, d: number, fi: number, v: number, t: number): void => { out.push({ n: 1, f: r1(Math.max(40, f)), f2: r1(Math.max(40, f2)), d: r3(d), w: ((fi % 3) + 3) % 3, v: r3(v), t: r3(t) }); };
  const shapeGesture = (sh: number, f: number, w: number, nf: number, nc: number, vm: number): void => {
    if (sh === 0) { o(f * 2, f * 0.6, 0.18, w, 0.05 * vm, 0); nz(nc, nc * 0.3, 0.12, nf, 0.04 * vm, 0); }
    else if (sh === 1) { o(f * 0.5, f * 1.5, 0.35, w, 0.045 * vm, 0); o(f * 0.75, f * 2.2, 0.3, w + 1, 0.025 * vm, 0.04); nz(nc * 0.5, nc * 1.5, 0.35, nf, 0.05 * vm, 0); }
    else if (sh === 2) { for (let i = 0; i < 4; i++) o(f * (1.5 + i * 0.3), f * (0.8 + i * 0.2), 0.05, 2, 0.03 * vm, i * 0.045); nz(nc * 1.2, nc * 0.6, 0.18, 2, 0.04 * vm, 0); }
    else if (sh === 3) { o(f * 4, f * 0.5, 0.4, 0, 0.035 * vm, 0); nz(nc, 60, 0.45, 0, 0.09 * vm, 0.3); o(f * 0.4, 40, 0.4, 3, 0.05 * vm, 0.32); }
    else if (sh === 4) { o(f, f * 1.02, 0.45, w, 0.035 * vm, 0); o(f * 1.5, f * 1.52, 0.45, w + 2, 0.02 * vm, 0); nz(nc, nc, 0.45, 1, 0.03 * vm, 0); }
    else if (sh === 5) { o(f * 0.5, f * 3, 0.4, w, 0.045 * vm, 0); nz(nc * 0.4, nc * 2, 0.4, 1, 0.05 * vm, 0); }
    else if (sh === 6) { for (let i = 0; i < 3; i++) nz(nc * 1.5, nc * 0.5, 0.07, 1, 0.05 * vm, i * 0.07); o(f * 2, f * 2.5, 0.2, 1, 0.02 * vm, 0); }
    else if (sh === 7) { o(f * 0.25, f * 0.12, 0.5, 3, 0.06 * vm, 0); nz(nc * 0.5, 80, 0.5, 0, 0.1 * vm, 0); o(f * 0.5, f * 0.2, 0.2, 2, 0.02 * vm, 0.1); }
    else if (sh === 8) { [1, 1.25, 1.5, 2].forEach((m: number, i: number) => o(f * m, f * m, 0.12, 0, 0.03 * vm, i * 0.06)); nz(nc, nc * 2, 0.3, 2, 0.02 * vm, 0); }
    else { nz(nc * 0.8, nc * 0.3, 0.6, 1, 0.07 * vm, 0); o(f * 0.5, f * 0.45, 0.6, 1, 0.02 * vm, 0); }
  };
  if (id < 560) {
    const el = Math.floor(id / 80), sh = Math.floor((id % 80) / 8), mod = id % 8;
    const T = ELT[el];
    const f = T[0] * Math.pow(2, (mod * 1.5) / 12);
    shapeGesture(sh, f, T[1], T[2], T[3] * (1 + mod * 0.04), 1);
    if (mod & 1) { const e = out[0]; out.push({ ...e, t: r3(e.t + 0.12), v: r3(e.v * 0.45) }); }
    if (mod & 2) o(f * 1.01, f * 0.99, 0.2, T[1] + 1, 0.015, 0.02);
    if (mod & 4) { o(f * 3, f * 3, 0.04, 2, 0.012, 0.05); o(f * 3, f * 3, 0.04, 2, 0.012, 0.11); }
  } else if (id < 910) {
    const k = id - 560, el = Math.floor(k / 50), ty = Math.floor((k % 50) / 5), mod = k % 5;
    const T = ELT[el];
    const f = T[0] * 1.5 * Math.pow(2, (mod * 2 + 1) / 12);
    const vm = 0.6;
    if (ty === 0) { o(f * 2, f * 2.6, 0.08, 0, 0.03 * vm, 0); o(f * 2.6, f * 2, 0.08, 1, 0.025 * vm, 0.07); }
    else if (ty === 1) { o(f * 0.5, f * 0.52, 0.25, T[1], 0.03 * vm, 0); nz(T[3] * 0.5, T[3] * 0.4, 0.25, T[2], 0.02 * vm, 0); }
    else if (ty === 2) { nz(T[3] * 2, T[3], 0.05, 2, 0.05 * vm, 0); o(f * 3, f, 0.05, 2, 0.02 * vm, 0); }
    else if (ty === 3) { o(f, f * 0.3, 0.3, T[1], 0.05 * vm, 0); nz(T[3], 120, 0.3, 0, 0.07 * vm, 0); }
    else if (ty === 4) { o(f * 0.4, f * 0.8, 0.18, 0, 0.05 * vm, 0); o(f * 0.8, f * 0.4, 0.18, 1, 0.03 * vm, 0.09); }
    else if (ty === 5) { nz(T[3] * 0.6, T[3] * 0.3, 0.06, 0, 0.04 * vm, 0); o(f * 0.3, f * 0.25, 0.06, 3, 0.02 * vm, 0); }
    else if (ty === 6) { [1, 1.5, 2].forEach((m: number, i: number) => o(f * m, f * m, 0.18, 0, 0.022 * vm, i * 0.05)); }
    else if (ty === 7) { o(f * 0.7, f * 0.71, 0.3, 3, 0.02 * vm, 0); o(f * 0.71, f * 0.7, 0.3, 3, 0.02 * vm, 0.01); nz(T[3], T[3], 0.3, 1, 0.02 * vm, 0); }
    else if (ty === 8) { o(f * 1.2, f * 1.8, 0.3, 1, 0.025 * vm, 0); nz(T[3] * 2, T[3] * 3, 0.3, 2, 0.015 * vm, 0); }
    else { o(f * 2.4, f * 0.9, 0.1, 2, 0.035 * vm, 0); nz(T[3] * 1.5, T[3] * 0.5, 0.08, 1, 0.04 * vm, 0); }
  } else if (id < 960) {
    const u = id - 910, pat = u % 10, row = Math.floor(u / 10);
    const el = (pat + row * 3) % 7, T = ELT[el];
    const b = (60 + pat * 14 + row * 5) * (1 + el * 0.05);
    o(b * 2, b / 2, 1.2, 3, 0.05, 0); o(b * 3, b, 1.0, 2, 0.022, 0.05); nz(T[3] * 2, 60, 1.3, 0, 0.12, 0);
    shapeGesture(pat, T[0] * (1 + row * 0.1), T[1], T[2], T[3], 0.9);
    for (let i = 0; i < 3 + row; i++) o(b * (2 + i * 0.5), b * (2 + i * 0.5), 0.1, i % 2 ? 1 : 2, 0.03, 0.25 + i * 0.08);
  } else if (id < 1060) {
    const i = id - 960;
    const f = 140 * Math.pow(2, ((i * 7) % 50) / 12), w = i % 4, gs = i % 6, sw = 0.5 + (i % 7) * 0.25;
    if (gs === 0) { o(f, f * sw, 0.16, w, 0.045, 0); nz(f * 4, f * 2, 0.1, 1, 0.03, 0); }
    else if (gs === 1) { o(f, f * sw, 0.08, w, 0.04, 0); o(f * 1.5, f * 1.5 * sw, 0.08, w + 1, 0.03, 0.06); }
    else if (gs === 2) { o(f * 0.5, f * sw, 0.3, w, 0.05, 0); nz(f * 2, f * 6, 0.3, 2, 0.03, 0); }
    else if (gs === 3) { for (let k = 0; k < 3; k++) o(f * (1 + k * 0.33), f * (1 + k * 0.33) * sw, 0.06, w, 0.03, k * 0.05); }
    else if (gs === 4) { nz(f * 3, f * sw, 0.25, 0, 0.07, 0); o(f * 0.5, f * 0.5 * sw, 0.25, 3, 0.03, 0); }
    else { o(f * 2, f * 2 * sw, 0.2, w, 0.035, 0); o(f * 2.02, f * 2.02 * sw, 0.2, w, 0.02, 0.015); nz(f * 5, f * 5, 0.06, 2, 0.02, 0.1); }
  } else {
    const pt = id - 1060, a = Math.floor(pt / 10), v = pt % 10, sh = petShape(pt);
    const f = [300, 1400, 700, 380, 1800, 1100, 520, 160, 900, 240][a] * Math.pow(2, (v * 1.2) / 12);
    const w = [0, 1, 2, 3, 1, 2, 3, 3, 0, 3][a];
    o(f, f * (a % 2 ? 1.6 : 0.6), 0.09, w, 0.026, 0);
    nz(700 + sh * 520, 300 + sh * 240, 0.05, sh % 3, 0.022, 0.02);
    if (v % 2) o(f * 2, f * 2.2, 0.04, 0, 0.012, 0.06);
  }
  // balance: no single sound louder than ~0.13 summed, nothing longer than 1.5 s, max 10 nodes
  const tot = out.reduce((s: number, e: MV) => s + e.v, 0);
  if (tot > 0.13) for (const e of out) e.v = Math.max(0.001, Math.floor(e.v * 0.128 / tot * 1000) / 1000);
  const res = out.slice(0, 10);
  MVC.set(id, res);
  return res;
}

// ======================= 50 dungeon themes (one per depth, cycling 1-50) =======================
const TH50N = ["Forgotten Crypt", "Mossy Caverns", "Lava Forge", "Ice Cavern", "Fungal Grotto", "Sunken Temple", "Crystal Mine", "Clockwork Halls", "Void Sanctum", "Overgrown Ruins",
  "Bone Pit", "Gilded Vault", "Sandstone Tomb", "Rotting Sewers", "Obsidian Depths", "Coral Halls", "Haunted Library", "Blood Cathedral", "Spider Nest", "Frozen Throne",
  "Storm Spire", "Ashen Wastes", "Emerald Temple", "Abyssal Trench", "Moonlit Catacombs", "Dwarven Halls", "Alchemist's Lab", "Ember Chasm", "Starlit Observatory", "Petrified Forest",
  "Salt Mines", "Rusted Foundry", "Shadow Labyrinth", "Celestial Garden", "Plague Ward", "Glacier Rift", "Amethyst Geode", "Sulfur Vents", "Root Hollow", "Mirror Halls",
  "Thunder Caves", "Oasis Ruins", "Infernal Pits", "Myconid Court", "Pirate Grotto", "Ancient Aqueduct", "Cloud Ruins", "Eldritch Hive", "Prismatic Caverns", "Heart of the Abyss"];
// [hue, sat, floorL, wallL, floorStyle 0-7, wallStyle 0-5, ambient 0-7, decor 0-9, wallHueOffset]
const TH50D: number[][] = [
  [240, 12, 24, 22, 1, 0, 0, 0, 0], [100, 25, 20, 18, 7, 4, 3, 6, -10], [10, 55, 18, 20, 2, 1, 1, 7, 15], [200, 45, 32, 34, 6, 2, 2, 2, 10], [290, 30, 18, 16, 7, 1, 3, 1, 40],
  [175, 35, 20, 22, 5, 0, 4, 6, 0], [270, 35, 20, 20, 2, 2, 6, 2, -40], [35, 45, 22, 24, 3, 3, 5, 3, 0], [265, 40, 14, 14, 0, 2, 6, 8, 20], [80, 30, 24, 22, 1, 4, 3, 6, 0],
  [40, 20, 26, 30, 0, 5, 0, 4, 0], [45, 55, 22, 28, 3, 0, 6, 5, 0], [35, 40, 34, 32, 1, 0, 0, 0, 5], [70, 30, 16, 18, 6, 0, 7, 9, 10], [260, 15, 10, 12, 2, 2, 5, 2, 0],
  [190, 50, 26, 30, 7, 1, 4, 6, 140], [30, 30, 18, 20, 4, 0, 0, 5, 0], [355, 50, 16, 18, 3, 0, 7, 8, 0], [300, 10, 16, 14, 2, 1, 0, 4, 0], [210, 30, 38, 40, 3, 2, 2, 8, 0],
  [230, 35, 22, 26, 1, 3, 5, 8, 0], [20, 8, 26, 22, 2, 1, 1, 7, 0], [140, 45, 20, 24, 5, 4, 3, 6, 0], [215, 60, 10, 12, 6, 1, 4, 9, 0], [225, 20, 22, 26, 1, 5, 6, 0, 0],
  [25, 35, 24, 26, 3, 3, 1, 5, 0], [160, 30, 22, 22, 3, 0, 4, 9, 120], [20, 65, 14, 16, 2, 1, 1, 7, -10], [245, 40, 16, 20, 5, 3, 6, 8, 0], [30, 15, 26, 28, 7, 1, 0, 6, 0],
  [30, 6, 46, 42, 2, 1, 0, 2, 0], [18, 45, 20, 22, 3, 3, 5, 3, 0], [280, 15, 12, 14, 1, 0, 0, 8, 0], [320, 35, 30, 34, 7, 4, 6, 6, -60], [85, 40, 20, 22, 3, 0, 3, 9, 0],
  [190, 55, 40, 36, 6, 2, 2, 9, 0], [285, 55, 18, 24, 2, 2, 6, 2, 0], [55, 60, 22, 24, 2, 1, 1, 9, 0], [30, 40, 18, 20, 7, 4, 3, 6, 60], [200, 10, 40, 44, 3, 2, 6, 8, 0],
  [235, 25, 18, 22, 2, 1, 5, 7, 0], [45, 45, 36, 30, 1, 4, 0, 6, 120], [0, 65, 14, 14, 2, 5, 1, 0, 10], [320, 35, 18, 20, 7, 4, 3, 1, -30], [200, 35, 22, 26, 4, 1, 4, 7, -170],
  [195, 30, 28, 30, 6, 0, 7, 9, 0], [210, 30, 52, 54, 1, 0, 0, 7, 0], [100, 40, 14, 16, 7, 5, 3, 4, 180], [300, 60, 24, 26, 2, 2, 6, 2, 120], [275, 60, 8, 10, 6, 2, 1, 8, -20],
];
const THV = ["Twilight ", "Verdant ", "Crimson ", "Azure ", "Golden ", "Shadowed ", "Ashen "];
const themeOf = (depth: number): number => (Math.max(1, Math.floor(depth)) - 1) % 50;
function themeShift(g: Game): number { const cyc = Math.floor((Math.max(1, g.depth) - 1) / 50); return cyc > 0 && (g.thSeen ?? []).length >= 50 ? (cyc * 67) % 360 : 0; }
function themeName(g: Game): string { const cyc = Math.floor((Math.max(1, g.depth) - 1) / 50); return (g.thShift ? THV[(cyc - 1) % THV.length] : "") + TH50N[g.theme % 50]; }
let THDREAD = 0;
function themePal(th: number, shift: number): { f: string[]; w: string[]; amb: string; lt: string; dc: string[] } {
  const [h0, s0, fl0, wl0, , , amb, , wo] = TH50D[th % 50];
  const t = Math.max(0, Math.min(1, THDREAD));
  const hCheer = (h0 + shift + 360) % 360, whCheer = (h0 + wo + shift + 720) % 360;
  const hTgt = t < 0.45 ? 85 : 8;
  const mix = (a: number, b: number, u: number): number => (a + ((b - a + 540) % 360 - 180) * u + 360) % 360;
  const h = mix(hCheer, hTgt, t * t);
  const wh = mix(whCheer, t > 0.55 ? 12 : 70, t);
  const satMul = t < 0.35 ? 1 - 0.55 * (t / 0.35) : (t < 0.6 ? 0.45 + 0.25 * ((t - 0.35) / 0.25) : 0.7 + 0.35 * ((t - 0.6) / 0.4));
  const s = Math.max(8, Math.min(100, s0 * satMul + (t > 0.7 ? 12 * (t - 0.7) / 0.3 : 0)));
  const fl = Math.max(TILE_L_MIN, fl0);
  const wl = Math.max(TILE_L_MIN - 2, wl0);
  const ac = t > 0.5 ? hsl(18, 80, 62) : [hsl(h, 10, 72), hsl((20 + shift) % 360, 100, 60), "#f4f8ff", hsl(h, 60, 70), hsl((190 + shift) % 360, 70, 75), hsl((55 + shift) % 360, 100, 72), hsl(h, 80, 82), hsl(h, 40, 58)][amb];
  return {
    f: [hsl(h, s, fl), hsl(h, s + 6, fl + 6), hsl(h, s, Math.max(TILE_L_MIN - 6, fl - 7))],
    w: [hsl(wh, s, Math.max(TILE_L_MIN - 8, wl - 8)), hsl(wh, s + 10, wl + 18), hsl(wh, s, wl + 4)],
    amb: ac,
    lt: "rgba(0,0,0,0)",
    dc: [hsl(wh, s + 20, wl + 30), hsl(h, s + 30, fl + 22), hsl((h + 180) % 360, 70, 60)],
  };
}
const TILE_L_MIN = 42; // floor/wall HSL lightness floor: no per-theme dark tint
const TORCH_SPACE = 5;
const TORCH_N = ["Iron Sconce", "Brass Brazier", "Skull Torch", "Blue Magic Flame", "Green Magic Flame"];
let THLT = "rgba(0,0,0,0)"; // kept for compatibility; always transparent (no theme light wash)
let THAMB = { k: 0, c: "#ffffff" }; // current ambient particles
function themeAmbient(g: Game): void {
  if (g.parts.length > 300) return;
  const h = g.hero, x = h.x + ri(17) - 8, y = h.y + ri(13) - 6;
  if (!inb(x, y) || !g.vis[y * MW + x] || g.map[y * MW + x] === 0) return;
  const px = x * TS + Math.random() * TS, py = y * TS + Math.random() * TS, k = THAMB.k, c = THAMB.c;
  const P = (vx: number, vy: number, life: number, s: number, gr: number): void => { g.parts.push({ x: px, y: py, vx, vy, life, max: life, c, s, g: gr }); };
  if (k === 0) P((Math.random() - 0.5) * 6, -2, 2.2, 1, 0);
  else if (k === 1) P((Math.random() - 0.5) * 10, -18 - Math.random() * 12, 1.6, 1, -8);
  else if (k === 2) P(-4 + Math.random() * 8, 10 + Math.random() * 6, 2.4, Math.random() < 0.3 ? 2 : 1, 2);
  else if (k === 3) P((Math.random() - 0.5) * 8, -4 - Math.random() * 4, 2.6, 1, -1);
  else if (k === 4) P((Math.random() - 0.5) * 3, -14, 1.8, Math.random() < 0.4 ? 2 : 1, -6);
  else if (k === 5) P((Math.random() - 0.5) * 60, -20 - Math.random() * 30, 0.4, 1, 120);
  else if (k === 6) P(0, 0, 0.7, Math.random() < 0.3 ? 2 : 1, 0);
  else P(0, 4, 1.2, 1, 140);
  if (THDREAD > 0.15 && Math.random() < THDREAD) {
    const ember = THDREAD > 0.6 ? "#ff6a20" : "#c8c0b0";
    g.parts.push({ x: px, y: py, vx: (Math.random() - 0.5) * 8, vy: -6 - Math.random() * 10 * THDREAD, life: 1.8, max: 1.8, c: ember, s: Math.random() < 0.4 ? 2 : 1, g: -4 });
  }
}
function drawDecor(x: CanvasRenderingContext2D, kind: number, c: string[]): void {
  const p = (a: number, b: number, w: number, h: number, col: string): void => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  if (kind === 0) { p(8, 9, 8, 6, "#d8d0c0"); p(9, 15, 6, 3, "#c8c0b0"); p(9, 11, 2, 2, "#100818"); p(13, 11, 2, 2, "#100818"); p(11, 16, 1, 2, "#100818"); }
  else if (kind === 1) { p(7, 8, 10, 3, c[2]); p(9, 7, 6, 1, c[2]); p(11, 11, 2, 6, "#e8e0d0"); p(9, 9, 1, 1, "#ffffff"); p(14, 9, 1, 1, "#ffffff"); }
  else if (kind === 2) { p(10, 6, 3, 11, c[0]); p(7, 10, 2, 7, c[0]); p(14, 9, 2, 8, c[0]); p(11, 7, 1, 6, "#ffffff"); }
  else if (kind === 3) { p(7, 10, 10, 4, c[0]); p(10, 7, 4, 10, c[0]); p(8, 8, 8, 8, c[0]); p(10, 10, 4, 4, "#100818"); }
  else if (kind === 4) { p(5, 14, 10, 2, "#d8d0c0"); p(4, 13, 2, 4, "#d8d0c0"); p(14, 13, 2, 4, "#d8d0c0"); p(12, 8, 2, 7, "#c8c0b0"); }
  else if (kind === 5) { p(11, 10, 3, 7, "#e8e0c8"); p(11, 7, 3, 3, "#ffb040"); p(12, 6, 1, 1, "#fff0a0"); p(9, 17, 7, 1, "#6a5040"); }
  else if (kind === 6) { p(11, 9, 2, 9, c[1]); p(8, 10, 3, 2, c[1]); p(13, 8, 3, 2, c[1]); p(7, 7, 2, 3, c[1]); p(15, 6, 2, 2, c[1]); }
  else if (kind === 7) { p(6, 14, 5, 3, c[0]); p(12, 15, 6, 2, c[0]); p(9, 12, 4, 3, c[0]); }
  else if (kind === 8) { x.strokeStyle = c[2]; x.globalAlpha = 0.55; x.lineWidth = 1; x.beginPath(); x.arc(12, 12, 8, 0, 6.283); x.stroke(); x.strokeRect(8.5, 8.5, 7, 7); x.globalAlpha = 1; }
  else { x.globalAlpha = 0.5; p(5, 12, 14, 5, c[1]); p(7, 11, 9, 1, c[1]); x.globalAlpha = 1; p(8, 13, 3, 1, "#ffffff"); }
}
function mapSeed(g: Game): number {
  let h = (Math.imul(g.depth + 1, 1000003) + Math.imul((g.theme + 1), 9176) + (g.vault ? 7919 : 0)) | 0;
  for (let i = 0; i < MW * MH; i += 7) h = (Math.imul(h, 1664525) + g.map[i] + 1013904223) | 0;
  return h;
}
function placeTorches(g: Game): void {
  const rng = rng32(mapSeed(g));
  const cands: { x: number; y: number; dir: number }[] = [];
  const dirs: number[][] = [[0, 1], [1, 0], [-1, 0], [0, -1]]; // S E W N: prefer wall-face above a floor
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    if (g.map[y * MW + x] !== 0) continue;
    let dir = -1;
    for (let d = 0; d < 4; d++) {
      const nx = x + dirs[d][0], ny = y + dirs[d][1];
      const v = g.map[ny * MW + nx];
      if (v === 1 || v === 2) { dir = d; break; }
    }
    if (dir >= 0) cands.push({ x, y, dir });
  }
  const out: Torch[] = [];
  for (const c of cands) {
    if (out.some((t: Torch) => Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y)) < TORCH_SPACE)) continue;
    out.push({ x: c.x, y: c.y, typ: Math.floor(rng() * 5), dir: c.dir, ph: rng() * 6.2832 });
  }
  g.torches = out;
}
function mixHex(a: string, b: string, t: number): string {
  const p = (s: string): number[] => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const A = p(a), B = p(b), k = Math.max(0, Math.min(1, t));
  const h = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return "#" + h(A[0] + (B[0] - A[0]) * k) + h(A[1] + (B[1] - A[1]) * k) + h(A[2] + (B[2] - A[2]) * k);
}
function drawDreadDecal(ctx: CanvasRenderingContext2D, sx: number, sy: number, hsh: number, t: number): void {
  const kind = hsh % (t < 0.3 ? 3 : t < 0.6 ? 5 : 6);
  ctx.globalAlpha = 0.28 + 0.35 * t;
  if (kind === 0) { ctx.fillStyle = "#3a3030"; ctx.fillRect(sx + 4, sy + 8, 10, 1); ctx.fillRect(sx + 6, sy + 8, 1, 6); } // crack
  else if (kind === 1) { ctx.fillStyle = "#e8dcc0"; ctx.fillRect(sx + 8, sy + 10, 6, 4); ctx.fillRect(sx + 9, sy + 14, 4, 3); ctx.fillStyle = "#100818"; ctx.fillRect(sx + 9, sy + 11, 1, 1); ctx.fillRect(sx + 12, sy + 11, 1, 1); } // bone
  else if (kind === 2) { ctx.fillStyle = "#6a2020"; ctx.fillRect(sx + 5, sy + 12, 8, 3); ctx.fillRect(sx + 11, sy + 10, 4, 2); } // blood
  else if (kind === 3) { ctx.fillStyle = "#5a5a64"; ctx.fillRect(sx + 7, sy + 4, 2, 14); ctx.fillRect(sx + 5, sy + 8, 6, 2); } // chain
  else if (kind === 4) { ctx.fillStyle = "#ff6a20"; ctx.fillRect(sx + 10, sy + 7, 2, 2); ctx.fillRect(sx + 14, sy + 12, 1, 1); } // ember
  else { ctx.fillStyle = "#ff4010"; ctx.fillRect(sx + 3, sy + 16, 14, 2); ctx.fillStyle = "#ffc040"; ctx.fillRect(sx + 6, sy + 15, 6, 1); } // lava seam
  ctx.globalAlpha = 1;
}
function drawTorch(ctx: CanvasRenderingContext2D, tch: Torch, sx: number, sy: number, t: number): void {
  const flick = 0.62 + 0.38 * Math.sin(t * 11 + tch.ph);
  const flick2 = 0.5 + 0.5 * Math.sin(t * 17 + tch.ph * 1.7);
  const typ = tch.typ | 0;
  const flame0 = typ === 3 ? ["#80d8ff", "#e8f8ff", "#2080ff"] : typ === 4 ? ["#60ff80", "#e8ffe8", "#20a040"] : ["#ff9020", "#fff0a0", "#ff4020"];
  const hell = ["#ff3010", "#ffc040", "#ff1800"];
  const u = typ >= 3 ? THDREAD * 0.45 : THDREAD;
  const flame = u <= 0 ? flame0 : [mixHex(flame0[0], hell[0], u), mixHex(flame0[1], hell[1], u), mixHex(flame0[2], hell[2], u)];
  // hang toward the adjacent floor (dir 0=S, 1=E, 2=W, 3=N)
  let ox = 0, oy = 0;
  if (tch.dir === 0) oy = 4;
  else if (tch.dir === 1) ox = 4;
  else if (tch.dir === 2) ox = -4;
  else oy = -3;
  const p = (a: number, b: number, w: number, h: number, c: string): void => { ctx.fillStyle = c; ctx.fillRect(sx + 12 + ox + a, sy + 10 + oy + b, w, h); };
  if (typ === 0) { // iron sconce
    p(-2, 4, 5, 2, "#3a3a42"); p(-1, 2, 3, 3, "#5a5a64"); p(0, 1, 1, 2, "#8a8a94");
  } else if (typ === 1) { // brass brazier
    p(-3, 5, 7, 2, "#8a5a18"); p(-2, 3, 5, 2, "#c89020"); p(-1, 2, 3, 1, GOLD);
  } else if (typ === 2) { // skull torch
    p(-2, 3, 5, 5, "#e8dcc0"); p(-1, 4, 1, 1, "#100818"); p(1, 4, 1, 1, "#100818"); p(0, 6, 1, 1, "#100818"); p(-2, 7, 5, 1, "#c8bca0");
  } else { // magic-flame cradle (blue or green)
    p(-2, 4, 5, 2, "#4a4068"); p(-1, 2, 3, 3, "#7a70a0"); p(0, 1, 1, 1, flame[0]);
  }
  // flame sprite only (no light radius): flicker size/color, a few rects
  p(-1, -1, 3, 3, flame[0]);
  if (flick > 0.7) p(0, -3, 1, 3, flame[1]);
  p(0, -2, 1, 2, flame[1]);
  if (flick2 > 0.55) p(-1, -2, 1, 1, flame[2]);
  if (flick > 0.85) p(1, -4, 1, 2, flame[1]);
}
function lockDefault(): boolean { return lsGet("ed16_lock") !== "0"; }
const GOB_CH = 0.06; // classic loot goblin; was 0.03
const GOB_GEM_CH = 0.04;
const GOB_GOLD_CH = 0.025;
const GEM_CH_NORM = 0.015;
const GEM_CH_ELITE = 0.06;
const GEM_CH_MINI = 0.12;
const GEM_CH_SE = 0.09;
const GEM_CH_CHEST = 0.12;
const GEM_CH_VAULT = 0.25;
const GEM_CH_FLOOR = 0.30;
function gobName(kind: number): string { return kind === 2 ? "Gem Goblin" : kind === 3 ? "Gold Goblin" : "Loot Goblin"; }
function gobPal(kind: number): string[] {
  if (kind === 2) return ["#40e0ff", "#ff60e0", "#143050", "#ffffff"];
  if (kind === 3) return ["#ffd840", "#fff8c0", "#8a5a00", "#ffe080"];
  return ["#d8b030", "#fff0a0", "#6a4a10", "#40ff60"];
}
function gobSpark(kind: number): string[] {
  if (kind === 2) return ["#40e0ff", "#ff60e0", "#ffffff"];
  if (kind === 3) return [GOLD, "#fff8c0", "#ffe080"];
  return [GOLD, "#ffffff", "#40ff60"];
}
function mkGoblin(g: Game, x: number, y: number, kind: number = 1): En {
  const e = mkEnemy(g, x, y, 1, { full: true });
  const gi = FAMS.findIndex((f: Fam) => f.n === "Goblin");
  if (gi >= 0) e.f = gi;
  const k = kind === 2 || kind === 3 ? kind : 1;
  e.v = 0; e.tr = []; e.atk = 0; e.gob = k;
  e.hp = e.mhp = Math.round(e.mhp * 1.2);
  e.xp = Math.round(e.xp * 2);
  e.name = gobName(k);
  e.pal = gobPal(k);
  return e;
}
// The goblin never attacks: it runs away, a little slower than the hero (it skips every 4th turn) so it can be caught.
function gobMove(g: Game, e: En): void {
  if (g.turn % 4 === 0) return;
  const h = g.hero;
  const d0 = Math.abs(h.x - e.x) + Math.abs(h.y - e.y);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const off = ri(4);
  let best: number[] | null = null, bs = -1;
  for (let i = 0; i < 4; i++) {
    const [ox, oy] = dirs[(i + off) % 4];
    const nx = e.x + ox, ny = e.y + oy;
    if (!walkable(g, nx, ny) || (nx === h.x && ny === h.y)) continue;
    const nd = Math.abs(h.x - nx) + Math.abs(h.y - ny);
    if (nd < d0) continue;
    let ex = 0;
    for (const [ax, ay] of dirs) if (inb(nx + ax, ny + ay) && g.map[(ny + ay) * MW + nx + ax] !== 0) ex++;
    const sc = nd + ex * 0.3;
    if (sc > bs) { bs = sc; best = [nx, ny]; }
  }
  if (best) { if (best[0] !== e.x) e.face = best[0] > e.x ? 1 : -1; e.x = best[0]; e.y = best[1]; }
}
// Real-time escape: ~25 s after it is spotted, or as soon as it is far away (>22 tiles), it leaves through a portal.
const GOB_TIME = 25;
function gobTick(g: Game, dt: number): void {
  if (g.mode !== "play") return;
  const e = g.en.find((o: En) => !!o.gob && o.hp > 0 && o.awake);
  if (!e) return;
  g.gobT += dt;
  const far = Math.abs(e.x - g.hero.x) + Math.abs(e.y - g.hero.y) > 22;
  if (g.gobT >= GOB_TIME || far) {
    fxAdd(g, "vortex", e.ax * TS + 12, e.ay * TS + 12, 0, 0, 0.9, "#40ff60", GOLD, 18);
    burst(g, e.ax * TS + 12, e.ay * TS + 12, 40, ["#40ff60", GOLD, "#ffffff"], 90, -20);
    g.en = g.en.filter((o: En) => o !== e);
    g.gobT = 0;
    msg(g, "The " + e.name + " escaped through a portal!", e.gob === 2 ? "#40e0ff" : "#ffb060");
    g.sfx("portal");
    g.notify();
  }
}
const VR = { x: 14, y: 15, w: 16, h: 13 };
// Step into a treasure portal: stash the current floor (kept in the save) and open a monster-free vault full of chests.
function enterVault(g: Game): void {
  const stash = { map: u8s(g.map), seen: u8s(g.seen), en: g.en.filter((e: En) => e.hp > 0).concat(g.pend), chests: g.chests, drops: g.drops, trader: g.trader, hx: g.hero.x, hy: g.hero.y, ft: g.floorTurn, ground: g.ground, gobT: g.gobT };
  g.vault = JSON.stringify(stash);
  const map = new Uint8Array(MW * MH);
  for (let y = VR.y; y < VR.y + VR.h; y++) for (let x = VR.x; x < VR.x + VR.w; x++) map[y * MW + x] = 1;
  g.map = map;
  g.seen = new Uint8Array(MW * MH);
  for (let y = VR.y - 1; y <= VR.y + VR.h; y++) for (let x = VR.x - 1; x <= VR.x + VR.w; x++) if (inb(x, y)) g.seen[y * MW + x] = 1;
  g.vis = new Uint8Array(MW * MH);
  g.en = []; g.pend = []; g.chests = []; g.drops = []; g.ground = []; g.shots = []; g.fx = []; g.echo = [];
  g.trader = null; g.shopOpen = false; g.stashOpen = false; g.floorTurn = 0;
  const my = VR.y + (VR.h >> 1);
  g.portal = { x: VR.x + 1, y: my };
  g.hero.x = VR.x + 2; g.hero.y = my; g.hero.ax = g.hero.x; g.hero.ay = g.hero.y;
  const slots: number[][] = [];
  for (let y = VR.y + 1; y < VR.y + VR.h - 1; y += 2) for (let x = VR.x + 4; x < VR.x + VR.w - 1; x += 2) slots.push([x, y]);
  for (let i = slots.length - 1; i > 0; i--) { const j = ri(i + 1); const tmp = slots[i]; slots[i] = slots[j]; slots[j] = tmp; }
  const n = Math.min(slots.length, 12 + ri(9));
  for (let i = 0; i < n; i++) g.chests.push({ x: slots[i][0], y: slots[i][1], open: false, rar: rollChestRar(g.depth, true) });
  for (let i = 0; i < 4; i++) { const x = VR.x + 3, y = VR.y + 1 + i * 3; if (y < VR.y + VR.h) g.drops.push({ x, y, item: null, pot: false, gold: Math.round((40 + g.depth * 20) * (0.7 + R() * 0.6)) }); }
  computeVis(g);
  placeTorches(g);
  setBanner(g, "TREASURE VAULT", n + " chests \u00b7 no monsters \u00b7 exit portal behind you", GOLD, 6, 2.8);
  msg(g, "You step through the portal into a treasure vault! (" + n + " chests)", GOLD);
  g.flash = 0.5; g.flashC = "#c060ff";
  g.sfx("portal");
  saveGame(g);
  g.notify();
}
function exitVault(g: Game): void {
  let ok = false;
  try {
    const s = JSON.parse(g.vault ?? "") as { map: string; seen: string; en: En[]; chests: Chest[]; drops: Drop[]; trader: Trader | null; hx: number; hy: number; ft: number; ground: Ground[]; gobT: number };
    if (s && typeof s.map === "string" && s.map.length === MW * MH && typeof s.seen === "string" && s.seen.length === MW * MH && inb(s.hx, s.hy)) {
      g.map = su8(s.map); g.seen = su8(s.seen); g.vis = new Uint8Array(MW * MH);
      g.en = (Array.isArray(s.en) ? s.en : []).filter((e: En) => !!e && e.hp > 0 && inb(e.x, e.y)).map((e: En) => ({ ...e, ax: e.x, ay: e.y, bump: 0, hit: 0 }));
      g.pend = [];
      g.chests = Array.isArray(s.chests) ? s.chests.filter((c: Chest) => !!c && inb(c.x, c.y)).map((c: Chest) => packChest(c)) : [];
      g.drops = Array.isArray(s.drops) ? s.drops.filter((d: Drop) => !!d && inb(d.x, d.y)) : [];
      g.trader = null;
      g.ground = Array.isArray(s.ground) ? s.ground : [];
      g.floorTurn = Number(s.ft) || 0; g.gobT = Number(s.gobT) || 0;
      g.hero.x = s.hx; g.hero.y = s.hy; g.hero.ax = s.hx; g.hero.ay = s.hy;
      ok = true;
    }
  } catch { ok = false; }
  g.vault = null; g.portal = null; g.shots = []; g.fx = []; g.echo = []; g.shopOpen = false; g.stashOpen = false; g.gambOpen = false;
  if (!ok) genFloor(g);
  computeVis(g);
  placeTorches(g);
  setBanner(g, "BACK TO DEPTH " + g.depth, "The portal closes behind you", "#c060ff", 4, 2.2);
  msg(g, "You return to depth " + g.depth + ".", "#c8a0ff");
  g.flash = 0.4; g.flashC = "#c060ff";
  g.sfx("portal");
  saveGame(g);
  g.notify();
}
function makeStock(d: number): Item[] {
  const out: Item[] = [];
  const n = 5 + ri(3);
  for (let i = 0; i < n; i++) { const r = R() < 0.0012 * PRIS_DROP_MULT ? 7 : Math.min(6, rollRar(1.12, 0, d)); let it = makeItem(d + 1, r); while (it.kind === "pet") it = makeItem(d + 1, r); out.push(maybeSet(it)); }
  if (R() < 0.3) out.push(makeItem(d + 1, Math.min(6, rollRar(1.12, 0, d)), "pet")); // ~30% of shops offer a pet
  return out;
}
// ---------- act bosses, camp, stash (raw30) ----------
const STASH_N = 100;
const ACT_TITLE = ["Warlord of the First Depths", "Sovereign of the Black Gate", "Tyrant of the Sunless Halls", "Empress of the Broken Seal", "Colossus of the Drowned Crown", "Warden of the Silent Vault", "Harbinger of the Ninth Flame", "King of the Shattered Spire", "Devourer of the Hollow Moon", "Judge of the Last Threshold", "Storm of the Iron Cathedral", "Voidlord of the Endless Dark"];
const ACT_LOOT_W = [8, 11, 14, 13, 10, 7, 5, 4];
function isActFloor(d: number): boolean { return d > 0 && d % 5 === 0; }
function actOf(d: number): number { return Math.max(1, Math.floor(Math.max(1, d) / 5)); }
function actHpMul(act: number): number { return 1.7 + 0.2 * (Math.max(1, act) - 1); }
function actAtkMul(act: number): number { return 1.22 + 0.11 * (Math.max(1, act) - 1); }
function actShieldFrac(act: number): number { return Math.min(0.82, 0.52 + 0.06 * (Math.max(1, act) - 1)); }
function actHitCap(act: number): number {
  const base = Math.min(0.18, 0.14 + 0.008 * (Math.max(1, act) - 1));
  if (act <= POST_ACT0) return base;
  return Math.min(0.28, base * safePow(actPostMul(act), 0.12));
}
function actAddCount(act: number, phase: number): number {
  if (act < 2 || phase < 2) return 0;
  return (phase >= 3 ? 2 : 1) + Math.floor((act - 2) / 2);
}
function uiBlocked(g: Game): boolean { return !!(g.shopOpen || g.stashOpen || g.gambOpen); }
function portalKind(g: Game): "vault" | "camp" | "proceed" | "" {
  if (!g.portal) return "";
  const k = g.portal.kind;
  if (k === "camp" || k === "proceed" || k === "vault") return k;
  return g.vault ? "vault" : "";
}
function portalHue(g: Game): string {
  const k = portalKind(g);
  if (k === "camp") return "#ffb040";
  if (k === "proceed") return "#40e0ff";
  if (k === "vault" || g.vault) return "#40ffa0";
  return "#c060ff";
}
function portalLabel(g: Game): string {
  const k = portalKind(g);
  if (k === "camp") return "CAMP";
  if (k === "proceed") return "NEXT";
  if (g.vault) return "EXIT";
  return "?";
}
function campBlocked(g: Game, x: number, y: number): boolean {
  return !!(g.stashAt && g.stashAt.x === x && g.stashAt.y === y) || !!(g.restAt && g.restAt.x === x && g.restAt.y === y) || !!(g.fireAt && g.fireAt.x === x && g.fireAt.y === y) || merchAt(g, x, y);
}
function merchAt(g: Game, x: number, y: number): boolean {
  return !!(g.merchant && g.merchant.x === x && g.merchant.y === y);
}
const WALL_BREAK_SEC = 2.5;
const WALL_CRACK_STAGES = 4;
const WALL_DIG_DT_CAP = 0.2;
// Outer barrier: out-of-bounds tiles plus the 1-tile perimeter ring that frames every depth zone (map edges). Never breakable.
function isOuterBarrier(x: number, y: number): boolean {
  return x < 1 || y < 1 || x > MW - 2 || y > MH - 2;
}
function canBreakWall(g: Game, x: number, y: number): boolean {
  if (isOuterBarrier(x, y) || !inb(x, y)) return false;
  if (g.map[y * MW + x] !== 0) return false;
  if (campBlocked(g, x, y)) return false;
  if (g.portal && g.portal.x === x && g.portal.y === y) return false;
  return true;
}
function cracksOf(g: Game): number[] {
  if (!g.cracks || g.cracks.length !== MW * MH) g.cracks = new Array(MW * MH).fill(0);
  return g.cracks;
}
function clearCracks(g: Game): void {
  g.cracks = new Array(MW * MH).fill(0);
  g.digAt = undefined;
  g.digClock = undefined;
}
function packCracks(g: Game): string {
  const c = g.cracks;
  if (!c || c.length !== MW * MH) return "";
  const parts: string[] = [];
  for (let i = 0; i < c.length; i++) {
    const p = c[i] || 0;
    if (p > 0 && p < 1 && (!g.map || g.map[i] === 0)) parts.push(i + ":" + Math.max(1, Math.min(99, Math.round(p * 100))));
  }
  return parts.join(",");
}
function unpackCracks(raw: unknown, map?: Uint8Array): number[] {
  const a = new Array(MW * MH).fill(0);
  if (typeof raw !== "string" || !raw) return a;
  for (const part of raw.split(",")) {
    if (!part) continue;
    const sp = part.split(":");
    const k = Math.floor(Number(sp[0])), p = Number(sp[1]);
    if (!(k >= 0 && k < MW * MH && isFinite(p) && p > 0)) continue;
    if (map && map[k] !== 0) continue;
    a[k] = Math.max(0, Math.min(0.99, p / 100));
  }
  return a;
}
function crackStage(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return WALL_CRACK_STAGES;
  return Math.min(WALL_CRACK_STAGES, 1 + Math.floor(p * WALL_CRACK_STAGES));
}
function drawWallCracks(ctx: CanvasRenderingContext2D, sx: number, sy: number, stage: number): void {
  if (stage <= 0) return;
  ctx.save();
  const line = (x0: number, y0: number, x1: number, y1: number): void => {
    ctx.beginPath(); ctx.moveTo(sx + x0, sy + y0); ctx.lineTo(sx + x1, sy + y1); ctx.stroke();
  };
  ctx.strokeStyle = "rgba(16, 10, 8, 0.8)";
  ctx.lineWidth = 1;
  line(4, 3, 11, 10);
  if (stage >= 2) { line(14, 2, 9, 14); line(6, 16, 18, 11); }
  if (stage >= 3) { line(2, 12, 20, 8); line(16, 4, 19, 20); line(8, 2, 5, 20); }
  if (stage >= 4) {
    ctx.strokeStyle = "rgba(8, 6, 4, 0.95)";
    ctx.lineWidth = 1.5;
    line(3, 5, 21, 18); line(20, 3, 4, 21); line(1, 14, 22, 10);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(sx + 7, sy + 8, 2, 2);
    ctx.fillRect(sx + 15, sy + 13, 3, 2);
    ctx.fillRect(sx + 10, sy + 16, 2, 3);
  }
  ctx.restore();
}
function breakWallTile(g: Game, x: number, y: number): void {
  if (!canBreakWall(g, x, y)) return;
  g.map[y * MW + x] = 1;
  cracksOf(g)[y * MW + x] = 0;
  if (g.digAt && g.digAt.x === x && g.digAt.y === y) { g.digAt = undefined; g.digClock = undefined; }
  g.wallVer = (g.wallVer || 0) + 1;
  burst(g, x * TS + 12, y * TS + 12, 16, ["#c0b8a0", "#6a6050", "#ffffff"], 50, 40);
  try { g.sfx("step"); } catch { /* ignore */ }
  floatTxt(g, x, y - 0.4, "BREAK", "#e8d8b0");
  computeVis(g);
}
function pushDig(g: Game, x: number, y: number, dt: number): boolean {
  if (!g.wallBreak || !canBreakWall(g, x, y)) return false;
  const add = Math.max(0, Math.min(WALL_DIG_DT_CAP, dt));
  const k = y * MW + x;
  const c = cracksOf(g);
  const before = crackStage(c[k] || 0);
  c[k] = Math.min(1, (c[k] || 0) + add / WALL_BREAK_SEC);
  g.digAt = { x, y };
  const after = crackStage(c[k]);
  if (after > before) { try { g.sfx("step"); } catch { /* ignore */ } }
  if (c[k] >= 1) breakWallTile(g, x, y);
  return true;
}
function tryWallDig(g: Game, dx: number, dy: number): boolean {
  if (!g.wallBreak || (dx === 0 && dy === 0)) return false;
  const h = g.hero;
  const nx = h.x + dx, ny = h.y + dy;
  let tx = nx, ty = ny;
  if (!canBreakWall(g, nx, ny)) {
    const destBlocked = !inb(nx, ny) || isOuterBarrier(nx, ny) || g.map[ny * MW + nx] === 0;
    if (canBreakWall(g, h.x, h.y) && destBlocked) { tx = h.x; ty = h.y; }
    else return false;
  }
  const now = g.time;
  let dt = 0;
  if (g.digAt && g.digAt.x === tx && g.digAt.y === ty && g.digClock !== undefined) dt = Math.max(0, now - g.digClock);
  g.digClock = now;
  g.digAt = { x: tx, y: ty };
  pushDig(g, tx, ty, dt);
  return true;
}
function toggleWallBreak(g: Game): void {
  g.wallBreak = !g.wallBreak;
  msg(g, g.wallBreak ? "Wall Breaker on - walk into a wall to dig." : "Wall Breaker off.", g.wallBreak ? "#e8d8b0" : "#c0c0c0");
  if (g.mode === "play") saveGame(g, true);
  g.notify();
}

function livingActBoss(g: Game): En | null {
  for (const e of g.en) {
    if (e.hp <= 0) continue;
    if (e.act) return e;
    if (isActFloor(g.depth) && e.cls === 2 && !e.hunt && !e.gob) return e;
  }
  return null;
}
function canEnterCamp(g: Game): boolean {
  if (g.area === "camp" || g.vault || g.mode !== "play") return false;
  if (!isActFloor(g.depth)) return false;
  if (actEverCleared(g)) return true;
  if (livingActBoss(g)) return false;
  return (g.actCampAt ?? 0) === g.depth;
}
function recapActAtk(g: Game, atk: number, act: number): number {
  if (!g.eq) return Math.max(1, Math.round(atk));
  const hs = calc(g.lvl, g.eq);
  const C = hs.maxHp * actHitCap(act);
  return Math.max(1, Math.round(Math.min(atk, (C + Math.sqrt(C * C + 4 * C * hs.def)) / 2)));
}
// ---------- unique act-boss roster (raw32) ----------
const ACT_BOSS_N = 8;
const ACT_BOSS_PX = 16;
const ACT_BOSS_SC = 4; // 64px vs a normal 24px foe (~2.7x, visibly huge)
const ACT_BOSS_PAD = 8;
const ACT_BOSS_W = ACT_BOSS_PAD * 2 + ACT_BOSS_PX * ACT_BOSS_SC;
const ACT_BOSS_PART_CAP = 220;
const ACT_BOSS_CYCLE = ["", "Ascended", "Transcendent", "Eternal"];
interface ActBossDef { name: string; title: string; look: string; pal: string[]; glow: string; el: El; sig: string }
const ACT_BOSSES: ActBossDef[] = [
  { name: "Bone Colossus", title: "Tyrant of the Ivory Pit", look: "Towering ivory skeleton with a horned skull, exposed ribs, and swinging bone-club arms.", pal: ["#e8dcc8", "#fff8ee", "#7a6a58", "#ff4040"], glow: "#f0e0c8", el: "dark", sig: "Bone Rain" },
  { name: "Infernal Warlord", title: "Lord of the Ninth Flame", look: "Broad horned demon in lava-black plate, a burning cape, and fists wreathed in fire.", pal: ["#c02818", "#ff8020", "#3a0c08", "#ffe060"], glow: "#ff4a18", el: "hell", sig: "Hellfire Nova" },
  { name: "Frost Wyrm", title: "Sovereign of the White Expanse", look: "Coiled ice dragon with pale wings and a frost-venting maw, body rippling as it hovers.", pal: ["#80d8ff", "#f0ffff", "#1a4a70", "#ffe8a0"], glow: "#80e8ff", el: "frost", sig: "Frost Breath" },
  { name: "Void Seraph", title: "Judge of the Last Threshold", look: "Six-winged void angel with a cracked halo and a star-core chest, wings beating in silhouette.", pal: ["#6a20a8", "#e0a0ff", "#14081c", "#ffffff"], glow: "#c060ff", el: "void", sig: "Void Beam" },
  { name: "Plague Hive Queen", title: "Mother of the Virulent Brood", look: "Swollen chitin queen with buzzing wings, dripping ichor, and a hive-bulb abdomen.", pal: ["#68a030", "#d8ff60", "#2a3a10", "#ff4060"], glow: "#80ff40", el: "dark", sig: "Plague Cloud" },
  { name: "Storm Titan", title: "Tempest of the Iron Cathedral", look: "Cloud-crowned giant of slate and gold, one arm a living thunderbolt.", pal: ["#4a68a8", "#ffe040", "#1c2438", "#ffffff"], glow: "#a8c8ff", el: "elec", sig: "Chain Lightning" },
  { name: "Crystal Golem", title: "Warden of the Prism Vault", look: "Hulking faceted construct of teal and magenta crystal with a pulsing prism heart.", pal: ["#20c0c8", "#e8ffff", "#143048", "#ff60c8"], glow: "#40f0ff", el: "holy", sig: "Crystal Shatter" },
  { name: "Shadow Lich", title: "Voidlord of the Endless Dark", look: "Floating hooded lich in midnight robes, staff raised, a sickly green soul-flame in the cowl.", pal: ["#3a1858", "#70ff90", "#0c0610", "#e8ffe8"], glow: "#60ff80", el: "void", sig: "Soul Drain" },
];
function actBossId(act: number): number { return (Math.max(1, act) - 1) % ACT_BOSS_N; }
function actBossCycle(act: number): number { return Math.floor((Math.max(1, act) - 1) / ACT_BOSS_N); }
function actBossPrefix(cyc: number): string {
  const n = Math.max(0, cyc | 0);
  if (n <= 0) return "";
  if (n === 1) return "Ascended ";
  if (n === 2) return "Transcendent ";
  return n === 3 ? "Eternal " : "Eternal " + (n - 2) + " ";
}
function actBossDef(id: number): ActBossDef { return ACT_BOSSES[Math.max(0, Math.min(ACT_BOSS_N - 1, id | 0))]; }
function actBossPal(id: number, cyc: number): string[] {
  const p = actBossDef(id).pal.slice();
  if (cyc >= 1) p[1] = cyc >= 2 ? GOLD : "#fff4c8";
  if (cyc >= 2) p[3] = "#ffffff";
  if (cyc >= 3) p[0] = p[0];
  return p;
}
function actBossFullName(id: number, cyc: number): string { return actBossPrefix(cyc) + actBossDef(id).name; }
function bindActBoss(e: En, act: number = e.act || 1): En {
  const a = Math.max(1, act | 0);
  e.act = a;
  if (e.abt === undefined || e.abt < 0 || e.abt >= ACT_BOSS_N) e.abt = actBossId(a);
  if (e.abc === undefined || e.abc < 0) e.abc = actBossCycle(a);
  e.phase = e.phase && e.phase > 0 ? e.phase : 1;
  e.pal = actBossPal(e.abt, e.abc);
  e.name = actBossFullName(e.abt, e.abc);
  const d = actBossDef(e.abt);
  if (!e.elW) e.elW = d.el;
  return e;
}
function actBossOf(e: En | null | undefined): ActBossDef | null {
  if (!e || !e.act) return null;
  if (e.abt === undefined || e.abt < 0 || e.abt >= ACT_BOSS_N) return null;
  return actBossDef(e.abt);
}
function actBossLootT(d: number): number {
  if (d <= 5) return 0;
  if (d >= 1000) return 1;
  return Math.pow((d - 5) / 995, 0.7);
}
function actLootCountRange(d: number): { min: number; max: number } {
  const t = actBossLootT(Math.max(1, d));
  const lo = Math.min(20, Math.round(3 + 13 * t));
  const hi = Math.min(20, Math.round(5 + 15 * t));
  return { min: lo, max: Math.max(lo, hi) };
}
function actLootExpected(act: number, d?: number): number {
  const depth = d !== undefined ? d : Math.max(1, act) * 5;
  const r = actLootCountRange(depth);
  return (r.min + r.max) / 2;
}
function mkActBoss(g: Game, x: number, y: number): En {
  const e = mkEnemy(g, x, y, 2);
  const act = actOf(g.depth);
  e.phase = 1;
  e.atk = recapActAtk(g, e.atk * actAtkMul(act), act);
  e.def = Math.round(e.def * (1.12 + 0.05 * (act - 1)));
  e.xp = Math.round(e.xp * (2.2 + 0.35 * (act - 1)));
  const sh = actShieldFrac(act);
  const post = actPostMul(act);
  if (g.eq) {
    const hs = calc(g.lvl, g.eq);
    const main = g.eq.rh ?? (g.eq.lh && g.eq.lh.kind !== "shield" ? g.eq.lh : null);
    const hsWant = calc(g.lvl, eqStarCapped(g.eq, PRIS_STAR_BASE));
    const ev = Math.max(1, hsWant.atk * combatSwingMul(hsWant, isTwo(main)));
    const want = Math.max(1, (actFightSec(act) / RT_ATK) * ev / (1 + sh));
    // Want-based at every depth (beatable with a 5★-capped version of the current kit).
    // actPostMul is 1 through act 200 (d1000) and 1.028^(act-200) after that, so HP climbs
    // smoothly through 1000 and only then becomes "absolutely ridiculous".
    e.hp = e.mhp = safeRound(safeMul(want, post));
    e.atk = recapActAtk(g, safeMul(Math.max(e.atk, atkForHit(hs.maxHp * actHitCap(act), hs.def)), post), act);
  } else {
    const floor = Math.max(1, Math.round(e.mhp * actHpMul(act)));
    e.hp = e.mhp = safeRound(safeMul(floor, post));
  }
  if (g.depth === 5) {
    e.hp = e.mhp = Math.max(1, Math.round(e.mhp * 0.8));
    e.atk = Math.max(1, Math.round(e.atk * 0.8));
  }
  e.mshd = e.shd = Math.round(e.mhp * sh);
  bindActBoss(e, act);
  return e;
}

function drawActBossSprite(p: Pt, id: number, c: string[], t: number): void {
  const [m, l, d, e] = c;
  const a = Math.floor(t * 4) % 2;
  const b = Math.floor(t * 2.2) % 2;
  const K = "#100818", W = "#f4f0e8";
  const bob = id === 2 || id === 3 || id === 7 ? b : 0;
  if (id === 0) {
    // Bone Colossus: horned skull, ribcage, club arms, stepping legs
    p(5, 0, 2, 2, l); p(4, 1, 8, 4, l); p(3, 2, 1, 2, l); p(12, 2, 1, 2, l);
    p(5, 2, 1, 1, K); p(9, 2, 1, 1, K); p(5, 2, 1, 1, e); p(9, 2, 1, 1, e);
    p(7, 3, 2, 1, d); p(6, 4, 4, 1, l); p(6, 5, 4, 4, l);
    p(6, 6, 1, 1, d); p(8, 6, 1, 1, d); p(6, 8, 1, 1, d); p(8, 8, 1, 1, d);
    p(5, 5, 1, 5, l); p(10, 5, 1, 5, l);
    p(4, 10, 8, 2, l); p(5, 12, 2, 4 - a, l); p(9, 12 + a, 2, 4 - a, l);
    p(0, 6 + a, 5, 2, l); p(0, 5 + a, 2, 2, l); p(11, 6 + (1 - a), 5, 2, l); p(14, 5 + (1 - a), 2, 2, l);
  } else if (id === 1) {
    // Infernal Warlord: horns, plate, fire cape, flaming fists
    p(3, 0, 2, 2, d); p(11, 0, 2, 2, d); p(4, 1, 8, 4, m); p(5, 1, 6, 1, l);
    p(6, 2, 1, 1, K); p(9, 2, 1, 1, K); p(6, 2, 1, 1, e); p(9, 2, 1, 1, e);
    p(7, 4, 2, 1, d); p(3, 5, 10, 6, m); p(4, 6, 8, 1, l); p(7, 7, 2, 3, e);
    p(2, 6, 1, 5, d); p(13, 6, 1, 5, d);
    p(0, 8 + a, 3, 3, e); p(13, 8 + (1 - a), 3, 3, e); p(1, 9 + a, 1, 1, l); p(14, 9 + (1 - a), 1, 1, l);
    p(4, 11, 3, 2, d); p(9, 11, 3, 2, d); p(4, 13, 3, 3, m); p(9, 13, 3, 3, m);
    p(2, 5 + a, 2, 5, e); p(12, 4 + (1 - a), 2, 6, e);
  } else if (id === 2) {
    // Frost Wyrm: coiled body, wings, horned head, rippling
    const y = bob;
    p(9, 1 + y, 5, 4, m); p(13, 2 + y, 2, 2, m); p(10, 2 + y, 1, 1, e); p(14, 1 + y, 1, 2, l);
    p(11, 4 + y, 2, 1, W);
    p(2, 5 + y, 10, 4, m); p(4, 6 + y, 6, 2, l); p(0, 6 + y, 3, 3, m); p(1, 7 + y, 1, 1, e);
    p(3, 9 + y, 8, 3, m); p(6, 10 + y, 4, 2, l); p(5, 12 + y, 5, 2, m); p(8, 14 + y, 3, 2, l);
    p(3, 3 + a, 4, 2, l); p(1, 4 + a, 3, 2, l); p(10, 6 + (1 - a), 4, 2, l); p(13, 7 + (1 - a), 3, 2, l);
  } else if (id === 3) {
    // Void Seraph: six wings, halo, star core
    const y = bob;
    p(6, 0 + y, 4, 1, e); p(5, 0 + y, 1, 1, l); p(10, 0 + y, 1, 1, l);
    p(6, 2 + y, 4, 4, m); p(5, 3 + y, 6, 4, m); p(7, 3 + y, 1, 1, e); p(9, 3 + y, 1, 1, e); p(7, 5 + y, 2, 2, W);
    p(6, 8 + y, 4, 5, m); p(7, 9 + y, 2, 2, l); p(6, 13 + y, 1, 3, d); p(9, 13 + y, 1, 3, d);
    p(0, 4 + a, 5, 2, d); p(0, 6 + a, 5, 2, d); p(1, 8 + a, 4, 2, d);
    p(11, 4 + (1 - a), 5, 2, d); p(11, 6 + (1 - a), 5, 2, d); p(11, 8 + (1 - a), 4, 2, d);
    p(2, 3 + a, 3, 1, l); p(11, 3 + (1 - a), 3, 1, l);
  } else if (id === 4) {
    // Plague Hive Queen: mandibles, thorax, bulb abdomen, buzzing wings
    p(6, 1, 4, 3, m); p(5, 2, 6, 3, m); p(7, 2, 1, 1, e); p(9, 2, 1, 1, e);
    p(5, 3, 1, 2, d); p(10, 3, 1, 2, d); p(6, 4, 4, 1, l);
    p(5, 5, 6, 4, m); p(6, 6, 4, 2, l);
    p(4, 9, 8, 5, m); p(5, 10, 6, 3, e); p(6, 11, 4, 2, l);
    p(3, 13, 2, 2, d); p(11, 13, 2, 2, d); p(7, 14, 2, 2, d);
    p(0, 5 + a, 5, 3, l); p(11, 5 + (1 - a), 5, 3, l); p(1, 6 + a, 3, 1, m); p(12, 6 + (1 - a), 3, 1, m);
  } else if (id === 5) {
    // Storm Titan: cloud crown, barrel chest, lightning arm
    p(5, 0, 6, 2, l); p(4, 1, 8, 2, W); p(6, 0 + a, 1, 1, e); p(9, 1 - a, 1, 1, e);
    p(5, 3, 6, 4, m); p(6, 4, 1, 1, K); p(9, 4, 1, 1, K); p(6, 4, 1, 1, e); p(9, 4, 1, 1, W);
    p(3, 7, 10, 5, m); p(5, 8, 6, 2, l); p(7, 9, 2, 2, e);
    p(0, 8, 3, 4, m); p(13, 6 + a, 3, 2, e); p(14, 8 + a, 2, 6, e); p(13, 12 + a, 3, 1, W);
    p(4, 12, 3, 2, d); p(9, 12, 3, 2, d); p(4, 14, 3, 2, m); p(9, 14, 3, 2, m);
  } else if (id === 6) {
    // Crystal Golem: faceted blocks, prism heart
    p(6, 0, 4, 2, l); p(5, 1, 6, 4, m); p(6, 2, 4, 2, l); p(7, 3, 2, 2, e);
    p(3, 5, 10, 6, m); p(4, 6, 3, 4, l); p(9, 6, 3, 4, d); p(7, 7, 2, 3, e);
    p(2, 6, 2, 5, d); p(12, 6, 2, 5, l);
    p(4, 11, 3, 2, m); p(9, 11, 3, 2, m);
    p(3, 13, 4, 3, d); p(9, 13, 4, 3, l);
    if (a) { p(7, 7, 2, 3, W); p(2, 4, 2, 2, l); p(12, 4, 2, 2, e); }
  } else {
    // Shadow Lich: hood, robe, staff, soul-flame, floats
    const y = bob;
    p(6, 1 + y, 4, 1, d); p(5, 2 + y, 6, 4, d); p(6, 3 + y, 4, 3, m);
    p(7, 3 + y, 1, 1, e); p(9, 3 + y, 1, 1, e); p(7, 5 + y, 2, 1, l);
    p(7, 2 + y, 2, 1, e);
    p(4, 6 + y, 8, 8, d); p(5, 7 + y, 6, 6, m); p(6, 8 + y, 4, 2, l);
    p(5, 14 + y, 2, 2, d); p(9, 14 + y, 2, 2, d);
    p(13, 0 + y, 2, 2, e); p(13, 2 + y, 1, 12, l); p(12, 12 + y, 3, 1, m);
    p(3, 8 + y, 1, 3, d); p(12, 8 + y, 1, 3, d);
  }
}

let ACTB_CV: HTMLCanvasElement | null = null, ACTB_TINT: HTMLCanvasElement | null = null;
function actBossFoot(sx: number, sy: number): number[] {
  const pad = ACT_BOSS_PAD, sc = ACT_BOSS_SC, px = ACT_BOSS_PX;
  const x0 = sx + 12 - (pad + (px * sc) / 2);
  const y0 = sy + 22 - (pad + px * sc);
  return [x0, y0];
}
function drawActBoss(ctx: CanvasRenderingContext2D, e: En, sx: number, sy: number, flip: boolean, t: number): void {
  bindActBoss(e);
  const d = actBossDef(e.abt as number);
  const glow = d.glow;
  const cyc = e.abc ?? 0;
  const pulse = 0.5 + 0.5 * Math.sin(t * (4 + Math.min(3, cyc)));
  const [x0, y0] = actBossFoot(sx, sy);
  const cx = sx + 12, cy = sy + 10;
  try {
    const W = ACT_BOSS_W;
    if (!ACTB_CV) { ACTB_CV = document.createElement("canvas"); ACTB_CV.width = W; ACTB_CV.height = W; }
    if (!ACTB_TINT) { ACTB_TINT = document.createElement("canvas"); ACTB_TINT.width = W; ACTB_TINT.height = W; }
    const bc = ACTB_CV.getContext("2d"), tc = ACTB_TINT.getContext("2d");
    if (!bc || !tc) throw new Error("no ctx");
    bc.clearRect(0, 0, W, W);
    drawActBossSprite(painter(bc, ACT_BOSS_PAD, ACT_BOSS_PAD, ACT_BOSS_SC, flip, ACT_BOSS_PX), e.abt as number, e.pal, t + e.id);
    tc.globalCompositeOperation = "source-over"; tc.clearRect(0, 0, W, W); tc.drawImage(ACTB_CV, 0, 0);
    tc.globalCompositeOperation = "source-in"; tc.fillStyle = glow; tc.fillRect(0, 0, W, W); tc.globalCompositeOperation = "source-over";
    // soft floor halo (circle, not a box)
    const rad = 16 + pulse * (5 + cyc);
    const halo = ctx.createRadialGradient(cx, sy + 20, 2, cx, sy + 20, rad);
    halo.addColorStop(0, colAlpha(glow, 0.4 + 0.2 * pulse));
    halo.addColorStop(1, colAlpha(glow, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, sy + 20, rad, 0, 6.2832); ctx.fill();
    // shape-following edge glow: tinted sprite stamps, no shadowBlur (phones)
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.35 * pulse;
    const off = cyc >= 1 ? 3 : 2;
    ctx.drawImage(ACTB_TINT, x0 - off, y0); ctx.drawImage(ACTB_TINT, x0 + off, y0);
    ctx.drawImage(ACTB_TINT, x0, y0 - off); ctx.drawImage(ACTB_TINT, x0, y0 + off);
    if (cyc >= 2) {
      ctx.globalAlpha = 0.25 + 0.2 * pulse;
      ctx.drawImage(ACTB_TINT, x0 - off, y0 - off); ctx.drawImage(ACTB_TINT, x0 + off, y0 + off);
    }
    ctx.restore();
    ctx.drawImage(ACTB_CV, x0, y0);
  } catch {
    drawActBossSprite(painter(ctx, sx + 12 - 32, sy + 22 - 64, ACT_BOSS_SC, flip, ACT_BOSS_PX), e.abt as number, e.pal, t + e.id);
  }
}

function actBossIntro(g: Game, e: En): void {
  if (!e.act || e.abIntro || e.hp <= 0) return;
  bindActBoss(e);
  e.abIntro = true;
  const d = actBossDef(e.abt as number);
  const nm = actBossFullName(e.abt as number, e.abc ?? 0);
  setBanner(g, nm.toUpperCase(), d.title, d.glow, 9, 3.8);
  msg(g, nm + " - " + d.title + "!", d.glow);
  g.sfx("roar");
  g.shake = Math.max(g.shake, 8);
  g.flash = Math.max(g.flash, 0.35); g.flashC = d.glow;
  const cx = e.ax * TS + 12, cy = e.ay * TS + 12;
  const room = Math.max(0, 480 - g.parts.length);
  const n = Math.min(36 + (e.abc ?? 0) * 8, room);
  burst(g, cx, cy, n, [d.glow, e.pal[0], e.pal[1], "#ffffff"], 110, 20);
  fxAdd(g, "ring", cx, cy, 0, 0, 0.7, d.glow, "#ffffff", 36);
}
function maybeActBossIntro(g: Game): void {
  if (g.mode !== "play" || g.area === "camp" || g.vault) return;
  for (const e of g.en) if (e.act && e.hp > 0 && !e.abIntro && g.vis[e.y * MW + e.x]) actBossIntro(g, e);
}

function actBossPart(g: Game, x: number, y: number, vx: number, vy: number, life: number, c: string, s: number, gr: number, k: number): void {
  if (g.parts.length >= ACT_BOSS_PART_CAP) return;
  g.parts.push({ x, y, vx, vy, life, max: life, c, s, g: gr, k });
}
function idleActBossFx(g: Game, dt: number): void {
  if (g.mode !== "play" || g.area === "camp" || g.parts.length >= ACT_BOSS_PART_CAP) return;
  const rate = Math.min(1, dt * 60);
  for (const e of g.en) {
    if (!e.act || e.hp <= 0 || g.parts.length >= ACT_BOSS_PART_CAP) continue;
    if (!g.vis[e.y * MW + e.x]) continue;
    bindActBoss(e);
    const id = e.abt as number;
    const d = actBossDef(id);
    const cyc = e.abc ?? 0;
    if (R() >= (0.1 + cyc * 0.03) * rate) continue;
    const px = e.ax * TS + 12 + (R() - 0.5) * 28, py = e.ay * TS + 8 + (R() - 0.5) * 22;
    const life = 0.5 + R() * 0.55;
    const col = R() < 0.5 ? d.glow : e.pal[1];
    if (id === 0) actBossPart(g, px, py, (R() - 0.5) * 10, 18 + R() * 10, life, col, 1.4, 30, 1);
    else if (id === 1) actBossPart(g, px, py, (R() - 0.5) * 12, -18 - R() * 16, life, col, 1.6, -8, 2);
    else if (id === 2) actBossPart(g, px, py, (R() - 0.5) * 8, 8 + R() * 10, life + 0.2, col, 1.5, 8, 4);
    else if (id === 3) actBossPart(g, px, py, (R() - 0.5) * 16, -10 - R() * 10, life, col, 1.4, -12, 5);
    else if (id === 4) actBossPart(g, px, py, (R() - 0.5) * 10, -12 - R() * 8, life, col, 1.5, -6, 3);
    else if (id === 5) actBossPart(g, px, py, (R() - 0.5) * 40, (R() - 0.5) * 20, 0.35 + R() * 0.2, col, 1.2, 0, 1);
    else if (id === 6) actBossPart(g, px, py, (R() - 0.5) * 8, -8 - R() * 8, life, col, 1.6, -4, 5);
    else actBossPart(g, px, py, (R() - 0.5) * 6, -14 - R() * 10, life + 0.15, col, 1.5, -10, 4);
  }
}

function actBossMeleeFx(g: Game, e: En): void {
  const d = actBossOf(e);
  if (!d) return;
  const hx = g.hero.ax * TS + 12, hy = g.hero.ay * TS + 12;
  const ex = e.ax * TS + 12, ey = e.ay * TS + 12;
  const id = e.abt as number;
  if (id === 0) fxAdd(g, "spikes", ex, ey, hx, hy, 0.28, d.glow, "#ffffff", 6);
  else if (id === 1) { fxAdd(g, "ring", hx, hy, 0, 0, 0.28, d.glow, e.pal[3], 18); burst(g, hx, hy, 8, [d.glow, e.pal[3]], 50, 20); }
  else if (id === 2) fxAdd(g, "cloud", hx, hy, 0, 0, 0.3, d.glow, "#ffffff", 16);
  else if (id === 3) fxAdd(g, "beam", ex, ey - 8, hx, hy, 0.22, d.glow, "#ffffff", 4);
  else if (id === 4) fxAdd(g, "cloud", hx, hy, 0, 0, 0.35, d.glow, e.pal[3], 14);
  else if (id === 5) fxAdd(g, "arc", ex, ey, hx, hy, 0.22, d.glow, "#ffffff", 2);
  else if (id === 6) fxAdd(g, "blades", hx, hy, 0, 0, 0.3, d.glow, e.pal[3], 16);
  else fxAdd(g, "bolt", ex, ey - 10, hx, hy, 0.24, d.glow, e.pal[1], 3);
}
function actBossPhaseFx(g: Game, e: En): void {
  bindActBoss(e);
  const d = actBossDef(e.abt as number);
  const cx = e.ax * TS + 12, cy = e.ay * TS + 12;
  const n = Math.min(48 + (e.phase ?? 1) * 8, Math.max(0, 500 - g.parts.length));
  burst(g, cx, cy, n, [d.glow, e.pal[0], e.pal[1], "#ffffff"], 140, 10);
  fxAdd(g, "ring", cx, cy, 0, 0, 0.55, d.glow, "#ffffff", 28 + (e.phase ?? 1) * 6);
  if ((e.abt as number) === 1 || (e.abt as number) === 5) fxAdd(g, "pillar", cx, cy, 0, 0, 0.4, d.glow, "#ffffff", 12);
  if ((e.abt as number) === 3 || (e.abt as number) === 7) fxAdd(g, "vortex", cx, cy, 0, 0, 0.5, d.glow, e.pal[2], 22);
  g.flash = Math.max(g.flash, 0.3); g.flashC = d.glow;
}
function actBossDeathFx(g: Game, e: En, dir?: { dx: number; dy: number }): void {
  bindActBoss(e);
  const d = actBossDef(e.abt as number);
  const cx = e.ax * TS + 12, cy = e.ay * TS + 12;
  const n = Math.min(90 + (e.abc ?? 0) * 12, Math.max(0, 520 - g.parts.length));
  const gd = dir || hitDirOf(g, e);
  burstGib(g, cx, cy, n, [d.glow, e.pal[0], e.pal[1], e.pal[3], "#ffffff"], 170, 30, gd.dx, gd.dy);
  fxAdd(g, "ring", cx, cy, 0, 0, 0.8, d.glow, "#ffffff", 44);
  g.shake = Math.max(g.shake, 11);
  g.flash = 0.55; g.flashC = d.glow;
  g.sfx("boss");
}
function actBossAbility(g: Game, e: En, st: Stats): boolean {
  if (!e.act || e.hp <= 0) return false;
  bindActBoss(e);
  const cd = e.abCd ?? 0;
  if (cd > 0) { e.abCd = cd - 1; return false; }
  const h = g.hero;
  const md = Math.abs(h.x - e.x) + Math.abs(h.y - e.y);
  const id = e.abt as number;
  const d = actBossDef(id);
  const phase = e.phase ?? 1;
  const ready = md <= (id === 0 || id === 4 || id === 1 ? 5 : 6);
  if (!ready) return false;
  const wait = Math.max(2, 4 - Math.min(2, phase - 1) - ((e.abc ?? 0) > 0 ? 1 : 0));
  e.abCd = wait;
  const ex = e.ax * TS + 12, ey = e.ay * TS + 12;
  const hx = h.ax * TS + 12, hy = h.ay * TS + 12;
  floatTxt(g, e.x, e.y - 1.1, d.sig.toUpperCase(), d.glow);
  g.sfx("roar");
  if (id === 0) {
    fxAdd(g, "spikes", ex, ey - 20, hx, hy, 0.4, d.glow, "#ffffff", 8);
    burst(g, hx, hy - 8, 12, [d.glow, e.pal[0]], 60, 80);
    enemyAttack(g, e, 0.55, st);
  } else if (id === 1) {
    fxAdd(g, "ring", ex, ey, 0, 0, 0.5, d.glow, e.pal[3], 30);
    fxAdd(g, "meteor", hx, hy, 0, 0, 0.45, d.glow, e.pal[3], 16);
    if (md <= 3) enemyAttack(g, e, 0.6, st);
    else if (md <= 5) enemyAttack(g, e, 0.48, st);
  } else if (id === 2) {
    const line = lineTiles(g, e.x, e.y, h.x, h.y, 4);
    const end = line.length ? line[line.length - 1] : [h.x, h.y];
    fxAdd(g, "beam", ex, ey, end[0] * TS + 12, end[1] * TS + 12, 0.4, d.glow, "#ffffff", 8);
    fxAdd(g, "cloud", hx, hy, 0, 0, 0.45, d.glow, "#ffffff", 18);
    let hit = false;
    for (const [x, y] of line) if (x === h.x && y === h.y) hit = true;
    if (hit || md <= 3) enemyAttack(g, e, 0.6, st);
  } else if (id === 3) {
    fxAdd(g, "beam", ex, ey - 10, hx, hy, 0.4, d.glow, "#ffffff", 6);
    fxAdd(g, "vortex", hx, hy, 0, 0, 0.35, d.glow, e.pal[2], 16);
    if (md <= 6) enemyAttack(g, e, 0.58, st);
  } else if (id === 4) {
    fxAdd(g, "cloud", hx, hy, 0, 0, 0.7, d.glow, e.pal[3], 22);
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) addGround(g, h.x + xx, h.y + yy, "dark", 3, Math.max(1, Math.round(e.atk * 0.18)));
    if (md <= 2) enemyAttack(g, e, 0.5, st);
  } else if (id === 5) {
    fxAdd(g, "arc", ex, ey, hx, hy, 0.28, d.glow, "#ffffff", 3);
    fxAdd(g, "bolt", ex, ey - 16, hx, hy, 0.28, d.glow, "#ffffff", 4);
    if (md <= 6) enemyAttack(g, e, 0.62, st);
  } else if (id === 6) {
    fxAdd(g, "blades", hx, hy, 0, 0, 0.45, d.glow, e.pal[3], 22);
    burst(g, hx, hy, 14, [d.glow, e.pal[1], e.pal[3]], 80, 20);
    if (md <= 4) enemyAttack(g, e, 0.6, st);
  } else {
    fxAdd(g, "bolt", ex, ey - 12, hx, hy, 0.32, d.glow, e.pal[1], 4);
    if (md <= 6) {
      enemyAttack(g, e, 0.5, st);
      const healN = Math.max(1, Math.round(e.mhp * 0.02));
      e.hp = Math.min(e.mhp, e.hp + healN);
      floatTxt(g, e.x, e.y - 0.5, "+" + healN, d.glow);
    }
  }
  return true;
}
function spawnActAdds(g: Game, boss: En, n: number): void {
  if (n <= 0) return;
  let made = 0;
  const used = new Set<number>();
  occUsed(g, used);
  for (let t = 0; t < 40 && made < n; t++) {
    const ox = ri(5) - 2, oy = ri(5) - 2;
    if (ox === 0 && oy === 0) continue;
    const x = boss.x + ox, y = boss.y + oy;
    if (!walkable(g, x, y) || (x === g.hero.x && y === g.hero.y) || used.has(y * MW + x)) continue;
    used.add(y * MW + x);
    const ad = mkEnemy(g, x, y, made === 0 && boss.act && boss.act >= 4 ? 1 : 0);
    ad.awake = true;
    ad.name = "Servant of " + (boss.name.split(",")[0] || "the Act");
    ad.hp = ad.mhp = Math.round(ad.mhp * (0.7 + 0.05 * (boss.act ?? 1)));
    g.en.push(ad);
    made++;
  }
  if (made) msg(g, boss.name + " calls " + made + " servant" + (made > 1 ? "s" : "") + "!", "#ff8080");
}
function actBossPhase(g: Game, e: En): void {
  if (!e.act || e.hp <= 0) return;
  const frac = e.hp / Math.max(1, e.mhp);
  let want = 1;
  if (e.act === 1) { if (frac <= 0.4) want = 2; }
  else { if (frac <= 0.33) want = 3; else if (frac <= 0.66) want = 2; }
  if (want <= (e.phase ?? 1)) return;
  e.phase = want;
  const addSh = Math.round((e.mshd ?? 0) * (0.35 + 0.04 * e.act));
  e.shd = Math.min(e.mshd ?? addSh, (e.shd ?? 0) + addSh);
  e.atk = recapActAtk(g, e.atk * 1.12, e.act);
  const nAdd = actAddCount(e.act, want);
  if (nAdd) spawnActAdds(g, e, nAdd);
  setBanner(g, "PHASE " + want + "!", e.name + (nAdd ? " summons aid" : " enrages"), "#ff6060", 8, 2.4);
  msg(g, e.name + " enters phase " + want + "!", "#ff8080");
  g.shake = Math.max(g.shake, 7);
  g.sfx("roar");
  actBossPhaseFx(g, e);
}
function actLootCount(act: number, d?: number): number {
  const depth = d !== undefined ? d : Math.max(1, act) * 5;
  const r = actLootCountRange(depth);
  if (r.max <= r.min) return r.min;
  return r.min + ri(r.max - r.min + 1);
}
function actLootMin(act: number): number {
  if (act <= POST_ACT0) return 0;
  const k = act - POST_ACT0;
  if (k >= 100) return 4;
  if (k >= 50) return 3;
  if (k >= 20) return 2;
  if (k >= 10) return 1;
  return 0;
}
function actPrisChance(act: number): number {
  const early = Math.min(0.004, 0.0012 + (Math.max(1, act) - 1) * 0.00025);
  if (act <= POST_ACT0) return early;
  return Math.min(0.45, early * safePow(1.04, act - POST_ACT0));
}
function actLootRar(act: number, d: number): number {
  return actLootPick(d).rar;
}
function actLootStarsFor(act: number, it: Item): void {
  if (it.kind === "gem") return; // gems have no stars; pets use the same star rules as other gear
  const cap = it.rar >= 7 ? 10 : combineStarMax(it.rar, it.set !== undefined);
  if (cap <= 0) return;
  const have = it.st ? it.st.length : 0;
  let n = have;
  if (act > POST_ACT0) {
    const k = act - POST_ACT0;
    const bias = Math.min(0.85, 0.08 + k * 0.006);
    while (n < cap && R() < bias) n++;
  }
  if (n > have) forceStars(it, n);
  if (it.rar >= 7 && n >= 10) markGolden(it);
}
function actLootItem(act: number, d: number, kind?: Kind): Item {
  const roll = actLootPick(d);
  const ilvl = d + 1 + Math.floor(act / 2);
  let it: Item;
  if (roll.set && (kind === undefined || isArmor(kind))) {
    const ak = (kind && isArmor(kind) ? kind : pick(ARMOR_K)) as AK;
    it = makeSetPiece(ilvl, ak, undefined, d);
  } else {
    it = makeItem(ilvl, roll.rar, kind, d);
  }
  actLootStarsFor(act, it);
  return it;
}
function actLootSetChance(d: number): number { return bossRarOdds(d)[7]; }
function actLootOddsRaw(act: number, d: number): number[] {
  const p = bossRarOddsRaw(d);
  return [p[0], p[1], p[2], p[3], p[4], p[5], p[6] + p[7], p[8]];
}
function actLootOdds(act: number, d: number): number[] {
  const p = bossRarOdds(d);
  return [p[0], p[1], p[2], p[3], p[4], p[5], p[6] + p[7], p[8]];
}
function makeStarredPris(ilvl: number, kind: Kind, stars: number, golden = false): Item {
  const it = kind === "pet" ? makePet(ilvl, 7) : makeItem(ilvl, 7, kind);
  delete it.set;
  forceStars(it, stars);
  if (golden && stars >= 10) markGolden(it);
  return it;
}
function fullPrisEq(ilvl: number, stars: number, golden = false): Eq {
  return {
    head: makeStarredPris(ilvl, "head", stars, golden),
    chest: makeStarredPris(ilvl, "chest", stars, golden),
    arms: makeStarredPris(ilvl, "arms", stars, golden),
    legs: makeStarredPris(ilvl, "legs", stars, golden),
    rh: makeStarredPris(ilvl, "sword", stars, golden),
    lh: makeStarredPris(ilvl, "shield", stars, golden),
    pet: makeStarredPris(ilvl, "pet", stars, golden)
  };
}
function fullPrisFuseEq(ilvl: number, stars: number, golden = false): Eq {
  // Six fused ult pieces: 4 armor + sword + axe. A shield in lh is only 5 ults (shields and pets do not fuse).
  return {
    head: makeStarredPris(ilvl, "head", stars, golden),
    chest: makeStarredPris(ilvl, "chest", stars, golden),
    arms: makeStarredPris(ilvl, "arms", stars, golden),
    legs: makeStarredPris(ilvl, "legs", stars, golden),
    rh: makeStarredPris(ilvl, "sword", stars, golden),
    lh: makeStarredPris(ilvl, "axe", stars, golden),
    pet: null
  };
}
function simActBossTTK(depth: number, stars: number, golden = false): { depth: number; act: number; post: number; starMul: number; heroAtk: number; ev: number; bossHp: number; bossAtk: number; dmg: number; turns: number; ttk: number } {
  const act = actOf(depth);
  const ilvl = Math.max(1, depth + 1 + Math.floor(act / 2));
  const eq = fullPrisEq(ilvl, stars, golden);
  const lvl = Math.max(1, depth);
  const hs = calc(lvl, eq);
  const g = newGame(null);
  g.mode = "play"; g.depth = depth; g.lvl = lvl; g.area = "dungeon"; g.eq = eq;
  g.hero.hp = hs.maxHp;
  g.sfx = () => undefined; g.notify = () => undefined;
  const boss = mkActBoss(g, 3, 3);
  const main = eq.rh ?? null;
  const ev = Math.max(1, hs.atk * combatSwingMul(hs, isTwo(main)));
  const dmg = Math.max(1, dmgF(ev, boss.def));
  const pool = boss.mhp + (boss.mshd ?? 0);
  const turns = Math.max(1, Math.ceil(pool / dmg));
  const ttk = turns * RT_ATK;
  return { depth, act, post: actPostMul(act), starMul: prisStarMulN(stars), heroAtk: hs.atk, ev, bossHp: boss.mhp, bossAtk: boss.atk, dmg, turns, ttk };
}
function spillTiles(g: Game, x: number, y: number, n: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let r = 0; r <= 7 && out.length < n; r++) {
    for (let dy = -r; dy <= r && out.length < n; dy++) {
      for (let dx = -r; dx <= r && out.length < n; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = x + dx, ty = y + dy;
        if (!inb(tx, ty) || g.map[ty * MW + tx] === 0) continue;
        out.push({ x: tx, y: ty });
      }
    }
  }
  while (out.length < n) out.push({ x, y });
  return out;
}
function fountainActLoot(g: Game, e: En, more = false): void {
  const act = e.act ?? actOf(g.depth);
  const d = g.depth;
  const n = actLootCount(act, d);
  const tiles = spillTiles(g, e.x, e.y, n + 1 + POT_ACT_N);
  const mf = efP(g, 54);
  for (let i = 0; i < n; i++) {
    let it = actLootItem(act, d);
    if (mf > 0 && it.rar < 5 && R() < efc(0.06, mf)) { it.rar++; floatTxt(g, e.x, e.y - 1.3, "MAGIC FIND!", RC[it.rar]); }
    const p = tiles[i] ?? { x: e.x, y: e.y };
    announceDrop(g, it, p.x, p.y);
    g.drops.push({ x: p.x, y: p.y, item: it, pot: false, gold: 0 });
  }
  const gm = efGoldMul(g, e);
  const extra = actExtraLoot(act);
  const gg = Math.max(800, safeRound((3000 + 900 * act + d * 160) * (0.85 + R() * 0.35) * gm * extra.goldMul));
  if (extra.gems > 0) g.gems = (g.gems ?? 0) + extra.gems;
  g.gold += gg;
  floatTxt(g, e.x, e.y - 0.9, "+" + gg + "g", GOLD);
  const gp = tiles[n] ?? { x: e.x, y: e.y };
  g.drops.push({ x: gp.x, y: gp.y, item: null, pot: false, gold: Math.round(gg * 0.15) });
  for (let i = 0; i < POT_ACT_N; i++) { const p = tiles[n + 1 + i] ?? { x: e.x, y: e.y }; g.drops.push({ x: p.x, y: p.y, item: null, pot: true, gold: 0 }); }
  const nGems = 1 + (R() < 0.5 ? 1 : 0);
  for (let i = 0; i < nGems; i++) giveDroppedGem(g, e.x, e.y, d);
  burst(g, e.ax * TS + 12, e.ay * TS + 12, 110, [GOLD, "#ffffff", "#fff0a0", "#ff60e0", "#ff8080"], 150, 40);
  g.sfx("sparkle"); g.sfx("coin");
  if (more) {
    const left = packRemain(g, e);
    setBanner(g, "BOSS COPY FALLS!", left + " remain \u00b7 " + n + " treasures fountain out \u00b7 +" + gg + "g", "#ffb040", 8, 3.0);
    msg(g, e.name + " falls! " + left + " remain. " + n + " items and " + gg + "g rain down.", "#ffd080");
  } else {
    setBanner(g, "ACT " + act + " BOSS DEFEATED!", n + " treasures fountain out \u00b7 +" + gg + "g", "#ffb040", 8, 3.6);
    msg(g, "You defeated " + e.name + "! " + n + " items and " + gg + "g rain down.", "#ffd080");
  }
  g.shake = 10; g.flash = 0.5; g.flashC = "#ffffff";
}
function findCampSpot(g: Game): { x: number; y: number } {
  if (g.campSpot && inb(g.campSpot.x, g.campSpot.y) && g.map[g.campSpot.y * MW + g.campSpot.x] !== 0) return g.campSpot;
  for (let k = 0; k < MW * MH; k++) if (g.map[k] === 2) return { x: k % MW, y: (k / MW) | 0 };
  let best = { x: g.hero.x, y: g.hero.y }, bd = -1;
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    if (g.map[y * MW + x] === 0) continue;
    const d = Math.abs(x - g.hero.x) + Math.abs(y - g.hero.y);
    if (d > bd) { bd = d; best = { x, y }; }
  }
  return best;
}
function openCampPortal(g: Game): void {
  if (g.vault || g.area === "camp") return;
  if (!isActFloor(g.depth)) return;
  if (livingActBoss(g) && !actEverCleared(g)) return;
  const already = actEverCleared(g);
  g.actCleared = Math.max(g.actCleared ?? 0, g.depth);
  g.actCampAt = g.depth;
  const spot = findCampSpot(g);
  g.campSpot = spot;
  // Keep down-stairs when this floor is D-1 so you can return to D; otherwise the portal replaces them as before.
  if (!needReturnStairs(g)) {
    for (let k = 0; k < MW * MH; k++) if (g.map[k] === 2) g.map[k] = 1;
  }
  if (g.map[spot.y * MW + spot.x] === 0) return;
  if (g.portal && g.portal.kind === "camp" && g.portal.x === spot.x && g.portal.y === spot.y) {
    return;
  }
  g.portal = { x: spot.x, y: spot.y, kind: "camp" };
  if (!already) {
    setBanner(g, "THE WAY TO CAMP IS OPEN", "Step through the portal to rest at your camp", "#ffb040", 8, 3.2);
    msg(g, "A camp portal opens. The act boss is fallen \u2014 you may return to camp.", "#ffd080");
  }
  saveGame(g);
}
function migrateActFloor(g: Game): void {
  if (g.area === "camp" || g.vault) return;
  if (g.area !== "dungeon") g.area = "dungeon";
  if (!isActFloor(g.depth)) return;
  applyActFloorOnEnter(g);
  if (needReturnStairs(g)) ensureStairTile(g, 2, true);
}
const MERCH_IDS: MerchId[] = ["helmet", "gloves", "chest", "boots", "twoHand", "oneHand", "pet", "gem"];
const MERCH_LAB: Record<MerchId, string> = { helmet: "Helmet", gloves: "Gloves", chest: "Chest", boots: "Boots", twoHand: "Two-Handed Weapon", oneHand: "One-Handed Weapon", pet: "Pet", gem: "Gem" };
const MERCH_PRICE_TIP = "Each chest type has its own price. Buying a 1H wand chest raises only the next 1H wand chest price.";
const MERCH_SHOP_BLURB = "Each chest holds exactly one item of its type. Each chest type has its own price, which rises after you buy that type (a 1H wand purchase raises only the next 1H wand chest). Every open is current-depth boss-quality loot (same item level, stars, and sockets as an act-boss drop).";
const MERCH_SUB_TIP = "Each type has its own price. Buying this chest raises only this type's next price. The open yields exactly one item of the type you pick.";
const CHEST_REVEAL_SEC = 0.7;
const MERCH_X = 22, MERCH_Y = 27;
const CHEST_PRICE_FIRST = 80;
const CHEST_PRICE_FRAC = 0.80;
const CHEST_STEP = 0.10;
const CHEST_CATCH_K = 0.30;
const CHEST_RISE_CAP = 0.35;
const CHEST_LOOT_F_MUL = 0.90;
const CHEST_PRIS_MUL = 0.65;
const CHEST_BOSS_CH = 1;
function campIntervalStart(d: number): number { return Math.floor((Math.max(1, d) - 1) / 5) * 5 + 1; }
function niceGold(n: number): number {
  const x = Math.max(1, n);
  const step = x < 50 ? 1 : x < 100 ? 5 : x < 250 ? 10 : x < 1000 ? 25 : x < 2500 ? 50 : x < 10000 ? 100 : x < 25000 ? 250 : x < 100000 ? 500 : x < 250000 ? 1000 : x < 1e6 ? 2500 : 5000;
  return Math.max(1, Math.round(x / step) * step);
}
function expectedKillGold(d: number, mul: number): number { return (14 + Math.max(1, d) * 6.8) * mul; }
function expectedChestGoldMul(d: number, vault: boolean): number {
  const w = chestW(d, vault), muls = [1, 1.5, 2.2, 3.5, 6];
  let tot = 0, acc = 0;
  for (let i = 0; i < w.length; i++) { tot += w[i]; acc += w[i] * muls[i]; }
  return tot > 0 ? acc / tot : 1;
}
function expectedGoldGoblinGold(d: number): number {
  const extra = actExtraLoot(actOf(d));
  const high = 1.15 * Math.max(800, (3000 + 900 * actOf(d) + d * 160) * 1.20 * extra.goldMul);
  const payout = high * 10 * 1.20;
  return payout + 6 * Math.max(200, 0.06 * payout);
}
function expectedActBossGold(d: number): number {
  const extra = actExtraLoot(actOf(d));
  const gg = Math.max(800, (3000 + 900 * actOf(d) + d * 160) * 1.025 * extra.goldMul);
  return 1.15 * gg;
}
function expectedVaultGold(d: number): number {
  return 16 * (28 + d * 17) * 2 * expectedChestGoldMul(d, true) + 4 * (40 + d * 20);
}
function expectedFloorGold(d: number): number {
  const depth = Math.max(1, d);
  const n = enBase(depth), pE = eliteChance(depth);
  let g = n * (1 - pE) * expectedKillGold(depth, 1) + n * pE * expectedKillGold(depth, 5);
  g += expectedPacks(depth) * 3.6 * expectedKillGold(depth, 1.7);
  const actFl = isActFloor(depth);
  if (!actFl && depth > EARLY_SAFE_MAX) {
    const pCh = Math.min(0.5, 0.2 + depth * 0.01);
    g += 0.07 * expectedKillGold(depth, 25);
    g += pCh * expectedKillGold(depth, 8) + pCh * 2.5 * expectedKillGold(depth, 2.5) + 0.3 * expectedKillGold(depth, 5);
  }
  if (actFl) g += expectedActBossGold(depth);
  if (!actFl && depth >= 3) {
    g += GOB_CH * Math.min(6000, Math.max(2000, 2000 + depth * 80));
    g += GOB_GOLD_CH * expectedGoldGoblinGold(depth);
  }
  if (depth > EARLY_SAFE_MAX && depth >= HUNTER_MIN_DEPTH) g += HUNTER_CHANCE * Math.min(6000, Math.max(2000, 2000 + depth * 80));
  g += 3 * (6 + depth * 4);
  g += 3 * (28 + depth * 17) * expectedChestGoldMul(depth, false);
  if (!actFl && depth >= 2) g += 0.04 * expectedVaultGold(depth);
  return safeNum(g);
}
function campIntervalGold(d: number): number {
  const start = campIntervalStart(d);
  let tot = 0;
  for (let i = 0; i < 5; i++) tot += expectedFloorGold(start + i);
  return tot;
}
function chestBaseline(d: number): number { return niceGold(CHEST_PRICE_FRAC * campIntervalGold(d)); }
function nextChestPrice(paid: number, depth: number): number {
  const base = chestBaseline(depth);
  const stepped = paid * (1 + CHEST_STEP);
  const caught = paid + (base - paid) * CHEST_CATCH_K;
  const raw = Math.max(paid, Math.min(Math.max(stepped, caught), paid * (1 + CHEST_RISE_CAP)));
  return Math.max(paid, niceGold(raw));
}
function emptyChestShop(): Record<MerchId, ChestDeal> {
  const o = {} as Record<MerchId, ChestDeal>;
  for (const id of MERCH_IDS) o[id] = { price: CHEST_PRICE_FIRST, buys: 0 };
  return o;
}
function unpackChestShop(raw: unknown): Record<MerchId, ChestDeal> {
  const out = emptyChestShop();
  if (!raw || typeof raw !== "object") return out;
  const s = raw as Record<string, unknown>;
  for (const id of MERCH_IDS) {
    const d = s[id] as { price?: unknown; buys?: unknown } | undefined;
    if (!d || typeof d !== "object") continue;
    const price = typeof d.price === "number" && isFinite(d.price) ? Math.max(1, Math.floor(d.price)) : CHEST_PRICE_FIRST;
    const buys = typeof d.buys === "number" && isFinite(d.buys) ? Math.max(0, Math.floor(d.buys)) : 0;
    out[id] = { price, buys };
  }
  return out;
}
function packChestShop(g: Game): Record<MerchId, ChestDeal> { return unpackChestShop(ensureChestShop(g)); }
function ensureChestShop(g: Game): Record<MerchId, ChestDeal> {
  const cur = unpackChestShop(g.chestShop);
  g.chestShop = cur;
  return cur;
}
function chestDeal(g: Game, id: MerchId, sub?: Kind): ChestDeal {
  if (isWepMerch(id) && !sub) { ensureChestTypes(g); return ensureChestShop(g)[id]; }
  return chestTypeDeal(g, id, sub);
}
function isWepMerch(id: MerchId): boolean { return id === "oneHand" || id === "twoHand"; }
function allChestSkus(): string[] {
  return (["helmet", "gloves", "chest", "boots", "pet", "gem"] as string[]).concat(merchSubtypes("oneHand")).concat(merchSubtypes("twoHand"));
}
function chestSku(id: MerchId, sub?: Kind): string {
  if (isWepMerch(id) && sub && merchSubtypes(id).indexOf(sub as WT) >= 0) return sub as string;
  return id;
}
function emptyChestTypes(): Record<string, ChestDeal> {
  const o: Record<string, ChestDeal> = {};
  for (const k of allChestSkus()) o[k] = { price: CHEST_PRICE_FIRST, buys: 0 };
  return o;
}
function unpackChestTypes(raw: unknown): Record<string, ChestDeal> {
  const out = emptyChestTypes();
  if (!raw || typeof raw !== "object") return out;
  const s = raw as Record<string, unknown>;
  for (const k of allChestSkus()) {
    const d = s[k] as { price?: unknown; buys?: unknown } | undefined;
    if (!d || typeof d !== "object") continue;
    const price = typeof d.price === "number" && isFinite(d.price) ? Math.max(1, Math.floor(d.price)) : CHEST_PRICE_FIRST;
    const buys = typeof d.buys === "number" && isFinite(d.buys) ? Math.max(0, Math.floor(d.buys)) : 0;
    out[k] = { price, buys };
  }
  return out;
}
function migrateChestTypes(g: Game): Record<string, ChestDeal> {
  if (g.chestTypeMig) {
    const cur = unpackChestTypes(g.chestTypes);
    g.chestTypes = cur;
    return cur;
  }
  const cat = unpackChestShop(g.chestShop);
  g.chestShop = cat;
  const types = emptyChestTypes();
  for (const id of ["helmet", "gloves", "chest", "boots", "pet", "gem"] as MerchId[]) types[id] = { price: cat[id].price, buys: cat[id].buys };
  for (const k of merchSubtypes("oneHand")) types[k] = { price: cat.oneHand.price, buys: cat.oneHand.buys };
  for (const k of merchSubtypes("twoHand")) types[k] = { price: cat.twoHand.price, buys: cat.twoHand.buys };
  g.chestTypes = types;
  g.chestTypeMig = true;
  return types;
}
function ensureChestTypes(g: Game): Record<string, ChestDeal> { return migrateChestTypes(g); }
function packChestTypes(g: Game): Record<string, ChestDeal> { return { ...ensureChestTypes(g) }; }
function chestTypeDeal(g: Game, id: MerchId, sub?: Kind): ChestDeal {
  const types = ensureChestTypes(g);
  const sku = chestSku(id, sub);
  if (!types[sku]) types[sku] = { price: CHEST_PRICE_FIRST, buys: 0 };
  return types[sku];
}
function chestTypeRange(g: Game, id: MerchId): { lo: number; hi: number } {
  if (!isWepMerch(id)) { const d = chestTypeDeal(g, id); return { lo: d.price, hi: d.price }; }
  let lo = Infinity, hi = 0;
  for (const k of merchSubtypes(id)) {
    const p = chestTypeDeal(g, id, k).price;
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  if (!isFinite(lo)) lo = CHEST_PRICE_FIRST;
  return { lo, hi };
}
function merchRarTitle(it: Item): string {
  const n = it.st ? it.st.length : 0;
  const stars = n > 0 ? " " + (n <= 8 ? "\u2605".repeat(n) : "\u2605" + n) : "";
  if (it.golden) return "GOLDEN PRISMATIC" + stars;
  if (it.set !== undefined) return "SET RELIC" + stars;
  return ((RT[it.rar] || "ITEM").toUpperCase()) + stars;
}
function dismissChestReveal(g: Game): void { g.chestReveal = null; }
function tickChestReveal(g: Game, dt: number): boolean {
  const r = g.chestReveal;
  if (!r || r.phase !== "open") return false;
  r.t += dt;
  if (r.t >= CHEST_REVEAL_SEC) { r.phase = "show"; r.t = 0; g.sfx("chime"); return true; }
  return false;
}
function merchSubtypes(id: MerchId): WT[] {
  if (id === "oneHand") return ONE_HAND_WEPS.concat(["shield"]);
  if (id === "twoHand") return TWO_HAND_WEPS.slice();
  return [];
}
function merchKindLabel(k: Kind): string {
  if (k === "shield") return "Shield";
  const w = WI[k as WT];
  return w ? w.n : String(k);
}
function unpackMerchSub(raw: unknown): { oneHand?: WT; twoHand?: WT } {
  const o = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const out: { oneHand?: WT; twoHand?: WT } = {};
  if (typeof o.oneHand === "string" && merchSubtypes("oneHand").indexOf(o.oneHand as WT) >= 0) out.oneHand = o.oneHand as WT;
  if (typeof o.twoHand === "string" && merchSubtypes("twoHand").indexOf(o.twoHand as WT) >= 0) out.twoHand = o.twoHand as WT;
  return out;
}
function rememberMerchSub(g: Game, id: MerchId, kind: Kind): void {
  if (id !== "oneHand" && id !== "twoHand") return;
  if (merchSubtypes(id).indexOf(kind as WT) < 0) return;
  if (!g.merchSub) g.merchSub = {};
  g.merchSub[id] = kind as WT;
}
function merchKind(id: MerchId, sub?: Kind): Kind {
  if (id === "helmet") return "head";
  if (id === "gloves") return "arms";
  if (id === "chest") return "chest";
  if (id === "boots") return "legs";
  if (id === "twoHand") {
    if (sub && merchSubtypes("twoHand").indexOf(sub as WT) >= 0) return sub;
    return TWO_HAND_WEPS[ri(TWO_HAND_WEPS.length)];
  }
  if (id === "oneHand") {
    if (sub && merchSubtypes("oneHand").indexOf(sub as WT) >= 0) return sub;
    return ONE_HAND_WEPS[ri(ONE_HAND_WEPS.length)];
  }
  if (id === "pet") return "pet";
  return "gem";
}
function merchLootF(d: number): number { return actLootF(actOf(d)) * CHEST_LOOT_F_MUL; }
function merchPrisChance(d: number): number { return actPrisChance(actOf(d)) * CHEST_PRIS_MUL; }
function rollMerchRar(d: number): number {
  if (R() < merchPrisChance(d)) return 7;
  return rollRar(merchLootF(d), 0, d);
}
function merchRarOddsRaw(d: number, overall = true): number[] {
  const pris = Math.max(0, Math.min(1, merchPrisChance(d)));
  const w = rollRarWRaw(merchLootF(d), 0, d);
  let tot = 0; for (const v of w) tot += v;
  const p = w.map((v: number) => (tot > 0 ? (v / tot) * (1 - pris) : 0));
  p[7] = (p[7] ?? 0) + pris;
  if (!overall) return p;
  const boss = actLootOddsRaw(actOf(d), d);
  return p.map((v: number, i: number) => v * (1 - CHEST_BOSS_CH) + (boss[i] ?? 0) * CHEST_BOSS_CH);
}
function merchRarOdds(d: number, overall = true): number[] { return scalePrisDrop(merchRarOddsRaw(d, overall), 7); }
function merchStarP(rar: number, i: number): number {
  if (i === 0) return rar >= 3 ? 1 : 0;
  if (rar === 7 && i === 4) return 0.22;
  const base = [0, 0, 0, 1, 0.62, 0.72, 0.80, 0.86][Math.max(0, Math.min(7, rar))] ?? 0;
  const decay = [1, 0.78, 0.60, 0.44][i - 1] ?? 0.3;
  return Math.min(0.95, base * decay);
}
function rollMerchStars(it: Item): void {
  if (!it || it.kind === "gem") { if (it) delete it.st; return; }
  const cap = starMax(it.rar, it.set !== undefined);
  if (cap <= 0) { delete it.st; return; }
  let n = 0;
  for (let i = 0; i < cap; i++) {
    if (R() >= merchStarP(it.rar, i)) break;
    n++;
  }
  if (it.rar >= 3) n = Math.max(1, n);
  n = Math.min(cap, n);
  if (n > 0) forceStars(it, n); else delete it.st;
}
function rollMerchItem(g: Game, id: MerchId, forceBoss?: boolean, sub?: Kind): Item {
  const kind = merchKind(id, sub);
  const d = Math.max(1, g.depth);
  const act = actOf(d);
  const boss = forceBoss !== undefined ? forceBoss : (R() < CHEST_BOSS_CH);
  if (boss) return actLootItem(act, d, kind);
  const r = rollMerchRar(d);
  const ilvl = Math.max(1, Math.max(d, g.lvl) + Math.floor(act / 3));
  let it = makeItem(ilvl, r, kind);
  it = maybeSet(it);
  rollMerchStars(it);
  return it;
}
function placeMerchant(g: Game): void {
  g.merchant = { x: MERCH_X, y: MERCH_Y };
  g.trader = null;
  g.gambler = null;
}
function restHero(g: Game, announce: boolean): void {
  const st = calc(g.lvl, g.eq);
  g.hero.hp = st.maxHp;
  g.ultAt = 0;
  g.ultAtA = 0;
  g.ultAts = {};
  if (announce) {
    msg(g, "You rest. Health and skills are restored.", "#80ff80");
    burst(g, g.hero.ax * TS + 12, g.hero.ay * TS + 12, 28, ["#60ff80", GOLD, "#ffffff"], 70, -20);
    g.sfx("potion");
  }
}
function restAtCamp(g: Game): void {
  if (g.area !== "camp") return;
  restHero(g, true);
  saveGame(g);
  g.notify();
}
function genCamp(g: Game): void {
  clearCracks(g);
  const map = new Uint8Array(MW * MH);
  const x0 = 13, y0 = 13, w = 18, h = 18;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x > 0 && y > 0 && x < MW - 1 && y < MH - 1) map[y * MW + x] = 1;
  for (let x = 16; x <= 28; x++) if (x > 0 && x < MW - 1) { map[11 * MW + x] = 1; map[32 * MW + x] = 1; }
  for (let y = 16; y <= 28; y++) if (y > 0 && y < MH - 1) { map[y * MW + 11] = 1; map[y * MW + 32] = 1; }
  g.map = map;
  g.seen = new Uint8Array(MW * MH); g.vis = new Uint8Array(MW * MH);
  g.seen.fill(1); g.vis.fill(1);
  g.area = "camp";
  g.theme = themeOf(Math.max(1, g.actCleared || g.depth));
  THDREAD = 0;
  if (!g.thSeen) g.thSeen = [];
  g.thShift = themeShift(g);
  g.tiles = makeTiles(g.theme, g.thShift);
  g.en = []; g.pend = []; g.chests = []; g.drops = []; g.shots = []; g.floats = []; g.ground = []; g.fx = []; g.echo = []; g.allies = [];
  g.shopOpen = false; g.stashOpen = false; g.gambOpen = false; g.vault = null; g.gobT = 0; g.floorTurn = 0;
  const cx = 22, cy = 22;
  g.fireAt = { x: cx, y: cy };
  g.restAt = { x: cx - 5, y: cy };
  g.stashAt = { x: cx + 5, y: cy };
  placeMerchant(g);
  g.portal = { x: cx, y: cy - 6, kind: "proceed" };
  g.hero.x = cx; g.hero.y = cy + 2; g.hero.ax = g.hero.x; g.hero.ay = g.hero.y;
  g.campSpot = undefined;
  placeTorches(g);
  computeVis(g);
  g.seen.fill(1); g.vis.fill(1);
}
function enterCamp(g: Game): void {
  if (!canEnterCamp(g)) {
    if (livingActBoss(g)) msg(g, "Defeat the act boss before the way to camp will open.", "#ff8080");
    g.notify();
    return;
  }
  if ((g.area ?? "dungeon") === "dungeon" && !g.vault) {
    const snap = captureFloor(g);
    if (g.depth === floorFront(g)) g.snapCur = snap;
    else if (g.depth === floorFront(g) - 1) g.snapPrev = snap;
    else g.snapCur = snap;
  }
  g.area = "camp";
  g.shopOpen = false;
  g.stashOpen = false;
  g.gambOpen = false;
  genCamp(g);
  restHero(g, false);
  attachBank(g);
  runAutoCombine(g);
  setBanner(g, "CAMP", "Visit the bank, buy chests, and rest. A portal waits when you are ready.", "#ffb040", 5, 3);
  msg(g, "Home camp. The bank holds your gold forever. The chest merchant sells a chest for every kind of gear.", "#ffd080");
  g.sfx("stairs");
  saveGame(g);
  g.notify();
}
function leaveCamp(g: Game): void {
  if (g.area !== "camp") return;
  g.shopOpen = false; g.stashOpen = false; g.gambOpen = false; g.gambler = null; g.merchant = null;
  g.actCampAt = 0;
  const nxt = (g.actCleared && g.actCleared > 0 ? g.actCleared : g.depth) + 1;
  g.area = "dungeon";
  g.restAt = undefined; g.stashAt = undefined; g.fireAt = undefined;
  const cur = g.snapCur && g.snapCur.d === nxt ? g.snapCur : null;
  if (cur) {
    g.front = Math.max(floorFront(g), nxt);
    restoreFloor(g, cur, TILE_UP);
  } else {
    if (g.snapCur && g.snapCur.d === nxt - 1) g.snapPrev = g.snapCur;
    g.depth = nxt;
    if (g.depth > g.best) { g.best = g.depth; saveBest(g); }
    g.front = Math.max(floorFront(g), g.depth);
    g.snapCur = null;
    genFloor(g);
  }
  if (g.depth > g.best) { g.best = g.depth; saveBest(g); }
  setBanner(g, "THE NEXT FIVE DEPTHS", "Depth " + g.depth + " \u00b7 " + themeName(g), "#40e0ff", 5, 2.6);
  msg(g, "You step through. Onward to the next five dungeons (depth " + g.depth + ").", "#80ffff");
  g.sfx("stairs");
  saveGame(g);
  g.notify();
}
function useStairsOrPortal(g: Game): void {
  if (g.mode !== "play" || uiBlocked(g) || g.paused) return;
  if (g.portal && g.portal.x === g.hero.x && g.portal.y === g.hero.y) {
    const k = portalKind(g);
    if (k === "proceed") { leaveCamp(g); return; }
    if (k === "camp") { enterCamp(g); return; }
    if (g.vault) { exitVault(g); return; }
    enterVault(g);
    return;
  }
  const tile = g.map[g.hero.y * MW + g.hero.x];
  if (tile === TILE_UP) {
    if (g.locked) { msg(g, "Unlock to go back a floor.", "#c8c0a0"); return; }
    if (!canGoBack(g)) {
      if (g.depth > 1) msg(g, "You can only go back one floor.", "#c8c0a0");
      return;
    }
    goBack(g, true);
    return;
  }
  descend(g);
}
function emptyStash(): { items: Item[]; gold: number } { return { items: [], gold: 0 }; }
function parseStashRaw(raw: string | null | undefined): { v: number; t: number; items: Item[]; gold: number } | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const s = JSON.parse(raw) as { v?: number; t?: number; items?: unknown; gold?: unknown };
    if (!s || typeof s !== "object") return null;
    const items = Array.isArray(s.items) ? (s.items as unknown[]).map((o: unknown) => validItem(o)).filter((x: Item | null): x is Item => x !== null).slice(0, STASH_N) : [];
    const gold = typeof s.gold === "number" && isFinite(s.gold) ? Math.max(0, Math.floor(s.gold)) : 0;
    const t = typeof s.t === "number" && isFinite(s.t) ? s.t : 0;
    return { v: 1, t, items, gold };
  } catch { return null; }
}
function stashRawOf(items: Item[], gold: number): string {
  return JSON.stringify({ v: 1, t: Date.now(), items: items.slice(0, STASH_N), gold: Math.max(0, Math.floor(gold)) });
}
let memStash: string | null = null;
function currentStashRaw(): string | null {
  migrateProfiles();
  let best: string | null = null, bt = -1;
  for (const r of [lsGet(activeStashKey()), ssGet(activeStashKey()), memStash, lsGet(activeStashBakKey()), ssGet(activeStashBakKey())]) {
    const p = parseStashRaw(r);
    if (p && p.t >= bt) { best = r ?? null; bt = p.t; }
  }
  return best && parseStashRaw(best) ? best : null;
}
function loadStash(): { items: Item[]; gold: number; t: number } {
  const p = parseStashRaw(currentStashRaw());
  return p ? { items: p.items, gold: p.gold, t: p.t } : { items: [], gold: 0, t: 0 };
}
function saveStash(items: Item[], gold: number): void {
  const raw = stashRawOf(items, gold);
  if (!parseStashRaw(raw)) return;
  const cur = currentStashRaw();
  if (cur && cur !== raw) {
    const old = parseStashRaw(cur);
    const b = parseStashRaw(lsGet(activeStashBakKey()) || ssGet(activeStashBakKey()));
    if (!b || (old && old.t >= (b.t || 0))) {
      try { /* bak */ } catch { /* ignore */ }
      lsSet(activeStashBakKey(), cur); ssSet(activeStashBakKey(), cur); idbPut(activeStashBakKey(), cur);
    }
  }
  memStash = raw;
  lsSet(activeStashKey(), raw); ssSet(activeStashKey(), raw); idbPut(activeStashKey(), raw);
}
function bankGoldOf(g: Game): number {
  const n = g.bankGold ?? g.stashGold ?? 0;
  return typeof n === "number" && isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
function setBankGold(g: Game, n: number): void {
  const v = Math.max(0, Math.floor(typeof n === "number" && isFinite(n) ? n : 0));
  g.bankGold = v;
  g.stashGold = v;
}
function migrateStashItemsIntoBags(g: Game, items: Item[]): number {
  let n = 0;
  for (const it of items) {
    if (!it) continue;
    const bag = destBag(g, it);
    ensureBagCapacity(g, isGem(it), bag.length + 1);
    bag.push(it);
    n++;
  }
  if (n) runAutoCombine(g);
  g.stash = [];
  return n;
}
function attachBank(g: Game, saveItems?: Item[], saveGold?: number, savedBank?: number): void {
  const key = loadStash();
  const items: Item[] = [];
  // Prefer the dedicated key's leftover items when it still has any; otherwise use the save's stash. Never merge both copies.
  if (key.items.length) {
    for (const it of key.items) if (it) items.push(it);
  } else if (saveItems && saveItems.length) {
    for (const it of saveItems) if (it) items.push(it);
  } else if (Array.isArray(g.stash)) {
    for (const it of g.stash) if (it) items.push(it);
  }
  migrateStashItemsIntoBags(g, items);
  let gold = 0;
  if (typeof savedBank === "number" && isFinite(savedBank)) gold = Math.max(0, Math.floor(savedBank));
  else if (key.gold > 0) gold = Math.max(0, Math.floor(key.gold));
  else if (typeof saveGold === "number" && isFinite(saveGold)) gold = Math.max(0, Math.floor(saveGold));
  else gold = bankGoldOf(g);
  setBankGold(g, gold);
  persistBank(g);
}
function persistBank(g: Game): void {
  g.stash = [];
  setBankGold(g, bankGoldOf(g));
  saveStash([], bankGoldOf(g));
}
function attachStash(g: Game): void { attachBank(g); }
function persistStash(g: Game): void { persistBank(g); }
function bankDeposit(g: Game, amount: number): string {
  if (g.area !== "camp") return "The bank is only at camp.";
  const want = Math.floor(amount);
  if (!isFinite(want) || want <= 0) return "Enter a positive amount.";
  const have = Math.max(0, Math.floor(g.gold));
  if (have <= 0) return "No gold to deposit.";
  const n = Math.min(want, have);
  g.gold = have - n;
  setBankGold(g, bankGoldOf(g) + n);
  persistBank(g);
  saveGame(g);
  return "Deposited " + n + "g in the bank.";
}
function bankWithdraw(g: Game, amount: number): string {
  if (g.area !== "camp") return "The bank is only at camp.";
  const want = Math.floor(amount);
  if (!isFinite(want) || want <= 0) return "Enter a positive amount.";
  const have = bankGoldOf(g);
  if (have <= 0) return "The bank has no gold.";
  const n = Math.min(want, have);
  g.gold = Math.max(0, Math.floor(g.gold)) + n;
  setBankGold(g, have - n);
  persistBank(g);
  saveGame(g);
  return "Withdrew " + n + "g from the bank.";
}
function openStash(g: Game): void {
  if (g.area !== "camp") { msg(g, "Your bank is at camp, after the act boss.", "#ff8080"); g.notify(); return; }
  g.stashOpen = true;
  g.shopOpen = false;
  attachBank(g);
  g.sfx("chest");
  g.notify();
}
function revealStairs(g: Game): void {
  for (let k = 0; k < MW * MH; k++) if (g.map[k] === 2) g.seen[k] = 1;
  msg(g, "You sense the way down... (see the minimap)", "#80ffff");
}

// ---------- durable storage (localStorage + IndexedDB + export code) ----------
let idbP: Promise<IDBDatabase | null> | null = null;
function storeDeniedReason(name: string, err: unknown): string {
  const n = err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
  const m = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : String(err);
  const blob = n + " " + m;
  if (/access is denied|denied for this document|the operation is insecure|SecurityError/i.test(blob)) return name + " blocked by this viewer";
  if (n === "QuotaExceededError" || /quota/i.test(blob)) return name + " quota exceeded";
  return name + " unavailable";
}
// Reading window.localStorage / sessionStorage / indexedDB can throw in a sandboxed
// or opaque-origin iframe ("Access is denied for this document"). Never touch the
// getter unguarded — even `typeof localStorage` can throw.
function readHostProp(name: string): { ok: true; value: unknown } | { ok: false; err: string } {
  const hosts: object[] = [];
  try { if (typeof window !== "undefined") hosts.push(window); } catch { /* */ }
  try { hosts.push(globalThis); } catch { /* */ }
  let last = name + " is missing";
  const seen = new Set<object>();
  for (const h of hosts) {
    if (!h || seen.has(h)) continue;
    seen.add(h);
    try {
      const v = (h as Record<string, unknown>)[name];
      if (v != null) return { ok: true, value: v };
      last = name + " is missing";
    } catch (err) {
      last = storeDeniedReason(name, err);
    }
  }
  return { ok: false, err: last };
}
let storesProbed = false;
let lsHandle: Storage | null = null;
let ssHandle: Storage | null = null;
let idbFactory: IDBFactory | null = null;
let lsDenied = false;
let ssDenied = false;
let idbDenied = false;
let lastSsErr = "";
function resetStoreProbe(): void {
  storesProbed = false;
  lsHandle = null; ssHandle = null; idbFactory = null;
  lsDenied = false; ssDenied = false; idbDenied = false;
  idbP = null;
}
function probeWebStorage(st: Storage): boolean {
  const k = "ed16_probe";
  st.setItem(k, "1");
  const ok = st.getItem(k) === "1";
  try { st.removeItem(k); } catch { /* */ }
  return ok;
}
function probeStores(): void {
  if (storesProbed) return;
  storesProbed = true;
  const ls = readHostProp("localStorage");
  if (ls.ok) {
    try {
      if (probeWebStorage(ls.value as Storage)) { lsHandle = ls.value as Storage; lsDenied = false; lastLsErr = ""; }
      else { lsHandle = null; lsDenied = true; lastLsErr = "localStorage write did not read back"; }
    } catch (err) { lsHandle = null; lsDenied = true; lastLsErr = storeDeniedReason("localStorage", err); }
  } else { lsHandle = null; lsDenied = true; lastLsErr = ls.err; }
  const ss = readHostProp("sessionStorage");
  if (ss.ok) {
    try {
      if (probeWebStorage(ss.value as Storage)) { ssHandle = ss.value as Storage; ssDenied = false; lastSsErr = ""; }
      else { ssHandle = null; ssDenied = true; lastSsErr = "sessionStorage write did not read back"; }
    } catch (err) { ssHandle = null; ssDenied = true; lastSsErr = storeDeniedReason("sessionStorage", err); }
  } else { ssHandle = null; ssDenied = true; lastSsErr = ss.err; }
  const idb = readHostProp("indexedDB");
  if (idb.ok) { idbFactory = idb.value as IDBFactory; idbDenied = false; lastIdbErr = ""; }
  else { idbFactory = null; idbDenied = true; lastIdbErr = idb.err; }
}
function viewerBlocksSaving(): boolean {
  probeStores();
  return !lsHandle && !idbFactory && !testIdb;
}
function blockedSaveMessage(): string {
  return "This viewer blocks saving. Copy a Save Code to keep this run.";
}
function storeAvailLabel(name: string, handle: object | null, denied: boolean, hook = false): string {
  if (hook || handle) return name + " on";
  if (denied) return name + " blocked";
  return name + " off";
}
function idb(): Promise<IDBDatabase | null> {
  if (idbP) return idbP;
  idbP = new Promise<IDBDatabase | null>((res) => {
    try {
      probeStores();
      if (!idbFactory) { if (!testIdb && !lastIdbErr) lastIdbErr = "IndexedDB unavailable"; res(null); return; }
      const rq = idbFactory.open("ed16db", 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore("kv"); } catch { /* exists */ } };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => { lastIdbErr = lastIdbErr || "IndexedDB open failed"; res(null); };
      rq.onblocked = () => { lastIdbErr = lastIdbErr || "IndexedDB blocked"; res(null); };
    } catch (err) {
      lastIdbErr = storeDeniedReason("IndexedDB", err);
      res(null);
    }
  });
  return idbP;
}
// grok/canvas does not export a persisted-state hook. Cursor IDE's useCanvasState
// writes a .canvas.data.json sidecar next to the canvas *source* on the author's
// machine; it is not exported here, and it cannot store a player's run on their
// phone. The Grok/Cursor mobile canvas viewer has no host save API (no
// postMessage store). Durable slots are localStorage and IndexedDB only when
// the viewer allows them. In a sandboxed or opaque-origin iframe, even reading
// those properties throws. Every access is wrapped and stores are probed once
// at startup. If none is durable, Save Game says this viewer blocks saving and
// offers a Save Code to copy.
let testIdb: Record<string, string> | null = null;
let lastLsErr = "";
let lastIdbErr = "";
let lastPersistErr = "";
function hookGet(k: string): string | null {
  try { return testIdb && typeof testIdb[k] === "string" ? testIdb[k] : null; } catch { return null; }
}
function idbPut(k: string, v: string | null): void { void idbPutDone(k, v); }
function idbPutDone(k: string, v: string | null): Promise<boolean> {
  if (testIdb) {
    if (v === null) delete testIdb[k]; else testIdb[k] = v;
  }
  return idb().then((db: IDBDatabase | null) => new Promise<boolean>((res) => {
    if (!db) {
      const hookOk = !!(testIdb && ((v === null) ? !(k in testIdb) : testIdb[k] === v));
      if (!hookOk && !testIdb) lastIdbErr = "IndexedDB unavailable";
      else lastIdbErr = hookOk ? "" : "IndexedDB hook write failed";
      res(hookOk);
      return;
    }
    try {
      const st = db.transaction("kv", "readwrite").objectStore("kv");
      const rq = v === null ? st.delete(k) : st.put(v, k);
      rq.onsuccess = () => {
        if (v === null) { lastIdbErr = ""; res(true); return; }
        void idbGet(k).then((got: string | null) => {
          const ok = got === v;
          lastIdbErr = ok ? "" : "IndexedDB write did not read back";
          res(ok);
        }, () => { lastIdbErr = "IndexedDB read-back failed"; res(false); });
      };
      rq.onerror = () => {
        const hookOk = !!(testIdb && v !== null && testIdb[k] === v);
        lastIdbErr = hookOk ? "" : "IndexedDB write failed";
        res(hookOk);
      };
    } catch {
      const hookOk = !!(testIdb && v !== null && testIdb[k] === v);
      lastIdbErr = hookOk ? "" : "IndexedDB error";
      res(hookOk);
    }
  }));
}
function idbGet(k: string): Promise<string | null> {
  if (testIdb) return Promise.resolve(testIdb[k] ?? null);
  return idb().then((db: IDBDatabase | null) => new Promise<string | null>((res) => {
    if (!db) { res(null); return; }
    try { const rq = db.transaction("kv", "readonly").objectStore("kv").get(k); rq.onsuccess = () => res(typeof rq.result === "string" ? rq.result : null); rq.onerror = () => res(null); } catch { res(null); }
  }));
}
let memSave: string | null = null;
let memBak: string | null = null;
type ProfId = 1 | 2 | 3;
const PROFILES: { id: ProfId; name: string }[] = [
  { id: 1, name: "Richard" },
  { id: 2, name: "Jax" },
  { id: 3, name: "Piper" },
];
// Son's earlier-version run, kept as Jax's starter. Auto-imported when the Jax
// slot is empty, a fresh starter, or behind this seed (level/depth/XP). A Jax
// save that has already gone further is never overwritten. Richard and Piper
// are left alone.
const JAX_SEED_CODE = "ED2-N4IgbiBcBMA0IBMoGZ4BsoFZ4A8rQA4BOeAcygDYAWbEABygHZ4AjFVjSWgaygNUQAXJvACuUAAxiAhpLEBjAM5RgAX3jSAplACM8ALbjIUkPoD2usvrkhSDYxvmWQ2yAG03UvagpEKFZEwdOClsKVAAC3sKdRBoCXiQeAAhaTRpADt5TQQAAgBJACczDNyAYTMASwAzXLNagBUIs0KM5VgpDykKWCoOgDodAQBRDIRRQsqM0lyACTM0AE85tIsAXTXYAFo9KR3t3YPYDzg4ZE23Pv2djaO9nQvDvR1MIiICTATkKSlUcJBpIJeJAdLFoODMEkQGVCqIEJpcgBZSqCCKTNC5ABSmkK3CmSR+dyO+3ux08HVg52OPWuD02JIOFxCsGe8UCEh0REYBApzMi9mQsUw4OQUIACukprkAPIsRSVBCVTK5ACChX0pFE0kKCHahIZtIp+w8NL0N3phxux1QejgOgIEiojreRD+vQpoEKmlImgykn60FiEmQ3yhDU0+joOJyBWKpQA4l7pGBNIo6rUAEqifEU0keRg226GvNuM1louWh7HHTMPpwIhUagEHRURhSAjM/5RXQkECKOhIEGB+Dg6A6KHDNAISaCeQRXIAZUEmk0GIzmmkUcK6dyw2XrRRiySHj02BtPJ0g1gcBAC4A7jVBLkAGKVL25MWVNDpQogW4l+0WX6KhoArIljTcbBaQuUkrXJaDjiucsLSNKtOh0HpbWvRgKAIChMG5PpCXCIMJDIqFXwyBEFzSaR9EyeFf1zIkKDLVD2PuW4+ygE9eRZAsiGgRgMMOMJYDUeBkCoUN4GlKdYxKRd5DSBFEWkL8CQ44lKzJJDGRQzjrQpZ4qA+DtXR6KQ+TBEDoChMoIkqOgozyZI4wALwRBz1NKAAZb1SCmUg9S04sjl46CDMZY54mvOL4iIF5BIoR1KUOLt7B5PsBygIhYioaTRXgddSDSGU5QVJVSgAOWkUr6LxHcABFpDvP0yWwEgehICR+kwbA9BAYY5yqaZcgANSqPIyjQMw4T/TZSVgnSPCg8tEO0sDDPJLChmEh0JCIMiKSI8SASBfAhW+KhxQWSpFAiGNkhKai0jQTQn3qXJUQRZINyY/UdINPQ3CiuC3TtMdkAIAsJGoCk3QkkBMBDOz4AlHzcjckpPJfCYsbMMxBBCpbtPYjw9PBzawarUtmCwnDfBR3DmGgN0MqwIU2ShJcJgQZZZXlRVlQXOa0EUeRFh+nc9xxDJD000mwogtjzXA2mBrivadAkRgcLbFl2bO7suCFYIJB5wQ+eWIpFIXOhKm4BEVRwBEvvG1YAdCtiS1NfT1YuM9KWvQ6JE+NtCEpHlCX5XQekQTRqk5+AWxkkBZhxKp5AU0o/u1eE8hdt3ag92amNWuKBt2foL3RyocXkIKJqm8oIh8hbydLLxgNAlCVcwsCK4Qtw4EigPq0JVBvkSzB+DeFlLI9MFrvFSVc5e3JfOkFhCkWEn1YPofkPHyCEZZMcyJoVt62Yz1vV9f1QXgKhgnHeAAHUWlKJcVwxRFCdKEXRWB9gbHBplxUgbB3CbBACwJwXATCkHgd8eAxMoAgB0Jgsi2CcG4LwfgghhDsFQkUMTCIPEYGkPIA4AEg4TDVF/JAAQ1R7CgEHDeei9gQAqh4bwvh/CBGCKEcIkRojeHPgAKrjQEckCRABFcaUjxoZgkQI58GZkjKPGuNZ8cjkgKO0YYoxUiVTPk0bo2RCilEqJVBI+MxjTEqnMXohRNi5E8NUSqYYPCzE6L0Tw/RPD3EBOCd40xz4VTSPEbw4JEiJGyL4Z45IASMwKOCU49x2j5DhM0XwiJmjxruNUcMMJvjInaIySqORsTnxGO0RY8a+j9F1LqRIiJvjhiGMqYU1RbSJEZkMWk2pgTTHJNsb47RbTeESO8fotpgyknVNGUMxp/jlEeLKYoiJwxNGzPcSM4JcjJHuIiY4pxATIkZg8dcrxPCdktK6Yc45pipGnLGck9ZlzJm2LubspxdSRkZJOUo6RpyeE6IeXIgAmnwuRezTGFMBckk54LQV8OGLUtJ3zPFBO0ZowF6SJmtLGeIwpPThF4tWWI6loiAC8tKSErj9JAbhNK2U0oAPSkAILwpqpAOV3j4U1AA1E1QVPDpRNQ5VU3hYoqBij4fKnlfCuXKt5YKsZYrhXJDVWUMUAqwligAFaMFmOK+VHLpXBI5WAIg0qVR8stQQWYPCRUcvcsqyVlq7yGvchys1vDhjVH4TC9J7Lw0RsjVG6NMahEMvgHOVMaD3CgDwDAQaR5IAv3gGYKMzLqhpEUJoeAhRtQoHUKm/AtBM1sxzXmqABbxbFpAKWxhT9K1MPgJm5gIBc0P0gIIWEzbW2SFUDA6cublAppAGmlBIBM3BHgHQImUBB2iGbaQBYdD4AogjFADIohvwVpnSgPo878CDWXcIAdQ6yBbpsLu6wkAD1HrOmmlsXaoDZvoCuyAjai13qnLoAQj792HrQMetNWVM3IB7VehthaN33pBD20Dz7wOQfwPHbtS7f3/qQ0BlDO7lxPpfRBt9X7P0wHjvBv9iHAODiGMRvd6Gj0wMHdIRiYHvy4cKIINI3G0BkGKKIMYPEO09pwyAa9g1VzoIYWYUhUIEAal0GO1Bj19CuEGpulgDQbDVFmi0BoExmUo1iNUeBbD2CmE3Og6NkiSW8PxcEwpYS8lTP+TK/hdT36DPc/ixRkS4XeMJfMvR0jqlOf2VE7xOicVjNqS0uRniwmFPOeoxpMSvO3Pi2EklYS9FSKWbcoJ5yqnJBJUciptzkklK8ckBAgzdG3KWdVrpUS9HJI+Q8oxDWjFHPcd4+RVSkuTM68kK5HyZljNmaY7x9zyUyuG+49ruTTl6KuTwjMkjJHBaMU04riLGmGKmcMAZvXyU7cu6s5IwwosuK8ZM9pFS0UVa2+U+JvSMv5e0XC8FAzLE+IqTF3b5K6lHKO7dv7pSLtbIRZF8FYOUuffeUovzTT7uEsB1s9rQiyWfcEfi+Jf2RF4+ET1nFsbqf8PpYy/trKBFinFa6wVLP8hSuZ7Ko1HLkjitIGKAgwbeEEDFIoJzYAPW8pVMKlU2SeFlERFznhiImpUG8yqfId5hc8LvE1NVTUVQcpwAbggBqVdSoDTwsUfrvN3kFzro3gvpcCsRLygg1UWeq/tbK+3/DZiKH4WYFUbuadh/DxHyPcaoSJtIVOtwHbF3npBAIPtzK13DrLcYTDMAbwLvjmnhDTaS1Z4kDn6DWA639ozyXxhZfx3FDoPHjtsGqPQFoLRmvthkMmDQ2RnPOsqNzs77e7vhHe8kcEzn6AvYa29lo/hhjuhUOT9YxB9jpauNr94/xzgZHhNzTE9OqDVGz0yfgHJllCmlPwBU9Q0E7HNOuBvLp/TNDDOE0KCZ1oTACCqFUEAA";
const JAX_SEED_PROF: ProfId = 2;
function runProgressRank(lvl: number, depth: number, xp: number): number {
  return (Number(depth) || 0) * 1e12 + (Number(lvl) || 0) * 1e9 + (Number(xp) || 0);
}
function parsedRunRank(s: Record<string, unknown> | null): number {
  if (!s) return -1;
  const lvl = Number(s.lvl ?? s.l) || 0;
  const depth = Number(s.depth ?? s.d) || 0;
  const xp = Number(s.xp ?? s.x) || 0;
  return runProgressRank(lvl, depth, xp);
}
let jaxSeedEnabled = true;
let jaxSeedBusy = false;
function ensureJaxSeed(): boolean {
  // If Jax is empty, a starter, or behind the embedded seed, fill it. Never
  // clobber a Jax run that has more level/depth/XP than the seed. Never touch
  // Richard or Piper.
  // decodeCode -> newGame -> loadBest may re-enter migrateProfiles; ignore nested calls.
  if (!jaxSeedEnabled || jaxSeedBusy) return false;
  jaxSeedBusy = true;
  try {
    const seedG = decodeCode(JAX_SEED_CODE, null);
    if (!seedG) return false;
    seedG.mode = "play";
    const seedRank = runProgressRank(seedG.lvl, seedG.depth, seedG.xp);
    const existing = parseSaveRaw(profBlob(JAX_SEED_PROF));
    if (existing && !isFreshSave(existing) && parsedRunRank(existing) >= seedRank) return false;
    const raw = buildPersistRaw(seedG);
    if (!parseSaveRaw(raw)) return false;
    memSaveBy[JAX_SEED_PROF] = raw;
    if (activeProf === JAX_SEED_PROF) memSave = raw;
    writeDurable(profSaveKey(JAX_SEED_PROF), raw);
    return true;
  } catch { return false; }
  finally { jaxSeedBusy = false; }
}
const PROF_MIG_KEY = "ed16_profile_mig_v1";
let activeProf: ProfId = 1;
const memSaveBy: Partial<Record<ProfId, string | null>> = {};
const memBakBy: Partial<Record<ProfId, string | null>> = {};
const memStashBy: Partial<Record<ProfId, string | null>> = {};
function activeSaveKey(): string { return "ed16_save_v1_p" + activeProf; }
function activeBakKey(): string { return "ed16_save_v1_p" + activeProf + "_bak"; }
function activeStashKey(): string { return "ed16_stash_v1_p" + activeProf; }
function activeStashBakKey(): string { return "ed16_stash_v1_p" + activeProf + "_bak"; }
function profSaveKey(id: ProfId): string { return "ed16_save_v1_p" + id; }
function profBakKey(id: ProfId): string { return "ed16_save_v1_p" + id + "_bak"; }
function profStashKey(id: ProfId): string { return "ed16_stash_v1_p" + id; }
function profStashBakKey(id: ProfId): string { return "ed16_stash_v1_p" + id + "_bak"; }
function setActiveProf(id: ProfId): void {
  if (id === activeProf) return;
  memSaveBy[activeProf] = memSave;
  memBakBy[activeProf] = memBak;
  memStashBy[activeProf] = memStash;
  activeProf = id;
  memSave = memSaveBy[id] ?? null;
  memBak = memBakBy[id] ?? null;
  memStash = memStashBy[id] ?? null;
}
// The running game survives a component remount (host re-render, error recovery) even when page storage is wiped.
let LIVE: Game | null = null;
function lsGet(k: string): string | null {
  try { probeStores(); return lsHandle ? lsHandle.getItem(k) : null; } catch (err) { lastLsErr = storeDeniedReason("localStorage", err); return null; }
}
function lsSet(k: string, v: string): boolean {
  try {
    probeStores();
    if (!lsHandle) { if (!lastLsErr) lastLsErr = lsDenied ? "localStorage blocked by this viewer" : "localStorage unavailable"; return false; }
    lsHandle.setItem(k, v);
    const ok = lsHandle.getItem(k) === v;
    lastLsErr = ok ? "" : "localStorage write did not read back";
    return ok;
  } catch (err) {
    lastLsErr = storeDeniedReason("localStorage", err);
    return false;
  }
}
function lsRemove(k: string): void {
  try { probeStores(); if (lsHandle) lsHandle.removeItem(k); } catch { /* storage unavailable */ }
}
function storageProbe(): boolean {
  try { probeStores(); return !!lsHandle; } catch { return false; }
}
function storageEphemeral(): boolean {
  // Opaque-origin sandboxed iframes (no allow-same-origin) typically wipe storage when the frame is recreated.
  try {
    if (typeof window === "undefined") return false;
    const o = window.origin || (typeof location !== "undefined" ? location.origin : "");
    return o === "null";
  } catch { return false; }
}
function profilesReady(): boolean { return storageReady; }
function savedT(raw: string | null): number { if (!raw) return -1; try { const o = JSON.parse(raw) as { t?: unknown }; return typeof o.t === "number" ? o.t : 0; } catch { return -1; } }
async function syncFromIdb(): Promise<boolean> {
  // Copy any newer per-profile IndexedDB blobs into localStorage. Never write the legacy ed16_save_v1 / _bak keys.
  let pulled = false;
  for (const p of PROFILES) {
    const sk = profSaveKey(p.id), bk = profBakKey(p.id);
    const ib = await idbGet(bk);
    const memB = p.id === activeProf ? memBak : (memBakBy[p.id] ?? null);
    if (ib && savedT(ib) > savedT(lsGet(bk)) && savedT(ib) > savedT(memB)) {
      if (p.id === activeProf) memBak = ib; else memBakBy[p.id] = ib;
      lsSet(bk, ib);
    }
    const iv = await idbGet(sk);
    const memS = p.id === activeProf ? memSave : (memSaveBy[p.id] ?? null);
    if (iv && savedT(iv) > savedT(lsGet(sk)) && savedT(iv) > savedT(memS)) {
      if (p.id === activeProf) { memSave = iv; saveFlag = true; } else memSaveBy[p.id] = iv;
      lsSet(sk, iv);
      if (p.id === activeProf) pulled = true;
    }
    const stk = profStashKey(p.id), stb = profStashBakKey(p.id);
    const isb = await idbGet(stb);
    if (isb && parseStashRaw(isb) && (!parseStashRaw(lsGet(stb)) || (parseStashRaw(isb) as { t: number }).t > (parseStashRaw(lsGet(stb)) as { t: number }).t)) lsSet(stb, isb);
    const isv = await idbGet(stk);
    const memSt = p.id === activeProf ? memStash : (memStashBy[p.id] ?? null);
    if (isv && parseStashRaw(isv) && (!parseStashRaw(lsGet(stk)) || (parseStashRaw(isv) as { t: number }).t > (parseStashRaw(lsGet(stk)) as { t: number }).t) && (!parseStashRaw(memSt) || (parseStashRaw(isv) as { t: number }).t > (parseStashRaw(memSt) as { t: number }).t)) {
      if (p.id === activeProf) memStash = isv; else memStashBy[p.id] = isv;
      lsSet(stk, isv);
    }
  }
  migrateProfiles();
  return pulled;
}
function b64e(s: string): string { const b = new TextEncoder().encode(s); let o = ""; for (let i = 0; i < b.length; i += 4096) o += String.fromCharCode(...Array.from(b.subarray(i, i + 4096))); return btoa(o); }
function b64d(s: string): string { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return new TextDecoder().decode(b); }
function currentRaw(): string | null { migrateProfiles(); let best: string | null = null; for (const r of [lsGet(activeSaveKey()), hookGet(activeSaveKey()), memSave, ssGet(activeSaveKey())]) if (r && savedT(r) > savedT(best)) best = r; return best; }
function currentBak(): string | null { let best: string | null = null; for (const r of [lsGet(activeBakKey()), ssGet(activeBakKey()), memBak]) if (r && savedT(r) > savedT(best)) best = r; return best; }
function bakSet(raw: string): void { memBak = raw; lsSet(activeBakKey(), raw); ssSet(activeBakKey(), raw); if (testIdb) testIdb[activeBakKey()] = raw; idbPut(activeBakKey(), raw); }
function profBlob(id: ProfId): string | null {
  const curMem = id === activeProf ? memSave : (memSaveBy[id] ?? null);
  const bakMem = id === activeProf ? memBak : (memBakBy[id] ?? null);
  let best: string | null = null;
  for (const r of [lsGet(profSaveKey(id)), hookGet(profSaveKey(id)), curMem, lsGet(profBakKey(id)), hookGet(profBakKey(id)), bakMem, ssGet(profSaveKey(id)), ssGet(profBakKey(id))]) if (r && savedT(r) > savedT(best)) best = r;
  return best;
}
function profSummary(id: ProfId): { id: ProfId; name: string; empty: boolean; depth: number; lvl: number; t: number } {
  migrateProfiles();
  const name = (PROFILES.find((p: { id: ProfId; name: string }) => p.id === id) || PROFILES[0]).name;
  const s = parseSaveRaw(profBlob(id));
  if (!s) return { id, name, empty: true, depth: 0, lvl: 0, t: 0 };
  const t = typeof s.t === "number" && isFinite(s.t) ? s.t : 0;
  return { id, name, empty: false, depth: Math.floor(Number(s.depth) || 1), lvl: Math.floor(Number(s.lvl) || 1), t };
}
function fmtProfTime(t: number): string {
  if (!t || !isFinite(t)) return "no timestamp";
  try {
    return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return "no timestamp"; }
}
// Copy an existing main-save blob into the backup before it is overwritten or cleared.
// Unparseable blobs are kept if there is no backup yet, so a failed load / New Game cannot destroy the only copy.
function preserveSaveBackup(existing: string | null): void {
  if (!existing) return;
  const old = parseSaveRaw(existing);
  const bRaw = currentBak();
  const b = parseSaveRaw(bRaw);
  if (old) {
    if (!b || saveProgress(old) >= saveProgress(b)) bakSet(existing);
  } else if (!bRaw) {
    bakSet(existing);
  }
}
function mainSaveBlob(): string | null {
  return lsGet(activeSaveKey()) || hookGet(activeSaveKey()) || memSave || ssGet(activeSaveKey()) || currentRaw();
}
function legacySaveBlob(): string | null {
  // Read-only: the original ed16_save_v1 / _bak keys are never written or deleted after this.
  const main = lsGet("ed16_save_v1") || ssGet("ed16_save_v1");
  const bak = lsGet("ed16_save_v1_bak") || ssGet("ed16_save_v1_bak");
  if (parseSaveRaw(main)) return main;
  if (parseSaveRaw(bak)) return bak;
  if (main && savedT(main) >= savedT(bak)) return main;
  return bak;
}
function migrateProfiles(): void {
  if (lsGet(PROF_MIG_KEY) === "1") { ensureJaxSeed(); return; }
  const p1 = lsGet(profSaveKey(1));
  if (!parseSaveRaw(p1)) {
    const src = legacySaveBlob();
    if (src) {
      lsSet(profSaveKey(1), src);
      ssSet(profSaveKey(1), src);
      idbPut(profSaveKey(1), src);
      if (activeProf === 1) memSave = src;
      else memSaveBy[1] = src;
      const bak = lsGet("ed16_save_v1_bak") || ssGet("ed16_save_v1_bak");
      if (bak && bak !== src) {
        lsSet(profBakKey(1), bak);
        ssSet(profBakKey(1), bak);
        idbPut(profBakKey(1), bak);
        if (activeProf === 1) memBak = bak;
        else memBakBy[1] = bak;
      }
    }
  }
  // Copy the legacy bank into profile 1 once, leaving the original stash keys untouched.
  if (!parseStashRaw(lsGet(profStashKey(1)))) {
    const sMain = lsGet("ed16_stash_v1") || ssGet("ed16_stash_v1") || memStash;
    const sBak = lsGet("ed16_stash_v1_bak") || ssGet("ed16_stash_v1_bak");
    const src = parseStashRaw(sMain) ? sMain : (parseStashRaw(sBak) ? sBak : null);
    if (src) {
      lsSet(profStashKey(1), src);
      ssSet(profStashKey(1), src);
      idbPut(profStashKey(1), src);
      if (activeProf === 1) memStash = src;
      else memStashBy[1] = src;
    }
    if (sBak && sBak !== src && parseStashRaw(sBak)) {
      lsSet(profStashBakKey(1), sBak);
      ssSet(profStashBakKey(1), sBak);
      idbPut(profStashBakKey(1), sBak);
    }
  }
  lsSet(PROF_MIG_KEY, "1");
  ensureJaxSeed();
}
function exportCode(g: Game | null): string {
  if (g && g.mode === "play") saveGame(g);
  const raw = currentRaw();
  return raw ? "ED16-" + b64e(raw) : "";
}
// Persist a decoded / loaded run into the active profile. decodeCode and loadGame leave
// mode at "title" (newGame's default), and saveGame refuses to write unless mode is "play",
// so a code import that called saveGame before flipping the mode never reached disk — the
// slot kept a stale level-1 beginNew blob. Always set play and force-write after a valid import.
function commitImportedRun(g: Game, quiet = false): boolean {
  g.mode = "play";
  return saveGame(g, quiet, true);
}
function importCode(code: string, prev: Game | null): Game | null {
  try {
    const g = decodeCode(code, prev);
    if (!g) return null;
    lastPersistOk = false;
    try { lastPersistOk = commitImportedRun(g, true); } catch { lastPersistOk = false; }
    return g;
  } catch { return null; }
}

function loadBest(): number[] {
  try { return [Number(lsGet("ed16_best") || "0") || 0, Number(lsGet("ed16_lvl") || "0") || 0]; } catch { return [0, 0]; }
}
function saveBest(g: Game): void {
  try { lsSet("ed16_best", String(g.best)); lsSet("ed16_lvl", String(g.bestLvl)); } catch { /* storage unavailable */ }
}

// ---------- save / continue ----------
const SAVE_GAME_LBL = "Save Game";
const SAVE_CODE_LBL = "Save Code";
let lastPersistOk = false;
const SAVE_KEY = "ed16_save_v1";
const SAVE_BAK = "ed16_save_v1_bak";
const STASH_KEY = "ed16_stash_v1";
const STASH_BAK = "ed16_stash_v1_bak";
const SAVE_VER = 1;
let saveFlag: boolean | null = null;
const u8s = (a: Uint8Array): string => { let s = ""; for (let i = 0; i < a.length; i++) s += String.fromCharCode(48 + a[i]); return s; };
const su8 = (s: string): Uint8Array => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = Math.max(0, Math.min(3, s.charCodeAt(i) - 48)); return a; };
function parseSaveRaw(raw: string | null): Record<string, unknown> | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const s = JSON.parse(raw) as Record<string, unknown>;
    if (!s || typeof s !== "object" || s.v !== SAVE_VER) return null;
    if (typeof s.depth !== "number" || !isFinite(s.depth) || s.depth < 1) return null;
    if (typeof s.lvl !== "number" || !isFinite(s.lvl) || s.lvl < 1) return null;
    // compact 1 = ED2 wrapper; compact 2 = LZ-compressed character + current/previous floor.
    if ((s.compact === 1 && typeof s.code === "string" && s.code.length > 0) || (s.compact === 2 && typeof s.z === "string" && s.z.length > 0)) return s;
    if (typeof s.map !== "string" || s.map.length !== MW * MH) return null;
    if (typeof s.seen !== "string" || s.seen.length !== MW * MH) return null;
    if (typeof s.hx !== "number" || typeof s.hy !== "number" || !isFinite(s.hx) || !isFinite(s.hy)) return null;
    const hx = Math.floor(s.hx), hy = Math.floor(s.hy);
    if (!inb(hx, hy)) return null;
    // A hero standing on a wall is still a valid save (Wall Breaker can dig out). Rejecting it hid Continue and blocked auto-load.
    return s;
  } catch { return null; }
}
function saveProgress(s: Record<string, unknown>): number {
  return (Number(s.depth) || 0) * 1e12 + (Number(s.lvl) || 0) * 1e9 + (Number(s.xp) || 0) * 1e6 + (Number(s.turn) || 0) * 1e3 + (Number(s.kills) || 0) * 10 + (Number(s.gold) || 0) * 0.001;
}
function isFreshSave(s: Record<string, unknown>): boolean {
  return (Number(s.depth) || 0) === 1 && (Number(s.lvl) || 0) === 1 && (Number(s.turn) || 0) <= 2 && (Number(s.kills) || 0) === 0 && (Number(s.xp) || 0) === 0;
}
function hasSaveBlob(): boolean {
  try {
    migrateProfiles();
    return !!(lsGet(activeSaveKey()) || hookGet(activeSaveKey()) || memSave || lsGet(activeBakKey()) || hookGet(activeBakKey()) || memBak || ssGet(activeSaveKey()) || ssGet(activeBakKey()));
  } catch { return !!(memSave || memBak); }
}
function hasSave(): boolean {
  const ok = !!(parseSaveRaw(currentRaw()) || parseSaveRaw(currentBak()));
  saveFlag = ok;
  return ok;
}
// false until the first IndexedDB sync settles (or immediately if this environment has no IDB, e.g. tests).
// Stops a first tap on the title from starting a new game and overwriting an IDB-only save that has not been copied into localStorage yet.
let storageReady = false;
(function initStorageReadyFlag(): void {
  try { probeStores(); storageReady = !idbFactory && !testIdb; } catch { storageReady = true; }
})();

function titleMayAutoStart(): boolean { return storageReady && !hasSaveBlob(); }
function markStorageReady(): void { storageReady = true; }
function isLegacyStoreKey(k: string): boolean {
  return k === "ed16_save_v1" || k === "ed16_save_v1_bak" || k === "ed16_stash_v1" || k === "ed16_stash_v1_bak";
}
function isRedundantGameKey(k: string): boolean {
  // Per-profile backups only. Never the legacy keys, and never another (or this) profile's primary save/stash.
  return /^ed16_save_v1_p[123]_bak$/.test(k) || /^ed16_stash_v1_p[123]_bak$/.test(k);
}
function lsKeys(): string[] {
  const keys: string[] = [];
  const seen: Record<string, number> = {};
  const add = (k: string | null): void => { if (k && !seen[k]) { seen[k] = 1; keys.push(k); } };
  try {
    probeStores();
    if (lsHandle && typeof lsHandle.length === "number") {
      for (let i = 0; i < lsHandle.length; i++) add(lsHandle.key(i));
    }
  } catch { /* ignore */ }
  add("ed16_save_v1"); add("ed16_save_v1_bak"); add("ed16_stash_v1"); add("ed16_stash_v1_bak"); add(PROF_MIG_KEY);
  for (const p of PROFILES) {
    add(profSaveKey(p.id)); add(profBakKey(p.id)); add(profStashKey(p.id)); add(profStashBakKey(p.id));
  }
  return keys;
}
function freeRedundantSaves(): number {
  let freed = 0;
  for (const k of lsKeys()) {
    if (isLegacyStoreKey(k) || !isRedundantGameKey(k)) continue;
    const prev = lsGet(k);
    if (!prev) continue;
    try { lsRemove(k); freed += prev.length; } catch { /* ignore */ }
    try { ssRemove(k); } catch { /* ignore */ }
  }
  return freed;
}
function pruneFloorSnap(snap: FloorSnap | null | undefined): FloorSnap | null {
  if (!snap) return null;
  return {
    ...snap,
    chests: Array.isArray(snap.chests) ? snap.chests.slice(0, SAVE_CHEST_CAP) : [],
    drops: Array.isArray(snap.drops) ? snap.drops.slice(0, SAVE_DROP_CAP) : [],
    ground: Array.isArray(snap.ground) ? snap.ground.slice(0, SAVE_GROUND_CAP) : [],
  };
}
function codeBodyOf(g: Game): Record<string, unknown> {
  const bagCap = g.bagCap ?? BAG;
  const gemCap = g.gemCap ?? GEM_BAG;
  const vault = (g.vault && g.vault.length <= SAVE_VAULT_MAX) ? g.vault : null;
  return {
    v: 2, d: g.depth, l: g.lvl, x: Math.round(g.xp), g: g.gold, p: g.potions, b: g.best, bl: g.bestLvl, k: g.kills, dt: g.deaths || 0,
    u: Math.max(0, Math.round(g.ultAt - Date.now())), ua: Math.max(0, Math.round((g.ultAtA ?? 0) - Date.now())), ucs: packUltCds(g), ae: g.autoEq ? 1 : 0, mu: g.muted ? 1 : 0, mo: g.music ? 1 : 0, gm: g.gems ?? 0, ac: g.autoCombine === false ? 0 : 1, cs: packChestShop(g), ct: packChestTypes(g), ctm: g.chestTypeMig ? 1 : 0, wb: g.wallBreak ? 1 : 0, ck: packCracks(g),
    e: EQK.map((k: EqKey) => packItem(g.eq[k])), s: g.bag.slice(0, bagCap).map((it: Item) => packItem(it)), gb: ensureGemBag(g).slice(0, gemCap).map((it: Item) => packItem(it)), bc: bagCap, gc: gemCap, ts: thSeenCode(g),
    stsh: [], stg: bankGoldOf(g), bg: bankGoldOf(g),
    ad: g.actCleared ?? 0, fr: floorFront(g), fp: pruneFloorSnap(g.snapPrev ?? null), fc: pruneFloorSnap(g.depth === floorFront(g) && !g.vault ? captureFloor(g) : (g.snapCur ?? null)), ms: unpackMerchSub(g.merchSub),
    hx: g.hero.x, hy: g.hero.y, hp: g.hero.hp, dir: heroDir(g.hero), tn: g.turn,
    ar: g.area ?? "dungeon", vt: vault,
  };
}

function fullSnapOf(g: Game): Record<string, unknown> {
  // Legacy uncompressed snapshot, kept so older blobs and tests that rewrite raw v1 fields still load.
  return {
    v: SAVE_VER, t: Date.now(), depth: g.depth, lvl: g.lvl, xp: g.xp, gold: g.gold, potions: g.potions, hp: g.hero.hp, hx: g.hero.x, hy: g.hero.y, face: g.hero.face,
    dir: heroDir(g.hero),
    eq: g.eq, bag: g.bag, map: u8s(g.map), seen: u8s(g.seen), en: g.en.filter((e: En) => e.hp > 0).concat(g.pend), chests: g.chests, drops: g.drops,
    turn: g.turn, kills: g.kills, regenAcc: g.regenAcc, muted: g.muted,
    ground: g.ground, allies: g.allies, ward: g.ward, autoEq: g.autoEq, music: g.music, autoCombine: g.autoCombine !== false,
    trader: g.trader, ultAt: g.ultAt, ultAtA: g.ultAtA ?? 0, ultAts: g.ultAts ?? {}, floorTurn: g.floorTurn, best: g.best, bestLvl: g.bestLvl, deaths: g.deaths, portal: g.portal, vault: g.vault, gobT: g.gobT, locked: g.locked, thSeen: g.thSeen ?? [],
    area: g.area ?? "dungeon", actCleared: g.actCleared ?? 0, actCampAt: g.actCampAt ?? 0, front: floorFront(g), snapPrev: g.snapPrev ?? null, snapCur: (g.depth === floorFront(g) && !g.vault ? captureFloor(g) : (g.snapCur ?? null)), gemBag: ensureGemBag(g), bagCap: g.bagCap ?? BAG, gemCap: g.gemCap ?? GEM_BAG, stash: [], stashGold: bankGoldOf(g), bankGold: bankGoldOf(g), campSpot: g.campSpot, stashAt: g.stashAt, restAt: g.restAt, fireAt: g.fireAt, gems: g.gems ?? 0, chestShop: packChestShop(g), chestTypes: packChestTypes(g), chestTypeMig: !!g.chestTypeMig, merchSub: unpackMerchSub(g.merchSub), merchant: g.merchant ?? null,
    wallBreak: !!g.wallBreak, cracks: packCracks(g),
  };
}
function buildPersistRaw(g: Game): string {
  const z = lzc(JSON.stringify(codeBodyOf(g)));
  return JSON.stringify({
    v: SAVE_VER, t: Date.now(), depth: g.depth, lvl: g.lvl, xp: g.xp, gold: g.gold, potions: g.potions,
    kills: g.kills, turn: g.turn, hx: g.hero.x, hy: g.hero.y, hp: g.hero.hp, compact: 2, z,
  });
}
function persistSizeInfo(g: Game): { body: number; stored: number; z: number } {
  const body = JSON.stringify(codeBodyOf(g));
  const z = lzc(body);
  const stored = JSON.stringify({ v: SAVE_VER, t: 0, depth: g.depth, lvl: g.lvl, xp: g.xp, gold: g.gold, potions: g.potions, kills: g.kills, turn: g.turn, hx: g.hero.x, hy: g.hero.y, hp: g.hero.hp, compact: 2, z }).length;
  return { body: body.length, stored, z: z.length };
}
function lsUsedBytes(): number {
  let n = 0;
  for (const k of lsKeys()) {
    const v = lsGet(k);
    if (v) n += k.length + v.length;
  }
  return n;
}
function storageReportLine(): string {
  probeStores();
  const kb = (n: number): string => n >= 1024 * 1024 ? ((n / (1024 * 1024)).toFixed(2) + " MB") : (Math.ceil(n / 1024) + " KB");
  const parts = PROFILES.map((p: { id: ProfId; name: string }) => {
    const b = profBlob(p.id);
    return p.name + " " + (b ? kb(b.length) : "empty");
  });
  const stores = [
    storeAvailLabel("localStorage", lsHandle, lsDenied),
    storeAvailLabel("sessionStorage", ssHandle, ssDenied),
    storeAvailLabel("IndexedDB", idbFactory, idbDenied, !!testIdb),
  ].join(" · ");
  const used = lsHandle ? (" · " + kb(lsUsedBytes()) + " used") : "";
  return stores + used + " · " + parts.join(" · ");
}
function writeDurable(key: string, raw: string): boolean {
  // Success if ANY durable store verifies: localStorage or IndexedDB. sessionStorage is a same-session cache only.
  probeStores();
  if (viewerBlocksSaving()) {
    lastPersistErr = "this viewer blocks saving";
    try { ssSet(key, raw); } catch { /* not durable */ }
    return false;
  }
  let lsOk = lsSet(key, raw);
  if (!lsOk) {
    const freed = freeRedundantSaves();
    if (freed > 0) lsOk = lsSet(key, raw);
  }
  try { ssSet(key, raw); } catch { /* not durable, never counted */ }
  if (testIdb) testIdb[key] = raw;
  idbPut(key, raw);
  const idbHookOk = !!(testIdb && testIdb[key] === raw);
  const durable = lsOk || idbHookOk || (lsGet(key) === raw);
  if (!durable) {
    if (viewerBlocksSaving()) lastPersistErr = "this viewer blocks saving";
    else {
      const bits: string[] = [];
      if (!lsOk) bits.push(lastLsErr || "localStorage did not keep the save");
      if (!idbHookOk) bits.push(testIdb ? "IndexedDB hook write failed" : (lastIdbErr || "IndexedDB write is still in flight or failed"));
      lastPersistErr = bits.join("; ") || "the profile was not updated";
    }
  } else {
    lastPersistErr = "";
  }
  return durable;
}
function saveGame(g: Game, quiet = false, force = false): boolean {
  if (GIB_SKIP_SAVE) return false;
  if (g.mode !== "play") return false;
  lastPersistOk = false;
  lastPersistErr = "";
  try {
    // Always persist a zeroed autosave timer so a reload cannot immediately
    // rewrite the slot (and pick up mid-tick HP changes) before the player moves.
    const prevSaveT = g.saveT;
    g.saveT = 0;
    const raw = buildPersistRaw(g);
    g.saveT = 0;
    const neu = parseSaveRaw(raw);
    if (!neu) { g.saveT = prevSaveT; lastPersistErr = "save payload was not valid"; return false; }
    const existing = mainSaveBlob();
    const old = parseSaveRaw(existing);
    if (!force && old && isFreshSave(neu) && saveProgress(old) > saveProgress(neu)) { g.saveT = prevSaveT; return false; }
    if (existing && existing !== raw) preserveSaveBackup(existing);
    memSave = raw;
    persistStash(g);
    const ok = writeDurable(activeSaveKey(), raw);
    saveFlag = ok;
    lastPersistOk = ok;
    if (!ok) g.saveT = prevSaveT;
    // Only show "Saved" after a verified durable write.
    // A failed write used to toast anyway, so a stale slot (e.g. the level-1 beginNew) looked saved.
    if (ok && !quiet) g.toast = 1.4;
    return ok;
  } catch (err) {
    lastPersistErr = viewerBlocksSaving() ? "this viewer blocks saving" : ("save threw: " + storeDeniedReason("save", err));
    lastPersistOk = false;
    return false;
  }
}
function flushPlaySave(g: Game | null, quiet = true): boolean {
  // Force-write the exact current play moment into the active profile (Save Game, pause, hide/close, stairs already have their own writes).
  if (!g || g.mode !== "play") return false;
  lastPersistOk = false;
  const ok = saveGame(g, quiet, true);
  lastPersistOk = ok;
  return ok;
}
function saveGameNow(g: Game): boolean {
  // Dedicated "Save Game" path: write this exact moment into the active profile and require a read-back.
  const ok = flushPlaySave(g, false);
  if (!ok && viewerBlocksSaving()) offerBlockedSaveCode(g);
  return ok;
}
let pendingCodeOffer: string | null = null;
function offerBlockedSaveCode(g: Game | null): string {
  let code = "";
  try { code = saveCodeOf(g); } catch { code = ""; }
  pendingCodeOffer = code || null;
  if (viewerBlocksSaving()) lastPersistErr = "this viewer blocks saving";
  return code;
}
function saveCodeOf(g: Game | null): string {
  if (g && g.mode === "play") return makeCode(g);
  try {
    const l = loadGame(g);
    return l ? makeCode(l) : "";
  } catch { return ""; }
}

function clearSave(): void {
  // Run only: STASH_KEY / STASH_BAK are never cleared here (stash is permanent).
  // Always copy the current blob to the backup first, even if it no longer parses, so New Game cannot destroy it.
  preserveSaveBackup(mainSaveBlob());
  try { lsRemove(activeSaveKey()); } catch { /* storage unavailable */ }
  try { ssRemove(activeSaveKey()); } catch { /* storage unavailable */ }
  memSave = null; idbPut(activeSaveKey(), null); saveFlag = false;
}
const KINDS: string[] = [...ARMOR_K, ...WEAP_K.slice(0, 12), "pet", ...WEAP_K.slice(12), "gem"];
// ---------- compact Save Code v2: no map (the floor is rebuilt), short keys, LZ-compressed, base64 ----------
const B64C = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function lzc(src: string): string {
  const dict = new Map<string, number>();
  const create = new Set<string>();
  const out: string[] = [];
  let w = "", enlarge = 2, dictSize = 3, numBits = 2, val = 0, pos = 0;
  const bits = (v: number, n: number): void => {
    for (let i = 0; i < n; i++) { val = (val << 1) | (v & 1); v >>= 1; if (pos === 5) { pos = 0; out.push(B64C.charAt(val)); val = 0; } else pos++; }
  };
  const grow = (): void => { if (--enlarge === 0) { enlarge = Math.pow(2, numBits); numBits++; } };
  const emit = (): void => {
    if (create.has(w)) {
      const cc = w.charCodeAt(0);
      if (cc < 256) { bits(0, numBits); bits(cc, 8); } else { bits(1, numBits); bits(cc, 16); }
      grow();
      create.delete(w);
    } else bits(dict.get(w) ?? 0, numBits);
    grow();
  };
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    if (!dict.has(c)) { dict.set(c, dictSize++); create.add(c); }
    const wc = w + c;
    if (dict.has(wc)) w = wc;
    else { emit(); dict.set(wc, dictSize++); w = c; }
  }
  if (w !== "") emit();
  bits(2, numBits);
  for (;;) { val = val << 1; if (pos === 5) { out.push(B64C.charAt(val)); break; } pos++; }
  return out.join("");
}
function lzd(inp: string): string | null {
  const len = inp.length;
  if (!len) return null;
  for (let i = 0; i < len; i++) if (B64C.indexOf(inp.charAt(i)) < 0) return null;
  const gv = (i: number): number => (i < len ? B64C.indexOf(inp.charAt(i)) : 0);
  let dval = gv(0), dpos = 32, dind = 1;
  const read = (n: number): number => {
    let r = 0, p = 1;
    const mx = Math.pow(2, n);
    while (p !== mx) { const b = dval & dpos; dpos >>= 1; if (dpos === 0) { dpos = 32; dval = gv(dind++); } r |= (b > 0 ? 1 : 0) * p; p <<= 1; }
    return r;
  };
  const dict: string[] = ["0", "1", "2"];
  let enlarge = 4, dictSize = 4, numBits = 3;
  const t = read(2);
  let c: string;
  if (t === 0) c = String.fromCharCode(read(8)); else if (t === 1) c = String.fromCharCode(read(16)); else return null;
  dict[3] = c;
  let w = c;
  const out: string[] = [c];
  let total = 1;
  for (;;) {
    if (dind > len + 1 || total > 4000000) return null;
    let cc = read(numBits);
    if (cc === 0) { dict[dictSize++] = String.fromCharCode(read(8)); cc = dictSize - 1; enlarge--; }
    else if (cc === 1) { dict[dictSize++] = String.fromCharCode(read(16)); cc = dictSize - 1; enlarge--; }
    else if (cc === 2) return out.join("");
    if (enlarge === 0) { enlarge = Math.pow(2, numBits); numBits++; }
    let entry: string;
    if (cc < dictSize && dict[cc] !== undefined) entry = dict[cc];
    else if (cc === dictSize) entry = w + w.charAt(0);
    else return null;
    out.push(entry); total += entry.length;
    dict[dictSize++] = w + entry.charAt(0);
    enlarge--;
    w = entry;
    if (enlarge === 0) { enlarge = Math.pow(2, numBits); numBits++; }
  }
}
const BKEYS: Bonus[] = ["hp", "atk", "def", "crit", "spd", "regen", "mv"];
const r3 = (n: number): number => Math.round(n * 1000) / 1000;
function packItem(it: Item | null): unknown {
  if (!it) return 0;
  return [KINDS.indexOf(it.kind), it.rar, it.ilvl, it.seed, it.atk, it.def, it.block, it.bonus, it.d.join(""), it.name,
    it.spells ? it.spells.map((s: Spell) => [ELS.indexOf(s.el), SHAPES.indexOf(s.sh), s.mod, r3(s.ch), r3(s.pw), r3(s.r), s.name]) : 0,
    it.pas ? it.pas.map((p: Passive) => [ELS.indexOf(p.el), PTYPES.indexOf(p.ty), p.mod, r3(p.pw), p.name]) : 0,
    it.ult === undefined ? -1 : it.ult, it.ef ? it.ef.map((e: number[]) => [e[0], r3(e[1])]) : 0, it.pt === undefined ? -1 : it.pt, it.set === undefined ? -1 : it.set, it.st ? it.st.map((e: number[]) => [e[0], r3(e[1] ?? 1)]) : 0, wepNeedsEl(it.kind) ? ELS.indexOf(ensureWepEl(it)) : -1,
    it.sk ? it.sk.map((z: { c: number; g?: { typ: number; rar: number } }) => [z.c, z.g ? z.g.typ : -1, z.g ? z.g.rar : -1]) : 0, it.gt === undefined ? -1 : it.gt, it.golden ? 1 : 0, it.pab === undefined ? -1 : it.pab];
}
function unpackItem(a: unknown): Item | null {
  if (!Array.isArray(a) || a.length < 13) return null;
  const n = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : NaN);
  const bonus: Partial<Record<Bonus, number>> = {};
  if (a[7] && typeof a[7] === "object") for (const [k, v] of Object.entries(a[7] as Record<string, unknown>)) if ((BKEYS as string[]).includes(k) && typeof v === "number" && isFinite(v)) bonus[k as Bonus] = v;
  const sp = Array.isArray(a[10]) ? (a[10] as unknown[][]).filter((s: unknown) => Array.isArray(s)).map((s: unknown[]) => ({ el: ELS[n(s[0])], sh: SHAPES[n(s[1])], mod: n(s[2]), ch: n(s[3]), pw: n(s[4]), r: n(s[5]), name: String(s[6] ?? "") })) : undefined;
  const pa = Array.isArray(a[11]) ? (a[11] as unknown[][]).filter((p: unknown) => Array.isArray(p)).map((p: unknown[]) => ({ el: ELS[n(p[0])], ty: PTYPES[n(p[1])], mod: n(p[2]), pw: n(p[3]), name: String(p[4] ?? "") })) : undefined;
  const o = { id: NID++, seed: n(a[3]) || 1, kind: KINDS[n(a[0])], rar: n(a[1]), ilvl: n(a[2]), name: String(a[9] ?? ""), atk: n(a[4]), def: n(a[5]), block: n(a[6]), bonus,
    d: String(a[8] ?? "").split("").map((c: string) => Number(c)), spells: sp, pas: pa, ult: n(a[12]) >= 0 ? n(a[12]) : undefined,
    ef: Array.isArray(a[13]) ? (a[13] as unknown[]).filter((e: unknown) => Array.isArray(e)).map((e: unknown) => (e as unknown[]).map((v: unknown) => n(v))) : undefined, pt: n(a[14]) >= 0 ? n(a[14]) : undefined, set: n(a[15]) >= 0 ? n(a[15]) : undefined, st: Array.isArray(a[16]) ? (a[16] as unknown[]).filter((e: unknown) => Array.isArray(e)).map((e: unknown) => (e as unknown[]).map((v: unknown) => n(v))) : undefined, wel: (ELS as string[]).includes(ELS[n(a[17])]) ? ELS[n(a[17])] : undefined,
    sk: Array.isArray(a[18]) ? (a[18] as unknown[]).filter((z: unknown) => Array.isArray(z)).map((z: unknown) => { const row = z as unknown[]; const c = n(row[0]); const typ = n(row[1]); const rr = n(row[2]); return { c: Math.max(0, Math.min(6, c)), g: typ >= 0 && typ <= 6 && rr >= 0 ? { typ: typ, rar: Math.max(0, Math.min(7, rr)) } : undefined }; }) : undefined,
    gt: n(a[19]) >= 0 && n(a[19]) <= 6 ? Math.floor(n(a[19])) : undefined, golden: n(a[20]) === 1 || undefined, pab: n(a[21]) >= 0 && n(a[21]) <= 5 ? Math.floor(n(a[21])) : undefined };
  if ([o.rar, o.ilvl, o.atk, o.def, o.block].some((v: number) => !isFinite(v))) return null;
  return validItem(o);
}
const CODE_PRE = "ED2-";
function makeCode(g: Game): string {
  return CODE_PRE + lzc(JSON.stringify(codeBodyOf(g)));
}
// Turns a Save Code (new ED2- or legacy ED16-) into a playable game. Never touches storage unless the code is fully valid.
function decodeCode(code: string, prev: Game | null): Game | null {
  try {
    const c = String(code || "").replace(/[\s"'`]+/g, "");
    if (!c) return null;
    if (/^ED16-/i.test(c)) return loadGame(prev, b64d(c.replace(/^ED16-/i, "")));
    const m = /ED2-([A-Za-z0-9+/]+)/i.exec(c);
    const body = m ? m[1] : /^[A-Za-z0-9+/]+$/.test(c) ? c : "";
    if (!body) return null;
    const js = lzd(body);
    if (!js) return null;
    const s = JSON.parse(js) as Record<string, unknown>;
    if (!s || typeof s !== "object" || s.v !== 2) return null;
    const num = (k: string, min: number, max: number): number => { const v = s[k]; if (typeof v !== "number" || !isFinite(v)) throw new Error("bad " + k); return Math.max(min, Math.min(max, v)); };
    const optNum = (k: string, min: number, max: number, dflt: number): number => { const v = s[k]; if (typeof v !== "number" || !isFinite(v)) return dflt; return Math.max(min, Math.min(max, v)); };
    const g = newGame(prev);
    // Depth and level are required; every other field defaults so older-version ED2 codes migrate cleanly.
    g.depth = Math.floor(num("d", 1, 100000)); g.lvl = Math.floor(num("l", 1, 100000));
    g.xp = optNum("x", 0, 1e15, 0); g.gold = Math.floor(optNum("g", 0, 1e15, 0));
    g.potions = Math.floor(optNum("p", 0, 1e6, 0)); g.kills = Math.floor(optNum("k", 0, 1e12, 0)); g.deaths = Math.floor(optNum("dt", 0, 1e9, 0));
    g.best = Math.max(g.best, Math.floor(optNum("b", 0, 100000, g.depth)), g.depth); g.bestLvl = Math.max(g.bestLvl, Math.floor(optNum("bl", 0, 100000, g.lvl)), g.lvl);
    g.ultAt = Date.now() + Math.min(ULT_CD, optNum("u", 0, ULT_CD, 0));
    g.ultAtA = Date.now() + Math.min(ULT_CD, typeof s.ua === "number" && isFinite(s.ua) ? Math.max(0, s.ua) : 0);
    g.autoEq = s.ae !== 0; g.muted = s.mu === 1; g.music = s.mo !== 0; g.autoCombine = s.ac !== 0;
    g.wallBreak = s.wb === 1;
    g.gems = typeof s.gm === "number" && isFinite(s.gm) ? Math.max(0, Math.floor(s.gm)) : 0;
    g.chestShop = unpackChestShop(s.cs);
    g.chestTypes = unpackChestTypes(s.ct);
    g.chestTypeMig = s.ctm === 1;
    migrateChestTypes(g);
    g.merchSub = unpackMerchSub(s.ms);
    const e = Array.isArray(s.e) ? s.e : [];
    EQK.forEach((k: EqKey, i: number) => { g.eq[k] = e[i] ? unpackItem(e[i]) : null; });
    g.bag = (Array.isArray(s.s) ? s.s : []).map((a: unknown) => unpackItem(a)).filter((it: Item | null): it is Item => !!it);
    g.gemBag = (Array.isArray(s.gb) ? s.gb : []).map((a: unknown) => unpackItem(a)).filter((it: Item | null): it is Item => !!it);
    if (typeof s.bc === "number" && isFinite(s.bc)) g.bagCap = Math.max(BAG, Math.floor(s.bc));
    if (typeof s.gc === "number" && isFinite(s.gc)) g.gemCap = Math.max(GEM_BAG, Math.floor(s.gc));
    migrateGemsToBag(g);
    fixEq(g.eq);
    g.ultAts = readUltCds(s.ucs, g.ultAt, g.ultAtA, g.eq, true);
    syncLegacyUlt(g);
    g.thSeen = thSeenParse(s.ts);
    g.actCleared = typeof s.ad === "number" && isFinite(s.ad) ? Math.max(0, Math.floor(s.ad)) : 0;
    g.front = typeof s.fr === "number" && isFinite(s.fr) ? Math.max(g.depth, Math.floor(s.fr)) : g.depth;
    g.snapPrev = unpackFloorSnap(s.fp);
    g.snapCur = unpackFloorSnap(s.fc);
    const here = (g.depth === floorFront(g) ? g.snapCur : (g.depth === floorFront(g) - 1 ? g.snapPrev : null));
    if (here && here.d === g.depth) restoreFloor(g, here, g.depth === floorFront(g) ? TILE_UP : 2);
    else genFloor(g);
    if (!here || here.d !== g.depth) g.cracks = unpackCracks(s.ck, g.map);
    else if (!g.cracks || !g.cracks.some((p: number) => p > 0)) g.cracks = unpackCracks(s.ck, g.map);
    g.hero.hp = calc(g.lvl, g.eq).maxHp;
    if (typeof s.hp === "number" && isFinite(s.hp)) g.hero.hp = Math.max(1, Math.min(calc(g.lvl, g.eq).maxHp, Math.floor(s.hp)));
    if (typeof s.hx === "number" && typeof s.hy === "number" && inb(Math.floor(s.hx), Math.floor(s.hy))) {
      const x = Math.floor(s.hx), y = Math.floor(s.hy);
      g.hero.x = x; g.hero.y = y; g.hero.ax = x; g.hero.ay = y;
    }
    if (typeof s.dir === "number" && isFinite(s.dir)) {
      const dir = Math.max(0, Math.min(7, Math.floor(s.dir as number)));
      g.hero.dir = dir; g.hero.face = dirFace(dir);
    }
    if (typeof s.tn === "number" && isFinite(s.tn)) g.turn = Math.max(0, Math.floor(s.tn as number));
    if (s.ar === "camp" || s.ar === "vault") {
      g.area = s.ar;
      if (s.ar === "camp") { try { placeMerchant(g); } catch { /* camp extras are best-effort */ } g.seen.fill(1); g.vis.fill(1); }
    }
    if (typeof s.vt === "string" && s.vt.length > 0 && s.vt.length < 600000) g.vault = s.vt;
    g.mode = "play";
    const packed = Array.isArray(s.stsh) ? s.stsh : [];
    const codeItems = packed.map((a: unknown) => unpackItem(a)).filter((it: Item | null): it is Item => !!it);
    const codeGold = typeof s.bg === "number" && isFinite(s.bg) ? Math.max(0, Math.floor(s.bg)) : (typeof s.stg === "number" && isFinite(s.stg) ? Math.max(0, Math.floor(s.stg)) : 0);
    const hasBg = typeof s.bg === "number" && isFinite(s.bg);
    attachBank(g, codeItems, codeGold, hasBg ? codeGold : undefined);
    msg(g, "Run restored from Save Code - depth " + g.depth + ", level " + g.lvl + ".", "#80ff80");
    fixPrisLoad(g);
    return g;
  } catch { return null; }
}
function ssGet(k: string): string | null {
  try { probeStores(); return ssHandle ? ssHandle.getItem(k) : null; } catch { return null; }
}
function ssSet(k: string, v: string): boolean {
  try {
    probeStores();
    if (!ssHandle) return false;
    ssHandle.setItem(k, v);
    return ssHandle.getItem(k) === v;
  } catch (err) { lastSsErr = storeDeniedReason("sessionStorage", err); return false; }
}
function ssRemove(k: string): void {
  try { probeStores(); if (ssHandle) ssHandle.removeItem(k); } catch { /* storage unavailable */ }
}
function probeStore(which: "l" | "s"): boolean {
  try { probeStores(); return which === "l" ? !!lsHandle : !!ssHandle; } catch { return false; }
}
function probeIdb(): Promise<boolean> {
  return new Promise<boolean>((res) => {
    const to = setTimeout(() => res(false), 2500);
    try { idbPut("ed16_probe", "1"); void idbGet("ed16_probe").then((v: string | null) => { clearTimeout(to); res(v === "1"); }, () => { clearTimeout(to); res(false); }); } catch { clearTimeout(to); res(false); }
  });
}
function fixEq(eq: Eq): void {
  if (eq.pet === undefined) eq.pet = null;
  if (eq.pet && eq.pet.kind !== "pet") eq.pet = null;
  for (const k of ["head", "chest", "arms", "legs", "rh", "lh"] as EqKey[]) { const it = eq[k]; if (it && it.kind === "pet") eq[k] = null; }
}
function thSeenParse(v: unknown): number[] {
  const out: number[] = [];
  if (typeof v === "string") { for (let i = 0; i < Math.min(50, v.length); i++) if (v[i] === "1") out.push(i); }
  else if (Array.isArray(v)) for (const x of v) { const n = Math.floor(Number(x)); if (n >= 0 && n < 50 && !out.includes(n)) out.push(n); }
  return out;
}
function thSeenCode(g: Game): string { const s = g.thSeen ?? []; let o = ""; for (let i = 0; i < 50; i++) o += s.includes(i) ? "1" : "0"; return o; }
function validItem(o: unknown): Item | null {
  if (!o || typeof o !== "object") return null;
  const it = o as Item;
  if (typeof it.id !== "number" || !KINDS.includes(it.kind) || typeof it.rar !== "number" || it.rar < 0 || it.rar > 7 || !Array.isArray(it.d) || it.d.length !== 4 || typeof it.name !== "string") return null;
  if (typeof it.atk !== "number" || typeof it.def !== "number" || typeof it.block !== "number" || typeof it.ilvl !== "number") return null;
  if (!it.bonus || typeof it.bonus !== "object") it.bonus = {};
  it.rar = Math.floor(it.rar);
  it.d = it.d.map((v: number, i: number) => Math.max(0, Math.min([5, 4, 3, 5][i], Math.floor(Number(v) || 0))));
  it.spells = Array.isArray(it.spells) ? it.spells.filter((s: Spell) => !!s && ELS.includes(s.el) && SHAPES.includes(s.sh) && typeof s.ch === "number" && typeof s.pw === "number" && typeof s.r === "number" && typeof s.name === "string").map((s: Spell) => ({ ...s, mod: Math.max(0, Math.min(7, Math.floor(Number(s.mod) || 0))) })) : undefined;
  it.pas = Array.isArray(it.pas) ? it.pas.filter((p: Passive) => !!p && ELS.includes(p.el) && PTYPES.includes(p.ty) && typeof p.pw === "number" && typeof p.name === "string").map((p: Passive) => ({ ...p, mod: Math.max(0, Math.min(4, Math.floor(Number(p.mod) || 0))) })) : undefined;
  if (typeof it.ult === "number" && it.ult >= 0 && it.ult < ULTS.length && it.kind !== "shield" && it.kind !== "pet") it.ult = Math.floor(it.ult); else it.ult = undefined;
  if (it.kind === "pet") { const pt = Math.floor(Number(it.pt)); it.pt = pt >= 0 && pt < 100 ? pt : 0; it.spells = undefined; it.pas = undefined; ensurePetAbi(it); } else { it.pt = undefined; it.pab = undefined; }
  if (Array.isArray(it.ef) && it.kind !== "pet") {
    const wpn = !isArmor(it.kind) && it.kind !== "shield";
    const seenEf = new Set<number>();
    it.ef = it.ef.filter((e: number[]) => Array.isArray(e) && e.length >= 2 && isFinite(Number(e[0])) && isFinite(Number(e[1]))).map((e: number[]) => [Math.floor(Number(e[0])), Math.max(0.1, Math.min(3, Number(e[1])))])
      .filter((e: number[]) => e[0] >= (wpn ? 0 : 50) && e[0] < (wpn ? 50 : 100) && !seenEf.has(e[0]) && !!seenEf.add(e[0])).slice(0, 4);
    if (!it.ef.length) it.ef = undefined;
  } else it.ef = undefined;
  if (it.bonus.mv !== undefined) { if (isArmor(it.kind)) it.bonus.mv = Math.max(0, Math.min(MV_CAP, Math.round(it.bonus.mv))); else delete it.bonus.mv; }
  if (typeof it.set === "number" && isFinite(it.set) && it.set >= 0 && it.set < SETS.length) it.set = Math.floor(it.set); else delete it.set;
  if (it.kind === "gem") {
    const typ = typeof it.gt === "number" && isFinite(it.gt) ? Math.floor(it.gt) : Math.floor(Number(it.d[0]) || 0);
    it.gt = typ >= 0 && typ <= 6 ? typ : 0;
    it.atk = 0; it.def = 0; it.block = 0;
    delete it.st; delete it.sk; delete it.set; delete it.ult; delete it.spells; delete it.pas; delete it.ef; delete it.golden; delete it.wel;
    it.name = GEM_QN[it.rar] + " " + GEMT[it.gt].n;
  } else {
    if (Array.isArray(it.st)) {
      it.st = it.st.filter((e: number[]) => Array.isArray(e) && typeof e[0] === "number" && e[0] >= 0 && e[0] < 22).map((e: number[]) => [Math.floor(e[0]), Math.max(0.1, Number(e[1]) || 1)]).slice(0, 10);
      if (!it.st.length) delete it.st;
    } else delete it.st;
    if (Array.isArray(it.sk)) {
      it.sk = it.sk.filter((z: { c?: number; g?: { typ?: number; rar?: number } }) => z && typeof z.c === "number" && z.c >= 0 && z.c <= 6).map((z: { c: number; g?: { typ?: number; rar?: number } }) => {
        const sock: { c: number; g?: { typ: number; rar: number } } = { c: Math.floor(z.c) };
        if (z.g && typeof z.g.typ === "number" && z.g.typ >= 0 && z.g.typ <= 6 && typeof z.g.rar === "number" && z.g.rar >= 0 && z.g.rar <= 7) sock.g = { typ: Math.floor(z.g.typ), rar: Math.floor(z.g.rar) };
        return sock;
      }).slice(0, SOCK_MAX);
    } else it.sk = undefined;
    ensureSockets(it);
    if (it.golden || (it.rar >= 7 && it.st && it.st.length >= 10)) markGolden(it); else delete it.golden;
    if (wepNeedsEl(it.kind)) {
      if (it.wel && !(ELS as string[]).includes(it.wel)) delete it.wel;
      ensureWepEl(it);
    } else delete it.wel;
  }
  NID = Math.max(NID, it.id + 1);
  return it;
}
function loadGame(prev: Game | null, rawIn?: string | null): Game | null {
  try {
    let raw: string | null;
    let fromBak = false;
    if (rawIn !== undefined) {
      raw = rawIn;
      if (!parseSaveRaw(raw)) return null;
    } else {
      raw = currentRaw();
      if (!parseSaveRaw(raw)) {
        raw = currentBak();
        if (!parseSaveRaw(raw)) return null;
        fromBak = true;
      }
    }
    if (!raw) return null;
    const s = JSON.parse(raw) as Record<string, unknown>;
    if (!s || typeof s !== "object" || s.v !== SAVE_VER) return null;
    if (s.compact === 2 && typeof s.z === "string") {
      const js = lzd(s.z);
      if (!js) return null;
      const g = decodeCode(CODE_PRE + lzc(js), prev);
      if (g) {
        if (typeof s.hp === "number" && isFinite(s.hp)) g.hero.hp = Math.max(1, Math.min(calc(g.lvl, g.eq).maxHp, Math.floor(s.hp as number)));
        if (typeof s.hx === "number" && typeof s.hy === "number" && inb(Math.floor(s.hx as number), Math.floor(s.hy as number))) {
          const x = Math.floor(s.hx as number), y = Math.floor(s.hy as number);
          g.hero.x = x; g.hero.y = y; g.hero.ax = x; g.hero.ay = y;
        }
        optimizeEquipped(g);
        return g;
      }
    }
    if (s.compact === 1 && typeof s.code === "string") {
      const g = decodeCode(s.code, prev);
      if (g) { optimizeEquipped(g); return g; }
    }
    const num = (k: string, min: number): number => { const v = s[k]; if (typeof v !== "number" || !isFinite(v) || v < min) throw new Error("bad " + k); return v; };
    const map = typeof s.map === "string" && s.map.length === MW * MH ? su8(s.map) : null;
    const seen = typeof s.seen === "string" && s.seen.length === MW * MH ? su8(s.seen) : null;
    if (!map || !seen) return null;
    const g = newGame(prev);
    g.depth = Math.floor(num("depth", 1)); g.lvl = Math.floor(num("lvl", 1)); g.xp = num("xp", 0); g.gold = Math.floor(num("gold", 0));
    g.gems = typeof s.gems === "number" && isFinite(s.gems) ? Math.max(0, Math.floor(s.gems)) : 0;
    g.gambPity = typeof s.gambPity === "number" && isFinite(s.gambPity) ? Math.max(0, Math.floor(s.gambPity)) : 0;
    g.potions = Math.floor(num("potions", 0)); g.turn = Math.floor(num("turn", 0)); g.kills = Math.floor(num("kills", 0));
    g.regenAcc = typeof s.regenAcc === "number" && isFinite(s.regenAcc) ? s.regenAcc : 0;
    const eqIn = (s.eq && typeof s.eq === "object" ? s.eq : {}) as Record<string, unknown>;
    const eq: Eq = { head: null, chest: null, arms: null, legs: null, rh: null, lh: null, pet: null };
    for (const k of EQK) { const it = eqIn[k] ? validItem(eqIn[k]) : null; if (it) eq[k] = it; }
    for (const k of ARMOR_K) { const v = eq[k]; if (v && v.kind !== k) eq[k] = null; }
    if (eq.rh && (isArmor(eq.rh.kind) || eq.rh.kind === "shield")) eq.rh = null;
    if (eq.lh && (isArmor(eq.lh.kind) || isTwo(eq.lh))) eq.lh = null;
    if (isTwo(eq.rh)) eq.lh = null;
    fixEq(eq);
    g.eq = eq;
    g.bag = Array.isArray(s.bag) ? (s.bag as unknown[]).map((o: unknown) => validItem(o)).filter((x: Item | null): x is Item => x !== null) : [];
    g.map = map; g.seen = seen; g.vis = new Uint8Array(MW * MH);
    g.thSeen = thSeenParse(s.thSeen);
    g.theme = themeOf(g.depth);
    THDREAD = (g.area === "camp" || g.vault) ? 0 : dreadT(g.depth);
    if (!g.thSeen.includes(g.theme)) g.thSeen.push(g.theme);
    g.thShift = themeShift(g);
    g.tiles = makeTiles(g.theme, g.thShift);
    const hx = Math.floor(num("hx", 0)), hy = Math.floor(num("hy", 0));
    if (!inb(hx, hy)) return null;
    // Keep a wall-stuck hero in place so Wall Breaker can dig out; never abort the load.
    const dir = typeof s.dir === "number" && isFinite(s.dir) ? Math.max(0, Math.min(7, Math.floor(s.dir as number))) : (s.face === -1 ? 6 : 2);
    g.hero = { x: hx, y: hy, ax: hx, ay: hy, face: dirFace(dir), dir, hp: 1, bump: 0, bdx: 0, bdy: 0 };
    const st = calc(g.lvl, g.eq);
    g.hero.hp = Math.max(1, Math.min(st.maxHp, num("hp", -1e12)));
    g.en = Array.isArray(s.en)
      ? (s.en as En[]).filter((e: En) => !!e && typeof e.hp === "number" && e.hp > 0 && typeof e.mhp === "number" && inb(e.x, e.y) && map[e.y * MW + e.x] !== 0 && Array.isArray(e.pal) && e.pal.length === 4 && Array.isArray(e.tr) && typeof e.f === "number" && e.f >= 0 && e.f < FAMS.length && typeof e.name === "string").map((e: En) => ({ ...e, ax: e.x, ay: e.y, bump: 0, hit: 0, burn: Number(e.burn) || 0, burnD: Number(e.burnD) || 0, slow: Number(e.slow) || 0, weak: Number(e.weak) || 0, fear: Number(e.fear) || 0 }))
      : [];
    for (const e of g.en) NID = Math.max(NID, (Number(e.id) || 0) + 1);
    g.pend = [];
    g.chests = Array.isArray(s.chests) ? (s.chests as Chest[]).filter((c: Chest) => !!c && inb(c.x, c.y)).map((c: Chest) => packChest(c)) : [];
    g.drops = Array.isArray(s.drops)
      ? (s.drops as Drop[]).filter((d: Drop) => !!d && inb(d.x, d.y)).map((d: Drop) => ({ x: d.x, y: d.y, pot: !!d.pot, gold: typeof d.gold === "number" ? d.gold : 0, item: d.item ? validItem(d.item) : null })).filter((d: Drop) => d.pot || d.gold > 0 || d.item !== null)
      : [];
    g.muted = s.muted === true;
    g.autoEq = s.autoEq !== false; g.music = s.music !== false; g.autoCombine = s.autoCombine !== false;
    g.wallBreak = s.wallBreak === true; g.cracks = unpackCracks(s.cracks, map);
    g.ward = typeof s.ward === "number" && isFinite(s.ward) ? Math.max(0, s.ward) : 0;
    g.ground = Array.isArray(s.ground) ? (s.ground as Ground[]).filter((q: Ground) => !!q && inb(q.x, q.y) && ELS.includes(q.el) && typeof q.t === "number" && typeof q.dmg === "number").slice(0, 120) : [];
    g.allies = Array.isArray(s.allies) ? (s.allies as Ally[]).filter((a: Ally) => !!a && ELS.includes(a.el) && typeof a.t === "number" && typeof a.pw === "number").map((a: Ally) => ({ t: a.t, el: a.el, pw: a.pw, ph: Number(a.ph) || 0 })).slice(0, 4) : [];
    g.fx = []; g.echo = [];
    g.trader = null;
    g.chestShop = unpackChestShop(s.chestShop);
    g.chestTypes = unpackChestTypes(s.chestTypes);
    g.chestTypeMig = s.chestTypeMig === true;
    migrateChestTypes(g);
    g.merchSub = unpackMerchSub(s.merchSub);
    g.ultAt = typeof s.ultAt === "number" && isFinite(s.ultAt) ? Math.min(s.ultAt, Date.now() + ULT_CD) : 0;
    g.ultAtA = typeof s.ultAtA === "number" && isFinite(s.ultAtA) ? Math.min(s.ultAtA, Date.now() + ULT_CD) : 0;
    g.ultAts = readUltCds(s.ultAts, g.ultAt, g.ultAtA, g.eq, false);
    syncLegacyUlt(g);
    g.floorTurn = typeof s.floorTurn === "number" && isFinite(s.floorTurn) ? Math.floor(s.floorTurn) : 0;
    g.deaths = typeof s.deaths === "number" && isFinite(s.deaths) ? Math.max(0, Math.floor(s.deaths)) : 0;
    const poIn = s.portal as { x: number; y: number; kind?: string } | null | undefined;
    g.portal = poIn && typeof poIn === "object" && typeof poIn.x === "number" && typeof poIn.y === "number" && inb(poIn.x, poIn.y) && map[poIn.y * MW + poIn.x] !== 0 ? { x: Math.floor(poIn.x), y: Math.floor(poIn.y), kind: poIn.kind === "camp" || poIn.kind === "proceed" || poIn.kind === "vault" ? poIn.kind : undefined } : null;
    g.vault = typeof s.vault === "string" && s.vault.length < 600000 ? s.vault : null;
    if (g.vault && !g.portal) { for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const x = hx + ox, y = hy + oy; if (inb(x, y) && map[y * MW + x] !== 0) { g.portal = { x, y }; break; } } if (!g.portal) g.vault = null; }
    g.gobT = typeof s.gobT === "number" && isFinite(s.gobT) ? Math.max(0, s.gobT) : 0;
    if (typeof s.locked === "boolean") g.locked = s.locked;
    g.mmBig = false; g.shopOpen = false; g.stashOpen = false; g.gambOpen = false;
    g.area = s.area === "camp" || s.area === "vault" ? s.area : "dungeon";
    g.actCleared = typeof s.actCleared === "number" && isFinite(s.actCleared) ? Math.max(0, Math.floor(s.actCleared)) : 0;
    g.actCampAt = typeof s.actCampAt === "number" && isFinite(s.actCampAt) ? Math.max(0, Math.floor(s.actCampAt)) : 0;
    g.front = typeof s.front === "number" && isFinite(s.front) ? Math.max(g.depth, Math.floor(s.front)) : g.depth;
    g.snapPrev = unpackFloorSnap(s.snapPrev);
    g.snapCur = unpackFloorSnap(s.snapCur);
    g.gemBag = Array.isArray(s.gemBag) ? (s.gemBag as unknown[]).map((o: unknown) => validItem(o)).filter((x: Item | null): x is Item => x !== null) : [];
    if (typeof s.bagCap === "number" && isFinite(s.bagCap)) g.bagCap = Math.max(BAG, Math.floor(s.bagCap));
    if (typeof s.gemCap === "number" && isFinite(s.gemCap)) g.gemCap = Math.max(GEM_BAG, Math.floor(s.gemCap));
    migrateGemsToBag(g);
    const pt = (o: unknown): { x: number; y: number } | undefined => {
      const p = o as { x?: number; y?: number } | null;
      return p && typeof p === "object" && typeof p.x === "number" && typeof p.y === "number" && inb(p.x, p.y) ? { x: Math.floor(p.x), y: Math.floor(p.y) } : undefined;
    };
    g.campSpot = pt(s.campSpot); g.stashAt = pt(s.stashAt); g.restAt = pt(s.restAt); g.fireAt = pt(s.fireAt);
    g.gambler = null;
    if (g.area === "camp") placeMerchant(g);
    const fromSaveItems = Array.isArray(s.stash) ? (s.stash as unknown[]).map((o: unknown) => validItem(o)).filter((x: Item | null): x is Item => x !== null) : [];
    const fromSaveGold = typeof s.stashGold === "number" && isFinite(s.stashGold) ? Math.max(0, Math.floor(s.stashGold)) : 0;
    const savedBank = typeof s.bankGold === "number" && isFinite(s.bankGold) ? Math.max(0, Math.floor(s.bankGold)) : undefined;
    attachBank(g, fromSaveItems, fromSaveGold, savedBank);
    if (typeof s.best === "number" && s.best > g.best) g.best = Math.floor(s.best);
    if (typeof s.bestLvl === "number" && s.bestLvl > g.bestLvl) g.bestLvl = Math.floor(s.bestLvl);
    if (g.depth > g.best) g.best = g.depth;
    if (g.lvl > g.bestLvl) g.bestLvl = g.lvl;
    g.msgs = []; g.banner = null; g.parts = []; g.floats = []; g.shots = [];
    msg(g, "Welcome back! Continuing on depth " + g.depth + ".", "#80ffff");
    fixPrisLoad(g);
    computeVis(g);
    placeTorches(g);
    if (g.area === "camp") { g.seen.fill(1); g.vis.fill(1); }
    migrateActFloor(g);
    if (fromBak && raw) { memSave = raw; lsSet(activeSaveKey(), raw); ssSet(activeSaveKey(), raw); idbPut(activeSaveKey(), raw); saveFlag = true; }
    optimizeEquipped(g);
    return g;
  } catch { return null; }
}

function newGame(prev: Game | null): Game {
  const [best, bestLvl] = loadBest();
  const g: Game = {
    mode: "title", depth: 1, map: new Uint8Array(MW * MH), seen: new Uint8Array(MW * MH), vis: new Uint8Array(MW * MH), theme: 0, tiles: [],
    hero: { x: 1, y: 1, ax: 1, ay: 1, face: 1, dir: 2, hp: baseHp(1), bump: 0, bdx: 0, bdy: 0 }, lvl: 1, xp: 0, gold: 0, gems: 0, potions: 2,
    eq: { head: null, chest: null, arms: null, legs: null, rh: makeItem(1, 0, "sword"), lh: makeItem(1, 0, "shield"), pet: null }, bag: [], thSeen: [],
    en: [], pend: [], chests: [], drops: [], parts: [], floats: [], shots: [], msgs: [], banner: null, turn: 0,
    best: Math.max(best, prev ? prev.best : 0), bestLvl: Math.max(bestLvl, prev ? prev.bestLvl : 0),
    flash: 0, flashC: "#ffffff", shake: 0, regenAcc: 0, kills: 0, lvlFx: 0, deadT: 0, time: 0,
    fx: [], ground: [], allies: [], echo: [], ward: 0, autoEq: prev ? prev.autoEq : true, music: prev ? prev.music : true, autoCombine: prev ? prev.autoCombine !== false : true,
    trader: null, merchant: null, shopOpen: false, gambOpen: false, chestShop: emptyChestShop(), chestTypes: emptyChestTypes(), chestTypeMig: true, merchSub: {}, ultAt: prev ? prev.ultAt : 0, ultAtA: prev ? (prev.ultAtA ?? 0) : 0, ultAts: prev && prev.ultAts ? { ...prev.ultAts } : {}, mmBig: false, toast: 0, saveT: 0, floorTurn: 0, deaths: prev ? prev.deaths || 0 : 0,
    portal: null, vault: null, gobT: 0, locked: prev ? prev.locked : lockDefault(), torches: [],
    area: "dungeon", actCleared: 0, actCampAt: 0, gemBag: [], bagCap: BAG, gemCap: GEM_BAG, stash: [], stashGold: 0, bankGold: 0, stashOpen: false, gambler: null, gambPity: 0,
    front: 1, snapPrev: null, snapCur: null,
    muted: prev ? prev.muted : false, notify: prev ? prev.notify : () => undefined, sfx: prev ? prev.sfx : () => undefined,
    wallBreak: false, cracks: new Array(MW * MH).fill(0),
  };
  attachStash(g);
  genFloor(g);
  placeStarterChest(g);
  g.hero.hp = calc(g.lvl, g.eq).maxHp;
  msg(g, "Find gear, slay monsters, dive deeper!", "#ffd840");
  return g;
}
function placeStarterChest(g: Game): void {
  if (g.depth !== 1 || g.vault || (g.area && g.area !== "dungeon")) return;
  if ((g.chests || []).some((c: Chest) => !!c.starter)) return;
  const hx = g.hero.x, hy = g.hero.y;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  let spot: number[] | null = null;
  for (const [dx, dy] of dirs) {
    const x = hx + dx, y = hy + dy;
    if (!inb(x, y) || g.map[y * MW + x] === 0) continue;
    if (g.map[y * MW + x] === 2 || g.map[y * MW + x] === TILE_UP) continue;
    if (chestAt(g, x, y) || merchAt(g, x, y) || (g.portal && g.portal.x === x && g.portal.y === y)) continue;
    spot = [x, y]; break;
  }
  if (!spot) return;
  const items: Item[] = ARMOR_K.map((k: AK) => { const it = makeItem(1, 0, k); it.rar = 0; return it; });
  g.chests.push({ x: spot[0], y: spot[1], open: false, rar: 0, starter: true, items });
}

// ---------- game logic ----------
// ---------- rare drop FX (Legendary+): chimes, glow pillar, particles (raw31) ----------
const DROP_FX_MIN = 3;
const DROP_PART_CAP = 420;
const DROP_IDLE_CAP = 280;
const DROP_SET_COL = "#40e070";
type ChimeWave = "sine" | "triangle" | "square" | "sawtooth";
type ChimeFilt = "lowpass" | "highpass" | "bandpass" | "notch" | "allpass" | "peaking" | "lowshelf" | "highshelf";
interface ChimeNote { f: number; f2: number; dur: number; typ: ChimeWave; vol: number; delay: number }
interface ChimeNoise { dur: number; vol: number; ftype: ChimeFilt; f0: number; f1: number; delay: number }
interface ChimeSpec { notes: ChimeNote[]; noises: ChimeNoise[] }
function dropFxTier(it: Item | null | undefined): number {
  if (!it) return -1;
  const r = Math.max(0, Math.min(7, it.rar | 0));
  return r >= DROP_FX_MIN ? r : -1;
}
function dropFxKind(it: Item | null | undefined): string {
  const t = dropFxTier(it);
  if (t === 3) return "legendary";
  if (t === 4) return "mythic";
  if (t === 5) return "ethereal";
  if (t === 6) return "relic";
  if (t === 7) return "prismatic";
  return "none";
}
function isDropSet(it: Item | null | undefined): boolean { return !!(it && it.set !== undefined); }
function lootSfxCode(it: Item): number {
  if (it.golden) return 32;
  const r = Math.max(0, Math.min(7, it.rar | 0));
  return r + (isDropSet(it) ? 8 : 0);
}
function lootSfxRar(code: number): number { const c = code | 0; if (c >= 32) return 7; return (c % 8 + 8) % 8; }
function lootSfxSet(code: number): boolean { const c = code | 0; return c >= 8 && c < 16; }
function lootSfxGolden(code: number): boolean { return (code | 0) >= 32; }
function shouldPlayDropSfx(muted: boolean, it: Item | null | undefined): boolean {
  if (muted || !it) return false;
  return dropFxTier(it) >= 0 || isDropSet(it) || !!it.golden;
}
function lootChimeSpec(rar: number, isSet: boolean = false, isGolden: boolean = false): ChimeSpec {
  const r = Math.max(0, Math.min(7, rar | 0));
  const notes: ChimeNote[] = [];
  const noises: ChimeNoise[] = [];
  const add = (f: number, f2: number, dur: number, typ: ChimeWave, vol: number, delay: number): void => { notes.push({ f, f2, dur, typ, vol, delay }); };
  if (isGolden) {
    // Golden Prismatic: warm rising gold fanfare, distinct from Prismatic sparkle
    add(196, 392, 0.22, "sawtooth", 0.03, 0);
    add(247, 494, 0.24, "triangle", 0.034, 0.08);
    add(330, 660, 0.28, "sine", 0.036, 0.16);
    add(392, 784, 0.32, "triangle", 0.034, 0.24);
    add(523, 1047, 0.4, "sine", 0.03, 0.34);
    add(784, 1568, 0.55, "sine", 0.028, 0.44);
    noises.push({ dur: 0.5, vol: 0.045, ftype: "bandpass", f0: 900, f1: 1800, delay: 0 });
    noises.push({ dur: 0.4, vol: 0.03, ftype: "lowpass", f0: 2400, f1: 800, delay: 0.2 });
    return { notes, noises };
  }
  if (isSet) {
    // Set Relic: unique leafy green chime, not the red relic fanfare
    add(523, 523, 0.16, "sine", 0.036, 0);
    add(659, 698, 0.2, "triangle", 0.034, 0.1);
    add(784, 784, 0.24, "sine", 0.032, 0.2);
    add(1047, 1175, 0.32, "sine", 0.028, 0.32);
    add(1319, 1319, 0.28, "triangle", 0.022, 0.44);
    noises.push({ dur: 0.35, vol: 0.03, ftype: "bandpass", f0: 1800, f1: 900, delay: 0.05 });
    return { notes, noises };
  }
  if (r === 3) {
    // Legendary: bright 2-note chime
    add(784, 784, 0.16, "triangle", 0.048, 0);
    add(1175, 1175, 0.22, "sine", 0.042, 0.11);
  } else if (r === 4) {
    // Mythic: richer 3-note arpeggio plus a high bell
    add(659, 659, 0.18, "triangle", 0.04, 0);
    add(830, 830, 0.2, "triangle", 0.038, 0.09);
    add(1245, 1245, 0.24, "sine", 0.036, 0.18);
    add(1661, 2093, 0.32, "sine", 0.02, 0.3);
  } else if (r === 5) {
    // Ethereal: airy overlapping bells and a soft wisp of noise
    add(880, 990, 0.28, "sine", 0.036, 0);
    add(1320, 1320, 0.34, "sine", 0.034, 0.08);
    add(1760, 1980, 0.4, "triangle", 0.028, 0.16);
    add(2200, 1760, 0.45, "sine", 0.022, 0.24);
    noises.push({ dur: 0.5, vol: 0.03, ftype: "bandpass", f0: 2600, f1: 900, delay: 0.04 });
  } else if (r === 6) {
    // Relic: deep undertone plus a 5-note bell arpeggio
    add(98, 72, 0.7, "sine", 0.05, 0);
    add(523, 523, 0.2, "triangle", 0.04, 0.04);
    add(659, 659, 0.22, "triangle", 0.038, 0.13);
    add(784, 784, 0.24, "sine", 0.036, 0.22);
    add(1047, 1047, 0.28, "sine", 0.034, 0.31);
    add(1319, 1568, 0.4, "triangle", 0.03, 0.4);
    noises.push({ dur: 0.28, vol: 0.035, ftype: "lowpass", f0: 900, f1: 180, delay: 0 });
  } else if (r === 7) {
    // Prismatic: shimmering multi-layer fanfare
    const seq = [523, 659, 784, 988, 1175, 1568, 2093, 2637];
    for (let i = 0; i < seq.length; i++) {
      add(seq[i], seq[i] * 1.02, 0.22 + i * 0.02, "triangle", 0.028, i * 0.055);
      add(seq[i] * 2, seq[i] * 2.04, 0.18, "sine", 0.016, 0.04 + i * 0.055);
    }
    add(2093, 3136, 0.55, "sine", 0.024, 0.2);
    add(1319, 2637, 0.7, "triangle", 0.02, 0.28);
    noises.push({ dur: 0.55, vol: 0.04, ftype: "bandpass", f0: 3200, f1: 700, delay: 0 });
    noises.push({ dur: 0.35, vol: 0.03, ftype: "highpass", f0: 5000, f1: 2000, delay: 0.18 });
  } else {
    const scale = [440, 523, 659, 784, 880, 1047, 1319];
    for (let i = 0; i <= Math.min(6, r); i++) add(scale[i], scale[i], 0.1, r >= 3 ? "square" : "triangle", 0.03, i * 0.07);
  }
  return { notes, noises };
}
function dropBurstPlan(rar: number, isSet: boolean, isGolden: boolean = false): { n: number; cols: string[]; sp: number; grav: number; kind: number; extra: number } {
  const r = Math.max(0, Math.min(7, rar | 0));
  let n = 0, kind = 1, sp = 70, grav = 40;
  let cols: string[] = [RC[r] || GOLD, "#ffffff"];
  if (isGolden) { n = 34; kind = 5; cols = [GOLD, "#fff8c0", "#ffe080", "#ffffff", "#ffb040"]; sp = 140; grav = 10; return { n, cols, sp, grav, kind, extra: 10 }; }
  if (isSet) { n = 24; kind = 3; cols = ["#40e070", "#e8ffe8", "#80ffb0", "#ffffff"]; sp = 110; grav = 25; return { n, cols, sp, grav, kind, extra: 10 }; }
  if (r === 3) { n = 12; kind = 1; cols = [RC[3], GOLD, "#ffffff"]; sp = 80; grav = 30; }
  else if (r === 4) { n = 16; kind = 2; cols = [RC[4], "#ffffff", "#e0a0ff"]; sp = 90; grav = 20; }
  else if (r === 5) { n = 18; kind = 4; cols = [RC[5], "#e8ffff", "#ffffff"]; sp = 50; grav = -40; }
  else if (r === 6) { n = 22; kind = 2; cols = [RC[6], "#ff8020", GOLD, "#ffffff"]; sp = 100; grav = 50; }
  else if (r === 7) { n = 28; kind = 5; cols = ["#ff4040", "#ffd040", "#40ff60", "#40d0ff", "#a060ff", "#ff40c0", "#ffffff"]; sp = 120; grav = 20; }
  const extra = isSet ? 6 : 0;
  return { n, cols, sp, grav, kind, extra };
}
function announceDrop(g: Game, it: Item, x: number, y: number): void {
  if (!it) return;
  if (onItemDropped) onItemDropped(it);
  if (shouldPlayDropSfx(g.muted, it)) g.sfx("loot", lootSfxCode(it));
  const plan = dropBurstPlan(it.rar, isDropSet(it), !!it.golden);
  if (plan.n <= 0 && plan.extra <= 0) return;
  const px = x * TS + 12, py = y * TS + 12;
  const room = Math.max(0, DROP_PART_CAP - g.parts.length);
  let left = Math.min(plan.n, room);
  for (let i = 0; i < left; i++) {
    const an = R() * 6.2832, v = plan.sp * (0.3 + R() * 0.7), life = 0.45 + R() * 0.55;
    g.parts.push({ x: px, y: py, vx: Math.cos(an) * v, vy: Math.sin(an) * v - plan.sp * 0.25, life, max: life, c: pick(plan.cols), s: R() < 0.35 ? 2 : 1.4, g: plan.grav, k: plan.kind });
  }
  left = Math.min(plan.extra, Math.max(0, DROP_PART_CAP - g.parts.length));
  for (let i = 0; i < left; i++) {
    const an = R() * 6.2832, v = 36 * (0.4 + R() * 0.6), life = 0.7 + R() * 0.5;
    g.parts.push({ x: px, y: py, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 28, life, max: life, c: R() < 0.4 ? "#e8ffe8" : DROP_SET_COL, s: 1.6, g: -18, k: 3 });
  }
}
function idleDropFx(g: Game, dt: number): void {
  if (g.mode !== "play" || g.parts.length >= DROP_IDLE_CAP) return;
  const rate = Math.min(1, dt * 60);
  for (const dr of g.drops) {
    if (g.parts.length >= DROP_IDLE_CAP) return;
    if (!dr.item) continue;
    if (!g.vis[dr.y * MW + dr.x]) continue;
    const it = dr.item;
    const tier = dropFxTier(it);
    const setp = isDropSet(it);
    if (tier < 0 && !setp) continue;
    if (R() >= (0.07 + Math.max(0, tier) * 0.015 + (setp ? 0.03 : 0)) * rate) continue;
    const plan = dropBurstPlan(it.rar, setp, !!it.golden);
    const px = dr.x * TS + 12 + (R() - 0.5) * 10, py = dr.y * TS + 10 + (R() - 0.5) * 8;
    const up = plan.kind === 4 || plan.kind === 3 || setp;
    const life = 0.5 + R() * 0.5;
    g.parts.push({ x: px, y: py, vx: (R() - 0.5) * 14, vy: up ? -16 - R() * 14 : -8 - R() * 10, life, max: life, c: setp && R() < 0.5 ? DROP_SET_COL : pick(plan.cols), s: 1.3, g: up ? -8 : 12, k: setp && R() < 0.55 ? 3 : plan.kind });
  }
}
function colAlpha(hex: string, a: number): string {
  if (hex.charAt(0) === "#" && (hex.length === 7 || hex.length === 4)) {
    let h = hex.slice(1);
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    const n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  return hex;
}
function dropBeam(ctx: CanvasRenderingContext2D, cx: number, cy: number, col: string, t: number, hgt: number, sway: number, thick: number, a: number): void {
  const top = cy - hgt;
  const sw = Math.sin(t) * sway;
  ctx.beginPath();
  ctx.moveTo(cx + sw * 0.3 - thick * 0.22, top);
  ctx.quadraticCurveTo(cx + sw, cy - hgt * 0.45, cx - thick * 0.12, cy + 2);
  ctx.quadraticCurveTo(cx, cy + 6, cx + thick * 0.12, cy + 2);
  ctx.quadraticCurveTo(cx + sw * 1.1, cy - hgt * 0.45, cx + sw * 0.3 + thick * 0.22, top);
  ctx.closePath();
  const grd = ctx.createLinearGradient(cx, top, cx, cy + 8);
  grd.addColorStop(0, colAlpha(col, 0));
  grd.addColorStop(0.22, colAlpha(col, a * 0.55));
  grd.addColorStop(0.72, colAlpha(col, a));
  grd.addColorStop(1, colAlpha(col, 0.04));
  ctx.fillStyle = grd;
  ctx.fill();
}
function dropGlow(ctx: CanvasRenderingContext2D, sx: number, sy: number, it: Item, t: number, ox: number): void {
  const tier = dropFxTier(it);
  const setp = isDropSet(it);
  if (tier < 0 && !setp) return;
  const bounce = Math.round(Math.sin(t * 3 + ox) * 1.5);
  const cx = sx + 12, cy = sy + 11 + bounce;
  const pulse = 0.55 + 0.45 * Math.sin(t * (tier >= 6 ? 5 : 3.2));
  ctx.save();
  if (it.golden) {
    const col = GOLD;
    const rad = 13 + pulse * 6;
    const halo = ctx.createRadialGradient(cx, cy, 1.5, cx, cy, rad);
    halo.addColorStop(0, colAlpha(col, 0.7 + 0.2 * pulse));
    halo.addColorStop(0.45, colAlpha("#fff8c0", 0.28 + 0.1 * pulse));
    halo.addColorStop(1, colAlpha(col, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 6.2832); ctx.fill();
    dropBeam(ctx, cx, cy, col, t * 2.2, 46 + pulse * 8, 3.2, 7, 0.5 + 0.15 * pulse);
    dropBeam(ctx, cx - 3, cy, "#fff8c0", t * 1.7, 38, 2.2, 4, 0.3);
    dropBeam(ctx, cx + 3, cy, "#ffb040", t * 1.9, 38, 2.2, 4, 0.3);
  } else if (tier >= 0) {
    const col = tier >= 7 ? "hsl(" + Math.floor((t * 160) % 360) + ",100%,62%)" : RC[tier];
    const rad = 11 + pulse * (3 + tier * 0.6);
    const halo = ctx.createRadialGradient(cx, cy, 1.5, cx, cy, rad);
    halo.addColorStop(0, colAlpha(col, 0.55 + 0.2 * pulse));
    halo.addColorStop(0.45, colAlpha(col, 0.22 + 0.1 * pulse));
    halo.addColorStop(1, colAlpha(col, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 6.2832); ctx.fill();
    const hgt = 28 + tier * 5 + pulse * 6;
    dropBeam(ctx, cx, cy, tier >= 7 ? "#ffffff" : col, t * 2.1, hgt, 2 + tier * 0.3, 5 + tier * 0.4, 0.4 + 0.15 * pulse);
    if (tier >= 7) {
      for (let i = 0; i < 3; i++) {
        const hue = "hsl(" + Math.floor((t * 140 + i * 120) % 360) + ",100%,62%)";
        dropBeam(ctx, cx + (i - 1) * 2.2, cy, hue, t * 2.4 + i, hgt + 10, 3 + i, 3.2, 0.28);
      }
    } else if (tier >= 5) {
      dropBeam(ctx, cx, cy, "#ffffff", t * 1.6 + 1.2, hgt * 0.75, 1.4, 2.4, 0.18);
    }
  }
  if (setp) {
    const rad = 10 + pulse * 3;
    const halo = ctx.createRadialGradient(cx, cy, 1, cx, cy, rad + 3);
    halo.addColorStop(0, colAlpha(DROP_SET_COL, 0.4));
    halo.addColorStop(1, colAlpha(DROP_SET_COL, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, rad + 3, 0, 6.2832); ctx.fill();
    dropBeam(ctx, cx, cy, DROP_SET_COL, t * 1.8 + 0.7, 26 + pulse * 5, 2.4, 3.4, 0.32);
  }
  ctx.restore();
}
function drawPart(ctx: CanvasRenderingContext2D, p: Part, camX: number, camY: number): void {
  const x = p.x - camX, y = p.y - camY;
  ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
  ctx.fillStyle = p.c;
  if (!p.k) {
    if (p.ang != null) {
      ctx.save();
      ctx.translate(x + p.s * 0.5, y + p.s * 0.5);
      ctx.rotate(p.ang);
      ctx.fillRect(-p.s * 0.5, -p.s * 0.5, p.s, p.s);
      ctx.restore();
      return;
    }
    ctx.fillRect(Math.round(x), Math.round(y), p.s, p.s); return;
  }

  const s = Math.max(1.2, p.s);
  if (p.k === 1 || p.k === 5) {
    ctx.beginPath(); ctx.moveTo(x, y - s - 1); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s + 1); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill();
  } else if (p.k === 3) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.vx * 0.08);
    ctx.beginPath(); ctx.scale(0.55, 1.15); ctx.arc(0, 0, s * 1.15, 0, 6.2832); ctx.fill();
    ctx.restore();
  } else {
    ctx.beginPath(); ctx.arc(x, y, s * (p.k === 4 ? 1.55 : 1.15), 0, 6.2832); ctx.fill();
  }
}

function lootFx(g: Game, it: Item, auto: boolean = false): void {
  const h = g.hero;
  const cx = h.ax * TS + 12, cy = h.ay * TS + 12;
  const nameCol = it.golden ? GOLD : isDropSet(it) ? DROP_SET_COL : RC[it.rar];
  const rarLab = it.golden ? "Golden Prismatic" : isDropSet(it) ? "Set Relic" : RT[it.rar];
  const sockN = it.sk ? it.sk.length : 0;
  const sockLab = sockN ? ", " + sockN + " socket" + (sockN === 1 ? "" : "s") : "";
  msg(g, (auto ? "Auto-equipped: " : "Found: ") + it.name + " (" + rarLab + sockLab + ")", nameCol);
  if (dropFxTier(it) < 0 && !isDropSet(it) && !it.golden) g.sfx("loot", it.rar);
  if (it.golden) {
    setBanner(g, "GOLDEN PRISMATIC!", (auto ? "Auto-equipped: " : "") + it.name, GOLD, 8, 5.2);
    g.flash = 1.0; g.flashC = GOLD; g.shake = 12;
    burst(g, cx, cy, 260, [GOLD, "#fff8c0", "#ffe080", "#ffffff", "#ffb040"], 200, 30);
    return;
  }
  if (isDropSet(it)) {
    setBanner(g, "SET RELIC", (auto ? "Auto-equipped: " : "") + it.name, DROP_SET_COL, 6, 4.2);
    g.flash = 0.75; g.flashC = DROP_SET_COL; g.shake = 7;
    burst(g, cx, cy, 180, [DROP_SET_COL, "#e8ffe8", "#80ffb0", "#ffffff"], 160, 50);
    return;
  }
  if (it.rar >= 7) {
    setBanner(g, "!!! " + RT[7].toUpperCase() + " DROP !!!", (auto ? "Auto-equipped: " : "") + it.name, RC[7], 7, 5);
    g.flash = 0.9; g.flashC = "#ffffff"; g.shake = 10;
    burst(g, cx, cy, 220, ["#ff4040", "#ffd040", "#40ff60", "#40d0ff", "#a060ff", "#ff40c0", "#ffffff"], 180, 40);
    return;
  }
  if (auto && it.rar < 6) {
    setBanner(g, "AUTO-EQUIPPED" + (it.rar >= 3 ? " " + RT[it.rar].toUpperCase() + "!" : ""), it.name, RC[it.rar], it.rar, it.rar >= 3 ? 3 : 2);
    if (it.rar >= 3) burst(g, cx, cy, 30 + it.rar * 12, [RC[it.rar], "#ffffff", GOLD], 90, 30);
    if (it.rar >= 5) { g.flash = 0.35; g.flashC = RC[it.rar]; }
    return;
  }
  if (it.rar >= 6) {
    setBanner(g, "*** " + RT[6].toUpperCase() + " DROP! ***", (auto ? "Auto-equipped: " : "") + it.name, RC[6], 6, 4);
    g.flash = 0.7; g.flashC = "#ff3030"; g.shake = 7;
    burst(g, cx, cy, 160, ["#ff3030", "#ff8020", "#ffe040", "#ffffff"], 160, 60);
  } else if (it.rar >= 3) {
    setBanner(g, RT[it.rar].toUpperCase() + " DROP!", it.name, RC[it.rar], it.rar, 3);
    burst(g, cx, cy, 30 + it.rar * 12, [RC[it.rar], "#ffffff", GOLD], 90, 30);
    if (it.rar >= 5) { g.flash = 0.35; g.flashC = RC[it.rar]; }
  } else {
    setBanner(g, RT[it.rar] + " item", it.name, RC[it.rar], it.rar, 1.8);
  }
}

// Mass salvage: turns every UNEQUIPPED non-gem bag item into gold (same per-item value as single salvage).
// Equipped gear, the gem bag, and any kind==="gem" items in the bag are never touched.
function isLowSalvageItem(it: Item): boolean {
  return it.rar <= 2 && it.kind !== "gem" && it.kind !== "pet";
}
function bagHasMassSalvage(g: Game): boolean {
  return g.bag.some((it: Item) => it.kind !== "gem");
}
function bagHasLowSalvage(g: Game): boolean {
  return g.bag.some((it: Item) => isLowSalvageItem(it));
}
function salvageBagItems(g: Game, pred: (it: Item) => boolean, verb: string, banner: string): { n: number; gold: number } {
  const kept: Item[] = [];
  const items: Item[] = [];
  for (const it of g.bag) {
    if (!pred(it)) { kept.push(it); continue; }
    kept.push(...popSocketGems(it));
    items.push(it);
  }
  let gold = 0;
  for (const it of items) gold += salvageVal(it);
  g.bag = kept.slice();
  g.gold += gold;
  runAutoCombine(g);
  if (items.length) {
    g.sfx("coin");
    msg(g, verb + " " + items.length + " item" + (items.length === 1 ? "" : "s") + " for +" + gold + "g", GOLD);
    setBanner(g, banner, items.length + " item" + (items.length === 1 ? "" : "s") + " \u2192 +" + gold + " gold", GOLD, 9, 2.4);
  }
  saveGame(g);
  return { n: items.length, gold };
}
function massSalvage(g: Game): { n: number; gold: number } {
  return salvageBagItems(g, (it: Item) => it.kind !== "gem", "Mass salvaged", "MASS SALVAGE");
}
// Salvage Low: bag armor / weapons / shields of rarity Gray, Magic, or Rare only. Never gems, pets, or equipped items.
function lowSalvage(g: Game): { n: number; gold: number } {
  return salvageBagItems(g, isLowSalvageItem, "Salvaged low", "SALVAGE LOW");
}
function salvageQuality(it: Item, lvl: number): number {
  return isGem(it) ? gemQ(it.rar) : itemPower(it, lvl);
}
function salvageStars(it: Item): number { return it.st ? it.st.length : 0; }
function salvageWorse(a: Item, b: Item, lvl: number): boolean {
  // True if a is the worse keep (salvaged first). Nothing is un-salvageable.
  // Lowest rarity first (set relics compete as Relic / their real rar). Then quality:
  // fewer stars, then non-Golden before Golden of the same stars, then lowest ilvl, then itemPower / gemQ.
  if (a.rar !== b.rar) return a.rar < b.rar;
  const ra = salvageStars(a) * 2 + (a.golden ? 1 : 0), rb = salvageStars(b) * 2 + (b.golden ? 1 : 0);
  if (ra !== rb) return ra < rb;
  if (a.ilvl !== b.ilvl) return a.ilvl < b.ilvl;
  const qa = salvageQuality(a, lvl), qb = salvageQuality(b, lvl);
  return qa < qb;
}
function pickAutoSalvage(bag: Item[], incoming: Item, lvl: number, _keepCombine?: boolean): number {
  // Consider every item in the bag PLUS the incoming item (if it is not already in the bag).
  // Return the bag index to evict, or -1 to evict incoming. Every item is eligible.
  let bestI = -1;
  let best: Item | null = null;
  const inBag = bag.indexOf(incoming) >= 0;
  for (let i = 0; i < bag.length; i++) {
    const it = bag[i];
    if (!best || salvageWorse(it, best, lvl)) { best = it; bestI = i; }
  }
  if (!inBag) {
    if (!best || salvageWorse(incoming, best, lvl)) return -1;
  }
  return bestI;
}
function ensureGemBag(g: Game): Item[] { if (!g.gemBag) g.gemBag = []; return g.gemBag; }
function destBag(g: Game, it: Item): Item[] { return isGem(it) ? ensureGemBag(g) : g.bag; }
function destCap(g: Game, it: Item): number { return isGem(it) ? (g.gemCap ?? GEM_BAG) : (g.bagCap ?? BAG); }
function bagGridRows(cap: number): number { return Math.max(1, Math.ceil(Math.max(0, cap) / INV_COLS)); }
function fitBagCap(need: number, cap: number, base: number): number {
  let c = Math.max(base, cap);
  while (c < need) c += BAG_GROW;
  return c;
}
function syncBagCaps(g: Game): void {
  g.bagCap = fitBagCap(g.bag.length, g.bagCap ?? BAG, BAG);
  g.gemCap = fitBagCap(ensureGemBag(g).length, g.gemCap ?? GEM_BAG, GEM_BAG);
}
function ensureBagCapacity(g: Game, isGemBag: boolean, need: number): void {
  const base = isGemBag ? GEM_BAG : BAG;
  const cap = isGemBag ? (g.gemCap ?? GEM_BAG) : (g.bagCap ?? BAG);
  const next = fitBagCap(need, cap, base);
  if (next > cap) {
    if (isGemBag) g.gemCap = next; else g.bagCap = next;
    const line = isGemBag ? ("Gem bag expanded to " + next + " slots!") : ("Bag expanded to " + next + " slots!");
    msg(g, line, GOLD);
  } else if (isGemBag) {
    g.gemCap = cap;
  } else {
    g.bagCap = cap;
  }
}
function wouldCompleteCombineBag(bag: Item[], it: Item): boolean {
  const k = combineKey(it);
  if (!k) return false;
  let n = 0;
  for (const x of bag) if (combineKey(x) === k) n++;
  return n >= 2;
}
function bagWouldKeep(g: Game, it: Item): boolean {
  return true;
}
function showLootToast(g: Game, txt: string): void {
  g.lootToast = 1.8;
  g.lootToastTxt = txt;
}
function noteAutoSalvage(g: Game, it: Item, gold: number, x: number, y: number): void {
  const line = "Bag full - salvaged " + it.name + " +" + fmtg(gold);
  floatTxt(g, x, y - 0.35, "Salvaged " + it.name + " +" + fmtg(gold), GOLD);
  showLootToast(g, line);
  msg(g, line, "#c8c0a0");
}
// Gem quality tiers map 1:1 onto the item rarity ladder (same rar index). Legendary-equivalent is rar >= 3 (Bright+).
//   Chipped=Normal(0), Fine=Magic(1), Clear=Rare(2), Bright=Legendary(3),
//   Vivid=Mythic(4), Royal=Ethereal(5), Imperial=Relic(6), Prismatic=Prismatic(7).
const RAR_STASH = 3;
function isStashRarity(it: Item): boolean { return it.rar >= RAR_STASH; }
function runStashGemCombine(g: Game): number { return 0; }
function stashHasRoom(g: Game): boolean { return false; }
function salvageOverflowItem(g: Game, it: Item, x: number, y: number, stashFull: boolean): void {
  const gems = popSocketGems(it);
  const v = salvageVal(it);
  g.gold += v;
  if (stashFull) {
    const line = "Bag full - stash full, salvaged " + it.name + " +" + fmtg(v);
    floatTxt(g, x, y - 0.35, "Salvaged " + it.name + " +" + fmtg(v), GOLD);
    showLootToast(g, line);
    msg(g, line, "#c8c0a0");
  } else {
    noteAutoSalvage(g, it, v, x, y);
  }
  for (const gem of gems) placeGem(g, gem, x, y);
}
function overflowStashFull(g: Game, it: Item, x: number, y: number): "stash" | "salvage" {
  // Stash is at cap: salvage the lowest-ranked item among the stash PLUS the pick, then
  // put the pick in the stash if it was not itself the lowest. Even a Prismatic can be
  // salvaged in the all-full case, but it is always the lowest one.
  if (!g.stash) g.stash = [];
  let worstI = -1;
  let worst: Item = it;
  for (let i = 0; i < g.stash.length; i++) {
    if (salvageWorse(g.stash[i], worst, g.lvl)) { worst = g.stash[i]; worstI = i; }
  }
  if (worstI < 0) {
    salvageOverflowItem(g, it, x, y, true);
    return "salvage";
  }
  g.stash.splice(worstI, 1);
  g.stash.push(it);
  persistStash(g);
  runStashGemCombine(g);
  runAutoCombine(g);
  salvageOverflowItem(g, worst, x, y, true);
  return "stash";
}
function overflowDispose(g: Game, it: Item, x: number, y: number): "stash" | "salvage" {
  salvageOverflowItem(g, it, x, y, false);
  return "salvage";
}
function evictOverflow(g: Game, bag: Item[], victim: Item, x: number, y: number): void {
  const idx = bag.indexOf(victim);
  if (idx >= 0) bag.splice(idx, 1);
  // Keep sockets when the victim itself goes to the stash; pop them only on the item that is actually salvaged.
  overflowDispose(g, victim, x, y);
}
function placeGem(g: Game, gem: Item, x: number, y: number): void {
  const gb = ensureGemBag(g);
  ensureBagCapacity(g, true, gb.length + 1);
  if (autoCombineOn(g) && wouldCompleteCombineBag(gb, gem)) { gb.push(gem); runAutoCombine(g); sortInventory(g); return; }
  gb.push(gem);
  sortInventory(g);
}
function takeItemOrSalvage(g: Game, it: Item, x: number, y: number): boolean {
  if (autoCombineOn(g)) runAutoCombine(g);
  const bag = destBag(g, it);
  ensureBagCapacity(g, isGem(it), bag.length + 1);
  bag.push(it); lootFx(g, it);
  runAutoCombine(g);
  sortInventory(g);
  return true;
}
function giveItem(g: Game, it: Item, x: number, y: number): void {
  it = maybeSet(it);
  announceDrop(g, it, x, y);
  takePickedItem(g, it, x, y);
}
function migrateGemsToBag(g: Game): void {
  const gb = ensureGemBag(g);
  const keep: Item[] = [];
  for (const it of g.bag) {
    if (isGem(it)) gb.push(it); else keep.push(it);
  }
  g.bag = keep;
  syncBagCaps(g);
  sortInventory(g);
}

function lvlUpBeamRect(hsx: number, hsy: number): { x: number; y: number; w: number; h: number } {
  // Top is always y=0 of the visible canvas/viewport; bottom is the hero's current on-screen y.
  return { x: hsx + 2, y: 0, w: 20, h: Math.max(0, Math.round(hsy)) };
}
function gainXp(g: Game, n: number): void {
  g.xp += n;
  while (g.xp >= xpNeed(g.lvl)) {
    g.xp -= xpNeed(g.lvl);
    g.lvl++;
    const after = calc(g.lvl, g.eq).maxHp;
    g.hero.hp = after;
    g.lvlFx = 1.6;
    setBanner(g, "LEVEL UP!  Lv " + g.lvl, "+10 Max HP  \u00b7  Attack " + baseAtk(g.lvl - 1) + " \u2192 " + baseAtk(g.lvl), GOLD, 5, 2.5);
    burst(g, g.hero.ax * TS + 12, g.hero.ay * TS + 12, 70, [GOLD, "#ffffff", "#fff0a0"], 110, -20);
    msg(g, "Level up! You are now level " + g.lvl + ".", GOLD);
    g.sfx("lvl");
    if (g.lvl > g.bestLvl) { g.bestLvl = g.lvl; saveBest(g); }
    saveGame(g);
  }
}

function kill(g: Game, e: En): void {
  const d = g.depth;
  const cx = e.ax * TS + 12, cy = e.ay * TS + 12;
  g.kills++;
  petHarvestOnKill(g);
  const gm = efGoldMul(g, e);
  const gibDir = hitDirOf(g, e);
  if (e.act) actBossDeathFx(g, e, gibDir);
  else burstGib(g, cx, cy, e.cls === 2 ? 90 : 18, [e.pal[0], e.pal[1], e.pal[2]], e.cls === 2 ? 120 : 60, 80, gibDir.dx, gibDir.dy);
  floatTxt(g, e.x, e.y - 0.4, "+" + e.xp + " XP", "#b090ff");
  if (!e.act) g.sfx(e.cls === 2 ? "boss" : "kill");
  gainXp(g, Math.round(e.xp * (1 + 0.1 * efP(g, 72))));
  const mf = efP(g, 54);
  const drop = (it: Item): void => { it = maybeSet(it); const mfAll = mf + gemMagicFind(g); if (mfAll > 0 && it.rar < 5 && R() < efc(0.06, mfAll)) { it.rar++; floatTxt(g, e.x, e.y - 1.3, "MAGIC FIND!", RC[it.rar]); } announceDrop(g, it, e.x, e.y); g.drops.push({ x: e.x, y: e.y, item: it, pot: false, gold: 0 }); };
  const gold = (mul: number): void => { const n = Math.max(1, Math.round((14 + d * 6.8) * (0.6 + R() * 0.8) * mul * gm * gemGoldMul(g))); g.gold += n; floatTxt(g, e.x, e.y - 0.9, "+" + n + "g", GOLD); g.sfx("coin"); };
  if (e.child) { /* split spawn: no loot */ }
  else if (e.gob === 2) {
    const n = Math.max(2, Math.min(6, Math.round(2 + d * 0.08 + R() * 2)));
    for (let i = 0; i < n; i++) giveDroppedGem(g, e.x, e.y, d, true);
    runAutoCombine(g);
    burstGib(g, cx, cy, 90, ["#40e0ff", "#ff60e0", "#ffffff", GOLD], 140, 50, gibDir.dx, gibDir.dy);
    g.sfx("sparkle"); g.sfx("gob");
    setBanner(g, "GEM GOBLIN SLAIN!", n + " gemstones!", "#40e0ff", 5, 3);
    msg(g, "You caught the Gem Goblin! " + n + " gemstones", "#40e0ff");
    g.gobT = 0;
  } else if (e.gob === 3) {
    const gg = goldGoblinPayout(d, g);
    g.gold += gg; floatTxt(g, e.x, e.y - 0.9, "+" + gg + "g", GOLD);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const [ox, oy] of dirs) {
      const nx = e.x + ox, ny = e.y + oy;
      if (!inb(nx, ny) || g.map[ny * MW + nx] === 0) continue;
      g.drops.push({ x: nx, y: ny, item: null, pot: false, gold: Math.max(200, Math.round(gg * (0.04 + R() * 0.04))) });
    }
    burstGib(g, cx, cy, 220, [GOLD, "#fff8c0", "#ffffff", "#ffb040", "#ffe080"], 240, 70, gibDir.dx, gibDir.dy);
    burstGib(g, cx, cy - 8, 140, [GOLD, "#ffffff", "#ffe080"], 200, 90, gibDir.dx, gibDir.dy);
    g.sfx("coin"); g.sfx("sparkle"); g.sfx("coin");
    setBanner(g, "GOLD GOBLIN SLAIN!", "A rain of coins! +" + gg + " gold!", GOLD, 7, 3.4);
    msg(g, "You caught the Gold Goblin! +" + gg + " gold", GOLD);
    drop(makeItem(d + 1, jackpotRar(d)));
    g.gobT = 0;
  } else if (e.gob || e.hunt) {
    const n = 3 + ri(3);
    for (let i = 0; i < n; i++) { const r = jackpotRar(d); drop(makeItem(d + 1, r)); }
    const gg = Math.round(Math.min(6000, Math.max(2000, (2000 + d * 80) * (0.9 + R() * 0.2))));
    g.gold += gg; floatTxt(g, e.x, e.y - 0.9, "+" + gg + "g", GOLD);
    burstGib(g, cx, cy, 70, [GOLD, "#ffffff", "#fff0a0", "#40ff60"], 130, 50, gibDir.dx, gibDir.dy);
    g.sfx("sparkle"); g.sfx("coin");
    if (e.hunt) {
      setBanner(g, "HUNTER SLAIN!", n + " treasures + " + gg + " gold", "#e040ff", 8, 3.2);
      msg(g, "You slew " + e.name + "! +" + gg + " gold", "#e080ff");
      g.shake = 8; g.flash = 0.45; g.flashC = "#e040ff";
    } else {
      setBanner(g, "LOOT GOBLIN SLAIN!", n + " treasures + " + gg + " gold", GOLD, 5, 3);
      msg(g, "You caught the Loot Goblin! +" + gg + " gold", GOLD);
      g.gobT = 0;
    }
  }
  else if (e.rare) { if (R() < 0.32) drop(makeItem(d, rollRar(1.12, 0, d))); if (R() < POT_CH_RARE) g.drops.push({ x: e.x, y: e.y, item: null, pot: true, gold: 0 }); gold(1.7); }
  else if (e.cls === 0) { if (R() < 0.12) drop(makeItem(d, rollRar(1, 0, d))); if (R() < POT_CH_NORM) g.drops.push({ x: e.x, y: e.y, item: null, pot: true, gold: 0 }); gold(e.name.startsWith("Brute ") ? 2.5 : 1); }
  else if (e.se) {
    const nSe = 1 + (R() < 0.45 ? 1 : 0);
    const dropSE = (it: Item): void => { const mfAll = mf + gemMagicFind(g); if (mfAll > 0 && it.rar < 5 && R() < efc(0.06, mfAll)) { it.rar++; floatTxt(g, e.x, e.y - 1.3, "MAGIC FIND!", RC[it.rar]); } announceDrop(g, it, e.x, e.y); g.drops.push({ x: e.x, y: e.y, item: it, pot: false, gold: 0 }); };
    for (let i = 0; i < nSe; i++) dropSE(seLootItem(d));
    if (R() < POT_CH_SE) g.drops.push({ x: e.x, y: e.y, item: null, pot: true, gold: 0 });
    gold(SE_GOLD);
    msg(g, "Super Elite slain: " + e.name, SE_COL);
  }
  else if (e.cls === 1) { if (R() < 0.6) drop(makeItem(d, rollRar(1.22, 0, d))); if (R() < 0.2 * efP(g, 89)) drop(makeItem(d, rollRar(1.22, 0, d))); if (R() < POT_CH_ELITE) g.drops.push({ x: e.x, y: e.y, item: null, pot: true, gold: 0 }); gold(e.name.startsWith("Champion ") ? 8 : 5); msg(g, "Elite slain: " + e.name, GOLD); }
  else if (e.act) {
    e.hp = 0;
    const more = packRemain(g, e) > 0 || !!livingActBoss(g);
    fountainActLoot(g, e, more);
    if (!more) {
      g.actCleared = Math.max(g.actCleared ?? 0, g.depth);
      openCampPortal(g);
    }
  } else {
    const n = 1 + ri(3);
    for (let i = 0; i < n; i++) drop(makeItem(d + 1, rollRar(1.35, 0, d)));
    for (let i = 0; i < POT_BOSS_N; i++) g.drops.push({ x: e.x, y: e.y, item: null, pot: true, gold: 0 });
    gold(25);
    const left = packRemain(g, e);
    if (e.bN && e.bN > 1 && left > 0) setBanner(g, "BOSS COPY FALLS!", left + " remain \u00b7 loot drops", "#ff6060", 5, 2.8);
    else setBanner(g, "BOSS DEFEATED!", e.name + " dropped " + n + " item" + (n > 1 ? "s" : ""), "#ff6060", 5, 3);
    g.shake = 8; g.flash = 0.4; g.flashC = "#ffffff";
    msg(g, "You defeated " + e.name + "!", "#ff8080");
  }
  if (!e.child && !e.gob && !e.act) {
    const ch = e.se ? GEM_CH_SE : e.cls === 2 ? GEM_CH_MINI : (e.cls === 1 || e.rare) ? GEM_CH_ELITE : GEM_CH_NORM;
    if (R() < ch) giveDroppedGem(g, e.x, e.y, d);
  }
  if (!e.child) petFortuneDrop(g, e, drop);
  if (!e.child && setCounts(g.eq)[7] >= 4 && R() < 0.12) drop(makeItem(d, rollRar(1.1, 0, d)));
  if (e.tr.includes("split") && !e.child) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let made = 0;
    for (const [dx, dy] of dirs) {
      if (made >= 2) break;
      const nx = e.x + dx, ny = e.y + dy;
      if (walkable(g, nx, ny) && !(nx === g.hero.x && ny === g.hero.y)) {
        const hp = Math.max(1, Math.round(e.mhp * 0.35));
        g.pend.push({ ...e, id: NID++, x: nx, y: ny, ax: e.x, ay: e.y, hp, mhp: hp, cls: 0, child: true, xp: Math.max(1, Math.round(e.xp * 0.2)), name: "Lesser " + FAMS[e.f].v[e.v], tr: e.tr.filter((t: Trait) => t !== "split"), atk: Math.max(1, Math.round(e.atk * 0.6)), awake: true, hit: 0 });
        made++;
      }
    }
    if (made) msg(g, e.name + " splits apart!", "#a0ffa0");
  }
  efOnKill(g, e);
}

// ---------- spells, passives, auto-attack, auto-equip ----------
const nearEnemies = (g: Game, x: number, y: number, r: number): En[] => g.en.filter((e: En) => e.hp > 0 && Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) <= r);
function nearestEnemy(g: Game, r: number): En | null {
  const h = g.hero; let best: En | null = null, bd = 999;
  for (const e of g.en) { if (e.hp <= 0 || !g.vis[e.y * MW + e.x]) continue; const d = Math.abs(e.x - h.x) + Math.abs(e.y - h.y); if (d <= r && d < bd) { bd = d; best = e; } }
  return best;
}
function randomNear(g: Game, r: number): En | null {
  const l = nearEnemies(g, g.hero.x, g.hero.y, r).filter((e: En) => g.vis[e.y * MW + e.x] === 1);
  return l.length ? pick(l) : null;
}
function lineTiles(g: Game, x0: number, y0: number, x1: number, y1: number, len: number): number[][] {
  const dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
  const out: number[][] = [];
  for (let s = 1; s <= len; s++) { const x = x0 + Math.round((dx / n) * s), y = y0 + Math.round((dy / n) * s); if (!inb(x, y) || g.map[y * MW + x] === 0) break; out.push([x, y]); }
  return out;
}
function fxAdd(g: Game, k: string, x: number, y: number, x2: number, y2: number, max: number, c: string, c2: string, r: number): void {
  if (g.fx.length < 70) g.fx.push({ k, x, y, x2, y2, t: max, max, c, c2, r, seed: R() * 1000, fired: false });
}
function heal(g: Game, n: number, show: boolean): void {
  const mx = calc(g.lvl, g.eq).maxHp;
  const a = Math.min(mx - g.hero.hp, Math.round(n));
  if (a <= 0) return;
  g.hero.hp += a;
  if (show) floatTxt(g, g.hero.x, g.hero.y - 0.4, "+" + a, "#60ff80");
}
function addGround(g: Game, x: number, y: number, el: El, t: number, dmg: number): void {
  if (!inb(x, y) || g.map[y * MW + x] === 0) return;
  const ex = g.ground.find((q: Ground) => q.x === x && q.y === y);
  if (ex) { ex.el = el; ex.t = Math.max(ex.t, t); ex.dmg = Math.max(ex.dmg, dmg); return; }
  g.ground.push({ x, y, t, el, dmg });
  if (g.ground.length > 120) g.ground.shift();
}
function pullEn(g: Game, e: En): void {
  const h = g.hero;
  const dx = Math.sign(h.x - e.x), dy = Math.sign(h.y - e.y);
  const opts = Math.abs(h.x - e.x) >= Math.abs(h.y - e.y) ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
  for (const [ox, oy] of opts) { if (ox === 0 && oy === 0) continue; const nx = e.x + ox, ny = e.y + oy; if (!(nx === h.x && ny === h.y) && walkable(g, nx, ny)) { e.x = nx; e.y = ny; return; } }
}
function elHit(g: Game, e: En, el: El, raw: number, light: boolean, mod: number): number {
  if (e.hp <= 0) return 0;
  let d = raw;
  let def = e.def * 0.5;
  if (el === "holy" && UNDEAD.includes(e.f)) d *= 1.75;
  if (el === "hell") d *= 1.3;
  d *= elMul(e, el);
  if (el === "void" || mod === 5) def = 0;
  if (el === "void") d += e.mhp * (e.cls === 2 ? 0.01 : 0.03) * (light ? 0.4 : 1);
  if (mod === 7) d *= 1 + R() * 2;
  const dmg = Math.max(1, Math.round(dmgF(d, def) * (0.9 + R() * 0.2)));
  hurtEn(g, e, dmg);
  floatTxt(g, e.x + (R() - 0.5) * 0.5, e.y - 0.2, String(dmg), ELC[el]);
  const ext = mod === 4 ? 2 : 0;
  if (el === "fire") { e.burn = Math.max(e.burn, 3 + ext); e.burnD = Math.max(e.burnD, Math.max(1, Math.round(dmg * 0.25))); }
  else if (el === "frost") { e.slow = Math.max(e.slow, 2 + ext); if (!light && R() < 0.25 && e.cls < 2 && e.hp > 0) { e.stun = Math.max(e.stun, 1); floatTxt(g, e.x, e.y - 0.6, "FROZEN", "#c8f4ff"); } }
  else if (el === "hell") addGround(g, e.x, e.y, "hell", 3 + ext, Math.max(1, Math.round(dmg * 0.3)));
  else if (el === "void") { if (e.hp > 0 && e.cls < 2) pullEn(g, e); }
  else if (el === "dark") { heal(g, dmg * (light ? 0.08 : 0.2), false); e.weak = Math.max(e.weak, 3 + ext); if (!light && R() < 0.2 && e.cls < 2) { e.fear = 2; floatTxt(g, e.x, e.y - 0.6, "FEAR", "#c090ff"); } }
  if (e.hp <= 0) kill(g, e);
  return dmg;
}
function castSpell(g: Game, sp: Spell, tg: En, st: Stats, echo: boolean): void {
  const h = g.hero;
  let base = st.atk * sp.pw * SHF[sp.sh];
  if (setCounts(g.eq)[4] >= 2) base = safeMul(base, 1.15);
  const hx = h.ax * TS + 12, hy = h.ay * TS + 12, tx = tg.ax * TS + 12, ty = tg.ay * TS + 12;
  const c = ELC[sp.el], c2 = EL2[sp.el];
  const inten = Math.min(3, sp.pw);
  g.sfx("mx", spellSnd(sp));
  const casts = sp.mod === 0 ? 2 : 1;
  for (let k = 0; k < casts; k++) {
    let targets: En[] = [];
    if (sp.sh === "bolt") { targets = [tg]; fxAdd(g, "bolt", hx, hy, tx, ty, 0.24, c, c2, 3 + Math.round(inten)); }
    else if (sp.sh === "nova") { const r = sp.r + 1; targets = nearEnemies(g, h.x, h.y, r); fxAdd(g, "ring", hx, hy, 0, 0, 0.5, c, c2, (r + 0.5) * TS); }
    else if (sp.sh === "chain") {
      targets = [tg]; fxAdd(g, "arc", hx, hy, tx, ty, 0.3, c, c2, 1);
      let cur = tg; const n = 2 + Math.floor(sp.pw * 2);
      for (let i = 0; i < n; i++) {
        let nx: En | null = null, bd = 99;
        for (const e of g.en) { if (e.hp <= 0 || targets.includes(e)) continue; const dd = Math.abs(e.x - cur.x) + Math.abs(e.y - cur.y); if (dd <= 4 && dd < bd) { bd = dd; nx = e; } }
        if (!nx) break;
        fxAdd(g, "arc", cur.ax * TS + 12, cur.ay * TS + 12, nx.ax * TS + 12, nx.ay * TS + 12, 0.3, c, c2, 1);
        targets.push(nx); cur = nx;
      }
    }
    else if (sp.sh === "meteor") { targets = nearEnemies(g, tg.x, tg.y, sp.r); fxAdd(g, "meteor", tx, ty, 0, 0, 0.55, c, c2, (sp.r + 0.5) * TS); }
    else if (sp.sh === "beam" || sp.sh === "rupture") {
      const line = lineTiles(g, h.x, h.y, tg.x, tg.y, sp.sh === "beam" ? 7 : 4 + sp.r);
      for (const [x, y] of line) { const e = enemyAt(g, x, y); if (e) targets.push(e); }
      const end = line.length ? line[line.length - 1] : [tg.x, tg.y];
      fxAdd(g, sp.sh === "beam" ? "beam" : "spikes", hx, hy, end[0] * TS + 12, end[1] * TS + 12, sp.sh === "beam" ? 0.35 : 0.55, c, c2, 4 + inten * 2);
    }
    else if (sp.sh === "pillar") { targets = nearEnemies(g, tg.x, tg.y, Math.max(1, sp.r - 1)); fxAdd(g, "pillar", tx, ty, 0, 0, 0.5, c, c2, 10 + inten * 4); }
    else if (sp.sh === "blades") { targets = nearEnemies(g, h.x, h.y, sp.r); fxAdd(g, "blades", hx, hy, 0, 0, 0.6, c, c2, 14 + sp.r * 8); }
    else if (sp.sh === "summon") { if (g.allies.length < 4) g.allies.push({ t: 4 + Math.round(sp.pw * 3), el: sp.el, pw: base, ph: R() * 6.28 }); fxAdd(g, "ring", hx, hy, 0, 0, 0.35, c, c2, TS); targets = [tg]; }
    else {
      targets = [tg];
      for (let yy = -sp.r; yy <= sp.r; yy++) for (let xx = -sp.r; xx <= sp.r; xx++) addGround(g, tg.x + xx, tg.y + yy, sp.el, 3 + (sp.mod === 4 ? 2 : 0), Math.max(1, Math.round(base * 0.8)));
      fxAdd(g, "cloud", tx, ty, 0, 0, 0.8, c, c2, (sp.r + 0.5) * TS);
    }
    let prev: En | { x: number; y: number } = h;
    for (const e of targets) {
      let ctx: HitCtx;
      if (sp.sh === "nova" || sp.sh === "blades") ctx = { ox: h.x, oy: h.y };
      else if (sp.sh === "meteor" || sp.sh === "pillar" || sp.sh === "cloud") ctx = { ox: tg.x, oy: tg.y };
      else if (sp.sh === "chain") { ctx = { dx: e.x - prev.x, dy: e.y - prev.y }; prev = e; }
      else if (sp.sh === "beam" || sp.sh === "rupture") ctx = { dx: tg.x - h.x, dy: tg.y - h.y };
      else ctx = { dx: e.x - h.x, dy: e.y - h.y };
      withHit(ctx, () => { elHit(g, e, sp.el, base, false, sp.mod); });
    }
  }
  if (sp.el === "holy") heal(g, st.maxHp * 0.03, true);
  if (sp.el === "elec" && sp.sh !== "chain") {
    let nx: En | null = null, bd = 99;
    for (const e of g.en) { if (e.hp <= 0 || e === tg) continue; const dd = Math.abs(e.x - tg.x) + Math.abs(e.y - tg.y); if (dd <= 3 && dd < bd) { bd = dd; nx = e; } }
    if (nx) { fxAdd(g, "arc", tx, ty, nx.ax * TS + 12, nx.ay * TS + 12, 0.3, c, c2, 1); withHit({ dx: nx.x - tg.x, dy: nx.y - tg.y }, () => { elHit(g, nx, "elec", base * 0.5, true, sp.mod); }); }
  }
  if (sp.el === "void") fxAdd(g, "vortex", tx, ty, 0, 0, 0.6, c, c2, 20 + inten * 6);
  burst(g, tx, ty, Math.round(10 + inten * 14), [c, c2, "#ffffff"], 80 + inten * 20, sp.el === "fire" || sp.el === "hell" || sp.el === "holy" ? -40 : 40);
  g.shake = Math.max(g.shake, 1.5 + inten * 1.8);
  if (sp.pw >= 1.4) { g.flash = Math.max(g.flash, 0.12 + inten * 0.05); g.flashC = c; }
  if (!echo) floatTxt(g, tg.x, tg.y - 0.9, sp.name, c);
  if (sp.mod === 6 && !echo) g.echo.push(sp);
  else if (!echo && R() < efc(0.08, efP(g, 95))) g.echo.push(sp);
}
function passiveTick(g: Game, st: Stats): void {
  const h = g.hero;
  const hx = h.ax * TS + 12, hy = h.ay * TS + 12;
  allPassives(g.eq).forEach((p: Passive, pi: number) => {
    const base = st.atk * p.pw, vast = p.mod === 0 ? 1 : 0, twin = p.mod === 3 ? 2 : 1, rapid = p.mod === 1;
    const c = ELC[p.el], c2 = EL2[p.el];
    if (p.ty === "orbs") {
      for (let i = 0; i < twin; i++) { const e = randomNear(g, 2 + vast); if (e) { if (i === 0) g.sfx("mx", pasSnd(p)); const a = g.time * 2.6 + (pi + i) * 2.1; fxAdd(g, "bolt", hx + Math.cos(a) * 16, hy + Math.sin(a) * 9, e.ax * TS + 12, e.ay * TS + 12, 0.2, c, c2, 3); withHit({ dx: e.x - h.x, dy: e.y - h.y }, () => { elHit(g, e, p.el, base * 0.7, true, p.mod); }); } }
    } else if (p.ty === "aura") {
      const ae = nearEnemies(g, h.x, h.y, 1 + vast);
      for (const e of ae) withHit({ ox: h.x, oy: h.y }, () => { elHit(g, e, p.el, base * 0.45 * twin, true, p.mod); });
      if (ae.length && g.turn % 3 === pi % 3) g.sfx("mx", pasSnd(p));
    } else if (p.ty === "pulse") {
      if (g.turn % (rapid ? 2 : 4) === 0) { const r = 2 + vast; const es = nearEnemies(g, h.x, h.y, r); fxAdd(g, "ring", hx, hy, 0, 0, 0.45, c, c2, (r + 0.5) * TS); for (const e of es) withHit({ ox: h.x, oy: h.y }, () => { elHit(g, e, p.el, base * 1.4 * twin, true, p.mod); }); if (es.length) g.sfx("mx", pasSnd(p)); }
    } else if (p.ty === "halo") {
      heal(g, st.maxHp * p.pw * 0.025 * twin, false);
      if (g.turn % (rapid ? 2 : 3) === 0) { const e = randomNear(g, 2 + vast); if (e) { fxAdd(g, "pillar", e.ax * TS + 12, e.ay * TS + 12, 0, 0, 0.35, c, c2, 8); withHit({ dx: e.x - h.x, dy: e.y - h.y }, () => { elHit(g, e, p.el, base * 0.9, true, p.mod); }); g.sfx("mx", pasSnd(p)); } }
    } else if (p.ty === "field") {
      const fe = nearEnemies(g, h.x, h.y, 2 + vast);
      for (const e of fe) { if (R() < 0.5) e.slow = Math.max(e.slow, 1); withHit({ ox: h.x, oy: h.y }, () => { elHit(g, e, p.el, base * 0.25 * twin, true, p.mod); }); }
      if (fe.length && g.turn % 3 === pi % 3) g.sfx("mx", pasSnd(p));
    } else if (p.ty === "sentinel") {
      if (g.turn % (rapid ? 1 : 2) === 0) { const e = nearestEnemy(g, 5 + vast); if (e) { fxAdd(g, "bolt", hx - 14, hy - 16, e.ax * TS + 12, e.ay * TS + 12, 0.22, c, c2, 3); withHit({ dx: e.x - h.x, dy: e.y - h.y }, () => { elHit(g, e, p.el, base * 1.1 * twin, true, p.mod); }); g.sfx("mx", pasSnd(p)); } }
    }
  });
}
function worldTick(g: Game, st: Stats): void {
  const h = g.hero;
  for (const gr of g.ground) {
    gr.t--;
    const e = enemyAt(g, gr.x, gr.y);
    if (e && e.hp > 0) {
      markHitDir(g, e);
      e.hp -= gr.dmg; e.hit = 0.15; e.awake = true;
      floatTxt(g, e.x, e.y - 0.1, String(gr.dmg), ELC[gr.el]);
      if (gr.el === "frost") e.slow = Math.max(e.slow, 1);
      if (gr.el === "dark") e.weak = Math.max(e.weak, 1);
      if (gr.el === "fire") e.burn = Math.max(e.burn, 1);
      if (e.hp <= 0) kill(g, e);
    }
  }
  g.ground = g.ground.filter((q: Ground) => q.t > 0);
  for (const a of g.allies) {
    a.t--;
    const e = nearestEnemy(g, 5);
    if (e) { const an = g.time * 1.8 + a.ph; fxAdd(g, "bolt", h.ax * TS + 12 + Math.cos(an) * 24, h.ay * TS + 6 + Math.sin(an) * 9, e.ax * TS + 12, e.ay * TS + 12, 0.22, ELC[a.el], EL2[a.el], 3); withHit({ dx: e.x - h.x, dy: e.y - h.y }, () => { elHit(g, e, a.el, a.pw * (1 + 0.4 * efP(g, 94)), true, -1); }); }
  }
  g.allies = g.allies.filter((a: Ally) => a.t > 0);
  if (g.echo.length) { const list = g.echo; g.echo = []; for (const sp of list) { const e = nearestEnemy(g, 6); if (e) castSpell(g, sp, e, st, true); } }
  passiveTick(g, st);
  petTurn(g, st);
  efTurn(g, st);
  if (st.ward > 0) g.ward = Math.min(Math.max(st.ward, efP(g, 42) + efP(g, 78) > 0 ? st.maxHp * 0.15 : 0), g.ward + st.ward * 0.08); else g.ward = Math.max(0, g.ward - st.maxHp * 0.03);
  gemTick(g, st);
}
function findTarget(g: Game, st: Stats): En | null {
  const h = g.hero;
  let best: En | null = null, bd = 1e9;
  for (const e of g.en) {
    if (e.hp <= 0 || !g.vis[e.y * MW + e.x]) continue;
    const dx = e.x - h.x, dy = e.y - h.y, md = Math.abs(dx) + Math.abs(dy);
    let ok = md === 1;
    if (!ok && st.reach >= 2 && md === 2 && (dx === 0 || dy === 0)) { const mx = h.x + Math.sign(dx), my = h.y + Math.sign(dy); ok = g.map[my * MW + mx] !== 0 && !chestAt(g, mx, my) && !enemyAt(g, mx, my); }
    if (!ok && st.range > 0 && md <= st.range && los(g, h.x, h.y, e.x, e.y)) ok = true;
    if (!ok) continue;
    const sc = md * 100 + (e.hp / e.mhp) * 50 - (e.cls === 2 ? 30 : 0);
    if (sc < bd) { bd = sc; best = e; }
  }
  return best;
}
function attackTarget(g: Game, tg: En, st: Stats): void {
  const h = g.hero;
  setHeroDir(h, Math.sign(tg.x - h.x), Math.sign(tg.y - h.y));
  heroAttack(g, tg, st, Math.abs(tg.x - h.x) + Math.abs(tg.y - h.y), Math.sign(tg.x - h.x), Math.sign(tg.y - h.y));
}
function autoTurnSt(g: Game, st: Stats): boolean {
  const tg = findTarget(g, st);
  if (!tg) return false;
  attackTarget(g, tg, st);
  endTurn(g, st.range <= 0);
  return true;
}
function autoTurn(g: Game): boolean {
  if (g.mode !== "play" || uiBlocked(g)) return false;
  const st = calc(g.lvl, g.eq);
  if (g.rt) {
    if (st.range > 0) { if ((g.acd ?? 0) > 1e-6) return false; }
    else if ((g.pcd ?? 0) > 1e-6) return false;
  }
  return autoTurnSt(g, st);
}
function swingClass(eq: Eq): number {
  const w = eq.rh ?? (eq.lh && eq.lh.kind !== "shield" ? eq.lh : null);
  if (!w) return 6;
  const k = w.kind;
  if (k === "mace" || k === "warhammer" || k === "flail") return 1;
  if (k === "axe" || k === "greataxe" || k === "scythe") return 2;
  if (k === "bow") return 3;
  if (k === "crossbow" || k === "handxbow") return 4;
  if (k === "staff") return 5;
  if (k === "wand") return 8;
  if (k === "beamsword") return 7;
  if (k === "katana" || k === "nodachi") return 0;
  if (k === "claws") return 6;
  return 0;
}
// ---------- Power Level, sets, stars, spawns, loot pet, elements, rare packs ----------
const SET_COL = "#40e070";
interface SetDef { n: string; role: string; parts: Record<AK, string>; b2: string; b4: string }
const SETS: SetDef[] = [
  { n: "Bloodforged", role: "offense", parts: { head: "Bloodforged Crown", chest: "Bloodforged Cuirass", arms: "Bloodforged Gauntlets", legs: "Bloodforged Greaves" }, b2: "2-piece: +10% Attack and +4% Crit", b4: "4-piece: hits deal +12% damage and heal 3% of damage dealt" },
  { n: "Ironwarden", role: "defense", parts: { head: "Ironwarden Helm", chest: "Ironwarden Plate", arms: "Ironwarden Guards", legs: "Ironwarden Sabatons" }, b2: "2-piece: +12 Defense and +20 Max HP", b4: "4-piece: take 10% less damage and deal 8% thorns" },
  { n: "Windstrider", role: "utility", parts: { head: "Windstrider Hood", chest: "Windstrider Mantle", arms: "Windstrider Gloves", legs: "Windstrider Boots" }, b2: "2-piece: +12% Movement Speed", b4: "4-piece: +10% Double Strike and +8% Movement Speed" },
  { n: "Beastbond", role: "pets", parts: { head: "Beastbond Circlet", chest: "Beastbond Hide", arms: "Beastbond Claws", legs: "Beastbond Treads" }, b2: "2-piece: pet shots deal +30% damage", b4: "4-piece: pet fires a second shot at 50% power" },
  { n: "Arcanum", role: "magic", parts: { head: "Arcanum Crown", chest: "Arcanum Robes", arms: "Arcanum Wraps", legs: "Arcanum Sandals" }, b2: "2-piece: +8 Attack and spells hit 15% harder", b4: "4-piece: on-hit burst of elemental damage" },
  { n: "Nightshade", role: "crit", parts: { head: "Nightshade Veil", chest: "Nightshade Vest", arms: "Nightshade Grips", legs: "Nightshade Striders" }, b2: "2-piece: +8% Crit", b4: "4-piece: critical hits deal 35% more and have a 10% chance to repeat" },
  { n: "Sanctum", role: "sustain", parts: { head: "Sanctum Halo", chest: "Sanctum Vestments", arms: "Sanctum Sleeves", legs: "Sanctum Treads" }, b2: "2-piece: +0.6 regen and +12 Ward", b4: "4-piece: slaying a foe heals 6% Max HP, +10 Ward" },
  { n: "Fortune's Grasp", role: "treasure", parts: { head: "Fortune's Circlet", chest: "Fortune's Vest", arms: "Fortune's Grips", legs: "Fortune's Boots" }, b2: "2-piece: +25% gold found", b4: "4-piece: 12% chance of an extra drop when a foe dies" },
  { n: "Stormcall", role: "elemental", parts: { head: "Stormcall Helm", chest: "Stormcall Mail", arms: "Stormcall Bracers", legs: "Stormcall Greaves" }, b2: "2-piece: 12% chance on hit to shock a nearby foe", b4: "4-piece: the shock chains and hits harder" },
  { n: "Voidheart", role: "dark", parts: { head: "Voidheart Mask", chest: "Voidheart Raiment", arms: "Voidheart Wraps", legs: "Voidheart Steps" }, b2: "2-piece: hits weaken the target", b4: "4-piece: 8% lifesteal and a small chance to fear" },
];
interface StarDef { n: string; d: string }
const STAR_OFF: StarDef[] = [
  { n: "Starfire", d: "Bonus magic damage on hit" }, { n: "Execute", d: "Extra damage to wounded foes" },
  { n: "Cleave Star", d: "Splash damage to a nearby foe" }, { n: "Bleed Star", d: "Applies a bleeding wound" },
  { n: "Overwhelm", d: "Extra damage to elites, rares and bosses" }, { n: "Piercing Star", d: "Hits ignore some defense" },
  { n: "Rampage", d: "Brief attack surge on hit" }, { n: "Stun Pulse", d: "Chance to stun on hit" },
  { n: "Lifesteal", d: "Heal for a portion of damage dealt" }, { n: "Multistrike", d: "Chance of a follow-up hit" },
  { n: "Hunter's Mark", d: "Marked foes take more damage" }, { n: "Frostbite", d: "Chance to slow on hit" },
  { n: "Ignite", d: "Chance to burn on hit" }, { n: "Chain Spark", d: "A spark jumps to a second foe" },
  { n: "Crit Surge", d: "Critical hits are even deadlier" }, { n: "Armor Break", d: "Hits weaken the target's hide" },
  { n: "Dread Star", d: "Chance to fear on hit" }, { n: "Echo Strike", d: "A faint second impact" },
  { n: "Detonate", d: "Slain foes burst and splash nearby" }, { n: "Precision", d: "Slightly more damage every hit" },
  { n: "Void Edge", d: "Ignores a portion of defense as extra damage" }, { n: "Bloodlust", d: "Heal on a killing blow" },
];
const STAR_DEF: StarDef[] = [
  { n: "Ironhide", d: "Take 6% less damage" }, { n: "Fortify", d: "+10 Max HP" },
  { n: "Star Thorns", d: "Reflect a portion of damage" }, { n: "Aegis Star", d: "+10 Ward" },
  { n: "Mending", d: "+0.3 regen per turn" }, { n: "Sidestep", d: "Chance to dodge a hit" },
  { n: "Guard Star", d: "+4% Block" }, { n: "Wardskin", d: "Slight damage resistance" },
  { n: "Reprisal Heal", d: "Chance to heal when struck" }, { n: "Shield Wall", d: "Big hits are reduced" },
  { n: "Vitality", d: "+12 Max HP" }, { n: "Second Wind", d: "Low-health hits are halved sometimes" },
  { n: "Frost Armor", d: "Attackers may be slowed" }, { n: "Reflect Star", d: "Small bolt back at the attacker" },
  { n: "Staunch", d: "Take 5% less damage" }, { n: "Guardian", d: "Less damage from elites, rares and bosses" },
  { n: "Safeguard", d: "Small chance to ignore a hit" }, { n: "Recovery Star", d: "Heal when struck while wounded" },
  { n: "Stalwart", d: "Less damage while standing still" }, { n: "Afterimage", d: "Small dodge chance" },
  { n: "Life Well", d: "Less damage while healthy" }, { n: "Bulwark", d: "Less damage from ranged hits" },
];
const STAR_MAX = [0, 0, 0, 1, 2, 3, 4, 5];
const STAR_CH1 = 0.08;
const STAR_GEOM = 0.22;
const starMax = (rar: number, isSet: boolean): number => (isSet ? 4 : (STAR_MAX[rar] ?? 0));
let STAR_LUCK = 1;
function rollStars(kind: Kind, rar: number, isSet: boolean, d: number = 1): number[][] | undefined {
  const max = starMax(rar, isSet);
  if (max <= 0 || kind === "gem") return undefined;
  const t = rampT(d);
  const ch1 = STAR_CH1 + (STAR_CH1_END - STAR_CH1) * t;
  const geom = STAR_GEOM + (STAR_GEOM_END - STAR_GEOM) * t;
  const pris5 = STAR_PRIS5 * (ch1 / STAR_CH1);
  const pool = isArmor(kind) || kind === "shield" ? STAR_DEF : STAR_OFF;
  const out: number[][] = [];
  const used = new Set<number>();
  for (let i = 0; i < max; i++) {
    const step = (rar === 7 && i === 4) ? pris5 : (i === 0 ? ch1 : geom);
    if (R() >= Math.min(0.95, step * Math.max(1, STAR_LUCK))) break;
    let id = ri(pool.length), g = 0;
    while (used.has(id) && g++ < 40) id = ri(pool.length);
    used.add(id); out.push([id, 1]);
  }
  return out.length ? out : undefined;
}
const starPool = (it: Item): StarDef[] => (isArmor(it.kind) || it.kind === "shield" ? STAR_DEF : STAR_OFF);
const starName = (it: Item, e: number[]): string => starPool(it)[e[0]]?.n ?? "Star";
const starDesc = (it: Item, e: number[]): string => starPool(it)[e[0]]?.d ?? "";
const starBadge = (it: Item): string => (it.st && it.st.length > 0 ? "\u2605" + it.st.length : "");

const SOCK_MAX = 4;
const SOCK_W: number[][] = [
  [55, 35, 8, 1.5, 0.5],
  [40, 42, 14, 3, 1],
  [18, 40, 30, 10, 2],
  [8, 28, 38, 20, 6],
  [4, 16, 35, 32, 13],
  [2, 10, 28, 38, 22],
  [1, 6, 20, 40, 33],
  [0.5, 3, 12, 35, 49.5],
];
const GEMT: { n: string; c: string; d: string }[] = [
  { n: "Diamond", c: "#f0f0f8", d: "All attributes rise." },
  { n: "Ruby", c: "#ff3030", d: "A burning aura harms nearby foes." },
  { n: "Sapphire", c: "#3a80ff", d: "Frost patches slowly form around you and chill foes." },
  { n: "Emerald", c: "#30d060", d: "Vitality and recovery." },
  { n: "Citrine", c: "#ffd840", d: "Richer drops (Magic Find)." },
  { n: "Topaz", c: "#ff8c1a", d: "More gold from fights, and goblins appear more often." },
  { n: "Amethyst", c: "#c060ff", d: "More loot portals and rare encounters." },
];
const GEM_QN = ["Chipped", "Fine", "Clear", "Bright", "Vivid", "Royal", "Imperial", "Prismatic"];
const STAR_PRIS5 = 0.035;
const STAR_COMBINE_MAX = [0, 0, 0, 1, 2, 3, 4, 10];
const SALV_RM = [0.6, 1.1, 2.2, 8, 22, 60, 180, 900];
const GOLDEN_COL = "#ffd840";
function isGem(it: Item | null | undefined): boolean { return !!it && it.kind === "gem"; }
function gemQ(rar: number): number { return 1 + Math.max(0, Math.min(7, rar)) * 0.4; }
function sockWeights(rar: number, d: number = 1): number[] {
  const w = SOCK_W[Math.max(0, Math.min(7, rar | 0))].slice();
  const t = rampT(d);
  if (t <= 0) return w;
  for (let i = 0; i <= SOCK_MAX; i++) w[i] *= 1 + SOCK_DEPTH_K * t * i;
  return w;
}
function rollSocketCount(rar: number, d: number = 1): number {
  const w = sockWeights(rar, d);
  let t = 0; for (const x of w) t += x;
  let r = R() * t;
  for (let i = 0; i <= SOCK_MAX; i++) { r -= w[i]; if (r <= 0) return i; }
  return SOCK_MAX;
}
function rollSockets(it: Item, d: number = 1): void {
  if (!it || it.kind === "pet" || it.kind === "gem") { delete it.sk; return; }
  const n = rollSocketCount(it.rar, d);
  const sk: { c: number; g?: { typ: number; rar: number } }[] = [];
  for (let i = 0; i < n; i++) sk.push({ c: ri(7) });
  it.sk = sk;
}
function ensureSockets(it: Item): void {
  if (!it || it.kind === "pet" || it.kind === "gem") { if (it) delete it.sk; return; }
  if (it.sk === undefined) rollSockets(it);
}
function gemFitsSocket(gem: Item, color: number): boolean {
  if (!isGem(gem) || gem.gt === undefined) return false;
  if (gem.rar >= 7) return true;
  return gem.gt === color;
}
function makeGem(rar: number, typ?: number, ilvl: number = 1): Item {
  const r = Math.max(0, Math.min(7, rar | 0));
  const t = typ !== undefined ? Math.max(0, Math.min(6, typ | 0)) : ri(7);
  const name = GEM_QN[r] + " " + GEMT[t].n;
  return { id: NID++, seed: Math.floor(R() * 2147483646) + 1, kind: "gem", rar: r, ilvl: Math.max(1, ilvl), name, atk: 0, def: 0, block: 0, bonus: {}, d: [t, r, 0, 0], gt: t };
}
function gemRarWRaw(depth: number): number[] {
  const d = Math.max(1, depth);
  return [38, 24, 16, 11, 6, 3, 1.6, 0.25 + Math.min(0.2, d * 0.006)];
}
function gemRarW(depth: number): number[] { return scalePrisDrop(gemRarWRaw(depth), 7); }
function rollGemRar(depth: number): number {
  const w = gemRarW(depth);
  let t = 0; for (const x of w) t += x;
  let r = R() * t;
  for (let i = 0; i < 8; i++) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}
// Gem Goblin rarity: dedicated table, ~3-5x the rare-or-better odds of rollGemRar after renormalizing.
function gobGemWeightsRaw(depth: number): number[] {
  const d = Math.max(1, depth);
  return [10, 8, 7, 28, 20, 14, 7, 1.2 + Math.min(0.8, d * 0.024)];
}
function gobGemWeights(depth: number): number[] { return scalePrisDrop(gobGemWeightsRaw(depth), 7); }
function rollGobGemRar(depth: number): number {
  const w = gobGemWeights(depth);
  let t = 0; for (const x of w) t += x;
  let r = R() * t;
  for (let i = 0; i < 8; i++) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}
function giveDroppedGem(g: Game, x: number, y: number, d: number, gob = false): Item {
  const gem = makeGem(gob ? rollGobGemRar(d) : rollGemRar(d), ri(7), Math.max(1, d));
  announceDrop(g, gem, x, y);
  if (autoSocketGem(g, gem, x, y)) { runAutoCombine(g); return gem; }
  placeGem(g, gem, x, y);
  return gem;
}
function actBossGoldHigh(d: number, g: Game | null = null): number {
  const act = actOf(d);
  const extra = actExtraLoot(act);
  const gm = g ? efGoldMul(g, null) : 1;
  const gem = g ? gemGoldMul(g) : 1;
  const direct = Math.max(800, (3000 + 900 * act + d * 160) * 1.20 * gm * extra.goldMul * gem);
  return direct * 1.15;
}
function goldGoblinPayout(d: number, g: Game): number {
  return Math.max(1, Math.round(actBossGoldHigh(d, g) * 10 * (1.05 + R() * 0.30)));
}
function equippedGems(eq: Eq): { typ: number; rar: number }[] {
  const out: { typ: number; rar: number }[] = [];
  for (const k of EQK) {
    const it = eq[k]; if (!it || !it.sk) continue;
    for (const s of it.sk) if (s.g) out.push(s.g);
  }
  return out;
}
function gemTypePower(eq: Eq, typ: number): number {
  let p = 0;
  for (const g of equippedGems(eq)) if (g.typ === typ) p += gemQ(g.rar);
  return p;
}
function applyGemStats(s: Stats, eq: Eq): void {
  const dia = gemTypePower(eq, 0), em = gemTypePower(eq, 3);
  if (dia > 0) { s.maxHp += Math.round(4 * dia); s.atk += Math.round(1 * dia); s.def += Math.round(1 * dia); }
  if (em > 0) { s.maxHp += Math.round(8 * em); s.regen = Math.round((s.regen + 0.2 * em) * 10) / 10; }
  const sap = gemTypePower(eq, 2);
  if (sap > 0) s.def += Math.round(1.2 * sap);
}
function gemMagicFind(g: Game): number { return gemTypePower(g.eq, 4); }
function gemGoldMul(g: Game): number { return 1 + 0.12 * gemTypePower(g.eq, 5); }
function gemGobMul(g: Game): number { return Math.min(2.5, 1 + 0.18 * gemTypePower(g.eq, 5)); }
function gemPortalMul(g: Game): number { return Math.min(2.5, 1 + 0.18 * gemTypePower(g.eq, 6)); }
function gemRareMul(g: Game): number { return Math.min(2.5, 1 + 0.15 * gemTypePower(g.eq, 6)); }
function gemTick(g: Game, st: Stats): void {
  if (g.mode !== "play" || g.area === "camp") return;
  const h = g.hero;
  const ruby = gemTypePower(g.eq, 1);
  if (ruby > 0) {
    const dmg = Math.max(1, Math.round((1 + ruby) * 0.85 + g.depth * 0.06 * ruby));
    for (const e of g.en) {
      if (e.hp <= 0) continue;
      const md = Math.max(Math.abs(e.x - h.x), Math.abs(e.y - h.y));
      if (md > 2 || md < 1) continue;
      markHitDir(g, e);
      e.hp -= dmg; e.hit = 0.12; e.awake = true; e.burn = Math.max(e.burn, 1);
      floatTxt(g, e.x, e.y - 0.15, String(dmg), "#ff3030");
      if (e.hp <= 0) kill(g, e);
    }
  }
  const sap = gemTypePower(g.eq, 2);
  if (sap > 0 && (g.turn % 3 === 0)) {
    const n = sap >= 2.5 ? 2 : 1;
    const spots: { x: number; y: number }[] = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = h.x + dx, y = h.y + dy;
      if (inb(x, y) && g.map[y * MW + x] !== 0) spots.push({ x, y });
    }
    for (let i = 0; i < n && spots.length; i++) {
      const j = ri(spots.length), p = spots.splice(j, 1)[0];
      addGround(g, p.x, p.y, "frost", 3, Math.max(1, Math.round(0.6 * sap)));
    }
  }
}
function popSocketGems(it: Item): Item[] {
  const out: Item[] = [];
  if (!it.sk) return out;
  for (const s of it.sk) {
    if (!s.g) continue;
    out.push(makeGem(s.g.rar, s.g.typ, it.ilvl));
    delete s.g;
  }
  return out;
}
function socketGem(it: Item, si: number, gem: Item): string {
  ensureSockets(it);
  if (!it.sk || si < 0 || si >= it.sk.length) return "That item has no such socket.";
  if (!isGem(gem) || gem.gt === undefined) return "That is not a gemstone.";
  if (!gemFitsSocket(gem, it.sk[si].c)) return "That gem does not fit this " + GEMT[it.sk[si].c].n + " socket.";
  if (it.sk[si].g) return "That socket is already filled. Unsocket it first.";
  it.sk[si].g = { typ: gem.gt, rar: gem.rar };
  bustIcon(it);
  return "Socketed " + gem.name + ".";
}
function unsocketGem(g: Game, it: Item, si: number): string {
  if (!it.sk || si < 0 || si >= it.sk.length || !it.sk[si].g) return "That socket is empty.";
  const gg = makeGem(it.sk[si].g.rar, it.sk[si].g.typ, it.ilvl);
  delete it.sk[si].g;
  bustIcon(it);
  placeGem(g, gg, g.hero.x, g.hero.y);
  return "Removed " + gg.name + ".";
}
function autoSocketGem(g: Game, gem: Item, x?: number, y?: number): boolean {
  if (!isGem(gem) || gem.gt === undefined) return false;
  for (const k of EQK) {
    const it = g.eq[k];
    if (!it) continue;
    ensureSockets(it);
    if (!it.sk) continue;
    for (let si = 0; si < it.sk.length; si++) {
      if (it.sk[si].g) continue;
      if (!gemFitsSocket(gem, it.sk[si].c)) continue;
      socketGem(it, si, gem);
      const col = GEMT[gem.gt].c;
      const line = "Socketed " + gem.name + " into " + it.name;
      msg(g, line, col);
      floatTxt(g, x ?? g.hero.x, y ?? g.hero.y - 0.3, line, col);
      return true;
    }
  }
  return false;
}
function itemIsEquipped(g: Game, it: Item): boolean {
  for (const k of EQK) if (g.eq[k] === it) return true;
  return false;
}
function trySocketIntoItem(it: Item, gem: Item): boolean {
  if (!it || isGem(it) || it.kind === "pet") return false;
  ensureSockets(it);
  if (!it.sk) return false;
  for (let si = 0; si < it.sk.length; si++) {
    if (it.sk[si].g) continue;
    if (!gemFitsSocket(gem, it.sk[si].c)) continue;
    socketGem(it, si, gem);
    return true;
  }
  return false;
}
// Relocate gems popped from auto-unequipped gear: prefer the incoming item, then any other equipped socket, then the gem bag. Higher rarity first when sockets are limited.
function relocatePoppedGems(g: Game, gems: Item[], prefer?: Item): void {
  const list = gems.slice().sort((a: Item, b: Item) => b.rar - a.rar);
  for (const gem of list) {
    if (prefer && trySocketIntoItem(prefer, gem)) continue;
    if (autoSocketGem(g, gem, g.hero.x, g.hero.y)) continue;
    placeGem(g, gem, g.hero.x, g.hero.y);
  }
}
function autoSocketItem(g: Game, it: Item): boolean {
  if (!it || isGem(it) || it.kind === "pet" || !itemIsEquipped(g, it)) return false;
  ensureSockets(it);
  if (!it.sk || !it.sk.length) return false;
  const gb = ensureGemBag(g);
  let changed = false;
  for (let si = 0; si < it.sk.length; si++) {
    if (it.sk[si].g) continue;
    const c = it.sk[si].c;
    let bestI = -1;
    for (let i = 0; i < gb.length; i++) {
      const gem = gb[i];
      if (!gem || !gemFitsSocket(gem, c)) continue;
      if (bestI < 0 || gem.rar > gb[bestI].rar) bestI = i;
    }
    if (bestI < 0) continue;
    const gem = gb.splice(bestI, 1)[0];
    socketGem(it, si, gem);
    const col = gem.gt !== undefined ? GEMT[gem.gt].c : GOLD;
    msg(g, "Socketed " + gem.name + " into " + it.name, col);
    floatTxt(g, g.hero.x, g.hero.y - 0.3, "Socketed " + gem.name + " into " + it.name, col);
    changed = true;
  }
  return changed;
}
function autoSocketUpgradeEquipped(g: Game): boolean {
  const gb = ensureGemBag(g);
  let changed = false;
  for (const k of EQK) {
    const it = g.eq[k];
    if (!it || !it.sk) continue;
    for (let si = 0; si < it.sk.length; si++) {
      const s = it.sk[si];
      if (!s.g) continue;
      let bestI = -1;
      for (let i = 0; i < gb.length; i++) {
        const gem = gb[i];
        if (!gem || !gemFitsSocket(gem, s.c)) continue;
        if (gem.rar > s.g.rar && (bestI < 0 || gem.rar > gb[bestI].rar)) bestI = i;
      }
      if (bestI < 0) continue;
      const better = gb.splice(bestI, 1)[0];
      const lower = makeGem(s.g.rar, s.g.typ, it.ilvl);
      delete s.g;
      socketGem(it, si, better);
      placeGem(g, lower, g.hero.x, g.hero.y);
      changed = true;
    }
  }
  return changed;
}
function autoSocketEquippedPass(g: Game): boolean {
  let changed = false;
  for (const k of EQK) {
    const it = g.eq[k];
    if (it && autoSocketItem(g, it)) changed = true;
  }
  if (autoSocketUpgradeEquipped(g)) changed = true;
  return changed;
}
function takePickedItem(g: Game, it: Item, x: number, y: number): boolean {
  if (isGem(it) && autoSocketGem(g, it, x, y)) { lootFx(g, it); runAutoCombine(g); return true; }
  if (!isGem(it) && tryAutoEquip(g, it)) { lootFx(g, it, true); autoSocketItem(g, it); runAutoCombine(g); return true; }
  return takeItemOrSalvage(g, it, x, y);
}
function dropStarMax(rar: number, isSet: boolean): number { return starMax(rar, isSet); }
function combineStarMax(rar: number, isSet: boolean): number { return isSet ? 4 : (STAR_COMBINE_MAX[rar] ?? 0); }
function forceStars(it: Item, n: number): void {
  if (n <= 0 || it.kind === "gem") { delete it.st; return; }
  const pool = starPool(it);
  const out: number[][] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    let id = ri(pool.length), g0 = 0;
    while (used.has(id) && g0++ < 80) id = ri(pool.length);
    if (used.has(id)) id = i % pool.length;
    used.add(id);
    out.push([id, 1]);
  }
  it.st = out;
}
// Append n extra stars using the same unique-pick logic as forceStars. Never duplicates an existing star id.
function addStars(it: Item, n: number): void {
  if (n <= 0 || !it || it.kind === "gem") return;
  const pool = starPool(it);
  const out: number[][] = it.st ? it.st.slice() : [];
  const used = new Set<number>();
  for (const e of out) used.add(e[0]);
  for (let i = 0; i < n; i++) {
    let id = ri(pool.length), g0 = 0;
    while (used.has(id) && g0++ < 80) id = ri(pool.length);
    if (used.has(id)) id = i % pool.length;
    used.add(id);
    out.push([id, 1]);
  }
  it.st = out;
}
function markGolden(it: Item): void {
  if (it.rar < 7 || it.kind === "gem") return;
  if ((it.st ? it.st.length : 0) < 10) return;
  it.golden = true;
  if (it.name.indexOf("Golden ") !== 0) it.name = "Golden " + it.name.replace(/^Prismatic /i, "").replace(/^Golden /i, "");
}
function combineTrack(it: Item): string | null {
  if (it.set !== undefined || it.golden) return null;
  if (it.kind === "gem") return it.gt === undefined ? null : "gem:" + it.gt;
  if (it.kind === "pet") return "pet";
  if (isArmor(it.kind)) return "armor:" + it.kind;
  if (it.kind === "shield" || (WI[it.kind as WT] && !WI[it.kind as WT].two)) return "1h";
  if (WI[it.kind as WT] && WI[it.kind as WT].two) return "2h";
  return "weapon:" + it.kind;
}
function combineKey(it: Item): string | null {
  const t = combineTrack(it);
  if (!t) return null;
  if (it.kind === "gem") return t + "|r" + it.rar;
  const stars = it.st ? it.st.length : 0;
  if (it.rar >= 7 && stars >= 10) return null;
  // 1H (incl. shields) and 2H tracks: below Legendary, rarity only; Legendary+ also requires matching stars.
  if ((t === "1h" || t === "2h") && it.rar < 3) return t + "|r" + it.rar;
  return t + "|r" + it.rar + "|s" + stars;
}
function sharedKind(items: Item[]): Kind {
  const k0 = items[0].kind;
  if (items.every((it: Item) => it.kind === k0)) return k0;
  return k0;
}
function pickCombinedKind(inputs: Item[]): Kind {
  const t = combineTrack(inputs[0]);
  if (t === "1h" || t === "2h") {
    const k0 = inputs[0].kind;
    // Same subtype (including 3 shields) keeps that subtype; mixed 1H/2H still rolls a random weapon of that handedness (1H pool has no shields).
    if (inputs.every((it: Item) => it.kind === k0)) return k0;
    if (t === "1h") return ONE_HAND_WEPS[ri(ONE_HAND_WEPS.length)];
    return TWO_HAND_WEPS[ri(TWO_HAND_WEPS.length)];
  }
  return sharedKind(inputs);
}
function copySocket(s: { c: number; g?: { typ: number; rar: number } }): { c: number; g?: { typ: number; rar: number } } {
  return s.g ? { c: s.c, g: { typ: s.g.typ, rar: s.g.rar } } : { c: s.c };
}
// On combine, keep the equipped (or primary) input's sockets and gems, same colors and positions.
// Then rollSocketCount(newRar): extra sockets only if that roll exceeds the carried count, capped at SOCK_MAX (4, every gear kind). Never decrease; never re-roll existing sockets. Pets stay socketless.
function carryCombineSockets(out: Item, primary: Item | null | undefined): void {
  if (!out || out.kind === "pet" || out.kind === "gem") { if (out) delete out.sk; return; }
  const sk = (primary && primary.sk && primary.sk.length) ? primary.sk.map(copySocket) : [];
  if (sk.length > SOCK_MAX) sk.length = SOCK_MAX;
  const rolled = rollSocketCount(out.rar);
  const want = Math.min(SOCK_MAX, Math.max(sk.length, rolled));
  while (sk.length < want) sk.push({ c: ri(7) });
  out.sk = sk;
}
function combinePrimary(g: Game, inputs: Item[]): Item {
  for (const k of EQK) {
    const eq = g.eq[k];
    if (eq && inputs.some((it: Item) => it === eq)) return eq;
  }
  return inputs[0];
}
function makeCombined(inputs: Item[], depth: number, primary?: Item): Item | null {
  if (inputs.length < 3) return null;
  const a = inputs[0], b = inputs[1], c = inputs[2];
  const ilvl = Math.max(depth, ...inputs.map((it: Item) => it.ilvl));
  if (a.kind === "gem") {
    if (a.rar >= 7) return null;
    if (a.gt === undefined || !inputs.every((it: Item) => isGem(it) && it.gt === a.gt && it.rar === a.rar)) return null;
    return makeGem(a.rar + 1, a.gt, ilvl); // next rarity, same gem type; gems have no stars
  }
  const stars = a.st ? a.st.length : 0;
  const maxC = combineStarMax(a.rar, false);
  let rar = a.rar, nxt = stars;
  if (stars < maxC) nxt = stars + 1;
  else if (a.rar < 7) { rar = a.rar + 1; nxt = 0; }
  else if (stars < 10) nxt = stars + 1;
  else return null;
  const it = makeItem(ilvl, rar, pickCombinedKind(inputs));
  if (a.kind === "pet") {
    it.pt = a.pt;
    it.name = PRE[it.rar][0] + " " + PETN[it.pt ?? 0];
    if (it.rar >= 7) it.pab = petAbiFromInputs(a, b, c, it);
  }
  delete it.set;
  forceStars(it, nxt);
  // Tier-up into Legendary+ (rar >= 3): 85% chance to keep at least min(max input stars, result cap);
  // 15% keep the normal roll. In all Legendary+ results, never 0 stars. Same-rarity merges unchanged.
  if (it.kind !== "gem") {
    const cap = combineStarMax(rar, false);
    if (rar > a.rar && rar >= 3) {
      const inMax = Math.max(0, ...inputs.map((x: Item) => x.st ? x.st.length : 0));
      const target = Math.min(inMax, cap);
      const have = it.st ? it.st.length : 0;
      if (R() < 0.85 && have < target) addStars(it, target - have);
    }
    if (rar >= 3 && cap >= 1 && !(it.st && it.st.length)) addStars(it, 1);
  }
  carryCombineSockets(it, primary ?? a);
  if (rar >= 7 && (it.st ? it.st.length : 0) >= 10) markGolden(it);
  return it;
}
function autoCombineOn(g: Game): boolean { return g.autoCombine !== false; }
function bagGroupsOf(bag: Item[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (let i = 0; i < bag.length; i++) {
    const k = combineKey(bag[i]);
    if (!k) continue;
    const arr = m.get(k);
    if (arr) arr.push(i); else m.set(k, [i]);
  }
  return m;
}
function bagGroups(g: Game): Map<string, number[]> { return bagGroupsOf(g.bag); }
function wouldCompleteCombine(g: Game, it: Item): boolean { return wouldCompleteCombineBag(destBag(g, it), it); }
function combineChime(g: Game, it: Item): void {
  g.sfx("sparkle");
  const lab = it.golden ? "GOLDEN PRISMATIC" : isGem(it) ? it.name : (it.name + (it.st && it.st.length ? " " + starBadge(it) : ""));
  msg(g, "Combined into " + lab + "!", it.golden ? GOLDEN_COL : isGem(it) && it.gt !== undefined ? GEMT[it.gt].c : RC[it.rar]);
  setBanner(g, it.golden ? "GOLDEN PRISMATIC!" : "COMBINED!", lab, it.golden ? GOLDEN_COL : RC[it.rar], it.golden ? 8 : it.rar, it.golden ? 3.2 : 1.8);
  if (it.golden) { g.flash = 0.85; g.flashC = GOLDEN_COL; g.shake = 8; g.sfx("loot", 32); }
  else g.toast = Math.max(g.toast, 1.1);
}
function runAutoCombineIn(g: Game, bag: Item[], gemsOnly = false): number {
  let n = 0;
  for (let guard = 0; guard < 64; guard++) {
    const groups = bagGroupsOf(bag);
    let hit: number[] | null = null;
    let inputs: Item[] | null = null;
    let out: Item | null = null;
    // Skip groups that cannot actually combine (e.g. 3+ already-Prismatic gems) instead of aborting the whole pass.
    for (const arr of groups.values()) {
      if (arr.length < 3) continue;
      if (gemsOnly && !(bag[arr[0]] && isGem(bag[arr[0]]))) continue;
      const cand = arr.slice(0, 3).map((i: number) => bag[i]);
      if (!cand[0] || !cand.every((it: Item) => combineKey(it) === combineKey(cand[0]))) continue;
      const primary = combinePrimary(g, cand);
      const ordered = [primary, ...cand.filter((it: Item) => it !== primary)];
      const made = makeCombined(ordered, g.depth, primary);
      if (!made) continue;
      hit = arr.slice(0, 3); inputs = ordered; out = made; break;
    }
    if (!hit || !inputs || !out) break;
    const returned: Item[] = [];
    const primary = combinePrimary(g, inputs);
    for (const it of inputs) if (it !== primary) returned.push(...popSocketGems(it));
    const drop = new Set(hit);
    const kept = bag.filter((_: Item, i: number) => !drop.has(i));
    bag.length = 0;
    for (const it of kept) bag.push(it);
    bag.push(out);
    for (const gem of returned) placeGem(g, gem, g.hero.x, g.hero.y);
    combineChime(g, out);
    n++;
  }
  return n;
}
function runSocketedGemCombine(g: Game): number {
  const gb = ensureGemBag(g);
  type Src = { kind: "bag"; i: number } | { kind: "sock"; it: Item; si: number };
  const groups = new Map<string, Src[]>();
  const add = (key: string | null, src: Src): void => {
    if (!key) return;
    const arr = groups.get(key);
    if (arr) arr.push(src); else groups.set(key, [src]);
  };
  for (let i = 0; i < gb.length; i++) add(combineKey(gb[i]), { kind: "bag", i });
  for (const k of EQK) {
    const it = g.eq[k];
    if (!it || !it.sk) continue;
    for (let si = 0; si < it.sk.length; si++) {
      const s = it.sk[si];
      if (!s.g) continue;
      add("gem:" + s.g.typ + "|r" + s.g.rar, { kind: "sock", it, si });
    }
  }
  for (const srcs of groups.values()) {
    if (srcs.length < 3) continue;
    const socks = srcs.filter((s: Src): s is { kind: "sock"; it: Item; si: number } => s.kind === "sock");
    const bags = srcs.filter((s: Src): s is { kind: "bag"; i: number } => s.kind === "bag");
    // Bag-only triples are handled by runAutoCombineIn. Here we only fire when at least one input is socketed, so the result can land in a socket.
    if (!socks.length) continue;
    const chosen: Src[] = socks.slice(0, 3);
    for (const b of bags) { if (chosen.length >= 3) break; chosen.push(b); }
    if (chosen.length < 3) continue;
    const inputs: Item[] = [];
    for (const s of chosen) {
      if (s.kind === "bag") inputs.push(gb[s.i]);
      else {
        const g0 = s.it.sk![s.si].g!;
        inputs.push(makeGem(g0.rar, g0.typ, s.it.ilvl));
      }
    }
    const out = makeCombined(inputs, g.depth);
    if (!out || !isGem(out)) continue;
    const bagIdx = chosen.filter((s: Src) => s.kind === "bag").map((s: Src) => (s as { kind: "bag"; i: number }).i).sort((a: number, b: number) => b - a);
    for (const i of bagIdx) gb.splice(i, 1);
    const sockChosen = chosen.filter((s: Src): s is { kind: "sock"; it: Item; si: number } => s.kind === "sock");
    for (const s of sockChosen) { delete s.it.sk![s.si].g; bustIcon(s.it); }
    // Best socket: first EQK among the consumed sockets (socks were collected in EQK order).
    const dest = sockChosen[0];
    if (dest && dest.it.sk && dest.si >= 0 && dest.si < dest.it.sk.length && gemFitsSocket(out, dest.it.sk[dest.si].c)) {
      socketGem(dest.it, dest.si, out);
    } else if (!autoSocketGem(g, out, g.hero.x, g.hero.y)) {
      placeGem(g, out, g.hero.x, g.hero.y);
    }
    combineChime(g, out);
    return 1;
  }
  return 0;
}
let COMBINE_DEPTH = 0;
function itemFitsSlot(it: Item, slot: EqKey): boolean {
  if (!it || isGem(it)) return false;
  if (isArmor(it.kind)) return it.kind === slot;
  if (it.kind === "pet") return slot === "pet";
  if (it.kind === "shield") return slot === "lh";
  if (isTwo(it)) return slot === "rh";
  if (isOneHand(it)) return slot === "rh" || slot === "lh";
  return false;
}
function equipIntoSlot(g: Game, it: Item, slot: EqKey): boolean {
  if (!itemFitsSlot(it, slot)) return false;
  const off: Item[] = [];
  if (isTwo(it) && slot === "rh" && g.eq.lh) { off.push(g.eq.lh); g.eq.lh = null; }
  if (slot === "lh" && isTwo(g.eq.rh) && g.eq.rh) { off.push(g.eq.rh); g.eq.rh = null; }
  g.eq[slot] = it;
  for (const x of off) {
    relocatePoppedGems(g, popSocketGems(x), it);
    takeItemOrSalvage(g, x, g.hero.x, g.hero.y);
  }
  return true;
}
function refillEmptySlotsFromBag(g: Game): void {
  if (!g.autoEq) return;
  for (let guard = 0; guard < 16; guard++) {
    let used = false;
    for (let i = 0; i < g.bag.length; i++) {
      const it = g.bag[i];
      if (!it || isGem(it) || !wouldAutoEquip(g, it)) continue;
      g.bag.splice(i, 1);
      if (!tryAutoEquip(g, it)) takeItemOrSalvage(g, it, g.hero.x, g.hero.y);
      used = true;
      break;
    }
    if (!used) break;
  }
}
function runEquippedCombine(g: Game): number {
  type Src = { kind: "bag"; i: number } | { kind: "eq"; k: EqKey };
  const groups = new Map<string, Src[]>();
  const add = (key: string | null, src: Src): void => {
    if (!key) return;
    const arr = groups.get(key);
    if (arr) arr.push(src); else groups.set(key, [src]);
  };
  for (let i = 0; i < g.bag.length; i++) add(combineKey(g.bag[i]), { kind: "bag", i });
  for (const k of EQK) {
    const it = g.eq[k];
    if (!it || isGem(it)) continue;
    add(combineKey(it), { kind: "eq", k });
  }
  for (const srcs of groups.values()) {
    if (srcs.length < 3) continue;
    const eqs = srcs.filter((s: Src): s is { kind: "eq"; k: EqKey } => s.kind === "eq");
    const bags = srcs.filter((s: Src): s is { kind: "bag"; i: number } => s.kind === "bag");
    if (!eqs.length) continue;
    const chosen: Src[] = eqs.slice(0, 3);
    for (const b of bags) { if (chosen.length >= 3) break; chosen.push(b); }
    if (chosen.length < 3) continue;
    const inputs: Item[] = chosen.map((s: Src) => s.kind === "bag" ? g.bag[s.i] : g.eq[s.k]!);
    if (inputs.some((it: Item) => !it)) continue;
    const primary = combinePrimary(g, inputs);
    const ordered = [primary, ...inputs.filter((it: Item) => it !== primary)];
    const out = makeCombined(ordered, g.depth, primary);
    if (!out || isGem(out)) continue;
    const returned: Item[] = [];
    for (const it of ordered) if (it !== primary) returned.push(...popSocketGems(it));
    const bagIdx = chosen.filter((s: Src) => s.kind === "bag").map((s: Src) => (s as { kind: "bag"; i: number }).i).sort((a: number, b: number) => b - a);
    const eqSlots = chosen.filter((s: Src): s is { kind: "eq"; k: EqKey } => s.kind === "eq");
    const destSlot = eqSlots[0].k;
    for (const i of bagIdx) g.bag.splice(i, 1);
    for (const s of eqSlots) g.eq[s.k] = null;
    bustIcon(out);
    if (!equipIntoSlot(g, out, destSlot)) {
      if (!tryAutoEquip(g, out)) takeItemOrSalvage(g, out, g.hero.x, g.hero.y);
    }
    relocatePoppedGems(g, returned, out);
    refillEmptySlotsFromBag(g);
    g.hero.hp = Math.min(g.hero.hp, calc(g.lvl, g.eq).maxHp);
    combineChime(g, out);
    return 1;
  }
  return 0;
}
function runAutoCombine(g: Game): number {
  if (COMBINE_DEPTH > 0) return 0;
  COMBINE_DEPTH++;
  let n = 0;
  try {
    for (let guard = 0; guard < 64; guard++) {
      let step = 0;
      if (autoCombineOn(g)) {
        step += runAutoCombineIn(g, g.bag);
        step += runAutoCombineIn(g, ensureGemBag(g));
        step += runStashGemCombine(g);
        step += runSocketedGemCombine(g);
        step += runEquippedCombine(g);
      }
      const opt = optimizeEquipped(g);
      const sock = autoCombineOn(g) && autoSocketEquippedPass(g);
      n += step;
      if (step === 0 && !opt && !sock) break;
    }
  } finally { COMBINE_DEPTH--; }
  sortInventory(g);
  return n;
}

const SET_CH = (ilvl: number): number => Math.min(0.005, 0.002 + ilvl * 0.00008);
function makeSetPiece(ilvl: number, kind: AK, sid?: number, depth?: number): Item {
  const dlt = depth ?? ilvl;
  const id = sid ?? ri(SETS.length);
  const it = makeItem(ilvl, 6, kind, dlt);
  it.set = id; it.rar = 6; it.name = SETS[id].parts[kind];
  if (it.bonus.mv !== undefined) it.bonus.mv = mvRoll(ilvl, 6, true);
  it.st = rollStars(kind, 6, true, dlt);
  return it;
}
function maybeSet(it: Item): Item {
  if (!isArmor(it.kind) || it.rar >= 7) return it;
  if (R() >= SET_CH(it.ilvl)) return it;
  return makeSetPiece(it.ilvl, it.kind as AK);
}
function setCounts(eq: Eq): number[] {
  const c = SETS.map(() => 0);
  // Count only equipped armor slots. Bag, pet, and weapons never contribute; each slot holds at most one piece.
  for (const k of ARMOR_K) {
    const it = eq[k];
    if (it && it.set !== undefined && it.set >= 0 && it.set < SETS.length && isArmor(it.kind)) c[it.set]++;
  }
  return c;
}
function setBonusState(eq: Eq, sid: number): { name: string; worn: number; b2: string; b4: string; on2: boolean; on4: boolean } {
  const def = SETS[sid];
  const worn = sid >= 0 && sid < SETS.length ? (setCounts(eq)[sid] || 0) : 0;
  return { name: def ? def.n : "Set", worn, b2: def ? def.b2 : "", b4: def ? def.b4 : "", on2: worn >= 2, on4: worn >= 4 };
}
function wornSetIds(eq: Eq): number[] {
  const c = setCounts(eq);
  const out: number[] = [];
  for (let i = 0; i < c.length; i++) if (c[i] > 0) out.push(i);
  return out;
}
function applySetsToStats(s: Stats, eq: Eq): void {
  const c = setCounts(eq);
  if (c[0] >= 2) { s.atk = Math.round(s.atk * 1.10); s.crit = Math.min(75, s.crit + 4); }
  if (c[1] >= 2) { s.def += 12; s.maxHp += 20; }
  if (c[2] >= 2) s.mv += 12;
  if (c[2] >= 4) { s.spd = Math.min(90, s.spd + 10); s.mv += 8; }
  if (c[4] >= 2) s.atk += 8;
  if (c[5] >= 2) s.crit = Math.min(75, s.crit + 8);
  if (c[6] >= 2) { s.regen = Math.round((s.regen + 0.6) * 10) / 10; s.ward += 12; }
  if (c[6] >= 4) s.ward += 10;
}
function applyStarStats(s: Stats, eq: Eq): void {
  for (const k of EQK) {
    const it = eq[k]; if (!it || !it.st) continue;
    if (!(isArmor(it.kind) || it.kind === "shield")) continue;
    const m = prisStarMul(it);
    for (const e of it.st) {
      if (e[0] === 1) s.maxHp += safeRound(10 * m);
      if (e[0] === 3) s.ward += safeRound(10 * m);
      if (e[0] === 4) s.regen = Math.round((s.regen + 0.3 * m) * 10) / 10;
      if (e[0] === 6) s.block = Math.min(60, s.block + safeRound(4 * m));
      if (e[0] === 10) s.maxHp += safeRound(12 * m);
    }
  }
}
function fmtg(n: number): string { return fmtBig(Math.floor(Math.max(0, n))) + "g"; }
function goldLine(cost: number, gold: number, kind: "price" | "sell" | "salvage" | "potion"): { t: string; bad: boolean } {
  const lab = kind === "sell" ? "Sell" : kind === "salvage" ? "Salvage" : "Price";
  return { t: lab + " " + fmtg(cost) + " \u00b7 You have " + fmtg(gold), bad: kind !== "sell" && kind !== "salvage" && gold < cost };
}
function itemPower(it: Item, lvl: number): number {
  if (it.kind === "pet") { const stars = it.st ? it.st.length : 0; return Math.max(1, safeRound((36 * RM[it.rar] * (it.ilvl + 4) / 8 + 220 * PSH[Math.max(0, Math.min(7, it.rar))] * Math.min(1, (it.ilvl + 4) / (lvl + 4))) * (1 + 0.12 * stars) * prisStarMul(it))); }
  let v = it.atk * 2 + it.def * 1.5 + it.block * 0.8;
  const b = it.bonus;
  v += (b.hp ?? 0) * 0.3 + (b.atk ?? 0) * 2 + (b.def ?? 0) * 1.5 + (b.crit ?? 0) * 1.2 + (b.spd ?? 0) * 1.2 + (b.regen ?? 0) * 6 + (b.mv ?? 0) * 0.9;
  for (const sp of it.spells ?? []) v += 10 * sp.pw * (SHF[sp.sh] ?? 1) * (sp.ch / 8);
  for (const p of it.pas ?? []) v += 12 * p.pw;
  if (it.ult !== undefined) v += it.rar >= 7 ? 180 : 40;
  for (const e of it.ef ?? []) v += 8 * (e[1] ?? 1);
  for (const e of it.st ?? []) v += 22 * (e[1] ?? 1);
  v += (4 + it.ilvl) * RM[it.rar] * 0.85;
  if (it.rar >= 7) v += 120 + it.ilvl * 6;
  if (it.set !== undefined) v += 8;
  return Math.max(1, safeRound(safeMul(v, prisStarMul(it))));
}
function levelPower(lvl: number): number { return Math.round(baseHp(lvl) * 0.3 + baseAtk(lvl) * 2); }
function setBonusPower(eq: Eq): number {
  let v = 0; const c = setCounts(eq);
  for (let i = 0; i < c.length; i++) { if (c[i] >= 2) v += 36; if (c[i] >= 4) v += 90; }
  return v;
}
function powerTotal(lvl: number, eq: Eq): number {
  let s = levelPower(lvl) + setBonusPower(eq);
  for (const k of EQK) if (eq[k]) s += itemPower(eq[k] as Item, lvl);
  return s;
}
function powerBreak(lvl: number, eq: Eq): { total: number; level: number; set: number; items: { k: EqKey; n: string; p: number }[] } {
  const items: { k: EqKey; n: string; p: number }[] = [];
  for (const k of EQK) if (eq[k]) items.push({ k, n: (eq[k] as Item).name, p: itemPower(eq[k] as Item, lvl) });
  const level = levelPower(lvl), set = setBonusPower(eq);
  return { total: level + set + items.reduce((a, b) => a + b.p, 0), level, set, items };
}
function powerDelta(lvl: number, eq: Eq, it: Item, hand?: "rh" | "lh"): number {
  return powerTotal(lvl, simEq(eq, it, hand).eq) - powerTotal(lvl, eq);
}

const GENINFO = { nEn: 0, nCorr: 0, nRoom: 0, nRare: 0, nPack: 0, rooms: [] as { x: number; y: number; w: number; h: number }[] };
const inRoom = (x: number, y: number): boolean => GENINFO.rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
function enBase(d: number): number {
  if (d <= EARLY_SAFE_MAX) return 16 + Math.floor(d * 1.8);
  return Math.round(EN_BASE_D6 + (EN_BASE_CAP - EN_BASE_D6) * rampT(d));
}
function enCap(d: number): number {
  if (d <= EARLY_SAFE_MAX) return Math.min(EN_CAP_MAX, enBase(d) + 16 + Math.floor(d * 0.8) + 8);
  return Math.round(EN_CAP_D6 + (EN_CAP_MAX - EN_CAP_D6) * rampT(d));
}
function livEn(g: Game): number { return g.en.filter((e: En) => e.hp > 0 && !e.gob && !e.hunt).length; }
function occUsed(g: Game, used: Set<number>): void {
  used.add(g.hero.y * MW + g.hero.x);
  for (let k = 0; k < MW * MH; k++) if (g.map[k] === 2 || g.map[k] === TILE_UP) used.add(k);
  if (g.merchant) used.add(g.merchant.y * MW + g.merchant.x);
  if (g.portal) used.add(g.portal.y * MW + g.portal.x);
  for (const c of g.chests) used.add(c.y * MW + c.x);
  for (const e of g.en) if (e.hp > 0) used.add(e.y * MW + e.x);
  for (const d of g.drops) used.add(d.y * MW + d.x);
}
function pickWalk(g: Game, used: Set<number>, hx: number, hy: number, safe = 8, stairR = 5): number[] | null {
  const stairs: number[][] = [];
  for (let k = 0; k < MW * MH; k++) if (g.map[k] === 2) stairs.push([k % MW, (k / MW) | 0]);
  const cand: number[][] = [];
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    if (g.map[y * MW + x] !== 1) continue;
    const k = y * MW + x;
    if (used.has(k)) continue;
    if (Math.abs(x - hx) + Math.abs(y - hy) < safe) continue;
    if (stairs.some(([sx, sy]) => Math.abs(x - sx) + Math.abs(y - sy) < stairR)) continue;
    cand.push([x, y]);
  }
  if (!cand.length) return null;
  const p = cand[ri(cand.length)];
  used.add(p[1] * MW + p[0]);
  return p;
}
function pickNearTile(g: Game, used: Set<number>, x0: number, y0: number, r = 5): number[] | null {
  for (let t = 0; t < 48; t++) {
    const x = x0 + ri(2 * r + 1) - r, y = y0 + ri(2 * r + 1) - r;
    if (x === x0 && y === y0) continue;
    if (!walkable(g, x, y) || (x === g.hero.x && y === g.hero.y) || used.has(y * MW + x)) continue;
    used.add(y * MW + x);
    return [x, y];
  }
  return pickWalk(g, used, g.hero.x, g.hero.y, 6, 4);
}
function mkSuperElite(g: Game, x: number, y: number): En {
  return mkEnemy(g, x, y, 1, { full: true, se: true });
}
function seLootItem(d: number, kind?: Kind): Item {
  const roll = seLootPick(d);
  const ilvl = d + 1;
  if (roll.set && (kind === undefined || isArmor(kind))) {
    const ak = (kind && isArmor(kind) ? kind : pick(ARMOR_K)) as AK;
    return makeSetPiece(ilvl, ak, undefined, d);
  }
  return makeItem(ilvl, roll.rar, kind, d);
}
function cloneBoss(g: Game, src: En, x: number, y: number): En {
  const e: En = {
    ...src, id: NID++, x, y, ax: x, ay: y, hp: src.mhp, shd: src.mshd ?? 0,
    tr: src.tr.slice(), pal: src.pal.slice(), elR: src.elR ? src.elR.slice() : undefined,
    stun: 0, hit: 0, bump: 0, bdx: 0, bdy: 0, burn: 0, burnD: 0, slow: 0, weak: 0, fear: 0,
    bl: 0, blD: 0, poi: 0, poD: 0, doom: 0, doomD: 0, abIntro: false, phase: 1, abCd: 0
  };
  return e;
}
function maybeSpawnPrisThreats(g: Game): void {
  if (!prisGated(g)) return;
  const used = new Set<number>();
  occUsed(g, used);
  const d = g.depth;
  const bosses = g.en.filter((e: En) => e.hp > 0 && isPackBoss(e) && e.packId === undefined);
  for (const b of bosses) {
    const want = rollBossCopies(d);
    let n = 1;
    if (want > 1) {
      const packId = b.id;
      b.packId = packId;
      for (let i = 1; i < want; i++) {
        const c = pickNearTile(g, used, b.x, b.y, 4);
        if (!c) break;
        const copy = cloneBoss(g, b, c[0], c[1]);
        copy.packId = packId;
        g.en.push(copy);
        n++;
      }
    }
    b.bN = n;
    if (n > 1) {
      for (const e of g.en) if (e.packId === b.packId) e.bN = n;
      const tag = n === 3 ? "TRIPLE BOSS" : "DOUBLE BOSS";
      setBanner(g, tag, b.name + (n === 3 ? " appears in threes" : " has a twin"), "#ff4040", 8, 3.4);
      msg(g, tag + ": " + b.name, "#ff6060");
    }
    const nEsc = seBossEscorts(d);
    for (let i = 0; i < nEsc; i++) {
      const c = pickNearTile(g, used, b.x, b.y, 5);
      if (!c) continue;
      g.en.push(mkSuperElite(g, c[0], c[1]));
    }
  }
  if (!earlySafeDepth(d) && R() < seFloorChance(d)) {
    const n = 1 + (R() < 0.20 + 0.35 * rampT(d) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const c = pickWalk(g, used, g.hero.x, g.hero.y, 8, 5);
      if (c) g.en.push(mkSuperElite(g, c[0], c[1]));
    }
  }
}
let PACKID = 1;
function rollAffix(e: En, lesser = false): void {
  const bossy = e.cls === 2 || !!e.hunt;
  const wch = bossy ? 0.85 : lesser ? 0.15 : e.cls === 1 ? 0.5 : e.rare ? 0.45 : 0.22;
  if (R() < wch) e.elW = ELS[ri(ELS.length)];
  const nR = bossy ? (R() < 0.7 ? 1 + (R() < 0.35 ? 1 : 0) : 0) : lesser ? (R() < 0.10 ? 1 : 0) : e.cls === 1 ? (R() < 0.35 ? 1 : 0) : e.rare ? (R() < 0.4 ? 1 : 0) : (R() < 0.12 ? 1 : 0);
  const res: El[] = [];
  for (let i = 0; i < nR; i++) { const el = ELS[ri(ELS.length)]; if (el !== e.elW && !res.includes(el)) res.push(el); }
  if (res.length) e.elR = res;
  const sch = bossy && !e.hunt ? 0.45 : e.hunt ? 0.25 : lesser ? 0 : e.cls === 1 ? 0.12 : e.rare ? 0.18 : 0;
  if (sch && R() < sch) { e.mshd = e.shd = Math.round(e.mhp * (e.rare ? 0.22 : bossy ? 0.4 + R() * 0.15 : 0.28)); }
}
function elMul(e: En, el: El): number { if (e.elW === el) return 1.7; if (e.elR && e.elR.includes(el)) return 0.55; return 1; }
function hurtEn(g: Game, e: En, dmg: number): number {
  if (dmg <= 0 || e.hp <= 0) return 0;
  markHitDir(g, e);
  const fortune = petAbiOf(g, 5);
  if (fortune && (e.cls >= 1 || e.act)) dmg = Math.max(1, safeRound(dmg * (1 + 0.20 * petAbiMul(fortune))));
  if ((e.shd ?? 0) > 0) {
    const a = Math.min(e.shd as number, dmg);
    e.shd = (e.shd as number) - a; dmg -= a;
    if (a > 0) floatTxt(g, e.x + 0.35, e.y - 0.35, "(" + a + ")", "#9ae8ff");
    if (dmg <= 0) { e.hit = 0.15; return 0; }
  }
  e.hp -= dmg; e.hit = 0.2; e.awake = true;
  if (e.hp > 0 && e.act) actBossPhase(g, e);
  return dmg;
}
function stampRare(e: En, pack: number, lead: boolean): En {
  e.rare = 1; e.pack = pack; e.lead = lead ? 1 : 0;
  e.hp = e.mhp = Math.round(e.mhp * 1.75);
  e.atk = Math.max(1, Math.round(e.atk * 1.7));
  e.xp = Math.round(e.xp * 1.8);
  e.name = (lead ? "Pack Leader " : "Rare ") + e.name;
  rollAffix(e);
  return e;
}
function neighborsOf(g: Game, x: number, y: number, used: Set<number>, n: number, hx?: number, hy?: number): number[][] {
  const out: number[][] = [[x, y]];
  const q = [[x, y]];
  const stairs: number[][] = [];
  if (hx !== undefined) { for (let k = 0; k < MW * MH; k++) if (g.map[k] === 2) stairs.push([k % MW, (k / MW) | 0]); }
  const bad = (nx: number, ny: number) => hx !== undefined && (Math.abs(nx - hx!) + Math.abs(ny - hy!) < 8 || stairs.some(([sx, sy]) => Math.abs(nx - sx) + Math.abs(ny - sy) < 5));
  for (let i = 0; i < q.length && out.length < n; i++) {
    const [cx, cy] = q[i];
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + ox, ny = cy + oy, k = ny * MW + nx;
      if (!inb(nx, ny) || g.map[k] !== 1 || used.has(k) || bad(nx, ny)) continue;
      used.add(k); out.push([nx, ny]); q.push([nx, ny]);
      if (out.length >= n) break;
    }
  }
  return out;
}
function spawnRarePack(g: Game, used: Set<number>, hx: number, hy: number): number {
  const room = Math.max(0, enCap(g.depth) - livEn(g));
  if (room < 3) return 0;
  const size = Math.min(room, R() < 0.3 ? 5 : 3);
  for (let t = 0; t < 8; t++) {
    const c = pickWalk(g, used, hx, hy, 8, 5);
    if (!c) return 0;
    const spots = neighborsOf(g, c[0], c[1], used, size, hx, hy);
    if (spots.length < 3) continue;
    const pid = PACKID++;
    let n = 0;
    for (let i = 0; i < spots.length; i++) {
      const e = stampRare(mkEnemy(g, spots[i][0], spots[i][1], 0), pid, i === 0);
      g.en.push(e); n++;
    }
    GENINFO.nRare += n; GENINFO.nPack++;
    return n;
  }
  return 0;
}
function trickleSpawn(g: Game): void {
  if (g.mode !== "play" || g.vault || uiBlocked(g) || g.area === "camp" || isActFloor(g.depth)) return;
  if (livEn(g) >= enCap(g.depth)) return;
  const used = new Set<number>(); occUsed(g, used);
  if (!earlySafeDepth(g.depth) && R() < 0.28 * gemRareMul(g)) { spawnRarePack(g, used, g.hero.x, g.hero.y); return; }
  const c = pickWalk(g, used, g.hero.x, g.hero.y, 8, 5);
  if (!c) return;
  const eliteCh = Math.min(0.55, eliteChance(g.depth) * gemRareMul(g));
  g.en.push(mkEnemy(g, c[0], c[1], R() < eliteCh ? 1 : 0));
}
function collectDrop(g: Game, dr: Drop, showX?: number, showY?: number): boolean {
  const x = showX ?? dr.x, y = showY ?? dr.y;
  if (dr.pot) { g.potions++; msg(g, "Picked up a healing potion.", "#ff80a0"); floatTxt(g, x, y - 0.3, "+1 POTION", "#ff80a0"); g.sfx("coin"); return true; }
  if (dr.gold > 0) { const gg = Math.round(dr.gold * efGoldMul(g, null)); g.gold += gg; floatTxt(g, x, y - 0.3, "+" + gg + "g", GOLD); g.sfx("coin"); return true; }
  if (dr.item) {
    takePickedItem(g, dr.item, x, y);
    return true;
  }
  return true;
}
const PET_LOOT_RANGE = 10;
function petLootTarget(g: Game): { kind: "drop" | "chest"; x: number; y: number; drop?: Drop; chest?: Chest } | null {
  if (!g.eq.pet || uiBlocked(g) || g.mode !== "play" || g.area === "camp") return null;
  const h = g.hero;
  let best: { kind: "drop" | "chest"; x: number; y: number; drop?: Drop; chest?: Chest } | null = null, bd = PET_LOOT_RANGE + 0.01;
  for (const dr of g.drops) {
    // Pet keeps looting even when bags are full; overflow is auto-salvaged in collectDrop.
    const d = Math.abs(dr.x - h.x) + Math.abs(dr.y - h.y);
    if (d < bd && d <= PET_LOOT_RANGE) { bd = d; best = { kind: "drop", x: dr.x, y: dr.y, drop: dr }; }
  }
  for (const c of g.chests) {
    if (c.open) continue;
    const d = Math.abs(c.x - h.x) + Math.abs(c.y - h.y);
    if (d < bd && d <= PET_LOOT_RANGE) { bd = d; best = { kind: "chest", x: c.x, y: c.y, chest: c }; }
  }
  return best;
}

function allStars(eq: Eq): { it: Item; id: number; pw: number; defn: boolean }[] {
  const o: { it: Item; id: number; pw: number; defn: boolean }[] = [];
  for (const k of EQK) {
    const it = eq[k]; if (!it || !it.st || it.kind === "pet" || it.kind === "gem") continue;
    const defn = isArmor(it.kind) || it.kind === "shield";
    for (const e of it.st) o.push({ it, id: e[0], pw: (e[1] ?? 1) * prisStarMul(it), defn });
  }
  return o;
}
function nearFoe(g: Game, e: En, skip?: En): En | null {
  let b: En | null = null, bd = 4;
  for (const o of g.en) { if (o === e || o === skip || o.hp <= 0) continue; const d = Math.abs(o.x - e.x) + Math.abs(o.y - e.y); if (d > 0 && d < bd) { bd = d; b = o; } }
  return b;
}
function starOnHit(g: Game, tg: En, dmg: number, crit: boolean, st: Stats, died: boolean): void {
  for (const s of allStars(g.eq)) {
    if (s.defn) continue;
    const p = s.pw, id = s.id;
    let extra = 0;
    if (id === 0) extra = Math.max(1, Math.round(st.atk * 0.12 * p));
    if (id === 1 && tg.hp < tg.mhp * 0.35) extra = Math.max(1, Math.round(dmg * 0.2 * p));
    if (id === 4 && (tg.cls >= 1 || tg.rare || tg.hunt)) extra = Math.max(1, Math.round(dmg * 0.15 * p));
    if (id === 5 || id === 20) extra += Math.max(1, Math.round(dmg * 0.08 * p));
    if (id === 14 && crit) extra += Math.max(1, Math.round(dmg * 0.25 * p));
    if (id === 17) extra += Math.max(1, Math.round(dmg * 0.12 * p));
    if (id === 19) extra += Math.max(1, Math.round(dmg * 0.06 * p));
    if (extra > 0 && tg.hp > 0) { hurtEn(g, tg, extra); floatTxt(g, tg.x, tg.y - 0.55, "\u2605" + extra, GOLD); }
    if (id === 2) { const n = nearFoe(g, tg); if (n) { const sp = Math.max(1, Math.round(dmg * 0.25 * p)); hurtEn(g, n, sp); floatTxt(g, n.x, n.y, "\u2605" + sp, GOLD); } }
    if (id === 3) { tg.bl = Math.max(tg.bl ?? 0, 2); tg.blD = Math.max(tg.blD ?? 0, Math.max(1, Math.round(st.atk * 0.08 * p))); }
    if (id === 6) { const es = esOf(g); es.rage = Math.min(3, (es.rage ?? 0) + 1); }
    if (id === 7 && R() < 0.08 * p && tg.hp > 0) { tg.stun = Math.max(tg.stun, 1); floatTxt(g, tg.x, tg.y - 0.5, "\u2605STUN", "#80c0ff"); }
    if (id === 8) g.hero.hp = Math.min(calc(g.lvl, g.eq).maxHp, g.hero.hp + Math.max(1, Math.round(dmg * 0.04 * p)));
    if (id === 9 && R() < 0.06 * p && tg.hp > 0) hurtEn(g, tg, Math.max(1, Math.round(dmg * 0.4)));
    if (id === 10) tg.mk = (tg.mk ?? 0) + 1;
    if (id === 11 && R() < 0.12 * p) tg.slow = Math.max(tg.slow, 2);
    if (id === 12 && R() < 0.12 * p) { tg.burn = Math.max(tg.burn, 2); tg.burnD = Math.max(tg.burnD, Math.max(1, Math.round(st.atk * 0.1 * p))); }
    if (id === 13) { const n = nearFoe(g, tg); if (n) hurtEn(g, n, Math.max(1, Math.round(dmg * 0.3 * p))); }
    if (id === 15) tg.weak = Math.max(tg.weak, 2);
    if (id === 16 && R() < 0.08 * p) tg.fear = Math.max(tg.fear, 2);
    if (id === 18 && (died || tg.hp <= 0)) { const n = nearFoe(g, tg); if (n) hurtEn(g, n, Math.max(1, Math.round(dmg * 0.35 * p))); }
    if (id === 21 && (died || tg.hp <= 0)) g.hero.hp = Math.min(calc(g.lvl, g.eq).maxHp, g.hero.hp + Math.round(calc(g.lvl, g.eq).maxHp * 0.05 * p));
  }
  if (tg.hp <= 0 && !died) kill(g, tg);
}
function setOnHit(g: Game, tg: En, dmg: number, _crit: boolean, st: Stats, died: boolean): void {
  const c = setCounts(g.eq);
  if (c[0] >= 4) { const x = Math.max(1, Math.round(dmg * 0.12)); if (tg.hp > 0) hurtEn(g, tg, x); g.hero.hp = Math.min(calc(g.lvl, g.eq).maxHp, g.hero.hp + Math.max(1, Math.round(dmg * 0.03))); }
  if (c[4] >= 4 && tg.hp > 0) { const x = Math.max(1, Math.round(st.atk * 0.2)); hurtEn(g, tg, x); floatTxt(g, tg.x, tg.y - 0.4, String(x), "#d080ff"); }
  if (c[5] >= 4 && _crit) { if (tg.hp > 0) hurtEn(g, tg, Math.max(1, Math.round(dmg * 0.35))); if (R() < 0.1 && tg.hp > 0) hurtEn(g, tg, Math.max(1, Math.round(dmg * 0.5))); }
  if (c[8] >= 2 && R() < (c[8] >= 4 ? 0.22 : 0.12) && tg.hp > 0) { const n = c[8] >= 4 ? nearFoe(g, tg) : tg; const t = n ?? tg; hurtEn(g, t, Math.max(1, Math.round(st.atk * (c[8] >= 4 ? 0.25 : 0.14)))); }
  if (c[9] >= 2) tg.weak = Math.max(tg.weak, 2);
  if (c[9] >= 4) { g.hero.hp = Math.min(calc(g.lvl, g.eq).maxHp, g.hero.hp + Math.max(1, Math.round(dmg * 0.08))); if (R() < 0.08) tg.fear = Math.max(tg.fear, 2); }
  if (c[6] >= 4 && (died || tg.hp <= 0)) g.hero.hp = Math.min(calc(g.lvl, g.eq).maxHp, g.hero.hp + Math.round(calc(g.lvl, g.eq).maxHp * 0.06));
}
function starPreHurt(g: Game, e: En, dmgIn: number, st: Stats, ranged: boolean): number {
  let d = dmgIn;
  const es = esOf(g), h = g.hero;
  for (const s of allStars(g.eq)) {
    if (!s.defn) continue;
    const p = s.pw, id = s.id;
    if (id === 0) d = Math.max(1, Math.round(d * (1 - 0.06 * p)));
    if (id === 7 || id === 14) d = Math.max(1, Math.round(d * (1 - 0.05 * p)));
    if (id === 5 && R() < 0.06 * p) { floatTxt(g, h.x, h.y - 0.5, "\u2605DODGE", "#80ffc0"); return 0; }
    if (id === 16 && R() < 0.04 * p) { floatTxt(g, h.x, h.y - 0.5, "\u2605SAFE", GOLD); return 0; }
    if (id === 19 && R() < 0.05 * p) { floatTxt(g, h.x, h.y - 0.5, "\u2605DODGE", "#80ffc0"); return 0; }
    if (id === 9 && d > st.maxHp * 0.15) d = Math.max(1, Math.round(d * (1 - 0.2 * p)));
    if (id === 11 && h.hp < st.maxHp * 0.25 && R() < 0.25 * p) d = Math.max(1, Math.round(d * 0.5));
    if (id === 15 && (e.cls >= 1 || e.rare || e.hunt)) d = Math.max(1, Math.round(d * (1 - 0.08 * p)));
    if (id === 18 && es.still) d = Math.max(1, Math.round(d * (1 - 0.08 * p)));
    if (id === 20 && h.hp > st.maxHp * 0.7) d = Math.max(1, Math.round(d * (1 - 0.04 * p)));
    if (id === 21 && ranged) d = Math.max(1, Math.round(d * (1 - 0.08 * p)));
    if (id === 2 && e.hp > 0) hurtEn(g, e, Math.max(1, Math.round(st.atk * 0.08 * p)));
    if (id === 8 && R() < 0.25 * p) h.hp = Math.min(st.maxHp, h.hp + Math.max(1, Math.round(st.maxHp * 0.02 * p)));
    if (id === 12 && R() < 0.15 * p) e.slow = Math.max(e.slow, 2);
    if (id === 13 && e.hp > 0) hurtEn(g, e, Math.max(1, Math.round(st.atk * 0.1 * p)));
    if (id === 17 && h.hp < st.maxHp * 0.5) h.hp = Math.min(st.maxHp, h.hp + Math.max(1, Math.round(st.maxHp * 0.03 * p)));
  }
  const c = setCounts(g.eq);
  if (c[1] >= 4) { d = Math.max(1, Math.round(d * 0.9)); if (e.hp > 0) hurtEn(g, e, Math.max(1, Math.round(st.atk * 0.08))); }
  return d;
}
function packStep(g: Game, e: En): boolean {
  if (!e.rare || !e.pack) return false;
  if (!e.lead) {
    const lead = g.en.find((o: En) => o.pack === e.pack && o.lead && o.hp > 0);
    if (lead) {
      if (lead.awake) e.awake = true;
      const pd = Math.abs(lead.x - e.x) + Math.abs(lead.y - e.y);
      if (pd > 3) {
        const dx = Math.sign(lead.x - e.x), dy = Math.sign(lead.y - e.y);
        const try1 = Math.abs(lead.x - e.x) >= Math.abs(lead.y - e.y) ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
        for (const [ox, oy] of try1) {
          const nx = e.x + ox, ny = e.y + oy;
          if (ox === 0 && oy === 0) continue;
          if (walkable(g, nx, ny) && !(nx === g.hero.x && ny === g.hero.y)) { e.x = nx; e.y = ny; e.face = ox !== 0 ? ox : e.face; return true; }
        }
      }
    }
  }
  if (e.pack) for (const o of g.en) if (o.pack === e.pack && o.awake && o.hp > 0) e.awake = true;
  return false;
}

function prisCat(it: Item | null | undefined): "w" | "a" | "p" | null {
  if (!it || it.rar < 7) return null;
  if (it.kind === "pet") return "p";
  if (isArmor(it.kind)) return "a";
  return "w";
}
function prisItems(eq: Eq, cat: "w" | "a" | "p"): Item[] {
  const o: Item[] = [];
  for (const k of EQK) { const it = eq[k]; if (it && prisCat(it) === cat) o.push(it); }
  return o;
}
function prisMsg(_cat: "w" | "a"): string {
  return "";
}
function stripExtraPris(_eq: Eq, _lvl: number, _keep?: Item): Item[] { return []; }
function fitEq(eq: Eq, it: Item, hand: "rh" | "lh" | undefined, _lvl: number): { eq: Eq; back: Item[] } {
  return simEq(eq, it, hand);
}
function fixPrisLoad(_g: Game): Item[] { return []; }
function ultsOf(eq: Eq): { slot: EqKey; it: Item }[] {
  const o: { slot: EqKey; it: Item }[] = [];
  for (const k of EQK) {
    const it = eq[k]; if (!it || it.ult === undefined || it.rar < 7) continue;
    if (it.kind === "pet" || it.kind === "shield") continue;
    o.push({ slot: k, it });
  }
  return o;
}
// Fused Prismatic ultimate (raw42): every equipped Prismatic ult (max 6 = 4 armor + 2 weapons) is one button / one attack.
const PRIS_FUSE_MUL = 2.5;
function prisFuseCount(eq: Eq): number { return Math.max(0, Math.min(6, ultsOf(eq).length)); }
function prisFuseMul(n: number): number {
  const k = Math.max(1, Math.min(6, n | 0));
  return k <= 1 ? 1 : safePow(PRIS_FUSE_MUL, k - 1);
}
function prisUltMul(g: Game, w?: Item | null): number {
  const it = w || fusedBaseItem(g.eq);
  if (!it) return 1;
  const n = Math.max(1, Math.min(6, prisFuseCount(g.eq)));
  let m = 1;
  if (it.rar >= 7) m *= 2.5;
  m = safeMul(m, fusedStarMul(g.eq));
  if (fusedGolden(g.eq) || it.golden) m = safeMul(m, 4);
  m = safeMul(m, prisFuseMul(n));
  return m;
}
function fmtUltMul(m: number): string {
  const x = safeNum(m);
  if (x >= 100) return String(Math.round(x));
  const r = Math.round(x * 10) / 10;
  return Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : r.toFixed(1);
}
function ultBtnName(g: Game): string {
  const it = fusedBaseItem(g.eq);
  const u = it && it.ult !== undefined ? (ULTS[it.ult] ?? ULTS[0]) : null;
  return u ? u.n : "ULTIMATE";
}
function ultCdText(left: number): string {
  return Math.floor(left / 60000) + ":" + String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
}
function ultMulText(g: Game): string {
  const n = prisFuseCount(g.eq);
  const mul = "x" + fmtUltMul(prisUltMul(g));
  return n > 1 ? mul + " Prismatic fused" : mul;
}
function ultBtnLabel(g: Game): string { return ultBtnName(g) + " " + ultMulText(g); }
// Prismatic ults count as every element at once. Resolve against the target's
// resist/weakness table by picking the single best existing magicWepRaw path
// (highest multiplicative score: elMul, holy-vs-undead 1.75, hell 1.3).
// Averaging would wash a 1.7 weakness against 0.55 resists toward ~1 and under-sell
// a blast that hits every type; the existing resolver already defines per-element
// damage, so the rainbow ult uses the most player-favorable one. Void's %HP add
// applies only when void wins that table (it is a void rider, not a selection score).
function ultBestEl(e: En): El {
  let best: El = ELS[0], bestS = -1;
  for (let i = 0; i < ELS.length; i++) {
    const el = ELS[i];
    let s = elMul(e, el);
    if (el === "holy" && UNDEAD.includes(e.f)) s *= 1.75;
    if (el === "hell") s *= 1.3;
    if (s > bestS) { bestS = s; best = el; }
  }
  return best;
}
function fusedStarMul(eq: Eq): number {
  let m = 1;
  for (const u of ultsOf(eq)) m = Math.max(m, prisStarMul(u.it));
  return m;
}
function fusedGolden(eq: Eq): boolean { return ultsOf(eq).some((u: { it: Item }) => !!u.it.golden); }
function fusedBaseItem(eq: Eq): Item | null {
  const all = ultsOf(eq);
  if (!all.length) return null;
  let best = all[0].it;
  for (const u of all) if (u.it.ilvl > best.ilvl || (u.it.ilvl === best.ilvl && !!u.it.golden && !best.golden)) best = u.it;
  return best;
}
function fusedUltReadyAt(g: Game): number {
  let t = 0;
  for (const u of ultsOf(g.eq)) t = Math.max(t, ultCd(g, u.slot));
  return t;
}
function setFusedUltCd(g: Game, t: number): void {
  if (!g.ultAts) g.ultAts = {};
  for (const u of ultsOf(g.eq)) g.ultAts[u.slot] = t;
  syncLegacyUlt(g);
}
function packUltCds(g: Game): Partial<Record<EqKey, number>> {
  const o: Partial<Record<EqKey, number>> = {};
  const now = Date.now();
  for (const k of EQK) {
    const t = g.ultAts && g.ultAts[k] ? g.ultAts[k]! : 0;
    const left = Math.max(0, Math.round(t - now));
    if (left > 0) o[k] = left;
  }
  return o;
}
function readUltCds(raw: unknown, fallbackW: number, fallbackA: number, eq: Eq, remain: boolean): Partial<Record<EqKey, number>> {
  const out: Partial<Record<EqKey, number>> = {};
  const now = Date.now();
  const clamp = (t: number): number => Math.max(0, Math.min(t, now + ULT_CD));
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    for (const k of EQK) {
      const v = rec[k];
      if (typeof v === "number" && isFinite(v) && v > 0) out[k] = clamp(remain ? now + Math.min(ULT_CD, v) : v);
    }
  }
  if (!Object.keys(out).length) {
    const w = ultsOf(eq).find((u: { slot: EqKey; it: Item }) => !isArmor(u.it.kind));
    const a = ultsOf(eq).find((u: { slot: EqKey; it: Item }) => isArmor(u.it.kind));
    if (w && fallbackW > now) out[w.slot] = clamp(fallbackW);
    if (a && fallbackA > now) out[a.slot] = clamp(fallbackA);
  }
  return out;
}
function syncLegacyUlt(g: Game): void {
  const all = ultsOf(g.eq);
  const w = all.find((u: { slot: EqKey; it: Item }) => !isArmor(u.it.kind));
  const a = all.find((u: { slot: EqKey; it: Item }) => isArmor(u.it.kind));
  g.ultAt = (w && g.ultAts && g.ultAts[w.slot]) || 0;
  g.ultAtA = (a && g.ultAts && g.ultAts[a.slot]) || 0;
}
function ultCd(g: Game, slot: EqKey): number { return (g.ultAts && g.ultAts[slot]) || 0; }
function setUltCd(g: Game, slot: EqKey, t: number): void {
  if (!g.ultAts) g.ultAts = {};
  g.ultAts[slot] = t;
  syncLegacyUlt(g);
}

const ULT_LAYOUT = { wrapMax: 440, ar: 300 / 240, inset: 4, ultW: 96, ultH: 64, ultWSm: 80, ultHSm: 56, ultGap: 8, minTap: 48, padGap: 16 };
function ultBtnSize(vw: number, vh: number): { w: number; h: number } {
  if (vh < 500 || vw <= 360) return { w: ULT_LAYOUT.ultWSm, h: ULT_LAYOUT.ultHSm };
  return { w: ULT_LAYOUT.ultW, h: ULT_LAYOUT.ultH };
}
function layoutPlay(vw: number, vh: number, nUlt: number, safeBottom: number = 0): { vw: number; vh: number; wrapW: number; stageW: number; stageH: number; ctrlY: number; ults: { x: number; y: number; w: number; h: number }[]; visible: boolean; overStage: boolean; padW: number } {
  const wrapW = Math.min(ULT_LAYOUT.wrapMax, Math.max(1, vw));
  const n = Math.max(0, Math.min(6, Math.floor(nUlt)));
  const sz = ultBtnSize(vw, vh);
  const btnW = sz.w, btnH = sz.h;
  const ultColH = n <= 0 ? 0 : btnH;
  const padSize = layoutMetrics(vw, vh, safeBottom).padSize;
  const padW = padSize;
  const padH = padSize;
  const rowH = vh < 500 ? 40 : 50;
  const btnsH = 4 * rowH + 18;
  const ctrlH = Math.max(padH, btnsH, ultColH) + 12;
  const maxStageH = Math.max(140, vh - ctrlH - safeBottom);
  let stageW = wrapW, stageH = stageW * ULT_LAYOUT.ar;
  if (stageH > maxStageH) { stageH = maxStageH; stageW = stageH / ULT_LAYOUT.ar; }
  const ctrlY = stageH + 4;
  const xRight = wrapW - ULT_LAYOUT.inset - btnW;
  const ults: { x: number; y: number; w: number; h: number }[] = [];
  if (n > 0) ults.push({ x: xRight, y: ctrlY, w: btnW, h: btnH });
  const overStage = ults.some((b) => b.y < stageH - 0.5);
  const farFromPad = n === 0 || ults[0].x >= padW + ULT_LAYOUT.padGap - 0.5;
  const visible = n === 0 || (farFromPad && ults.every((b) => b.x >= -0.5 && b.y >= stageH - 0.5 && b.x + b.w <= wrapW + 0.5 && b.y + b.h <= vh + 0.5 && b.w >= ULT_LAYOUT.minTap && b.h >= ULT_LAYOUT.minTap) && !overStage);
  return { vw, vh, wrapW, stageW, stageH, ctrlY, ults, visible, overStage, padW };
}

const BAG_PORT = { scale: 5, ox: 6, oy: 5, hero: 24, pet: 16, gap: 3, pad: 3 };
function bagPortraitMetrics(): { scale: number; w: number; h: number; dir: number } {
  const s = BAG_PORT.scale;
  const w = (BAG_PORT.ox + BAG_PORT.hero + BAG_PORT.gap + BAG_PORT.pet + BAG_PORT.pad) * s;
  const h = (BAG_PORT.oy + 26 + BAG_PORT.pad) * s;
  return { scale: s, w, h, dir: 0 };
}
function bagPortraitInfo(eq: Eq): { scale: number; w: number; h: number; dir: number; slots: EqKey[]; glow: boolean; front: boolean; key: string } {
  const m = bagPortraitMetrics();
  const slots = EQK.filter((k: EqKey) => !!eq[k]);
  const rh = eq.rh;
  const glow = !!(rh && (rh.kind === "beamsword" || rh.rar >= 1 || (rh.wel && (rh.kind === "wand" || rh.kind === "staff"))));
  const key = EQK.map((k: EqKey) => { const it = eq[k]; return it ? it.id + ":" + it.rar + ":" + it.kind : ""; }).join("|");
  return { ...m, slots, glow, front: true, key };
}
function drawBagPortrait(ctx: CanvasRenderingContext2D, eq: Eq): { scale: number; w: number; h: number; dir: number } {
  const m = bagPortraitMetrics();
  const s = m.scale;
  ctx.imageSmoothingEnabled = false;
  (ctx as CanvasRenderingContext2D & { imageSmoothingQuality?: string }).imageSmoothingQuality = "low";
  ctx.clearRect(0, 0, m.w, m.h);
  ctx.fillStyle = "#14101c";
  ctx.fillRect(0, 0, m.w, m.h);
  let topRar = -1;
  for (const k of EQK) { const it = eq[k]; if (it && it.rar > topRar) topRar = it.rar; }
  if (topRar >= 1) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = RC[topRar];
    ctx.fillRect(s, s, m.w - 2 * s, m.h - 2 * s);
    ctx.globalAlpha = 1;
  }
  const rh = eq.rh;
  const q: Pose = { ...P0, glow: (rh && (rh.kind === "beamsword" || rh.rar >= 3)) ? 0.7 : 0 };
  drawHero(ctx, BAG_PORT.ox * s, BAG_PORT.oy * s, s, 1, eq, 0, q, 0);
  if (eq.pet) drawPrisPiece(painter(ctx, (BAG_PORT.ox + BAG_PORT.hero + BAG_PORT.gap) * s, (BAG_PORT.oy + 8) * s, s, false, 0), eq.pet, (q: Pt) => drawPetSprite(q, eq.pet!.pt ?? 0));
  return m;
}
function bagPortraitDataUrl(eq: Eq): string {
  const m = bagPortraitMetrics();
  const c = document.createElement("canvas");
  c.width = m.w; c.height = m.h;
  const x = c.getContext("2d");
  if (x) drawBagPortrait(x, eq);
  try { return c.toDataURL(); } catch { return ""; }
}

function simActLoot(nActs: number): { sources: Record<string, number[]>; blend: number[]; n: number } {
  const z = (): number[] => [0, 0, 0, 0, 0, 0, 0, 0];
  const src: Record<string, number[]> = { regular: z(), rare: z(), elite: z(), miniboss: z(), chest: z(), vault: z(), goblin: z(), actboss: z(), shop: z(), camp: z() };
  const add = (c: number[], it: Item): void => { c[lootRarBucket(it)]++; };
  const chestItems = (d: number, vault: boolean, c: number[]): void => {
    const cr = rollChestRar(d, vault);
    const plan = chestLoot(cr, vault, d);
    for (let i = 0; i < plan.n; i++) {
      let it = makeItem(plan.ilvl, rollRar(plan.f, plan.min, d));
      if (cr >= 4 && isArmor(it.kind) && it.rar < 7 && R() < CHEST_SET_CH) it = makeSetPiece(plan.ilvl, it.kind as AK);
      else it = maybeSet(it);
      add(c, it);
    }
  };
  for (let a = 0; a < nActs; a++) {
    const start = 1 + (a % 4) * 5;
    for (let k = 0; k < 5; k++) {
      const d = start + k;
      const actFl = d > 0 && d % 5 === 0;
      const nEn = enBase(d);
      const eliteCh = eliteChance(d);
      for (let i = 0; i < nEn; i++) {
        if (R() < eliteCh) { if (R() < 0.6) add(src.elite, maybeSet(makeItem(d, rollRar(1.22, 0, d)))); }
        else if (R() < 0.12) add(src.regular, maybeSet(makeItem(d, rollRar(1, 0, d))));
      }
      const nPacks = rollPacks(d);
      for (let p = 0; p < nPacks; p++) {
        const size = R() < 0.3 ? 5 : 3;
        for (let i = 0; i < size; i++) if (R() < 0.32) add(src.rare, maybeSet(makeItem(d, rollRar(1.12, 0, d))));
      }
      if (!actFl && d > EARLY_SAFE_MAX && R() < 0.07) {
        const n = 1 + Math.floor(R() * 3);
        for (let i = 0; i < n; i++) add(src.miniboss, maybeSet(makeItem(d + 1, rollRar(1.35, 0, d))));
      }
      if (d > EARLY_SAFE_MAX && R() < Math.min(0.5, 0.2 + d * 0.01)) {
        if (R() < 0.6) add(src.elite, maybeSet(makeItem(d, rollRar(1.22, 0, d))));
      }
      const nCh = 2 + Math.floor(R() * 3);
      for (let i = 0; i < nCh; i++) chestItems(d, false, src.chest);
      if (!actFl && d >= 2 && R() < 0.04) {
        const n = 3 + Math.floor(R() * 3);
        for (let i = 0; i < n; i++) chestItems(d, true, src.vault);
      }
      if (d >= 3 && R() < 0.03) {
        const n = 3 + Math.floor(R() * 3);
        for (let i = 0; i < n; i++) {
          const r = jackpotRar(d);
          add(src.goblin, maybeSet(makeItem(d + 1, r)));
        }
      }
      if (actFl) {
        const act = Math.max(1, Math.floor(d / 5));
        const n = actLootCount(act, d);
        for (let i = 0; i < n; i++) add(src.actboss, actLootItem(act, d));
      }
    }
    const dEnd = start + 4;
  }
  const blend = z();
  for (const k of ["regular", "rare", "elite", "miniboss", "chest", "vault", "goblin", "actboss"]) for (let i = 0; i < 8; i++) blend[i] += src[k][i];
  const n = blend.reduce((a: number, b: number) => a + b, 0);
  return { sources: src, blend, n };
}

function eqScore(lvl: number, eq: Eq): number {
  const s = calc(lvl, eq);
  let v = s.atk * 2 * (1 + s.crit / 100) * (1 + s.spd / 100) + s.def * 1.5 + s.maxHp * 0.3 + s.regen * 6 + s.block * s.def * 0.02 + s.ward * 0.3;
  if (s.range > 0 || s.reach > 1 || s.cleave) v *= 1.05;
  for (const sp of weaponSpells(eq)) v += s.atk * 2 * (sp.ch / 100) * sp.pw * SHF[sp.sh] * 2.5;
  for (const p of allPassives(eq)) v += s.atk * p.pw * 1.4;
  v += s.atk * 4 * ultsOf(eq).length;
  if (eq.pet) v += s.atk * 2.5 * petPower(lvl, eq.pet);
  for (const k of EQK) { const it = eq[k]; if (it && it.ef) v += s.atk * 0.3 * it.ef.length; }
  v *= 1 + s.mv / 1000;
  return v;
}
// Dual-wield model (always supported):
//   Main hand (rh) = any 1H weapon. Off hand (lh) = any 1H weapon OR a shield.
//   Any 1H type mix is legal (axe+sword, claw+wand, two of the same, etc.).
//   Combat uses combined stats from calc(): off-hand weapon adds 70% of its itemAtk
//   (85% if both are claws) and +10 double-strike ( +22 if both claws). Attack mode
//   (range, melee, magic, reach, cleave, pierce, stun, kind extras) comes from the
//   main hand. Off-hand spells, ults, stars, gems, and set pieces still apply.
//   1H+shield uses full shield def/block in the same calc. Scoring is eqScore (atk,
//   attack speed/crit, defense, HP, spells, passives, ults, pet, gems, stars, sets)
//   with no 2H multiplier — 2H alone, 1H+1H, and 1H+shield compete on raw power.
const HAND_1H_CAP = 24;
const HAND_SH_CAP = 12;
const HAND_2H_CAP = 16;
function handItemSrc(g: Game, it: Item): "bag" | "eq" {
  if (g.eq.rh === it || g.eq.lh === it) return "eq";
  return "bag";
}
function handProxy(it: Item): number {
  const stars = it.st ? it.st.length : 0;
  const base = it.kind === "shield" ? itemDef(it) : itemAtk(it);
  return base * 10 + it.rar * 1000 + stars * 20 + it.ilvl;
}
function takeTopItems(items: Item[], cap: number, keep: Item[]): Item[] {
  const out: Item[] = [];
  const seen = new Set<Item>();
  for (const it of keep) if (it && !seen.has(it)) { seen.add(it); out.push(it); }
  const rest = items.filter((it: Item) => !seen.has(it)).sort((a: Item, b: Item) => handProxy(b) - handProxy(a));
  for (const it of rest) {
    if (out.length >= cap) break;
    out.push(it);
  }
  return out;
}
function simHandEq(eq: Eq, rh: Item | null, lh: Item | null): Eq {
  const n: Eq = { ...eq, rh, lh };
  if (isTwo(n.rh)) n.lh = null;
  return n;
}
interface HandPick { rh: Item | null; lh: Item | null; score: number; }
interface PairReco { a: Item; b: Item; gainPct: number; pairScore: number; twoScore: number; kind: "pair" | "shield"; line: string; debug: string; }
function collectHandPool(g: Game): { one: Item[]; shields: Item[]; two: Item[] } {
  const one: Item[] = [], shields: Item[] = [], two: Item[] = [];
  const seen = new Set<Item>();
  const add = (it: Item | null): void => {
    if (!it || seen.has(it) || isGem(it) || it.kind === "pet" || isArmor(it.kind)) return;
    seen.add(it);
    if (isTwo(it)) two.push(it);
    else if (it.kind === "shield") shields.push(it);
    else if (isOneHand(it)) one.push(it);
  };
  add(g.eq.rh); add(g.eq.lh);
  for (const it of g.bag) add(it);
  return { one, shields, two };
}
function bestHandLoadout(g: Game): HandPick {
  const curEq = g.eq;
  const cur = eqScore(g.lvl, curEq);
  let best: HandPick = { rh: curEq.rh, lh: curEq.lh, score: cur };
  const consider = (rh: Item | null, lh: Item | null): void => {
    if (rh && lh && rh === lh) return;
    if (isTwo(rh)) lh = null;
    if (lh && isTwo(lh)) return;
    if (lh && !isOneHand(lh) && lh.kind !== "shield") return;
    if (rh && !isOneHand(rh) && !isTwo(rh)) return;
    const sc = eqScore(g.lvl, simHandEq(curEq, rh, lh));
    if (sc > best.score) best = { rh, lh, score: sc };
  };
  const pool = collectHandPool(g);
  const keep1: Item[] = [];
  const wornRh = curEq.rh, wornLh = curEq.lh;
  if (wornRh && isOneHand(wornRh)) keep1.push(wornRh);
  if (wornLh && isOneHand(wornLh)) keep1.push(wornLh);
  const keepS: Item[] = [];
  if (wornLh && wornLh.kind === "shield") keepS.push(wornLh);
  const keep2: Item[] = [];
  if (wornRh && isTwo(wornRh)) keep2.push(wornRh);
  const ones = takeTopItems(pool.one, HAND_1H_CAP, keep1);
  const shs = takeTopItems(pool.shields, HAND_SH_CAP, keepS);
  const twos = takeTopItems(pool.two, HAND_2H_CAP, keep2);
  for (const tw of twos) consider(tw, null);
  for (let i = 0; i < ones.length; i++) {
    for (let j = 0; j < ones.length; j++) if (i !== j) consider(ones[i], ones[j]);
    for (const sh of shs) consider(ones[i], sh);
  }
  return best;
}
function handInvKey(g: Game): string {
  const id = (it: Item | null): string => it ? String(it.id) : "-";
  const ids = (arr: Item[]): string => arr.map((it: Item) => String(it.id)).join(",");
  return g.lvl + "|" + id(g.eq.rh) + "/" + id(g.eq.lh) + "|b:" + ids(g.bag);
}
let handRecoCache: { key: string; reco: PairReco | null } | null = null;
function compare2Hvs1HPair(g: Game): PairReco | null {
  const key = handInvKey(g);
  if (handRecoCache && handRecoCache.key === key) return handRecoCache.reco;
  const two = isTwo(g.eq.rh) ? g.eq.rh : null;
  if (!two) { handRecoCache = { key, reco: null }; return null; }
  const twoScore = eqScore(g.lvl, g.eq);
  const pool = collectHandPool(g);
  const ones = takeTopItems(pool.one, HAND_1H_CAP, []);
  const shs = takeTopItems(pool.shields, HAND_SH_CAP, g.eq.lh && g.eq.lh.kind === "shield" ? [g.eq.lh] : []);
  const acc: { a: Item | null; b: Item | null; score: number; kind: "pair" | "shield" } = { a: null, b: null, score: -1, kind: "pair" };
  const consider = (a: Item, b: Item, kind: "pair" | "shield"): void => {
    const sc = eqScore(g.lvl, simHandEq(g.eq, a, b));
    if (sc > acc.score) { acc.a = a; acc.b = b; acc.score = sc; acc.kind = kind; }
  };
  for (let i = 0; i < ones.length; i++) {
    for (let j = 0; j < ones.length; j++) if (i !== j) consider(ones[i], ones[j], "pair");
    for (const sh of shs) consider(ones[i], sh, "shield");
  }
  if (!acc.a || !acc.b || acc.score <= twoScore) { handRecoCache = { key, reco: null }; return null; }
  const gainPct = twoScore > 0 ? ((acc.score - twoScore) / twoScore) * 100 : 100;
  const label = acc.kind === "shield"
    ? ("1H + shield beats your 2H by +" + gainPct.toFixed(1) + "%: " + acc.a.name + " + " + acc.b.name)
    : ("Two 1H items beat your 2H by +" + gainPct.toFixed(1) + "%: " + acc.a.name + " + " + acc.b.name);
  const reco: PairReco = { a: acc.a, b: acc.b, gainPct, pairScore: acc.score, twoScore, kind: acc.kind, line: label, debug: "2H " + Math.round(twoScore) + " vs " + (acc.kind === "shield" ? "1H+shield " : "1H+1H ") + Math.round(acc.score) + " (+" + gainPct.toFixed(1) + "%)" };
  handRecoCache = { key, reco };
  return reco;
}
function applyHandLoadout(g: Game, rh: Item | null, lh: Item | null): boolean {
  if (isTwo(rh)) lh = null;
  if (g.eq.rh === rh && g.eq.lh === lh) return false;
  const incoming: Item[] = [];
  if (rh && rh !== g.eq.rh && rh !== g.eq.lh) incoming.push(rh);
  if (lh && lh !== g.eq.rh && lh !== g.eq.lh && lh !== rh) incoming.push(lh);
  const srcs = incoming.map((it: Item) => handItemSrc(g, it));
  const displaced: Item[] = [];
  if (g.eq.rh && g.eq.rh !== rh && g.eq.rh !== lh) displaced.push(g.eq.rh);
  if (g.eq.lh && g.eq.lh !== rh && g.eq.lh !== lh) displaced.push(g.eq.lh);
  const popped: Item[][] = displaced.map((d: Item) => popSocketGems(d));
  for (const it of incoming) {
    const i = g.bag.indexOf(it);
    if (i >= 0) g.bag.splice(i, 1);
  }
  g.eq = { ...g.eq, rh, lh };
  const prefer = rh ?? lh ?? undefined;
  for (const gems of popped) relocatePoppedGems(g, gems, prefer);
  for (const d of displaced) takeItemOrSalvage(g, d, g.hero.x, g.hero.y);
  if (rh) autoSocketItem(g, rh);
  if (lh) autoSocketItem(g, lh);
  handRecoCache = null;
  return true;
}
function optimizeHands(g: Game): boolean {
  if (!g.autoEq) return false;
  const best = bestHandLoadout(g);
  const cur = eqScore(g.lvl, g.eq);
  if (best.score <= cur) return false;
  if (best.rh === g.eq.rh && best.lh === g.eq.lh) return false;
  if (!applyHandLoadout(g, best.rh, best.lh)) return false;
  g.sfx("equip");
  return true;
}
function wouldAutoEquip(g: Game, it: Item): { eq: Eq; back: Item[] } | null {
  if (!g.autoEq || it.kind === "gem") return null;
  const cur = eqScore(g.lvl, g.eq);
  const hands: ("rh" | "lh" | undefined)[] = isOneHand(it) ? ["rh", "lh"] : [undefined];
  let best = cur;
  let pick: { eq: Eq; back: Item[] } | null = null;
  for (const hd of hands) {
    const res = fitEq(g.eq, it, hd, g.lvl);
    let worn = false;
    for (const k of EQK) if (res.eq[k] === it) worn = true;
    if (!worn) continue;
    const sc = eqScore(g.lvl, res.eq);
    if (sc > best) { best = sc; pick = res; }
  }
  return pick;
}
function tryAutoEquip(g: Game, it: Item): boolean {
  const pick = wouldAutoEquip(g, it);
  if (!pick) return false;
  g.eq = pick.eq;
  for (const b of pick.back) {
    relocatePoppedGems(g, popSocketGems(b), it);
    takeItemOrSalvage(g, b, g.hero.x, g.hero.y);
  }
  g.hero.hp = Math.min(g.hero.hp, calc(g.lvl, g.eq).maxHp);
  g.sfx("equip");
  runAutoCombine(g);
  return true;
}
// Constant gear optimization: the bag improves what is worn.
// Uses the same wouldAutoEquip / eqScore rules (1H/2H/shield hands, set bonuses).
// Only swaps on a strictly better score (no ping-pong). Displaced items return to the bag.
// The retired item stash is never read. autoCombineOn gates combining only; optimize runs whenever auto-equip is on.
function optimizeEquipped(g: Game): boolean {
  if (!g.autoEq) return false;
  let changed = false;
  for (let guard = 0; guard < 16; guard++) {
    const step = optimizeEquippedStep(g);
    const hands = optimizeHands(g);
    if (!step && !hands) break;
    changed = true;
  }
  if (changed) g.hero.hp = Math.min(g.hero.hp, calc(g.lvl, g.eq).maxHp);
  return changed;
}
function optimizeEquippedStep(g: Game): boolean {
  const cur = eqScore(g.lvl, g.eq);
  let bestSc = cur;
  let bestIt: Item | null = null;
  let bestSrc: "bag" | null = null;
  const consider = (it: Item, src: "bag"): void => {
    if (!it || isGem(it)) return;
    const pick = wouldAutoEquip(g, it);
    if (!pick) return;
    const sc = eqScore(g.lvl, pick.eq);
    if (sc > bestSc) { bestSc = sc; bestIt = it; bestSrc = src; }
  };
  for (const it of g.bag) consider(it, "bag");
  if (!bestIt || !bestSrc || bestSc <= cur) return false;
  const it = bestIt;
  const pick = wouldAutoEquip(g, it);
  if (!pick) return false;
  const i = g.bag.indexOf(it);
  if (i < 0) return false;
  g.bag.splice(i, 1);
  g.eq = pick.eq;
  for (const b of pick.back) {
    relocatePoppedGems(g, popSocketGems(b), it);
    takeItemOrSalvage(g, b, g.hero.x, g.hero.y);
  }
  autoSocketItem(g, it);
  g.sfx("equip");
  return true;
}

const SCSH = { t: 0, dur: 0.36, amp: 0 };
function rumble(g: Game, ms: number): void {
  if (g.muted) return;
  try { const nav = (typeof navigator !== "undefined" ? navigator : null) as { vibrate?: (n: number) => void } | null; if (nav && typeof nav.vibrate === "function") nav.vibrate(ms); } catch { /* no haptic */ }
}
function superShake(g: Game): void {
  SCSH.t = SCSH.dur; SCSH.amp = 6; // refresh, do not accumulate
  rumble(g, 70);
}
function shakeOff(g: Game): number[] {
  const a = Math.min(8, (SCSH.t > 0 ? SCSH.amp * (SCSH.t / SCSH.dur) : 0) + (g.shake > 0 ? g.shake : 0));
  if (a <= 0) return [0, 0];
  return [Math.round((Math.random() - 0.5) * a), Math.round((Math.random() - 0.5) * a)];
}
function rollSuperCrit(st: Stats, two: boolean, crit: boolean): boolean {
  if (!crit || !two) return false;
  return R() * 100 < Math.max(18, st.crit * 0.55);
}

function heroAttack(g: Game, e: En, st: Stats, dist: number, dx: number, dy: number, twin?: boolean): void {
  const h = g.hero;
  if (!twin) { h.bump = 1; h.bdx = dx; h.bdy = dy; h.as = (h.as ?? 0) + 1; }
  g.sfx("swing", swingClass(g.eq));
  const atkEl = weaponEl(g.eq);
  if (dist > 1 || st.range > 0) {
    const sc = atkEl && st.magic ? ELC[atkEl] : st.magic ? "#d080ff" : st.range > 0 ? "#f0e0b0" : "#d0d8e0";
    g.shots.push({ x0: h.ax * TS + 12, y0: h.ay * TS + 10, x1: e.ax * TS + 12, y1: e.ay * TS + 12, t: 0.14, max: 0.14, c: sc, typ: heroShotTyp(g.eq, st.magic) });
  }
  const strike = (tg: En, mul: number): void => {
    if (tg.hp <= 0) return;
    const main = g.eq.rh ?? (g.eq.lh && g.eq.lh.kind !== "shield" ? g.eq.lh : null);
    const two = isTwo(main);
    const crit = R() * 100 < st.crit;
    const scrit = rollSuperCrit(st, two, crit);
    const wel = itemWepEl(main);
    const cm = scrit ? 3 : crit ? 2 : 1;
    let dmg: number;
    if (st.magic && wel) {
      const raw = magicWepRaw(tg, wel, st.atk * mul * efDmgMul(g, tg, st));
      dmg = Math.max(1, Math.round(dmgF(raw, 0) * (0.85 + R() * 0.3) * cm));
    } else {
      const dd = tg.def * (1 - st.pierce);
      dmg = Math.max(1, Math.round(dmgF(st.atk * mul * efDmgMul(g, tg, st), dd) * (0.85 + R() * 0.3) * cm));
    }
    const hitV = { dx: tg.x - h.x, dy: tg.y - h.y };
    withHit(hitV, () => {
      dmg = hurtEn(g, tg, dmg);
    });
    if (st.magic && wel) withHit(hitV, () => { applyWepEl(g, tg, wel, dmg, true); });
    else if (main && main.kind === "beamsword" && wel && tg.hp > 0) {
      const slice = Math.max(1, Math.round(st.atk * mul * 0.22 * elMul(tg, wel)));
      const sd = withHit(hitV, () => hurtEn(g, tg, slice));
      floatTxt(g, tg.x + 0.3, tg.y - 0.15, String(sd), ELC[wel]);
      withHit(hitV, () => { applyWepEl(g, tg, wel, sd, true); });
    }
    const burstC = st.magic && wel ? [ELC[wel], EL2[wel], "#ffffff"] : (main && main.kind === "beamsword" && wel ? [ELC[wel], "#ffffff", GOLD] : scrit ? ["#ff60e0", GOLD, "#ffffff"] : crit ? [GOLD, "#ffffff"] : ["#ffffff", tg.pal[1]]);
    floatTxt(g, tg.x, tg.y, (scrit ? "SUPER CRIT " : crit ? "CRIT " : "") + dmg, scrit ? "#ff60e0" : crit ? GOLD : (st.magic && wel ? ELC[wel] : "#ffffff"));
    burst(g, tg.ax * TS + 12, tg.ay * TS + 12, scrit ? 22 : crit ? 14 : 6, burstC, scrit ? 110 : 70, 60);
    if (scrit) { superShake(g); g.sfx("scrit"); } else g.sfx(crit ? "crit" : "hit");
    if (st.stun > 0 && R() < st.stun && tg.hp > 0) { tg.stun = 1; floatTxt(g, tg.x, tg.y - 0.5, "STUN", "#80c0ff"); }
    const wk = main ? main.kind : "";
    if (wk === "flail" && tg.hp > 0 && R() < 0.15) { if (pushEn(g, tg, h.x, h.y, 1)) floatTxt(g, tg.x, tg.y - 0.7, "KNOCK", "#e0c080"); }
    const died = tg.hp <= 0;
    if (died) withHit(hitV, () => { kill(g, tg); });
    efOnHit(g, tg, dmg, crit || scrit, st, died);
    starOnHit(g, tg, dmg, crit || scrit, st, died);
    setOnHit(g, tg, dmg, crit || scrit, st, died);
  };
  const main = g.eq.rh ?? (g.eq.lh && g.eq.lh.kind !== "shield" ? g.eq.lh : null);
  const wk = main ? main.kind : "";
  const dualClaw = !!(g.eq.rh && g.eq.lh && g.eq.rh.kind === "claws" && g.eq.lh.kind === "claws");
  if (wk === "claws") {
    const rake = dualClaw ? 0.45 : 0.4;
    strike(e, rake); strike(e, rake); strike(e, rake);
    if (e.hp > 0 && R() < (dualClaw ? 0.35 : 0.2)) { e.bl = Math.max(e.bl ?? 0, 3); e.blD = Math.max(e.blD ?? 0, Math.max(1, Math.round(st.atk * 0.1))); floatTxt(g, e.x, e.y - 0.6, "BLEED", "#d01030"); }
  } else {
    strike(e, 1);
    if (e.hp > 0 && R() * 100 < st.spd) { strike(e, 0.8); floatTxt(g, e.x, e.y - 0.6, "x2", "#80ffc0"); }
  }
  efAfterStrike(g);
  if (st.cleave && dist === 1 && wk !== "scythe" && wk !== "nodachi") for (const o of g.en) if (o !== e && o.hp > 0 && Math.abs(o.x - h.x) + Math.abs(o.y - h.y) === 1) strike(o, 0.5);
  if (wk === "scythe" && dist === 1) for (const o of g.en) if (o !== e && o.hp > 0 && Math.abs(o.x - h.x) + Math.abs(o.y - h.y) === 1) strike(o, 0.85);
  if (wk === "nodachi" && dist === 1) {
    const px = dy, py = -dx;
    for (const o of g.en) if (o !== e && o.hp > 0 && ((o.x === e.x + px && o.y === e.y + py) || (o.x === e.x - px && o.y === e.y - py))) strike(o, 0.9);
  }
  for (const sp of weaponSpells(g.eq)) {
    if (R() * 100 >= sp.ch * (1 + 0.2 * efP(g, 96))) continue;
    const t2 = e.hp > 0 ? e : nearestEnemy(g, 6);
    if (t2) castSpell(g, sp, t2, st, false);
  }
}

function heroDie(g: Game): void {
  g.mode = "dead"; g.deadT = 0; g.hero.hp = 0;
  g.flash = 0.6; g.flashC = "#ff0000"; g.shake = 6;
  burst(g, g.hero.ax * TS + 12, g.hero.ay * TS + 12, 80, ["#ff3030", "#a01010", SKIN], 100, 80);
  if (g.depth > g.best) g.best = g.depth;
  if (g.lvl > g.bestLvl) g.bestLvl = g.lvl;
  saveBest(g);
  // Death no longer wipes the run: level, XP, gear and bag are kept; all gold is lost.
  const lost = g.gold;
  g.gold = 0;
  g.potions = POT_DEATH;
  g.deaths = (g.deaths || 0) + 1;
  // persist the penalty right away (alive, full HP, no gold) so closing the page during the death screen can't undo or lose anything
  g.mode = "play"; g.hero.hp = calc(g.lvl, g.eq).maxHp; saveGame(g, true); g.hero.hp = 0; g.mode = "dead";
  msg(g, "You died on depth " + g.depth + " - pocket gold lost" + (lost > 0 ? " (" + lost + "g)" : "") + ". Banked gold is safe.", "#ff6060");
  g.sfx("die");
}
// Rebuilds a fresh version of the same depth and puts the hero back in at full HP. Called from the frame loop / a tap, never mid-turn.
function respawn(g: Game): void {
  if (g.mode !== "dead") return;
  g.mode = "play"; g.gold = 0; g.potions = POT_DEATH; g.ward = 0; g.shopOpen = false; g.stashOpen = false; g.gambOpen = false; g.mmBig = false;
  if (g.area === "camp") { g.area = "camp"; restHero(g, false); saveGame(g); g.notify(); return; }
  if (g.depth === floorFront(g)) g.snapCur = null;
  else if (g.depth === floorFront(g) - 1) g.snapPrev = null;
  genFloor(g);
  const st = calc(g.lvl, g.eq);
  g.hero.hp = st.maxHp; g.hero.ax = g.hero.x; g.hero.ay = g.hero.y;
  setBanner(g, "YOU DIED - POCKET GOLD LOST", "Depth " + g.depth + " rebuilt \u00b7 banked gold is safe", "#ff6060", 2, 2.6);
  msg(g, "You died - all gold lost. Back on depth " + g.depth + " with full HP and " + POT_DEATH + " potions.", "#ff9090");
  g.flash = 0.5; g.flashC = "#000000";
  saveGame(g);
  g.notify();
}

function enemyAttack(g: Game, e: En, mul: number, st: Stats): void {
  const h = g.hero;
  e.bump = 1; e.bdx = Math.sign(h.x - e.x); e.bdy = Math.sign(h.y - e.y);
  if (e.act) actBossMeleeFx(g, e);
  g.sfx("ehit");
  if (R() * 100 < st.block) { floatTxt(g, h.x, h.y, "BLOCK", "#80c0ff"); g.sfx("block"); efOnBlock(g, e, mul); return; }
  let dmg = Math.max(1, Math.round(dmgF(e.atk * mul * (e.weak > 0 ? 0.7 : 1), st.def) * (0.85 + R() * 0.3)));
  if (g.ward > 0) {
    const ab = Math.min(g.ward, dmg);
    g.ward -= ab; dmg -= ab;
    floatTxt(g, h.x + 0.3, h.y - 0.3, "(" + Math.round(ab) + ")", "#9ae8ff");
    fxAdd(g, "ward", h.ax * TS + 12, h.ay * TS + 12, 0, 0, 0.3, "#9ae8ff", "#ffffff", 17);
  }
  dmg = efPreHurt(g, e, dmg, st, Math.abs(e.x - h.x) + Math.abs(e.y - h.y) > 1);
  dmg = starPreHurt(g, e, dmg, st, Math.abs(e.x - h.x) + Math.abs(e.y - h.y) > 1);
  if (dmg > 0) applyHeroDmg(g, dmg, e.cls === 2 ? 5 : 3);
  if (h.hp <= 0 || g.mode !== "play") return;
  efPostHurt(g, e, dmg, st);
  for (const p of allPassives(g.eq)) {
    if (p.ty === "thorns" && e.hp > 0) { elHit(g, e, p.el, st.atk * p.pw * 0.9 * (p.mod === 3 ? 2 : 1), true, p.mod); g.sfx("mx", pasSnd(p)); }
    else if (p.ty === "retal" && R() < (p.mod === 1 ? 0.45 : 0.3)) {
      const r = 2 + (p.mod === 0 ? 1 : 0);
      fxAdd(g, "ring", h.ax * TS + 12, h.ay * TS + 12, 0, 0, 0.4, ELC[p.el], EL2[p.el], (r + 0.5) * TS);
      for (const o of nearEnemies(g, h.x, h.y, r)) elHit(g, o, p.el, st.atk * p.pw * 1.3 * (p.mod === 3 ? 1.6 : 1), true, p.mod);
      g.sfx("mx", pasSnd(p));
    }
  }
}

function enemyTurn(g: Game, e: En, st: Stats): void {
  if (e.hp <= 0 || g.mode !== "play") return;
  if (e.stun > 0) { e.stun--; return; }
  if (packStep(g, e)) return;
  if ((e.chm ?? 0) > 0) { e.chm = (e.chm ?? 1) - 1; charmAct(g, e); return; }
  const h = g.hero;
  const dx = h.x - e.x, dy = h.y - e.y, md = Math.abs(dx) + Math.abs(dy);
  if (!e.awake) {
    if ((g.vis[e.y * MW + e.x] && (md <= 7 || !!e.gob)) || md <= 2) { e.awake = true; if (e.act) { g.shake = Math.max(g.shake, 8); actBossIntro(g, e); } else if (e.cls === 2 && !e.gob) { g.sfx("roar"); g.shake = Math.max(g.shake, 6); msg(g, e.name + " awakens!", "#ff6060"); } else if (e.gob) { g.gobT = 0; g.sfx("gob"); const gn = e.name || "Loot Goblin"; const gc = e.gob === 2 ? "#40e0ff" : GOLD; setBanner(g, gn + "!", "Catch it before it escapes (" + GOB_TIME + "s)!", gc, 5, 2.4); msg(g, "A " + gn + "! Catch it before it escapes!", gc); } }
    else return;
  }
  if (e.gob) { gobMove(g, e); return; }
  if (e.hunt === 1 && g.vis[e.y * MW + e.x]) { e.hunt = 2; g.sfx("hunt"); g.shake = Math.max(g.shake, 6); setBanner(g, "THE HUNTER FOUND YOU!", e.name + " - fight it, you can't outrun it", "#e040ff", 8, 2.6); msg(g, e.name + " has found you!", "#ff60ff"); }
  if (e.tr.includes("regen") && e.hp < e.mhp) e.hp = Math.min(e.mhp, e.hp + Math.max(1, Math.round(e.mhp * 0.03)));
  if (dx !== 0) e.face = dx > 0 ? 1 : -1;
  if (e.act && actBossAbility(g, e, st)) return;
  if (e.fear > 0) {
    e.fear--;
    const qx = -Math.sign(dx), qy = -Math.sign(dy);
    for (const [ox, oy] of [[qx, 0], [0, qy]]) { if (ox === 0 && oy === 0) continue; if (walkable(g, e.x + ox, e.y + oy) && !(e.x + ox === h.x && e.y + oy === h.y)) { e.x += ox; e.y += oy; break; } }
    return;
  }
  if ((e.ra ?? 0) > 0) e.ra = (e.ra as number) - 1;
  if (md === 1) { enemyAttack(g, e, 1, st); return; }
  if (e.tr.includes("ranged") && (e.ra ?? 0) <= 0 && md <= 5 && (dx === 0 || dy === 0) && los(g, e.x, e.y, h.x, h.y)) {
    fireEnemyShot(g, e, st, 0.7);
    return;
  }
  if (e.hunt) { huntMove(g, e); return; }
  if (md > 14) return;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const opts: number[][] = Math.abs(dx) > Math.abs(dy) ? [[sx, 0], [0, sy], [0, sy === 0 ? 1 : -sy], [0, sy === 0 ? -1 : sy]] : [[0, sy], [sx, 0], [sx === 0 ? 1 : -sx, 0]];
  for (const [ox, oy] of opts) {
    if (ox === 0 && oy === 0) continue;
    const nx = e.x + ox, ny = e.y + oy;
    if (walkable(g, nx, ny) && !(nx === h.x && ny === h.y)) { e.x = nx; e.y = ny; return; }
  }
}

function endTurn(g: Game, lockMove = true): void {
  if (g.rt) { // real-time: an action only costs the hero a cooldown; the world and enemies run on the clock
    // Projectile sources must not take the step lock: they use acd (attack cooldown) instead of pcd.
    if (lockMove) g.pcd = Math.max(g.pcd ?? 0, RT_ATK);
    else g.acd = Math.max(g.acd ?? 0, RT_ATK);
    g.en = g.en.filter((e: En) => e.hp > 0);
    if (g.pend.length) { g.en.push(...g.pend); g.pend = []; }
    computeVis(g); g.notify(); return;
  }
  const st = calc(g.lvl, g.eq);
  if (g.mode === "play") worldTick(g, st);
  g.en = g.en.filter((e: En) => e.hp > 0);
  if (g.pend.length) { g.en.push(...g.pend); g.pend = []; }
  let near = false;
  const es0 = esOf(g), hasteT = es0.free > 0; // Haste Strike: enemies lose this turn
  if (hasteT) es0.free = 0;
  for (const e of g.en.slice()) {
    if (g.mode !== "play") break;
    if (e.hp <= 0) continue;
    if (e.burn > 0) { e.burn--; markHitDir(g, e); e.hp -= e.burnD; e.hit = 0.15; floatTxt(g, e.x, e.y - 0.2, String(e.burnD), ELC.fire); if (e.hp <= 0) { kill(g, e); continue; } }
    if ((e.bl || e.poi || e.doom || e.mk) && efEnemyTick(g, e)) continue;
    if (e.weak > 0) e.weak--;
    if (e.hunt) { e.slow = 0; e.fear = 0; } // the Hunter shrugs off slow and fear - it never stops coming
    const skip = e.slow > 0 && g.turn % 2 === 0;
    if (e.slow > 0) e.slow--;
    if (!skip && !hasteT) { enemyTurn(g, e, st); if ((e.tr.includes("fast") || (!!e.hunt && g.turn % 2 === 0)) && e.hp > 0) enemyTurn(g, e, st); }
    if (e.awake && Math.abs(e.x - g.hero.x) + Math.abs(e.y - g.hero.y) <= 6) near = true;
  }
  turnTail(g, st, near);
  g.notify();
}
// ======================= real-time clock: enemies act on their own timers =======================
const HUNT_X = 1.49; // the Hunter steps 1.49x as often as a +0% hero
// seconds per enemy step: 0.30 fast, 0.38-0.46 normal (varies per enemy), 0.46 bosses; slowed x2; Hunter 0.24/1.49
function enStep(e: En): number {
  let p = e.hunt ? RT_MV / HUNT_X : e.gob ? RT_MV : e.tr.includes("fast") ? 0.3 : e.cls === 2 ? 0.46 : 0.38 + (e.id % 5) * 0.02;
  if (e.slow > 0 && !e.hunt) p *= 2;
  return p;
}
function enNeed(g: Game, e: En): number {
  const p = enStep(e);
  const md = Math.abs(e.x - g.hero.x) + Math.abs(e.y - g.hero.y);
  return e.ra && md <= 1 && !e.gob ? Math.max(p, RT_ATK) : p; // back-to-back attacks are never faster than the hero swings; the first swing after closing in comes on the step timer
}
function turnTail(g: Game, st: Stats, near: boolean): void {
  if (g.pend.length) { g.en.push(...g.pend); g.pend = []; }
  if (g.mode === "play") {
    g.regenAcc += st.regen + (near ? 0 : st.maxHp * 0.01);
    if (g.regenAcc >= 1) { const n = Math.floor(g.regenAcc); g.regenAcc -= n; g.hero.hp = Math.min(st.maxHp, g.hero.hp + n); }
    g.hero.hp = Math.min(g.hero.hp, st.maxHp);
  }
  g.turn++;
  g.floorTurn++;
  if (g.mode === "play" && g.rt && !g.vault && g.floorTurn > 0 && g.floorTurn % 10 === 0) trickleSpawn(g);
  if (g.mode === "play" && g.turn % 10 === 0) saveGame(g, true);
  if (g.floorTurn === 150 && !g.vault) revealStairs(g);
  computeVis(g);
  if (g.mode === "play" && g.turn % 20 === 0) saveGame(g);
}
// one world tick in real-time mode: everything endTurn does except the enemy steps (those run on their own timers)
function rtWorld(g: Game): void {
  const st = calc(g.lvl, g.eq);
  worldTick(g, st);
  g.en = g.en.filter((e: En) => e.hp > 0);
  if (g.pend.length) { g.en.push(...g.pend); g.pend = []; }
  const es0 = esOf(g);
  if (es0.free > 0) { es0.free = 0; for (const e of g.en) e.at = (e.at ?? 0) - RT_TICK; } // Haste Strike: enemies lose a tick
  let near = false;
  for (const e of g.en.slice()) {
    if (g.mode !== "play") break;
    if (e.hp <= 0) continue;
    if (e.burn > 0) { e.burn--; markHitDir(g, e); e.hp -= e.burnD; e.hit = 0.15; floatTxt(g, e.x, e.y - 0.2, String(e.burnD), ELC.fire); if (e.hp <= 0) { kill(g, e); continue; } }
    if ((e.bl || e.poi || e.doom || e.mk) && efEnemyTick(g, e)) continue;
    if (e.weak > 0) e.weak--;
    if (e.hunt) { e.slow = 0; e.fear = 0; }
    if (e.slow > 0) e.slow--;
    if (e.awake && Math.abs(e.x - g.hero.x) + Math.abs(e.y - g.hero.y) <= 6) near = true;
  }
  turnTail(g, st, near);
  es0.still = true; es0.moved = 0; // standing still until the hero moves again
}
// advance the real-time clock by dt seconds (the component calls this every frame unless paused)
function rtUpdate(g: Game, dt: number): void {
  if (g.mode !== "play") return;
  dt = Math.min(0.1, Math.max(0, dt));
  petAbiTick(g, dt);
  const hp0 = g.hero.hp;
  let changed = false;
  if ((g.pcd ?? 0) > 0) { g.pcd = (g.pcd ?? 0) - dt; if (g.pcd < 1e-6) g.pcd = 0; } // snap float residue so input is never stuck
  if ((g.acd ?? 0) > 0) { g.acd = (g.acd ?? 0) - dt; if (g.acd < 1e-6) g.acd = 0; }
  if ((g.pcd ?? 0) <= 0 && g.qd) { const q = g.qd; g.qd = undefined; act(g, q[0], q[1]); if (g.mode !== "play") return; }
  g.wt = (g.wt ?? 0) + dt;
  if (g.wt >= RT_TICK) { g.wt -= RT_TICK; rtWorld(g); changed = true; if (g.mode !== "play") { g.notify(); return; } }
  const st = calc(g.lvl, g.eq);
  for (const e of g.en.slice()) {
    if (g.mode !== "play") break;
    if (e.hp <= 0) continue;
    e.at = (e.at ?? -(e.id % 7) * 0.05) + dt; // staggered so a pack doesn't move in lockstep
    const need = enNeed(g, e);
    if (e.at >= need) {
      e.at = Math.min(e.at - need, need * 0.5);
      const ox = e.x, oy = e.y, adj = Math.abs(e.x - g.hero.x) + Math.abs(e.y - g.hero.y) <= 1;
      enemyTurn(g, e, st);
      e.ra = adj && e.x === ox && e.y === oy ? 1 : 0;
      if (e.x !== ox || e.y !== oy || g.hero.hp !== hp0) changed = true;
    }
  }
  g.en = g.en.filter((e: En) => e.hp > 0);
  if (g.pend.length) { g.en.push(...g.pend); g.pend = []; }
  if (changed || g.hero.hp !== hp0) g.notify();
}
// Render-only interpolation: game logic stays on integer tiles. ax/ay (and the camera) lerp between tiles over each body's own step duration.
interface IPol { fx: number; fy: number; tx: number; ty: number; u: number; dur: number }
const IP = { h: null as Hero | null, hp: null as IPol | null, em: new Map<number, IPol>(), camX: 0, camY: 0, camOk: false, camKey: "" };
function ipMove(p: IPol | null, x: number, y: number, ax: number, ay: number, dt: number, dur: number): { p: IPol; ax: number; ay: number } {
  const jump = Math.hypot(x - ax, y - ay) > 2.5;
  if (!p || jump) {
    if (!jump && (Math.abs(ax - x) > 0.002 || Math.abs(ay - y) > 0.002)) p = { fx: ax, fy: ay, tx: x, ty: y, u: 0, dur };
    else p = { fx: x, fy: y, tx: x, ty: y, u: 1, dur };
  } else if (x !== p.tx || y !== p.ty) p = { fx: ax, fy: ay, tx: x, ty: y, u: 0, dur };
  if (p.u < 1 && p.dur > 1e-6) p.u = Math.min(1, p.u + dt / p.dur);
  return { p, ax: p.fx + (p.tx - p.fx) * p.u, ay: p.fy + (p.ty - p.fy) * p.u };
}
function heroStepDur(g: Game): number { MVMUL = 1 + calc(g.lvl, g.eq).mv / 100; return RT_MV / MVMUL; }
function camTick(g: Game, dt: number): void {
  const h = g.hero;
  let tx = h.ax * TS + 12 - VW / 2;
  let ty = h.ay * TS + 12 - (HUD + VIEWH / 2);
  const maxX = Math.max(0, MW * TS - VW);
  const minY = -HUD;
  const maxY = Math.max(minY, MH * TS - HUD - VIEWH);
  tx = Math.max(0, Math.min(maxX, tx));
  ty = Math.max(minY, Math.min(maxY, ty));
  const key = String(g.depth) + (g.vault ? "v" : "f");
  if (!IP.camOk || IP.camKey !== key || Math.hypot(tx - IP.camX, ty - IP.camY) > TS * 2.5) { IP.camX = tx; IP.camY = ty; IP.camOk = true; IP.camKey = key; }
  else { const k = Math.min(1, dt * 16); IP.camX += (tx - IP.camX) * k; IP.camY += (ty - IP.camY) * k; }
}
function camXY(): number[] { return [Math.round(IP.camX * PX) / PX, Math.round(IP.camY * PX) / PX]; }
function visTick(g: Game, dt: number): void {
  const h = g.hero;
  if (IP.h !== h) { IP.h = h; IP.hp = null; IP.camOk = false; IP.em.clear(); }
  const ox = h.ax, oy = h.ay;
  const hr = ipMove(IP.hp, h.x, h.y, h.ax, h.ay, dt, heroStepDur(g));
  IP.hp = hr.p; h.ax = hr.ax; h.ay = hr.ay;
  const jump = Math.hypot(h.x - ox, h.y - oy) > 2.5;
  heroAnimTick(g, dt, jump ? 0 : Math.abs(h.ax - ox) + Math.abs(h.ay - oy));
  const seen = new Set<number>();
  for (const e of g.en) {
    seen.add(e.id);
    const r = ipMove(IP.em.get(e.id) ?? null, e.x, e.y, e.ax, e.ay, dt, enStep(e));
    IP.em.set(e.id, r.p); e.ax = r.ax; e.ay = r.ay;
  }
  for (const id of [...IP.em.keys()]) if (!seen.has(id)) IP.em.delete(id);
  camTick(g, dt);
}
// Remap a tile (or offset) coordinate onto the sprite's interpolated position so floats/numbers stay on the body.
function visOf(g: Game, x: number, y: number): number[] {
  const h = g.hero;
  if (Math.abs(x - h.x) < 1 && Math.abs(y - h.y) < 1) return [h.ax + (x - h.x), h.ay + (y - h.y)];
  for (const e of g.en) if (Math.abs(x - e.x) < 1 && Math.abs(y - e.y) < 1) return [e.ax + (x - e.x), e.ay + (y - e.y)];
  return [x, y];
}

function pickup(g: Game): void {
  const h = g.hero;
  const keep: Drop[] = [];
  for (const dr of g.drops) {
    if (dr.x !== h.x || dr.y !== h.y) { keep.push(dr); continue; }
    if (!collectDrop(g, dr)) keep.push(dr);
  }
  g.drops = keep;
}

function openChest(g: Game, c: Chest): void {
  if (c.starter) {
    c.open = true;
    const stuff = (c.items || []).slice();
    c.items = [];
    g.sfx("chest", 0);
    burst(g, c.x * TS + 12, c.y * TS + 10, 16, [RC[0], "#ffffff", "#d0d0d0"], 60, 50);
    msg(g, "Opened a starter chest!", RC[0]);
    floatTxt(g, c.x, c.y - 0.7, "Starter Gear", RC[0]);
    for (const it of stuff) {
      if (!it) continue;
      // Same auto-equip path as a normal floor pickup (collectDrop): tryAutoEquip if better/empty, else bag/salvage.
      takePickedItem(g, it, c.x, c.y);
    }
    return;
  }
  c.open = true;
  const cr = Math.max(0, Math.min(4, c.rar | 0));
  const col = RC[cr];
  g.sfx("chest", cr);
  const burstN = [16, 20, 28, 40, 56][cr];
  const cols = cr >= 4 ? [col, "#ffffff", "#ff60e0", GOLD] : cr >= 2 ? [col, "#ffffff", GOLD] : [col, "#ffffff", "#d0d0d0"];
  burst(g, c.x * TS + 12, c.y * TS + 10, burstN, cols, 60 + cr * 16, 50 + cr * 8);
  const vlt = g.vault !== null;
  const plan = chestLoot(cr, vlt, g.depth);
  msg(g, "Opened " + CHN[cr] + "!", col);
  if (cr >= 3) setBanner(g, CHN[cr].toUpperCase() + "!", plan.n + " items · richer loot", col, cr, cr >= 4 ? 2.8 : 2.0);
  floatTxt(g, c.x, c.y - 0.7, CHN[cr], col);
  for (let i = 0; i < plan.n; i++) {
    let it = makeItem(plan.ilvl, rollRar(plan.f, plan.min, g.depth));
    if (cr >= 4 && isArmor(it.kind) && it.rar < 7 && R() < CHEST_SET_CH) it = makeSetPiece(plan.ilvl, it.kind as AK);
    giveItem(g, it, c.x, c.y);
  }
  if (R() < efc(0.2, efP(g, 91))) giveItem(g, makeItem(plan.ilvl, rollRar(plan.f, plan.min, g.depth)), c.x, c.y);
  const gd = Math.round((28 + g.depth * 17) * (0.5 + R()) * (vlt ? 2 : 1) * plan.goldMul * (1 + efP(g, 70)) * efGoldMul(g, null) * gemGoldMul(g));
  g.gold += gd;
  floatTxt(g, c.x, c.y - 0.3, "+" + gd + "g", GOLD);
  if (R() < (vlt ? POT_CH_VAULT : POT_CH_CHEST)) g.drops.push({ x: c.x, y: c.y, item: null, pot: true, gold: 0 });
  if (R() < (vlt ? GEM_CH_VAULT : GEM_CH_CHEST)) giveDroppedGem(g, c.x, c.y, g.depth);
}

function ultDamage(g: Game, st: Stats, w: Item, e: En, nFuse?: number): number {
  const n = Math.max(1, Math.min(6, nFuse !== undefined ? nFuse : prisFuseCount(g.eq)));
  let pow = st.atk * (14 + w.ilvl * 0.35) * Math.max(0.6, Math.min(1.6, g.lvl / Math.max(1, g.depth))) * (0.85 + R() * 0.3);
  if (w.rar >= 7) pow *= 2.5;
  pow = safeMul(pow, fusedStarMul(g.eq));
  if (fusedGolden(g.eq) || w.golden) pow = safeMul(pow, 4);
  pow = safeMul(pow, prisFuseMul(n));
  pow = magicWepRaw(e, ultBestEl(e), pow);
  return Math.max(0, safeRound(pow));
}
function ultFx(g: Game, u: Ult, hx: number, hy: number, ts: En[], golden: boolean = false, tier = 1, cap = 220, scale = 1, delay0 = 0): void {
  const c = golden ? GOLD : ELC[u.el], c2 = golden ? "#fff8c0" : u.c2, row = Math.floor(u.i / 10);
  const add = (k: string, x: number, y: number, x2: number, y2: number, max: number, r: number, delay: number): void => { if (g.fx.length < cap) g.fx.push({ k, x, y, x2, y2, t: max + delay + delay0, max, c: (k === "ring" || k === "bolt") && delay % 0.2 > 0.1 ? c2 : c, c2, r, seed: R() * 1000, fired: false }); };
  const W = (golden ? 11 : 7) * TS * scale;
  add("ultbg", hx, hy, 0, 0, 1.5 + 0.15 * tier, 0, 0);
  const tp = (e: En): number[] => [e.ax * TS + 12, e.ay * TS + 12];
  switch (u.pat) {
    case 0: ts.forEach((e: En, i: number) => { const p = tp(e); add("meteor", p[0], p[1], 0, 0, 0.6, 30, i * 0.06); }); for (let i = 0; i < 8 + row * 3 + tier * 4; i++) add("meteor", hx + (R() - 0.5) * W * 1.6, hy + (R() - 0.5) * W * 1.6, 0, 0, 0.6, 24, 0.1 + i * 0.05); break;
    case 1: for (let i = 0; i < 3 + row + tier; i++) add("ring", hx, hy, 0, 0, 0.7 + 0.08 * tier, W * (0.5 + i * 0.22), i * 0.13); ts.forEach((e: En) => { const p = tp(e); add("ring", p[0], p[1], 0, 0, 0.4, 14, 0.3); }); break;
    case 2: add("vortex", hx, hy, 0, 0, 0.8 + 0.1 * tier, W, 0); add("ring", hx, hy, 0, 0, 0.6, W * 1.2, 0.7); ts.forEach((e: En) => { const p = tp(e); add("vortex", p[0], p[1], 0, 0, 0.6, 20, 0.1); add("ring", p[0], p[1], 0, 0, 0.4, 18, 0.75); }); break;
    case 3: { let px = hx, py = hy; ts.forEach((e: En, i: number) => { const p = tp(e); add("arc", px, py, p[0], p[1], 0.5, 1, i * 0.05); add("arc", hx, hy, p[0], p[1], 0.4, 1, 0.3 + i * 0.03); px = p[0]; py = p[1]; }); for (let i = 0; i < 6 + row + tier * 2; i++) { const a = (i * 6.2832) / (6 + row + tier * 2); add("arc", hx, hy, hx + Math.cos(a) * W, hy + Math.sin(a) * W, 0.5, 1, 0.08 * i); } break; }
    case 4: for (let i = 0; i < 8 + tier * 2; i++) { const a = i * (6.2832 / (8 + tier * 2)) + row * 0.2; add("spikes", hx, hy, hx + Math.cos(a) * W, hy + Math.sin(a) * W, 0.8, 10 + row * 2 + tier, i * 0.04); } break;
    case 5: ts.forEach((e: En, i: number) => { const p = tp(e); for (let j = 0; j < 3; j++) add("bolt", p[0] + (R() - 0.5) * 30, p[1] - 160, p[0], p[1], 0.35, 5, i * 0.03 + j * 0.12); }); for (let i = 0; i < 14 + row * 3 + tier * 6; i++) { const x = hx + (R() - 0.5) * W * 2, y = hy + (R() - 0.5) * W * 2; add("bolt", x, y - 160, x, y, 0.35, 4, R() * 0.6); } break;
    case 6: add("blades", hx, hy, 0, 0, 1.0, W * 0.9, 0); add("sweep", hx, hy, 0, 0, 0.9, W * 1.2, 0); if (row > 1 || tier >= 3) add("sweep", hx, hy, 0, 0, 0.9, W * 0.8, 0.2); ts.forEach((e: En, i: number) => { const p = tp(e); add("blades", p[0], p[1], 0, 0, 0.5, 14, 0.2 + i * 0.03); }); break;
    case 7: ts.forEach((e: En, i: number) => { const p = tp(e); add("pillar", p[0], p[1], 0, 0, 0.7, 22, i * 0.07); }); add("pillar", hx, hy, 0, 0, 0.9 + 0.1 * tier, 30 + row * 4 + tier * 6, 0); break;
    case 8: for (let i = 0; i < 8 + tier * 2; i++) { const a = i * (6.2832 / (8 + tier * 2)) + 0.39 * (row % 2); add("beam", hx, hy, hx + Math.cos(a) * W * 1.5, hy + Math.sin(a) * W * 1.5, 0.6, 12, i * 0.05); } ts.forEach((e: En) => { const p = tp(e); add("beam", hx, hy, p[0], p[1], 0.5, 8, 0.3); }); break;
    default: for (let i = 0; i < 24 + tier * 8; i++) { const a = i * (0.45 + row * 0.05); const r = 10 + i * 7; add("bolt", hx, hy, hx + Math.cos(a) * r, hy + Math.sin(a) * r, 0.4, 5, i * 0.03); } ts.forEach((e: En, i: number) => { const p = tp(e); add("bolt", hx, hy, p[0], p[1], 0.35, 6, 0.4 + i * 0.03); add("ring", p[0], p[1], 0, 0, 0.4, 16, 0.6); }); break;
  }
  for (const e of ts) burst(g, e.ax * TS + 12, e.ay * TS + 12, 14 + tier * 4, [c, c2, "#ffffff"], 120 + tier * 30, 30);
}
function ultFxFused(g: Game, pieces: { slot: EqKey; it: Item }[], hx: number, hy: number, ts: En[]): void {
  const n = Math.max(1, Math.min(6, pieces.length));
  const anyG = pieces.some((p: { it: Item }) => !!p.it.golden);
  const cap = 200 + n * 160;
  const scale = 1 + (n - 1) * 0.28 + (n >= 6 ? 0.35 : 0);
  const add = (k: string, x: number, y: number, x2: number, y2: number, max: number, r: number, delay: number, c: string, c2: string): void => { if (g.fx.length < cap) g.fx.push({ k, x, y, x2, y2, t: max + delay, max, c, c2, r, seed: R() * 1000, fired: false }); };
  // Shared screen wash, then each equipped Prismatic's own ult theme on top.
  for (let i = 0; i < n; i++) {
    const it = pieces[i].it;
    const u = ULTS[it.ult !== undefined ? it.ult : 0] ?? ULTS[0];
    const c = it.golden || anyG && i === 0 ? GOLD : ELC[u.el];
    add("ultbg", hx, hy, 0, 0, 1.4 + 0.2 * n, 0, i * 0.07, c, u.c2);
  }
  if (n >= 3) {
    for (let i = 0; i < n + 2; i++) add("ring", hx, hy, 0, 0, 0.9 + 0.1 * n, (8 + i * 3) * TS * scale, i * 0.1, anyG ? GOLD : "#fff8c0", "#ffffff");
  }
  if (n >= 5) {
    for (let i = 0; i < 16; i++) {
      const a = i * 0.3927;
      const reach = Math.max(VW, VH) * 1.2 * (n >= 6 ? 1.3 : 1);
      add("beam", hx, hy, hx + Math.cos(a) * reach, hy + Math.sin(a) * reach, 0.9, 16, 0.05 * i, i % 2 ? GOLD : "#ffffff", "#ffe080");
    }
  }
  if (n >= 6) {
    // Spectacular screen-wide finale: stacked washes, rings, and a star of beams.
    for (let i = 0; i < 6; i++) add("ultbg", hx, hy, 0, 0, 2.2, 0, 0.12 * i, i % 2 ? GOLD : "#ffffff", "#fff0a0");
    for (let i = 0; i < 10; i++) add("ring", hx, hy, 0, 0, 1.4, (6 + i * 4) * TS, 0.08 * i, "#ffffff", GOLD);
    for (let i = 0; i < 28; i++) {
      const a = i * 0.2244, r = 20 + i * 10;
      add("meteor", hx + Math.cos(a) * r, hy + Math.sin(a) * r, 0, 0, 0.8, 28, i * 0.03, GOLD, "#ffffff");
    }
  }
  for (let i = 0; i < pieces.length; i++) {
    const it = pieces[i].it;
    const u = ULTS[it.ult !== undefined ? it.ult : 0] ?? ULTS[0];
    ultFx(g, u, hx, hy, ts, !!it.golden || anyG, n, cap, scale, i * 0.09);
  }
}
function castUlt(g: Game, _slot?: EqKey): boolean {
  if (g.mode !== "play" || uiBlocked(g) || g.paused) return false;
  const all = ultsOf(g.eq);
  if (!all.length) return false;
  if (Date.now() < fusedUltReadyAt(g)) return false;
  const n = prisFuseCount(g.eq);
  const w = fusedBaseItem(g.eq);
  if (!w || w.ult === undefined) return false;
  const u = ULTS[w.ult] ?? ULTS[0];
  const st = calc(g.lvl, g.eq);
  const h = g.hero;
  const anyG = fusedGolden(g.eq);
  const targets = g.en.filter((e: En) => e.hp > 0 && g.vis[e.y * MW + e.x] === 1);
  if (anyG || n >= 4) {
    const reach = anyG || n >= 6 ? 16 : 14;
    for (const e of g.en) if (e.hp > 0 && Math.abs(e.x - h.x) + Math.abs(e.y - h.y) <= reach && !targets.includes(e)) targets.push(e);
  }
  const hx = h.ax * TS + 12, hy = h.ay * TS + 12;
  ultFxFused(g, all, hx, hy, targets);
  let killed = 0;
  for (const e of targets) {
    const dmg = ultDamage(g, st, w, e, n);
    if (dmg <= 0) continue;
    withHit({ ox: h.x, oy: h.y }, () => {
      hurtEn(g, e, dmg); e.hit = 0.4; e.awake = true;
      floatTxt(g, e.x, e.y - 0.3, String(dmg), n >= 6 ? GOLD : u.c2);
      if (e.hp <= 0) { killed++; kill(g, e); }
    });
  }
  setFusedUltCd(g, Date.now() + ULT_CD);
  g.flash = n >= 6 ? 1.7 : (anyG ? 0.9 : 0.55) + 0.14 * n;
  g.flashC = n >= 6 ? "#ffffff" : (anyG ? GOLD : ELC[u.el]);
  g.shake = n >= 6 ? 32 : 10 + 4 * n;
  const title = n >= 6 ? "PRISMATIC FINALE" : (n > 1 ? "FUSED ULTIMATE x" + n : (anyG ? "GOLDEN ULTIMATE: " : "ULTIMATE: ") + u.n.toUpperCase());
  const sub = (n > 1 ? n + " Prismatics fused \u00b7 " : "") + targets.length + " struck, " + killed + " slain";
  setBanner(g, title, sub, n >= 6 ? GOLD : (anyG ? GOLD : u.c2), 7, n >= 6 ? 4.4 : (anyG ? 3.4 : 2.6));
  msg(g, title + (n > 1 ? " (" + u.n + ")" : " - " + u.n) + "!", n >= 6 || anyG ? GOLD : u.c2);
  g.sfx("ult", u.i);
  endTurn(g, false);
  saveGame(g);
  return true;
}
function merchBuy(g: Game, id: MerchId, sub?: Kind): string {
  if (g.area !== "camp" || !g.merchant) return "The chest merchant is only at camp.";
  if (MERCH_IDS.indexOf(id) < 0) return "";
  const want = isWepMerch(id) ? (sub ?? (g.merchSub && g.merchSub[id as "oneHand" | "twoHand"]) ?? merchKind(id)) : undefined;
  const deal = chestTypeDeal(g, id, want);
  const price = deal.price;
  const lab = isWepMerch(id) && want ? merchKindLabel(want) : MERCH_LAB[id];
  if (g.gold < price) return "Not enough gold. Need " + fmtg(price) + ".";
  g.gold -= price;
  const it = rollMerchItem(g, id, undefined, want);
  if (isWepMerch(id)) rememberMerchSub(g, id, it.kind);
  const stars = it.st && it.st.length ? " \u2605" + it.st.length : "";
  msg(g, "You open a " + lab + " chest and find " + it.name + " (" + RT[it.rar] + stars + ")!", RC[it.rar]);
  giveItem(g, it, g.hero.x, g.hero.y);
  deal.buys += 1;
  deal.price = nextChestPrice(price, g.depth);
  g.chestReveal = { it, t: 0, phase: "open", sku: chestSku(id, it.kind) };
  g.sfx("chest");
  saveGame(g);
  g.notify();
  return "Opened a " + lab + " chest for " + fmtg(price) + ".";
}
function polishCost(it: Item): number {
  if (it.kind === "pet") return 0;
  const n = it.st ? it.st.length : 0;
  const max = starMax(it.rar, it.set !== undefined);
  if (n >= max) return 0;
  return [5, 12, 25, 45, 80][n] ?? 80;
}
function polishItem(g: Game, bi: number): string {
  const it = g.bag[bi];
  if (!it) return "";
  const cost = polishCost(it);
  if (cost <= 0) return "That item cannot take another star.";
  if ((g.gems ?? 0) < cost) return "Not enough gemstones (" + cost + " needed).";
  const pool = starPool(it);
  const used = new Set((it.st ?? []).map((e: number[]) => e[0]));
  const avail: number[] = [];
  for (let i = 0; i < pool.length; i++) if (!used.has(i)) avail.push(i);
  if (!avail.length) return "No unused stars remain for this item.";
  const id = avail[ri(avail.length)];
  it.st = (it.st ?? []).concat([[id, 1]]);
  g.gems = (g.gems ?? 0) - cost;
  sortInventory(g);
  g.sfx("sparkle");
  saveGame(g);
  return "Polished " + it.name + " with a " + (pool[id]?.n ?? "star") + " (" + cost + " gems).";
}
function safeAct(g: Game, dx: number, dy: number): void {
  try { act(g, dx, dy); } catch (err) { console.error("Endless Depths: act error (recovered, run kept)", err); try { msg(g, "A glitch was caught - your run is safe.", "#ff8080"); } catch { /* ignore */ } }
}
function act(g: Game, dx: number, dy: number): void {
  if (g.mode !== "play" || uiBlocked(g) || g.paused) return;
  if (g.rt && (g.pcd ?? 0) > 1e-6) { g.qd = [dx, dy]; return; } // still recovering: remember the newest input
  const h = g.hero;
  const st = calc(g.lvl, g.eq);
  MVMUL = 1 + st.mv / 100;
  const es = esOf(g);
  es.still = true; es.moved = 0;
  if (dx === 0 && dy === 0) { if (!autoTurnSt(g, st)) endTurn(g); return; }
  if (dx !== 0 || dy !== 0) setHeroDir(h, dx, dy);
  const ranged = st.range > 0;
  const projReady = !g.rt || (g.acd ?? 0) <= 1e-6;
  const rng = Math.max(st.reach, st.range);
  let fired = false;
  for (let i = 1; i <= rng; i++) {
    const x = h.x + dx * i, y = h.y + dy * i;
    if (!inb(x, y) || g.map[y * MW + x] === 0) break;
    const e = enemyAt(g, x, y);
    if (e) {
      if (i > 1 && !g.vis[y * MW + x]) break;
      if (ranged) {
        if (projReady) { heroAttack(g, e, st, i, dx, dy); fired = true; }
        break;
      }
      heroAttack(g, e, st, i, dx, dy);
      endTurn(g);
      return;
    }
    if (chestAt(g, x, y)) break;
  }
  const nx = h.x + dx, ny = h.y + dy;
  const tg = findTarget(g, st);
  if (tg) {
    const cd = Math.abs(tg.x - h.x) + Math.abs(tg.y - h.y), nd = Math.abs(tg.x - nx) + Math.abs(tg.y - ny);
    if (!(walkable(g, nx, ny) && nd > cd)) {
      if (ranged) {
        if (!fired && projReady) { attackTarget(g, tg, st); fired = true; }
      } else {
        attackTarget(g, tg, st); endTurn(g); return;
      }
    }
  }
  if (fired && g.rt) g.acd = Math.max(g.acd ?? 0, RT_ATK);
  if (dx !== 0 && dy !== 0 && inb(nx, ny) && (g.map[h.y * MW + nx] === 0 || g.map[ny * MW + h.x] === 0)) { h.bump = 0.5; h.bdx = dx; h.bdy = dy; if (g.wallBreak) tryWallDig(g, dx, dy); return; }
  if (!inb(nx, ny) || g.map[ny * MW + nx] === 0) { h.bump = 0.5; h.bdx = dx; h.bdy = dy; if (g.wallBreak) tryWallDig(g, dx, dy); return; }
  const ch = chestAt(g, nx, ny);
  if (ch) { h.bump = 1; h.bdx = dx; h.bdy = dy; openChest(g, ch); endTurn(g); return; }
  if (g.merchant && g.merchant.x === nx && g.merchant.y === ny) { h.bump = 0.6; h.bdx = dx; h.bdy = dy; g.shopOpen = true; g.sfx("chest"); msg(g, "Chest Merchant: \"A chest for every kind of gear. Each holds one item.\"", "#ffd080"); g.notify(); return; }
  if (g.stashAt && g.stashAt.x === nx && g.stashAt.y === ny) { h.bump = 0.6; h.bdx = dx; h.bdy = dy; openStash(g); return; }
  if (g.restAt && g.restAt.x === nx && g.restAt.y === ny) { h.bump = 0.6; h.bdx = dx; h.bdy = dy; restAtCamp(g); return; }
  if (g.fireAt && g.fireAt.x === nx && g.fireAt.y === ny) { h.bump = 0.4; h.bdx = dx; h.bdy = dy; msg(g, "The campfire warms you.", "#ffb040"); g.notify(); return; }
  const px = h.x, py = h.y;
  h.x = nx; h.y = ny;
  if (g.portal && g.portal.x === nx && g.portal.y === ny) {
    const k = portalKind(g);
    if (k === "proceed") { leaveCamp(g); return; }
    if (k === "camp") { enterCamp(g); return; }
    if (g.vault) exitVault(g); else enterVault(g);
    return;
  }
  for (const p of allPassives(g.eq)) if (p.ty === "steps") { addGround(g, px, py, p.el, 3 + (p.mod === 4 ? 2 : 0), Math.max(1, Math.round(st.atk * p.pw * 0.6 * (p.mod === 3 ? 1.6 : 1)))); if (g.turn % 3 === 0) g.sfx("mx", pasSnd(p)); }
  g.sfx("step");
  pickup(g);
  if (g.map[ny * MW + nx] === 2) msg(g, "Stairs down! Tap \u2B07 Stairs (or tap yourself).", "#80ffff");
  if (g.map[ny * MW + nx] === TILE_UP) msg(g, "Stairs up! Tap \u25B2 Back (or the Back button) to farm the floor above.", "#80ffd0");
  if (g.portal && g.portal.x === nx && g.portal.y === ny) { /* handled above */ }
  es.still = false; es.moved = 1; es.rush = Math.min(3, es.rush + 1);
  if (g.rt) { g.pcd = RT_MV / MVMUL; computeVis(g); g.notify(); return; } // real-time: Movement Speed shortens the step cooldown
  // Movement Speed (turn mode): a share of your steps are free (enemies don't get a turn), so +100% = 2 steps per enemy turn, +200% = 3
  g.mvAcc = (g.mvAcc ?? 0) + st.mv / (100 + st.mv);
  if (g.mvAcc >= 0.999) { g.mvAcc -= 1; computeVis(g); g.notify(); return; }
  endTurn(g);
}

function descend(g: Game): void {
  if (g.mode !== "play" || g.paused || g.map[g.hero.y * MW + g.hero.x] !== 2) return;
  if ((g.actCampAt ?? 0) === g.depth) g.actCampAt = 0;
  const prev = g.depth;
  const front = floorFront(g);
  if (prev === front - 1 && g.snapCur && g.snapCur.d === front) {
    g.snapPrev = captureFloor(g);
    g.front = front;
    restoreFloor(g, g.snapCur, TILE_UP);
  } else {
    const snapD = captureFloor(g);
    g.depth++;
    if (g.depth > g.best) { g.best = g.depth; saveBest(g); }
    g.front = g.depth;
    g.snapPrev = snapD;
    g.snapCur = null;
    genFloor(g);
  }
  if (g.depth > g.best) { g.best = g.depth; saveBest(g); }
  if (prev < 1001 && g.depth >= 1001) setBanner(g, "PART 2", "The depths grow boundless. Act bosses swell in power.", "#ff4040", 8, 3.6);
  else if (!(g.banner && g.banner.txt === "YOU ARE BEING HUNTED!")) setBanner(g, "DEPTH " + g.depth, themeName(g) + (g.thNew ? " \u00b7 NEW AREA " + (g.thSeen ?? []).length + "/50" : "") + (isActFloor(g.depth) ? " \u00b7 ACT BOSS" : ""), isActFloor(g.depth) ? "#ff6060" : "#a0c0ff", 2, 2.2);
  g.flash = 0;
  saveGame(g);
  g.sfx("stairs");
  g.notify();
}
function goBack(g: Game, fromStairs = false): void {
  if (!canGoBack(g)) return;
  if (fromStairs && g.map[g.hero.y * MW + g.hero.x] !== TILE_UP) return;
  if ((g.actCampAt ?? 0) === g.depth) g.actCampAt = 0;
  const snapD = captureFloor(g);
  const dest = floorFront(g) - 1;
  g.snapCur = snapD;
  if (g.snapPrev && g.snapPrev.d === dest) {
    restoreFloor(g, g.snapPrev, 2);
  } else {
    g.depth = Math.max(1, dest);
    genFloor(g);
  }
  if (!(g.banner && g.banner.txt === "YOU ARE BEING HUNTED!")) setBanner(g, "DEPTH " + g.depth, "A floor you can farm" + (g.thNew ? " \u00b7 NEW AREA " + (g.thSeen ?? []).length + "/50" : ""), "#80ffd0", 2, 2.0);
  g.flash = 0;
  saveGame(g);
  g.sfx("stairs");
  g.notify();
}

function usePotion(g: Game): void {
  if (g.mode !== "play" || g.paused || g.potions <= 0) return;
  const st = calc(g.lvl, g.eq);
  if (g.hero.hp >= st.maxHp) { msg(g, "Already at full health.", "#c0c0c0"); g.notify(); return; }
  if (R() < efc(0.08, efP(g, 93))) floatTxt(g, g.hero.x, g.hero.y - 0.9, "ALCHEMY!", EFX[93].c); else g.potions--;
  const heal = Math.round((st.maxHp * 0.45 + 5) * (1 + 0.25 * efP(g, 92)));
  g.hero.hp = Math.min(st.maxHp, g.hero.hp + heal);
  floatTxt(g, g.hero.x, g.hero.y - 0.3, "+" + heal, "#60ff80");
  burst(g, g.hero.ax * TS + 12, g.hero.ay * TS + 12, 24, ["#60ff80", "#ffffff", "#ff80a0"], 60, -30);
  g.sfx("potion");
  endTurn(g);
}

function equip(g: Game, bi: number, hand?: "rh" | "lh"): string {
  const it = g.bag[bi];
  if (!it) return "";
  if (it.kind === "gem") return "Gemstones are socketed into gear, not worn.";
  const res = simEq(g.eq, it, hand);
  ensureBagCapacity(g, false, g.bag.length - 1 + res.back.length);
  g.bag.splice(bi, 1);
  g.eq = res.eq;
  g.bag.push(...res.back);
  sortInventory(g);
  g.hero.hp = Math.min(g.hero.hp, calc(g.lvl, g.eq).maxHp);
  g.sfx("equip");
  return "Equipped " + it.name + ".";
}
function unequip(g: Game, k: EqKey): string {
  const it = g.eq[k];
  if (!it) return "";
  ensureBagCapacity(g, false, g.bag.length + 1);
  g.eq[k] = null; g.bag.push(it);
  sortInventory(g);
  g.hero.hp = Math.min(g.hero.hp, calc(g.lvl, g.eq).maxHp);
  return "Unequipped " + it.name + ".";
}

const CSS = `
html, body { margin: 0; padding: 0; width: 100%; height: 100%; height: 100dvh; max-height: 100dvh; overflow: hidden; overscroll-behavior: none; touch-action: none; position: fixed; inset: 0; }
.dc-root { position: fixed; top: var(--ed-vv-top, 0px); left: var(--ed-vv-left, 0px); width: var(--ed-vv-w, 100%); height: var(--ed-vv-h, 100dvh); max-height: var(--ed-vv-h, 100dvh); overflow: hidden; overscroll-behavior: none; touch-action: none; box-sizing: border-box; }
.dc-wrap { position: relative; width: 100%; max-width: 440px; height: 100%; max-height: 100%; margin: 0 auto; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; display: flex; flex-direction: column; overflow: hidden; overscroll-behavior: none; box-sizing: border-box; padding-top: var(--ed-safe-t, env(safe-area-inset-top, 0px)); padding-right: var(--ed-safe-r, env(safe-area-inset-right, 0px)); padding-bottom: var(--ed-safe-b, env(safe-area-inset-bottom, 0px)); padding-left: var(--ed-safe-l, env(safe-area-inset-left, 0px)); }
.dc-stage { position: relative; width: 100%; flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.dc-cv { width: var(--ed-cv-w, 100%); height: var(--ed-cv-h, auto); max-width: 100%; max-height: var(--ed-canvas-max, calc(100dvh - 320px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); display: block; margin: 0 auto; image-rendering: pixelated; image-rendering: crisp-edges; touch-action: none; outline: none; border-radius: 6px; background: #000; flex: 0 1 auto; }
.dc-util { display: flex; gap: 4px; flex-shrink: 0; padding: 4px 4px 0; align-items: stretch; position: relative; z-index: 2; }
.dc-util .dc-b { min-height: var(--ed-util-h, 36px); flex: 1; font-size: 11px; }
.dc-ctrl { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; padding: 6px 4px 0; flex-shrink: 0; position: relative; z-index: 2; }
.dc-padcol { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
.dc-saveload { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.dc-saveload .dc-b { min-height: var(--ed-save-h, 42px); font-size: 13px; }
.dc-saveload .dc-savegame { grid-column: 1 / -1; font-weight: 800; }
.dc-prof-time { font-size: 10px; font-weight: 700; opacity: 0.85; margin-top: 2px; }
.dc-invsave { display: flex; gap: 6px; flex-wrap: wrap; }
.dc-invsave .dc-b { flex: 1; min-width: 96px; }
.dc-actions { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.dc-pauseov { position: absolute; inset: 0; background: rgba(8,6,14,0.72); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; z-index: 8; color: #f0e8ff; }
.dc-pauseov b { font-size: 28px; letter-spacing: 2px; }
.dc-pad { display: none; }
.dc-stick { position: relative; width: var(--ed-stick, 168px); height: var(--ed-stick, 168px); flex-shrink: 0; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; cursor: pointer; }
.dc-stick-base { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle at 50% 42%, #3a3250 0%, #221c30 68%, #141018 100%); border: 3px solid #5a4e78; box-shadow: inset 0 0 18px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.45); pointer-events: none; }
.dc-stick-knob { position: absolute; left: 50%; top: 50%; width: 42%; height: 42%; margin-left: -21%; margin-top: -21%; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #d8ccf8, #6a5a90 55%, #3a3050); border: 2px solid #e8e0ff; box-shadow: 0 2px 6px rgba(0,0,0,0.5); pointer-events: none; will-change: transform; }
.dc-stick.held .dc-stick-base { border-color: #9a88cc; }
.dc-stick-lock { position: absolute; right: 8px; top: 8px; font-size: 16px; line-height: 1; pointer-events: none; text-shadow: 0 1px 2px #000; }
.dc-k { border: none; border-radius: 12px; background: #2a2438; color: #e8e0ff; font-size: 22px; touch-action: none; -webkit-tap-highlight-color: transparent; padding: 0; cursor: pointer; }
.dc-k:active, .dc-k.held { background: #4a3e66; transform: scale(0.95); }
.dc-k.diag { font-size: 20px; }
.dc-k.w { font-size: 12px; background: #1e1a2a; }
.dc-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; flex: 1; max-width: 200px; min-width: 0; touch-action: manipulation; }
@media (max-width: 360px) {
  .dc-k { font-size: 20px; }
  .dc-k.diag { font-size: 18px; }
  .dc-ctrl { gap: 6px; padding: 6px 2px 2px; }
}
@media (orientation: landscape) and (max-height: 500px) {
  .dc-k { font-size: 18px; border-radius: 10px; }
  .dc-k.diag { font-size: 16px; }
  .dc-ctrl { padding: 4px 4px 2px; gap: 8px; }
}
.dc-b { min-height: 50px; border: none; border-radius: 12px; background: #2a2438; color: #f0e8ff; font-size: 14px; font-weight: 600; touch-action: manipulation; -webkit-tap-highlight-color: transparent; cursor: pointer; padding: 0 6px; }
.dc-b:active { transform: scale(0.95); }
.dc-b:disabled { opacity: 0.4; cursor: default; }
.dc-b.go { background: #2a7a3a; }
.dc-title { position: absolute; left: 0; right: 0; top: 75%; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0 10px; }
.dc-tb { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.dc-cell.r7, .dc-prisbox {
  background: #1a1028;
  animation: pr 1.4s linear infinite;
  position: relative;
  overflow: hidden;
  border-color: #ff60a0;
  box-shadow: 0 0 14px #ff40c0, 0 0 4px #40d0ff, inset 0 0 8px rgba(255, 64, 192, 0.35);
}
.dc-cell.r7 img, .dc-prisbox img { animation: hue 2s linear infinite; position: relative; z-index: 1; }
.dc-cell.r7::before, .dc-prisbox::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 2;
  background:
    radial-gradient(circle at 20% 25%, #fff 0 1.2px, transparent 1.8px),
    radial-gradient(circle at 75% 60%, #fff 0 1.2px, transparent 1.8px),
    radial-gradient(circle at 45% 80%, #ffe080 0 1.2px, transparent 1.8px);
  background-size: 140% 140%;
  animation: prisSpark 1.1s linear infinite;
  mix-blend-mode: screen; opacity: 1; }
@keyframes prisSpark { 0% { background-position: 0 0, 20% 40%, 80% 10%; } 100% { background-position: 110% 90%, 90% -10%, -10% 100%; } }
@keyframes pr { 0%, 100% { border-color: #ff3040; box-shadow: 0 0 16px #ff3040, 0 0 4px #fff; } 17% { border-color: #ffd020; box-shadow: 0 0 16px #ffd020, 0 0 4px #fff; } 33% { border-color: #20ff60; box-shadow: 0 0 16px #20ff60, 0 0 4px #fff; } 50% { border-color: #20d0ff; box-shadow: 0 0 16px #20d0ff, 0 0 4px #fff; } 67% { border-color: #a040ff; box-shadow: 0 0 16px #a040ff, 0 0 4px #fff; } 83% { border-color: #ff40c8; box-shadow: 0 0 16px #ff40c8, 0 0 4px #fff; } }
@keyframes hue { from { filter: hue-rotate(0deg) saturate(1.85) brightness(1.12); } to { filter: hue-rotate(360deg) saturate(1.85) brightness(1.12); } }
.dc-pris-arcs { position: absolute; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; }
.dc-pris-arcs svg { width: 100%; height: 100%; display: block; }
.dc-pris-arcs .bolt { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.15; mix-blend-mode: screen; }
.dc-pris-arcs .bolt.a { stroke: #fff; animation: prisBoltA 0.7s steps(3) infinite, prisHue 1.4s linear infinite, prisRise 1.6s linear infinite; }
.dc-pris-arcs .bolt.b { stroke: #a0f0ff; animation: prisBoltB 0.55s steps(2) infinite, prisHue 1.8s linear infinite reverse, prisRise 2.1s linear infinite; opacity: 0.9; }
@keyframes prisBoltA { 0%, 100% { opacity: 1; stroke-width: 1.3; } 33% { opacity: 0.35; stroke-width: 0.7; } 66% { opacity: 0.9; stroke-width: 1.6; } }
@keyframes prisBoltB { 0%, 100% { opacity: 0.9; } 50% { opacity: 0.2; } }
@keyframes prisHue { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }
@keyframes prisRise { 0% { transform: translateY(18%); } 100% { transform: translateY(-28%); } }
.dc-prisbox { display: inline-block; width: 96px; height: 96px; border: 3px solid #ff60a0; border-radius: 8px; margin: 4px auto; position: relative; overflow: hidden; }
.dc-prisbox .dc-reveal-ico { margin: 0; width: 100%; height: 100%; }
.dc-cell.ult::after { content: ""; position: absolute; inset: 2px; border: 2px solid #ffd840; border-radius: 4px; box-shadow: 0 0 6px #ffd840, inset 0 0 6px rgba(255, 216, 64, 0.7); pointer-events: none; }
.pn { background: linear-gradient(90deg, #ff4040, #ffd040, #40ff60, #40d0ff, #a060ff, #ff40c0, #ff4040); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent !important; animation: shim 2s linear infinite; }
.dc-ultl { margin-top: 5px; padding: 5px 7px; border: 2px solid #ffd840; border-radius: 6px; color: #ffe680; background: rgba(255, 216, 64, 0.08); box-shadow: 0 0 8px rgba(255, 216, 64, 0.4); }
.dc-pc { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 10px; font-weight: 700; }
.dc-code { margin-top: 6px; padding: 6px; max-height: 110px; overflow-y: auto; word-break: break-all; font-size: 9px; background: #14101e; border: 1px solid #3a3450; border-radius: 6px; user-select: all; -webkit-user-select: all; }
.dc-paste { margin-top: 6px; min-height: 44px; padding: 6px; border: 1px dashed #8a80a8; border-radius: 6px; font-size: 11px; color: #c8c0ff; user-select: text; -webkit-user-select: text; }
.dc-ult { position: relative; padding: 3px; }
.dc-ulti { display: flex; align-items: center; justify-content: center; min-height: 44px; border-radius: 10px; background: #2a2438; color: #ffd840; font-weight: 700; padding: 0 6px; }
.dc-ult.rdy { background: linear-gradient(90deg, #ffd840, #ff60e0, #40d0ff, #ffd840); background-size: 200% 100%; animation: shim 1.2s linear infinite; }
.dc-ult.rdy .dc-ulti { background: #3a2a10; }
.dc-title .dc-b { min-width: 128px; min-height: 44px; }
.dc-b.bad { background: #7a2a2a; }
.dc-msw { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; padding: 12px; background: rgba(0, 0, 0, 0.55); border-radius: 6px; touch-action: manipulation; }
.dc-msw .dc-conf { max-width: 90%; }
.dc-conf { background: rgba(10, 8, 16, 0.94); border: 1px solid #5a4a7a; border-radius: 10px; padding: 8px; text-align: center; color: #ffffff; font-size: 13px; display: flex; flex-direction: column; gap: 8px; }
.dc-lock { position: absolute; left: calc(var(--ed-cv-left, 0px) + 4px); top: calc(var(--ed-cv-top, 0px) + var(--ed-hud-css, 34px) + 4px); width: 28px; height: 28px; min-width: 28px; z-index: 25; padding: 0; border: 1px solid #3a3450; border-radius: 6px; background: rgba(12, 10, 18, 0.85); font-size: 11px; line-height: 1; cursor: pointer; touch-action: manipulation; opacity: 0.7; -webkit-tap-highlight-color: transparent; }
.dc-quit { position: absolute; left: calc(var(--ed-cv-left, 0px) + var(--ed-cv-w, 100%) - 32px); top: calc(var(--ed-cv-top, 0px) + 3px); width: 28px; height: 28px; min-width: 28px; z-index: 25; padding: 0; border: 1px solid #4a3040; border-radius: 6px; background: rgba(12, 10, 18, 0.85); color: #e8a0a8; font-size: 10px; line-height: 1; cursor: pointer; touch-action: manipulation; opacity: 0.7; -webkit-tap-highlight-color: transparent; }
.dc-qw { z-index: 45; }
.dc-lock.on { border-color: #6a5a3a; }
.dc-wbrk { position: absolute; left: calc(var(--ed-cv-left, 0px) + 4px); top: calc(var(--ed-cv-top, 0px) + var(--ed-hud-css, 34px) + 36px); width: 28px; height: 28px; min-width: 28px; z-index: 25; padding: 0; border: 1px solid #3a3450; border-radius: 6px; background: rgba(12, 10, 18, 0.85); color: #c8c0b0; font-size: 13px; line-height: 1; cursor: pointer; touch-action: manipulation; opacity: 0.75; -webkit-tap-highlight-color: transparent; }
.dc-wbrk.on { border-color: #e8c860; background: rgba(80, 60, 16, 0.92); color: #ffe080; box-shadow: 0 0 8px rgba(255, 200, 80, 0.55); opacity: 1; }
.dc-io { z-index: 30; user-select: text; -webkit-user-select: text; -webkit-touch-callout: default; touch-action: pan-y; }
.dc-ta { display: block; width: 100%; box-sizing: border-box; min-height: 110px; font-size: 13px; font-family: ui-monospace, Menlo, monospace; word-break: break-all; background: #14101e; color: #f0ecff; border: 2px solid #6a5a9a; border-radius: 8px; padding: 8px; resize: vertical; user-select: text; -webkit-user-select: text; -webkit-touch-callout: default; touch-action: auto; pointer-events: auto; }
.dc-big { display: block; width: 100%; min-height: 52px; margin-top: 8px; font-size: 16px; position: relative; z-index: 31; pointer-events: auto; }
.dc-note { color: #ffe080; margin-top: 8px; font-size: 13px; font-weight: 700; }
.dc-st { font-size: 11px; font-weight: 700; text-align: center; padding: 3px 8px; border-radius: 6px; background: rgba(0, 0, 0, 0.7); }
.dc-st.on { color: #80ff9a; }
.dc-st.off { color: #ffb070; }
.dc-st.checking { color: #c0b8d8; }
.dc-title { z-index: 20; }
.dc-tn { color: #ffb080; font-size: 12px; text-align: center; background: rgba(0, 0, 0, 0.7); padding: 4px 8px; border-radius: 6px; }
.dc-b.hot { background: #1e5a6a; animation: dcPulse 1s ease-in-out infinite; }
@keyframes dcPulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.5); } }
.dc-inv { position: absolute; inset: 0; background: rgba(10, 8, 16, 0.97); border-radius: 6px; overflow-y: auto; touch-action: pan-y; padding: 8px; color: #ece8f4; font-size: 12px; line-height: 1.35; font-family: ui-monospace, Menlo, monospace; }
.dc-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.dc-grid6 { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; }
.dc-cell { width: 100%; aspect-ratio: 1; border: 2px solid #333; border-radius: 6px; background: #1a1626; padding: 0; position: relative; cursor: pointer; touch-action: manipulation; overflow: hidden; }
.dc-cell img { width: 100%; height: 100%; image-rendering: pixelated; display: block; pointer-events: none; }
.dc-cell.sel { outline: 2px solid #ffffff; outline-offset: 1px; }
.dc-cell .lb { position: absolute; left: 0; right: 0; bottom: 1px; font-size: 8px; color: #888; text-align: center; }
.dc-pips { position: absolute; left: 2px; right: 2px; bottom: 11px; display: flex; justify-content: center; gap: 2px; pointer-events: none; z-index: 6; }
.dc-pips i { width: 9px; height: 9px; border-radius: 50%; border: 2px solid #888; display: block; box-sizing: border-box; box-shadow: 0 0 0 1px #000, 0 0 2px #fff; background: transparent; }
.dc-sm { font-size: 10px; color: #a8a0b8; }
.dc-chip { background: #1e1a2a; border-radius: 6px; padding: 3px 5px; font-size: 10px; }
.dc-det { background: #16121f; border: 1px solid #3a3050; border-radius: 8px; padding: 7px; margin: 7px 0; }
.dc-act { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.dc-act button { min-height: 38px; border: none; border-radius: 8px; padding: 0 10px; font-weight: 700; font-size: 12px; cursor: pointer; touch-action: manipulation; background: #3a3050; color: #fff; }
.dc-act button.go { background: #2a7a3a; }
.dc-act button.bad { background: #7a2a2a; }
.up { color: #50e070; } .dn { color: #ff5a5a; }
.r3 { animation: gO 1.6s ease-in-out infinite; }
.r4 { animation: gP 1.3s ease-in-out infinite; }
.r5 { background: linear-gradient(110deg, #1a1626 35%, #1e5a66 50%, #1a1626 65%); background-size: 260% 100%; animation: shim 1.6s linear infinite, gC 1.2s ease-in-out infinite; }
.r6 { background: radial-gradient(circle at 50% 70%, #5a1010, #1a1626 70%); animation: gR 0.6s ease-in-out infinite; }
@keyframes gO { 0%, 100% { box-shadow: 0 0 3px #ff8c1a; } 50% { box-shadow: 0 0 10px #ff8c1a; } }
@keyframes gP { 0%, 100% { box-shadow: 0 0 4px #c060ff; } 50% { box-shadow: 0 0 13px #c060ff, inset 0 0 6px #c060ff; } }
@keyframes gC { 0%, 100% { box-shadow: 0 0 5px #40f0ff; } 50% { box-shadow: 0 0 14px #40f0ff; } }
@keyframes shim { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
@keyframes gR { 0%, 100% { box-shadow: 0 0 6px #ff3030, 0 0 2px #ffe040; } 50% { box-shadow: 0 0 16px #ff3030, 0 0 8px #ff8020; } }
.dc-shopw { position: absolute; inset: 0; z-index: 36; display: flex; align-items: stretch; justify-content: center; padding: 8px; background: rgba(0, 0, 0, 0.55); border-radius: 6px; touch-action: manipulation; }
.dc-shopw .dc-shop { position: relative; inset: auto; flex: 1; width: 100%; max-height: 100%; display: flex; flex-direction: column; overflow: hidden; padding: 0; }
.dc-shop-bd { overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; padding: 0 8px 8px; flex: 1; }
.dc-shop-hd, .dc-shop-ft { flex-shrink: 0; background: rgba(10, 8, 16, 0.98); padding: 6px 8px; z-index: 2; }
.dc-shop-hd { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid #3a3050; }
.dc-shop-gold { color: #ffd840; font-weight: 800; font-size: 16px; }
.dc-merch-odds { width: 100%; border-collapse: collapse; font-size: 11px; margin: 6px 0 8px; }
.dc-merch-odds th, .dc-merch-odds td { text-align: left; padding: 2px 4px; }
.dc-merch-odds .hi { color: #c060ff; font-weight: 700; }
.dc-merch-list { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
.dc-merch-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: rgba(20, 16, 32, 0.9); border: 1px solid #3a3050; border-radius: 6px; padding: 6px 8px; }
.dc-merch-row .dc-b { min-height: 40px; min-width: 96px; flex-shrink: 0; font-size: 12px; }
.dc-merch-lab { font-weight: 700; font-size: 13px; }
.dc-merch-price { color: #ffd840; font-weight: 800; font-size: 13px; }
.dc-merch-ico { width: 44px; height: 44px; flex: none; image-rendering: pixelated; background: #3a2008; }
.dc-merch-row > div:first-child { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dc-reveal { position: absolute; inset: 0; z-index: 30; background: rgba(6, 4, 12, 0.86); display: flex; align-items: center; justify-content: center; padding: 12px; }
.dc-reveal-card { width: 100%; max-width: 360px; background: linear-gradient(#241830, #120c1c); border: 2px solid #d4a04a; border-radius: 12px; padding: 16px 14px 18px; text-align: center; box-shadow: 0 0 28px #000, 0 0 18px rgba(212, 160, 74, 0.35); }
.dc-reveal-rar { font-size: 22px; font-weight: 900; letter-spacing: 1px; line-height: 1.15; text-shadow: 0 0 14px currentColor; margin: 0 0 10px; }
.dc-reveal-ico { width: 96px; height: 96px; image-rendering: pixelated; margin: 4px auto; display: block; }
.dc-reveal-chest { width: 96px; height: 96px; image-rendering: pixelated; margin: 8px auto; display: block; animation: dcOpen 0.7s ease-out; }
@keyframes dcOpen { 0% { transform: scale(0.72) rotate(-8deg); } 45% { transform: scale(1.1) rotate(4deg); } 100% { transform: scale(1) rotate(0); } }
.dc-reveal-name { font-size: 16px; font-weight: 800; margin: 8px 0 4px; }
.dc-reveal-hint { margin-top: 12px; color: #c8b8f0; font-size: 12px; font-weight: 700; }
.dc-leave { min-height: 52px; min-width: 108px; padding: 0 14px; font-size: 16px; font-weight: 800; background: #ffe070; color: #1a1020; border: 2px solid #ffffff; border-radius: 12px; cursor: pointer; touch-action: manipulation; }
.dc-leave:active { transform: scale(0.97); }
.dc-leave-wide { width: 100%; min-height: 54px; display: block; }
.dc-price { font-size: 9px; font-weight: 700; text-align: center; line-height: 1.25; max-width: 100%; }
.dc-price.no { color: #ff5050; }
.dc-price.ok { color: #ffd840; }
.dc-stars { position: absolute; top: 1px; right: 1px; padding: 0 2px; font-size: 8px; line-height: 1.15; color: #ffd840; font-weight: 800; text-shadow: 0 0 2px #000, 0 1px 1px #000; pointer-events: none; background: rgba(0,0,0,0.55); border-radius: 3px; }
.dc-pl { position: absolute; left: 1px; right: 1px; bottom: 0; font-size: 7px; line-height: 1.1; text-align: center; color: #e8e0ff; font-weight: 700; text-shadow: 0 0 2px #000; pointer-events: none; }
.dc-cell.setp { box-shadow: 0 0 0 1px #40e070; }
.gn { color: #ffd840; text-shadow: 0 0 8px #ffd840, 0 0 2px #fff8c0; }
.dc-pwr { margin: 6px 0; padding: 7px 8px; border: 1px solid #5a4a20; border-radius: 8px; background: rgba(40, 30, 10, 0.55); }
.dc-pwr b { color: #ffd840; font-size: 15px; }
.dc-reco { margin-top: 6px; font-size: 11px; color: #ffd840; line-height: 1.35; }
.dc-reco .dc-dbg { color: #a8a0b8; font-size: 10px; }
.dc-ults { display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; gap: 0; flex-shrink: 0; margin-left: auto; width: 96px; }
.dc-ults .dc-ult { width: 96px; height: 64px; min-height: 64px !important; min-width: 96px; padding: 2px 4px !important; font-size: 11px; line-height: 1.1; border-radius: 12px; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.dc-ults .dc-ultn { display: block; font-size: 11px; font-weight: 800; letter-spacing: 0.02em; line-height: 1.15; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.dc-ults .dc-ultm { display: block; font-size: 10px; font-weight: 700; color: #ffe080; line-height: 1.15; }
.dc-ults .dc-ult.rdy { box-shadow: 0 0 10px #ffd840, 0 1px 6px rgba(0, 0, 0, 0.5); }
@media (max-width: 360px), (max-height: 500px) {
  .dc-ults { width: 80px; }
  .dc-ults .dc-ult { width: 80px; height: 56px; min-height: 56px !important; min-width: 80px; font-size: 10px; }
  .dc-ults .dc-ultn { font-size: 10px; }
  .dc-ults .dc-ultm { font-size: 9px; }
}
.dc-profs { position: absolute; inset: 0; z-index: 40; background: rgba(6, 4, 12, 0.82); display: flex; align-items: center; justify-content: center; padding: 16px; }
.dc-profs-card { width: min(360px, 100%); background: #161022; border: 2px solid #6a5a90; border-radius: 14px; padding: 16px 14px; box-shadow: 0 8px 28px rgba(0,0,0,0.55); }
.dc-profs-hd { font-size: 16px; font-weight: 800; text-align: center; margin-bottom: 10px; }
.dc-profs-list { display: flex; flex-direction: column; gap: 8px; }
.dc-prof { width: 100%; min-height: 56px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; text-align: left; padding: 8px 12px !important; }
.dc-prof b { font-size: 15px; }
.dc-setlist { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.dc-setbon { margin-top: 4px; }
.dc-sethd { font-weight: 800; color: #40e070; font-size: 12px; }
.dc-setline { font-size: 12px; line-height: 1.35; margin-top: 2px; }
.dc-setline.off { color: #6a6480; opacity: 0.72; font-weight: 500; }
.dc-setline.on { color: #40ff80; font-weight: 800; text-shadow: 0 0 8px #40ff80, 0 0 2px #fff; animation: setPulse 1.2s ease-in-out infinite; }
@keyframes setPulse { 0%, 100% { text-shadow: 0 0 6px #40ff80; } 50% { text-shadow: 0 0 14px #70ffb0, 0 0 4px #fff; } }
@media (prefers-reduced-motion: reduce) {
  .dc-cell.r7, .dc-prisbox, .dc-cell.r7 img, .dc-prisbox img, .dc-cell.r7::before, .dc-prisbox::before, .dc-pris-arcs .bolt, .dc-setline.on { animation: none !important; }
}
.dc-portw { display: flex; justify-content: center; align-items: flex-end; gap: 8px; margin: 6px 0 8px; }
.dc-port { width: auto; max-width: 100%; height: auto; image-rendering: pixelated; image-rendering: crisp-edges; background: #14101c; border: 2px solid #3a3450; border-radius: 8px; display: block; }
`;

// ---------- music data ----------
interface Song {
  name?: string; mood?: string; mode?: string;
  root: number; sc: number[]; bpm: number; prog: number[]; arp: number[]; seed: number;
  bars?: number; pad?: OscillatorType; bass?: OscillatorType; lead?: OscillatorType; arpWave?: OscillatorType;
  echo?: number; vol?: number; tune?: (number | null)[];
}
const MUS_GAIN = 0.55;
function songLoopBars(s: Song): number { return Math.max(s.prog.length, s.bars && s.bars > 0 ? s.bars : s.prog.length * 2); }
function songLoopSec(s: Song): number { return songLoopBars(s) * 4 * (60 / s.bpm); }
function pickNextSong(cur: number, n: number, r: number): number {
  if (n <= 1) return 0;
  const i = ((cur | 0) % n + n) % n;
  const k = Math.floor(Math.max(0, Math.min(0.999999, r)) * (n - 1));
  return (i + 1 + k) % n;
}
function musicShouldRun(musicOn: boolean, acState: string): boolean { return !!musicOn && acState === "running"; }
function sfxShouldPlay(muted: boolean): boolean { return !muted; }
function shouldAdvanceSongOnFloor(prevDepth: number, depth: number, inBoss: boolean, area: string): boolean {
  if (inBoss || area === "camp" || area === "vault") return false;
  return prevDepth > 0 && depth !== prevDepth;
}
const SONGS: Song[] = [
  { name: "Depths Below", mood: "The original wandering dungeon theme: hushed A aeolian, slow triangle choir and a soft square harp.", mode: "aeolian", root: 57, sc: [0, 2, 3, 5, 7, 8, 10], bpm: 74, prog: [0, 5, 3, 4, 0, 5, 6, 4], arp: [0, 1, 2, 1, 3, 2, 1, 2], seed: 11, bars: 24, pad: "triangle", bass: "triangle", lead: "triangle", arpWave: "square", echo: 0.16, vol: 1 },
  { name: "Still Embers", mood: "A warm D dorian lullaby of sine pads, sleepy pulse bass, and a slow triangle melody.", mode: "dorian", root: 50, sc: [0, 2, 3, 5, 7, 9, 10], bpm: 62, prog: [0, 4, 0, 5, 3, 4, 1, 0], arp: [0, 2, 1, 2, 0, 3, 1, 0], seed: 29, bars: 22, pad: "sine", bass: "triangle", lead: "triangle", arpWave: "sine", echo: 0.2, vol: 1, tune: [0, 2, 4, 2, 3, 2, 0, null, 4, 5, 4, 2, 0, 2, 4, null, 5, 4, 2, 4, 3, 2, 0, 2, 4, 2, 0, null, 2, 0, 5, 4, 0, 2, 3, 5, 4, 2, 0, null, 4, 2, 4, 5, 3, 2, 0, 2, 5, 4, 2, 0, 3, 2, 4, null, 2, 0, 2, 4, 0, null, 3, 2] },
  { name: "Quiet Stones", mood: "A very slow C aeolian hymn: distant triangle organ, sparse melody, and a long gentle echo.", mode: "aeolian", root: 48, sc: [0, 2, 3, 5, 7, 8, 10], bpm: 56, prog: [0, 3, 5, 4, 0, 6, 3, 0], arp: [0, 1, 0, 2, 1, 0, 3, 1], seed: 41, bars: 20, pad: "triangle", bass: "sine", lead: "sine", arpWave: "triangle", echo: 0.26, vol: 0.95, tune: [0, null, 2, null, 0, null, null, 3, 2, null, 0, null, 5, null, 4, null, 0, null, 3, null, 2, null, 0, null, 4, null, 2, null, 0, null, null, null, 3, null, 2, 0, null, 5, 4, null, 0, null, 2, null, 3, null, 0, 2, 0, null, null, 4, 2, null, 0, null, 5, null, 3, 2, 0, null, 2, null] },
  { name: "Cinder Veil", mood: "Dusky E phrygian, muted pulse arpeggios and airy noise over a low triangle drone.", mode: "phrygian", root: 52, sc: [0, 1, 3, 5, 7, 8, 10], bpm: 64, prog: [0, 1, 5, 0, 3, 1, 4, 0], arp: [0, 1, 3, 1, 0, 2, 1, 3], seed: 53, bars: 24, pad: "triangle", bass: "triangle", lead: "triangle", arpWave: "square", echo: 0.18, vol: 0.96, tune: [0, 1, 0, 3, 1, 0, null, 2, 3, 1, 0, 1, 5, 3, 1, 0, 0, 1, 3, 5, 3, 1, 0, null, 1, 0, 3, 1, 0, null, 1, 0, 3, 1, 5, 3, 1, 0, 2, 1, 0, 1, 0, null, 3, 1, 0, 1, 5, 3, 1, 0, 3, 1, null, 0, 1, 0, 3, 5, 3, 1, 0, null] },
  { name: "Moonlit Hollow", mood: "A lamplit F harmonic-minor air: soft triangle lead, sine pedal, and a hush of echo.", mode: "harmonic minor", root: 53, sc: [0, 2, 3, 5, 7, 8, 11], bpm: 60, prog: [0, 5, 3, 6, 0, 4, 5, 0], arp: [0, 2, 3, 2, 0, 1, 3, 2], seed: 67, bars: 22, pad: "sine", bass: "triangle", lead: "triangle", arpWave: "triangle", echo: 0.22, vol: 1, tune: [0, 2, 3, 5, 4, 3, 2, null, 5, 7, 5, 3, 2, 0, 2, 3, 0, 3, 5, 3, 4, 2, 0, null, 7, 5, 3, 2, 0, 2, 3, 0, 2, 4, 5, 4, 3, 2, 0, 2, 5, 3, 2, 0, 3, 5, 7, 5, 0, 2, 3, null, 4, 3, 2, 0, 5, 3, 2, 0, 2, null, 0, 3] },
];
const CAMP_SONG_I = 2;
const BOSS_SONG: Song = { name: "Act Clash", mood: "The existing tense act-boss theme: faster phrygian-flavored drive, left unchanged.", mode: "phrygian", root: 45, sc: [0, 1, 3, 5, 7, 8, 11], bpm: 118, prog: [0, 0, 5, 5, 3, 3, 4, 1], arp: [0, 1, 2, 3, 2, 1, 2, 3], seed: 77 };
const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const sdeg = (s: Song, d: number): number => s.root + s.sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

// ---------- spell / passive drawing ----------
function drawFx(ctx: CanvasRenderingContext2D, f: Fx, camX: number, camY: number, t: number): void {
  if (f.t > f.max) return;
  const p = 1 - f.t / f.max;
  const x = f.x - camX, y = f.y - camY, x2 = f.x2 - camX, y2 = f.y2 - camY;
  const fade = Math.min(1, (f.t / f.max) * 2.2);
  ctx.globalAlpha = fade;
  if (f.k === "ring" || f.k === "ward") {
    const r = Math.max(2, f.r * (f.k === "ward" ? 1 : Math.min(1, p * 1.4)));
    ctx.strokeStyle = f.c; ctx.lineWidth = 3 * (1 - p) + 1; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = f.c2; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, Math.max(1, r - 3), 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = fade * 0.18; ctx.fillStyle = f.c; ctx.fill();
  } else if (f.k === "bolt") {
    const q = Math.min(1, p * 1.7);
    for (let i = 0; i < 5; i++) { const qq = Math.max(0, q - i * 0.06); const bx = x + (x2 - x) * qq, by = y + (y2 - y) * qq; const s = Math.max(1, f.r - i); ctx.globalAlpha = fade * (1 - i * 0.18); ctx.fillStyle = i === 0 ? f.c2 : f.c; ctx.fillRect(Math.round(bx - s / 2), Math.round(by - s / 2), s, s); }
  } else if (f.k === "arc") {
    const dx = x2 - x, dy = y2 - y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? f.c : f.c2; ctx.lineWidth = pass === 0 ? 3 : 1; ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 1; i < 7; i++) { const j = (Math.random() - 0.5) * 10; ctx.lineTo(x + (dx * i) / 7 + nx * j, y + (dy * i) / 7 + ny * j); }
      ctx.lineTo(x2, y2); ctx.stroke();
    }
  } else if (f.k === "beam") {
    ctx.strokeStyle = f.c; ctx.lineWidth = f.r * (1 - p) + 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = f.c2; ctx.lineWidth = Math.max(1, (f.r * (1 - p)) / 3); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  } else if (f.k === "pillar") {
    const w = f.r * (1 - p * 0.6);
    ctx.fillStyle = f.c; ctx.fillRect(Math.round(x - w / 2), y - 220, Math.round(w), 232);
    ctx.fillStyle = f.c2; ctx.fillRect(Math.round(x - w / 6), y - 220, Math.max(1, Math.round(w / 3)), 232);
    ctx.globalAlpha = fade * 0.4; ctx.fillStyle = f.c; ctx.beginPath(); ctx.ellipse(x, y + 8, w * 1.4, w * 0.5, 0, 0, 6.2832); ctx.fill();
  } else if (f.k === "meteor") {
    if (p < 0.5) {
      const q = p / 0.5, mx = x - 60 + 60 * q, my = y - 130 + 130 * q;
      ctx.globalAlpha = 1;
      for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? f.c : f.c2; const s = 7 - i; ctx.fillRect(Math.round(mx - i * 6 - s / 2), Math.round(my - i * 13 - s / 2), s, s); }
      ctx.fillStyle = "#3a2010"; ctx.fillRect(Math.round(mx - 4), Math.round(my - 4), 8, 8); ctx.fillStyle = f.c2; ctx.fillRect(Math.round(mx - 2), Math.round(my - 2), 3, 3);
    } else {
      const q = (p - 0.5) / 0.5;
      ctx.globalAlpha = 1 - q; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(x, y, f.r * (0.4 + q), 0, 6.2832); ctx.fill();
      ctx.fillStyle = f.c2; ctx.beginPath(); ctx.arc(x, y, f.r * (0.2 + q * 0.5), 0, 6.2832); ctx.fill();
    }
  } else if (f.k === "vortex") {
    for (let i = 0; i < 18; i++) { const a = t * 9 + i * 0.7 + f.seed; const r = (f.r * (1 - p) * ((i % 6) + 1)) / 6; ctx.fillStyle = i % 3 ? f.c : "#ffffff"; ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.7), 2, 2); }
    ctx.fillStyle = f.c2; ctx.globalAlpha = fade * 0.8; ctx.beginPath(); ctx.arc(x, y, 3 + 4 * (1 - p), 0, 6.2832); ctx.fill();
  } else if (f.k === "blades") {
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) { const a = t * 11 + i * 1.2566; ctx.strokeStyle = i % 2 ? f.c : f.c2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * f.r * 0.45, y + Math.sin(a) * f.r * 0.45); ctx.lineTo(x + Math.cos(a + 0.35) * f.r, y + Math.sin(a + 0.35) * f.r); ctx.stroke(); }
  } else if (f.k === "spikes") {
    const dx = x2 - x, dy = y2 - y, n = Math.max(2, Math.round(Math.hypot(dx, dy) / 10));
    for (let i = 1; i <= n; i++) {
      const q = Math.max(0, Math.min(1, p * 2.5 - i / n)); const hg = Math.sin(q * Math.PI) * (6 + f.r);
      if (hg <= 0.5) continue;
      const bx = x + (dx * i) / n, by = y + (dy * i) / n + 6;
      ctx.fillStyle = f.c; ctx.beginPath(); ctx.moveTo(bx - 3, by); ctx.lineTo(bx, by - hg); ctx.lineTo(bx + 3, by); ctx.fill();
      ctx.fillStyle = f.c2; ctx.fillRect(Math.round(bx), Math.round(by - hg), 1, 2);
    }
  } else if (f.k === "ultbg") {
    ctx.globalAlpha = 0.38 * Math.sin(Math.min(1, p) * Math.PI);
    ctx.fillStyle = f.c; ctx.fillRect(x - 220, y - 220, 440, 440);
    ctx.globalAlpha = 0.7 * (1 - p); ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) { const a = f.seed + i * 0.2618 + p * 2; ctx.strokeStyle = i % 2 ? f.c2 : "#ffffff"; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 20 * (1 + p * 4), y + Math.sin(a) * 20 * (1 + p * 4)); ctx.lineTo(x + Math.cos(a) * 230, y + Math.sin(a) * 230); ctx.stroke(); }
  } else if (f.k === "sweep") {
    const a = f.seed + p * 9.42;
    ctx.lineWidth = 5; ctx.strokeStyle = f.c; ctx.beginPath(); ctx.arc(x, y, f.r, a - 0.7, a); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = f.c2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * f.r, y + Math.sin(a) * f.r); ctx.stroke();
  } else if (f.k === "cloud") {
    for (let i = 0; i < 7; i++) { const a = f.seed + i * 0.9 + t * 0.6; const r = f.r * 0.6; ctx.globalAlpha = fade * 0.3; ctx.fillStyle = i % 2 ? f.c : f.c2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, 7 + (i % 3) * 3, 0, 6.2832); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}
function drawGround(ctx: CanvasRenderingContext2D, g: Game, camX: number, camY: number, t: number): void {
  for (const gr of g.ground) {
    if (!g.vis[gr.y * MW + gr.x]) continue;
    const sx = gr.x * TS - camX, sy = gr.y * TS - camY;
    ctx.globalAlpha = 0.22 + 0.1 * Math.sin(t * 6 + gr.x * 1.3 + gr.y);
    ctx.fillStyle = ELC[gr.el]; ctx.fillRect(sx + 1, sy + 1, TS - 2, TS - 2);
    ctx.globalAlpha = 0.75; ctx.fillStyle = EL2[gr.el];
    const k = Math.floor(t * 8 + gr.x * 3 + gr.y * 7);
    ctx.fillRect(sx + ((k * 5) % 20) + 2, sy + ((k * 7) % 18) + 3, 2, 2);
    ctx.fillRect(sx + ((k * 11) % 20) + 2, sy + ((k * 13) % 18) + 3, 1, 1);
  }
  ctx.globalAlpha = 1;
}
function drawAllies(ctx: CanvasRenderingContext2D, g: Game, sx: number, sy: number, t: number): void {
  g.allies.forEach((a: Ally, i: number) => {
    const an = t * 1.8 + a.ph + i * 1.6;
    const x = Math.round(sx + 12 + Math.cos(an) * 24 - 3), y = Math.round(sy + 4 + Math.sin(an) * 9 + Math.sin(t * 5 + i) * 2);
    const c = ELC[a.el];
    ctx.globalAlpha = 0.3; ctx.fillStyle = c; ctx.fillRect(x - 2, y - 2, 11, 12);
    ctx.globalAlpha = 0.9;
    const p = painter(ctx, x, y, 1, false, 0);
    p(1, 0, 5, 1, c); p(0, 1, 7, 5, c); p(0, 6, 2, 1, c); p(3, 6, 1, 2, c); p(5, 6, 2, 1, c);
    p(1, 2, 2, 2, "#ffffff"); p(4, 2, 2, 2, "#ffffff"); p(2, 3, 1, 1, "#100818"); p(5, 3, 1, 1, "#100818");
  });
  ctx.globalAlpha = 1;
}
function drawPassives(ctx: CanvasRenderingContext2D, g: Game, sx: number, sy: number, t: number, layer: number, wardMax: number): void {
  const cx = sx + 12, cy = sy + 12;
  let orbI = 0;
  for (const p of allPassives(g.eq)) {
    const c = ELC[p.el], c2 = EL2[p.el];
    const big = p.pw >= 0.6 ? 1 : 0;
    if (layer === 0) {
      if (p.ty === "aura") { ctx.globalAlpha = 0.12 + 0.08 * Math.sin(t * 4); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy + 4, 20 + (p.mod === 0 ? 10 : 0), 0, 6.2832); ctx.fill(); }
      else if (p.ty === "field") { ctx.globalAlpha = 0.55; ctx.fillStyle = c; for (let i = 0; i < 14; i++) { const a = t * 1.5 + i * 0.4488; const r = 30 + 6 * Math.sin(t * 2 + i); ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + 6 + Math.sin(a) * r * 0.5), 2, 1); } }
      else if (p.ty === "pulse") { const ph = (t * 0.8) % 1; ctx.globalAlpha = 0.5 * (1 - ph); ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, 6 + ph * 34, 0, 6.2832); ctx.stroke(); }
    } else {
      if (p.ty === "orbs") { const n = (p.mod === 3 ? 2 : 1) + big; for (let i = 0; i < n; i++) { const a = t * 2.6 + orbI++ * 2.1; const ox = cx + Math.cos(a) * 16, oy = cy + Math.sin(a) * 9 - 2; ctx.globalAlpha = 0.35; ctx.fillStyle = c; ctx.fillRect(Math.round(ox - 3), Math.round(oy - 3), 6, 6); ctx.globalAlpha = 1; ctx.fillRect(Math.round(ox - 2), Math.round(oy - 2), 4, 4); ctx.fillStyle = c2; ctx.fillRect(Math.round(ox - 1), Math.round(oy - 1), 2, 2); } }
      else if (p.ty === "thorns") { ctx.globalAlpha = 0.85; ctx.fillStyle = c; for (let i = 0; i < 8; i++) { const a = i * 0.785 + t * 0.5; ctx.fillRect(Math.round(cx + Math.cos(a) * 15), Math.round(cy + Math.sin(a) * 15), 2, 2); ctx.fillRect(Math.round(cx + Math.cos(a) * 18), Math.round(cy + Math.sin(a) * 18), 1, 1); } }
      else if (p.ty === "retal") { ctx.globalAlpha = 0.9; for (let i = 0; i < 3; i++) { ctx.fillStyle = Math.random() < 0.5 ? c : c2; ctx.fillRect(Math.round(cx + (Math.random() - 0.5) * 26), Math.round(cy + (Math.random() - 0.5) * 26), 1, 2); } }
      else if (p.ty === "halo") { ctx.globalAlpha = 0.95; ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, sy - 3 + Math.sin(t * 3), 7 + big * 2, 2.5, 0, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 0.25; ctx.fillStyle = c; ctx.fillRect(cx - 7, sy - 6, 14, 6); }
      else if (p.ty === "ward") { const fr = wardMax > 0 ? g.ward / wardMax : 0; if (fr > 0.02) { ctx.globalAlpha = 0.15 + 0.4 * fr; ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = i * 1.0472 + t * 0.3; const x = cx + Math.cos(a) * 17, y = cy + Math.sin(a) * 17; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); ctx.globalAlpha = 0.05 + 0.08 * fr; ctx.fillStyle = c; ctx.fill(); } }
      else if (p.ty === "sentinel") { const bx = Math.round(sx - 4), by = Math.round(sy - 6 + Math.sin(t * 3) * 2); ctx.globalAlpha = 0.4; ctx.fillStyle = c; ctx.fillRect(bx - 1, by - 1, 8, 7); ctx.globalAlpha = 1; ctx.fillRect(bx, by, 6, 5); ctx.fillStyle = c2; ctx.fillRect(bx + 2, by + 1, 2, 2); }
      else if (p.ty === "steps") { if (Math.random() < 0.3) { ctx.globalAlpha = 0.8; ctx.fillStyle = c; ctx.fillRect(Math.round(cx - 5 + Math.random() * 10), sy + 22, 2, 1); } }
    }
  }
  ctx.globalAlpha = 1;
}

const STATROWS: [keyof Stats, string][] = [["maxHp", "Max HP"], ["atk", "Attack"], ["def", "Defense"], ["crit", "Crit %"], ["spd", "Double Strike %"], ["block", "Block %"], ["regen", "Regen / turn"], ["ward", "Spectral Ward"], ["mv", "Move Speed % (max 200)"]];

function prisArcOverlay() {
  return (
    <span className="dc-pris-arcs" aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <path className="bolt a" d="M16 16 L19 7 L14 9 L22 1 M16 16 L9 6 L13 8 L6 1 M16 16 L11 24 L14 21 L7 31 M16 16 L23 23 L19 21 L27 31" />
        <path className="bolt b" d="M16 16 L3 9 L8 11 L1 3 M16 16 L29 9 L24 11 L31 3 M16 16 L3 24 L8 22 L1 30 M16 16 L29 23 L24 21 L31 30" />
      </svg>
    </span>
  );
}


type GibKind = "melee" | "proj" | "aoe";
type GibHold = {
  map: Uint8Array; vis: Uint8Array; seen: Uint8Array;
  en: En[]; pend: En[]; drops: Drop[]; parts: Part[]; floats: Float[]; shots: Shot[];
  pshots: PShot[] | undefined; fx: Fx[]; ground: Ground[];
  gold: number; xp: number; lvl: number; hp: number; potions: number; kills: number;
  msgs: { t: string; c: string }[]; banner: Banner | null; toast: number; flash: number; shake: number;
  hero: { x: number; y: number; ax: number; ay: number; face: number; dir?: number; bump: number; bdx: number; bdy: number };
};
let GIB_HOLD: GibHold | null = null;
function gibRestore(): void {
  const g = LIVE, hld = GIB_HOLD;
  GIB_HOLD = null;
  GIB_SKIP_SAVE = false;
  HIT_CTX = null;
  if (!g || !hld) return;
  g.map.set(hld.map); g.vis.set(hld.vis); g.seen.set(hld.seen);
  g.en = hld.en; g.pend = hld.pend; g.drops = hld.drops;
  g.parts = hld.parts; g.floats = hld.floats; g.shots = hld.shots;
  g.pshots = hld.pshots; g.fx = hld.fx; g.ground = hld.ground;
  g.gold = hld.gold; g.xp = hld.xp; g.lvl = hld.lvl; g.hero.hp = hld.hp;
  g.potions = hld.potions; g.kills = hld.kills; g.msgs = hld.msgs;
  g.banner = hld.banner; g.toast = hld.toast; g.flash = hld.flash; g.shake = hld.shake;
  const h = g.hero, s = hld.hero;
  h.x = s.x; h.y = s.y; h.ax = s.ax; h.ay = s.ay; h.face = s.face; h.dir = s.dir; h.bump = s.bump; h.bdx = s.bdx; h.bdy = s.bdy;
  IP.camOk = false;
  try { g.notify(); } catch { /* ignore */ }
}
function gibTick(dt: number): number {
  const g = LIVE;
  if (!g) return 0;
  for (const p of g.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.98; if (p.spin) p.ang = (p.ang || 0) + p.spin * dt; p.life -= dt; }
  if (g.parts.length) g.parts = g.parts.filter((p: Part) => p.life > 0);
  try { g.notify(); } catch { /* ignore */ }
  return g.parts.filter((p: Part) => p.gib).length;
}
function gibBegin(kind: GibKind, dx: number, dy: number, faceDx?: number, faceDy?: number): Record<string, unknown> {
  const g = LIVE;
  if (!g || g.mode !== "play") return { ok: false, error: "not in play" };
  if (GIB_HOLD) gibRestore();
  GIB_SKIP_SAVE = true;
  GIB_HOLD = {
    map: g.map.slice(), vis: g.vis.slice(), seen: g.seen.slice(),
    en: g.en.slice(), pend: g.pend.slice(), drops: g.drops.slice(),
    parts: g.parts.slice(), floats: g.floats.slice(), shots: g.shots.slice(),
    pshots: g.pshots ? g.pshots.slice() : g.pshots, fx: g.fx.slice(), ground: g.ground.slice(),
    gold: g.gold, xp: g.xp, lvl: g.lvl, hp: g.hero.hp, potions: g.potions, kills: g.kills,
    msgs: g.msgs.slice(), banner: g.banner, toast: g.toast, flash: g.flash, shake: g.shake,
    hero: { x: g.hero.x, y: g.hero.y, ax: g.hero.ax, ay: g.hero.ay, face: g.hero.face, dir: g.hero.dir, bump: g.hero.bump, bdx: g.hero.bdx, bdy: g.hero.bdy },
  };
  try {
    const span = kind === "proj" ? 3 : (kind === "aoe" ? 2 : 1);
    // Keep the hero on-camera; nudge inward only enough for the dummy to fit.
    let hx = g.hero.x, hy = g.hero.y;
    const margin = span + 1;
    if (hx < margin) hx = margin;
    if (hy < margin) hy = margin;
    if (hx > MW - 1 - margin) hx = MW - 1 - margin;
    if (hy > MH - 1 - margin) hy = MH - 1 - margin;
    g.hero.x = g.hero.ax = hx;
    g.hero.y = g.hero.ay = hy;
    for (let y = hy - margin; y <= hy + margin; y++) for (let x = hx - margin; x <= hx + margin; x++) {
      if (inb(x, y) && x > 0 && y > 0 && x < MW - 1 && y < MH - 1) g.map[y * MW + x] = 1;
    }
    IP.camOk = false;
    const tx = hx + dx * span, ty = hy + dy * span;
    const e = mkEnemy(g, tx, ty, 0);
    e.hp = e.mhp = 1; e.xp = 0; e.cls = 0; e.child = true;
    e.gob = undefined; e.hunt = undefined; e.rare = 0; e.act = undefined; e.se = undefined;
    e.tr = []; e.ax = tx; e.ay = ty;
    e.pal = ["#9cff4a", "#f0ffe8", "#3cff9a", "#ffffff"];
    g.en = [e]; g.pend = []; g.parts = []; g.floats = []; g.shots = []; g.fx = [];
    computeVis(g);
    if (kind === "melee") {
      const fdx = faceDx !== undefined ? faceDx : -dx;
      const fdy = faceDy !== undefined ? faceDy : -dy;
      if (fdx !== 0 || fdy !== 0) setHeroDir(g.hero, fdx, fdy);
      const st = { ...calc(g.lvl, g.eq), range: 0, cleave: false, reach: 1 };
      heroAttack(g, e, st, 1, dx, dy);
    } else if (kind === "proj") {
      const st = { ...calc(g.lvl, g.eq), range: 5, cleave: false };
      heroAttack(g, e, st, span, dx, dy);
    } else {
      const sp: Spell = { el: "fire", sh: "nova", mod: 1, ch: 100, pw: 8, r: 6, name: "Test Nova" };
      castSpell(g, sp, e, calc(g.lvl, g.eq), true);
    }
    const gibs = g.parts.filter((p: Part) => p.gib);
    let sx = 0, sy = 0;
    for (const q of gibs) { sx += q.vx; sy += q.vy; }
    const n = gibs.length;
    const mx = n ? sx / n : 0, my = n ? sy / n : 0;
    const len = Math.hypot(mx, my), dlen = Math.hypot(dx, dy);
    const align = (n && dlen && len) ? (mx * dx + my * dy) / (len * dlen) : 0;
    const faceDir = heroDir(g.hero);
    const faceV = DIR_DXY[faceDir] || [g.hero.face, 0];
    const faceDot = faceV[0] * dx + faceV[1] * dy;
    try { g.notify(); } catch { /* ignore */ }
    return {
      ok: n >= 8 && align > 0.65,
      n, mean: { vx: mx, vy: my }, align,
      hit: { dx, dy }, kind,
      face: { dir: faceDir, face: g.hero.face, dx: faceV[0], dy: faceV[1], dot: faceDot },
      dead: e.hp <= 0,
    };
  } catch (err) {
    gibRestore();
    return { ok: false, error: String(err) };
  }
}
try {
  (window as unknown as { __ED16_GIBS?: object }).__ED16_GIBS = {
    begin: gibBegin,
    tick: gibTick,
    end: gibRestore,
    particles: (): object[] => {
      const g = LIVE;
      if (!g) return [];
      return g.parts.filter((p: Part) => p.gib).map((p: Part) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, life: p.life, gib: true }));
    },
  };
} catch { /* ignore */ }

export default function App() {
  const theme = useGrokTheme();
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const portRef = useRef<HTMLCanvasElement | null>(null);
  const gRef = useRef<Game | null>(null);
  const holdRef = useRef<{ dx: number; dy: number; last: number } | null>(null);
  const padIdsRef = useRef<Set<number>>(new Set());
  const stickRef = useRef<HTMLDivElement | null>(null);
  const [stickKnob, setStickKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const potionPtrAt = useRef(0);
  const invRef = useRef<boolean>(false);
  const quitRef = useRef<boolean>(false);
  const pauseRef = useRef<boolean>(false); // other dialogs (save codes, confirms) pause the real-time clock too
  const mutedRef = useRef<boolean>(false);
  const apiRef = useRef<{ openInv: () => void; closeInv: () => void; closeShop: () => void; closeStash: () => void } | null>(null);
  const [, setTick] = useState<number>(0);
  const [inv, setInv] = useState<boolean>(false);
  const [sel, setSel] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [muted, setMuted] = useState<boolean>(false);
  const [confirmNew, setConfirmNew] = useState<boolean>(false);
  const [confirmMS, setConfirmMS] = useState<boolean>(false);
  const [confirmSL, setConfirmSL] = useState<boolean>(false);
  const [confirmQuit, setConfirmQuit] = useState<boolean>(false);
  const [titleNote, setTitleNote] = useState<string>("");
  const musicRef = useRef<boolean>(true);
  const [musicOn, setMusicOn] = useState<boolean>(true);
  const [shopSel, setShopSel] = useState<string>("");
  const [shopNote, setShopNote] = useState<string>("");
  const [merchSubId, setMerchSubId] = useState<MerchId | null>(null);
  const revealKey = (gRef.current && gRef.current.chestReveal) ? (gRef.current.chestReveal.phase + ":" + gRef.current.chestReveal.it.id) : "";
  useEffect(() => {
    const g = gRef.current;
    if (!g || !g.chestReveal || g.chestReveal.phase !== "open") return;
    const id = window.setTimeout(() => {
      if (g.chestReveal && g.chestReveal.phase === "open") { tickChestReveal(g, CHEST_REVEAL_SEC); bump(); }
    }, Math.round(CHEST_REVEAL_SEC * 1000));
    return () => window.clearTimeout(id);
  }, [revealKey]);
  const [stashSel, setStashSel] = useState<string>("");
  const [stashNote, setStashNote] = useState<string>("");
  const [bankAmt, setBankAmt] = useState<string>("");
  const [ioOpen, setIoOpen] = useState<boolean>(false);
  const [profOpen, setProfOpen] = useState<boolean>(true);
  const [ioCode, setIoCode] = useState<string>("");
  const [ioNote, setIoNote] = useState<string>("");
  const [ioMode, setIoMode] = useState<"save" | "load">("save");
  const [loadTxt, setLoadTxt] = useState<string>("");
  const [stor, setStor] = useState<"checking" | "on" | "off" | "blocked">("checking");
  pauseRef.current = profOpen || ioOpen || confirmNew || confirmMS || confirmSL || confirmQuit || !!(gRef.current && (gRef.current.stashOpen || gRef.current.paused));
  const codeRef = useRef<HTMLTextAreaElement | null>(null);
  const [, setNowMs] = useState<number>(0);
  const [padHeld, setPadHeld] = useState<string>("");

  const bump = (): void => setTick((n: number) => n + 1);
  const openInv = (): void => { const g = gRef.current; if (!g || g.mode !== "play") return; sortInventory(g); holdRef.current = null; setPadHeld(""); invRef.current = true; setInv(true); setNote(""); };
  const closeInv = (): void => { invRef.current = false; setInv(false); setSel(""); setNote(""); setConfirmMS(false); setConfirmSL(false); };
  apiRef.current = { openInv, closeInv, closeShop, closeStash };

  const beginNew = (): void => {
    const g = gRef.current;
    if (!g) return;
    clearSave();
    setConfirmNew(false); setTitleNote("");
    const n = g.mode === "title" ? newGame(g) : newGame(g);
    n.mode = "play"; n.muted = mutedRef.current; n.music = musicRef.current;
    attachStash(n);
    gRef.current = n;
    saveGame(n, false, true);
    n.sfx("start");
    bump();
  };
  const continueRun = (): void => {
    const n = loadGame(gRef.current);
    if (!n) { setTitleNote("Your saved run couldn't be loaded (missing or damaged). It was left untouched - try Import save, or start a new game."); bump(); return; }
    n.mode = "play";
    mutedRef.current = n.muted; setMuted(n.muted);
    musicRef.current = n.music; setMusicOn(n.music);
    gRef.current = n;
    setTitleNote(""); setConfirmNew(false);
    n.sfx("start");
    bump();
  };
  const newClick = (): void => { if (hasSave() || hasSaveBlob()) setConfirmNew(true); else beginNew(); };
  // Quit: confirm first; on Yes autosave, then return to the title screen (Continue resumes the run).
  const askQuit = (): void => { const g = gRef.current; if (!g || g.mode === "title") return; holdRef.current = null; setPadHeld(""); quitRef.current = true; setConfirmQuit(true); };
  const cancelQuit = (): void => { quitRef.current = false; setConfirmQuit(false); };
  const doQuit = (): void => {
    quitRef.current = false; setConfirmQuit(false);
    const g = gRef.current;
    if (!g || g.mode === "title") return;
    try { g.shopOpen = false; g.stashOpen = false; g.gambOpen = false; saveGame(g, true); } catch { /* storage may be blocked - the Save Code still works */ }
    const n = newGame(g);
    n.mode = "title"; n.notify = bump; n.sfx = g.sfx; n.muted = g.muted; n.music = g.music;
    LIVE = null;
    gRef.current = n;
    invRef.current = false; setInv(false); setSel(""); setNote(""); setConfirmMS(false); setConfirmSL(false); setIoOpen(false); setShopSel(""); setShopNote("");
    setConfirmNew(false); setTitleNote(hasSave() ? "Run saved. Tap Continue to resume." : "");
    bump();
  };
  const saveToProfile = (): void => {
    const g = gRef.current;
    if (!g || g.locked) return;
    if (g.mode !== "play") { setIoNote("Start or continue a run first, then tap Save Game."); bump(); return; }
    let ok = false;
    try { ok = saveGameNow(g); } catch { ok = false; }
    const finish = (verified: boolean): void => {
      lastPersistOk = verified;
      if (verified) {
        const ephemeral = storageEphemeral() || stor !== "on";
        floatTxt(g, g.hero.x, g.hero.y - 0.5, "SAVED", "#80ff80");
        msg(g, ephemeral ? "Saved for this session. This viewer may forget it when you close - tap Save Code and keep a copy." : "Saved to this profile.", "#80ff80");
      } else if (viewerBlocksSaving() || lastPersistErr === "this viewer blocks saving") {
        const code = offerBlockedSaveCode(g);
        msg(g, blockedSaveMessage(), "#ff8080");
        if (code) {
          setIoCode(code); setIoMode("save");
          setIoNote("This viewer blocks saving to your device. Copy this Save Code and keep it. Paste it with LOAD the next time you open the game.");
          setIoOpen(true);
        }
      } else {
        msg(g, "Save Game failed - " + (lastPersistErr || "the profile was not updated") + ". Tap Save Code and keep a copy so you don't lose this run.", "#ff8080");
      }
      bump();
    };
    if (ok) { finish(true); return; }
    if (viewerBlocksSaving()) { finish(false); return; }
    const expect = memSave;
    void idbPutDone(activeSaveKey(), expect).then((idbOk: boolean) => {
      if (idbOk && expect && memSave === expect) { lastPersistErr = ""; finish(true); }
      else { if (!lastPersistErr) lastPersistErr = lastIdbErr || "IndexedDB did not keep the save"; finish(false); }
    }, () => { if (!lastPersistErr) lastPersistErr = lastIdbErr || "IndexedDB did not keep the save"; finish(false); });
  };
  const showSaveCode = (): void => {
    const g = gRef.current;
    if (!g || g.locked) return;
    let code = "";
    try { code = saveCodeOf(g); } catch { code = ""; }
    setIoCode(code); setIoMode("save");
    setIoNote(code ? (viewerBlocksSaving() ? "This viewer blocks saving to your device. Copy this Save Code and keep it. Paste it with LOAD the next time you open the game." : (storageEphemeral() || stor !== "on" ? "Copy this Save Code to paste into a profile later. This viewer may not keep saves when you close it." : "Copy this Save Code to paste into another profile.")) : "Start or continue a run first - then Save Code gives you a code.");
    setIoOpen(true);
    bump();
  };
  const pickProf = (id: ProfId): void => {
    if (stor === "checking" || !storageReady) return;
    try { ensureJaxSeed(); } catch { /* */ }
    const g = gRef.current;
    // Only flush when the player is switching away from an active session (picker
    // was closed). If the picker is already open (fresh load / resume), writing
    // here would overwrite the on-disk save with any ticks that leaked first.
    if (g && g.mode === "play" && !profOpen) { try { saveGame(g, true); } catch { /* keep the other profiles safe even if this write fails */ } }
    setActiveProf(id);
    setProfOpen(false);
    setConfirmNew(false);
    setTitleNote("");
    if (hasSave()) {
      const n = loadGame(gRef.current);
      if (n) {
        n.mode = "play"; n.notify = bump;
        if (g && g.sfx) n.sfx = g.sfx;
        mutedRef.current = n.muted; setMuted(n.muted);
        musicRef.current = n.music; setMusicOn(n.music);
        gRef.current = n; LIVE = n;
        setBanner(n, "WELCOME BACK", (PROFILES[id - 1] ? PROFILES[id - 1].name : "Profile") + " · Depth " + n.depth + " · Level " + n.lvl, "#80ff80", 2, 2);
        n.sfx("start");
        bump();
        return;
      }
    }
    // Empty slot: stay on the title so New Game and LOAD a Save Code are both obvious.
    const nm = PROFILES[id - 1] ? PROFILES[id - 1].name : "this profile";
    const t = newGame(gRef.current);
    t.mode = "title"; t.notify = bump;
    if (g && g.sfx) t.sfx = g.sfx;
    gRef.current = t; LIVE = t;
    setTitleNote("No save on " + nm + " yet. Paste a Save Code with LOAD, or start a New Game.");
    bump();
  };
  const openProfiles = (): void => {
    const g = gRef.current;
    if (g && g.mode === "play") { try { saveGame(g, true); } catch { /* still open the picker */ } }
    setProfOpen(true);
  };
  const startOrRestart = (): boolean => {
    const g = gRef.current;
    if (profOpen) return true;
    if (!g) return true;
    if (g.mode === "title") { if (titleMayAutoStart()) beginNew(); return true; }
    if (g.mode === "dead") {
      if (g.deadT < 0.8) return true;
      respawn(g); bump(); return true;
    }
    return false;
  };
  const press = (dx: number, dy: number): void => {
    if (quitRef.current) return;
    if (startOrRestart()) return;
    const g = gRef.current;
    if (!g || invRef.current) return;
    setPadHeld(dx + "," + dy);
    holdRef.current = { dx, dy, last: performance.now() };
    publishPad(true, dx, dy, true);
    safeAct(g, dx, dy);
  };
  const release = (): void => { holdRef.current = null; setPadHeld(""); padIdsRef.current.clear(); setStickKnob({ x: 0, y: 0 }); publishPad(false, 0, 0); };
  const applyStick = (ev: { clientX: number; clientY: number }): void => {
    const el = stickRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const radius = Math.min(r.width, r.height) / 2;
    const s = stickFromCenter(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2), radius);
    setStickKnob({ x: s.kx, y: s.ky });
    if (s.dx === 0 && s.dy === 0) {
      holdRef.current = null;
      setPadHeld("");
      publishPad(true, 0, 0);
      return;
    }
    const prev = holdRef.current;
    if (!prev || prev.dx !== s.dx || prev.dy !== s.dy) press(s.dx, s.dy);
    else { setPadHeld(s.dx + "," + s.dy); publishPad(true, s.dx, s.dy); }
  };
  const stickDown = (ev: { currentTarget: { setPointerCapture?: (id: number) => void }; pointerId: number; clientX: number; clientY: number; preventDefault?: () => void }): void => {
    ev.preventDefault?.();
    try { ev.currentTarget.setPointerCapture?.(ev.pointerId); } catch { /* ignore */ }
    padIdsRef.current.add(ev.pointerId);
    applyStick(ev);
  };
  const stickMove = (ev: { pointerId: number; clientX: number; clientY: number; preventDefault?: () => void }): void => {
    if (!padIdsRef.current.has(ev.pointerId)) return;
    ev.preventDefault?.();
    applyStick(ev);
  };
  const stickRelease = (ev: { pointerId: number; currentTarget?: { hasPointerCapture?: (id: number) => boolean } }, kind: "up" | "leave" | "cancel"): void => {
    if (kind === "leave" && !padLeaveReleases(!!ev.currentTarget?.hasPointerCapture?.(ev.pointerId))) return;
    padIdsRef.current.delete(ev.pointerId);
    if (padIdsRef.current.size === 0) release();
  };

  const waitTurn = (): void => { if (startOrRestart()) return; const g = gRef.current; if (g && !invRef.current && !g.paused) safeAct(g, 0, 0); };
  const togglePause = (): void => {
    const g = gRef.current;
    if (!g || g.locked || g.mode !== "play") return;
    g.paused = !g.paused;
    pauseRef.current = !!(g.paused || profOpen || ioOpen || confirmNew || confirmMS || confirmSL || confirmQuit || g.stashOpen);
    if (g.paused) { try { flushPlaySave(g, true); } catch { /* pause must still work if storage fails */ } }
    bump();
  };
  const potion = (): void => { if (startOrRestart()) return; const g = gRef.current; if (g) usePotion(g); };
  const stairs = (): void => { if (startOrRestart()) return; const g = gRef.current; if (g) useStairsOrPortal(g); };
  const toggleMute = (): void => { mutedRef.current = !mutedRef.current; const g = gRef.current; if (g) g.muted = mutedRef.current; setMuted(mutedRef.current); };
  // Save/Load lock (default locked, remembered in the save + on this device). Autosave keeps running either way.
  const toggleLock = (): void => {
    const gg = gRef.current;
    if (!gg) return;
    gg.locked = !gg.locked;
    lsSet("ed16_lock", gg.locked ? "1" : "0");
    if (gg.mode === "play") saveGame(gg, true);
    if (gg.locked) setIoOpen(false);
    bump();
  };
  const toggleMusic = (): void => { musicRef.current = !musicRef.current; const g = gRef.current; if (g) { g.music = musicRef.current; if (g.mode === "play") saveGame(g); } setMusicOn(musicRef.current); };
  function closeShop(): void { const g = gRef.current; if (g && g.chestReveal) { if (g.chestReveal.phase !== "show") return; dismissChestReveal(g); bump(); return; } if (g) g.shopOpen = false; setShopSel(""); setShopNote(""); setMerchSubId(null); bump(); }
  function closeStash(): void { const g = gRef.current; if (g) g.stashOpen = false; setStashSel(""); setStashNote(""); setBankAmt(""); bump(); }
  const ultClick = (): void => { const g = gRef.current; if (g && castUlt(g)) bump(); };
  const openIo = (): void => { showSaveCode(); };
  const openLoad = (): void => { const gl = gRef.current; if (gl && gl.locked && hasSave()) return; setIoMode("load"); setLoadTxt(""); setIoNote(""); setIoOpen(true); };
  const selectCode = (): void => { const ta = codeRef.current; if (!ta) return; try { ta.focus({ preventScroll: true }); ta.select(); ta.setSelectionRange(0, ta.value.length); } catch { /* ignore */ } };
  const copyCode = (): void => {
    // synchronous copy first (keeps the tap's user-gesture), then the async clipboard API, then manual long-press
    selectCode();
    let done = false;
    try { done = document.execCommand("copy"); } catch { done = false; }
    if (done) { setIoNote("Copied! Paste it into your Notes app or a message to yourself."); return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { void navigator.clipboard.writeText(ioCode).then(() => setIoNote("Copied! Paste it into your Notes app or a message to yourself."), () => setIoNote("Auto-copy is blocked here. The code is selected - long-press it and tap Copy.")); return; }
    } catch { /* fall through */ }
    setIoNote("Auto-copy is blocked here. The code is selected - long-press it and tap Copy.");
  };
  const doImport = (code: string): void => {
    const gl0 = gRef.current;
    if (gl0 && gl0.locked && hasSave()) { setIoNote("Save/Load is locked - tap the lock in the top-left corner first."); return; }
    const n = importCode(code, gRef.current);
    if (!n) { setIoNote("That code didn't work. Make sure you pasted the whole code (it starts with ED2- or ED16-). Nothing was changed."); return; }
    LIVE = n;
    n.mode = "play";
    mutedRef.current = n.muted; setMuted(n.muted);
    musicRef.current = n.music; setMusicOn(n.music);
    invRef.current = false; setInv(false); setSel("");
    gRef.current = n;
    setIoOpen(false); setTitleNote(""); setConfirmNew(false);
    n.sfx("start");
    const importedMsg = "Imported — press Save Game; from now on this profile saves on this device.";
    if (lastPersistOk) { msg(n, importedMsg, "#80ff80"); setBanner(n, "IMPORTED", "Press Save Game; this profile now saves on this device", "#80ff80", 2, 2); bump(); return; }
    const why = lastPersistErr ? " (" + lastPersistErr + ")" : "";
    const expect = memSave;
    if (expect) {
      void idbPutDone(activeSaveKey(), expect).then((idbOk: boolean) => {
        if (idbOk && memSave === expect) {
          lastPersistOk = true; lastPersistErr = "";
          msg(n, importedMsg, "#80ff80");
          setBanner(n, "IMPORTED", "Press Save Game; this profile now saves on this device", "#80ff80", 2, 2);
        } else {
          msg(n, "Loaded in this session, but the profile was not saved" + (lastPersistErr || lastIdbErr ? " (" + (lastPersistErr || lastIdbErr) + ")" : why) + ". Tap Save Game. If that fails, use Save Code.", "#ff8080");
        }
        bump();
      }, () => { msg(n, "Loaded in this session, but the profile was not saved" + why + ". Tap Save Game. If that fails, use Save Code.", "#ff8080"); bump(); });
      return;
    }
    msg(n, "Loaded in this session, but the profile was not saved" + why + ". Tap Save Game. If that fails, use Save Code.", "#ff8080");
    bump();
  };
  const pasteFromClipboard = (): void => {
    const blocked = "Clipboard access is blocked here - long-press inside the box above, tap Paste, then tap LOAD.";
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) { setIoNote(blocked); return; }
      void navigator.clipboard.readText().then((t: string) => { setLoadTxt(t); doImport(t); }, () => setIoNote(blocked));
    } catch { setIoNote(blocked); }
  };
  useEffect(() => {
    if (!ioOpen || ioMode !== "save" || !ioCode) return;
    const id = window.setTimeout(() => { const ta = codeRef.current; if (ta) { try { ta.select(); ta.setSelectionRange(0, ta.value.length); } catch { /* ignore */ } } }, 60);
    return () => window.clearTimeout(id);
  }, [ioOpen, ioMode, ioCode]);
  useEffect(() => {
    const id = window.setInterval(() => { const g = gRef.current; if (g && g.mode === "play" && ultsOf(g.eq).some((u: { slot: EqKey }) => Date.now() < ultCd(g, u.slot) + 1500)) setNowMs(Date.now()); }, 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    const safeInset = (side: "top" | "right" | "bottom" | "left"): number => {
      try {
        const probe = document.createElement("div");
        probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;" + side + ":0;width:env(safe-area-inset-" + side + ", 0px);height:env(safe-area-inset-" + side + ", 0px)";
        document.body.appendChild(probe);
        const box = probe.getBoundingClientRect();
        const n = (side === "left" || side === "right") ? box.width : box.height;
        probe.remove();
        return n || 0;
      } catch { return 0; }
    };
    const pinScroll = (): void => {
      try { window.scrollTo(0, 0); } catch { /* ignore */ }
      try { if (document.documentElement) document.documentElement.scrollTop = 0; } catch { /* ignore */ }
      try { if (document.body) document.body.scrollTop = 0; } catch { /* ignore */ }
    };
    const apply = (): void => {
      pinScroll();
      const forced = (window as unknown as { __ED16_FORCE_VV?: { width: number; height: number; offsetTop: number; offsetLeft: number } }).__ED16_FORCE_VV;
      const vv = forced || (typeof window !== "undefined" ? window.visualViewport : null);
      const w = vv ? vv.width : (typeof window !== "undefined" ? window.innerWidth : 390);
      const h = vv ? vv.height : (typeof window !== "undefined" ? window.innerHeight : 844);
      const top = vv ? vv.offsetTop : 0;
      const left = vv ? vv.offsetLeft : 0;
      const forcedSafe = (window as unknown as { __ED16_FORCE_SAFE?: { top?: number; right?: number; bottom?: number; left?: number } }).__ED16_FORCE_SAFE;
      const st = forcedSafe && forcedSafe.top != null ? forcedSafe.top : safeInset("top");
      const sr = forcedSafe && forcedSafe.right != null ? forcedSafe.right : safeInset("right");
      const sb = forcedSafe && forcedSafe.bottom != null ? forcedSafe.bottom : safeInset("bottom");
      const sl = forcedSafe && forcedSafe.left != null ? forcedSafe.left : safeInset("left");
      const m = layoutMetrics(w, h, sb, 0, st);
      const de = document.documentElement;
      de.style.setProperty("--ed-vv-top", top + "px");
      de.style.setProperty("--ed-vv-left", left + "px");
      de.style.setProperty("--ed-vv-w", w + "px");
      de.style.setProperty("--ed-vv-h", h + "px");
      de.style.setProperty("--ed-safe-t", st + "px");
      de.style.setProperty("--ed-safe-r", sr + "px");
      de.style.setProperty("--ed-safe-b", sb + "px");
      de.style.setProperty("--ed-safe-l", sl + "px");
      de.style.setProperty("--ed-pad", m.padSize + "px");
      de.style.setProperty("--ed-stick", m.padSize + "px");
      de.style.setProperty("--ed-canvas-max", m.canvasMax + "px");
      de.style.setProperty("--ed-save-h", m.saveH + "px");
      de.style.setProperty("--ed-util-h", m.utilH + "px");
      const stageW = Math.max(1, Math.min(WRAP_MAX, w) - sl - sr);
      const applyView = (maxH: number): void => {
        const v = computePlayView(stageW, maxH);
        setPlayView(v);
        applyPlayViewToCss(v, stageW, maxH + 4);
        resizeGameCanvas();
      };
      applyView(m.canvasMax);
      // If padding or button minima still overflow, shrink the canvas — never clip the HUD or dock.
      requestAnimationFrame(() => {
        const wrap = document.querySelector(".dc-wrap") as HTMLElement | null;
        if (!wrap) return;
        const overflow = wrap.scrollHeight - wrap.clientHeight;
        if (overflow > 1) {
          const cur = parseFloat(getComputedStyle(de).getPropertyValue("--ed-canvas-max")) || m.canvasMax;
          const next = Math.max(72, cur - overflow - 2);
          de.style.setProperty("--ed-canvas-max", next + "px");
          applyView(next);
        }
      });
    };
    const allowPan = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      return !!(el && typeof el.closest === "function" && el.closest(".dc-inv, .dc-shop-bd, .dc-ta, .dc-code, .dc-io, .dc-msw"));
    };
    const onTouchMove = (e: TouchEvent): void => { if (!allowPan(e.target)) e.preventDefault(); };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("scroll", pinScroll);
    document.addEventListener("scroll", pinScroll);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    window.visualViewport?.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("scroll", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("scroll", pinScroll);
      document.removeEventListener("scroll", pinScroll);
      document.removeEventListener("touchmove", onTouchMove);
      window.visualViewport?.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("scroll", apply);
    };
  }, []);

  useEffect(() => {
    const cvMaybe = cvRef.current;
    if (!cvMaybe) return;
    const cv: HTMLCanvasElement = cvMaybe;
    const ctxMaybe = cv.getContext("2d");
    if (!ctxMaybe) return;
    const ctx: CanvasRenderingContext2D = ctxMaybe;
    cv.width = VW * PX;
    cv.height = VH * PX;

    let ac: AudioContext | null = null;
    let sfxGain: GainNode | null = null, musGain: GainNode | null = null, musDelay: DelayNode | null = null, musEcho: GainNode | null = null, noiseBuf: AudioBuffer | null = null;
    const ensureAudio = (): void => {
      try {
        if (!ac) {
          const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
          const C = w.AudioContext || w.webkitAudioContext;
          if (C) {
            const a = new C();
            ac = a;
            sfxGain = a.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(a.destination);
            musGain = a.createGain(); musGain.gain.value = 0; musGain.connect(a.destination);
            musDelay = a.createDelay(0.6); musDelay.delayTime.value = 0.34;
            musEcho = a.createGain(); musEcho.gain.value = 0;
            musGain.connect(musDelay); musDelay.connect(musEcho); musEcho.connect(a.destination);
            const len = Math.floor(a.sampleRate * 0.5);
            noiseBuf = a.createBuffer(1, len, a.sampleRate);
            const dd = noiseBuf.getChannelData(0);
            for (let i = 0; i < len; i++) dd[i] = Math.random() * 2 - 1;
          }
        }
        if (ac && ac.state === "suspended") void ac.resume();
      } catch { ac = null; }
    };
    const osc = (dest: AudioNode, f: number, f2: number, t0: number, dur: number, type: OscillatorType, vol: number, attack: number = 0.004): void => {
      if (!ac) return;
      const o = ac.createOscillator();
      const gn = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t0);
      if (f2 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.linearRampToValueAtTime(vol, t0 + attack);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, attack + 0.01));
      o.connect(gn); gn.connect(dest);
      o.start(t0); o.stop(t0 + dur + 0.05);
    };
    const noise = (dest: AudioNode, t0: number, dur: number, vol: number, ftype: BiquadFilterType, f0: number, f1: number): void => {
      if (!ac || !noiseBuf) return;
      const s = ac.createBufferSource(); s.buffer = noiseBuf;
      const fl = ac.createBiquadFilter(); fl.type = ftype;
      fl.frequency.setValueAtTime(f0, t0); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
      const gn = ac.createGain(); gn.gain.setValueAtTime(vol, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(fl); fl.connect(gn); gn.connect(dest);
      s.start(t0); s.stop(t0 + dur + 0.02);
    };
    const tone = (f: number, f2: number, dur: number, type: OscillatorType, vol: number, delay: number = 0): void => {
      if (!ac || !sfxGain || !sfxShouldPlay(mutedRef.current)) return;
      osc(sfxGain, f, f2, ac.currentTime + delay, dur, type, vol);
    };
    const nz = (dur: number, vol: number, ftype: BiquadFilterType, f0: number, f1: number, delay: number = 0): void => {
      if (!ac || !sfxGain || !sfxShouldPlay(mutedRef.current)) return;
      noise(sfxGain, ac.currentTime + delay, dur, vol, ftype, f0, f1);
    };
    const lastS: Record<string, number> = {};
    let lootBurstAt = 0, lootBurstN = 0;
    // unique magic sounds: per-sound 110 ms gap, at most 4 magic sounds per 300 ms, quieter when busy
    const mxT: number[] = [];
    const mxLast = new Map<number, number>();
    const playMagic = (id: number): void => {
      if (!ac || !sfxGain || !sfxShouldPlay(mutedRef.current) || !(id >= 0 && id < SND_N)) return;
      const nowM = performance.now();
      if ((mxLast.get(id) ?? -1e9) > nowM - 110) return;
      while (mxT.length && mxT[0] < nowM - 300) mxT.shift();
      if (mxT.length >= 4) return;
      mxT.push(nowM); mxLast.set(id, nowM);
      const sc = 1 / (1 + (mxT.length - 1) * 0.35);
      const t0 = ac.currentTime;
      for (const e of magicVoice(id)) { if (e.n === 0) osc(sfxGain, e.f, e.f2, t0 + e.t, e.d, WAVES[e.w], e.v * sc); else noise(sfxGain, t0 + e.t, e.d, e.v * sc, NFILT[e.w], e.f, e.f2); }
    };
    const sfx = (n: string, v: number = 0): void => {
      if (!ac || !sfxShouldPlay(mutedRef.current)) return;
      const key = n + v, nowS = performance.now();
      if (n !== "loot" && (lastS[key] ?? 0) > nowS - 40) return;
      lastS[key] = nowS;
      switch (n) {
        case "swing":
          if (v === 0) nz(0.09, 0.06, "bandpass", 3000, 900);
          else if (v === 1) { nz(0.12, 0.08, "lowpass", 700, 120); tone(140, 60, 0.1, "sine", 0.07); }
          else if (v === 2) { nz(0.1, 0.07, "bandpass", 1500, 400); tone(220, 90, 0.08, "square", 0.02); }
          else if (v === 3) { tone(240, 120, 0.12, "triangle", 0.05); nz(0.05, 0.03, "highpass", 4000, 2000); }
          else if (v === 4) { nz(0.03, 0.09, "highpass", 3000, 2500); tone(160, 70, 0.1, "square", 0.04, 0.02); }
          else if (v === 5) { tone(600, 1300, 0.15, "sine", 0.04); tone(900, 1800, 0.12, "triangle", 0.02, 0.03); }
          else if (v === 6) { nz(0.05, 0.04, "highpass", 4000, 1800); tone(900, 400, 0.05, "square", 0.03); tone(700, 300, 0.05, "square", 0.025, 0.05); tone(1100, 500, 0.04, "triangle", 0.02, 0.09); }
          else if (v === 7) { tone(140, 190, 0.3, "sine", 0.04); tone(280, 330, 0.22, "sine", 0.022, 0.02); nz(0.08, 0.045, "bandpass", 2600, 900); }
          else if (v === 8) { tone(520, 900, 0.12, "sine", 0.03); tone(720, 1100, 0.1, "triangle", 0.02, 0.03); nz(0.07, 0.022, "bandpass", 2000, 800); }
          else nz(0.06, 0.05, "lowpass", 900, 200);
          break;
        case "ehit": nz(0.08, 0.05, "bandpass", 900, 300); tone(200, 110, 0.06, "square", 0.02); break;
        case "roar": tone(110, 45, 1.1, "sawtooth", 0.08); tone(116, 48, 1.1, "sawtooth", 0.06); nz(1.0, 0.12, "lowpass", 900, 80); break;
        case "pulse": tone(300, 620, 0.12, "sine", 0.03); break;
        case "mx": playMagic(v); break;
        case "ult": {
          const u = ULTS[v] ?? ULTS[0];
          const b = 90 + (v % 10) * 18 + Math.floor(v / 10) * 7;
          tone(b * 2, b / 2, 1.4, "sawtooth", 0.07); tone(b * 3, b, 1.2, "square", 0.03, 0.05); nz(1.4, 0.16, "lowpass", 3000, 60);
          for (let i = 0; i < 6; i++) tone(b * (2 + i * 0.5), b * (2 + i * 0.5), 0.12, i % 2 ? "triangle" : "square", 0.04, 0.2 + i * 0.07 * (1 + (v % 3)));
          playMagic(ultSnd(v + (u ? 0 : 0)));
          break;
        }
        case "spell":
          if (v === 0) [1047, 1319, 1568, 2093].forEach((f: number, i: number) => tone(f, f, 0.25, "sine", 0.035, i * 0.05));
          else if (v === 1) { nz(0.4, 0.12, "lowpass", 2500, 200); tone(180, 60, 0.3, "sawtooth", 0.03); }
          else if (v === 2) { tone(2000, 2600, 0.3, "sine", 0.03); tone(3000, 2400, 0.25, "triangle", 0.02, 0.04); nz(0.2, 0.05, "highpass", 5000, 7000); }
          else if (v === 3) { for (let i = 0; i < 5; i++) tone(600 + Math.random() * 1800, 200 + Math.random() * 400, 0.04, "square", 0.03, i * 0.03); nz(0.15, 0.06, "highpass", 3000, 1500); }
          else if (v === 4) { tone(90, 35, 0.6, "sawtooth", 0.08); nz(0.6, 0.14, "lowpass", 1500, 60); tone(70, 30, 0.6, "square", 0.04, 0.05); }
          else if (v === 5) { tone(700, 50, 0.7, "sine", 0.07); tone(350, 40, 0.7, "triangle", 0.04, 0.05); }
          else { tone(220, 110, 0.5, "sawtooth", 0.035); tone(233, 116, 0.5, "sawtooth", 0.035); nz(0.4, 0.04, "bandpass", 400, 150); }
          break;
        case "step": tone(180, 140, 0.03, "square", 0.01); break;
        case "hit": tone(320, 120, 0.07, "square", 0.035); break;
        case "crit": tone(600, 160, 0.12, "sawtooth", 0.04); break;
        case "hurt": tone(160, 60, 0.14, "sawtooth", 0.05); nz(0.1, 0.05, "lowpass", 1200, 200); break;
        case "block": tone(900, 700, 0.06, "triangle", 0.04); break;
        case "kill": tone(420, 70, 0.18, "square", 0.035); nz(0.2, 0.06, "lowpass", 2000, 100); break;
        case "boss": tone(200, 40, 0.8, "sawtooth", 0.07); nz(0.8, 0.1, "lowpass", 1200, 60); tone(400, 800, 0.4, "square", 0.03, 0.2); break;
        case "coin": tone(1200, 1600, 0.06, "square", 0.02); break;
        case "hunt": tone(98, 49, 0.7, "sawtooth", 0.07); tone(104, 52, 0.7, "sawtooth", 0.05); tone(1480, 740, 0.35, "square", 0.025, 0.15); tone(55, 55, 0.12, "sine", 0.12, 0.45); tone(55, 55, 0.12, "sine", 0.12, 0.65); break;
        case "gob": [1319, 1568, 1976, 2637].forEach((f: number, i: number) => tone(f, f, 0.18, "sine", 0.035, i * 0.07)); break;
        case "sparkle": for (let i = 0; i < 8; i++) tone(1800 + i * 220, 2400 + i * 260, 0.07, "triangle", 0.018, i * 0.045); break;
        case "chime": tone(660, 990, 0.18, "sine", 0.05); tone(880, 1320, 0.22, "triangle", 0.04, 0.08); tone(1320, 1760, 0.28, "sine", 0.035, 0.16); break;
        case "gamble": nz(0.18, 0.05, "bandpass", 900, 400); tone(220, 440, 0.12, "square", 0.03); tone(330, 660, 0.12, "triangle", 0.025, 0.08); [392, 523, 659, 784, 1047].forEach((f: number, i: number) => tone(f, f * 1.01, 0.1, i % 2 ? "triangle" : "sine", 0.03, 0.16 + i * 0.05)); break;
        case "portal": tone(220, 880, 0.6, "sine", 0.05); tone(330, 1320, 0.6, "triangle", 0.03, 0.05); nz(0.5, 0.04, "bandpass", 1200, 400); break;
        case "chest": {
          const cr = Math.max(0, Math.min(4, v ?? 0));
          const base = 280 + cr * 90;
          nz(0.12 + cr * 0.03, 0.04 + cr * 0.015, "lowpass", 500 + cr * 200, 120);
          tone(base, base * 2, 0.1 + cr * 0.03, "triangle", 0.035 + cr * 0.008, 0.06);
          tone(base * 2, base * 3, 0.12 + cr * 0.04, cr >= 3 ? "square" : "triangle", 0.03, 0.14);
          if (cr >= 3) tone(base * 3, base * 4, 0.2, "sine", 0.025, 0.22);
          if (cr >= 4) { tone(880, 1320, 0.35, "sine", 0.03, 0.28); nz(0.2, 0.04, "bandpass", 2000, 600); }
          break;
        }
        case "scrit": tone(220, 880, 0.18, "sawtooth", 0.05); tone(880, 1760, 0.22, "square", 0.035, 0.06); tone(1320, 2640, 0.28, "triangle", 0.03, 0.12); nz(0.18, 0.06, "lowpass", 1800, 200); break;
        case "equip": tone(500, 300, 0.08, "triangle", 0.04); break;
        case "bhum": if ((lastS["bhum0"] ?? 0) > nowS - 2000) break; lastS["bhum0"] = nowS; tone(130, 155, 0.5, "sine", 0.016); tone(260, 250, 0.42, "sine", 0.01, 0.02); break;
        case "potion": for (let i = 0; i < 4; i++) tone(400 + i * 150, 700 + i * 150, 0.08, "sine", 0.04, i * 0.05); break;
        case "stairs": [523, 440, 349, 262, 196].forEach((f: number, i: number) => tone(f, f * 0.98, 0.14, "triangle", 0.045, i * 0.08)); break;
        case "start": tone(400, 800, 0.15, "square", 0.03); tone(600, 1200, 0.15, "square", 0.03, 0.12); break;
        case "die": tone(300, 40, 1.0, "sawtooth", 0.06); break;
        case "lvl": [523, 659, 784, 1047].forEach((f: number, i: number) => tone(f, f, 0.12, "square", 0.035, i * 0.09)); break;
        case "loot": {
          const nowL = performance.now();
          if (nowL - lootBurstAt > 80) lootBurstN = 0;
          lootBurstAt = nowL;
          const stagger = lootBurstN * 0.09;
          lootBurstN++;
          const spec = lootChimeSpec(lootSfxRar(v), lootSfxSet(v), lootSfxGolden(v));
          for (const nt of spec.notes) tone(nt.f, nt.f2, nt.dur, nt.typ, nt.vol, nt.delay + stagger);
          for (const z of spec.noises) nz(z.dur, z.vol, z.ftype, z.f0, z.f1, z.delay + stagger);
          break;
        }
        default: break;
      }
    };

    // ---- procedural chiptune music (scheduled on the audio clock) ----
    let musT = 0, musStep = 0, songI = 0, songBar = 0, inBoss = false, musOn = false, bossNow = false, lastAuto = 0, inCamp = false, campNow = false, lastMusDepth = 0;
    const curDungeonSong = (): Song => {
      if (inBoss) return BOSS_SONG;
      if (inCamp) return SONGS[CAMP_SONG_I];
      const d = gRef.current ? gRef.current.depth : lastMusDepth;
      return dreadSong(SONGS[songI], dreadT(d));
    };
    const melody = (s: Song, bar: number, step: number): number | null => {
      if (s.tune && s.tune.length) {
        if (step % 2 === 1) return null;
        const deg = s.tune[(bar * 8 + ((step / 2) | 0)) % s.tune.length];
        if (deg === null || deg === undefined) return null;
        return sdeg(s, s.prog[bar % s.prog.length] + deg) + 12;
      }
      if (step % 2 === 1) return null;
      const r = rng32(s.seed * 1000 + (bar % 8) * 16 + step)();
      if (step % 4 !== 0 && r < 0.75) return null;
      if (r < 0.3) return null;
      const ch = s.prog[bar % s.prog.length];
      const offs = [0, 2, 4, 7, 2, 4, 1, 3];
      return sdeg(s, ch + offs[Math.floor(r * 997) % offs.length]) + 12;
    };
    const schedStep = (t: number): void => {
      if (!ac || !musGain) return;
      const out: GainNode = musGain;
      const s = curDungeonSong();
      const step = musStep % 16, bar = songBar;
      const sd = 60 / s.bpm / 4;
      const ch = s.prog[bar % s.prog.length];
      const ct = [ch, ch + 2, ch + 4, ch + 7].map((d: number) => sdeg(s, d));
      const vs = Math.min(1, s.vol ?? 1);
      const padW: OscillatorType = inBoss ? "triangle" : (s.pad || "triangle");
      const bassW: OscillatorType = inBoss ? "triangle" : (s.bass || "triangle");
      const leadW: OscillatorType = inBoss ? "sawtooth" : (s.lead || "triangle");
      const arpW: OscillatorType = inBoss ? "square" : (s.arpWave || "square");
      if (step === 0) for (let i = 0; i < 3; i++) osc(out, mtof(ct[i]), mtof(ct[i]), t, sd * 16, padW, (inBoss ? 0.012 : 0.017) * vs, sd * 4);
      if (step % (inBoss ? 2 : 8) === 0) osc(out, mtof(ct[0] - 12), mtof(ct[0] - 12), t, sd * (inBoss ? 1.8 : 6), bassW, 0.06 * vs);
      if (!inBoss && step === 12) osc(out, mtof(ct[2] - 12), mtof(ct[2] - 12), t, sd * 3, bassW, 0.04 * vs);
      const ae = inBoss ? 1 : 2;
      if (step % ae === 0) { const ai = s.arp[(step / ae) % s.arp.length]; const n = ct[ai % 4] + 12 + (bar % 2 === 1 && !inBoss ? 12 : 0); osc(out, mtof(n), mtof(n), t, sd * 1.5, arpW, (inBoss ? 0.011 : 0.008) * vs); }
      const m = melody(s, bar, step);
      if (m !== null) osc(out, mtof(m), mtof(m), t, sd * (inBoss ? 2 : 3.5), leadW, (inBoss ? 0.014 : 0.022) * vs, 0.02);
      if (inBoss) {
        if (step % 4 === 0) osc(out, 130, 40, t, 0.18, "sine", 0.12);
        if (step % 2 === 1) noise(out, t, 0.04, 0.025, "highpass", 6000, 5000);
        if (step === 4 || step === 12) noise(out, t, 0.12, 0.05, "bandpass", 1800, 900);
      } else if (step === 4 || step === 12) noise(out, t, 0.03, (s.mode === "phrygian" ? 0.01 : 0.008) * vs, "highpass", 7000, 6000);
      const dt = (!inBoss && !inCamp) ? dreadT(gRef.current ? gRef.current.depth : lastMusDepth) : 0;
      if (dt > 0.05) {
        if (step === 0) osc(out, mtof(ct[0] - 24), mtof(ct[0] - 24), t, sd * 16, "sine", 0.035 * dt * vs);
        if (dt > 0.4 && step === 0) noise(out, t, 0.22, 0.02 * dt * vs, "lowpass", 400, 200);
        if (dt > 0.55 && step % 8 === 0) osc(out, mtof(ct[0] + 6), mtof(ct[0] + 6.07), t, sd * 4, "sawtooth", 0.012 * dt * vs);
        if (dt > 0.25 && step % 4 === 0) noise(out, t, sd * 4, 0.01 * dt * vs, "bandpass", 800, 400);
      }
      musStep++;
      if (musStep % 16 === 0) {
        songBar++;
        if (bossNow !== inBoss) { inBoss = bossNow; songBar = 0; if (!inBoss) songI = pickNextSong(songI, SONGS.length, Math.random()); }
        else if (campNow !== inCamp) { inCamp = campNow; songBar = 0; }
        else if (!inBoss && !inCamp && songBar >= songLoopBars(s)) { songBar = 0; songI = pickNextSong(songI, SONGS.length, Math.random()); }
        else if (inCamp && songBar >= songLoopBars(s)) songBar = 0;
      }
    };
    const musicTick = (): void => {
      if (!ac || !musGain) return;
      const now = ac.currentTime;
      if (musicShouldRun(musicRef.current, ac.state)) {
        const echoAmt = inBoss ? 0.05 : (inCamp ? (SONGS[CAMP_SONG_I].echo ?? 0.2) : (curDungeonSong().echo ?? 0.16));
        if (!musOn) { musOn = true; musT = now + 0.1; musGain.gain.cancelScheduledValues(now); musGain.gain.setValueAtTime(0.0001, now); musGain.gain.linearRampToValueAtTime(MUS_GAIN, now + 0.5); if (musEcho) { musEcho.gain.cancelScheduledValues(now); musEcho.gain.setValueAtTime(0.0001, now); musEcho.gain.linearRampToValueAtTime(echoAmt, now + 0.5); } }
        else if (musEcho) musEcho.gain.setTargetAtTime(echoAmt, now, 0.2);
        if (musT < now - 0.3) musT = now + 0.05;
        let guard = 0;
        while (musT < now + 0.3 && guard < 16) { schedStep(musT); musT += 60 / curDungeonSong().bpm / 4; guard++; }
      } else if (musOn) { musOn = false; musGain.gain.cancelScheduledValues(now); musGain.gain.setTargetAtTime(0, now, 0.08); if (musEcho) { musEcho.gain.cancelScheduledValues(now); musEcho.gain.setTargetAtTime(0, now, 0.08); } }
    };

    const g0 = newGame(null);
    g0.notify = bump;
    g0.sfx = sfx;
    gRef.current = g0;

    let mmRect: number[] = [0, 0, 0, 0];
    let mmCv: HTMLCanvasElement | null = null;
    let mmKey = "";
    let stairsL: number[][] = [];
    // storage self-test (every access is wrapped - a SecurityError can never stop the game)
    probeStores();
    const lsOk = probeStore("l");
    // Keep stor on "checking" (profile buttons disabled) until IndexedDB has been
    // copied into localStorage. Enabling the picker on the localStorage probe alone
    // let a fast tap on Jax call beginNew and delete an IDB-only save.
    void Promise.all([probeIdb().then((v: boolean) => v, () => false), syncFromIdb().then((v: boolean) => v, () => false)]).then((pair: boolean[]) => {
      try { ensureJaxSeed(); } catch { /* seed is best-effort */ }
      markStorageReady();
      setStor(viewerBlocksSaving() ? "blocked" : (lsOk || pair[0] ? "on" : "off"));
      const g2 = gRef.current; if (g2) g2.notify();
      bump();
    }, () => {
      try { ensureJaxSeed(); } catch { /* seed is best-effort */ }
      markStorageReady();
      setStor(viewerBlocksSaving() ? "blocked" : (lsOk ? "on" : "off"));
      bump();
    });
    // Auto-resume: reuse the live run if this is just a remount, otherwise load the newest save straight into play (no Continue tap needed).
    const resumeSaved = (force: boolean): boolean => {
      const cur = gRef.current;
      if (!cur || (!force && cur.mode !== "title") || !hasSave()) return false;
      const n = loadGame(cur);
      if (!n) return false;
      n.mode = "play"; n.notify = bump; n.sfx = sfx;
      mutedRef.current = n.muted; setMuted(n.muted);
      musicRef.current = n.music; setMusicOn(n.music);
      gRef.current = n; LIVE = n;
      setBanner(n, "WELCOME BACK", "Depth " + n.depth + " \u00b7 Level " + n.lvl, "#80ff80", 2, 2);
      return true;
    };
    if (LIVE && LIVE.mode !== "title") {
      LIVE.notify = bump; LIVE.sfx = sfx;
      mutedRef.current = LIVE.muted; setMuted(LIVE.muted); musicRef.current = LIVE.music; setMusicOn(LIVE.music);
      gRef.current = LIVE;
      setProfOpen(false);
    }
    bump();
    void syncFromIdb().then(() => {
      markStorageReady();
      const g2 = gRef.current; if (g2) g2.notify();
      bump();
    }, () => { markStorageReady(); bump(); });

    // title demo gear
    let demoEq: Eq = { head: null, chest: null, arms: null, legs: null, rh: null, lh: null, pet: null };
    let demoT = 99, demoR = 0;
    const newDemo = (): void => {
      const rr = demoR % 8; demoR++;
      const wk = pick(WEAP_K.filter((k: WT) => k !== "shield"));
      const rhI = makeItem(10, rr, wk);
      demoEq = { head: makeItem(10, rr, "head"), chest: makeItem(10, rr, "chest"), arms: makeItem(10, rr, "arms"), legs: makeItem(10, rr, "legs"), rh: rhI, lh: isTwo(rhI) ? null : makeItem(10, rr, "shield"), pet: null };
    };

    const text = (s: string, x: number, y: number, c: string, align: CanvasTextAlign, size: number): void => {
      ctx.font = "bold " + size + "px monospace";
      ctx.textAlign = align; ctx.textBaseline = "middle";
      ctx.fillStyle = "#000000"; ctx.fillText(s, x + 1, y + 1);
      ctx.fillStyle = c; ctx.fillText(s, x, y);
    };

    const update = (dt: number): void => {
      const g = gRef.current;
      if (!g) return;
      g.time += dt;
      RC[7] = "hsl(" + Math.floor((g.time * 140) % 360) + ",100%,62%)";
      g.toast = Math.max(0, g.toast - dt);
      if (g.lootToast) g.lootToast = Math.max(0, g.lootToast - dt);
      const paused = invRef.current || g.shopOpen || g.stashOpen || g.gambOpen || quitRef.current || pauseRef.current || (typeof document !== "undefined" && document.hidden);
      if (g.mode === "play" && !paused) { g.saveT += dt; if (g.saveT >= 60) saveGame(g); }
      if (g.mode === "play" && !paused) { gobTick(g, dt); g.rt = true; rtUpdate(g, dt); }
      if (g.portal && g.vis[g.portal.y * MW + g.portal.x] && Math.random() < 0.3) burst(g, g.portal.x * TS + 12 + (Math.random() - 0.5) * 16, g.portal.y * TS + 16, 1, [portalHue(g), "#ffffff"], 18, -50);
      const h = g.hero;
      h.bump = Math.max(0, h.bump - dt * 7);
      for (const e of g.en) { e.bump = Math.max(0, e.bump - dt * 7); e.hit = Math.max(0, e.hit - dt); }
      for (const p of g.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.98; if (p.spin) p.ang = (p.ang || 0) + p.spin * dt; p.life -= dt; }
      if (g.parts.length) g.parts = g.parts.filter((p: Part) => p.life > 0);
      for (const f of g.floats) { f.y -= dt * 22; f.life -= dt; }
      if (g.floats.length) g.floats = g.floats.filter((f: Float) => f.life > 0);
      for (const s of g.shots) { s.t -= dt; if (s.t <= 0 && s.dmg) resolveShot(g, s); }
      if (g.shots.length) g.shots = g.shots.filter((s: Shot) => s.t > 0);
      if (SCSH.t > 0) SCSH.t = Math.max(0, SCSH.t - dt);
      if (g.mode === "play") scanScreenAlerts(g);
      if (g.warn) { if (!paused) { g.warn.t -= dt; if (g.warn.t <= 0) g.warn = undefined; } }
      if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
      g.flash = Math.max(0, g.flash - dt);
      g.shake = g.shake > 0.2 ? g.shake * Math.pow(0.02, dt) : 0;
      g.lvlFx = Math.max(0, g.lvlFx - dt);
      if (g.mode === "dead") { g.deadT += dt; if (g.deadT > 2.4) respawn(g); }
      if (g.mode === "title") { demoT += dt; if (demoT > 1.8) { demoT = 0; newDemo(); } }
      if (g.lvlFx > 0 && Math.random() < 0.5) burst(g, h.ax * TS + 12 + (Math.random() - 0.5) * 20, h.ay * TS + 22, 1, [GOLD, "#ffffff"], 20, -60);
      const hd = holdRef.current;
      const now = performance.now();
      for (const f of g.fx) { f.t -= dt; if (f.k === "meteor" && !f.fired && f.t < f.max * 0.5) { f.fired = true; burst(g, f.x, f.y, 46, [f.c, f.c2, "#ffffff"], 140, 70); g.shake = Math.max(g.shake, 6); } }
      if (g.fx.length) g.fx = g.fx.filter((f: Fx) => f.t > 0);
      if (g.parts.length < 400) for (const gr of g.ground) if (Math.random() < 0.04 && g.vis[gr.y * MW + gr.x]) burst(g, gr.x * TS + 4 + Math.random() * 16, gr.y * TS + 18, 1, [ELC[gr.el], EL2[gr.el]], 15, -50);
      if (g.mode === "play" && !paused) { idleDropFx(g, dt); idleActBossFx(g, dt); }
      campNow = g.mode === "play" && g.area === "camp";
      bossNow = g.mode === "play" && !campNow && g.en.some((e: En) => e.cls === 2 && e.hp > 0 && e.awake && Math.abs(e.x - h.x) + Math.abs(e.y - h.y) <= 12);
      if (g.mode === "play" && shouldAdvanceSongOnFloor(lastMusDepth, g.depth, inBoss || bossNow, g.area || "dungeon")) {
        songI = pickNextSong(songI, SONGS.length, Math.random());
        songBar = 0; musStep = 0;
      }
      if (g.mode === "play" && g.area !== "camp") lastMusDepth = g.depth;
      if (g.mode === "play" && !paused && (g.eq.rh && g.eq.rh.kind === "beamsword" || g.eq.lh && g.eq.lh.kind === "beamsword")) sfx("bhum");
      musicTick();
      if (g.mode === "play") { petFollow(g, dt); petShotTick(g, dt); if (!g.vault && Math.random() < 0.3 + 0.5 * THDREAD) themeAmbient(g); }
      if (hd && g.mode === "play" && !paused && (g.rt ? (g.pcd ?? 0) <= 1e-6 : now - hd.last > 165 / MVMUL)) { hd.last = now; lastAuto = now; act(g, hd.dx, hd.dy); publishPad(true, hd.dx, hd.dy, true); }
      if (g.mode === "play" && !paused && calc(g.lvl, g.eq).range > 0) autoTurn(g);
      else if (!hd && g.mode === "play" && !paused && now - lastAuto > 330) { lastAuto = now; autoTurn(g); }
      visTick(g, (g.mode !== "title" && !paused) ? dt : 0);
    };

    const drawTitle = (g: Game): void => {
      const t = g.time;
      const gr = ctx.createLinearGradient(0, 0, 0, VH);
      gr.addColorStop(0, "#0c0818"); gr.addColorStop(1, "#26103a");
      ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, VH);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = i % 3 ? "#3a2a5a" : "#6a4a9a"; ctx.fillRect((i * 53) % VW, (i * 97 + Math.floor(t * 8)) % VH, 1, 1); }
      text("ENDLESS", VW / 2, 34, "#ffd840", "center", 22);
      text("DEPTHS", VW / 2, 58, "#ff8c1a", "center", 18);
      text("an infinite pixel dungeon crawler", VW / 2, 78, "#c8b8f0", "center", 7);
      const rar = (demoR + 7) % 8;
      aura(ctx, VW / 2, 150, 46, rar, t);
      drawHero(ctx, VW / 2 - 48, 104, 4, 1, demoEq, 0, { ...P0, bob: Math.sin(t * 2.4) > 0.45 ? -1 : 0, sway: Math.sin(t * 1.3) * 0.8 });
      text(RT[rar].toUpperCase() + " GEAR", VW / 2, 206, RC[rar], "center", 9);
      for (let i = 0; i < 8; i++) { ctx.fillStyle = RC[i]; ctx.fillRect(VW / 2 - 56 + i * 14, 216, 12, 4); }
      text("A Prismatic equipped awakens Super Elites and double/triple bosses.", VW / 2, 248, "#c87860", "center", 5);
      text("Hold and slide the joystick, or use keys. Bump to attack.", VW / 2, 264, "#a898c8", "center", 6);
      text("Keys: WASD+chords QEZC Numpad  I bag H potion Enter stairs R ult K dig", VW / 2, 274, "#a898c8", "center", 6);
      text("BEST DEPTH " + g.best + "   BEST LEVEL " + g.bestLvl, VW / 2, 290, "#ffd840", "center", 8);
    };

    const drawPlay = (g: Game): void => {
      const h = g.hero, t = g.time;
      if (!IP.camOk) visTick(g, 0);
      const [camX, camY] = camXY();
      ctx.save();
      ctx.beginPath(); ctx.rect(0, HUD, VW, VIEWH); ctx.clip();
      ctx.fillStyle = "#000000"; ctx.fillRect(0, HUD, VW, VIEWH);
      const tx0 = Math.floor(camX / TS), ty0 = Math.floor((camY + HUD) / TS);
      const tx1 = Math.ceil((camX + VW) / TS), ty1 = Math.ceil((camY + HUD + VIEWH) / TS);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (!inb(tx, ty)) continue;
        const i = ty * MW + tx;
        const v = g.map[i];
        const sx = tx * TS - camX, sy = ty * TS - camY;
        let img: HTMLCanvasElement;
        if (v === 0) img = ty + 1 < MH && g.map[i + MW] !== 0 ? g.tiles[4] : g.tiles[3];
        else if (v === 2) img = g.tiles[5];
        else if (v === 3) img = g.tiles[7] || g.tiles[5];
        else img = g.tiles[(tx * 7 + ty * 13) % 3];
        ctx.drawImage(img, sx, sy);
        if (v === 0) { const cp = g.cracks ? g.cracks[i] : 0; if (cp > 0) drawWallCracks(ctx, sx, sy, crackStage(cp)); }
        if (v === 1 && g.tiles[6] && (((tx * 31 + ty * 57) * 2654435761) >>> 0) % 29 === 0) ctx.drawImage(g.tiles[6], sx, sy);
        if ((v === 1 || v === 3) && THDREAD > 0.04) {
          const hsh = (((tx * 31 + ty * 57 + g.depth * 13) * 2654435761) >>> 0);
          if ((hsh % 1000) / 1000 < THDREAD * 0.55) drawDreadDecal(ctx, sx, sy, hsh, THDREAD);
        }
      }
      for (const tch of (g.torches ?? [])) {
        const tsx = tch.x * TS - camX, tsy = tch.y * TS - camY;
        if (tsx < -TS || tsy < HUD - TS || tsx > VW + TS || tsy > HUD + VIEWH + TS) continue;
        drawTorch(ctx, tch, tsx, tsy, t);
      }
      const [shx, shy] = shakeOff(g);
      ctx.translate(shx, shy);
      drawGround(ctx, g, camX, camY, t);
      for (const c of g.chests) {
        if (!g.vis[c.y * MW + c.x]) continue;
        const csx = c.x * TS - camX, csy = c.y * TS - camY;
        chestGlow(ctx, csx, csy, c.rar ?? 0, t, c.open);
        drawLootChest(painter(ctx, csx, csy, 2, false, 0), c.open, c.rar ?? 0);
        if (!c.open && Math.abs(c.x - h.x) + Math.abs(c.y - h.y) <= 1) text(CHN[Math.max(0, Math.min(4, c.rar ?? 0))], csx + 12, csy - 4, RC[Math.max(0, Math.min(4, c.rar ?? 0))], "center", 6);
      }
      for (const dr of g.drops) {
        if (!g.vis[dr.y * MW + dr.x]) continue;
        const sx = dr.x * TS - camX, sy = dr.y * TS - camY;
        if (dr.item) {
          const it = dr.item;
          dropGlow(ctx, sx, sy, it, t, dr.x);
          if (it.ult !== undefined) { ctx.strokeStyle = GOLD; ctx.lineWidth = 1; ctx.strokeRect(sx + 1.5, sy + 0.5, 21, 21); }
          aura(ctx, sx + 12, sy + 12, 11, it.rar, t);
          ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(sx + 5, sy + 19, 14, 3);
          const diconY = sy + 1 + Math.round(Math.sin(t * 3 + dr.x) * 1.5);
          ctx.drawImage(iconCanvas(it), sx + 2, diconY, 20, 20);
          if (it.sk && it.sk.length) {
            const pip = SOCK_PIP_DROP, gap = 1;
            const layout = socketPipLayout(it.sk.length, 20, pip, gap);
            if (layout.length) drawSocketPips(ctx, sx + 2 + layout[0].x, diconY + layout[0].y, it, pip, gap);
          }
          ctx.fillStyle = RC[it.rar]; ctx.fillRect(sx + 3, sy + 22, 18, 1);
          if (it.st && it.st.length) { ctx.font = "bold 6px monospace"; ctx.textAlign = "right"; ctx.textBaseline = "top"; ctx.fillStyle = "#000000"; ctx.fillText("\u2605" + it.st.length, sx + 22, sy - 1); ctx.fillStyle = GOLD; ctx.fillText("\u2605" + it.st.length, sx + 21, sy - 2); }
        } else if (dr.pot) {
          const p = painter(ctx, sx, sy, 2, false, 0);
          p(5, 3, 2, 2, "#c0a080"); p(4, 5, 4, 5, "#ff3060"); p(4, 5, 1, 2, "#ff9ab0"); p(4, 10, 4, 1, "#a01030");
        } else {
          const p = painter(ctx, sx, sy, 2, false, 0);
          p(3, 7, 4, 3, "#c89020"); p(5, 6, 4, 4, GOLD); p(6, 6, 1, 1, "#fff8c0"); p(4, 8, 1, 1, "#fff8c0");
        }
      }
      if (g.portal && g.vis[g.portal.y * MW + g.portal.x]) {
        const px = g.portal.x * TS - camX + 12, py = g.portal.y * TS - camY + 12;
        const pc = portalHue(g);
        ctx.globalAlpha = 0.3 + 0.15 * Math.sin(t * 3); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(px, py, 13, 0, 6.2832); ctx.fill();
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.85 - i * 0.2; ctx.strokeStyle = i === 1 ? "#ffffff" : pc; ctx.beginPath(); ctx.arc(px, py, 10 - i * 3, t * (3 + i) + i, t * (3 + i) + i + 4.4); ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
        text(portalLabel(g), px, py - 17, pc, "center", 6);
      }
      if (g.merchant && g.vis[g.merchant.y * MW + g.merchant.x]) {
        const tx = g.merchant.x * TS - camX, ty = g.merchant.y * TS - camY;
        ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(tx + 5, ty + 21, 14, 2);
        const p = painter(ctx, tx, ty + Math.round(Math.sin(t * 2) * 0.6), 2, false, 0);
        p(3, 0, 6, 1, "#5a3a18"); p(2, 1, 1, 2, "#5a3a18"); p(9, 1, 1, 2, "#5a3a18"); p(4, 1, 4, 3, SKIN); p(5, 2, 1, 1, DK); p(7, 2, 1, 1, DK); p(4, 3, 4, 1, "#d8d0c0");
        p(3, 4, 6, 7, "#8a5a20"); p(3, 4, 6, 1, GOLD); p(5, 5, 2, 6, "#c08030"); p(2, 6, 1, 3, SKIN); p(9, 6, 1, 3, SKIN);
        p(9, 7, 4, 4, "#6a3a10"); p(10, 8, 2, 2, GOLD); p(10, 7, 2, 1, "#c8a040");
        text("CHESTS", tx + 12, ty - 6, GOLD, "center", 5);
      }
      if (g.fireAt && g.vis[g.fireAt.y * MW + g.fireAt.x]) {
        const fx = g.fireAt.x * TS - camX, fy = g.fireAt.y * TS - camY;
        const flicker = 0.7 + 0.3 * Math.sin(t * 9 + 1.2);
        ctx.fillStyle = "#3a2010"; ctx.fillRect(fx + 6, fy + 16, 12, 5);
        ctx.globalAlpha = 0.55 * flicker; ctx.fillStyle = "#ff8020"; ctx.beginPath(); ctx.arc(fx + 12, fy + 12, 8, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.9 * flicker; ctx.fillStyle = "#ffd040"; ctx.beginPath(); ctx.arc(fx + 12, fy + 11, 4, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1; text("FIRE", fx + 12, fy - 4, "#ffb040", "center", 5);
      }
      if (g.restAt && g.vis[g.restAt.y * MW + g.restAt.x]) {
        const rx = g.restAt.x * TS - camX, ry = g.restAt.y * TS - camY;
        ctx.fillStyle = "#5a3a18"; ctx.fillRect(rx + 3, ry + 10, 18, 10);
        ctx.fillStyle = "#8a5030"; ctx.beginPath(); ctx.moveTo(rx + 2, ry + 11); ctx.lineTo(rx + 12, ry + 2); ctx.lineTo(rx + 22, ry + 11); ctx.fill();
        ctx.fillStyle = "#c8a070"; ctx.fillRect(rx + 8, ry + 13, 8, 7);
        text("REST", rx + 12, ry - 4, "#80ff80", "center", 5);
      }
      if (g.stashAt && g.vis[g.stashAt.y * MW + g.stashAt.x]) {
        const sx0 = g.stashAt.x * TS - camX, sy0 = g.stashAt.y * TS - camY;
        ctx.fillStyle = "#5a3a10"; ctx.fillRect(sx0 + 4, sy0 + 8, 16, 13);
        ctx.fillStyle = GOLD; ctx.fillRect(sx0 + 4, sy0 + 8, 16, 3);
        ctx.fillStyle = "#2a1a08"; ctx.fillRect(sx0 + 10, sy0 + 13, 4, 4);
        text("BANK", sx0 + 12, sy0 - 4, GOLD, "center", 5);
      }
      const ens = g.en.filter((e: En) => e.hp > 0 && g.vis[e.y * MW + e.x]).sort((a: En, b: En) => a.y - b.y);
      let boss: En | null = null;
      const bosses: En[] = [];
      for (const e of ens) {
        const bx = e.bump > 0 ? e.bdx * Math.sin(e.bump * Math.PI) * 6 : 0;
        const by = e.bump > 0 ? e.bdy * Math.sin(e.bump * Math.PI) * 6 : 0;
        const sx = Math.round(e.ax * TS - camX + bx), sy = Math.round(e.ay * TS - camY + by);
        const flip = e.face < 0;
        if (e.cls === 2) { boss = e; bosses.push(e); }
        ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(sx + 4, sy + 21, 16, 3);
        if (e.hit > 0 && Math.floor(e.hit * 30) % 2 === 0) { /* hit blink */ }
        else if (e.act) drawActBoss(ctx, e, sx, sy, flip, t);
        else if (e.cls === 2) drawBossGlow(ctx, e, sx, sy, flip, t);
        else if (e.se) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 7);
          sprOutline(ctx, e, sx, sy, flip, t, SE_COL, 0.6 + 0.4 * pulse, 2);
        }
        else if (e.rare || e.cls === 1) {
          const pulse = 0.5 + 0.5 * Math.sin(t * (e.cls === 1 ? 6 : 5));
          sprOutline(ctx, e, sx, sy, flip, t, GOLD, 0.55 + 0.45 * pulse, e.cls === 1 ? 2 : 1);
        }
        else drawEnemy(painter(ctx, sx, sy, 2, flip, 12), e.f, e.pal, t + e.id);
        if (e.rare && e.lead) { ctx.fillStyle = GOLD; ctx.fillRect(sx + 9, sy - 3, 6, 3); ctx.fillRect(sx + 10, sy - 5, 4, 2); }
        if ((e.shd ?? 0) > 0 && (e.mshd ?? 0) > 0) { ctx.fillStyle = "#123040"; ctx.fillRect(sx + 4, sy + 2, 16, 2); ctx.fillStyle = "#9ae8ff"; ctx.fillRect(sx + 4, sy + 2, Math.max(1, Math.round(16 * (e.shd as number) / (e.mshd as number))), 2); }
        if (e.se) {
          text("Super Elite", sx + 12, sy - 10, SE_COL2, "center", 4);
          const p = painter(ctx, sx + 7, sy - 6, 1, false, 0);
          p(0, 2, 10, 3, SE_COL); p(0, 0, 2, 2, SE_COL2); p(4, 0, 2, 2, SE_COL); p(8, 0, 2, 2, SE_COL2); p(4, 3, 2, 1, "#ffe0a0");
        } else if (e.cls === 1) {
          const p = painter(ctx, sx + 7, sy - 6, 1, false, 0);
          p(0, 2, 10, 3, GOLD); p(0, 0, 2, 2, GOLD); p(4, 0, 2, 2, GOLD); p(8, 0, 2, 2, GOLD); p(4, 3, 2, 1, "#ff3030");
        }
        if (e.stun > 0) text("*", sx + 12, sy - 2, "#80c0ff", "center", 8);
        if (e.gob) { const sp = gobSpark(e.gob); const nsp = e.gob === 1 ? 2 : 5; for (let i = 0; i < nsp; i++) { ctx.fillStyle = sp[ri(sp.length)]; ctx.fillRect(Math.round(sx + 2 + Math.random() * 20), Math.round(sy - 2 + Math.random() * 22), e.gob === 1 ? 1 : 2, e.gob === 1 ? 1 : 2); } if (e.awake) text(Math.max(0, Math.ceil(GOB_TIME - g.gobT)) + "s", sx + 23, sy - 8, e.gob === 2 ? "#40e0ff" : e.gob === 3 ? GOLD : "#40ff60", "center", 5); }
        if (e.burn > 0 && Math.random() < 0.6) { ctx.fillStyle = Math.random() < 0.5 ? "#ff7a20" : "#ffe060"; ctx.fillRect(Math.round(sx + 6 + Math.random() * 12), Math.round(sy + 2 + Math.random() * 14), 2, 2); }
        if (e.slow > 0) { sprShimmer(ctx, e, sx, sy, flip, t, "#80e0ff", 0.4); }
        if (e.weak > 0 || e.fear > 0) text(e.fear > 0 ? "!" : "\u2193", sx + 21, sy + 2, "#c090ff", "center", 7);
        if (e.cls < 2 && e.hp < e.mhp) {
          ctx.fillStyle = "#300808"; ctx.fillRect(sx + 3, sy - 3, 18, 2);
          ctx.fillStyle = e.se ? SE_COL : e.cls === 1 ? GOLD : "#ff4040"; ctx.fillRect(sx + 3, sy - 3, Math.max(1, Math.round(18 * e.hp / e.mhp)), 2);
        }
      }
      // hero
      const hpo = heroPose(g, t);
      const hatk = hpo.pr >= 0;
      const hbx = hatk ? HA.adx * hpo.lunge : h.bump > 0 ? h.bdx * Math.sin(h.bump * Math.PI) * 5 : 0;
      const hby = hatk ? HA.ady * hpo.lunge : h.bump > 0 ? h.bdy * Math.sin(h.bump * Math.PI) * 5 : 0;
      const hsx = Math.round(h.ax * TS - camX + hbx), hsy = Math.round(h.ay * TS - camY + hby);
      let best = -1;
      for (const k of EQK) { const it = g.eq[k]; if (it && it.rar > best) best = it.rar; }
      if (g.mode !== "dead") {
        aura(ctx, hsx + 12, hsy + 12, 15, best, t);
        const wardMax = calc(g.lvl, g.eq).ward;
        drawPassives(ctx, g, hsx, hsy, t, 0, wardMax);
        if (g.lvlFx > 0) {
          const beam = lvlUpBeamRect(hsx, hsy);
          ctx.globalAlpha = Math.min(0.6, g.lvlFx * 0.4);
          ctx.fillStyle = GOLD;
          ctx.fillRect(beam.x, beam.y, beam.w, beam.h);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(hsx + 5, hsy + 22, 14, 2);
        const htip = drawHero(ctx, hsx, hsy, 1, h.face, g.eq, !hatk && h.bump > 0 ? 2 : 0, hpo.q, heroDir(h));
        if ((g.petTwinUntil ?? 0) > (g.petAbiT ?? 0)) {
          ctx.globalAlpha = 0.55 + 0.15 * Math.sin(DRAW_T * 8);
          drawHero(ctx, hsx + 10, hsy - 4, 1, h.face, g.eq, 0, P0, heroDir(h));
          ctx.globalAlpha = 1;
        }
        drawAtkFx(ctx, g, htip, hpo.pr, hsx, hsy, camX, camY);
        drawPassives(ctx, g, hsx, hsy, t, 1, wardMax);
        drawAllies(ctx, g, hsx, hsy, t);
        drawPet(ctx, g, camX, camY, t);
      }
      for (const f of g.fx) drawFx(ctx, f, camX, camY, t);
      drawPetShots(ctx, g, camX, camY, t);
      for (const s of g.shots) {
        const maxT = s.max && s.max > 0 ? s.max : 0.15;
        const pr = 1 - s.t / maxT;
        const x = s.x0 + (s.x1 - s.x0) * Math.min(1, pr) - camX, y = s.y0 + (s.y1 - s.y0) * Math.min(1, pr) - camY;
        const ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
        const typ = s.typ ?? 0;
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.rotate(ang);
        ctx.globalAlpha = 0.35; ctx.fillStyle = s.c;
        ctx.fillRect(-5, -3, 10, 6);
        ctx.globalAlpha = 1;
        if (typ === 4) {
          ctx.globalAlpha = 0.45; ctx.fillStyle = s.c;
          ctx.beginPath(); ctx.arc(-2, 0, 5, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, 6.2832); ctx.fill();
          ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(1, 0, 1.6, 0, 6.2832); ctx.fill();
          ctx.fillStyle = s.c; ctx.fillRect(-7, -1, 6, 2);
        } else if (typ === 2) { ctx.fillStyle = s.c; ctx.fillRect(-3, -2, 7, 4); ctx.fillStyle = "#ffffff"; ctx.fillRect(-1, -1, 3, 2); }
        else if (typ === 3) { ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 6.2832); ctx.fill(); ctx.fillStyle = "#ffffff"; ctx.fillRect(-1, -1, 2, 2); }
        else { ctx.fillStyle = s.c; ctx.fillRect(-4, -1, 8, 3); ctx.fillStyle = "#fff8d0"; ctx.fillRect(-5, 0, 4, 1); ctx.fillStyle = "#ffffff"; ctx.fillRect(2, 0, 2, 1); }
        ctx.restore();
      }
      for (const p of g.parts) drawPart(ctx, p, camX, camY);
      ctx.globalAlpha = 1;
      for (const f of g.floats) { ctx.globalAlpha = Math.min(1, f.life * 2); text(f.txt, f.x - camX, f.y - camY, f.c, "center", 8); }
      ctx.globalAlpha = 1;
      ctx.restore();

      // boss bar (n===1 keeps the raw60 height / placement; n>1 stacks copies)
      if (bosses.length === 1 && boss) {
        const bc = boss.act && boss.abt !== undefined ? actBossDef(boss.abt).glow : "#ff7070";
        const sub = boss.act && boss.abt !== undefined ? actBossDef(boss.abt).title : "";
        ctx.fillStyle = "rgba(10,4,8,0.85)"; ctx.fillRect(4, HUD + 3, VW - 8, sub ? 22 : 17);
        text(boss.name, VW / 2, HUD + 8, bc, "center", 7);
        if (sub) text(sub, VW / 2, HUD + 15, "#e8d0c0", "center", 5);
        ctx.fillStyle = "#300808"; ctx.fillRect(8, HUD + (sub ? 18 : 13), VW - 16, 4);
        ctx.fillStyle = bc; ctx.fillRect(8, HUD + (sub ? 18 : 13), Math.max(1, Math.round((VW - 16) * boss.hp / boss.mhp)), 4);
      } else if (bosses.length > 1) {
        const nB = bosses.length;
        const h = bossBarH(nB, true);
        const tag = nB >= 3 ? "TRIPLE BOSS" : "DOUBLE BOSS";
        ctx.fillStyle = "rgba(10,4,8,0.85)"; ctx.fillRect(4, HUD + 3, VW - 8, h);
        text(tag, VW / 2, HUD + 9, "#ff4040", "center", 7);
        for (let i = 0; i < nB; i++) {
          const b = bosses[i];
          const bc = b.act && b.abt !== undefined ? actBossDef(b.abt).glow : "#ff7070";
          const y = HUD + 14 + i * 13;
          text(b.name, VW / 2, y, bc, "center", 5);
          ctx.fillStyle = "#300808"; ctx.fillRect(8, y + 4, VW - 16, 4);
          ctx.fillStyle = bc; ctx.fillRect(8, y + 4, Math.max(1, Math.round((VW - 16) * b.hp / Math.max(1, b.mhp))), 4);
        }
      }
      // minimap
      if (!mmCv) { mmCv = document.createElement("canvas"); mmCv.width = MW; mmCv.height = MH; }
      const mkey = g.depth + ":" + g.turn + ":" + g.kills + ":" + g.floorTurn + ":" + (g.vault ? 1 : 0) + ":" + (g.wallVer || 0);
      if (mmKey !== mkey) {
        mmKey = mkey; stairsL = [];
        const mc = mmCv.getContext("2d");
        if (mc) {
          mc.clearRect(0, 0, MW, MH);
          for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
            const k = y * MW + x;
            if (!g.seen[k]) continue;
            if (g.map[k] === 2 || g.map[k] === TILE_UP) stairsL.push([x, y]);
            mc.fillStyle = g.map[k] === 0 ? "#2c2440" : "#8a80a8";
            mc.fillRect(x, y, 1, 1);
          }
        }
      }
      {
        const big = g.mmBig, ms2 = big ? 4 : 1;
        const mw = MW * ms2, mh = MH * ms2;
        const mx0 = big ? Math.round((VW - mw) / 2) : VW - mw - 3;
        const my0 = big ? HUD + Math.round((VIEWH - mh) / 2) : HUD + hudBossOff(bosses.length, !!(boss && boss.act)).mm;
        mmRect = [mx0 - 4, my0 - 4, mw + 8, mh + 8];
        ctx.globalAlpha = big ? 0.96 : 0.82;
        ctx.fillStyle = "#08060e"; ctx.fillRect(mx0 - 1, my0 - 1, mw + 2, mh + 2);
        ctx.strokeStyle = big ? "#8a80a8" : "#3a3450"; ctx.lineWidth = 1; ctx.strokeRect(mx0 - 1.5, my0 - 1.5, mw + 3, mh + 3);
        ctx.drawImage(mmCv, mx0, my0, mw, mh);
        ctx.globalAlpha = 1;
        const dot = (x: number, y: number, c: string, s: number): void => { ctx.fillStyle = c; ctx.fillRect(mx0 + x * ms2 + Math.floor((ms2 - s) / 2), my0 + y * ms2 + Math.floor((ms2 - s) / 2), s, s); };
        const ds = big ? 4 : 2;
        for (const c of g.chests) if (!c.open && g.seen[c.y * MW + c.x]) dot(c.x, c.y, RC[Math.max(0, Math.min(4, c.rar ?? 0))], ds);
        if (g.merchant && g.seen[g.merchant.y * MW + g.merchant.x]) dot(g.merchant.x, g.merchant.y, GOLD, ds + 1);
        if (g.portal && g.seen[g.portal.y * MW + g.portal.x]) dot(g.portal.x, g.portal.y, Math.floor(t * 3) % 2 ? portalHue(g) : "#ffffff", ds + 1);
        if (g.stashAt && g.seen[g.stashAt.y * MW + g.stashAt.x]) dot(g.stashAt.x, g.stashAt.y, GOLD, ds);
        if (g.restAt && g.seen[g.restAt.y * MW + g.restAt.x]) dot(g.restAt.x, g.restAt.y, "#80ff80", ds);
        if (g.fireAt && g.seen[g.fireAt.y * MW + g.fireAt.x]) dot(g.fireAt.x, g.fireAt.y, "#ff8020", ds);
        for (const e of g.en) if (e.gob && e.hp > 0 && g.vis[e.y * MW + e.x]) dot(e.x, e.y, e.gob === 2 ? "#40e0ff" : GOLD, ds + 1);
        for (const e of g.en) if (e.se && e.hp > 0 && g.vis[e.y * MW + e.x]) dot(e.x, e.y, SE_COL, ds);
        if (big) for (const e of g.en) if (e.hp > 0 && g.vis[e.y * MW + e.x]) dot(e.x, e.y, e.cls ? "#ff4040" : "#c04848", 3);
        for (const e of g.en) if (e.cls === 2 && !e.gob && e.hp > 0 && (g.vis[e.y * MW + e.x] || e.awake)) { const fast = e.hunt ? 6 : 3; const gc = e.act && e.abt !== undefined ? actBossDef(e.abt).glow : (e.hunt ? "#e040ff" : BOSS_GLOW); dot(e.x, e.y, Math.floor(t * fast) % 2 ? "#ffffff" : gc, ds + (e.hunt ? 4 : 3)); dot(e.x, e.y, gc, ds + 1); }
        for (const s of stairsL) dot(s[0], s[1], Math.floor(t * 3) % 2 ? "#40ffff" : "#ffffff", ds + 1);
        dot(h.x, h.y, Math.floor(t * 4) % 2 ? "#ffffff" : "#ff60ff", ds + 1);
        if (big) text("Tap to close \u00b7 cyan stairs \u00b7 green trader \u00b7 gold chest \u00b7 violet portal", VW / 2, my0 + mh + 7, "#c8c0ff", "center", 6);
        if (big) text("purple ring = boss / Hunter", VW / 2, my0 + mh + 15, "#d8a0ff", "center", 6);
        if (!big && stairsL.length) {
          let bs: number[] | null = null, bd = 1e9;
          for (const s of stairsL) { const dd = Math.abs(s[0] - h.x) + Math.abs(s[1] - h.y); if (dd < bd) { bd = dd; bs = s; } }
          if (bs && !g.vis[bs[1] * MW + bs[0]]) {
            const an = Math.atan2(bs[1] - h.y, bs[0] - h.x);
            const ax = VW / 2 + Math.cos(an) * 40, ay = HUD + VIEWH / 2 + Math.sin(an) * 40;
            ctx.globalAlpha = 0.55 + 0.3 * Math.sin(t * 5); ctx.fillStyle = "#40ffff"; ctx.beginPath();
            ctx.moveTo(ax + Math.cos(an) * 7, ay + Math.sin(an) * 7); ctx.lineTo(ax + Math.cos(an + 2.5) * 5, ay + Math.sin(an + 2.5) * 5); ctx.lineTo(ax + Math.cos(an - 2.5) * 5, ay + Math.sin(an - 2.5) * 5); ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }
      if (THDREAD > 0.08 && g.area !== "camp") {
        const vg = ctx.createRadialGradient(VW / 2, HUD + VIEWH / 2, VW * 0.28, VW / 2, HUD + VIEWH / 2, VW * 0.72);
        vg.addColorStop(0, "rgba(0,0,0,0)");
        vg.addColorStop(1, "rgba(40,0,0," + (0.18 + 0.28 * THDREAD).toFixed(3) + ")");
        ctx.fillStyle = vg;
        ctx.fillRect(0, HUD, VW, VIEWH);
      }
      if (g.lootToast && g.lootToast > 0 && g.lootToastTxt) {
        ctx.globalAlpha = Math.min(1, g.lootToast * 2);
        const lab = g.lootToastTxt.length > 36 ? g.lootToastTxt.slice(0, 34) + "..." : g.lootToastTxt;
        ctx.fillStyle = "rgba(28,18,8,0.88)"; ctx.fillRect(8, VH - MSGH - 14, VW - 16, 12);
        text(lab, VW / 2, VH - MSGH - 8, "#ffd080", "center", 6);
        ctx.globalAlpha = 1;
      }
      if (g.toast > 0) {
        ctx.globalAlpha = Math.min(1, g.toast * 2);
        ctx.fillStyle = "rgba(8,30,16,0.85)"; ctx.fillRect(VW - 46, VH - MSGH - 13, 44, 11);
        text("\u2713 Saved", VW - 24, VH - MSGH - 7, "#80ff9a", "center", 6);
        ctx.globalAlpha = 1;
      }
      // HUD
      const st = calc(g.lvl, g.eq);
      ctx.fillStyle = "#0c0a12"; ctx.fillRect(0, 0, VW, HUD);
      ctx.fillStyle = "#2a2438"; ctx.fillRect(0, HUD - 1, VW, 1);
      text("Lv" + g.lvl, 3, 8, GOLD, "left", 9);
      const rightPad = hudRightPad();
      const bx = 36, bw = Math.max(144, VW - bx - rightPad - 8);
      ctx.fillStyle = "#2a0808"; ctx.fillRect(bx, 3, bw, 9);
      const hpF = Math.max(0, Math.min(1, h.hp / st.maxHp));
      ctx.fillStyle = hpF < 0.3 ? (Math.floor(t * 4) % 2 ? "#ff2020" : "#a01010") : "#d82828"; ctx.fillRect(bx, 3, Math.round(bw * hpF), 9);
      ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(bx, 3, Math.round(bw * hpF), 2);
      if (st.ward > 0) { ctx.fillStyle = "#9ae8ff"; ctx.fillRect(bx, 11, Math.round(bw * Math.min(1, g.ward / st.ward)), 1); }
      text("HP " + Math.max(0, Math.ceil(h.hp)) + "/" + st.maxHp, bx + bw / 2, 8, "#ffffff", "center", 7);
      ctx.fillStyle = "#14102a"; ctx.fillRect(bx, 14, bw, 5);
      ctx.fillStyle = "#8a5aff"; ctx.fillRect(bx, 14, Math.round(bw * Math.min(1, g.xp / xpNeed(g.lvl))), 5);
      text("XP " + g.xp + "/" + xpNeed(g.lvl), bx + bw / 2, 17, "#e0d8ff", "center", 5);
      text("D" + g.depth, VW - 3 - rightPad, 8, "#80e0ff", "right", 9);
      text("\u2665" + g.potions, VW - 3 - rightPad, 18, "#ff7090", "right", 7);
      text("PL " + powerTotal(g.lvl, g.eq).toLocaleString("en-US"), 3, 25, GOLD, "left", 6);
      text(g.vault ? "Treasure Vault" : themeName(g), 52, 25, g.vault ? GOLD : "#8a80a8", "left", 6);
      text((g.gems ? (g.gems + "\u25c6 ") : "") + g.gold + "g", bx + bw, 25, GOLD, "right", 6);
      text("BEST D" + g.best, VW - 3 - rightPad, 26, "#8a80a8", "right", 5);
      // messages
      ctx.fillStyle = "#0c0a12"; ctx.fillRect(0, VH - MSGH, VW, MSGH);
      const ms = g.msgs.slice(-2);
      ms.forEach((m: { t: string; c: string }, i: number) => { ctx.globalAlpha = i === ms.length - 1 ? 1 : 0.6; text(m.t.length > 58 ? m.t.slice(0, 57) + "\u2026" : m.t, 3, VH - MSGH + 6 + i * 10, m.c, "left", 6); });
      ctx.globalAlpha = 1;
      // large screen warning stays at the top, shifted left of the minimap (raw59 rule)
      const wn = g.warn;
      if (wn && wn.t > 0) {
        const pulse = 0.62 + 0.38 * Math.abs(Math.sin((wn.max - wn.t) * 10));
        ctx.globalAlpha = Math.min(1, wn.t * 2.5) * pulse;
        const mmw = { x: mmRect[0], y: mmRect[1], w: mmRect[2], h: mmRect[3] };
        const wb = warnBox(mmw, !!boss, !!g.mmBig, bosses.length);
        ctx.fillStyle = "rgba(40,8,10,0.94)"; ctx.fillRect(wb.x, wb.y, wb.w, wb.h);
        ctx.fillStyle = wn.c; ctx.fillRect(wb.x, wb.y, wb.w, 2); ctx.fillRect(wb.x, wb.y + wb.h - 2, wb.w, 2); ctx.fillRect(wb.x, wb.y, 2, wb.h); ctx.fillRect(wb.x + wb.w - 2, wb.y, 2, wb.h);
        const wcx = wb.x + wb.w / 2;
        text(wn.txt, wcx, wb.y + Math.round(wb.h * 0.36), wn.c, "center", wb.h >= 44 ? 13 : 9);
        text(wn.sub, wcx, wb.y + Math.round(wb.h * 0.68), "#ffffff", "center", wb.h >= 44 ? 8 : 6);
        ctx.globalAlpha = 1;
      }
      // banner stays at the top; right edge ends left of the minimap; left inset clears lock / Wall Breaker
      const bn = g.banner;
      if (bn && !(g.warn && g.warn.t > 0.15)) {
        const a = Math.min(1, bn.t * 2.5);
        ctx.globalAlpha = a;
        const mm = { x: mmRect[0], y: mmRect[1], w: mmRect[2], h: mmRect[3] };
        const nb = noticeBox(mm, !!boss, !!g.mmBig, bosses.length);
        ctx.fillStyle = "rgba(8,6,14,0.9)"; ctx.fillRect(nb.x, nb.y, nb.w, nb.h);
        ctx.fillStyle = bn.c; ctx.fillRect(nb.x, nb.y, nb.w, 1); ctx.fillRect(nb.x, nb.y + nb.h - 1, nb.w, 1); ctx.fillRect(nb.x, nb.y, 1, nb.h); ctx.fillRect(nb.x + nb.w - 1, nb.y, 1, nb.h);
        const cx = nb.x + nb.w / 2;
        text(bn.txt, cx, nb.y + 10, bn.rar >= 7 ? RC[7] : bn.c, "center", bn.rar >= 6 ? 10 : 9);
        text(bn.sub.length > 46 ? bn.sub.slice(0, 45) + "\u2026" : bn.sub, cx, nb.y + 23, "#ffffff", "center", 6);
        if (bn.rar >= 3) for (let i = 0; i < (bn.rar >= 6 ? 14 : 6); i++) { ctx.fillStyle = i % 2 ? "#ffffff" : bn.c; ctx.fillRect(nb.x + Math.random() * nb.w, nb.y + Math.random() * nb.h, 1, 1); }
        ctx.globalAlpha = 1;
      }
      if (g.mode === "dead") {
        ctx.fillStyle = "rgba(20,0,0," + Math.min(0.75, g.deadT * 0.6).toFixed(2) + ")"; ctx.fillRect(0, 0, VW, VH);
        text("YOU DIED", VW / 2, 100, "#ff3030", "center", 22);
        text("Depth " + g.depth + "  \u00b7  Level " + g.lvl + "  \u00b7  " + g.kills + " kills", VW / 2, 128, "#ffffff", "center", 8);
        text("Best depth " + g.best + "  \u00b7  Best level " + g.bestLvl, VW / 2, 144, GOLD, "center", 8);
        text("All gold lost \u00b7 level & gear kept", VW / 2, 160, "#ffb0b0", "center", 8);
        if (g.deadT > 0.8 && Math.floor(g.time * 2) % 2 === 0) text("RESPAWNING...  (tap)", VW / 2, 180, "#ffffff", "center", 10);
      }
    };

    const render = (): void => {
      const g = gRef.current;
      if (!g) return;
      DRAW_T = g.time;
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      ctx.imageSmoothingEnabled = false;
      if (g.mode === "title") drawTitle(g);
      else drawPlay(g);
      if (invRef.current && portRef.current) {
        const pctx = portRef.current.getContext("2d");
        if (pctx) drawBagPortrait(pctx, g.eq);
      }
      if (g.flash > 0) {
        ctx.globalAlpha = Math.min(0.75, g.flash * 1.5);
        ctx.fillStyle = g.flashC; ctx.fillRect(-10, -10, VW + 20, VH + 20);
        ctx.globalAlpha = 1;
      }
    };

    // input
    let cvHold = false;
    const dirFrom = (ev: PointerEvent): number[] => {
      const r = cv.getBoundingClientRect();
      const lx = ((ev.clientX - r.left) / r.width) * VW;
      const ly = ((ev.clientY - r.top) / r.height) * VH;
      const dx = lx - VW / 2, dy = ly - (HUD + VIEWH / 2);
      return stickDir(dx, dy);
    };
    const onDown = (ev: PointerEvent): void => {
      ev.preventDefault();
      ensureAudio();
      try { cv.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      const g = gRef.current;
      if (!g || invRef.current) return;
      if (g.mode !== "play") { startOrRestart(); return; }
      if (g.shopOpen || g.stashOpen || g.gambOpen) return;
      {
        const r = cv.getBoundingClientRect();
        const lx = ((ev.clientX - r.left) / r.width) * VW, ly = ((ev.clientY - r.top) / r.height) * VH;
        if (g.mmBig) { g.mmBig = false; return; }
        if (lx >= mmRect[0] && lx <= mmRect[0] + mmRect[2] && ly >= mmRect[1] && ly <= mmRect[1] + mmRect[3]) { g.mmBig = true; return; }
      }
      const [dx, dy] = dirFrom(ev);
      if (dx === 0 && dy === 0) {
        try { if (g.map[g.hero.y * MW + g.hero.x] === 2 || g.map[g.hero.y * MW + g.hero.x] === TILE_UP || (g.portal && g.portal.x === g.hero.x && g.portal.y === g.hero.y)) useStairsOrPortal(g); else safeAct(g, 0, 0); } catch (err) { console.error("Endless Depths: input error (recovered, run kept)", err); }
        return;
      }
      cvHold = true;
      holdRef.current = { dx, dy, last: performance.now() };
      safeAct(g, dx, dy);
    };
    const onMove = (ev: PointerEvent): void => {
      if (!cvHold || !holdRef.current) return;
      ev.preventDefault();
      const [dx, dy] = dirFrom(ev);
      if (dx === 0 && dy === 0) return;
      holdRef.current.dx = dx; holdRef.current.dy = dy;
    };
    const onUp = (): void => { if (cvHold) { cvHold = false; holdRef.current = null; } };
    const onTouch = (ev: TouchEvent): void => { ev.preventDefault(); };
    const onCtx = (ev: Event): void => { ev.preventDefault(); };
    const onAnyDown = (): void => { ensureAudio(); };
    let lastKey = 0;
    const keyHeld = new Set<string>();
    const chordDir = (): number[] => heldDelta(keyHeld);
    const onKey = (ev: KeyboardEvent): void => {
      const tgt = ev.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "TEXTAREA" || tgt.tagName === "INPUT" || tgt.isContentEditable)) return;
      const g = gRef.current;
      if (!g) return;
      if (quitRef.current) return; // quit confirm open: game keys paused
      const kl = ev.key.toLowerCase();
      const api = apiRef.current;
      if (invRef.current) {
        if (kl === "escape" || kl === "i" || kl === "b" || kl === "tab") { ev.preventDefault(); api?.closeInv(); }
        return;
      }
      if (g.shopOpen) { if (kl === "escape") { ev.preventDefault(); apiRef.current?.closeShop(); } return; }
      if (g.stashOpen) { if (kl === "escape") { ev.preventDefault(); apiRef.current?.closeStash(); } return; }
      // Potion (H) is always available, even while movement keys are held or repeating, and is not gated by the walk throttle.
      if (isPotionKey(ev)) {
        ev.preventDefault();
        ensureAudio();
        if (g.mode !== "play") { startOrRestart(); return; }
        try { usePotion(g); } catch (err) { console.error("Endless Depths: input error (recovered, run kept)", err); }
        return;
      }
      if (isPauseKey(ev)) {
        ev.preventDefault();
        if (g.mode === "play") togglePause();
        return;
      }
      const dd = keyDir(ev);
      const tok = keyTok(ev);
      const handled = !!dd || kl === " " || kl === "." || kl === "enter" || kl === "i" || kl === "b" || kl === "tab" || kl === ">" || kl === "m" || kl === "r" || kl === "n" || kl === "k";
      if (!handled) return;
      ev.preventDefault();
      ensureAudio();
      if (g.mode !== "play") { if (kl === "enter" || kl === " ") startOrRestart(); return; }
      const now = performance.now();
      if (ev.repeat && now - lastKey < 120 / MVMUL) return;
      lastKey = now;
      if (dd) {
        keyHeld.add(tok);
        const cd = chordDir();
        const dx = cd[0], dy = cd[1];
        if (dx !== 0 || dy !== 0) { holdRef.current = { dx, dy, last: now }; publishPad(true, dx, dy, true); safeAct(g, dx, dy); }
      }
      else if (kl === " " || kl === ".") safeAct(g, 0, 0);
      else if (kl === "i" || kl === "b" || kl === "tab") api?.openInv();
      else if (kl === ">" || kl === "enter") { try { useStairsOrPortal(g); } catch (err) { console.error("Endless Depths: input error (recovered, run kept)", err); } }
      else if (kl === "r") { if (castUlt(g)) g.notify(); }
      else if (kl === "n") g.mmBig = !g.mmBig;
      else if (kl === "k") { if (g.mode === "play") toggleWallBreak(g); }
      else if (kl === "m") { mutedRef.current = !mutedRef.current; g.muted = mutedRef.current; setMuted(mutedRef.current); }
    };
    cv.addEventListener("pointerdown", onDown, { passive: false });
    cv.addEventListener("pointermove", onMove, { passive: false });
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("touchstart", onTouch, { passive: false });
    cv.addEventListener("touchmove", onTouch, { passive: false });
    cv.addEventListener("contextmenu", onCtx);
    const onKeyUp = (ev: KeyboardEvent): void => {
      const tok = keyTok(ev);
      if (!keyDir(ev) && !keyHeld.has(tok)) return;
      keyHeld.delete(tok);
      const cd = chordDir();
      if (cd[0] !== 0 || cd[1] !== 0) {
        if (holdRef.current) { holdRef.current.dx = cd[0]; holdRef.current.dy = cd[1]; publishPad(true, cd[0], cd[1]); }
      } else if (holdRef.current && !cvHold) { holdRef.current = null; setPadHeld(""); publishPad(false, 0, 0); }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onAnyDown);
    const saveNow = (): void => { const gg = gRef.current; try { flushPlaySave(gg, true); } catch { /* never block hide/close */ } };
    const onVis = (): void => { if (document.visibilityState === "hidden") saveNow(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", saveNow);
    // Leaving the page: save, and ask the browser for its generic "leave this page?" warning while a run is in progress (where allowed).
    const onBeforeUnload = (ev: BeforeUnloadEvent): void => {
      try {
        saveNow();
        const gg = gRef.current;
        if (gg && gg.mode === "play") { ev.preventDefault(); ev.returnValue = ""; }
      } catch { /* never block unload */ }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    let raf = 0;
    let last = performance.now();
    let errN = 0;
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame); // schedule first so an exception can never stop the loop
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      try { update(dt); } catch (err) { errN++; if (errN < 20) console.error("Endless Depths: update error (recovered, run kept)", err); }
      try { render(); } catch (err) { errN++; if (errN < 20) console.error("Endless Depths: render error (recovered, run kept)", err); ctx.globalAlpha = 1; }
      const gl = gRef.current;
      if (gl && gl.mode !== "title") LIVE = gl;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onUp);
      cv.removeEventListener("touchstart", onTouch);
      cv.removeEventListener("touchmove", onTouch);
      cv.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onAnyDown);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", saveNow);
      window.removeEventListener("beforeunload", onBeforeUnload);
      saveNow();
      if (ac) { void ac.close(); }
    };
  }, []);

  // ---------- inventory view ----------
  const g = gRef.current;
  const playing = !!g && g.mode === "play";
  const locked = g ? g.locked : true;
  const storLine = stor === "checking" ? "Loading saves\u2026" : (stor === "blocked" || viewerBlocksSaving() ? "This viewer blocks saving. Use Save Code and keep a copy — load it the next time you open the game." : (storageEphemeral() || stor === "off" ? "This viewer may forget saves when you close it. Use Save Game, and keep a Save Code as backup." : "Auto-save: ON \u00b7 Save Game writes this profile \u00b7 Save Code is the backup"));
  const onPortal = !!g && playing && !!g.portal && g.portal.x === g.hero.x && g.portal.y === g.hero.y && (portalKind(g) === "camp" || portalKind(g) === "proceed");
  const onUp = !!g && playing && g.map[g.hero.y * MW + g.hero.x] === TILE_UP;
  const onStairs = !!g && playing && (g.map[g.hero.y * MW + g.hero.x] === 2 || onUp || onPortal);
  const canBackUnlocked = !!g && playing && canGoBack(g, true);
  const canBack = canBackUnlocked && !locked;
  const stairsLbl = g && g.area === "camp" ? "Proceed" : (g && g.portal && portalKind(g) === "camp" && onPortal ? "Camp" : (onUp ? "\u25B2 Back" : "\u2B07 Stairs"));
  let selItem: Item | null = null;
  let selBag = -1;
  let selEq: EqKey | null = null;
  if (g && sel) {
    if (sel.startsWith("b#")) { selBag = bagIndexById(g.bag, Number(sel.slice(2))); selItem = selBag >= 0 ? g.bag[selBag] : null; }
    else if (sel.startsWith("gb#")) { const gi = bagIndexById(ensureGemBag(g), Number(sel.slice(3))); selBag = -1; selItem = gi >= 0 ? ensureGemBag(g)[gi] : null; }
    else if (sel.startsWith("e:")) { selEq = sel.slice(2) as EqKey; selItem = g.eq[selEq]; }
  }
  const cur = g ? calc(g.lvl, g.eq) : null;
  const fmt = (v: number): string => (Math.round(v * 10) / 10).toString();
  const doAct = (fn: () => string): void => { const r = fn(); setNote(r); setSel(""); bump(); };

  const statLines = (it: Item): string[] => {
    const out: string[] = [];
    if (it.atk) out.push("Attack +" + it.atk);
    if (it.def) out.push("Defense +" + it.def);
    if (it.block) out.push("Block " + it.block + "%");
    for (const b of Object.keys(it.bonus) as Bonus[]) { const v = it.bonus[b]; if (v !== undefined) out.push(b === "mv" ? "+" + fmt(v) + "% Movement Speed" : "+" + fmt(v) + " " + BNAME[b]); }
    if (it.kind === "pet" && g) out.push(...petLines(it, g.lvl));
    if (wepNeedsEl(it.kind)) out.push(ELN[ensureWepEl(it)] + (it.kind === "beamsword" ? " blade" : " bolt"));
    return out;
  };
  const compare = (it: Item, hand?: "rh" | "lh"): { label: string; val: string; delta: number }[] => {
    if (!g || !cur) return [];
    const nx = calc(g.lvl, simEq(g.eq, it, hand).eq);
    const rows: { label: string; val: string; delta: number }[] = [];
    const p0 = powerTotal(g.lvl, g.eq), p1 = powerTotal(g.lvl, simEq(g.eq, it, hand).eq);
    if (Math.round(p1 - p0) !== 0) rows.push({ label: "Power Level", val: String(Math.round(p1)), delta: Math.round(p1 - p0) });
    for (const [k, label] of STATROWS) {
      const a = cur[k] as number, b = nx[k] as number;
      const dlt = Math.round((b - a) * 10) / 10;
      if (dlt !== 0) rows.push({ label, val: fmt(b), delta: dlt });
    }
    if (it.kind === "pet") { const sim = simEq(g.eq, it, hand).eq; const a = g.eq.pet ? petPower(g.lvl, g.eq.pet) * 100 : 0, b = sim.pet ? petPower(g.lvl, sim.pet) * 100 : 0; const dlt = Math.round(b - a); if (dlt !== 0) rows.push({ label: "Pet shot (% of ATK)", val: Math.round(b) + "%", delta: dlt }); }
    return rows;
  };
  const dr = g && cur ? Math.round((1 - enemyAtkAt(g.depth) / (enemyAtkAt(g.depth) + cur.def)) * 100) : 0;

  const cell = (it: Item | null, key: string, label: string, isSel: boolean, onClick: () => void) => {
    const dlt = (it && g) ? powerDelta(g.lvl, g.eq, it) : 0;
    const equipped = !!(it && g && EQK.some((k: EqKey) => g.eq[k] === it));
    return (
    <button key={key} className={"dc-cell" + (it ? " r" + it.rar : "") + (it && it.ult !== undefined ? " ult" : "") + (it && it.set !== undefined ? " setp" : "") + (isSel ? " sel" : "")} style={{ borderColor: it && it.golden ? GOLD : it && it.set !== undefined ? SET_COL : it && isGem(it) && it.gt !== undefined ? GEMT[it.gt].c : it ? RC[it.rar] : "#2e2840" }} onClick={onClick} aria-label={it ? it.name : label}>
      {it ? <img src={iconURL(it)} alt="" draggable={false} /> : <span className="lb">{label}</span>}
      {it && it.rar >= 7 ? prisArcOverlay() : null}
      {it && it.st && it.st.length > 0 && <span className="dc-stars">{"\u2605" + it.st.length}</span>}
      {it && it.sk && it.sk.length > 0 && <span className="dc-pips">{it.sk.map((z: { c: number; g?: { typ: number; rar: number } }, i: number) => <i key={"p" + i} style={{ background: z.g ? GEMT[z.g.typ].c : "transparent", borderColor: GEMT[z.c].c }} />)}</span>}
      {it && g && <span className="dc-pl">{itemPower(it, g.lvl)}{!equipped && dlt !== 0 ? <span className={dlt > 0 ? "up" : "dn"}>{" " + (dlt > 0 ? "+" : "") + dlt}</span> : null}</span>}
    </button>
    );
  };

  const infoHead = (it: Item) => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <div style={{ width: 46, flex: "none" }}>{cell(it, "ih", "", false, () => undefined)}</div>
      <div>
        <div className={it.golden ? "gn" : it.rar >= 7 ? "pn" : ""} style={{ color: it.golden ? GOLD : it.set !== undefined ? SET_COL : isGem(it) && it.gt !== undefined ? GEMT[it.gt].c : RC[it.rar], fontWeight: 700, fontSize: 13 }}>{it.name + (it.st && it.st.length ? " " + (it.st.length > 5 ? "\u2605" + it.st.length : "\u2605".repeat(it.st.length)) : "")}</div>
        {it.sk && it.sk.length > 0 && <div style={{ display: "flex", gap: 3, marginTop: 3 }}>{it.sk.map((z: { c: number; g?: { typ: number; rar: number } }, i: number) => <span key={"sk" + i} title={GEMT[z.c].n + (z.g ? " · " + GEM_QN[z.g.rar] + " " + GEMT[z.g.typ].n : " (empty)")} style={{ width: 9, height: 9, borderRadius: "50%", background: z.g ? GEMT[z.g.typ].c : "transparent", border: "2px solid " + GEMT[z.c].c, boxShadow: z.g ? "0 0 4px " + GEMT[z.g.typ].c : undefined, display: "inline-block" }} />)}</div>}
        {isGem(it) && it.gt !== undefined && <div style={{ color: GEMT[it.gt].c, fontSize: 11, marginTop: 2 }}>{GEMT[it.gt].d}{it.rar >= 7 ? " Fits any socket." : ""}</div>}
        <div className="dc-sm">{RT[it.rar] + " \u00b7 " + kindLabel(it.kind) + " \u00b7 item level " + it.ilvl}</div>
        {it.set !== undefined && SETS[it.set] && <div style={{ color: SET_COL, fontWeight: 700 }}>{SETS[it.set].n + " set"}</div>}
        {g && <div style={{ color: GOLD, fontWeight: 700, marginTop: 2 }}>{"Power Level " + itemPower(it, g.lvl) + (powerDelta(g.lvl, g.eq, it) ? "  (" + (powerDelta(g.lvl, g.eq, it) > 0 ? "+" : "") + powerDelta(g.lvl, g.eq, it) + " vs equipped)" : "")}</div>}
      </div>
    </div>
  );
  const emptyEq: Eq = { head: null, chest: null, arms: null, legs: null, rh: null, lh: null, pet: null };
  const setBonusUI = (eq: Eq, sid: number) => {
    const stt = setBonusState(eq, sid);
    return (
      <div className="dc-setbon">
        <div className="dc-sethd">{stt.name + "  Set (" + stt.worn + "/4)"}</div>
        <div className={"dc-setline" + (stt.on2 ? " on" : " off")}>{stt.b2}</div>
        <div className={"dc-setline" + (stt.on4 ? " on" : " off")}>{stt.b4}</div>
      </div>
    );
  };
  const info = (it: Item) => (
    <div>
      {infoHead(it)}
      <div style={{ marginTop: 4 }}>{statLines(it).map((s: string, i: number) => <div key={i}>{s}</div>)}</div>
      {(it.st ?? []).map((e: number[], i: number) => <div key={"st" + i} style={{ color: GOLD, marginTop: 2 }}>{"\u2605 " + starName(it, e) + " — " + starDesc(it, e)}</div>)}
      {it.set !== undefined && SETS[it.set] && setBonusUI(g ? g.eq : emptyEq, it.set)}
      {(it.spells ?? []).map((sp: Spell, i: number) => <div key={"sp" + i} style={{ color: ELC[sp.el], marginTop: 2 }}>{"\u2726 " + spellDesc(sp)}</div>)}
      {(it.pas ?? []).map((p: Passive, i: number) => <div key={"pa" + i} style={{ color: ELC[p.el], marginTop: 2 }}>{"\u25c8 " + pasDesc(p)}</div>)}
      {(it.ef ?? []).map((e: number[], i: number) => <div key={"ef" + i} style={{ color: EFX[e[0]] ? EFX[e[0]].c : "#ffffff", marginTop: 2 }}>{"\u2727 " + efDesc(e)}</div>)}
      {it.ult !== undefined && <div className="dc-ultl">{ultDesc(it.ult)}</div>}
      <div style={{ marginTop: 5 }}>
        <div className="dc-sm">If equipped:</div>
        {compare(it).length === 0 && <div className="dc-sm">Same totals as now.</div>}
        {compare(it).map((r: { label: string; val: string; delta: number }) => (
          <div key={r.label} className="dc-row"><span>{r.label}</span><span>{r.val} <b className={r.delta > 0 ? "up" : "dn"}>{r.delta > 0 ? "\u25b2+" : "\u25bc"}{fmt(r.delta)}</b></span></div>
        ))}
      </div>
    </div>
  );

  const btn = { fontFamily: theme.font.family };

  try {
  return (
    <div className="dc-root" style={{ background: theme.bg.base, color: theme.text.primary, fontFamily: theme.font.family, overflow: "hidden", touchAction: "none", padding: 0, userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent" }}>
      <style>{CSS}</style>
      <div className="dc-wrap">
        <div className="dc-stage">
          <canvas ref={cvRef} tabIndex={0} className="dc-cv" />
          {g && g.paused && g.mode === "play" && (
            <div className="dc-pauseov" role="dialog" aria-label="Paused" onClick={togglePause} style={{ cursor: "pointer" }}>
              <b>PAUSED</b>
              <div className="dc-sm">Tap here or press P to resume</div>
            </div>
          )}
          {!inv && !ioOpen && !(g && (g.shopOpen || g.stashOpen || g.gambOpen)) && (
            <button className="dc-quit" style={{ display: g && g.mode !== "title" ? undefined : "none" }} onClick={askQuit} aria-label="Quit to title" title="Quit">{"\u2715"}</button>
          )}
          {!inv && !ioOpen && !(g && (g.shopOpen || g.stashOpen || g.gambOpen)) && (
            <button className={"dc-lock" + (locked ? " on" : "")} onClick={toggleLock} aria-label={locked ? "Save and Load are locked - tap to unlock" : "Save and Load are unlocked - tap to lock"} title={locked ? "Save/Load locked" : "Save/Load unlocked"}>{locked ? "\ud83d\udd12" : "\ud83d\udd13"}</button>
          )}
          {!inv && !ioOpen && !(g && (g.shopOpen || g.stashOpen || g.gambOpen)) && g && g.mode === "play" && (
            <button className={"dc-wbrk" + (g.wallBreak ? " on" : "")} onClick={() => { const gg = gRef.current; if (!gg) return; toggleWallBreak(gg); bump(); }} aria-label={g.wallBreak ? "Wall Breaker on - tap to turn off" : "Wall Breaker off - tap to turn on"} title={g.wallBreak ? "Wall Breaker on (K)" : "Wall Breaker off (K)"}>{"\u26CF"}</button>
          )}
          {profOpen && (
            <div className="dc-profs" role="dialog" aria-modal="true" aria-label="Choose profile">
              <div className="dc-profs-card">
                <div className="dc-profs-hd">Choose a profile</div>
                {stor === "checking" && <div className="dc-sm" style={{ textAlign: "center", marginBottom: 8 }}>Loading saves…</div>}
                <div className="dc-profs-list">
                  {PROFILES.map((p: { id: ProfId; name: string }) => {
                    const s = profSummary(p.id);
                    const line = s.empty ? "Empty — new game or LOAD a code" : ("Lv " + s.lvl + "  ·  Depth " + s.depth);
                    const when = s.empty ? "" : ("saved " + fmtProfTime(s.t));
                    return (
                      <button key={p.id} className="dc-b dc-prof" style={btn} disabled={stor === "checking" || !storageReady} onClick={() => pickProf(p.id)}>
                        <b>{p.id + ". " + p.name}</b>
                        <span className="dc-sm">{line}</span>
                        {when ? <span className="dc-prof-time">{when}</span> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="dc-stor-rpt" style={{ width: "100%", marginTop: 8, fontSize: 11, opacity: 0.85, textAlign: "center", lineHeight: 1.35 }}>{storageReportLine()}</div>
                {g && g.mode === "play" && <button className="dc-b" style={{ ...btn, marginTop: 10, width: "100%" }} onClick={() => setProfOpen(false)}>Cancel</button>}
              </div>
            </div>
          )}
          {g && g.mode === "title" && (
            <div className="dc-title">
              {titleNote && <div className="dc-tn">{titleNote}</div>}
              {confirmNew ? (
                <div className="dc-conf">
                  <div>Start a new game? This overwrites your saved run.</div>
                  <div className="dc-tb">
                    <button className="dc-b go" style={btn} onClick={beginNew}>Yes, new game</button>
                    <button className="dc-b" style={btn} onClick={() => setConfirmNew(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="dc-tb">
                  {hasSave() && <button className="dc-b go" style={btn} onClick={continueRun}>{"\u25b6 Continue"}</button>}
                  <button className="dc-b" style={btn} onClick={newClick}>{"\u2726 New Game"}</button>
                  <button className="dc-b" style={btn} onClick={openProfiles}>Profiles</button>
                  <button className={"dc-b" + (!hasSave() ? " go" : "")} style={btn} disabled={locked && hasSave()} onClick={openLoad}>{(locked && hasSave() ? "\ud83d\udd12" : "\ud83d\udcc2") + " LOAD code"}</button>
                  {!hasSave() && <div className="dc-sm" style={{ width: "100%", textAlign: "center", marginTop: 6 }}>{"No save on this profile yet. Paste a Save Code with LOAD, or start a New Game."}</div>}
                  <div className={"dc-st " + stor} style={{ width: "100%" }}>{storLine}</div>
                </div>
              )}
            </div>
          )}
          {g && g.shopOpen && g.merchant && cur && (() => {
            const shop = ensureChestTypes(g);
            const odds = merchRarOdds(g.depth, true);
            const gl = (cost: number) => goldLine(cost, g.gold, "price");
            return (
              <div className="dc-shopw" onPointerDown={(ev: { target: unknown; currentTarget: unknown }) => { if (ev.target === ev.currentTarget) closeShop(); }} role="dialog" aria-modal="true" aria-label="Chest Merchant">
                <div className="dc-inv dc-shop" onPointerDown={(ev: { stopPropagation: () => void }) => ev.stopPropagation()}>
                  <div className="dc-shop-hd">
                    <div>
                      <b style={{ fontSize: 14 }}>{"Chest Merchant \u00b7 Camp"}</b>
                      <div className="dc-shop-gold">{"Your gold: " + fmtg(g.gold)}</div>
                    </div>
                    <button className="dc-leave" onClick={closeShop} aria-label="Leave merchant">{"\u2715 Close"}</button>
                  </div>
                  <div className="dc-shop-bd">
                    <div className="dc-sm">{MERCH_SHOP_BLURB}</div>
                    <div className="dc-sm" style={{ marginTop: 6 }}>Odds at depth {g.depth}:</div>
                    <table className="dc-merch-odds">
                      <tbody>
                        {RT.map((n: string, i: number) => (
                          <tr key={n} className={i >= 3 ? "hi" : ""}>
                            <td style={{ color: RC[i] }}>{n}</td>
                            <td>{(odds[i] * 100).toFixed(odds[i] >= 0.01 ? 1 : 2) + "%"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="dc-sm">Each open follows the same star and socket rules as an act-boss drop, within drop caps. Gems have no sockets or stars.</div>
                    {shopNote && <div style={{ color: "#ffd080", margin: "6px 0" }}>{shopNote}</div>}
                    {merchSubId && (merchSubId === "oneHand" || merchSubId === "twoHand") ? (
                      <div className="dc-merch-list">
                        <div className="dc-row" style={{ margin: "6px 0" }}>
                          <button className="dc-b" style={btn} onClick={() => setMerchSubId(null)}>{"Back to chests"}</button>
                        </div>
                        <div className="dc-sm"><b>{MERCH_LAB[merchSubId] + " — pick a type"}</b></div>
                        <div className="dc-sm">{MERCH_SUB_TIP}</div>
                        {merchSubtypes(merchSubId).map((k: WT) => {
                          const deal = chestTypeDeal(g, merchSubId, k);
                          const ln = gl(deal.price);
                          const last = !!(g.merchSub && g.merchSub[merchSubId] === k);
                          return (
                            <div key={k} className="dc-merch-row">
                              <div>
                                <img className="dc-merch-ico" src={merchIconURL(k)} alt="" width={44} height={44} draggable={false} />
                                <div>
                                <div className="dc-merch-lab">{merchKindLabel(k) + (last ? " \u00b7 last pick" : "")}</div>
                                <div className={"dc-merch-price" + (ln.bad ? " no" : "")}>{ln.t}</div>
                                </div>
                              </div>
                              <button className="dc-b go" style={btn} disabled={!!g.chestReveal || g.gold < deal.price} onClick={() => { setShopNote(merchBuy(g, merchSubId, k)); bump(); }}>{"Buy"}</button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                    <div className="dc-merch-list">
                      {MERCH_IDS.map((id: MerchId) => {
                        const wep = isWepMerch(id);
                        const rng = chestTypeRange(g, id);
                        const deal = wep ? null : chestTypeDeal(g, id);
                        const ln = gl(wep ? rng.lo : (deal as ChestDeal).price);
                        const last = wep && g.merchSub && g.merchSub[id as "oneHand" | "twoHand"] ? merchKindLabel(g.merchSub[id as "oneHand" | "twoHand"] as Kind) : "";
                        const priceTxt = wep && rng.lo !== rng.hi ? ("From " + fmtg(rng.lo)) : ln.t;
                        return (
                          <div key={id} className="dc-merch-row">
                            <div>
                              <img className="dc-merch-ico" src={merchIconURL(isWepMerch(id) && g.merchSub && g.merchSub[id as "oneHand" | "twoHand"] ? (g.merchSub[id as "oneHand" | "twoHand"] as string) : id)} alt="" width={44} height={44} draggable={false} />
                              <div>
                              <div className="dc-merch-lab">{MERCH_LAB[id] + " chest"}</div>
                              <div className={"dc-merch-price" + (ln.bad ? " no" : "")}>{priceTxt + (last ? "  \u00b7  Last: " + last : "")}</div>
                              </div>
                            </div>
                            <button className="dc-b go" style={btn} disabled={!!g.chestReveal || (!wep && g.gold < (deal as ChestDeal).price)} onClick={() => { if (wep) setMerchSubId(id); else { setShopNote(merchBuy(g, id)); bump(); } }}>{wep ? "Choose type" : "Buy"}</button>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                  <div className="dc-shop-ft">
                    <button className="dc-leave dc-leave-wide" onClick={closeShop} disabled={!!(g.chestReveal && g.chestReveal.phase !== "show")}>Leave Merchant</button>
                  </div>
                  {g.chestReveal && (() => {
                    const rv = g.chestReveal!;
                    const it = rv.it;
                    const title = merchRarTitle(it);
                    const col = it.golden ? GOLD : it.set !== undefined ? SET_COL : RC[it.rar];
                    const open = rv.phase === "open";
                    return (
                      <div className="dc-reveal" onPointerDown={(ev: { stopPropagation: () => void }) => { ev.stopPropagation(); if (rv.phase === "show") { dismissChestReveal(g); bump(); } }} role="dialog" aria-modal="true" aria-label="Chest reward">
                        <div className="dc-reveal-card" onPointerDown={(ev: { stopPropagation: () => void }) => ev.stopPropagation()}>
                          {open ? (
                            <div>
                              <img className="dc-reveal-chest" src={merchIconURL(rv.sku || it.kind, 1)} alt="" width={96} height={96} draggable={false} />
                              <div className="dc-reveal-hint">The chest opens…</div>
                            </div>
                          ) : (
                            <div onPointerDown={() => { dismissChestReveal(g); bump(); }}>
                              <div className="dc-reveal-rar" style={{ color: col }}>{title}</div>
                              {it.rar >= 7 ? (
                                <div className="dc-prisbox">
                                  <img className="dc-reveal-ico" src={iconURL(it)} alt="" width={96} height={96} draggable={false} />
                                  {prisArcOverlay()}
                                </div>
                              ) : (
                                <img className="dc-reveal-ico" src={iconURL(it)} alt="" width={96} height={96} draggable={false} />
                              )}
                              <div className="dc-reveal-name" style={{ color: col }}>{it.name + (it.st && it.st.length ? " " + starBadge(it) : "")}</div>
                              <div className="dc-sm">{RT[it.rar] + " \u00b7 " + kindLabel(it.kind) + " \u00b7 item level " + it.ilvl}</div>
                              <div style={{ marginTop: 6 }}>{statLines(it).map((s: string, i: number) => <div key={i}>{s}</div>)}</div>
                              {(it.st ?? []).map((e: number[], i: number) => <div key={"st" + i} style={{ color: GOLD, marginTop: 2 }}>{"\u2605 " + starName(it, e) + " \u2014 " + starDesc(it, e)}</div>)}
                              {it.set !== undefined && SETS[it.set] && setBonusUI(g.eq, it.set)}
                              {g && <div style={{ color: GOLD, fontWeight: 700, marginTop: 6 }}>{"Power Level " + itemPower(it, g.lvl)}</div>}
                              <div className="dc-reveal-hint">Tap to continue</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}
          {g && g.stashOpen && cur && (() => {
            const carried = Math.max(0, Math.floor(g.gold));
            const banked = bankGoldOf(g);
            const typed = Math.floor(Number(bankAmt));
            const typedOk = isFinite(typed) && typed > 0;
            const dep = (n: number) => { setStashNote(bankDeposit(g, n)); bump(); };
            const wd = (n: number) => { setStashNote(bankWithdraw(g, n)); bump(); };
            return (
              <div className="dc-shopw" onPointerDown={(ev: { target: unknown; currentTarget: unknown }) => { if (ev.target === ev.currentTarget) closeStash(); }} role="dialog" aria-modal="true" aria-label="Bank">
                <div className="dc-inv dc-shop" onPointerDown={(ev: { stopPropagation: () => void }) => ev.stopPropagation()}>
                  <div className="dc-shop-hd">
                    <div>
                      <b style={{ fontSize: 14 }}>{"Bank \u00b7 Gold only"}</b>
                      <div className="dc-shop-gold">{"Carried: " + fmtg(carried) + "  \u00b7  Banked: " + fmtg(banked)}</div>
                    </div>
                    <button className="dc-leave" onClick={closeStash} aria-label="Close bank">{"\u2715 Close"}</button>
                  </div>
                  <div className="dc-shop-bd">
                    <div className="dc-sm">Deposit carried gold or withdraw banked gold. The bank does not store items. Banked gold is safe if you die. Chest Merchant purchases spend carried gold only.</div>
                    {stashNote && <div style={{ color: "#ffd080", margin: "6px 0" }}>{stashNote}</div>}
                    <div className="dc-sm" style={{ marginTop: 8 }}><b>Deposit from carried gold</b></div>
                    <div className="dc-row" style={{ margin: "6px 0", flexWrap: "wrap" }}>
                      <button className="dc-b" style={{ ...btn, minHeight: 40 }} disabled={carried <= 0} onClick={() => dep(Math.floor(carried * 0.1))}>{"10%"}</button>
                      <button className="dc-b" style={{ ...btn, minHeight: 40 }} disabled={carried <= 0} onClick={() => dep(Math.floor(carried * 0.5))}>{"50%"}</button>
                      <button className="dc-b go" style={{ ...btn, minHeight: 40 }} disabled={carried <= 0} onClick={() => dep(carried)}>{"All"}</button>
                    </div>
                    <div className="dc-sm" style={{ marginTop: 8 }}><b>Withdraw from the bank</b></div>
                    <div className="dc-row" style={{ margin: "6px 0", flexWrap: "wrap" }}>
                      <button className="dc-b" style={{ ...btn, minHeight: 40 }} disabled={banked <= 0} onClick={() => wd(Math.floor(banked * 0.1))}>{"10%"}</button>
                      <button className="dc-b" style={{ ...btn, minHeight: 40 }} disabled={banked <= 0} onClick={() => wd(Math.floor(banked * 0.5))}>{"50%"}</button>
                      <button className="dc-b go" style={{ ...btn, minHeight: 40 }} disabled={banked <= 0} onClick={() => wd(banked)}>{"All"}</button>
                    </div>
                    <div className="dc-sm" style={{ marginTop: 8 }}><b>Typed amount</b></div>
                    <div className="dc-row" style={{ margin: "6px 0", flexWrap: "wrap" }}>
                      <input className="dc-ta" style={{ flex: 1, minWidth: 80, minHeight: 40, padding: "4px 8px" }} type="number" min={1} step={1} value={bankAmt} placeholder="Amount" onChange={(e: { target: { value: string } }) => setBankAmt(e.target.value)} aria-label="Bank amount" />
                      <button className="dc-b go" style={{ ...btn, minHeight: 40 }} disabled={!typedOk || carried <= 0} onClick={() => dep(typed)}>{"Deposit"}</button>
                      <button className="dc-b go" style={{ ...btn, minHeight: 40 }} disabled={!typedOk || banked <= 0} onClick={() => wd(typed)}>{"Withdraw"}</button>
                    </div>
                  </div>
                  <div className="dc-shop-ft">
                    <button className="dc-leave dc-leave-wide" onClick={closeStash}>Close Bank</button>
                  </div>
                </div>
              </div>
            );
          })()}
          {ioOpen && (
            <div className="dc-inv dc-io">
              <div className="dc-row" style={{ marginBottom: 6 }}>
                <b style={{ fontSize: 15 }}>{ioMode === "save" ? SAVE_CODE_LBL : "\ud83d\udcc2 LOAD"}</b>
                <button className="dc-b" style={{ ...btn, minHeight: 40, padding: "0 14px" }} onClick={() => setIoOpen(false)}>{"\u2715 Close"}</button>
              </div>
              <div className={"dc-st " + stor} style={{ marginBottom: 6 }}>{storLine}</div>
              {ioMode === "save" ? (
                <div>
                  {ioCode ? (
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{"Your Save Code (" + ioCode.length + " characters):"}</div>
                      <textarea ref={codeRef} className="dc-ta" readOnly value={ioCode} rows={6} onFocus={selectCode} onClick={selectCode} aria-label="Save code" />
                      <button className="dc-b go dc-big" style={btn} onClick={copyCode}>{"\ud83d\udccb COPY CODE"}</button>
                      <div className="dc-sm" style={{ marginTop: 6 }}>{"If Copy doesn't work: long-press the code, tap Select All, then Copy. Paste it into Notes or a message to yourself. To restore: tap LOAD and paste it."}</div>
                    </div>
                  ) : null}
                  {ioNote && <div className="dc-note">{ioNote}</div>}
                  <button className="dc-b dc-big" style={btn} disabled={locked && hasSave()} onClick={openLoad}>{"\ud83d\udcc2 Go to LOAD"}</button>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{"Paste your Save Code here:"}</div>
                  <textarea className="dc-ta" value={loadTxt} rows={6} placeholder="Long-press here and tap Paste (code starts with ED2-)" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => { setLoadTxt(e.target.value); setIoNote(""); }} aria-label="Paste save code" />
                  <button className="dc-b go dc-big" style={btn} disabled={(locked && hasSave()) || !loadTxt.trim()} onClick={() => doImport(loadTxt)}>{"\u2705 LOAD THIS CODE"}</button>
                  <button className="dc-b dc-big" style={btn} onClick={pasteFromClipboard}>{"\ud83d\udce5 Paste from clipboard + load"}</button>
                  {ioNote && <div className="dc-note">{ioNote}</div>}
                  <div className="dc-sm" style={{ marginTop: 6 }}>{"Loading a code replaces the current run. A bad code never deletes anything."}</div>
                </div>
              )}
            </div>
          )}
          {inv && g && cur && (
            <div className="dc-inv">
              <div className="dc-row" style={{ marginBottom: 6 }}>
                <b style={{ fontSize: 14 }}>Hero · Lv {g.lvl}</b>
                <span style={{ color: GOLD }}>{g.gold}g{(g.gems ?? 0) > 0 ? "  \u00b7  " + g.gems + " gems" : ""}</span>
                <button className="dc-b" style={{ ...btn, minHeight: 36, padding: "0 12px" }} onClick={closeInv}>✕ Close</button>
              </div>
              <div className="dc-portw">
                <canvas className="dc-port" ref={portRef} width={bagPortraitMetrics().w} height={bagPortraitMetrics().h} aria-label="Hero, front view, wearing all equipped gear" />
              </div>
              <div className="dc-row" style={{ marginBottom: 6 }}>
                <span className="dc-sm">Equip upgrades automatically on pickup</span>
                <button className={"dc-b" + (g.autoEq ? " go" : "")} style={{ ...btn, minHeight: 32, fontSize: 12, padding: "0 10px" }} onClick={() => { g.autoEq = !g.autoEq; saveGame(g); bump(); }}>{g.autoEq ? "Auto-equip: ON" : "Auto-equip: OFF"}</button>
                <button className={"dc-b" + (g.autoCombine !== false ? " go" : "")} style={{ ...btn, minHeight: 32, fontSize: 12, padding: "0 10px" }} onClick={() => { g.autoCombine = g.autoCombine === false; saveGame(g); bump(); }}>{g.autoCombine !== false ? "Auto-combine: ON" : "Auto-combine: OFF"}</button>
              </div>
              <div className="dc-grid6" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
                {EQK.map((k: EqKey) => cell(g.eq[k], "e" + k, EQL[k], sel === "e:" + k, () => { setSel(g.eq[k] ? "e:" + k : ""); setNote(""); }))}
              </div>
              <div className="dc-sm" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, textAlign: "center", marginTop: 2 }}>
                {EQK.map((k: EqKey) => <span key={"l" + k}>{EQL[k]}</span>)}
              </div>
              {wornSetIds(g.eq).length > 0 && (
                <div className="dc-setlist">
                  {wornSetIds(g.eq).map((sid: number) => <div key={"sbl" + sid}>{setBonusUI(g.eq, sid)}</div>)}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                <span className="dc-chip" style={{ color: "#ff7070" }}>HP {Math.ceil(g.hero.hp)}/{cur.maxHp}</span>
                <span className="dc-chip">XP {g.xp}/{xpNeed(g.lvl)}</span>
                <span className="dc-chip" style={{ color: "#ffb060" }}>ATK {cur.atk}</span>
                <span className="dc-chip" style={{ color: "#80c0ff" }}>DEF {cur.def}</span>
                <span className="dc-chip">Dmg taken -{dr}%</span>
                <span className="dc-chip">Crit {cur.crit}%</span>
                <span className="dc-chip">Dbl {cur.spd}%</span>
                {cur.mv > 0 && <span className="dc-chip" style={{ color: "#80ffc0" }}>Move +{cur.mv}%</span>}
                {cur.block > 0 && <span className="dc-chip">Block {cur.block}%</span>}
                {cur.regen > 0 && <span className="dc-chip" style={{ color: "#60ff80" }}>Regen {cur.regen}/turn</span>}
                {cur.ward > 0 && <span className="dc-chip" style={{ color: "#9ae8ff" }}>Ward {Math.round(g.ward)}/{cur.ward}</span>}
                <span className="dc-chip">Base: {baseHp(g.lvl)} HP, {baseAtk(g.lvl)} ATK (Lv {g.lvl})</span>
              </div>
              {g && (() => { const pb = powerBreak(g.lvl, g.eq); return (
                <div className="dc-pwr">
                  <b>{"Power Level " + pb.total.toLocaleString("en-US")}</b>
                  <div className="dc-sm">{"Level " + g.lvl + " \u00b7 " + pb.level + (pb.set ? "  \u00b7 Set bonuses " + pb.set : "")}</div>
                  {pb.items.map((r: { k: EqKey; n: string; p: number }) => <div key={r.k} className="dc-sm">{EQL[r.k] + ": " + r.n + "  " + r.p}</div>)}
                </div>
              ); })()}
              {g && isTwo(g.eq.rh) && (() => { const reco = compare2Hvs1HPair(g); if (!reco) return null; return (
                <div className="dc-reco">
                  <div>{reco.line}</div>
                  <div className="dc-dbg">{reco.debug}</div>
                </div>
              ); })()}
              {(weaponSpells(g.eq).length > 0 || allPassives(g.eq).length > 0 || EQK.some((k: EqKey) => !!g.eq[k]?.ef)) && (
                <div className="dc-det" style={{ marginTop: 6 }}>
                  <div className="dc-sm">Active spells and passives</div>
                  {weaponSpells(g.eq).map((sp: Spell, i: number) => <div key={"as" + i} style={{ color: ELC[sp.el] }}>{"\u2726 " + sp.ch + "% on hit: " + sp.name}</div>)}
                  {allPassives(g.eq).map((p: Passive, i: number) => <div key={"ap" + i} style={{ color: ELC[p.el] }}>{"\u25c8 " + p.name}</div>)}
                  {EQK.map((k: EqKey) => (g.eq[k]?.ef ?? []).map((e: number[], i: number) => <div key={"ae" + k + i} style={{ color: EFX[e[0]] ? EFX[e[0]].c : "#fff" }}>{"\u2727 " + (EFX[e[0]] ? EFX[e[0]].n : "")}</div>))}
                </div>
              )}
              {selItem && (
                <div className="dc-det">
                  {infoHead(selItem)}
                  <div style={{ marginTop: 4 }}>{statLines(selItem).map((s: string, i: number) => <div key={i}>{s}</div>)}</div>
                  {(selItem.st ?? []).map((e: number[], i: number) => <div key={"st" + i} style={{ color: GOLD, marginTop: 2 }}>{"\u2605 " + starName(selItem, e) + " — " + starDesc(selItem, e)}</div>)}
                  {selItem.sk && selItem.sk.length > 0 && <div style={{ marginTop: 6 }}>
                    <div className="dc-sm">Sockets (color must match; Prismatic gems fit any):</div>
                    {selItem.sk.map((z: { c: number; g?: { typ: number; rar: number } }, si: number) => (
                      <div key={"skui" + si} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <span style={{ width: 12, height: 12, borderRadius: "50%", background: z.g ? GEMT[z.g.typ].c : "transparent", border: "2px solid " + GEMT[z.c].c, flex: "none" }} />
                        <span style={{ color: GEMT[z.c].c, fontSize: 11, flex: 1 }}>{z.g ? (GEM_QN[z.g.rar] + " " + GEMT[z.g.typ].n) : (GEMT[z.c].n + " socket (empty)")}</span>
                        {z.g && <button className="dc-b" style={{ ...btn, minHeight: 32, fontSize: 11, padding: "0 8px" }} onClick={() => doAct(() => unsocketGem(g, selItem, si))}>Unsocket</button>}
                        {!z.g && ensureGemBag(g).some((it: Item) => isGem(it) && gemFitsSocket(it, z.c)) && (
                          <select defaultValue="" style={{ minHeight: 32, fontSize: 11, background: "#1a1626", color: "#fff", border: "1px solid #555", borderRadius: 6 }} onChange={(ev: { target: { value: string } }) => { const id = Number(ev.target.value); ev.target.value = ""; if (!isFinite(id)) return; doAct(() => { const gb = ensureGemBag(g); const bi = bagIndexById(gb, id); const gem = bi >= 0 ? gb[bi] : undefined; if (!gem) return ""; const r = socketGem(selItem, si, gem); if (r.indexOf("Socketed") === 0) gb.splice(bi, 1); return r; }); }}>
                            <option value="">Socket a gem...</option>
                            {ensureGemBag(g).map((it: Item) => isGem(it) && gemFitsSocket(it, z.c) ? <option key={it.id} value={it.id}>{it.name}</option> : null)}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>}
                  {isGem(selItem) && selItem.gt !== undefined && <div style={{ color: GEMT[selItem.gt].c, marginTop: 4 }}>{GEMT[selItem.gt].d}{selItem.rar >= 7 ? " Fits any socket color." : " Fits " + GEMT[selItem.gt].n + " sockets only."}</div>}
                  {selItem.set !== undefined && SETS[selItem.set] && setBonusUI(g.eq, selItem.set)}
                  {(selItem.spells ?? []).map((sp: Spell, i: number) => <div key={"sp" + i} style={{ color: ELC[sp.el], marginTop: 2 }}>{"\u2726 " + spellDesc(sp)}</div>)}
                  {(selItem.pas ?? []).map((p: Passive, i: number) => <div key={"pa" + i} style={{ color: ELC[p.el], marginTop: 2 }}>{"\u25c8 " + pasDesc(p)}</div>)}
                  {(selItem.ef ?? []).map((e: number[], i: number) => <div key={"ef" + i} style={{ color: EFX[e[0]] ? EFX[e[0]].c : "#ffffff", marginTop: 2 }}>{"\u2727 " + efDesc(e)}</div>)}
                  {selItem.ult !== undefined && <div className="dc-ultl">{ultDesc(selItem.ult)}</div>}
                  {!isArmor(selItem.kind) && selItem.kind !== "pet" && selItem.kind !== "gem" && <div className="dc-sm" style={{ marginTop: 3 }}>{WI[selItem.kind as WT].note}</div>}
                  {selBag >= 0 && (() => {
                    const it = selItem;
                    if (!it) return null;
                    const rows = compare(it);
                    return (
                      <div style={{ marginTop: 5 }}>
                        <div className="dc-sm">If equipped{!isArmor(it.kind) && it.kind !== "shield" && it.kind !== "pet" && it.kind !== "gem" && !(WI[it.kind as WT] && WI[it.kind as WT].two) ? " (right hand)" : ""}:</div>
                        {rows.length === 0 && <div className="dc-sm">Same totals as now.</div>}
                        {rows.map((r: { label: string; val: string; delta: number }) => (
                          <div key={r.label} className="dc-row"><span>{r.label}</span><span>{r.val} <b className={r.delta > 0 ? "up" : "dn"}>{r.delta > 0 ? "\u25b2+" : "\u25bc"}{fmt(r.delta)}</b></span></div>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="dc-act">
                    {selBag >= 0 && <button className="go" style={btn} onClick={() => doAct(() => equip(g, selBag))}>Equip</button>}
                    {selBag >= 0 && isOneHand(selItem) && <button style={btn} onClick={() => doAct(() => equip(g, selBag, "lh"))}>Equip Offhand</button>}
                    {selBag >= 0 && <button className="bad" style={btn} onClick={() => doAct(() => { const it = g.bag[selBag]; if (!it) return ""; const gems = popSocketGems(it); const v = salvageVal(it); g.bag.splice(selBag, 1); g.gold += v; for (const gem of gems) placeGem(g, gem, g.hero.x, g.hero.y); g.sfx("coin"); runAutoCombine(g); return "Salvaged for " + v + "g."; })}>Salvage +{salvageVal(selItem)}g</button>}
                    {sel.startsWith("gb#") && selItem && isGem(selItem) && <button className="bad" style={btn} onClick={() => doAct(() => { const gb = ensureGemBag(g); const gi = bagIndexById(gb, Number(sel.slice(3))); const it = gi >= 0 ? gb[gi] : undefined; if (!it) return ""; const v = salvageVal(it); gb.splice(gi, 1); g.gold += v; g.sfx("coin"); return "Salvaged for " + v + "g."; })}>Salvage +{salvageVal(selItem)}g</button>}
                    {selBag >= 0 && selItem && polishCost(selItem) > 0 && <button style={btn} disabled={(g.gems ?? 0) < polishCost(selItem)} onClick={() => doAct(() => polishItem(g, selBag))}>Polish {(selItem.st ? selItem.st.length : 0) + 1}{"\u2605"} ({polishCost(selItem)} gems)</button>}
                    {selEq && <button style={btn} onClick={() => { const k = selEq; if (k) doAct(() => unequip(g, k)); }}>Unequip</button>}
                  </div>
                </div>
              )}
              {note && <div style={{ color: "#ffd080", margin: "5px 0" }}>{note}</div>}
              <div className="dc-row" style={{ margin: "8px 0 4px" }}>
                <button className="dc-b go" style={{ ...btn, minHeight: 38, fontSize: 12, fontWeight: 800 }} disabled={locked} onClick={saveToProfile}>{SAVE_GAME_LBL}</button>
                <button className="dc-b" style={{ ...btn, minHeight: 38, fontSize: 12 }} disabled={locked} onClick={showSaveCode}>{SAVE_CODE_LBL}</button>
                <button className="dc-b" style={{ ...btn, minHeight: 38, fontSize: 12 }} disabled={locked} onClick={openLoad}>{(locked ? "\ud83d\udd12" : "\ud83d\udcc2") + " LOAD code"}</button>
                <button className="dc-b" style={{ ...btn, minHeight: 38, fontSize: 12 }} onClick={openProfiles}>Profiles</button>
              </div>
              <div className={"dc-st " + stor} style={{ margin: "2px 0 4px" }}>{storLine}</div>
              <div className="dc-row" style={{ margin: "4px 0", flexWrap: "wrap" }}>
                <b>Bag {g.bag.length}/{g.bagCap ?? BAG}</b>
                <button className="dc-b bad dc-ms" style={{ ...btn, minHeight: 34, fontSize: 12 }} disabled={!bagHasMassSalvage(g)} onClick={() => { if (bagHasMassSalvage(g)) setConfirmMS(true); }}>Mass Salvage</button>
                <button className="dc-b bad dc-ms" style={{ ...btn, minHeight: 34, fontSize: 12 }} disabled={!bagHasLowSalvage(g)} onClick={() => { if (bagHasLowSalvage(g)) setConfirmSL(true); }}>Salvage Low</button>
                <button className="dc-b" style={{ ...btn, minHeight: 34, fontSize: 12 }} disabled={g.gold < potionCost(g.depth)} onClick={() => doAct(() => { if (g.gold < potionCost(g.depth)) return ""; g.gold -= potionCost(g.depth); g.potions++; g.sfx("coin"); return "Bought a potion."; })}>Buy potion {potionCost(g.depth)}g</button>
              </div>
              <div className="dc-grid6">
                {Array.from({ length: g.bagCap ?? BAG }, (_: unknown, i: number) => cell(g.bag[i] ?? null, "b" + (g.bag[i] ? g.bag[i].id : "e" + i), "", !!(g.bag[i] && sel === "b#" + g.bag[i].id), () => { if (g.bag[i]) { setSel("b#" + g.bag[i].id); setNote(""); } }))}
              </div>
              <div className="dc-row" style={{ margin: "10px 0 4px" }}>
                <b>Gem bag {ensureGemBag(g).length}/{g.gemCap ?? GEM_BAG}</b>
              </div>
              <div className="dc-grid6">
                {Array.from({ length: g.gemCap ?? GEM_BAG }, (_: unknown, i: number) => cell(ensureGemBag(g)[i] ?? null, "gb" + (ensureGemBag(g)[i] ? ensureGemBag(g)[i].id : "e" + i), "", !!(ensureGemBag(g)[i] && sel === "gb#" + ensureGemBag(g)[i].id), () => { if (ensureGemBag(g)[i]) { setSel("gb#" + ensureGemBag(g)[i].id); setNote(""); } }))}
              </div>
              <div className="dc-sm" style={{ marginTop: 6 }}>Tap an item to inspect, compare (green = better, red = worse), equip or salvage for gold. Gems live in the gem bag and auto-combine 3 of the same type and rarity into the next rarity.</div>
            </div>
          )}
          {confirmQuit && (
            <div className="dc-msw dc-qw" role="dialog" aria-modal="true">
              <div className="dc-conf">
                <div>Are you sure you want to quit?</div>
                <div className="dc-tb">
                  <button className="dc-b bad" style={btn} onClick={doQuit}>Yes</button>
                  <button className="dc-b" style={btn} onClick={cancelQuit}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {inv && g && confirmMS && (
            <div className="dc-msw" role="dialog" aria-modal="true">
              <div className="dc-conf">
                <div>Are you sure you want to mass salvage all items in your bag? Gems are kept.</div>
                <div className="dc-tb">
                  <button className="dc-b bad" style={btn} onClick={() => { const gg = gRef.current; setConfirmMS(false); if (!gg) return; doAct(() => { const r = massSalvage(gg); return r.n ? "Mass salvaged " + r.n + " item" + (r.n === 1 ? "" : "s") + " for +" + r.gold + "g. (saved)" : "Nothing to salvage."; }); }}>Yes</button>
                  <button className="dc-b" style={btn} onClick={() => setConfirmMS(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {inv && g && confirmSL && (
            <div className="dc-msw" role="dialog" aria-modal="true">
              <div className="dc-conf">
                <div>Are you sure you want to salvage all Gray, Magic, and Rare armor, weapons, and shields in your bag?</div>
                <div className="dc-tb">
                  <button className="dc-b bad" style={btn} onClick={() => { const gg = gRef.current; setConfirmSL(false); if (!gg) return; doAct(() => { const r = lowSalvage(gg); return r.n ? "Salvaged low " + r.n + " item" + (r.n === 1 ? "" : "s") + " for +" + r.gold + "g. (saved)" : "Nothing to salvage."; }); }}>Yes</button>
                  <button className="dc-b" style={btn} onClick={() => setConfirmSL(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="dc-util">
          <button className="dc-b" style={btn} disabled={!playing} onClick={() => (inv ? closeInv() : openInv())}>{"\ud83c\udfab"} Bag{g ? " " + g.bag.length : ""}</button>
          <button className={"dc-b" + (onStairs ? " hot" : "")} style={btn} disabled={!onStairs || (onUp && !canBack)} onClick={stairs}>{stairsLbl}</button>
          <button className="dc-b" style={btn} disabled={!canBack} onClick={() => { const gg = gRef.current; if (gg) goBack(gg, false); bump(); }} aria-label={locked ? "Go back a floor (locked)" : "Go back a floor"}>{(locked ? "\ud83d\udd12" : "\u25B2") + " Back"}</button>
          <button className="dc-b" style={btn} onClick={toggleMute}>{muted ? "\ud83d\udd07" : "\ud83d\udd0a"}</button>
          <button className="dc-b" style={btn} onClick={toggleMusic}>{musicOn ? "\u266b On" : "\u266b Off"}</button>
        </div>
        <div className="dc-ctrl">
          <div className="dc-padcol">
          <div
            ref={stickRef}
            className={"dc-stick" + (padHeld ? " held" : "") + (locked ? " locked" : "")}
            role="application"
            aria-label={locked ? "Move stick (locked)" : "Move stick"}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={stickDown}
            onPointerMove={stickMove}
            onPointerUp={(ev: { pointerId: number; currentTarget?: { hasPointerCapture?: (id: number) => boolean } }) => stickRelease(ev, "up")}
            onPointerLeave={(ev: { pointerId: number; currentTarget?: { hasPointerCapture?: (id: number) => boolean } }) => stickRelease(ev, "leave")}
            onPointerCancel={(ev: { pointerId: number; currentTarget?: { hasPointerCapture?: (id: number) => boolean } }) => stickRelease(ev, "cancel")}
          >
            <div className="dc-stick-base" />
            <div className="dc-stick-knob" style={{ transform: "translate(" + stickKnob.x + "px," + stickKnob.y + "px)" }} />
            {locked ? <div className="dc-stick-lock" aria-hidden="true">{"\ud83d\udd12"}</div> : null}
          </div>
          <div className="dc-saveload">
            <button className={"dc-b dc-savegame" + (locked ? "" : " go")} style={btn} disabled={locked || !g || g.mode === "title"} onClick={saveToProfile} aria-label={SAVE_GAME_LBL}>{SAVE_GAME_LBL}</button>
            <button className="dc-b" style={btn} disabled={locked} onClick={showSaveCode} aria-label={SAVE_CODE_LBL}>{SAVE_CODE_LBL}</button>
            <button className="dc-b" style={btn} disabled={locked} onClick={openLoad} aria-label={locked ? "Load (locked)" : "Load"}>{locked ? "\ud83d\udd12 LOAD" : "\ud83d\udcc2 LOAD"}</button>
            <button className="dc-b" style={btn} onClick={openProfiles} aria-label="Profiles">Profiles</button>
          </div>
          </div>
          <div className="dc-actions">
            <button className="dc-b" style={btn} disabled={!playing || !g || g.potions <= 0} onPointerDown={(ev: { button?: number; preventDefault?: () => void; stopPropagation?: () => void }) => { ev.preventDefault?.(); ev.stopPropagation?.(); if (!potionPointerShouldFire(ev)) return; potionPtrAt.current = performance.now(); potion(); }} onClick={() => { if (potionClickIsDuplicate(performance.now(), potionPtrAt.current)) return; potion(); }}>{"\ud83e\uddea"} Potion {g ? g.potions : 0}</button>
          {g && g.mode === "play" && ultsOf(g.eq).length > 0 && (
            <div className="dc-ults">
              {(() => {
                const left = Math.max(0, fusedUltReadyAt(g) - Date.now());
                const ready = left <= 0;
                const frac = 1 - left / ULT_CD;
                const lab = ultBtnLabel(g);
                const sz = ultBtnSize(typeof window !== "undefined" ? window.innerWidth : 390, typeof window !== "undefined" ? window.innerHeight : 844);
                return (
                  <button className={"dc-b dc-ult" + (ready ? " rdy" : "")} style={{ ...btn, width: sz.w, height: sz.h, minWidth: sz.w, minHeight: sz.h, padding: 2, fontSize: 11, background: ready ? undefined : "conic-gradient(#ffd840 " + Math.round(frac * 360) + "deg, #2a2438 0deg)" }} disabled={!playing || !ready} onClick={() => { const gg = gRef.current; if (gg && castUlt(gg)) bump(); }} aria-label={lab} title={lab}>
                    <span className="dc-ultn">{ultBtnName(g)}</span>
                    <span className="dc-ultm">{ready ? ultMulText(g) : ultCdText(left)}</span>
                  </button>
                );
              })()}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
  } catch (err) {
    // A UI bug must never remount the game: keep the canvas mounted at the same tree position and offer a way out.
    console.error("Endless Depths: UI error (recovered, run kept)", err);
    return (
      <div className="dc-root" style={{ background: theme.bg.base, color: theme.text.primary, fontFamily: theme.font.family, overflow: "hidden", touchAction: "none", padding: 0 }}>
        <style>{CSS}</style>
        <div className="dc-wrap">
          <div className="dc-stage">
            <canvas ref={cvRef} tabIndex={0} className="dc-cv" />
          </div>
          <div className="dc-btns">
            <button className="dc-b" style={btn} onClick={() => { const gg = gRef.current; if (gg) { gg.shopOpen = false; gg.stashOpen = false; gg.gambOpen = false; saveGame(gg, true); } setIoOpen(false); closeInv(); bump(); }}>Close menu (game kept)</button>
          </div>
        </div>
      </div>
    );
  }
}
