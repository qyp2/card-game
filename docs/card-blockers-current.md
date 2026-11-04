# Current workbook card blockers

Updated after the [shared card infrastructure implementation](shared-card-infrastructure.md) and [counter/optional payment delivery](counter-payment-architecture.md), following `708dd3ad`. The original audit used engine snapshot `105dce59`; this ledger reflects effective-cost characteristics, deck policy, ordinary game usage, causal outcomes and atomic counter payments.

Source: local ignored `tem/六界之峰.xlsx`, SHA-256 `27b91d995e22fb8540a04c78a73d41f64daa08b216b275aceb1f282723a64d7d`. Include 炎獸, 幻影木偶, 風獸, 冰龍, 上使 and 蒼巨人. BP01, 虛界靈 and 雙色補充包 remain excluded from new implementation. Existing excluded definitions are retained.

## What “unblocker” and “unblocked” mean

An **unblocker** is a delivered capability or explicit owner ruling that removes a specific dependency. It needs an actual parser-to-runtime consumer and evidence of the relevant behavior. A schema field, unused keyword, future design or generic interface alone is not an unblocker.

A **U — unblocked** card can have its complete printed behavior authored faithfully using existing supported consumers and accepted rulings: costs, timing, zones, targets, optional/mandatory choices, duration, identity and applicable deck restrictions. Composition must have evidence, not just independently plausible pieces. It still needs its production definition, manifest registration and card-specific release verification. “Unblocked” does not mean “already implemented.” Readiness here assumes the currently supported format profile; it does not certify every workbook-wide format rule.

Other labels, which can overlap:

- **B — confirmed technical blocker:** a missing runtime consumer, query/value operation, event, payment/lifetime contract or policy mapping. The row identifies it; not every B requires redesigning the engine.
- **W — wording/ruling dependency:** intended behavior is unsettled. Ask when implementing; do not turn an assumption into a requirement for new engine code.
- **P — composition/lifecycle proof missing:** related primitives exist, but the complete behavior has not been demonstrated. Investigation may clear it without code changes. This is deliberately distinct from a proven missing primitive.
- **Registered:** a matching name exists in the explicit catalog. This is a coverage fact, not certification of workbook fidelity or balance.

An ability is not ready merely because one clause works. A card moves to U only after every dependency is cleared; a registered card can still have fidelity gaps.

## Owner clarifications and implementation direction — 4 November 2026

The cost ruling and the shared implementation directions below are delivered. The owner has not yet settled a broad multi-source kill-credit rule; contributor receipts and lethal-making causes remain separately inspectable.

**Effective cost.** For 幻影木偶, every mana-cost query returns zero while it is in the graveyard and its printed phase/board conditions hold. This includes eligibility/threshold queries, not merely the amount paid to cast it. Leaving that zone or losing the condition restores the ordinary effective value. Use one room-aware effective-cost resolver and derive total mana value from its structured cost; preserve the printed blueprint separately for inspection or explicitly printed-cost queries. Cast payment starts from that effective cost, then applies payment adjustments once. This ruling does not itself grant ordinary graveyard casting. The shared query consumer and production phantom definitions are now implemented.

**Deck policy.** The implemented validation design uses an owned, schema-validated config file for format bounds and per-card numeric/unlimited/excluded exceptions. Compile it into the same shared validation policy for the builder and server; the server's policy remains authoritative when saving and starting a game. The existing format/eligibility JSON and pure validator are the starting point. Extend the numeric copy-limit mapping rather than give the builder independent hardcoded exceptions or trust a browser-supplied policy.

**Once per game.** Extend the room's structured use counters/history and existing usage identities, with a pure availability query. Use a stable ability identity plus an explicit scope (physical card, current incarnation, player or shared group). A physical-card key must survive zone changes; ordinary current-incarnation turn keys are not sufficient. Increment exactly once when the declared use is committed, not during availability queries. Specify trigger consumption separately (enqueue versus successful resolution). Reset game-period counts on a new match; reconnecting must not reset them. Reuse/generalize `gameRuleUses` and turn-history machinery instead of scanning display logs or adding a parallel modifier-only counter.

