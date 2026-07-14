# Sharon — VTT Automations

Paste-ready ability-automation and heroic-resource JSON for **Sharon** (Level 4 Elf, high — Shadow, College of Black Ash, Criminal). Each ability block goes into that ability's **Automate** button on the character sheet; the kit block goes on the kit *feature's* Automate button; the Insight block goes in the sheet's heroic-resource automation field.

See `../../character_sheet/ability-automation/AUTHORING.md` and `REGISTRY.md` for the schema.

## Authoring decisions (read first)

- **Agility is 3** at level 4. Damage that scales off a characteristic is authored as **base + `attribute`** (e.g. `"amount": 5, "attribute": "A"`) so it auto-scales with her real Agility. The printed PDF card numbers were stale (built at Agility 2, inconsistent about the kit bonus) and are intentionally *not* copied verbatim.
- **The Whirlwind kit is a feature.** Its **+1/+1/+1 melee damage** is a feature `modifier`, so it is added automatically to every melee weapon strike — it is **not** baked into the individual ability JSON. For mixed melee/ranged abilities a `choice` card narrows the keywords first, so the +1 only lands on the melee option.
- **Ranges are baked per her sheet** (which already includes the kit's +1 melee distance, e.g. Get In Get Out = Melee 2). The kit JSON does not also add a distance modifier.
- **Book rules text lives in `fields`** so each card stays human-readable; `automation` is what the VTT runs.
- Effects flagged `"raw": true` ignore feature modifiers (used so the kit +1 isn't double-counted on rider damage).

---

## Whirlwind Kit (paste on the kit *feature*)

```json
{
  "schema": "ability-automation/v3",
  "modifiers": [
    {
      "label": "Whirlwind Kit — Melee Damage +1",
      "match": { "keywordsAll": ["Melee", "Weapon"] },
      "apply": {
        "damageBonus": 1,
        "note": "Whirlwind kit. Equipment: no armor, wield a whip. Kit Bonuses — Speed +3, Melee Damage +1/+1/+1, Melee Distance +1, Disengage +1 (Speed/Distance/Disengage are set on the sheet stats; this rule applies the +1 melee weapon damage to your strikes). Signature Ability: Extension of My Arm."
      }
    }
  ]
}
```

---

## I Work Better Alone (signature — book version)

Per the book: if the target has none of your allies adjacent to them, you gain **1 surge before making the power roll**. The surge prompt fires after you pick the target and before the roll modal opens, so the surge is available to spend on that strike. (Range is Melee 2 on her sheet — book Melee 1 + Whirlwind kit's +1 melee distance.)

```json
{
  "fields": {
    "name": "I Work Better Alone",
    "actionLabel": "Main Action",
    "keywords": "Melee, Ranged, Strike, Weapon",
    "range": "Melee 2 or Ranged 5",
    "target": "One creature",
    "description": "\"It's better, just you and me. Isn't it?\"",
    "testLabel": "Power Roll + Agility",
    "testRollMod": "Agility",
    "testBeforeEffect": "If the target has none of your allies adjacent to them, you gain 1 surge before making the power roll.",
    "tier1Damage": "3 + A",
    "tier2Damage": "6 + A",
    "tier3Damage": "9 + A"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": ["Melee", "Ranged", "Strike", "Weapon"],
    "cards": [
      {
        "type": "choice",
        "name": "range",
        "prompt": "Use at melee or ranged?",
        "options": [
          {
            "id": "melee",
            "label": "Melee 2",
            "keywords": ["Melee", "Strike", "Weapon"],
            "cards": [
              { "type": "target", "name": "target", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "exact" }, "distance": { "form": "melee", "value": 2 } }
            ]
          },
          {
            "id": "ranged",
            "label": "Ranged 5",
            "keywords": ["Ranged", "Strike", "Weapon"],
            "cards": [
              { "type": "target", "name": "target", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "exact" }, "distance": { "form": "ranged", "value": 5 } }
            ]
          }
        ]
      },
      {
        "type": "effect",
        "target": "self",
        "effects": [
          {
            "kind": "ifPrompt",
            "question": "Does {target} have any of your allies adjacent to them?",
            "yesLabel": "Yes",
            "noLabel": "No — gain 1 surge",
            "target": "self",
            "then": [],
            "else": [ { "kind": "surgeGain", "amount": 1 } ]
          }
        ]
      },
      {
        "type": "powerRoll",
        "attribute": "Agility",
        "target": "target",
        "tiers": {
          "tier1": { "effects": [ { "kind": "damage", "amount": 3, "attribute": "A" } ] },
          "tier2": { "effects": [ { "kind": "damage", "amount": 6, "attribute": "A" } ] },
          "tier3": { "effects": [ { "kind": "damage", "amount": 9, "attribute": "A" } ] }
        }
      }
    ]
  }
}
```

---

## Get In Get Out (3 Insight)

```json
{
  "fields": {
    "name": "Get In Get Out",
    "actionLabel": "Main Action",
    "keywords": "Melee, Strike, Weapon",
    "range": "Melee 2",
    "target": "One creature",
    "cost": "3 Insight",
    "description": "Move unexpectedly, strike fast, and be gone!",
    "testLabel": "Power Roll + Agility",
    "testRollMod": "Agility",
    "tier1Damage": "5 + A",
    "tier2Damage": "8 + A",
    "tier3Damage": "11 + A",
    "testAdditionalEffect": "You can shift up to your speed, dividing that movement before or after your strike as desired."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": ["Melee", "Strike", "Weapon"],
    "cards": [
      { "type": "effect", "effects": [ { "kind": "shift", "distance": "speed", "pool": "get-in-get-out", "label": "Shift before the strike (from your Speed)." } ] },
      { "type": "target", "name": "target", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "exact" }, "distance": { "form": "melee", "value": 2 } },
      {
        "type": "powerRoll",
        "attribute": "Agility",
        "target": "target",
        "tiers": {
          "tier1": { "effects": [ { "kind": "damage", "amount": 5, "attribute": "A" } ] },
          "tier2": { "effects": [ { "kind": "damage", "amount": 8, "attribute": "A" } ] },
          "tier3": { "effects": [ { "kind": "damage", "amount": 11, "attribute": "A" } ] }
        }
      },
      { "type": "effect", "effects": [ { "kind": "shift", "distance": "speed", "pool": "get-in-get-out", "label": "Shift after the strike (remaining Speed)." } ] }
    ]
  }
}
```

The two `shift` effects share one Speed pool — move some before the strike, the rest after.

---

## Extension of My Arm (Whirlwind signature)

```json
{
  "fields": {
    "name": "Extension of My Arm",
    "actionLabel": "Main Action",
    "keywords": "Melee, Strike, Weapon",
    "range": "Melee 3",
    "target": "One creature",
    "description": "When you draw your whip back after an attack, your enemy is drawn ever closer.",
    "testLabel": "Power Roll + Might or Agility",
    "testRollMod": "Might or Agility",
    "tier1Damage": "4 + M or A",
    "tier1Notes": "pull 1",
    "tier2Damage": "7 + M or A",
    "tier2Notes": "pull 2",
    "tier3Damage": "10 + M or A",
    "tier3Notes": "pull 3"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": ["Melee", "Strike", "Weapon"],
    "cards": [
      { "type": "target", "name": "target", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "exact" }, "distance": { "form": "melee", "value": 3 } },
      {
        "type": "powerRoll",
        "attribute": ["M", "A"],
        "target": "target",
        "tiers": {
          "tier1": { "effects": [ { "kind": "damage", "amount": 4, "attribute": ["M", "A"] }, { "kind": "forcedMovement", "verb": "pull", "distance": 1 } ] },
          "tier2": { "effects": [ { "kind": "damage", "amount": 7, "attribute": ["M", "A"] }, { "kind": "forcedMovement", "verb": "pull", "distance": 2 } ] },
          "tier3": { "effects": [ { "kind": "damage", "amount": 10, "attribute": ["M", "A"] }, { "kind": "forcedMovement", "verb": "pull", "distance": 3 } ] }
        }
      }
    ]
  }
}
```

Regular **pull** (toward you), shown as "pull 1/2/3". `["M","A"]` = higher of Might or Agility.

---

## Pinning Shot (7 Insight)

Ranged-only, per the book.

```json
{
  "fields": {
    "name": "Pinning Shot",
    "actionLabel": "Main Action",
    "keywords": "Ranged, Strike, Weapon",
    "range": "Ranged 5",
    "target": "One creature",
    "cost": "7 Insight",
    "description": "One missile—placed well and placed hard.",
    "testLabel": "Power Roll + Agility",
    "testRollMod": "Agility",
    "tier1Damage": "8 + A",
    "tier1Notes": "A<weak, restrained (save ends)",
    "tier2Damage": "12 + A",
    "tier2Notes": "A<average, restrained (save ends)",
    "tier3Damage": "16 + A",
    "tier3Notes": "A<strong, restrained (save ends)"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": ["Ranged", "Strike", "Weapon"],
    "cards": [
      { "type": "target", "name": "target", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "exact" }, "distance": { "form": "ranged", "value": 5 } },
      {
        "type": "powerRoll",
        "attribute": "Agility",
        "target": "target",
        "tiers": {
          "tier1": { "effects": [ { "kind": "damage", "amount": 8, "attribute": "A" }, { "kind": "potency", "attribute": "A", "level": "weak", "onFail": [ { "kind": "condition", "name": "restrained", "duration": "saveEnds" } ] } ] },
          "tier2": { "effects": [ { "kind": "damage", "amount": 12, "attribute": "A" }, { "kind": "potency", "attribute": "A", "level": "average", "onFail": [ { "kind": "condition", "name": "restrained", "duration": "saveEnds" } ] } ] },
          "tier3": { "effects": [ { "kind": "damage", "amount": 16, "attribute": "A" }, { "kind": "potency", "attribute": "A", "level": "strong", "onFail": [ { "kind": "condition", "name": "restrained", "duration": "saveEnds" } ] } ] }
        }
      }
    ]
  }
}
```

---

## In All This Confusion (with Too Slow + Burning Ash built in)

**Flow:** take damage → click the `!` → halve the damage → asks "Spend 5 Insight?" *only if affordable* (the Too Slow gate; if yes → free strike the attacker → asks about the Recovery → shows the Too Slow "ignore effects" reminder) → asks how much extra Insight to teleport, then teleports → asks who takes the Burning Ash fire damage.

> Note: the "spend to teleport farther" question pops at the teleport step (free strike must happen first), and the ignore-effects reminder shows as the last part of the Too Slow step rather than dead last. All mechanics are in the correct order.

```json
{
  "fields": {
    "name": "In All This Confusion",
    "actionLabel": "Triggered Action",
    "keywords": "Magic",
    "range": "Self",
    "target": "Self",
    "trigger": "You take damage.",
    "description": "You vanish in a plume of black smoke to avoid danger.\n\nEffect: You take half the damage, then can teleport up to 4 squares after the triggering effect resolves.\nSpend 1+ Insight: You teleport 1 additional square for each insight spent.\n\nToo Slow (5 Insight, built in): You ignore any effects associated with the triggering damage. Before you teleport, you can make a free strike against a creature who damaged you. After you teleport, you can spend a Recovery.\n\nBurning Ash: The first time on a turn you teleport away from or into a space adjacent to an enemy, that enemy takes fire damage equal to your Agility."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": ["Magic"],
    "cards": [
      {
        "type": "trigger",
        "condition": "You take damage.",
        "match": { "event": "damage", "filter": { "whose": "self", "minAmount": 1 } }
      },
      { "type": "effect", "effects": [ { "kind": "halveTriggeringDamage", "rounding": "down" } ] },
      {
        "type": "effect",
        "effects": [
          {
            "kind": "spend",
            "resource": "Insight",
            "amount": 5,
            "timing": "preRoll",
            "effects": [
              { "kind": "freeStrike", "asPowerRoll": true, "against": "enemy", "text": "Too Slow: free strike a creature that damaged you." },
              { "kind": "ifPrompt", "question": "Spend a Recovery?", "yesLabel": "Yes", "noLabel": "No", "target": "self", "then": [ { "kind": "heal", "recoveries": 1, "target": "self" } ], "else": [] },
              { "kind": "note", "text": "Too Slow: ignore any effects associated with the triggering damage." }
            ]
          }
        ]
      },
      {
        "type": "effect",
        "effects": [
          { "kind": "teleport", "distance": 4, "spend": { "resource": "Insight", "amount": 1, "maxAmount": "available", "perAmount": 1, "prompt": "Spend Insight to teleport 1 extra square per Insight?" } }
        ]
      },
      { "type": "target", "name": "burningAsh", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "upTo" }, "optional": true, "promptTitle": "Burning Ash (optional)", "promptText": "First time this turn: pick the enemy you teleported away from or adjacent to.", "distance": { "form": "ranged", "value": 12 } },
      { "type": "effect", "target": "burningAsh", "effects": [ { "kind": "damage", "amount": 0, "attribute": "A", "damageType": "fire", "raw": true } ] }
    ]
  }
}
```

---

## Hesitation Is Weakness (1 Insight, Free Triggered)

Using this fires a real `turnStart` for Sharon, so her Insight resource rule will prompt the +1d3 start-of-turn gain right after she claims the turn.

The trigger filter uses `excludeSelf` (don't arm off Sharon's own turn end — `whose: "ally"` is a team check that includes self) and `casterHasNotActed` (stop arming once Sharon has taken her turn this round, however she took it). The round-scoped `usageLimit` also suppresses re-arming after the ability is used. **Re-paste this block onto the ability** — the fix lives in the filter fields below.

```json
{
  "fields": {
    "name": "Hesitation Is Weakness",
    "actionLabel": "Free Triggered Action",
    "keywords": "",
    "range": "Self",
    "target": "Self",
    "cost": "1 Insight",
    "trigger": "Another hero ends their turn. That hero can't have used this ability to start their turn.",
    "description": "Keep up the attack. Never give them a moment's grace.\n\nEffect: You take your turn after the triggering hero."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "usageLimit": { "scope": "round", "key": "hesitation-is-weakness", "target": "self" },
    "keywords": ["Free", "FreeTriggered"],
    "cards": [
      {
        "type": "trigger",
        "condition": "Another hero ends their turn (and didn't use Hesitation Is Weakness to start their turn).",
        "match": { "event": "turnEnd", "filter": { "whose": "ally", "excludeSelf": true, "casterHasNotActed": true } }
      },
      {
        "type": "effect",
        "effects": [
          { "kind": "startTurn", "target": "self", "condition": "enemyPickNoActive", "confirmOnInvalid": true, "invalidMessage": "It's not currently a clean moment to claim a turn. Use Hesitation Is Weakness anyway? (Still spends 1 Insight.)" }
        ]
      }
    ]
  }
}
```

---

## Black Ash Teleport (Maneuver)

```json
{
  "fields": {
    "name": "Black Ash Teleport",
    "actionLabel": "Maneuver",
    "keywords": "Magic",
    "range": "Self",
    "target": "Self",
    "description": "In a swirl of black ash, you step from one place to another.\n\nEffect: You teleport up to 5 squares. If you have concealment or cover at your destination, you can use the Hide maneuver even if you are observed. If you successfully hide using this maneuver, you gain 1 surge.\nSpend 1+ Insight: You teleport 1 additional square for each insight spent.\n\nBurning Ash: The first time on a turn you teleport away from or into a space adjacent to an enemy, that enemy takes fire damage equal to your Agility."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": ["Magic"],
    "cards": [
      {
        "type": "effect",
        "effects": [
          { "kind": "teleport", "distance": 5, "spend": { "resource": "Insight", "amount": 1, "maxAmount": "available", "perAmount": 1, "prompt": "Spend Insight to teleport 1 extra square per Insight?" } }
        ]
      },
      {
        "type": "effect",
        "effects": [
          { "kind": "ifPrompt", "question": "Hide at your destination (concealment/cover)?", "yesLabel": "Yes — gain 1 surge", "noLabel": "No", "target": "self", "then": [ { "kind": "surgeGain", "amount": 1, "target": "self" } ], "else": [] }
        ]
      },
      { "type": "target", "name": "burningAsh", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "upTo" }, "optional": true, "promptTitle": "Burning Ash (optional)", "promptText": "First time this turn: pick the enemy you teleported away from or adjacent to.", "distance": { "form": "ranged", "value": 12 } },
      { "type": "effect", "target": "burningAsh", "effects": [ { "kind": "damage", "amount": 0, "attribute": "A", "damageType": "fire", "raw": true } ] }
    ]
  }
}
```

---

## Night Watch (Triggered)

```json
{
  "fields": {
    "name": "Night Watch",
    "actionLabel": "Triggered Action",
    "keywords": "Ranged, Weapon",
    "range": "Ranged 5",
    "target": "One ally",
    "trigger": "An ally within 5 squares takes damage from another creature's ability while you are hidden.",
    "description": "A steely dagger from out of the blue knocks another weapon off course.\n\nEffect: The target takes half the damage. You remain hidden."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": ["Ranged", "Weapon"],
    "cards": [
      {
        "type": "trigger",
        "condition": "An ally within 5 squares takes damage from another creature's ability while you are hidden.",
        "match": { "event": "damage", "filter": { "whose": "ally", "minAmount": 1, "withinSquares": 5 } }
      },
      { "type": "effect", "effects": [ { "kind": "halveTriggeringDamage", "rounding": "down" } ] },
      { "type": "effect", "effects": [ { "kind": "note", "text": "You remain hidden." } ] }
    ]
  }
}
```

"While you are hidden" stays a manual check before resolving the `!`.

---

## Careful Observation (Maneuver)

```json
{
  "fields": {
    "name": "Careful Observation",
    "actionLabel": "Maneuver",
    "keywords": "Ranged",
    "range": "Ranged 20",
    "target": "One creature",
    "description": "A moment of focus leaves a foe firmly in your sights.\n\nEffect: As long as you remain within distance of the target, maintain line of effect to them, and strike no other creature first, you gain an edge on the next strike you make against the assessed creature, and gain 1 surge you can use only on that strike."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": ["Ranged"],
    "cards": [
      { "type": "target", "name": "assessed", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "exact" }, "distance": { "form": "ranged", "value": 20 } },
      {
        "type": "effect",
        "target": "self",
        "effects": [
          { "kind": "surgeGain", "amount": 1, "target": "self" },
          { "kind": "condition", "name": "hiddenEffect", "label": "Careful Observation: edge on next strike vs the assessed creature", "duration": "endOfEncounter", "target": "self", "rider": { "type": "rollModifier", "modifier": "edge", "appliesTo": { "rollEvent": "powerRoll", "keywordsAny": ["Strike"] }, "consume": "nextMatchingRoll" } },
          { "kind": "note", "text": "Edge applies only to your next strike vs the assessed creature, and only if you stay in range, keep line of effect, and strike no one else first." }
        ]
      }
    ]
  }
}
```

The "only vs the assessed creature / strike no one else first" conditions can't be enforced by the engine — honor them manually.

---

## Shadowstrike (5 Insight)

```json
{
  "fields": {
    "name": "Shadowstrike",
    "actionLabel": "Main Action",
    "keywords": "Magic, Melee, Ranged",
    "range": "Self",
    "target": "Self",
    "cost": "5 Insight",
    "description": "They have no idea what the college taught you.\n\nEffect: You use a strike signature ability twice."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": ["Magic", "Melee", "Ranged"],
    "cards": [
      { "type": "effect", "effects": [ { "kind": "note", "text": "Shadowstrike: now run your signature strike (I Work Better Alone) twice." } ] }
    ]
  }
}
```

The 5 Insight is charged via the `cost` field; then run I Work Better Alone twice.

---

## Free Strike (Melee)

Standard 2/5/7 + highest of Might/Agility. With Agility 3 + Whirlwind +1 → 6/9/11.

```json
{
  "fields": {
    "name": "Free Strike (Melee)",
    "actionLabel": "Free Strike",
    "keywords": "Charge, Melee, Strike, Weapon",
    "range": "Melee 2",
    "target": "One creature or object",
    "testLabel": "Power Roll + Might or Agility",
    "testRollMod": "Might or Agility",
    "tier1Damage": "2 + M or A",
    "tier2Damage": "5 + M or A",
    "tier3Damage": "7 + M or A"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": ["Charge", "Melee", "Strike", "Weapon", "FreeStrike"],
    "cards": [
      { "type": "target", "name": "target", "mode": "token", "predicate": "creatureOrObject", "count": { "value": 1, "mode": "exact" }, "distance": { "form": "melee", "value": 2 } },
      {
        "type": "powerRoll",
        "attribute": ["M", "A"],
        "target": "target",
        "tiers": {
          "tier1": { "effects": [ { "kind": "damage", "amount": 2, "attribute": ["M", "A"] } ] },
          "tier2": { "effects": [ { "kind": "damage", "amount": 5, "attribute": ["M", "A"] } ] },
          "tier3": { "effects": [ { "kind": "damage", "amount": 7, "attribute": ["M", "A"] } ] }
        }
      }
    ]
  }
}
```

---

## Free Strike (Ranged)

No kit bonus (kit is melee-only) → 5/8/10 at Agility 3. Her PDF card shows 4/6/8; if her ranged weapon genuinely has a lower base, hard-code those numbers instead.

```json
{
  "fields": {
    "name": "Free Strike (Ranged)",
    "actionLabel": "Free Strike",
    "keywords": "Ranged, Strike, Weapon",
    "range": "Ranged 5",
    "target": "One creature or object",
    "testLabel": "Power Roll + Might or Agility",
    "testRollMod": "Might or Agility",
    "tier1Damage": "2 + M or A",
    "tier2Damage": "5 + M or A",
    "tier3Damage": "7 + M or A"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": ["Ranged", "Strike", "Weapon", "FreeStrike"],
    "cards": [
      { "type": "target", "name": "target", "mode": "token", "predicate": "creatureOrObject", "count": { "value": 1, "mode": "exact" }, "distance": { "form": "ranged", "value": 5 } },
      {
        "type": "powerRoll",
        "attribute": ["M", "A"],
        "target": "target",
        "tiers": {
          "tier1": { "effects": [ { "kind": "damage", "amount": 2, "attribute": ["M", "A"] } ] },
          "tier2": { "effects": [ { "kind": "damage", "amount": 5, "attribute": ["M", "A"] } ] },
          "tier3": { "effects": [ { "kind": "damage", "amount": 7, "attribute": ["M", "A"] } ] }
        }
      }
    ]
  }
}
```

---

## Heroic Resource — Insight (paste in the sheet's heroic-resource automation field)

```json
{
  "schema": "heroic-resource/v1",
  "rules": [
    {
      "id": "insight-combat-start",
      "event": "combatStart",
      "effect": { "kind": "set", "amount": { "from": "victories" } },
      "prompt": "Set {resource} to {amount}: combat start (from Victories).",
      "autoApply": true
    },
    {
      "id": "insight-turn-start",
      "event": "turnStart",
      "filter": { "whose": "self" },
      "effect": { "kind": "gain", "amount": "1d3" },
      "prompt": "Gain {amount} {resource}: start of your turn."
    },
    {
      "id": "insight-first-surge-damage",
      "event": "damageDealt",
      "filter": { "whose": "self", "includesSurge": true },
      "limit": { "scope": "round", "key": "insight-surge-damage" },
      "effect": { "kind": "gain", "amount": 2 },
      "prompt": "Gain {amount} {resource}: first surge damage this round (Surge of Insight upgrade)."
    },
    {
      "id": "insight-combat-end",
      "event": "combatEnd",
      "effect": { "kind": "set", "amount": 0 },
      "prompt": "Reset {resource} to 0: combat ended.",
      "autoApply": true
    }
  ]
}
```

Covers: combat-start = Victories, +1d3 each turn, first surge-damage each round = **+2** (Surge of Insight folded in), reset at combat end. The "power-roll ability costs 1 less Insight with an edge" rule has no resource hook — adjust manually.

---

## Intentionally left manual (no combat automation hook)

- **Social / skill features:** Bespoke Culture, Criminal Contacts, High Elf Glamor, High Senses, Keep It Down, Spot the Tell.
- **Catapult Dust** — multi-step narrative siege effect.
- **Unstoppable Mind ("can't be dazed")** — no condition-immunity passive type exists yet.
- **Artifact Bonded (complication)** — narrative trigger; Recovery-loss drawback applied by hand.
