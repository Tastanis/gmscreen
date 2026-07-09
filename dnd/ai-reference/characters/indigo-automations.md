# Indigo - VTT Automations

Paste-ready ability-automation and heroic-resource JSON for **Indigo** (Level 2 Talent, Telepathy).

These blocks were generated from the character-sheet LLM export and normalized against the current `ability-automation/v3` and `heroic-resource/v1` code paths. Each ability block goes into that ability's **Automate** button; feature blocks go on that feature's **Automate** button; heroic-resource JSON goes in the sheet's heroic-resource automation field.

See `../../character_sheet/ability-automation/AUTHORING.md`, `../../character_sheet/ability-automation/REGISTRY.md`, and `../../character_sheet/heroic-resource-automation/README.md` for the schema.

## Validation notes

- Validated 13 feature/action automation blocks with `AbilityAutomationSchema.normalizeAutomation()`; 0 warnings after normalization.
- Validated 5 heroic-resource rules with `normalizeHeroicResourceAutomation()`; 0 warnings.
- Updated `Free Strike (ranged)` from the stale string attribute `"M,A"` to the current array form `["Might", "Agility"]` for the power roll and damage scaling.

## Authoring decisions

- The visible card text is preserved in `fields`; the runnable VTT behavior lives in `automation`.
- Saved export `warnings` and `_extra` metadata were removed; the blocks below were re-normalized against the current runtime schema.
- Manual-only abilities and features are listed near the bottom so omissions are explicit.

## Feature automations

### Force augmentation

Live feature id: `feature_1779855357534_0944dae254f7a`.

Your damage-dealing psionic abilities gain a +1 bonus to rolled damage.

```json
COPY START
{
  "schema": "ability-automation/v3",
  "version": 3,
  "cards": [],
  "modifiers": [
    {
      "match": {
        "keywordsAll": [
          "Psionic"
        ],
        "keywordsAny": [],
        "keywordsNone": [],
        "damageType": "",
        "attribute": ""
      },
      "apply": {
        "damageBonus": 1,
        "rangeBonus": 0,
        "forcedMovementBonus": 0,
        "damageType": "",
        "note": "Your damage-dealing psionic abilities gain a +1 bonus to rolled damage."
      },
      "label": "Force Augmentation"
    }
  ],
  "passives": [],
  "keywords": [],
  "usageLimit": null
}
COPY END
```

## Main Actions

### Incinerate

Live action id: `action_1766441352951_096eb6e094fdf`.

Main action | Area,Fire,Psionic,Pyrokinesis,Ranged | Range: 3 cube within 10 | Target: Each enemy in the area

The air erupts into a column of smokeless flame. Effect: A column of fire remains in the area until the start of your next turn. Each enemy who enters the area for the first time in a combat round or starts their turn there takes 2 fire damage. Strained: The size of the cube increases by 2, but the fire disappears at the end of your turn.