**Sources and causes.** Damage, rule/effect changes, state changes and departures should share a serializable cause/source contract. Extend the current event identities, `BatchCause`, source snapshots and proposed-event transaction. Preserve source card UUID/revision, ability and stack identity, controller-at-cause, parent/root cause, affected object identity, change reason and actual outcome. Changes from game rules can have a system cause without a source card. Carry causality through replacements and state-based lethal checks; keeping only the last source string on a damage event cannot reliably answer “this effect killed that creature.” Record actual damage after prevention, retain source information when the source leaves, and distinguish sacrifice/destroy/lethal departure. Contributions from multiple simultaneous or persistent causes need an explicit attribution rule rather than guessing from event order.

**SOUL.** The owner does not want a distinct soul-death type for now. For the relevant exile wording, represent it as “if this effect kills X, send X to exile.” This is a source-scoped outcome/destination rule, not a global rule that every kill exiles. Where the intended action is an exile destination, replace the lethal departure before a graveyard move; do not emit a fictitious graveyard arrival and exile afterward. A follow-up such as 鬼斧's bonus can query the attributed kill outcome independently of its final destination. Existing other zero-life rescue wording still needs its own interception behavior. The blocker family below is therefore **CAUSE**, not a new SOUL mechanic.

These shared consumers now have focused proofs. A dependent card still needs a complete recipe/composition check before moving to U. Kill outcomes retain both all contributor receipts and lethal-making causes after the victim leaves; current kill matching uses lethal-making causes, without treating the still-open broader credit ruling as settled.

## Current coverage

The explicit manifest contains **98 definitions**. The six included sheets have **142 named rows**, **72 with registered name matches** and **70 without a definition**. Of those 70, **2 are confirmed U and 68 remain deferred** for technical work, rulings or proof. The labels overlap, so they must not be added as mutually exclusive engine-blocker totals.

| Sheet | Named rows | Registered matches | No definition | Confirmed U | Deferred |
|---|---:|---:|---:|---:|---:|
| 炎獸 | 24 | 24 | 0 | 0 | 0 |
| 幻影木偶 | 23 | 10 | 13 | 2 | 11 |
| 風獸 | 23 | 12 | 11 | 0 | 11 |
| 冰龍 | 25 | 4 | 21 | 0 | 21 |
| 上使 | 23 | 12 | 11 | 0 | 11 |
| 蒼巨人 | 24 | 10 | 14 | 0 | 14 |
| **Total** | **142** | **72** | **70** | **2** | **68** |

Matching uses NFKC normalization and ignores whitespace and asterisks; source row numbers remain workbook row numbers. Only JSON imports explicitly listed in `cards/index.ts` count. Untracked duplicate files and excluded-sheet rows do not inflate coverage.

## Delivered unblockers and their limits

| Delivered capability | Now removes | Does not remove |
|---|---|---|
| Shared cross-zone filters/search | Color, type, tribe, name, condition and zone filtering; mandatory filtered take-one where supported | Permission to cast from a zone; arbitrary reveal workflows; source discovery/events; movement into someone else's hand |
| Strict rule contracts and functional families | Shared parsing and validated characteristic, permission, cast-cost and replacement rules | Arbitrary operations absent from consumers; combat restrictions; activation cost rewriting and dynamic ability-limit rewriting |
| Conditional characteristics and numeric queries | Conditional stats/keywords/types/colors and whole effective mana cost, phase/zone conditions, count/exists/counterTotal, add/multiply | Divide/floor/sum; “the result card's mana value”; arbitrary name changes |
| Cast-cost modifiers | Conditional payment setters, reductions, increases and supported usage accounting | Changing the mana value read by other effects; granting graveyard cast permission; activation payments or color-conversion rights |
| Resolution-local mill result sets | Exact-card recovery; count actual milled arrivals; current versus recorded state after replacements | A new physical zone, under-host storage, reveal-result capture, iteration, mill-quantity modifiers or arbitrary selected-card fields |
| Bounded reveal improvements | Filtered mandatory/optional selection in the existing one-to-three-card take-to-hand/order-bottom consumer | Five/six/eight-card windows, top-selected/take-all/deploy/exile/mill-remainder workflows, reveal provenance or conditional repetition |
| Shared ordinary ability usage | Turn/game limits, physical/incarnation/controller identities, shared groups, immediate mana and trigger reservations | Dynamic numeric limits or changing another ability's declared limit |
| Shared counter and optional costs | Atomic source/controlled-battlefield counter costs; optional `resources / pay_cost` branches with existing mana/life/discard/orientation/sacrifice costs | Selected exile, rituals, binding/storage and dynamic counter amounts |
| Causal events and killed outcomes | Actual source/ability/root/parent data, contributor receipts, lethal-making causes, gated kill outcomes and source-scoped direct exile | Optional zero-life rescue; an owner ruling on every broad multi-source credit case |
| Config-driven copy exceptions | Twenty copies of 幻影木偶, singleton 幻影魔城/諸界海 and all six repeatable basic lands | Workbook-wide format/profile migration |
| Recent legal-action query, auto-pass and room lifecycle work | Better play/session behavior and action inspection | No card mechanic blockers are removed by those features alone |

