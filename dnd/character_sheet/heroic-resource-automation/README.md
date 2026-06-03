# Heroic Resource Automation

Heroic resource automation lives on a character sheet under `hero.resource.automation`.
It is separate from ability automation: ability JSON runs when a card is clicked,
while heroic-resource JSON listens to VTT combat events and offers confirmation
prompts before changing the resource.

## Supported Shape

```json
{
  "schema": "heroic-resource/v1",
  "rules": [
    {
      "id": "combat-start-victories",
      "event": "combatStart",
      "effect": { "kind": "set", "amount": { "from": "victories" } },
      "prompt": "Set {resource} to {amount}: combat start from Victories.",
      "autoApply": true
    },
    {
      "id": "turn-start",
      "event": "turnStart",
      "filter": { "whose": "self" },
      "effect": { "kind": "gain", "amount": { "dice": "1d3", "bonus": 1 } },
      "prompt": "Gain {amount} {resource}: start of your turn."
    },
    {
      "id": "once-per-round",
      "event": "damageDealt",
      "filter": { "whose": "self", "targetWhose": "judgedTarget" },
      "limit": { "scope": "round", "key": "wrath-judged-damage" },
      "effect": { "kind": "gain", "amount": 1 },
      "prompt": "Gain {amount} {resource}: you damaged a judged enemy for the first time this round."
    },
    {
      "id": "combat-end-reset",
      "event": "combatEnd",
      "effect": { "kind": "set", "amount": 0 },
      "prompt": "Reset {resource} to 0: combat ended.",
      "autoApply": true
    }
  ]
}
```

Rules prompt by default. When a rule matches, the GM client queues a popup
showing the amount and reason, and the resource changes only when the popup is
accepted. Set `autoApply: true` for deterministic rules that should apply
without confirmation, such as combat-start setup and combat-end reset.

## Rule Fields

| Field | Notes |
|---|---|
| `id` | Stable rule key. Also used as the default once-per-round flag key. |
| `event` | `combatStart`, `combatEnd`, `roundStart`, `roundEnd`, `turnStart`, `turnEnd`, `damage`, `damageDealt`, `forcedMovement`, `forcedMovementDealt`, `actionUsed`, `powerRoll`, `abilityTest`, or `abilityRoll`. |
| `filter.whose` | Matches the primary event actor: `self`, `ally`, `enemy`, `judgedTarget`, `markSource`, or `any`. |
| `filter.sourceWhose` | Matches `payload.sourceId`, useful for "a creature judged by you damages you." |
| `filter.targetWhose` | Matches event targets, useful for "you damage a creature judged by you." |
| `filter.withinSquares` | Chebyshev distance from the resource owner to the event target. |
| `filter.damageTypeNot` | Excludes damage types such as `["holy", "untyped"]`. |
| `filter.damageTypeAny` | Allows only listed damage types. |
| `filter.includesSurge` | Requires a damage payload to include `includesSurge`, `surgeSpent`, or `surgeCount`. Power-roll surge spends set this automatically. |
| `filter.minAmount` / `maxAmount` | Damage amount band. |
| `filter.minDistance` / `maxDistance` | Forced movement distance band. |
| `filter.actionKind`, `costIncludes`, `keywordsAny`, `verb` | Additional event filters. |
| `limit.scope` | `round`, `turn`, or `encounter`. |
| `limit.key` | Scoped flag key. |
| `limit.markOn` | `offered` by default, or `applied`. |
| `effect.kind` | `gain`, `lose`, `set`, or `damage`. |
| `effect.amount` | Number, dice string like `1d3`, `{ "from": "victories" }`, `{ "from": "negativeResource" }`, or level-based objects. |
| `prompt` | Template using `{action}`, `{amount}`, `{resource}`, `{reason}`, `{current}`, `{next}`, and `{round}`. |
| `autoApply` | Optional boolean. `true` skips the confirmation popup and applies the rule immediately. |

## Amount Examples

```json
{ "amount": 2 }
{ "amount": "1d3" }
{ "amount": { "dice": "1d3", "bonus": 1 } }
{ "amount": { "from": "victories" } }
{ "amount": { "from": "negativeResource" } }
{
  "amount": {
    "amountByLevel": [
      { "min": 1, "amount": 1 },
      { "min": 4, "amount": 2 },
      { "min": 10, "amount": 3 }
    ]
  }
}
```

## Source Inventory

| Class | Rule | Status |
|---|---|---|
| Shadow | Combat start: gain Insight equal to Victories. | Codeable now: `combatStart` + `set` from `victories`. |
| Shadow | Start turn: gain `1d3` Insight. | Codeable now: `turnStart`, `whose:self`, `dice:"1d3"`. |
| Shadow | Keen Insight: start-turn gain becomes `1d3 + 1`. | Codeable now with `bonusByLevel` or edited JSON. |
| Shadow | First surge-including damage each round gives Insight, upgraded by Surge of Insight and Death Pool. | Codeable now for automated power-roll damage with the surge button: `damageDealt`, `includesSurge:true`, round limit. Upgrade amount by editing the rule amount. |
| Shadow | Combat end: lose remaining Insight. | Codeable now: `combatEnd` + `set:0`. |
| Censor | Combat start: gain Wrath equal to Victories. | Codeable now. |
| Censor | Start turn: gain 2 Wrath; Focused Wrath upgrades to 3. | Codeable now with level-based amount or edited JSON. |
| Censor | First each round that a judged creature damages you: gain 1 Wrath. | Codeable now: `damage`, `whose:self`, `sourceWhose:judgedTarget`, round limit. |
| Censor | First each round that you damage a judged creature: gain Wrath, with Wrath Beyond Wrath and Wrath of the Gods upgrades. | Codeable now: `damageDealt`, `whose:self`, `targetWhose:judgedTarget`, level-based amount, round limit. |
| Censor | Combat end: lose remaining Wrath. | Codeable now. |
| Talent | Combat start: gain Clarity equal to Victories. | Codeable now. |
| Talent | Start turn: gain `1d3` Clarity; Lucid Mind/Psion upgrades. | Codeable now with `dice` and `bonusByLevel`. |
| Talent | First each round that a creature is force moved: gain Clarity, upgraded by Mind Recovery and Clear Mind. | Codeable now: `forcedMovement`, round limit, level-based amount. |
| Talent | Negative Clarity damage at end of turn. | Codeable now: `turnEnd`, `whose:self`, `damage`, `{ "from": "negativeResource" }`. |
| Talent | Combat end: reset positive or negative Clarity to 0. | Codeable now. |
| Elementalist | Combat start: gain Essence equal to Victories. | Codeable now. |
| Elementalist | Start turn: gain 2 Essence; Surging Essence/Essential Being upgrades. | Codeable now with level-based amount. |
| Elementalist | First each round that you or a creature within 10 squares takes non-untyped/non-holy damage: gain Essence, upgraded by Font of Essence. | Codeable now: `damage`, `withinSquares:10`, `damageTypeNot:["untyped","holy"]`, round limit. |
| Elementalist | Persistent Magic reduces start-turn Essence gain. | Mostly codeable through existing persistent-zone upkeep, which deducts resource at owner start turn. Exact "reduce the gain before earning" ordering is not modeled as part of heroic-resource JSON yet. |
| Elementalist | Combat end: lose remaining Essence. | Codeable now. |
