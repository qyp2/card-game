# Current workbook card blockers

Audit of engine snapshot `105dce59`, superseding blocker conclusions in the earlier workbook, query and rule-contract delivery reports. This audit adds test-only recipes and documentation; it does not register cards or change mechanics.

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

## Current coverage

The explicit manifest contains **94 definitions**. The six included sheets have **142 named rows**, **68 with registered name matches** and **74 without a definition**. Of those 74, **2 are confirmed U and 72 remain deferred** for technical work, rulings or proof. The labels overlap, so they must not be added as mutually exclusive engine-blocker totals.

| Sheet | Named rows | Registered matches | No definition | Confirmed U | Deferred |
|---|---:|---:|---:|---:|---:|
| 炎獸 | 24 | 24 | 0 | 0 | 0 |
| 幻影木偶 | 23 | 7 | 16 | 2 | 14 |
| 風獸 | 23 | 12 | 11 | 0 | 11 |
| 冰龍 | 25 | 4 | 21 | 0 | 21 |
| 上使 | 23 | 11 | 12 | 0 | 12 |
| 蒼巨人 | 24 | 10 | 14 | 0 | 14 |
| **Total** | **142** | **68** | **74** | **2** | **72** |

Matching uses NFKC normalization and ignores whitespace and asterisks; source row numbers remain workbook row numbers. Only JSON imports explicitly listed in `cards/index.ts` count. Untracked duplicate files and excluded-sheet rows do not inflate coverage.

## Delivered unblockers and their limits

| Delivered capability | Now removes | Does not remove |
|---|---|---|
| Shared cross-zone filters/search | Color, type, tribe, name, condition and zone filtering; mandatory filtered take-one where supported | Permission to cast from a zone; arbitrary reveal workflows; source discovery/events; movement into someone else's hand |
| Strict rule contracts and functional families | Shared parsing and validated characteristic, permission, cast-cost and replacement rules | Arbitrary operations absent from consumers; combat restrictions; activation cost rewriting; ordinary per-game ability limits |
| Conditional characteristics and numeric queries | Conditional stats/keywords/types/colors, phase/zone conditions, count/exists/counterTotal, add/multiply | Effective mana-value setters; divide/floor/sum; “the result card's mana value”; arbitrary name changes |
| Cast-cost modifiers | Conditional payment setters, reductions, increases and supported usage accounting | Changing the mana value read by other effects; granting graveyard cast permission; activation payments or color-conversion rights |
| Resolution-local mill result sets | Exact-card recovery; count actual milled arrivals; current versus recorded state after replacements | A new physical zone, under-host storage, reveal-result capture, iteration, mill-quantity modifiers or arbitrary selected-card fields |
| Bounded reveal improvements | Filtered mandatory/optional selection in the existing one-to-three-card take-to-hand/order-bottom consumer | Five/six/eight-card windows, top-selected/take-all/deploy/exile/mill-remainder workflows, reveal provenance or conditional repetition |
| Recent legal-action query, auto-pass and room lifecycle work | Better play/session behavior and action inspection | No card mechanic blockers are removed by those features alone |

Two newly proven recipes are **幻影木偶 鬼火** and **幻影魔鐮 鬼火**. The focused [composition tests](../tests/engine/card-blocker-probes.test.ts) exercise actual cast/entry, optional mill, attack, exact recovery, black/type exclusions, attachment/+2 attack, and removal of the granted ability when the weapon leaves. An older eligible graveyard card is never offered as a substitute. They remain absent from the live catalog in this audit.

Accepted rulings remain: 兵 is generic for now; unqualified life reduction is permanent maximum-life reduction; 生機木杖 grants +2 attack; 天域之門 alone has both battlefield sacrifice and hand-discard mana routes. Unspecified special-summon origins stay deferred. 冰陵之主's detailed wording stays for implementation.

### Counter-owned behavior needs its own proof

Generic counter storage and prevention are available. That does not certify the full Aurora/霜器 package. Counter-owned behavior must survive the giver leaving, belong to each recipient, have correct nonstacking/usage identity, and handle repeated placement, counter removal/reapplication, attachment changes and zone revisions. Static source-owned auras can expire too early. Repeated characteristic ability grants receive origin-qualified IDs, so matching authored IDs alone do not deduplicate them. Resolved grants can outlive the giver, but the complete lifecycle still needs evidence. Relevant rows are P rather than automatically U; where a consumer is demonstrably absent, B is also shown.

## Remaining capability families