Two newly proven recipes are **幻影木偶 鬼火** and **幻影魔鐮 鬼火**. The focused [composition tests](../tests/engine/card-blocker-probes.test.ts) exercise actual cast/entry, optional mill, attack, exact recovery, black/type exclusions, attachment/+2 attack, and removal of the granted ability when the weapon leaves. An older eligible graveyard card is never offered as a substitute. They remain absent from the live catalog in this audit.

Accepted rulings remain: 兵 is generic for now; unqualified life reduction is permanent maximum-life reduction; 生機木杖 grants +2 attack; 天域之門 alone has both battlefield sacrifice and hand-discard mana routes. Unspecified special-summon origins stay deferred. 冰陵之主's detailed wording stays for implementation.

### Counter-owned behavior needs its own proof

Generic counter storage and prevention are available. That does not certify the full Aurora/霜器 package. Counter-owned behavior must survive the giver leaving, belong to each recipient, have correct nonstacking/usage identity, and handle repeated placement, counter removal/reapplication, attachment changes and zone revisions. Static source-owned auras can expire too early. Repeated characteristic ability grants receive origin-qualified IDs, so matching authored IDs alone do not deduplicate them. Resolved grants can outlive the giver, but the complete lifecycle still needs evidence. Relevant rows are P rather than automatically U; where a consumer is demonstrably absent, B is also shown.

## Remaining capability families

| Code | Missing capability or decision boundary |
|---|---|
| COST | Card-specific color-conversion payment permissions, distinct from cast-price adjustment |
| VALUE | Selected-result-card fields; sums/division/floor/rounding |
| CAUSE | Shared source/cause attribution, lethal outcomes, source-scoped exile destinations and zero-life interception |
| REVEAL | Captured windows, larger bounds, destination/selection/order workflows and repetition |
| USAGE | Dynamic limits, modifying other ability limits or nonstacking composition proof |
| EVENT | Off-zone source discovery and tap/draw-step/life-change/reveal provenance events |
| PAY | Selected exile, ritual materials and binding/storage payments; ordinary counter and optional resolution payments are delivered |
| ENTRY | Atomic tapped entry or summon-method provenance |
| TOKEN | Token creation with authored characteristics/abilities |
| EXPIRY | Battle/attack lifetime and skip-next-untap scheduling |
| HOST | Real cards stored under a host and host-bound release |
| COUNTER | Counter-owned granted behavior, identity and lifecycle proof |
| COMBAT | Attack/block prohibition, attack cancellation and scheduled phase termination |
| DAMAGE | True reduction, life floors and damage packet/assignment semantics |
| STACK | Selected ability-source linkage, retargeting and source follow-up actions |
| VIEW | Card holder versus owner, cross-player destination and visibility |
| IMMUNITY | Immunity to untargeted as well as targeted effects by source category |
| MILL | Quantity modification before selecting/moving the milled cards |
| HEAL | Global healing-amount modification |
| RANDOM | Authoritative random selection/reveal/discard with downstream identity |
| DRAW | Bottom/opponent-library draw semantics |

## Every missing in-scope row

The tables distinguish a confirmed missing consumer from a ruling that might require one. Whole-card U requires all clauses; a P is not a claim that a particular engine change is necessary.

### 幻影木偶

