# Workbook data-only card batch — 3 November 2026

**Current blocker status:** see [the current card blocker ledger](card-blockers-current.md). Tables and verification counts below describe their original delivery snapshots.

**Historical batch:** the later [shared-query enhancement](card-query-architecture.md) adds five more cards and fixes the color/name/mandatory-selection blockers identified here. Current in-scope definition coverage is 68 of 142 rows, leaving 74 deferred; counts below preserve this earlier ten-card batch.

This implementation follows the owner’s restriction to existing engine behavior and their later exclusion of **BP01, 虛界靈 and 雙色補充包**. Existing definitions from those sheets remain unchanged. Source: local ignored `tem/六界之峰.xlsx`, SHA-256 `27b91d995e22fb8540a04c78a73d41f64daa08b216b275aceb1f282723a64d7d`. No workbook file is needed at runtime.

## Result

Ten new canonical definitions are registered in the shared catalog. The six included sheets have 142 named rows: 53 already had matching definitions, 10 are added here, and 79 remain deferred. Definition coverage is not a claim of complete fidelity for the older cards. The full catalog grows from 79 to 89 definitions, including development fixtures.

| Included sheet | Named rows | Definitions before | Added | Still missing |
|---|---:|---:|---:|---:|
| 炎獸 | 24 | 24 | 0 | 0 |
| 幻影木偶 | 23 | 5 | 1 | 17 |
| 風獸 | 23 | 9 | 1 | 13 |
| 冰龍 | 25 | 2 | 2 | 21 |
| 上使 | 23 | 3 | 6 | 14 |
| 蒼巨人 | 24 | 10 | 0 | 14 |

| New card | Canonical ID | Behavior |
|---|---|---|
| 影木劍 | shadowwood-sword | Phantom-puppet equipment, +1 attack, attack permanently reduces one opposing creature’s maximum life by 1. |
| 生機木杖 | vitality-wood-staff | Unrestricted equipment, +2 attack; optional entry decision discards the entire hand and draws the opponent’s current hand count. |
| 冰霜巨人 | frost-giant | 8/8 frost giant, three cold plus two generic mana. |
| 冰霜之魂 | frost-soul | Optional entry draw if a friendly ice-dragon creature has an Aurora counter. |
| 天域巡邏兵 | heavenly-patrol | Draw once per turn when 天使皇 亞拉里亞 receives charge counters. |
| 天域門衛 | heavenly-gatekeeper | Block and own-destruction triggers, each gaining one life before drawing one. Sacrifice does not count as destruction. |
| 天域長槍 | heavenly-lance | Unrestricted equipment, +1 attack, host attacks to gain one life then draw. |
| 吞雷聖劍 | thunder-devouring-holy-sword | 上使 equipment, +2 attack, host attacks to gain three life then draw. |
| 天域之門 | heavenly-gate | Entry gains one life then draws; main-phase battlefield sacrifice or hand discard produces one yellow mana immediately. |
| 天域三侯 萊拉 | heavenly-marquis-laila | Instant activated ability counters an opposing spell, then exiles this incarnation of the source. |

## Confirmed interpretations

- The owner explicitly chose generic/colorless payment for the printed 兵 symbol **for now**. Only 冰霜巨人 is added; 霜月門衛 remains blocked by its equipment-counter rule.
- Unqualified creature life reduction means **permanent maximum-life reduction**. 影木劍 uses a persistent characteristic change, not marked damage. The change survives turn cleanup and the weapon leaving, and ends when the affected creature changes zones.
- 生機木杖 grants **+2 attack**. Its hand exchange is one optional branch, including when the controller has no cards left to discard.
- 天域之門 has two mana routes, as clarified by the owner: sacrifice it from the battlefield, or discard it from hand, during a main phase. Battlefield sacrifice emits neither hand-discard nor destruction events; hand discard emits a real hand-discard event and gives no entry reward. This exception is local to this card; ask again for another occurrence.
- Unspecified special-summon origins are **deferred**, not presumed to mean hand, library or graveyard.

The `aurora` and `charge` strings are authored counter keys. 冰霜之魂 only observes Aurora counters; it does not implement the counter’s damage-prevention rules. 天域巡邏兵 observes the named emperor; that emperor is not newly implemented. Their positive conditional paths are tested with explicit board fixtures. A naturally playable Aurora/emperor support package still requires the separate mechanics work listed below.

## Engine boundary and verification

Only card JSON, its explicit manifest, tests and documentation change. Existing action handlers, timing, targeting schemas, damage, counter semantics, deck rules, default decks and presets are preserved. Tests retain the original 79-card catalog hash against an explicit original-ID list, so adding cards does not erase the earlier preservation check.