| Code | Missing capability or decision boundary |
|---|---|
| DECK | Copy-limit eligibility/config mapping, distinguished from existing validator support |
| COST | Card-specific color-conversion payment permissions, distinct from cast-price adjustment |
| VALUE | Effective mana value versus payment; selected-result-card fields; sums/division/floor/rounding |
| SOUL | Cause-attributed zero-life departures and zero-life replacement semantics |
| REVEAL | Captured windows, larger bounds, destination/selection/order workflows and repetition |
| USAGE | Ordinary per-game ability limits, shared/dynamic limits or nonstacking composition proof |
| EVENT | Off-zone source discovery and tap/draw-step/life-change/reveal provenance events |
| PAY | Atomic counter/material/exile payments and optional payment within triggered resolution |
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
| 2 | 幻影木偶* | B/W | DECK, VALUE | Twenty-copy policy is not mapped. Conditional cast pricing is supported, but clarify whether graveyard “cost considered as” changes effective mana value, grants ordinary graveyard casting/timing, or only changes payment. A price setter alone grants no zone permission. Attack-triggered graveyard deployment is supported. |
| 6 | 幻影巨人 | W | VALUE | Mill, attack-triggered graveyard deployment and conditional payment setters are supported. Resolve the meaning of graveyard “cost considered as” and whether it grants normal casting permission; effective mana-value changes or ordinary graveyard casting would need new consumers. Do not infer those permissions merely from the cost text. |
| 8 | 赫拉鬼火術 | B | SOUL | Need cause-attributed zero-life departures so only creatures soul-destroyed by this particular stat reduction are exiled. Ordinary destruction is not equivalent. |
| 10 | 幻影木偶工廠 | B | REVEAL, USAGE | Five-card window, move every matching creature to graveyard, order the remainder on top, and a once-per-game alternative. Existing reveal-to-hand/bottom and ability turn limits do not cover this. |
| 11 | 赫拉的營寨 | B/W | EVENT, USAGE | Player life-loss events exist; creature life/max-life reduction is not a general event. Both routes must share one draw per turn. Clarify which creature life changes qualify. |
| 12 | 幻像祭壇 | B | ENTRY | Exact milled-card recovery and black/type filters are now supported. Only atomic tapped entry remains; an entry trigger that later taps is observably different. |
| 13 | 幻影夢人 | B | EVENT, PAY | Need draw-step trigger and optional pay-two-life-then-draw branch. Life as an announced ability cost alone does not implement this triggered payment decision. |
| 14 | 幻影木偶 鬼斧 | B | SOUL | Permanent max-life reduction and turn-long bonus exist. Need an outcome tied to this reduction soul-destroying its target before awarding the bonus. |
| 15 | 幻影木偶 鬼火 | U | — | Existing optional mill result capture, black noncreature-type filter and exact-card recovery compose on entry and attack. Seven focused recipe tests cover this card and the scythe; definition/registration still to deliver. |
| 17 | 死亡組裝 | B/W | TOKEN | Multi-target friendly destruction is supported. Token creation, including the token's attack ability, is missing. Clarify whether successful destruction of all three is a prerequisite rather than only an instruction sequence. |
| 18 | 幻影木偶軍團長 | B | EXPIRY | Graveyard deployment exists. The +4 bonus must expire at this battle's end; end-of-turn expiry is not equivalent. |
| 19 | 幻影木偶智者* | W/P | VALUE, USAGE | Graveyard payment setter and phase/tribe/board-count stat conditions exist. Settle effective-cost/ordinary-casting intent and prove the printed nonstacking anthem across multiple copies; source-qualified grants must not be assumed to deduplicate. |
| 20 | 赫拉幻影術 | W | VALUE | Phase-dependent mana-value filtering and graveyard deployment are supported. Clarify “ignore all graveyard card effects”: printed-cost-only selection may use the existing fixed mana value; blanket suppression would require additional behavior. No unconditional engine blocker is established until this ruling. |
| 21 | 幻影魔鐮 鬼火 | U | — | Restricted attachment, +2 attack and granted attack-triggered exact-mill recovery compose with existing consumers; the grant stops when the weapon leaves. Live definition/registration still to deliver. |
| 22 | 幻影魔神 赫拉尼亞* | B/W | EVENT, PAY, VALUE | Discover the discarded card itself from hand/library, offer return versus optional paid deployment, and read that exact discarded card's mana value for the temporary reduction. Mill result membership alone supplies no selected-result-card mana-value accessor. Clarify trigger origin/timing when authored. |
| 23 | 幻影女王 赫拉 | B | PAY | Named-creature entry, charge counters, turn-limited activation and tapped-opponent destruction exist. Removing five charge counters must be an atomic activation payment, not a resolving REMOVE_COUNTER instruction. |