| Row | Card | Status | Families | Current disposition |
|---:|---|---|---|---|
| 8 | 赫拉鬼火術 | P | — | Attributed reduction kills and source-scoped direct exile now have shared consumers and focused proofs. Author the exact -2/-2 card recipe and verify its complete composition; no separate SOUL death type is needed. |
| 10 | 幻影木偶工廠 | B | REVEAL | Five-card window, move every matching creature to graveyard, order the remainder on top, and the alternative-choice workflow. Once-per-game usage is now supported. Existing reveal-to-hand/bottom and ability turn limits do not cover this. Ordinary once-per-game usage is now available; the remaining listed behavior still needs implementation. |
| 11 | 赫拉的營寨 | W/P | — | Life-loss, actual damage and effective maximum-life change events plus a shared turn budget now exist. Settle which creature life changes qualify and prove the complete combined draw recipe. |
| 12 | 幻像祭壇 | B | ENTRY | Exact milled-card recovery and black/type filters are now supported. Only atomic tapped entry remains; an entry trigger that later taps is observably different. |
| 13 | 幻影夢人 | B | EVENT | Need the draw-step trigger. Optional pay-two-life-then-draw now uses `resources / pay_cost`; ordinary life payment is no longer a blocker. |
| 14 | 幻影木偶 鬼斧 | P | — | The shared killed-outcome gate now supports a stat reduction followed by a success-only bonus. Still deliver the exact attack/target/buff composition proof for this card. |
| 15 | 幻影木偶 鬼火 | U | — | Existing optional mill result capture, black noncreature-type filter and exact-card recovery compose on entry and attack. Seven focused recipe tests cover this card and the scythe; definition/registration still to deliver. |
| 17 | 死亡組裝 | B/W | TOKEN | Multi-target friendly destruction is supported. Token creation, including the token's attack ability, is missing. Clarify whether successful destruction of all three is a prerequisite rather than only an instruction sequence. |
| 18 | 幻影木偶軍團長 | B | EXPIRY | Graveyard deployment exists. The +4 bonus must expire at this battle's end; end-of-turn expiry is not equivalent. |
| 19 | 幻影木偶智者* | B/P | USAGE | The graveyard effective-cost setter is now supported. Nonstacking stat anthems across multiple copies still need their consumer/composition; ability usage groups do not deduplicate continuously applied stat deltas. |
| 20 | 赫拉幻影術 | W | VALUE | Effective mana-value filtering now sees graveyard setters. Clarify whether ignore all graveyard effects means explicitly selecting by printed cost or suppressing effects more broadly; those are distinct selection/permission policies. |
| 21 | 幻影魔鐮 鬼火 | U | — | Restricted attachment, +2 attack and granted attack-triggered exact-mill recovery compose with existing consumers; the grant stops when the weapon leaves. Live definition/registration still to deliver. |
| 22 | 幻影魔神 赫拉尼亞* | B/W | EVENT, VALUE | Discover the discarded card itself from hand/library and read that exact card's mana value for the temporary reduction. Mill result membership alone supplies no selected-result-card mana-value accessor. Optional paid deployment is now supported; clarify trigger origin/timing when authored. |

### 風獸

| Row | Card | Status | Families | Current disposition |
|---:|---|---|---|---|
| 5 | 風靈獸 刃狼 | B | REVEAL | Hand land deployment, own-hand-count condition and name-substring filters exist. Need five-card reveal and multiple choices with distinct printed names, then ordered remainder. |
| 10 | 風靈再生 | B | EVENT, EXPIRY | Need revealed-card discovery with the revealing source's name/provenance. Hand exchange exists. Alternate +1 attack requires battle expiry. |
| 14 | 風靈號角手 | W | — | Hand activation, self-discard payment, turn limit and name-substring selection exist. Owner explicitly deferred the unspecified special-summon origin. Choose the origin before deciding whether another engine change is needed; this is not a remaining filter blocker. |
| 15 | 風靈獸之子 | B | EXPIRY | Name-substring conditional +2/+2 is expressible. Tapping exists; skipping the target's next untap does not. |
| 17 | 獸帝的號令 | B | EVENT, REVEAL | Need reveal-self provenance and deployment from the same revealed window. The optional pay-one-green branch is now supported; retaining the exact revealed card remains the blocker. |
| 18 | 風靈獸 號角手姆拉德* | B | REVEAL | Five-card reveal, optional free Land/Artifact deployment from that exact window, ordered bottom remainder. Filtering is no longer the blocker. |
| 19 | 風靈獸 旗手納馬蘭 | B/W | EVENT | Conditional removal of abilities from tapped opposing creatures is expressible. Need a tap event; clarify 回復 (untap or life recovery) and scope before implementing the response. |
| 20 | 風靈獸之怒 | B | EVENT | Tapping two opposing creatures is supported. Revealed-self recovery still needs discovery and source-name provenance. |
| 21 | 風靈獸 狂獅大將軍哈爾 | B | EXPIRY | Multi-target tapping and eight damage exist. Need skip-next-untap. Once-per-game ordinary activation is supported. Ordinary once-per-game usage is now available; the remaining listed behavior still needs implementation. |
| 22 | 風靈戰皇 里昂·加拉爾 | B | EVENT, EXPIRY | Need targeting the entering event card with its +1/+1 counter and skip-next-untap for the three marked opponents. Board-filter support alone does not identify the triggering entrant. |
| 23 | 風靈獸 大酋長里昂 | B/W | HOST, USAGE | Real cards stored under this host, host-bound retrieval and per-turn mana uses equal to stored-card count are missing. Clarify whether the starting-step deposit is optional once per turn. |