```json
COPY START
{
  "fields": {
    "name": "Incinerate",
    "useWhen": "there are lots of enemies clumped up",
    "actionLabel": "Main action",
    "keywords": "Area,Fire,Psionic,Pyrokinesis,Ranged",
    "range": "3 cube within 10",
    "target": "Each enemy in the area",
    "description": "The air erupts into a column of smokeless flame. Effect: A column of fire remains in the area until the start of your next turn. Each enemy who enters the area for the first time in a combat round or starts their turn there takes 2 fire damage. Strained: The size of the cube increases by 2, but the fire disappears at the end of your turn.",
    "testLabel": "Power Roll + Reason",
    "testAdditionalEffect": "A column of fire remains in the area until the start of your next turn. Each enemy who enters the area for the first time in a combat round or starts their turn there takes 2 fire damage.\n\nStrained The size of the cube increases by 2, but the fire disappears at the end of your turn.",
    "tier1Damage": "2",
    "tier1DamageType": "fire",
    "tier1Attribute": "Might",
    "tier1Threshold": "1",
    "tier1AttributeEffect": "targetg is not able to move anymore",
    "tier2Damage": "4",
    "tier2DamageType": "fire",
    "tier3Damage": "6",
    "tier3DamageType": "fire"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "branch",
        "id": "branch_1780022654291_38fc3cc519406",
        "condition": {
          "kind": "strained"
        },
        "then": [
          {
            "type": "target",
            "id": "target_1780022654291_11e1376a979c78",
            "name": "flames",
            "mode": "area",
            "predicate": "enemy",
            "count": {
              "value": 1,
              "mode": "exact"
            },
            "optional": false,
            "promptTitle": "Place Incinerate",
            "promptText": "Strained: place a 5 cube within 10.",
            "distance": {
              "form": "cube",
              "value": 5,
              "secondary": 0,
              "within": 10
            },
            "shape": "cube",
            "size": 5
          }
        ],
        "else": [
          {
            "type": "target",
            "id": "target_1780022654291_d42ae0468b5ac",
            "name": "flames",
            "mode": "area",
            "predicate": "enemy",
            "count": {
              "value": 1,
              "mode": "exact"
            },
            "optional": false,
            "promptTitle": "Place Incinerate",
            "promptText": "Place a 3 cube within 10.",
            "distance": {
              "form": "cube",
              "value": 3,
              "secondary": 0,
              "within": 10
            },
            "shape": "cube",
            "size": 3
          }
        ]
      },
      {
        "type": "powerRoll",
        "id": "powerroll_1780022654291_69cebbb11160b8",
        "attribute": "Reason",
        "bonus": 0,
        "target": "flames",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 2,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "fire"
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 4,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "fire"
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 6,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "fire"
              }
            ]
          }
        }
      },
      {
        "type": "branch",
        "id": "branch_1780022654291_0fdc04f4901728",
        "condition": {
          "kind": "strained"
        },
        "then": [
          {
            "type": "persistent",
            "id": "persistent_1780022654291_f81e149bdeb498",
            "cost": 0,
            "resource": "",
            "tickAt": "never",
            "expiresAt": "endOfTurn",
            "triggers": [
              "onEnter",
              "onOccupantTurnStart"
            ],
            "effects": [
              {
                "kind": "damage",
                "amount": 2,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "fire"
              }
            ],
            "target": "flames"
          }
        ],
        "else": [
          {
            "type": "persistent",
            "id": "persistent_1780022654291_f8f7a3dd0d4078",
            "cost": 0,
            "resource": "",
            "tickAt": "never",
            "expiresAt": "startOfTurn",
            "triggers": [
              "onEnter",
              "onOccupantTurnStart"
            ],
            "effects": [
              {
                "kind": "damage",
                "amount": 2,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "fire"
              }
            ],
            "target": "flames"
          }
        ]
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Area",
      "Fire",
      "Psionic",
      "Pyrokinesis",
      "Ranged"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Materialize

Live action id: `action_1766542137505_0ce529cf8dbe9`.

Main action | Psionic,Ranged,Resopathy,Strike | Range: Ranged 10 | Target: One creature or object

You picture an object in your mind and give it form--directly above your opponent's head. Effect: A worthless size 1M object drops onto the target to deal the damage, then rolls into an adjacent unoccupied space of your choice. The object is made of wood, stone, or metal (your choice). Strained: The object explodes after the damage is dealt, and each creature adjacent to the target takes damage equal to your Reason score. You also take damage equal to your Reason score that can't be reduced in any way.

```json
COPY START
{
  "fields": {
    "name": "Materialize",
    "useWhen": "there is one enemy and little ones around them.",
    "actionLabel": "Main action",
    "keywords": "Psionic,Ranged,Resopathy,Strike",
    "range": "Ranged 10",
    "target": "One creature or object",
    "description": "You picture an object in your mind and give it form--directly above your opponent's head. Effect: A worthless size 1M object drops onto the target to deal the damage, then rolls into an adjacent unoccupied space of your choice. The object is made of wood, stone, or metal (your choice). Strained: The object explodes after the damage is dealt, and each creature adjacent to the target takes damage equal to your Reason score. You also take damage equal to your Reason score that can't be reduced in any way.",
    "testLabel": "Power Roll + Reason",
    "testAdditionalEffect": "A worthless size 1M object drops onto the target to deal the damage, then rolls into an adjacent unoccupied space of your choice. The object is made of wood, stone, or metal (your choice).\n\nStrainedThe object explodes after the damage is dealt, and each creature adjacent to the target takes damage equal to 2. You also take damage equal to 2 that can't be reduced in any way.",
    "tier1Damage": "3",
    "tier1Notes": "+ R damage",
    "tier2Damage": "5",
    "tier2Notes": "+ R damage",
    "tier3Damage": "8",
    "tier3Notes": "+ R damage"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1780027494906_82d59ffe1e1ac",
        "name": "target",
        "mode": "token",
        "predicate": "creatureOrObject",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "promptTitle": "Materialize",
        "promptText": "Choose one creature or object within 10.",
        "distance": {
          "form": "ranged",
          "value": 10,
          "secondary": 0,
          "within": 0
        }
      },
      {
        "type": "powerRoll",
        "id": "powerroll_1780027494906_4a1f8ae155c718",
        "attribute": "Reason",
        "bonus": 0,
        "target": "target",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 3,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "untyped"
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 5,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "untyped"
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 8,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "untyped"
              }
            ]
          }
        }
      },
      {
        "type": "effect",
        "id": "effect_1780027494906_d89edc9656dd98",
        "target": "",
        "effects": [
          {
            "kind": "note",
            "text": "A worthless size 1M object drops onto the target to deal the damage, then rolls into an adjacent unoccupied space of your choice. The object is made of wood, stone, or metal (your choice)."
          }
        ]
      },
      {
        "type": "branch",
        "id": "branch_1780027494906_b04cf83b6d2118",
        "condition": {
          "kind": "strained"
        },
        "then": [
          {
            "type": "target",
            "id": "target_1780027494906_83ffdde72b6ba8",
            "name": "adjacentCreatures",
            "mode": "token",
            "predicate": "creature",
            "count": {
              "value": 8,
              "mode": "upTo"
            },
            "optional": false,
            "promptTitle": "Materialize - Strained",
            "promptText": "Choose each creature adjacent to the target. Click Done when all adjacent creatures are selected.",
            "excludeGroups": [
              "target"
            ]
          },
          {
            "type": "effect",
            "id": "effect_1780027494906_b2094243529a7",
            "target": "adjacentCreatures",
            "effects": [
              {
                "kind": "damage",
                "amount": 0,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "untyped"
              }
            ]
          },
          {
            "type": "effect",
            "id": "effect_1780027494906_327f6808ec3488",
            "target": "self",
            "effects": [
              {
                "kind": "damage",
                "amount": 0,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "untyped",
                "raw": true
              },
              {
                "kind": "note",
                "text": "Self-damage from Materialize's strained effect can't be reduced in any way."
              }
            ]
          }
        ],
        "else": []
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Psionic",
      "Ranged",
      "Resopathy",
      "Strike"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Mind Spike

Live action id: `action_1766542222280_c1e055802581d8`.

Main action | Psionic,Ranged,Strike,Telepathy | Range: Ranged 10 | Target: One creature

A telepathic bolt instantly zaps a creature's brain. Strained: The target takes an extra 2 psychic damage. You also take 2 psychic damage that can't be reduced in any way.

```json
COPY START
{
  "fields": {
    "name": "Mind Spike",
    "useWhen": "materialize doesnt work.",
    "actionLabel": "Main action",
    "keywords": "Psionic,Ranged,Strike,Telepathy",
    "range": "Ranged 10",
    "target": "One creature",
    "description": "A telepathic bolt instantly zaps a creature's brain. Strained: The target takes an extra 2 psychic damage. You also take 2 psychic damage that can't be reduced in any way.",
    "testLabel": "Power Roll + Reason",
    "testAdditionalEffect": "A telepathic bolt instantly zaps a creature's brain.",
    "tier1Damage": "2",
    "tier1DamageType": "psychic",
    "tier1Notes": "+ R psychic damage",
    "tier2Damage": "4",
    "tier2DamageType": "psychic",
    "tier2Notes": "+ R psychic damage",
    "tier3Damage": "6",
    "tier3DamageType": "psychic",
    "tier3Notes": "+ R psychic damage"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_mindspike_primary",
        "name": "target",
        "mode": "token",
        "predicate": "creature",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "promptTitle": "Mind Spike",
        "promptText": "Choose one creature within 10.",
        "distance": {
          "form": "ranged",
          "value": 10,
          "secondary": 0,
          "within": 0
        }
      },
      {
        "type": "powerRoll",
        "id": "powerroll_mindspike",
        "attribute": "Reason",
        "bonus": 0,
        "target": "target",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 2,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "psychic"
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 4,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "psychic"
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 6,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "psychic"
              }
            ]
          }
        }
      },
      {
        "type": "branch",
        "id": "branch_mindspike_strained",
        "condition": {
          "kind": "strained"
        },
        "then": [
          {
            "type": "effect",
            "id": "effect_mindspike_target_extra",
            "target": "target",
            "effects": [
              {
                "kind": "damage",
                "amount": 2,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "psychic"
              }
            ]
          },
          {
            "type": "effect",
            "id": "effect_mindspike_self",
            "target": "self",
            "effects": [
              {
                "kind": "damage",
                "amount": 2,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "psychic",
                "raw": true
              },
              {
                "kind": "note",
                "text": "The 2 psychic damage you take from Mind Spike's strained effect can't be reduced in any way."
              }
            ]
          }
        ],
        "else": []
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Psionic",
      "Ranged",
      "Strike",
      "Telepathy"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Smolder

Live action id: `action_1766542300384_08c5ee6d726d1`.

Main Action | Psionic Pyrokinesis Ranged Strike | Range: 10 | Target: one creature | Cost: 3

```json
COPY START
{
  "fields": {
    "name": "Smolder",
    "useWhen": "There is one creature to kill and you have clarity",
    "actionLabel": "Main Action",
    "keywords": "Psionic Pyrokinesis Ranged Strike",
    "range": "10",
    "target": "one creature",
    "cost": "3",
    "testRollMod": "2",
    "tier1Damage": "6",
    "tier1Attribute": "Reason",
    "tier1Threshold": "0",
    "tier1AttributeEffect": "the target has weakness 5 (save ends)",
    "tier2Damage": "9",
    "tier2Attribute": "Reason",
    "tier2Threshold": "1",
    "tier2AttributeEffect": "the target has weakness 5 (save ends)",
    "tier3Damage": "12",
    "tier3Attribute": "Reason",
    "tier3Threshold": "2",
    "tier3AttributeEffect": "the target has weakness 5 (save ends)"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1779071504488_114c9e076d1af",
        "name": "primary",
        "mode": "token",
        "predicate": "creature",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "distance": {
          "form": "ranged",
          "value": 10,
          "secondary": 0,
          "within": 0
        }
      },
      {
        "type": "effect",
        "id": "effect_1779071504488_852736b36deca",
        "target": "",
        "effects": [
          {
            "kind": "note",
            "text": "Pick the damage + weakness type: acid, corruption, or fire. Damage hits before weakness applies."
          }
        ]
      },
      {
        "type": "powerRoll",
        "id": "powerroll_1779071504488_eb566764e6d8d8",
        "attribute": "Reason",
        "bonus": 0,
        "target": "",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 3,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "untyped"
              },
              {
                "kind": "potency",
                "attribute": "Reason",
                "level": "weak",
                "onFail": [
                  {
                    "kind": "condition",
                    "name": "damageWeakness",
                    "duration": "saveEnds",
                    "amount": 5,
                    "damageType": ""
                  }
                ]
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 6,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "untyped"
              },
              {
                "kind": "potency",
                "attribute": "Reason",
                "level": "average",
                "onFail": [
                  {
                    "kind": "condition",
                    "name": "damageWeakness",
                    "duration": "saveEnds",
                    "amount": 5,
                    "damageType": ""
                  }
                ]
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 9,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "untyped"
              },
              {
                "kind": "potency",
                "attribute": "Reason",
                "level": "strong",
                "onFail": [
                  {
                    "kind": "condition",
                    "name": "damageWeakness",
                    "duration": "saveEnds",
                    "amount": 5,
                    "damageType": ""
                  },
                  {
                    "kind": "note",
                    "text": "Tier 3 weakness is 5 + your Reason score — bump the amount manually if needed."
                  }
                ]
              }
            ]
          }
        }
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Psionic",
      "Pyrokinesis",
      "Ranged",
      "Strike"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Synaptic Override