The gate’s hand route uses an ordered ADD_MANA effect with the existing immediate hand-activation support. This exposes it as an ordinary hand action and resolves without adding a stack object. Activate it before casting the card it will fund; the existing automatic mana-payment selection enumerates battlefield sources only. The battlefield route remains the existing mana action.

Focused logic tests exercise actual casting, payment, attachment, attack/block/destruction triggers, optional branch resolution, effect order, counter filtering/turn reset, spell countering, persistent life reduction and zone changes. Shared catalog/deck validation checks the new cards are available to normal deck and scenario consumers. No browser smoke test, long socket test or full test suite is part of this batch.

**Verified:** 179 checks passed across eight focused files (new workbook batch, existing workbook consumers, equipment, countering, bounded reveal, card factory, deck/scenario validation and import boundaries). The separately selected configuration-preservation check also passed, retaining the original catalog and preset hashes; its other 15 checks were not run. All eight TypeScript projects and all four production builds passed.

## Disposition of every previously missing in-scope row

Each row below was checked as a complete card. Supporting one printed clause does not make the whole card data-only. Deferred reasons identify the missing behavior, rather than silently omitting it. Already registered rows are listed in the [original inventory](workbook-card-readiness-2026-11-03.md).

| Source row | Card | Status | Implementation or blocker |
|---|---|---|---|
| 幻影木偶 2 | 幻影木偶* | Deferred | Graveyard casting, conditional cost/timing and the twenty-copy deck exception. |
| 幻影木偶 4 | 幻影工兵 | Deferred | Graveyard search has no color filter; black creatures cannot faithfully be selected. |
| 幻影木偶 6 | 幻影巨人 | Deferred | Graveyard casting and conditional cost/timing. |
| 幻影木偶 8 | 赫拉鬼火術 | Deferred | Attribute zero-life departures to this effect and exile only the creatures it soul-destroys. |
| 幻影木偶 9 | 影木劍 | Added | Implemented as `shadowwood-sword`. |
| 幻影木偶 10 | 幻影木偶工廠 | Deferred | Five-card reveal, forced mill of every matching creature, top ordering and per-game usage. |
| 幻影木偶 11 | 赫拉的營寨 | Deferred | One shared per-turn draw across opponent player life loss and creature life reduction; the latter is not a general event. |
| 幻影木偶 12 | 幻像祭壇 | Deferred | Atomic tapped entry, mill-then-claim of the exact card with a color/type filter. |
| 幻影木偶 13 | 幻影夢人 | Deferred | Optional life payment during the draw step; no matching draw-step trigger. |
| 幻影木偶 14 | 幻影木偶 鬼斧 | Deferred | Permanent maximum-life reduction is expressible, but its soul-destruction outcome cannot gate the self buff. |
| 幻影木偶 15 | 幻影木偶 鬼火 | Deferred | Mill then optionally recover the same black noncreature card, rather than searching the entire graveyard. |
| 幻影木偶 17 | 死亡組裝 | Deferred | Multi-creature destruction and creation of a token with an ability. |
| 幻影木偶 18 | 幻影木偶軍團長 | Deferred | The attack bonus lasts for this battle; current stat grants have no battle expiry. |
| 幻影木偶 19 | 幻影木偶智者* | Deferred | Graveyard casting/cost and conditional nonstacking tribal anthem during the attack phase. |
| 幻影木偶 20 | 赫拉幻影術 | Deferred | Cost-bounded special summon with ignored graveyard effects and a phase-dependent limit. |
| 幻影木偶 21 | 幻影魔鐮 鬼火 | Deferred | Mill then optionally recover the exact discarded black noncreature card. |
| 幻影木偶 22 | 幻影魔神 赫拉尼亞* | Deferred | Discover the source in hand/library discard events, optional paid summon, discarded-card mana value. |
| 幻影木偶 23 | 幻影女王 赫拉 | Deferred | Remove counters as an activation cost and integrate charge-triggered land behavior. |
| 風獸 5 | 風靈獸 刃狼 | Deferred | Five-card reveal and distinct name-substring selections; the land placement alone is insufficient. |
| 風獸 8 | 諸界風靈使 | Deferred | Reveal supports an optional pick only; the printed take-one selection cannot be enforced when an eligible card is revealed. |
| 風獸 10 | 風靈再生 | Deferred | Name-substring reveal provenance and a battle-duration alternate mode. |
| 風獸 13 | 風靈先知 | Deferred | Name-substring reveal filtering and mandatory selection. |
| 風獸 14 | 風靈號角手 | Deferred | Special-summon source explicitly deferred by owner; also needs name-substring filtering. |
| 風獸 15 | 風靈獸之子 | Deferred | Skip the opponent's next untap plus a conditional name-substring anthem. |
| 風獸 16 | 生機木杖 | Added | Implemented as `vitality-wood-staff`. |
| 風獸 17 | 獸帝的號令 | Deferred | Reveal provenance/name-substring filtering and pay-to-summon from the revealed window. |
| 風獸 18 | 風靈獸 號角手姆拉德* | Deferred | Five-card reveal and type-filtered free deployment. |
| 風獸 19 | 風靈獸 旗手納馬蘭 | Deferred | Suppress tapped opponent creature effects, detect tapping and use phase/name-based conditions. |
| 風獸 20 | 風靈獸之怒 | Deferred | Name-substring reveal provenance, even though tapping two targets is already supported. |
| 風獸 21 | 風靈獸 狂獅大將軍哈爾 | Deferred | Skip next untap and per-game activation usage. |
| 風獸 22 | 風靈戰皇 里昂·加拉爾 | Deferred | Give a counter to the entering event object, skip next untap, multiple marked targets. |
| 風獸 23 | 風靈獸 大酋長里昂 | Deferred | Under-host card storage/release and a per-turn mana limit derived from stored cards. |
| 冰龍 3 | 寒霜使者 | Deferred | Select to library top from a reveal; the bounded reveal consumer currently takes a card to hand. |
| 冰龍 4 | 封印的極光龍像 | Deferred | Counter-dependent combat restrictions and cancellation of those restrictions at a threshold. |
| 冰龍 5 | 極光冰龍 | Deferred | Aurora counter grants once-per-turn prevention; a generic named counter alone does not implement that rule. |
| 冰龍 6 | 冰風守護者 | Deferred | Aurora prevention and retargeting a pending effect. |
| 冰龍 7 | 霜月門衛 | Deferred | The 兵 cost is clarified as generic; counter-linked equipment-granted rules still need lifecycle/multiplicity support. |
| 冰龍 8 | 冰霜巨人 | Added | Implemented as `frost-giant`. |
| 冰龍 9 | 冰龍魔杖 | Deferred | Remove counters as an activation cost; define whether the attack places the counter on weapon or host before that engine slice. |
| 冰龍 10 | 冰龍呼喚 | Deferred | Mandatory reveal selection and conditional repetition of the entire reveal sequence. |
| 冰龍 11 | 極光之盾 | Deferred | A life-total floor; ordinary damage prevention is insufficient. |
| 冰龍 12 | 巨龍的祝福 | Deferred | Counter-granted once-per-turn Aurora prevention on each creature. |
| 冰龍 13 | 冰霜之魂 | Added | Implemented as `frost-soul`. |
| 冰龍 14 | 霜月守護者 | Deferred | Negating an attack is not an existing effect primitive. |
| 冰龍 15 | 冰陵之主 | Deferred | Conditional damage reduction on Aurora-marked ice dragons. |
| 冰龍 16 | 極北王冠 | Deferred | Per-game activation usage; the life condition and bottom-library moves alone are insufficient. |
| 冰龍 17 | 極光之壁 | Deferred | Aurora prevention and ending the attack phase after this battle. |
| 冰龍 18 | 極北之指引者 萊莘德雅 | Deferred | Hand-zone triggered summoning and two-category reveal selection. |
| 冰龍 19 | 極光封 | Deferred | Counter a creature ability and move that selected ability's source to library bottom. |
| 冰龍 20 | 極光龍宮 | Deferred | Aurora prevention, selected counter-removal cost and unspecified special-summon source. |
| 冰龍 21 | 極光龍后 亞雅隆 | Deferred | Aurora prevention and an unspecified activation condition/timing; source also labels an apparent creature as land. |
| 冰龍 22 | 極北龍帝 亞瑟 | Deferred | Damage assignment per friendly ice dragon and half-damage arithmetic/rounding. |
| 冰龍 23 | 巨龍之墓 | Deferred | Aurora prevention and replacing a zero-life departure with healing. |
| 冰龍 24 | 寒巢之主 亞蕾雅 | Deferred | Counter-removal cost and battle-duration prevention for both players. |
| 冰龍 25 | 諸界六皇 冬機之卡斯拿斯 | Deferred | Effect-source-specific immunity and tapping-triggered recovery during the opponent's attack phase. |
| 上使 4 | 天域巡邏兵 | Added | Implemented as `heavenly-patrol`. |
| 上使 5 | 天域門衛 | Added | Implemented as `heavenly-gatekeeper`. |
| 上使 6 | 天域地界使 雷拉 | Deferred | Reveal selection needs a yellow-land filter; normal bounded reveal has no color/type selection filter. |
| 上使 7 | 天域尋索者 耶拉* | Deferred | Alternative tribe/type/color reveal filters with mandatory selection. |
| 上使 8 | 亞拉里亞最終兵器 天域神城 | Deferred | Create a 1/1 angel token. |
| 上使 9 | 天域長槍 | Added | Implemented as `heavenly-lance`. |
| 上使 10 | 天域之門 | Added | Implemented as `heavenly-gate`. |
| 上使 11 | 聖能術 · 速 | Deferred | Draw specifically from library bottom; DRAW currently reads the top. |
| 上使 12 | 亞拉里亞的終末 | Deferred | Per-game usage and an exile cost selecting a charged named permanent. |
| 上使 13 | 天域之獸 | Deferred | Count revealed yellow cards for healing and select a yellow land from that same reveal. |
| 上使 14 | 天域三侯 坡加 | Deferred | Under-host land storage/release and the 縛鎖 cost. |
| 上使 15 | 天域三侯 萊拉 | Added | Implemented as `heavenly-marquis-laila`. |
| 上使 16 | 天域三侯 伊雲 | Deferred | Eight-card reveal, take all spells, exile remainder and per-game usage. |
| 上使 17 | 雷霆之門 | Deferred | Per-game triggered usage and angel token creation. |
| 上使 18 | 亞拉里亞的截擊 | Deferred | Counter an arbitrary effect and then discard/destroy its associated source; plain spell countering covers only part. |
| 上使 19 | 吞雷聖劍 | Added | Implemented as `thunder-devouring-holy-sword`. |
| 上使 20 | 天使的皇座 | Deferred | Under-host storage and shared limits that modify other ability limits. |
| 上使 21 | 天使女帝 蝶后 | Deferred | Hand-zone life-loss response and a global healing-amount modifier. |
| 上使 22 | 大天使 費蘭尼 | Deferred | Per-game entry usage, life-based integer division and attack-only expiry. |
| 上使 23 | 天使皇 亞拉里亞 | Deferred | Remove five charge counters as an optional cost in a triggered summon. |
| 蒼巨人 4 | 幻海人 塔薩 | Deferred | Six-card reveal and mill remainder after filtered recovery. |
| 蒼巨人 8 | 海歸的幻術者 | Deferred | Modify other cards' mill quantities for the turn. |
| 蒼巨人 9 | 沉沒的巨船 | Deferred | Discover the discarded source itself in hand/library discard events. |
| 蒼巨人 13 | 蒼海王子 | Deferred | Ritual material selection and summed mana-value payment. |
| 蒼巨人 14 | 深淵巨人 | Deferred | Ritual material selection and summed mana-value payment. |
| 蒼巨人 15 | 深海之墓 | Deferred | Conditional hand immunity and graveyard target restrictions. |
| 蒼巨人 16 | 永恆魔洋 | Deferred | Random opposing hand reveal and same-name cast/deploy prohibition. |
| 蒼巨人 17 | 魔海尖塔 | Deferred | Attack-phase mana-value cast restriction and per-game usage. |
| 蒼巨人 18 | 海神呼喚者 海耶 | Deferred | Six-card reveal, take two categories and mill remainder. |
| 蒼巨人 20 | 幻變神殿 | Deferred | Modify other cards' mill quantities; the granted attack-mill alone is insufficient. |
| 蒼巨人 21 | 海神之怒 耶夢加得 | Deferred | Name-substring conditional cost and random hand discard. |
| 蒼巨人 22 | 幻變之海 洛基尼亞 | Deferred | Reveal from the opponent's library, transfer ownership-safe control to hand and mill remainder. |
| 蒼巨人 23 | 蒼海帝 洛基 | Deferred | Counter-removal cost, opponent-library draw and card-specific mana conversion. |
| 蒼巨人 24 | 諸界六皇 萬智之德步尼* | Deferred | Per-game usage, count the creatures actually milled and integer division of current power. |

The earlier report’s candidate list was provisional. In particular, 幻影工兵 cannot currently search specifically for black creatures, and 諸界風靈使 cannot enforce its printed mandatory selection through the optional bounded-reveal consumer. Neither is included as an approximation. Expanding those two generic consumers would be a small engine change, but remains outside this request.