### 冰龍

| Row | Card | Status | Families | Current disposition |
|---:|---|---|---|---|
| 3 | 寒霜使者 | B | REVEAL | Reveal/filter/destruction-draw exist. Need chosen card on top with all other revealed cards ordered on bottom; current reveal takes chosen cards to hand. |
| 4 | 封印的極光龍像 | B | COMBAT | Need authored attack/block prohibition conditional on counters. Cast/activate permission rules are not combat restrictions. Also establish the counter-placement event's subject for the threshold tracker. |
| 5 | 極光冰龍 | P | COUNTER | A self-only intrinsic, counter-conditioned prevention rule is expressible. Before full-card readiness, prove the parenthetical Aurora counter contract: recipient-owned once-per-turn shield, persistence, removal/reapplication and repeated placement. Generic prevention tests alone do not certify counter semantics. |
| 6 | 冰風守護者 | B/P | COUNTER, STACK | Aurora proof requirements plus retargeting a pending effect to this creature. Protection keywords do not redirect a selected stack object. |
| 7 | 霜月門衛 | B/P | COUNTER | 兵 is accepted as generic. Need a persistent counter-owned grant on the selected equipment, then its attack grant on the equipped host, with defined multiplicity/removal/reapplication. A static aura owned by the gatekeeper stops too early when it leaves. |
| 9 | 冰龍魔杖 | W | — | Restricted attachment, attack counters, bounce and atomic counter payment now exist. Clarify whether 此卡 means the staff or equipped host for placement/payment before authoring the complete recipe. |
| 10 | 冰龍呼喚 | B/W | REVEAL | Mandatory filtered take-one exists. Need conditional repetition of the whole reveal/choose/order workflow; clarify once-again versus recursive repetition before choosing a bounded recipe or repeat consumer. |
| 11 | 極光之盾 | B/W | DAMAGE | Need life-total floor across qualifying decreases, including direct life loss. Prevention alone is insufficient. Clarify behavior when life already starts below five. |
| 12 | 巨龍的祝福 | P | COUNTER | Multi-recipient counter placement exists. Prove each recipient gets one shared Aurora shield per turn, including giver leaving, repeated placements and counter removal/reapplication; no evidence yet certifies the full package. |
| 14 | 霜月守護者 | B/W | COMBAT | Need cancel-this-attack semantics; spell/ability countering does not cancel combat. Define whether this removes one attacker or ends the whole battle when implementing. |
| 15 | 冰陵之主 | B/W | DAMAGE | Counter/subtype-filtered rule scope and friendly attack/draw exist. True flat damage reduction is absent; prevention of one point is a different operation. Resolve friendly versus all marked ice dragons and reduction wording at implementation, as previously deferred. |
| 16 | 極北王冠 | P | — | Ordinary once-per-game usage is implemented. Restricted attachment, life condition, tap payment and bottom moves already exist. Prove/register the complete Crown recipe before U. |
| 17 | 極光之壁 | B/P | COUNTER, COMBAT | Aurora contract needs proof. Spell countering exists; ending the attack phase after the current battle needs a scheduled combat transition. |
| 18 | 極北之指引者 萊莘德雅 | B/W | EVENT, REVEAL | Need off-battlefield source discovery for the departure-triggered self summon, plus two independent reveal categories. Clarify the source zone for the response. |
| 19 | 極光封 | B/W | STACK | Creature-ability countering exists. Need resolving the selected stack ability's source for bottom movement and clarify whether 其 refers to that creature. Countering alone cannot select its associated source. |
| 20 | 極光龍宮 | B/W/P | COUNTER | Aurora contract and an explicitly deferred special-summon origin remain. Shared selected-counter payment is delivered. |
| 21 | 極光龍后 亞雅隆 | B/W/P | COUNTER | Need full per-recipient prevention grant semantics. Clarify the first ability's activation condition/timing; the workbook labels this apparent 4/8 creature as Land. Turn-long untargetability is already expressible. |
| 22 | 極北龍帝 亞瑟 | B/W | DAMAGE, VALUE | Count and multiply exist. Need defined per-dragon damage assignment and half-damage arithmetic/rounding; clarify repeated five-damage packets versus one summed packet and odd damage. |
| 23 | 巨龍之墓 | B/W/P | COUNTER, CAUSE | Aurora contract plus replacing a zero-life state-based departure with optional artifact destruction and healing. Ordinary damage regeneration is not this replacement; clarify what life recovery means after max-life reduction. |
| 24 | 寒巢之主 亞蕾雅 | B | EXPIRY | Charge, creature entry and atomic four-counter payment now exist. Need battle-lifetime protection for both players, rather than a turn-long approximation. |
| 25 | 諸界六皇 冬機之卡斯拿斯 | B/W | IMMUNITY, EVENT | Need immunity against opposing spell/creature effects, not just targeting. Also tap-triggered recovery during opponent attack phase; clarify 回復 and qualifying source effects. |