Live action id: `action_1766542486640_df3da5459021d`.

Main Action | Psionic,Ranged,Telepathy | Range: Ranged 10 | Target: One enemy | Cost: 5 Clarity

You control an enemy's nervous system. You control the target's movement. The target can't be moved in a way that would harm them (such as over a cliff), leave them dying, or result in them suffering a condition or other negative effect. However, you can move them to provoke opportunity attacks.

```json
COPY START
{
  "fields": {
    "name": "Synaptic Override",
    "useWhen": "There is one strong enemy near other enemies",
    "actionLabel": "Main Action",
    "keywords": "Psionic,Ranged,Telepathy",
    "range": "Ranged 10",
    "target": "One enemy",
    "cost": "5 Clarity",
    "description": "You control an enemy's nervous system. You control the target's movement. The target can't be moved in a way that would harm them (such as over a cliff), leave them dying, or result in them suffering a condition or other negative effect. However, you can move them to provoke opportunity attacks.",
    "testLabel": "Power Roll + Reason",
    "testAdditionalEffect": "You control the target's movement. The target can't be moved in a way that would harm them (such as over a cliff), leave them dying, or result in them suffering a condition or other negative effect. However, you can move them to provoke opportunity attacks.\n\nStrainedYou take 1d6 damage and are weakened until the end of your turn.",
    "tier1Notes": "Target makes a free strike against one enemy of your choice.",
    "tier2Notes": "Target shifts up to their speed and uses their signature ability against enemies of your choice.",
    "tier3Notes": "Target moves up to their speed and uses their signature ability against enemies of your choice."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1780080907446_d2bff33a912908",
        "name": "primary",
        "mode": "token",
        "predicate": "enemy",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "distance": {
          "form": "ranged",
          "value": 10,
          "secondary": 0,
          "within": 0
        }
      },
      {
        "type": "powerRoll",
        "id": "powerroll_1780080907446_aeb1e8008cb868",
        "attribute": "Reason",
        "bonus": 0,
        "target": "primary",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "other",
                "text": "Tier 1 — GM: the controlled target makes a FREE STRIKE against one enemy of the Talent's choice."
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "other",
                "text": "Tier 2 — GM: the controlled target SHIFTS up to their speed and uses their SIGNATURE ABILITY against any enemies of the Talent's choice."
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "other",
                "text": "Tier 3 — GM: the controlled target MOVES up to their speed and uses their SIGNATURE ABILITY against any enemies of the Talent's choice."
              }
            ]
          }
        }
      },
      {
        "type": "effect",
        "id": "effect_1780080907446_d114ca11c1ccb",
        "target": "",
        "effects": [
          {
            "kind": "note",
            "text": "You control the target's movement. They can't be moved into harm (over a cliff, into dying, or into a condition/negative effect), but you can move them to provoke opportunity attacks."
          },
          {
            "kind": "ifStrained",
            "then": [
              {
                "kind": "damage",
                "amount": 0,
                "amountDice": "1d6",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "untyped",
                "raw": true,
                "target": "self"
              },
              {
                "kind": "condition",
                "name": "weakened",
                "duration": "endOfTurn",
                "target": "self"
              }
            ],
            "else": []
          }
        ]
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Psionic",
      "Ranged",
      "Telepathy"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Reflector Field

Live action id: `action_1769580035749_5b6f29735c07f8`.

Main Action | Area,Psionic,Telepathy | Range: 3 aura | Target: Special | Cost: 7 Clarity

A protective field reverses the momentum of incoming attacks. The aura lasts until the start of your next turn. Whenever an enemy targets an ally in the area with a ranged ability, the ability is negated on the ally and reflected back at the enemy. The ability deals half the damage to the enemy that it would have dealt to the ally and loses any additional effects.

```json
COPY START
{
  "fields": {
    "name": "Reflector Field",
    "actionLabel": "Main Action",
    "keywords": "Area,Psionic,Telepathy",
    "range": "3 aura",
    "target": "Special",
    "cost": "7 Clarity",
    "description": "A protective field reverses the momentum of incoming attacks. The aura lasts until the start of your next turn. Whenever an enemy targets an ally in the area with a ranged ability, the ability is negated on the ally and reflected back at the enemy. The ability deals half the damage to the enemy that it would have dealt to the ally and loses any additional effects."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "effect",
        "id": "effect_1780180829290_b3d5e83566c8a8",
        "target": "",
        "effects": [
          {
            "kind": "ifStrained",
            "then": [
              {
                "kind": "aura",
                "enabled": true,
                "radius": 4,
                "target": "self",
                "color": "#22d3ee",
                "affects": "creature"
              }
            ],
            "else": [
              {
                "kind": "aura",
                "enabled": true,
                "radius": 3,
                "target": "self",
                "color": "#22d3ee",
                "affects": "creature"
              }
            ]
          },
          {
            "kind": "note",
            "text": "Reflector Field is up. Use Feedback Loop to reflect damage from enemies that hit allies inside the field."
          }
        ]
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [],
    "usageLimit": null
  }
}
COPY END
```

## Maneuvers

### Flashback

Live action id: `action_1766542709208_7f3b6fd9b06ef8`.

Maneuver | Chronopathy,Psionic,Ranged | Range: Ranged 10 | Target: Self or one ally | Cost: 5 Clarity

The target is thrown several seconds back through time and gets to do it all again. The target uses an ability with a base Heroic Resource cost of 7 or lower that they've previously used this round, without needing to spend the base cost. Augmentations to the ability can be paid for as usual.

```json
COPY START
{
  "fields": {
    "name": "Flashback",
    "useWhen": "an Ally did something awesome this round",
    "actionLabel": "Maneuver",
    "keywords": "Chronopathy,Psionic,Ranged",
    "range": "Ranged 10",
    "target": "Self or one ally",
    "cost": "5 Clarity",
    "description": "The target is thrown several seconds back through time and gets to do it all again. The target uses an ability with a base Heroic Resource cost of 7 or lower that they've previously used this round, without needing to spend the base cost. Augmentations to the ability can be paid for as usual."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1780083676831_3a3a84d21b718",
        "name": "ally",
        "mode": "token",
        "predicate": "selfOrAlly",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "distance": {
          "form": "ranged",
          "value": 10,
          "secondary": 0,
          "within": 0
        }
      },
      {
        "type": "effect",
        "id": "effect_1780083676831_f05e0febe15348",
        "target": "ally",
        "effects": [
          {
            "kind": "note",
            "text": "FLASHBACK: The target immediately reuses an ability with a base Heroic Resource cost of 7 or lower that they ALREADY USED THIS ROUND, without paying the base cost. Augmentations are paid as usual. (Resolve manually.)"
          }
        ]
      },
      {
        "type": "effect",
        "id": "effect_1780083676831_a80c93dc8db678",
        "target": "",
        "effects": [
          {
            "kind": "ifStrained",
            "then": [
              {
                "kind": "damage",
                "amount": 0,
                "amountDice": "1d6",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "untyped",
                "raw": true,
                "target": "self"
              },
              {
                "kind": "condition",
                "name": "slowed",
                "duration": "saveEnds",
                "target": "self"
              }
            ],
            "else": []
          }
        ]
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Chronopathy",
      "Psionic",
      "Ranged"
    ],
    "usageLimit": null
  }
}
COPY END
```

## Triggered Actions

### Feedback Loop

Live action id: `action_1766542779297_102666cce7879`.

Triggered Action | Psionic,Ranged | Range: Ranged 10 | Target: 1 creature | Trigger: Target deals damage to an ally

The target takes psychic damage equal to half the triggering damage.

```json
COPY START
{
  "fields": {
    "name": "Feedback Loop",
    "useWhen": "you want to turn their hit into damage back on them.",
    "actionLabel": "Triggered Action",
    "keywords": "Psionic,Ranged",
    "range": "Ranged 10",
    "target": "1 creature",
    "trigger": "Target deals damage to an ally",
    "description": "The target takes psychic damage equal to half the triggering damage."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "trigger",
        "id": "trigger_1780175008136_90155c88c4084",
        "condition": "The target deals damage to an ally.",
        "target": "",
        "effectTarget": "",
        "effects": [],
        "match": {
          "event": "damage",
          "filter": {
            "whose": "ally",
            "minAmount": 1
          }
        }
      },
      {
        "type": "target",
        "id": "target_1780175008136_6a2007757bed48",
        "name": "source",
        "mode": "token",
        "predicate": "enemy",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "promptTitle": "Pick the Triggering Enemy",
        "promptText": "Choose the enemy that dealt damage to your ally.",
        "distance": {
          "form": "ranged",
          "value": 10,
          "secondary": 0,
          "within": 0
        }
      },
      {
        "type": "effect",
        "id": "effect_1780175008136_7e44fcc88b7a6",
        "target": "source",
        "effects": [
          {
            "kind": "damage",
            "amount": 0,
            "amountDice": "",
            "markBonusDice": "",
            "markPredicate": "",
            "attribute": "",
            "damageType": "psychic",
            "amountFrom": {
              "source": "triggeringDamage",
              "fraction": 0.5,
              "rounding": "down"
            }
          }
        ]
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Psionic",
      "Ranged"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Resist the Unnatural

Live action id: `action_1766542820664_c66c51c07d77e8`.

Triggered Action |  | Trigger: You take damage that isn't untyped

You halve the damage.

```json
COPY START
{
  "fields": {
    "name": "Resist the Unnatural",
    "useWhen": "you want to halve typed damage to anyone hit.",
    "actionLabel": "Triggered Action",
    "trigger": "You take damage that isn't untyped",
    "description": "You halve the damage."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "trigger",
        "id": "trigger_1780171264783_f74a13447216f8",
        "condition": "You take damage that isn't untyped.",
        "target": "",
        "effectTarget": "",
        "effects": [],
        "match": {
          "event": "damage",
          "filter": {
            "whose": "self",
            "minAmount": 1,
            "damageType": [
              "acid",
              "cold",
              "corruption",
              "fire",
              "holy",
              "lightning",
              "poison",
              "psychic",
              "sonic"
            ]
          }
        }
      },
      {
        "type": "effect",
        "id": "effect_1780171264783_56b55dfd73ebb",
        "target": "self",
        "effects": [
          {
            "kind": "halveTriggeringDamage",
            "rounding": "down"
          }
        ]
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [],
    "usageLimit": null
  }
}
COPY END
```

## Free Strikes

### Mind Spike (Opportunity Attack)

Live action id: `action_1766542874896_ee16c3314e7388`.

Free Triggered Action | Psionic,Ranged,Strike,Telepathy | Range: Ranged 10 | Target: One creature

A telepathic bolt instantly zaps a creature's brain. Mind Spike can be used as a ranged free strike, so the Talent makes opportunity attacks with it.

```json
COPY START
{
  "fields": {
    "name": "Mind Spike (Opportunity Attack)",
    "actionLabel": "Free Triggered Action",
    "keywords": "Psionic,Ranged,Strike,Telepathy",
    "range": "Ranged 10",
    "target": "One creature",
    "description": "A telepathic bolt instantly zaps a creature's brain. Mind Spike can be used as a ranged free strike, so the Talent makes opportunity attacks with it.",
    "testLabel": "Power Roll + Reason",
    "testAdditionalEffect": "Strained: The target takes an extra 2 psychic damage. You also take 2 psychic damage that can't be reduced in any way.",
    "tier1Damage": "2 + R",
    "tier1DamageType": "psychic",
    "tier1Notes": "Strained: +2 psychic to target; you take 2 psychic (unreducible)",
    "tier2Damage": "4 + R",
    "tier2DamageType": "psychic",
    "tier2Notes": "Strained: +2 psychic to target; you take 2 psychic (unreducible)",
    "tier3Damage": "6 + R",
    "tier3DamageType": "psychic",
    "tier3Notes": "Strained: +2 psychic to target; you take 2 psychic (unreducible)"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "trigger",
        "id": "trigger_1780173132501_c4994b9e88642",
        "condition": "An adjacent enemy leaves your reach (opportunity attack).",
        "target": "",
        "effectTarget": "",
        "effects": [],
        "match": {
          "event": "move",
          "filter": {
            "whose": "enemy",
            "leavesAdjacency": true
          }
        }
      },
      {
        "type": "target",
        "id": "target_1780173132501_5a7292f17fd208",
        "name": "primary",
        "mode": "token",
        "predicate": "enemy",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "promptTitle": "Mind Spike — Opportunity Attack",
        "promptText": "Choose the enemy that left your reach.",
        "distance": {
          "form": "ranged",
          "value": 10,
          "secondary": 0,
          "within": 0
        }
      },
      {
        "type": "powerRoll",
        "id": "powerroll_1780173132501_4c4de36d1e49d8",
        "attribute": "Reason",
        "bonus": 0,
        "target": "primary",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 2,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "psychic"
              },
              {
                "kind": "ifStrained",
                "then": [
                  {
                    "kind": "damage",
                    "amount": 2,
                    "amountDice": "",
                    "markBonusDice": "",
                    "markPredicate": "",
                    "attribute": "",
                    "damageType": "psychic",
                    "target": "primary"
                  },
                  {
                    "kind": "damage",
                    "amount": 2,
                    "amountDice": "",
                    "markBonusDice": "",
                    "markPredicate": "",
                    "attribute": "",
                    "damageType": "psychic",
                    "raw": true,
                    "target": "self"
                  }
                ],
                "else": []
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 4,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "psychic"
              },
              {
                "kind": "ifStrained",
                "then": [
                  {
                    "kind": "damage",
                    "amount": 2,
                    "amountDice": "",
                    "markBonusDice": "",
                    "markPredicate": "",
                    "attribute": "",
                    "damageType": "psychic",
                    "target": "primary"
                  },
                  {
                    "kind": "damage",
                    "amount": 2,
                    "amountDice": "",
                    "markBonusDice": "",
                    "markPredicate": "",
                    "attribute": "",
                    "damageType": "psychic",
                    "raw": true,
                    "target": "self"
                  }
                ],
                "else": []
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 6,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "psychic"
              },
              {
                "kind": "ifStrained",
                "then": [
                  {
                    "kind": "damage",
                    "amount": 2,
                    "amountDice": "",
                    "markBonusDice": "",
                    "markPredicate": "",
                    "attribute": "",
                    "damageType": "psychic",
                    "target": "primary"
                  },
                  {
                    "kind": "damage",
                    "amount": 2,
                    "amountDice": "",
                    "markBonusDice": "",
                    "markPredicate": "",
                    "attribute": "",
                    "damageType": "psychic",
                    "raw": true,
                    "target": "self"
                  }
                ],
                "else": []
              }
            ]
          }
        }
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Psionic",
      "Ranged",
      "Strike",
      "Telepathy",
      "FreeStrike",
      "FreeTriggered"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Free Strike (melee)

Live action id: `action_1766542938520_f59b34e8c7dc5`.

Free Strike | Charge Melee Strike Weapon | Range: 1 | Target: 1

```json
COPY START
{
  "fields": {
    "name": "Free Strike (melee)",
    "actionLabel": "Free Strike",
    "keywords": "Charge Melee Strike Weapon",
    "range": "1",
    "target": "1",
    "testRollMod": "1",
    "tier1Damage": "3",
    "tier2Damage": "6",
    "tier3Damage": "8"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1778542434198_3b467db44ea4d",
        "name": "primary",
        "mode": "token",
        "predicate": "enemy",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "distance": {
          "form": "melee",
          "value": 1,
          "secondary": 0,
          "within": 0
        }
      },
      {
        "type": "powerRoll",
        "id": "powerroll_1778542434199_1743c8bd0c515",
        "attribute": "Might",
        "bonus": 0,
        "target": "",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 2,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Might",
                "damageType": "untyped"
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 5,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Might",
                "damageType": "untyped"
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 7,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Might",
                "damageType": "untyped"
              }
            ]
          }
        }
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Melee",
      "Strike",
      "Weapon"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Free Strike (ranged)