### 風獸

| Row | Card | Status | Families | Current disposition |
|---:|---|---|---|---|
| 5 | 風靈獸 刃狼 | B | REVEAL | Hand land deployment, own-hand-count condition and name-substring filters exist. Need five-card reveal and multiple choices with distinct printed names, then ordered remainder. |
| 10 | 風靈再生 | B | EVENT, EXPIRY | Need revealed-card discovery with the revealing source's name/provenance. Hand exchange exists. Alternate +1 attack requires battle expiry. |
| 14 | 風靈號角手 | W | — | Hand activation, self-discard payment, turn limit and name-substring selection exist. Owner explicitly deferred the unspecified special-summon origin. Choose the origin before deciding whether another engine change is needed; this is not a remaining filter blocker. |
| 15 | 風靈獸之子 | B | EXPIRY | Name-substring conditional +2/+2 is expressible. Tapping exists; skipping the target's next untap does not. |
| 17 | 獸帝的號令 | B | EVENT, REVEAL, PAY | Need reveal-self provenance and pay-one-green deployment from the same revealed window. The name filter and ordinary mana payment exist separately. |
| 18 | 風靈獸 號角手姆拉德* | B | REVEAL | Five-card reveal, optional free Land/Artifact deployment from that exact window, ordered bottom remainder. Filtering is no longer the blocker. |
| 19 | 風靈獸 旗手納馬蘭 | B/W | EVENT | Conditional removal of abilities from tapped opposing creatures is expressible. Need a tap event; clarify 回復 (untap or life recovery) and scope before implementing the response. |
| 20 | 風靈獸之怒 | B | EVENT | Tapping two opposing creatures is supported. Revealed-self recovery still needs discovery and source-name provenance. |
| 21 | 風靈獸 狂獅大將軍哈爾 | B | EXPIRY, USAGE | Multi-target tapping and eight damage exist. Need skip-next-untap and once-per-game ordinary activation. |
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
| 9 | 冰龍魔杖 | B/W | PAY | Restricted attachment, attack counters and bounce exist. Need counter removal as activation payment; clarify whether 此卡 means the staff or equipped host for placement/payment. |
| 10 | 冰龍呼喚 | B/W | REVEAL | Mandatory filtered take-one exists. Need conditional repetition of the whole reveal/choose/order workflow; clarify once-again versus recursive repetition before choosing a bounded recipe or repeat consumer. |
| 11 | 極光之盾 | B/W | DAMAGE | Need life-total floor across qualifying decreases, including direct life loss. Prevention alone is insufficient. Clarify behavior when life already starts below five. |
| 12 | 巨龍的祝福 | P | COUNTER | Multi-recipient counter placement exists. Prove each recipient gets one shared Aurora shield per turn, including giver leaving, repeated placements and counter removal/reapplication; no evidence yet certifies the full package. |
| 14 | 霜月守護者 | B/W | COMBAT | Need cancel-this-attack semantics; spell/ability countering does not cancel combat. Define whether this removes one attacker or ends the whole battle when implementing. |
| 15 | 冰陵之主 | B/W | DAMAGE | Counter/subtype-filtered rule scope and friendly attack/draw exist. True flat damage reduction is absent; prevention of one point is a different operation. Resolve friendly versus all marked ice dragons and reduction wording at implementation, as previously deferred. |
| 16 | 極北王冠 | B | USAGE | Equipment restriction, life condition, tapping and opposing-creature bottom moves exist. Ordinary once-per-game activation is missing. |
| 17 | 極光之壁 | B/P | COUNTER, COMBAT | Aurora contract needs proof. Spell countering exists; ending the attack phase after the current battle needs a scheduled combat transition. |
| 18 | 極北之指引者 萊莘德雅 | B/W | EVENT, REVEAL | Need off-battlefield source discovery for the departure-triggered self summon, plus two independent reveal categories. Clarify the source zone for the response. |
| 19 | 極光封 | B/W | STACK | Creature-ability countering exists. Need resolving the selected stack ability's source for bottom movement and clarify whether 其 refers to that creature. Countering alone cannot select its associated source. |
| 20 | 極光龍宮 | B/W/P | COUNTER, PAY | Aurora contract, selected-counter removal payment and an explicitly deferred special-summon origin. A resolving counter-removal effect must not stand in for payment. |
| 21 | 極光龍后 亞雅隆 | B/W/P | COUNTER | Need full per-recipient prevention grant semantics. Clarify the first ability's activation condition/timing; the workbook labels this apparent 4/8 creature as Land. Turn-long untargetability is already expressible. |
| 22 | 極北龍帝 亞瑟 | B/W | DAMAGE, VALUE | Count and multiply exist. Need defined per-dragon damage assignment and half-damage arithmetic/rounding; clarify repeated five-damage packets versus one summed packet and odd damage. |
| 23 | 巨龍之墓 | B/W/P | COUNTER, SOUL | Aurora contract plus replacing a zero-life state-based departure with optional artifact destruction and healing. Ordinary damage regeneration is not this replacement; clarify what life recovery means after max-life reduction. |
| 24 | 寒巢之主 亞蕾雅 | B | PAY, EXPIRY | Charge and creature-entry behavior exist. Need atomic four-counter payment and battle-lifetime protection for both players, rather than a turn-long approximation. |
| 25 | 諸界六皇 冬機之卡斯拿斯 | B/W | IMMUNITY, EVENT | Need immunity against opposing spell/creature effects, not just targeting. Also tap-triggered recovery during opponent attack phase; clarify 回復 and qualifying source effects. |