### 上使

| Row | Card | Status | Families | Current disposition |
|---:|---|---|---|---|
| 8 | 亞拉里亞最終兵器 天域神城 | B | TOKEN | Create the 1/1 vanilla angel token. Existing token cleanup does not create tokens. |
| 11 | 聖能術 · 速 | B | DRAW | Need drawing specifically from library bottom; ordinary DRAW consumes the top. |
| 12 | 亞拉里亞的終末 | B | PAY | Global opposing destruction exists. Need an atomic exile payment selecting the named emperor with at least five charge counters. Ordinary once-per-game usage is now available; the remaining listed behavior still needs implementation. |
| 13 | 天域之獸 | B | REVEAL, VALUE | Yellow-land selection exists. Need a captured revealed window whose yellow-card count determines life gained, while selecting from that same window. Mill-only result capture cannot certify this. |
| 14 | 天域三侯 坡加 | B/W | HOST, PAY, REVEAL | Need under-host land storage/release, the 縛鎖1 payment contract, and take-all-spells reveal handling. Settle where stored land is selected from. |
| 16 | 天域三侯 伊雲 | B | REVEAL | Eight-card reveal, take all spells, exile remainder and the reveal workflow; ordinary once-per-game entry usage is supported. Ordinary once-per-game usage is now available; the remaining listed behavior still needs implementation. |
| 17 | 雷霆之門 | B | TOKEN | Healing triggers and mana generation exist. Need token creation; ordinary once-per-game triggered usage is supported. Ordinary once-per-game usage is now available; the remaining listed behavior still needs implementation. |
| 18 | 亞拉里亞的截擊 | B/W | STACK | Ability/spell countering exists. Need associated-source selection and source-zone-aware discard/destruction; clarify which effects are counterable and what happens to a source already gone. |
| 20 | 天使的皇座 | B/W | HOST, USAGE, PAY | Need under-host storage/release, 縛鎖3 and reversible changes to ability 1's use limit. Shared groups can enforce the common 2/3 budget; changing ability 1's limit still lacks a consumer. |
| 21 | 天使女帝 蝶后 | B | EVENT, HEAL | Need hand-zone life-loss response with self-discard and a global healing-amount modifier. Existing battlefield triggers and damage modifiers do not implement these consumers. |
| 22 | 大天使 費蘭尼 | B | VALUE, EXPIRY | Setting life to 30 is expressible through current life arithmetic. Still need integer floor(life/5), and bonus expiring after this attack. Ordinary once-per-game usage is now available; the remaining listed behavior still needs implementation. |

### 蒼巨人