Live action id: `action_1766542985344_14382c6e5644f`.

Free Strike | Ranged Strike Weapon | Range: 5 | Target: 1

```json
COPY START
{
  "fields": {
    "name": "Free Strike (ranged)",
    "actionLabel": "Free Strike",
    "keywords": "Ranged Strike Weapon",
    "range": "5",
    "target": "1",
    "testRollMod": "1",
    "tier1Damage": "3",
    "tier2Damage": "5",
    "tier3Damage": "7"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1778469596849_786e31e8af6a2",
        "name": "primary",
        "mode": "token",
        "predicate": "creatureOrObject",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "distance": {
          "form": "ranged",
          "value": 5,
          "secondary": 0,
          "within": 0
        }
      },
      {
        "type": "powerRoll",
        "id": "powerroll_1778469596849_8c678d3751476",
        "attribute": [
          "Might",
          "Agility"
        ],
        "bonus": 0,
        "target": "",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 2,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": [
                  "Might",
                  "Agility"
                ],
                "damageType": "untyped"
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 4,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": [
                  "Might",
                  "Agility"
                ],
                "damageType": "untyped"
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 6,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": [
                  "Might",
                  "Agility"
                ],
                "damageType": "untyped"
              }
            ]
          }
        }
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [],
    "usageLimit": null
  }
}
COPY END
```