### 上使

| Row | Card | Status | Families | Current disposition |
|---:|---|---|---|---|
| 8 | 亞拉里亞最終兵器 天域神城 | B | TOKEN | Create the 1/1 vanilla angel token. Existing token cleanup does not create tokens. |
| 11 | 聖能術 · 速 | B | DRAW | Need drawing specifically from library bottom; ordinary DRAW consumes the top. |
| 12 | 亞拉里亞的終末 | B | USAGE, PAY | Global opposing destruction exists. Need once-per-game ordinary use and an atomic exile payment selecting the named emperor with at least five charge counters. |
| 13 | 天域之獸 | B | REVEAL, VALUE | Yellow-land selection exists. Need a captured revealed window whose yellow-card count determines life gained, while selecting from that same window. Mill-only result capture cannot certify this. |
| 14 | 天域三侯 坡加 | B/W | HOST, PAY, REVEAL | Need under-host land storage/release, the 縛鎖1 payment contract, and take-all-spells reveal handling. Settle where stored land is selected from. |
| 16 | 天域三侯 伊雲 | B | REVEAL, USAGE | Eight-card reveal, take all spells, exile remainder and ordinary once-per-game entry trigger. |
| 17 | 雷霆之門 | B | TOKEN, USAGE | Healing triggers and mana generation exist. Need token creation and once-per-game ordinary triggered usage. |
| 18 | 亞拉里亞的截擊 | B/W | STACK | Ability/spell countering exists. Need associated-source selection and source-zone-aware discard/destruction; clarify which effects are counterable and what happens to a source already gone. |
| 20 | 天使的皇座 | B/W | HOST, USAGE, PAY | Need under-host storage/release, 縛鎖3, the shared limit across abilities 2/3 and reversible changes to ability 1's use limit. Numeric modifier usage is not an ability-limit rewrite. |
| 21 | 天使女帝 蝶后 | B | EVENT, HEAL | Need hand-zone life-loss response with self-discard and a global healing-amount modifier. Existing battlefield triggers and damage modifiers do not implement these consumers. |
| 22 | 大天使 費蘭尼 | B | USAGE, VALUE, EXPIRY | Setting life to 30 is expressible through current life arithmetic. Still need once-per-game entry use, integer floor(life/5), and bonus expiring after this attack. |
| 23 | 天使皇 亞拉里亞 | B | PAY | Mana, healing, charge events and hand-to-battlefield deployment exist. Need optional five-counter payment inside the charge-triggered summon, with affordability checked before removal/deployment. |

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
| 17 | 魔海尖塔 | B | USAGE | Attack-phase mana-value cast prohibition and graveyard land deployment are expressible. Ordinary once-per-game activation remains missing. |
| 18 | 海神呼喚者 海耶 | B | REVEAL | Six-card window, independent giant/artifact selections and mill-remainder. Entry/attack opponent milling already works. |
| 20 | 幻變神殿 | B | MILL | Granted attack-mill exists. Need shared modification of other giants' mill quantity; do not rewrite one known card's printed amount. |
| 21 | 海神之怒 耶夢加得 | B/W | RANDOM, VALUE | Name-substring board condition and conditional payment setter exist. Random opposing-hand discard is missing; settle whether “consider cost as” also changes effective mana value. |
| 22 | 幻變之海 洛基尼亞 | B/W | REVEAL, VIEW | Need six-card opponent-library reveal, selected opponent-owned creature into your hand and milling remainder. Current moves use the owner's destination; define holder versus ownership and hidden-information projection without changing ownership silently. Opponent-creature-count mill amount exists. |
| 23 | 蒼海帝 洛基 | B | PAY, VIEW, COST | Need four-counter activation payment, opponent-library draw into your hand with reveal, and card-specific blue-as-any-color payment. Generic reductions/setters are not color-conversion permission. |
| 24 | 諸界六皇 萬智之德步尼* | B | USAGE, VALUE | Ten-card mill, count of creatures actually milled and proportional stat bonus are now supported by result queries. Still need once-per-game entry usage and floor(power/2) for attack mill; multiplication alone cannot divide/floor. |