| Row | Card | Status | Families | Current disposition |
|---:|---|---|---|---|
| 4 | 幻海人 塔薩 | B | REVEAL | Name/type filters exist. Need six-card window, optional filtered take-one and milling the exact remainder. |
| 8 | 海歸的幻術者 | B | MILL | Attack-mill exists. Need changing other friendly giant cards' mill quantity until turn end; card-move replacements occur after quantity selection and are not equivalent. |
| 9 | 沉沒的巨船 | B | EVENT | Ordinary milling exists. Need discovery of this discarded source itself when it leaves hand/library; current discard trigger discovery scans battlefield sources. |
| 13 | 蒼海王子 | B/W | PAY, ENTRY | Need ritual material selection and summed mana-value destruction payment plus entry-method provenance for the optional draw. Clarify strict greater-than threshold/material combination. Normal special deployment and attack mill exist. |
| 14 | 深淵巨人 | B/W | PAY, ENTRY | Same ritual/provenance gap as prince. Ten-card mill is already supported; the bounded reveal limit does not limit mill quantity. |
| 15 | 深海之墓 | B | IMMUNITY | Own-hand-count conditions and graveyard targeting restriction are expressible. Conditional hand immunity must also cover untargeted opposing effects; Hexproof/Shroud alone do not. |
| 16 | 永恆魔洋 | B/W | RANDOM, VALUE | Need server-authoritative random opposing-hand reveal and passing its exact name into a turn-long cast/deploy prohibition. Clarify what 使用 covers. Fixed authored cast restrictions already exist. |
| 17 | 魔海尖塔 | P | — | Ordinary once-per-game usage is implemented. Phase/mana-value casting prohibition and graveyard land deployment already exist. Prove/register the complete Spire recipe before U. |
| 18 | 海神呼喚者 海耶 | B | REVEAL | Six-card window, independent giant/artifact selections and mill-remainder. Entry/attack opponent milling already works. |
| 20 | 幻變神殿 | B | MILL | Granted attack-mill exists. Need shared modification of other giants' mill quantity; do not rewrite one known card's printed amount. |
| 21 | 海神之怒 耶夢加得 | B | RANDOM | Name-substring conditions and whole effective-cost setters are supported. Authoritative random opposing-hand discard remains missing. |
| 22 | 幻變之海 洛基尼亞 | B/W | REVEAL, VIEW | Need six-card opponent-library reveal, selected opponent-owned creature into your hand and milling remainder. Current moves use the owner's destination; define holder versus ownership and hidden-information projection without changing ownership silently. Opponent-creature-count mill amount exists. |
| 23 | 蒼海帝 洛基 | B | VIEW, COST | Atomic four-counter payment is delivered. Need opponent-library draw into your hand with reveal and card-specific blue-as-any-color payment. Generic reductions/setters are not color-conversion permission. |
| 24 | 諸界六皇 萬智之德步尼* | B | VALUE | Ten-card mill, count of creatures actually milled and proportional stat bonus are now supported by result queries. Still need floor(power/2) for attack mill; multiplication alone cannot divide/floor. Ordinary once-per-game usage is now available; the remaining listed behavior still needs implementation. |

## Gaps in registered cards and format policy

The 72 registered matches are not a second list of fully faithful cards. Existing gaps remain visible here:

- **Copy policy resolved:** all six basic lands are repeatable. 血炎山 already used the unlimited `land-red` definition; the five other missing unlimited mappings are now configured. 幻影魔城/諸界海 are singleton and the newly registered 幻影木偶 allows twenty copies, through the shared config/validator.
- **Scorch on artifacts:** nine registered definitions explicitly retain `【暫緩：遺跡的灼熱破壞門檻】`. The accepted creature threshold uses current attack plus maximum life; the relic threshold still needs its own ruling. Their registration does not clear that caveat.
- **Excluded dual lands:** six registered dual lands use an entry-tap trigger rather than atomic tapped entry. They belong to the excluded supplement, so the audit records the fidelity gap without silently widening implementation scope.
- **Workbook format:** the workbook describes default three copies, at least sixty cards without an upper limit, and opening-seven/mulligan behavior. The current standard profile uses four copies and 60–250 cards; opening/setup rules are configured separately. Profile/setup alignment is separate work, not solved by registering definitions. U above is relative to the supported profile, not a claim that global workbook rules have been migrated.

