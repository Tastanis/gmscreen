# Zepha - VTT Automations

Paste-ready ability-automation and heroic-resource JSON for **Zepha** (Level 3 Elementalist).

These blocks were generated from the character-sheet LLM export and normalized against the current `ability-automation/v3` and `heroic-resource/v1` code paths. Each ability block goes into that ability's **Automate** button; feature blocks go on that feature's **Automate** button; heroic-resource JSON goes in the sheet's heroic-resource automation field.

See `../../character_sheet/ability-automation/AUTHORING.md`, `../../character_sheet/ability-automation/REGISTRY.md`, and `../../character_sheet/heroic-resource-automation/README.md` for the schema.

## Validation notes

- Validated 12 feature/action automation blocks with `AbilityAutomationSchema.normalizeAutomation()`; 0 warnings after normalization.
- Validated 4 heroic-resource rules with `normalizeHeroicResourceAutomation()`; 0 warnings.
- Converted `Unquiet Ground` and `Maw of Earth` terrain reminders from empty `persistent` cards into normal `note` effects, because the current persistent-zone runtime expects upkeep/tick behavior.

## Authoring decisions

- The visible card text is preserved in `fields`; the runnable VTT behavior lives in `automation`.
- Saved export `warnings` and `_extra` metadata were removed; the blocks below were re-normalized against the current runtime schema.
- Manual-only abilities and features are listed near the bottom so omissions are explicit.

## Feature automations

### Fire: Acolyte of Fire

Live feature id: `feature_1774395725994_8b737b527e6f8`.

You become an expert at wielding destructive flames. Your abilities that have the Fire and Magic keywords gain a +1 bonus to rolled damage. Your Hurl Element ability (see below) also gains the bonus when you use it to deal fire damage.

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
          "Fire",
          "Magic"
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
        "note": ""
      },
      "label": "Acolyte of Fire"
    },
    {
      "match": {
        "keywordsAll": [
          "Magic"
        ],
        "keywordsAny": [],
        "keywordsNone": [
          "Fire"
        ],
        "damageType": "fire",
        "attribute": ""
      },
      "apply": {
        "damageBonus": 1,
        "rangeBonus": 0,
        "forcedMovementBonus": 0,
        "damageType": "",
        "note": ""
      },
      "label": "Acolyte of Fire (Hurl Element)"
    }
  ],
  "passives": [],
  "keywords": [],
  "usageLimit": null
}
COPY END
```

## Main Actions

### Hurl Element

Live action id: `action_1774400057983_b32a91e9ecf008`.

Main Action | Magic,Ranged,Strike | Range: Ranged 10 | Target: One creature or object

You cast a ball of elemental energy at a foe. Can be used as a ranged free strike. When you make this strike, choose the damage type: acid, cold, corruption, fire, lightning, poison, or sonic.

```json
COPY START
{
  "fields": {
    "name": "Hurl Element",
    "actionLabel": "Main Action",
    "keywords": "Magic,Ranged,Strike",
    "range": "Ranged 10",
    "target": "One creature or object",
    "description": "You cast a ball of elemental energy at a foe. Can be used as a ranged free strike. When you make this strike, choose the damage type: acid, cold, corruption, fire, lightning, poison, or sonic.",
    "testLabel": "Power Roll + Reason",
    "testAdditionalEffect": "When you make this strike, choose the damage type from one of the following options: acid, cold, corruption, fire, lightning, poison, or sonic.",
    "tier1Damage": "2 + R",
    "tier1DamageType": "fire",
    "tier2Damage": "4 + R",
    "tier2DamageType": "fire",
    "tier3Damage": "6 + R",
    "tier3DamageType": "fire"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1780183076738_cebec2fa38abd8",
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
          "value": 10,
          "secondary": 0,
          "within": 0
        }
      },
      {
        "type": "powerRoll",
        "id": "powerroll_1780183076739_92bec3f4d90488",
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
                "attribute": "Reason",
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
                "attribute": "Reason",
                "damageType": "fire"
              }
            ]
          }
        }
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Magic",
      "Ranged",
      "Strike"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Motivate Earth