## Gaps in registered cards and format policy

The 68 registered matches are not a second list of fully faithful cards. Existing gaps remain visible here:

- **Unlimited copies:** 血炎山, 幻影旅團地府, 萬獸聖國, 極光北地, 天使的聖地 and 蒼海領地 are registered, but the eligibility config currently grants unlimited copies only to the development `land-red`. This is a config-only correction under existing `unlimitedCopies` support.
- **Other copy exceptions:** 幻影魔城 and 諸界海 require singleton policy, while the missing 幻影木偶 permits twenty copies. The deck validator already accepts a numeric `copyLimit`; the authored eligibility config currently supplies only unlimited/excluded lists and the catalog mapping defaults ordinary cards to the format maximum. Extend that config/mapping rather than invent a second validator. Check the twenty-copy exception when implementing 幻影木偶.
- **Scorch on artifacts:** nine registered definitions explicitly retain `【暫緩：遺跡的灼熱破壞門檻】`. The accepted creature threshold uses current attack plus maximum life; the relic threshold still needs its own ruling. Their registration does not clear that caveat.
- **Excluded dual lands:** six registered dual lands use an entry-tap trigger rather than atomic tapped entry. They belong to the excluded supplement, so the audit records the fidelity gap without silently widening implementation scope.
- **Workbook format:** the workbook describes default three copies, at least sixty cards without an upper limit, and opening-seven/mulligan behavior. The current standard profile uses four copies and 60–250 cards; opening/setup rules are configured separately. Profile/setup alignment is separate work, not solved by registering definitions. U above is relative to the supported profile, not a claim that global workbook rules have been migrated.

A complete fidelity certification of the 68 registered matches is outside this missing-row audit. The historical inventory records their source text and coverage; the gaps above prevent interpreting coverage as a fidelity percentage.

## Suggested delivery order

1. Author and register the two proven Ghostfire recipes with their own release tests. That would raise definition coverage to **70/142**, leaving **72** missing, without a new engine mechanic.
2. Correct unlimited-copy config and extend the existing numeric copy-limit mapping. Settle effective-cost/graveyard-permission intent for the phantom cards; do not implement ordinary graveyard casting solely because cost text mentions that zone.
3. Add focused slices for atomic entry, ordinary per-game usage and shared captured-reveal workflows. Reuse the existing query/parser contract rather than create standalone zone-specific filters.
4. Prove and, where needed, complete the counter-owned Aurora/霜器 lifecycle; add counter payments. Reassess all dependent rows together, without treating partial coverage as full readiness.
5. Deliver cause-attributed soul outcomes, missing events/payments and combat lifetimes; then the broader host storage, ritual, random/cross-owner and immunity mechanics. Recount U after each complete tested slice rather than summing overlapping card-family counts.

Ask the deferred wording questions when their cards enter implementation. This audit records the delivery dependencies; the proposed mechanics remain future work.

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

Recomputed definition coverage from the explicit 94-import manifest and all 142 included named workbook rows; verified the source workbook SHA-256 against the extraction snapshot. Asserted exact table coverage of all 74 missing row identities and exactly two U dispositions. No live card JSON, mechanics, presets or policy changed.

**73 focused logic checks passed** across `card-blocker-probes`, `resolution-results`, `card-query`, `contracted-modifiers` and `equipment`. Seven are the new test-only composition proofs. No browser smoke test, full-game socket test or full suite was run. Historical reports retain their delivery counts and now point here for current blocker status.