A complete fidelity certification of the 72 registered matches is outside this missing-row audit. The historical inventory records their source text and coverage; the gaps above prevent interpreting coverage as a fidelity percentage.

## Next largest blocker and delivery order

The largest remaining family is **captured reveal workflows: 13 missing cards**. For example, 海神呼喚者 海耶 needs one six-card library window, independent giant/artifact selections from that exact window, and milling its exact remainder. Raising the existing reveal bound alone cannot express the selection provenance, destinations or ordering.

Counter payments and optional ordinary payments during resolution are delivered. They clear all six former counter-cost dependencies and the optional payment clauses of 幻影夢人, 幻影魔神 赫拉尼亞 and 獸帝的號令. Other clauses still block those cards. **Five PAY rows remain**: 亞拉里亞的終末 (selected exile), 天域三侯 坡加 / 天使的皇座 (binding/storage), and 蒼海王子 / 深淵巨人 (ritual materials). Counts overlap other families.

1. Deliver retained reveal windows with shared filters, independent selections, deployment and explicit remainder destinations/order. Extend the existing resolution-result ownership model; do not invent a second physical card zone.
2. Author/prove complete recipes whose dependencies are cleared. 幻影女王 赫拉 and 天使皇 亞拉里亞 are now registered and tested. The two Ghostfire mill recipes remain confirmed U; delivering those would reach **74/142** registered rows, leaving **68** missing.
3. Resolve 冰龍魔杖's staff/host wording before implementing it. Clearing a payment dependency does not settle its intended source.
4. Complete/prove counter-owned Aurora/霜器 behavior, then combat lifetimes, host storage, ritual/random/cross-owner and immunity behavior.

Deferred wording stays for the corresponding card implementation. These are the remaining delivery dependencies, not mechanics silently approximated by this batch.

## Audit evidence and ownership

Use the existing owners when delivering a missing slice:

| Boundary | Current implementation / contract |
|---|---|
| Catalog coverage and parsing | [Explicit manifest](../packages/engine/src/library/cards/index.ts), [public parser](../packages/engine/src/rules/parse.ts), [authoring contract](../packages/engine/src/library/README.md) |
| Filters and numeric values | [Shared card queries](../packages/engine/src/shared/card-query.ts), [numeric expressions](../packages/engine/src/shared/numeric-values.ts), [numeric schema](../packages/engine/src/types/numeric-value.types.ts) |
| Reveal choices | [Bounded reveal consumer](../packages/engine/src/engine/bounded-reveal.ts), [reveal tests](../tests/engine/bounded-reveal.test.ts) |
| Cost and usage boundaries | [Action payments](../packages/engine/src/engine/action-costs.ts), [cast pricing](../packages/engine/src/rules/runtime/costs.ts), [ability turn history](../packages/engine/src/engine/turn-history.ts) |
| Granted behavior and replacements | [Characteristic layers](../packages/engine/src/engine/characteristic-layers.ts), [replacement rule discovery](../packages/engine/src/rules/runtime/event-replacements.ts), [state-based departures](../packages/engine/src/engine/state-based-planner.ts) |
| Deck policy | [Eligibility schema](../packages/protocol/src/decks/eligibility.ts), [authored exceptions](../packages/protocol/src/decks/config/eligibility.json), [validator](../packages/protocol/src/decks/deck.ts), [format](../packages/protocol/src/decks/config/standard-v1.json) |
| Exact mill composition | [Resolution result design](resolution-results-architecture.md), [result tests](../tests/engine/resolution-results.test.ts), [new full recipes](../tests/engine/card-blocker-probes.test.ts) |

## Verification

The explicit manifest now has **98** definitions and matches **72/142** included workbook rows; **70** lack definitions. This delivery registers 幻影女王 赫拉 and 天使皇 亞拉里亞 and adds the shared cost contract/planner, payment choices and optional resolution branches. Existing definitions and presets are preserved.

Payment verification covers atomic combinations, overlapping inventory, stale/foreign selections, cancellation, source revisions, mana generation, continuation reconstruction, exact debits, production cards and opaque player projections. The final focused validation count is recorded in [the payment delivery guide](counter-payment-architecture.md#verification). All workspace typechecks pass. No browser smoke test, full-game socket test or full suite was run. The prior infrastructure delivery's 231 checks and original audit's 73 checks remain historical.