## Heroic Resource - Clarity

Start of your turn: +1d3First force move per round: +2 You can spend clarity you don't have, pushing that Heroic Resource into negative numbers to a maximum negative value equal to 1 + your Reason score. At the end of each of your turns, you take 1 damage for each negative point of clarity. Whenever you have clarity below 0, you are strained. Some psionic abilities have additional effects if you are already strained or become strained when you use them. Strained effects can still impact you even after you are no longer strained. Whenever you use an ability with a strain effect outside of combat, you can take 1d6 damage and incur the effect if you don't incur it for other reasons.

```json
COPY START
{
  "schema": "heroic-resource/v1",
  "rules": [
    {
      "id": "talent-combat-start-victories",
      "event": "combatStart",
      "filter": {},
      "limit": null,
      "effect": {
        "kind": "set",
        "amount": {
          "from": "victories"
        }
      },
      "prompt": "Set {resource} to {amount}: combat start from Victories.",
      "autoApply": true,
      "enabled": true
    },
    {
      "id": "talent-turn-start-clarity-roll",
      "event": "turnStart",
      "filter": {
        "whose": "self"
      },
      "limit": null,
      "effect": {
        "kind": "gain",
        "amount": {
          "dice": "1d3"
        }
      },
      "prompt": "Roll for {resource}: start of your turn.",
      "autoApply": false,
      "enabled": true
    },
    {
      "id": "talent-mind-recovery-forced-movement",
      "event": "forcedMovement",
      "filter": {},
      "limit": {
        "scope": "round",
        "key": "talent-mind-recovery-forced-movement",
        "target": "self",
        "markOn": "offered"
      },
      "effect": {
        "kind": "gain",
        "amount": {
          "amount": 2
        }
      },
      "prompt": "Gain {amount} {resource}: Mind Recovery, first time a creature is force moved this round.",
      "autoApply": false,
      "enabled": true
    },
    {
      "id": "talent-negative-clarity-turn-end-damage",
      "event": "turnEnd",
      "filter": {
        "whose": "self"
      },
      "limit": null,
      "effect": {
        "kind": "damage",
        "amount": {
          "from": "negativeResource"
        }
      },
      "prompt": "Take {amount} damage: end of turn while {resource} is negative.",
      "autoApply": false,
      "enabled": true
    },
    {
      "id": "talent-combat-end-reset",
      "event": "combatEnd",
      "filter": {},
      "limit": null,
      "effect": {
        "kind": "set",
        "amount": {
          "amount": 0
        }
      },
      "prompt": "Reset {resource} to 0: combat ended.",
      "autoApply": true,
      "enabled": true
    }
  ]
}
COPY END
```