Live action id: `action_1774400363824_8dab69bce9f5b`.

Main Action | Earth,Magic,Melee | Range: Melee 1 | Target: Special | Cost: Free!

The earth rises, falls, or opens up at your command. You touch a square containing mundane dirt, stone, or metal and create a 5 wall of the same material, which rises up out of the ground and must include the square you touched. Alternatively, you touch a structure of mundane dirt, stone, or metal occupying 2+ squares to open a 1-square opening where you touched it, or touch an existing 1-square-or-smaller opening to seal it with the same material.

```json
COPY START
{
  "fields": {
    "name": "Motivate Earth",
    "actionLabel": "Main Action",
    "keywords": "Earth,Magic,Melee",
    "range": "Melee 1",
    "target": "Special",
    "cost": "Free!",
    "description": "The earth rises, falls, or opens up at your command. You touch a square containing mundane dirt, stone, or metal and create a 5 wall of the same material, which rises up out of the ground and must include the square you touched. Alternatively, you touch a structure of mundane dirt, stone, or metal occupying 2+ squares to open a 1-square opening where you touched it, or touch an existing 1-square-or-smaller opening to seal it with the same material."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1780186359955_6252566eea07b8",
        "name": "wall",
        "mode": "area",
        "predicate": "creatureOrObject",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "promptTitle": "Place Earth Wall",
        "promptText": "Place a 5 wall touching a square within Melee 1.",
        "distance": {
          "form": "wall",
          "value": 5,
          "secondary": 0,
          "within": 1
        },
        "shape": "wall",
        "size": 3,
        "length": 5,
        "structure": true,
        "wallColor": "dirt"
      },
      {
        "type": "effect",
        "id": "effect_1780186359955_856d073d23f248",
        "target": "wall",
        "effects": [
          {
            "kind": "note",
            "text": "A 5 wall of mundane dirt, stone, or metal rises from the ground, including the square you touched. (Alternative use: open or seal a 1-square opening instead.)"
          }
        ]
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Earth",
      "Magic",
      "Melee"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Bifurcated Incineration

Live action id: `action_1774401022290_c070e4274d4128`.

Main Action | Fire,Magic,Ranged,Strike | Range: Ranged 10 | Target: Two creatures or objects | Cost: Free!

Two jets of flame lance out at your command.

```json
COPY START
{
  "fields": {
    "name": "Bifurcated Incineration",
    "actionLabel": "Main Action",
    "keywords": "Fire,Magic,Ranged,Strike",
    "range": "Ranged 10",
    "target": "Two creatures or objects",
    "cost": "Free!",
    "description": "Two jets of flame lance out at your command.",
    "testLabel": "Power Roll + Reason",
    "testRollMod": "3",
    "tier1Damage": "2",
    "tier1DamageType": "fire",
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
        "type": "target",
        "id": "target_1780185245191_392bb2ec1c35f",
        "name": "targets",
        "mode": "token",
        "predicate": "creatureOrObject",
        "count": {
          "value": 2,
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
        "id": "powerroll_1780185245191_0d276c959ddbf",
        "attribute": "Reason",
        "bonus": 0,
        "target": "targets",
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
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Fire",
      "Magic",
      "Ranged",
      "Strike"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Unquiet Ground

Live action id: `action_1774401022816_f6d4561f7463b`.

Main Action | Area,Earth,Magic,Ranged | Range: 2 cube within 10 | Target: Each enemy in the area | Cost: Free!

A sudden storm of detritus assaults your foes and leaves them struggling to move. Effect: The ground beneath the area is difficult terrain for enemies.

```json
COPY START
{
  "fields": {
    "name": "Unquiet Ground",
    "actionLabel": "Main Action",
    "keywords": "Area,Earth,Magic,Ranged",
    "range": "2 cube within 10",
    "target": "Each enemy in the area",
    "cost": "Free!",
    "description": "A sudden storm of detritus assaults your foes and leaves them struggling to move. Effect: The ground beneath the area is difficult terrain for enemies.",
    "testLabel": "Power Roll + Reason",
    "testRollMod": "2",
    "testAdditionalEffect": "The ground beneath the area is difficult terrain for enemies.",
    "tier1Damage": "2",
    "tier2Damage": "5",
    "tier3Damage": "7"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1780184835292_ee8bb41176d238",
        "name": "area",
        "mode": "area",
        "predicate": "enemy",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "distance": {
          "form": "cube",
          "value": 2,
          "secondary": 0,
          "within": 10
        },
        "shape": "cube",
        "size": 2
      },
      {
        "type": "powerRoll",
        "id": "powerroll_1780184835292_a77f764a03a158",
        "attribute": "Reason",
        "bonus": 0,
        "target": "area",
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
                "attribute": "",
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
                "attribute": "",
                "damageType": "untyped"
              }
            ]
          }
        }
      },
      {
        "type": "effect",
        "id": "effect_1783462284222_7c1445f7b094f",
        "target": "area",
        "effects": [
          {
            "kind": "note",
            "text": "This area is difficult terrain for enemies."
          }
        ]
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Area",
      "Earth",
      "Magic",
      "Ranged"
    ],
    "usageLimit": null
  }
}
COPY END
```

### The Flesh, a Crucible

Live action id: `action_1774401023254_88e56b64fcc2d8`.

Main Action | Fire,Magic,Ranged,Strike | Range: Ranged 10 | Target: One creature or object | Cost: 3 Essence

Fire engulfs your target and continues to churn. Persistent 1: If the target is within distance at the start of your turn, you can make the power roll again without spending essence.

```json
COPY START
{
  "fields": {
    "name": "The Flesh, a Crucible",
    "actionLabel": "Main Action",
    "keywords": "Fire,Magic,Ranged,Strike",
    "range": "Ranged 10",
    "target": "One creature or object",
    "cost": "3 Essence",
    "description": "Fire engulfs your target and continues to churn. Persistent 1: If the target is within distance at the start of your turn, you can make the power roll again without spending essence.",
    "testLabel": "Power Roll + Reason",
    "testRollMod": "3",
    "tier1Damage": "5 + R",
    "tier1DamageType": "fire",
    "tier2Damage": "8 + R",
    "tier2DamageType": "fire",
    "tier3Damage": "11 + R",
    "tier3DamageType": "fire"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1780187077563_6e5e20dc660c2",
        "name": "target",
        "mode": "token",
        "predicate": "creatureOrObject",
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
        "id": "powerroll_1780187077563_0b07171a75e978",
        "attribute": "Reason",
        "bonus": 0,
        "target": "target",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 5,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "fire"
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 8,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "fire"
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 11,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "Reason",
                "damageType": "fire"
              }
            ]
          }
        }
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Fire",
      "Magic",
      "Ranged",
      "Strike"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Conflagration

Live action id: `action_1774401030464_4af0d171bf88d`.

Main Action | Area,Fire,Magic,Ranged | Range: 3 cube within 10 | Target: Each enemy in the area | Cost: 5 Essence

A storm of fire descends upon your enemies. Persistent 2: At the start of your turn, you can use a maneuver to use this ability again without spending essence.

```json
COPY START
{
  "fields": {
    "name": "Conflagration",
    "actionLabel": "Main Action",
    "keywords": "Area,Fire,Magic,Ranged",
    "range": "3 cube within 10",
    "target": "Each enemy in the area",
    "cost": "5 Essence",
    "description": "A storm of fire descends upon your enemies. Persistent 2: At the start of your turn, you can use a maneuver to use this ability again without spending essence.",
    "testLabel": "Power Roll + Reason",
    "testRollMod": "3",
    "tier1Damage": "4",
    "tier1DamageType": "fire",
    "tier2Damage": "6",
    "tier2DamageType": "fire",
    "tier3Damage": "10",
    "tier3DamageType": "fire"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1780187201320_b143516f69c4",
        "name": "area",
        "mode": "area",
        "predicate": "enemy",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "distance": {
          "form": "cube",
          "value": 3,
          "secondary": 0,
          "within": 10
        },
        "shape": "cube",
        "size": 3
      },
      {
        "type": "powerRoll",
        "id": "powerroll_1780187201320_18e005216ad848",
        "attribute": "Reason",
        "bonus": 0,
        "target": "area",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
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
          "tier2": {
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
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 10,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "fire"
              }
            ]
          }
        }
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Area",
      "Fire",
      "Magic",
      "Ranged"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Maw of Earth

Live action id: `action_1774401033116_78db2c6e9cc608`.

Main Action | Area,Earth,Magic,Ranged | Range: 3 cube within 10 | Target: Each enemy in the area | Cost: 7 Essence

You open up the ground, spewing out shrapnel of stone and debris. Effect: The ground in or directly beneath the area drops 3 squares.

```json
COPY START
{
  "fields": {
    "name": "Maw of Earth",
    "actionLabel": "Main Action",
    "keywords": "Area,Earth,Magic,Ranged",
    "range": "3 cube within 10",
    "target": "Each enemy in the area",
    "cost": "7 Essence",
    "description": "You open up the ground, spewing out shrapnel of stone and debris. Effect: The ground in or directly beneath the area drops 3 squares.",
    "testLabel": "Power Roll + Reason",
    "testRollMod": "2",
    "testAdditionalEffect": "The ground in or directly beneath the area drops 3 squares.",
    "tier1Damage": "5",
    "tier2Damage": "9",
    "tier3Damage": "12"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1780187446462_138b6770c61ba",
        "name": "area",
        "mode": "area",
        "predicate": "enemy",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "distance": {
          "form": "cube",
          "value": 3,
          "secondary": 0,
          "within": 10
        },
        "shape": "cube",
        "size": 3
      },
      {
        "type": "powerRoll",
        "id": "powerroll_1780187446462_620880325a85a",
        "attribute": "Reason",
        "bonus": 0,
        "target": "area",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 5,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "untyped"
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 9,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "untyped"
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 12,
                "amountDice": "",
                "markBonusDice": "",
                "markPredicate": "",
                "attribute": "",
                "damageType": "untyped"
              }
            ]
          }
        }
      },
      {
        "type": "effect",
        "id": "effect_1783462284223_71ee5a479bd19",
        "target": "area",
        "effects": [
          {
            "kind": "note",
            "text": "The ground here has dropped 3 squares (a pit)."
          }
        ]
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Area",
      "Earth",
      "Magic",
      "Ranged"
    ],
    "usageLimit": null
  }
}
COPY END
```

## Maneuvers

### O Flower Aid, O Earth Defend

Live action id: `action_1774401670370_3f41bfb7114cb8`.

Maneuver | Maneuver,Area,Earth,Green,Magic,Ranged | Range: 3 cube within 10 | Target: Special | Cost: 5 Essence

Until the start of your next turn, the area gains: (1) Once at the start of your turn as a free maneuver, you and each ally in the area can spend any number of Recoveries. (2) The area is difficult terrain for enemies. (3) Each enemy who enters the area for the first time in a combat round or starts their turn there takes damage equal to your Reason score.

```json
COPY START
{
  "fields": {
    "name": "O Flower Aid, O Earth Defend",
    "actionLabel": "Maneuver",
    "keywords": "Maneuver,Area,Earth,Green,Magic,Ranged",
    "range": "3 cube within 10",
    "target": "Special",
    "cost": "5 Essence",
    "description": "Until the start of your next turn, the area gains: (1) Once at the start of your turn as a free maneuver, you and each ally in the area can spend any number of Recoveries. (2) The area is difficult terrain for enemies. (3) Each enemy who enters the area for the first time in a combat round or starts their turn there takes damage equal to your Reason score."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "target",
        "id": "target_1780187914310_6ad673ff96634",
        "name": "area",
        "mode": "area",
        "predicate": "enemy",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "distance": {
          "form": "cube",
          "value": 3,
          "secondary": 0,
          "within": 10
        },
        "shape": "cube",
        "size": 3
      },
      {
        "type": "persistent",
        "id": "persistent_1780187914310_74d1ea4df1788",
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
            "amount": 0,
            "amountDice": "",
            "markBonusDice": "",
            "markPredicate": "",
            "attribute": "Reason",
            "damageType": "untyped"
          }
        ],
        "target": "area",
        "note": "Difficult terrain for enemies. At the start of your turn (free maneuver), you and each ally in the area may spend any number of Recoveries."
      },
      {
        "type": "effect",
        "id": "effect_1780187914310_78a9d3155a4458",
        "target": "",
        "effects": [
          {
            "kind": "note",
            "text": "O Flower Aid, O Earth Defend: area is difficult terrain for enemies; at the start of your turn you and each ally inside may spend any number of Recoveries (apply heals manually)."
          }
        ]
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Maneuver",
      "Area",
      "Earth",
      "Green",
      "Magic",
      "Ranged"
    ],
    "usageLimit": null
  }
}
COPY END
```

## Triggered Actions

### Explosive Assistance

Replaces **Skin Like Castle Walls** (swap made 2026-07-14; the old block is gone from this file — regenerate from the class doc if it's ever needed again).

Triggered Action | Fire,Magic,Ranged | Range: Ranged 10 | Target: Self or one ally | Trigger: The target force moves a creature or object.

You add a little magic to an ally's aggression at just the right time. Effect: The forced movement distance gains a bonus equal to your Reason score. Spend 1 Essence: The forced movement distance gains a bonus equal to twice your Reason score instead.

Authoring notes:
- The trigger listens on `forcedMovementDealt` (Zepha or an ally force moves a creature or object). By the time the `!` is resolved, the original push/pull/slide has already happened at its printed distance, so the "bonus" is applied as **follow-up forced movement of the pushed creature** — pick the creature that was force moved and move it the extra squares, continuing the original direction (the engine offers a free-form slide; honor the original verb's direction manually).
- "Twice your Reason instead" is modeled as base +R always, plus an optional **Spend 1 Essence for another +R** (R + R = 2R — same total, and declining the spend leaves the base R bonus).

```json
COPY START
{
  "fields": {
    "name": "Explosive Assistance",
    "useWhen": "You or an ally within 10 force moves a creature or object.",
    "actionLabel": "Triggered Action",
    "keywords": "Fire,Magic,Ranged",
    "range": "Ranged 10",
    "target": "Self or one ally",
    "trigger": "The target force moves a creature or object.",
    "description": "You add a little magic to an ally's aggression at just the right time. Effect: The forced movement distance gains a bonus equal to your Reason score. Spend 1 Essence: The forced movement distance gains a bonus equal to twice your Reason score instead."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "trigger",
        "condition": "You or an ally within 10 squares force moves a creature or object.",
        "target": "",
        "effectTarget": "",
        "effects": [],
        "match": {
          "event": "forcedMovementDealt",
          "filter": {
            "whose": "ally",
            "minDistance": 1,
            "withinSquares": 10
          }
        }
      },
      {
        "type": "target",
        "name": "movedCreature",
        "mode": "token",
        "predicate": "creatureOrObject",
        "count": { "value": 1, "mode": "exact" },
        "optional": false,
        "promptTitle": "Explosive Assistance",
        "promptText": "Pick the creature or object that was just force moved.",
        "distance": { "form": "ranged", "value": 20 }
      },
      {
        "type": "effect",
        "target": "movedCreature",
        "effects": [
          {
            "kind": "note",
            "text": "Explosive Assistance: the forced movement gains +Reason distance (continue the original push/pull/slide direction)."
          },
          {
            "kind": "forcedMovement",
            "verb": "slide",
            "distance": 0,
            "attribute": "Reason",
            "upTo": true
          },
          {
            "kind": "spend",
            "resource": "Essence",
            "amount": 1,
            "maxAmount": 1,
            "timing": "postResult",
            "prompt": "Spend 1 Essence: the bonus becomes twice your Reason instead (move the target another Reason squares)?",
            "effects": [
              {
                "kind": "forcedMovement",
                "verb": "slide",
                "distance": 0,
                "attribute": "Reason",
                "upTo": true
              }
            ]
          }
        ]
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Fire",
      "Magic",
      "Ranged"
    ],
    "usageLimit": null
  }
}
COPY END
```

### Ward of Surprising Reactivity

Live action id: `action_1774397426920_95b292274d2b3`.

Free Triggered Action | Fire,Magic | Range: Self | Target: The triggering creature | Trigger: An adjacent creature deals damage to you.

You use the magic of fire to create a ward of explosive energy. Whenever an adjacent creature deals damage to you, you can use a free triggered action to push that creature up to a number of squares equal to twice your Reason score.

```json
COPY START
{
  "fields": {
    "name": "Ward of Surprising Reactivity",
    "actionLabel": "Free Triggered Action",
    "keywords": "Fire,Magic",
    "range": "Self",
    "target": "The triggering creature",
    "trigger": "An adjacent creature deals damage to you.",
    "description": "You use the magic of fire to create a ward of explosive energy. Whenever an adjacent creature deals damage to you, you can use a free triggered action to push that creature up to a number of squares equal to twice your Reason score."
  },
  "automation": {
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [
      {
        "type": "trigger",
        "id": "trigger_1780205976739_5a23e8e4afb048",
        "condition": "An adjacent creature deals damage to you.",
        "target": "",
        "effectTarget": "",
        "effects": [],
        "match": {
          "event": "damage",
          "filter": {
            "whose": "self",
            "withinSquares": 1,
            "minAmount": 1
          }
        }
      },
      {
        "type": "target",
        "id": "target_1780205976739_4749728d7f317",
        "name": "attacker",
        "mode": "token",
        "predicate": "creature",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "promptTitle": "Pick the Triggering Creature",
        "promptText": "Choose the adjacent creature that dealt damage to you.",
        "distance": {
          "form": "melee",
          "value": 1,
          "secondary": 0,
          "within": 0
        }
      },
      {
        "type": "effect",
        "id": "effect_1780205976739_ad12a58026a6a",
        "target": "attacker",
        "effects": [
          {
            "kind": "forcedMovement",
            "verb": "push",
            "distance": 0,
            "upTo": true,
            "attribute": "Reason",
            "multiplier": 2
          }
        ]
      }
    ],
    "modifiers": [],
    "passives": [],
    "keywords": [
      "Fire",
      "Magic"
    ],
    "usageLimit": null
  }
}
COPY END
```

## Heroic Resource - Essence

```json
COPY START
{
  "schema": "heroic-resource/v1",
  "rules": [
    {
      "id": "elementalist-combat-start-victories",
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
      "id": "elementalist-turn-start-essence",
      "event": "turnStart",
      "filter": {
        "whose": "self"
      },
      "limit": null,
      "effect": {
        "kind": "gain",
        "amount": {
          "amount": 2
        }
      },
      "prompt": "Gain {amount} {resource}: start of your turn.",
      "autoApply": false,
      "enabled": true
    },
    {
      "id": "elementalist-font-of-essence-damage",
      "event": "damage",
      "filter": {
        "withinSquares": 10,
        "damageTypeNot": [
          "untyped",
          "holy"
        ]
      },
      "limit": {
        "scope": "round",
        "key": "elementalist-font-of-essence-damage",
        "target": "self",
        "markOn": "offered"
      },
      "effect": {
        "kind": "gain",
        "amount": {
          "amount": 2
        }
      },
      "prompt": "Gain {amount} {resource}: Font of Essence, first qualifying non-untyped/non-holy damage within 10 squares this round.",
      "autoApply": false,
      "enabled": true
    },
    {
      "id": "elementalist-combat-end-reset",
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

- Main Actions: **Charge** - Main Action | Magic,Ranged,Strike | Cost: Free
- Main Actions: **Defend** - Main Action |  | Cost: Free!
- Main Actions: **Free Strike** - Main Action |  | Range: Melee 1 (Ranged 5) | Target: One creature or object | Cost: Free!
- Main Actions: **Heal** - Main Action |
- Main Actions: **Swap** - Main Action |
- Maneuvers: **Practical Magic** - Maneuver | Magic | Range: Self; see below | Target: Self
- Maneuvers: **Push** - Maneuver |

### Features

- **Essence Outside of Combat** - Though you can't gain essence outside of combat, you can use your heroic abilities and effects that cost essence without spending it. Whenever you use an ability of effect outside of combat that costs essence, you can't use the same ability or effect outside of combat again until you earn 1 or more Victories or finish a respite.When you use a persistent ability outside of combat (see Persistent Magic), you can maintain it for a number of rounds equal to your Victories.When you use an ability outside of combat that lets you spend unlimited essence on its effect, you can use it as if you had spent an amount of essence equal to your Victories. (Such abilities aren't part of the core rules for the Elementalist but might appear in future products)
- **Persistent Magic** - Some of your heroic abilities have a persistent effect entry. For example, the Instantaneous Excavation ability has an effect noted as "Persistent 1." Whenever you use a persistent ability, you decide whether you want to maintain it, and start doing so immediately after you first use the ability. If you maintain a persistent ability in combat, you reduce the amount of essence you ear at the start of your turn by an amount equal to the ability's persistent value, which enables the ability's persistent effect. All your active persistent abilities end at the end of the encounter. You can't maintain any abilities that would make you earn a negative amount of essence at the start of your turn or have a negative amount of essence outside of combat. You can stop maintaining an ability at any time (no action required).If you maintain the same ability on several targets and the effect includes a power roll, you make that roll once an apply the same effect to all targets A creature can't be affected by multiple instances of  persistent ability.
- **Enchantment** - You weave an elemental enchantment into your body that enhances your statistics. Choose one of the following enchantments. You can change your enchantment and ward by performing a complex ritual as a respite activity.Enchantment of BattleYou can wear light armor and wield light weapons effectively, even though you don't have a kit. When you wear light armor, you gain a +3 bonus to Stamina, and that bonus increases by 3 at 4th, 7th, and 10th levels. While you wield a light weapon, you gain a +1 damage bonus with weapon abilities, including free strikes. You can use light armor treasures and light weapon treasures. If you have a kit, you can't take this enchantment.Enchantment of CelerityYou gain a +1 bonus to speed and the distance you can shift when you take the Disengage move action.Enchantment of DestructionYou gain a +1 bonus to rolled damage with magic abilities.Enchantment of DistanceYou have a +2 bonus to the distance of your ranged magic abilities.Enchantment of PermanenceYou gain a +6 bonus to Stamina, and this bonus increases by 6 at 4th, 7th, and 10th levels. Additionally, you gain a +1 bonus to stability.
- **Elementalist Ward** - You create an invisible elemental ward that protects you. Choose one of the following wards. You can change your wand and enchantment by performing a complex ritual as a respite activity)Ward of Delightful ConsequencesA protective field of void absorbs violence aimed at you, then lets you hurl it back at your enemies. The first time each round that you take damage, you gain 1 surge.Ward of Excellent ProtectionYou weave a shield of all the elements around yourself, channeling their full protective power. You have immunity to acid, cold, corruption, fire, lightning, poison, or sonic damage equal to your Reason score.Ward of Nature's AffectionThe green energy writhing within your body allows you to produce powerful vines when you're in danger. Whenever a creature within a number of scores equal to your Reason score deals damage to you, you can use a free triggered action to slide that creature up to a number of squares equal to your Reason score.Ward of Surprising ReactivityYou use the magic of fire to create a ward of explosive energy. Whenever an adjacent creature deals damage to you, you can use a free triggered action to push that creature a number of squares equal to twice the Reason score.
- **Disciple of Fire** - Your connection to fire allows you to protect yourself from it, even as you rip away the protection of others. You have fire immunity equal to 5 plus your level in this class. Additionally, fire damage you deal ignores a target's fire immunity.At the start of a combat encounter, you gain a number of surges equal to your Victories. Whenever you spend a surge to deal extra damage, you can make that damage fire damage.
- **A Conversation With Fire** - When you spend 1 uninterrupted minuet in front of a fire, you can speak the name of another creature. If that creature is willing to speak to you, their image appears in the fire, and they can see you before them in a shimmering ball of light. The two of you can speak to each through these images as if you were together in person. As a maneuver, you or the creature can end the conversation.