## No saved automation

### Actions

- Maneuvers: **Detect the Supernatural** - Maneuver |  | Range: 5
- Maneuvers: **Remote Assistance** - Maneuver | Psionic Ranged | Range: 10 | Target: 1 creature or object

### Features

- **Clarity** - Start of your turn+1d3The first time each combat round that a creature is force moved+2 You can spend clarity you don't have, pushing that Heroic Resource into negative numbers to a maximum negative value equal to 1 + your Reason score. At the end of each of your turns, you take 1 damage for each negative point of clarity. Whenever you have clarity below 0, you are strained. Some psionic abilities have additional effects if you are already strained or become strained when you use them. Strained effects can still impact you even after you are no longer strained. Whenever you use an ability with a strain effect outside of combat, you can take 1d6 damage and incur the effect if you don't incur it for other reasons
- **Ease the Mind** - You gain an edge on tests made to stop combat and start a negotiation. Additionally, if you are present during a negotiation, any NPC who has a hostile or suspicious starting attitude has their patience increased by 1 (to a maximum of 5).
- **Entropy Ward** - Your ward slows time for your enemies. Whenever a creature deals damage to you, their speed is reduced by an amount equal to 2 and they can't use triggered actions until the end of their next turn.
- **Telepathic Speech** - You can telepathically communicate with any creatures within distance of your Mind Spike ability if they share a language with you and you know of each other. When you communicate with someone this way, they can respond telepathically.
- **Perseverence** - Giving up is for other people. You gain an edge on tests made using the Endurance skill. Additionally, when you are slowed, your speed is reduced to 3 instead of 2.
- **Eidetic Memory** - Your mind is an encyclopedia, though not always an easy one to organize. When you finish a respite, choose one skill from the lore skill group that you don't have. You have that skill until you finish your next respite. Additionally, if you spend 1 uninterrupted minute or more reading any page of text, you can memorize its contents, allowing you to memorize entire books with sufficient time.
- **Bereaved Benefit** - Whenever you don't know what to do, you can appeal to your loved one's spirit for help. You spend a hero token to let the Director determine the next thing you do, whether in or out of combat. The Director chooses the best course of action they can think of for you, even if it relies on information you don't have. If the Director can't think of a particularly good course of action for you to take,you don't spend the hero token.
- **Can't Take Hold** - Your connection to the natural world allows you to resist certain supernatural effects. You ignore temporary difficult terrain created by magic and psionic abilities. Additionally, when you are force moved by a magic or psionic ability, you can reduce the forced movement distance by 1.
- **Scan** - You can extend your psionic senses beyond their usual range. Onceon each of your turns, you can search for hidden creatures as a freemaneuver (see Hide and Sneak in Chapter 9: Tests). Additionally, onceyou establish line of effect to a thinking creature within distance ofyour Mind Spike ability, you always have line of effect to that creatureuntil they move beyond that distance.
- **Spot the Tell** - Whenever you make a test to read a person and obtain a tier 3 outcome,you notice several tells that give away their true feelings. Any test youmake to read that person in the future gains an edge.

