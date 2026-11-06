# Null - VTT Automations (every Null)

What every Null has (November 5, 2026). Tradition, augmentation and chosen abilities are per hero: Pippa's full set is in pippa-automations.md. Knockback and Grab here carry the Metakinetic Mastery 2 and 6 benefits; another tradition changes those.

How to add: the sheet's **✎ Edit → ⇪ Import JSON** for each block; the Discipline block goes in **✎ Resource**.

## Discipline

```json
{
  "schema": "heroic-resource/v1",
  "rules": [
    {
      "id": "null-combat-start",
      "event": "combatStart",
      "effect": {
        "kind": "set",
        "amount": {
          "from": "victories"
        }
      },
      "prompt": "Set {resource} to {amount}: combat start (Victories).",
      "autoApply": true
    },
    {
      "id": "null-turn-start",
      "event": "turnStart",
      "filter": {
        "whose": "self"
      },
      "effect": {
        "kind": "gain",
        "amount": 2
      },
      "prompt": "Your turn starts. Gain {amount} {resource}"
    },
    {
      "id": "null-enemy-main-action",
      "event": "actionUsed",
      "filter": {
        "whose": "enemy",
        "actionKind": "main",
        "insideAura": "Null Field"
      },
      "limit": {
        "scope": "round",
        "key": "null-enemy-main-action"
      },
      "effect": {
        "kind": "gain",
        "amount": {
          "amountByLevel": [
            {
              "min": 1,
              "amount": 1
            },
            {
              "min": 4,
              "amount": 2
            }
          ]
        }
      },
      "prompt": "An enemy in your Null Field used a main action, the first this round. Gain {amount} {resource}"
    },
    {
      "id": "null-director-malice",
      "event": "maliceSpent",
      "limit": {
        "scope": "round",
        "key": "null-director-malice"
      },
      "effect": {
        "kind": "gain",
        "amount": 1
      },
      "prompt": "The Director used an ability that costs Malice, the first this round. Gain {amount} {resource}"
    },
    {
      "id": "null-combat-end",
      "event": "combatEnd",
      "effect": {
        "kind": "set",
        "amount": 0
      },
      "prompt": "Reset {resource} to 0: combat ended.",
      "autoApply": true
    }
  ]
}
```

## Null Field

Maneuver | Area, Psionic | 1 aura | Each enemy in the area

You project an aura that dampens the power of your foes. Effect: Each target reduces their potencies by 1. Switches on by itself when a fight starts and stays on after it; ends only while you are dying or if you end it (use it again). Once as a free maneuver on each of your turns, you can spend 1 discipline for one option until the start of your next turn: Gravitic Disruption, Inertial Anchor or Synaptic Break.

```json
{
  "name": "Null Field",
  "actionLabel": "Maneuver",
  "keywords": "Area, Psionic",
  "range": "1 aura",
  "target": "Each enemy in the area",
  "cost": "",
  "description": "You project an aura that dampens the power of your foes. Effect: Each target reduces their potencies by 1. Switches on by itself when a fight starts and stays on after it; ends only while you are dying or if you end it (use it again). Once as a free maneuver on each of your turns, you can spend 1 discipline for one option until the start of your next turn: Gravitic Disruption, Inertial Anchor or Synaptic Break.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "effect",
        "target": "self",
        "effects": [
          {
            "kind": "aura",
            "radius": 1,
            "toggle": true,
            "autoOn": "combatStart",
            "color": "#a78bfa",
            "affects": "enemy",
            "potency": {
              "occupants": -1
            },
            "requires": {
              "notDying": true
            },
            "text": "Each enemy in the Null Field reduces their potencies by 1."
          }
        ]
      }
    ]
  }
}
```
## Null Field: Synaptic Break

Free Maneuver | Psionic | Null Field | Each enemy in the area | 1 Discipline

Until the start of your next turn: whenever you or any ally uses an ability against a target in your Null Field that has a potency effect, the potency is increased by 1.

```json
{
  "name": "Null Field: Synaptic Break",
  "actionLabel": "Free Maneuver",
  "keywords": "Psionic",
  "range": "Null Field",
  "target": "Each enemy in the area",
  "cost": "1 Discipline",
  "description": "Until the start of your next turn: whenever you or any ally uses an ability against a target in your Null Field that has a potency effect, the potency is increased by 1.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "effect",
        "target": "self",
        "effects": [
          {
            "kind": "aura",
            "radius": 1,
            "followsAura": "Null Field",
            "color": "#f472b6",
            "affects": "enemy",
            "potency": {
              "against": 1
            },
            "requires": {
              "notDying": true
            },
            "expires": {
              "event": "turnStart",
              "whose": "self"
            },
            "text": "Synaptic Break: potencies against enemies in the Null Field +1."
          }
        ]
      }
    ]
  }
}
```
## Null Field: Inertial Anchor

Free Maneuver | Psionic | Null Field | Each enemy in the area | 1 Discipline

Until the start of your next turn: any target who starts their turn in the area can't shift.

```json
{
  "name": "Null Field: Inertial Anchor",
  "actionLabel": "Free Maneuver",
  "keywords": "Psionic",
  "range": "Null Field",
  "target": "Each enemy in the area",
  "cost": "1 Discipline",
  "description": "Until the start of your next turn: any target who starts their turn in the area can't shift.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "effect",
        "target": "self",
        "effects": [
          {
            "kind": "aura",
            "radius": 1,
            "followsAura": "Null Field",
            "color": "#60a5fa",
            "affects": "enemy",
            "requires": {
              "notDying": true
            },
            "triggers": [
              {
                "event": "occupantTurnStart"
              }
            ],
            "effects": [
              {
                "kind": "note",
                "text": "Inertial Anchor: started its turn in the Null Field, can't shift this turn."
              }
            ],
            "expires": {
              "event": "turnStart",
              "whose": "self"
            },
            "text": "Inertial Anchor: enemies who start their turn in the Null Field can't shift."
          }
        ]
      }
    ]
  }
}
```
## Null Field: Gravitic Disruption

Free Maneuver | Psionic | Null Field | Each enemy in the area | 1 Discipline

Until the start of your next turn: the first time on a turn that a target takes damage, you can slide them up to 2 squares.

```json
{
  "name": "Null Field: Gravitic Disruption",
  "actionLabel": "Free Maneuver",
  "keywords": "Psionic",
  "range": "Null Field",
  "target": "Each enemy in the area",
  "cost": "1 Discipline",
  "description": "Until the start of your next turn: the first time on a turn that a target takes damage, you can slide them up to 2 squares.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "effect",
        "target": "self",
        "effects": [
          {
            "kind": "aura",
            "radius": 1,
            "followsAura": "Null Field",
            "color": "#34d399",
            "affects": "enemy",
            "requires": {
              "notDying": true
            },
            "triggers": [
              {
                "event": "damage",
                "whose": "occupant"
              }
            ],
            "effects": [
              {
                "kind": "note",
                "text": "Gravitic Disruption: the first time this turn, Pippa can slide it up to 2 squares (Ctrl-drag)."
              }
            ],
            "expires": {
              "event": "turnStart",
              "whose": "self"
            },
            "text": "Gravitic Disruption: slide up to 2 the first time on a turn an enemy in the field takes damage."
          }
        ]
      }
    ]
  }
}
```
## Inertial Shield

Triggered Action | Psionic | Self | Self

Trigger: You take damage. Effect: You take half the damage. Spend 1 Discipline: The potency of one effect associated with the damage is reduced by 1 for you. Metakinetic: afterwards you can use Knockback as a free triggered action.

```json
{
  "name": "Inertial Shield",
  "actionLabel": "Triggered Action",
  "keywords": "Psionic",
  "range": "Self",
  "target": "Self",
  "trigger": "You take damage.",
  "cost": "",
  "description": "Trigger: You take damage. Effect: You take half the damage. Spend 1 Discipline: The potency of one effect associated with the damage is reduced by 1 for you. Metakinetic: afterwards you can use Knockback as a free triggered action.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "trigger",
        "resolve": "popup",
        "usesTriggeredAction": true,
        "condition": "You take damage.",
        "match": {
          "event": "damage",
          "filter": {
            "whose": "self",
            "minAmount": 1
          }
        }
      },
      {
        "type": "effect",
        "target": "self",
        "effects": [
          {
            "kind": "halveTriggeringDamage"
          },
          {
            "kind": "note",
            "text": "Spend 1 Discipline: the potency of one effect that came with the damage is reduced by 1 for you (by hand). Metakinetic: you can use Knockback now as a free triggered action."
          }
        ]
      }
    ]
  }
}
```
## Reorder

Free Triggered Action | Psionic | Self or Null Field | Self or one ally in the Null Field

At the start of each of your turns, you can use a free triggered action to end one effect on you that is ended by a saving throw or that ends at the end of your turn. Alternatively, you can grant this benefit to one creature in the area of your Null Field ability.

```json
{
  "name": "Reorder",
  "actionLabel": "Free Triggered Action",
  "keywords": "Psionic",
  "range": "Self or Null Field",
  "target": "Self or one ally in the Null Field",
  "trigger": "The start of your turn.",
  "cost": "",
  "description": "At the start of each of your turns, you can use a free triggered action to end one effect on you that is ended by a saving throw or that ends at the end of your turn. Alternatively, you can grant this benefit to one creature in the area of your Null Field ability.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "trigger",
        "resolve": "popup",
        "condition": "You or an ally in your Null Field has an effect a save ends, or that ends at the end of the turn.",
        "match": {
          "event": "turnStart",
          "filter": {
            "whose": "self",
            "endableConditionIn": {
              "aura": "Null Field",
              "includeSelf": true,
              "whose": "ally"
            }
          }
        }
      },
      {
        "type": "effect",
        "target": "self",
        "effects": [
          {
            "kind": "endConditionChoice",
            "among": {
              "aura": "Null Field",
              "includeSelf": true,
              "whose": "ally"
            }
          }
        ]
      }
    ]
  }
}
```
## Knockback

Maneuver | Melee, Weapon | Melee 1 | One creature

Psionic Martial Arts: Intuition instead of Might (also for targeting creatures larger than you); you can slide instead of push. Metakinetic: 2+ Discipline, the distance gains your Intuition; 6+ Discipline, an edge.

```json
{
  "name": "Knockback",
  "actionLabel": "Maneuver",
  "keywords": "Melee, Weapon",
  "range": "Melee 1",
  "target": "One creature",
  "cost": "",
  "description": "Psionic Martial Arts: Intuition instead of Might (also for targeting creatures larger than you); you can slide instead of push. Metakinetic: 2+ Discipline, the distance gains your Intuition; 6+ Discipline, an edge.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "target",
        "name": "target",
        "mode": "token",
        "predicate": "creature",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "distance": {
          "form": "melee",
          "value": 1
        }
      },
      {
        "type": "branch",
        "condition": {
          "kind": "resource",
          "min": 6
        },
        "then": [
          {
            "type": "powerRoll",
            "attribute": "Intuition",
            "bonus": 2,
            "target": "target",
            "rollFormula": "2d10",
            "tiers": {
              "tier1": {
                "effects": [
                  {
                    "kind": "forcedMovement",
                    "verb": "slide",
                    "distance": 1,
                    "attribute": "Intuition"
                  }
                ]
              },
              "tier2": {
                "effects": [
                  {
                    "kind": "forcedMovement",
                    "verb": "slide",
                    "distance": 2,
                    "attribute": "Intuition"
                  }
                ]
              },
              "tier3": {
                "effects": [
                  {
                    "kind": "forcedMovement",
                    "verb": "slide",
                    "distance": 3,
                    "attribute": "Intuition"
                  }
                ]
              }
            }
          }
        ],
        "else": [
          {
            "type": "branch",
            "condition": {
              "kind": "resource",
              "min": 2
            },
            "then": [
              {
                "type": "powerRoll",
                "attribute": "Intuition",
                "bonus": 0,
                "target": "target",
                "rollFormula": "2d10",
                "tiers": {
                  "tier1": {
                    "effects": [
                      {
                        "kind": "forcedMovement",
                        "verb": "slide",
                        "distance": 1,
                        "attribute": "Intuition"
                      }
                    ]
                  },
                  "tier2": {
                    "effects": [
                      {
                        "kind": "forcedMovement",
                        "verb": "slide",
                        "distance": 2,
                        "attribute": "Intuition"
                      }
                    ]
                  },
                  "tier3": {
                    "effects": [
                      {
                        "kind": "forcedMovement",
                        "verb": "slide",
                        "distance": 3,
                        "attribute": "Intuition"
                      }
                    ]
                  }
                }
              }
            ],
            "else": [
              {
                "type": "powerRoll",
                "attribute": "Intuition",
                "bonus": 0,
                "target": "target",
                "rollFormula": "2d10",
                "tiers": {
                  "tier1": {
                    "effects": [
                      {
                        "kind": "forcedMovement",
                        "verb": "slide",
                        "distance": 1
                      }
                    ]
                  },
                  "tier2": {
                    "effects": [
                      {
                        "kind": "forcedMovement",
                        "verb": "slide",
                        "distance": 2
                      }
                    ]
                  },
                  "tier3": {
                    "effects": [
                      {
                        "kind": "forcedMovement",
                        "verb": "slide",
                        "distance": 3
                      }
                    ]
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  }
}
```
## Grab

Maneuver | Melee, Weapon | Melee 1 | One creature

Psionic Martial Arts: Intuition instead of Might. Metakinetic: 6+ Discipline, an edge. 12-16: you can grab the target, but it can make a melee free strike against you first.

```json
{
  "name": "Grab",
  "actionLabel": "Maneuver",
  "keywords": "Melee, Weapon",
  "range": "Melee 1",
  "target": "One creature",
  "cost": "",
  "description": "Psionic Martial Arts: Intuition instead of Might. Metakinetic: 6+ Discipline, an edge. 12-16: you can grab the target, but it can make a melee free strike against you first.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "target",
        "name": "target",
        "mode": "token",
        "predicate": "creature",
        "count": {
          "value": 1,
          "mode": "exact"
        },
        "optional": false,
        "distance": {
          "form": "melee",
          "value": 1
        }
      },
      {
        "type": "branch",
        "condition": {
          "kind": "resource",
          "min": 6
        },
        "then": [
          {
            "type": "powerRoll",
            "attribute": "Intuition",
            "bonus": 2,
            "target": "target",
            "rollFormula": "2d10",
            "tiers": {
              "tier1": {
                "effects": [
                  {
                    "kind": "note",
                    "text": "No effect."
                  }
                ]
              },
              "tier2": {
                "effects": [
                  {
                    "kind": "note",
                    "text": "You can grab it, but it makes a melee free strike against you first."
                  },
                  {
                    "kind": "condition",
                    "name": "grabbed",
                    "duration": "endOfEncounter"
                  }
                ]
              },
              "tier3": {
                "effects": [
                  {
                    "kind": "condition",
                    "name": "grabbed",
                    "duration": "endOfEncounter"
                  }
                ]
              }
            }
          }
        ],
        "else": [
          {
            "type": "powerRoll",
            "attribute": "Intuition",
            "bonus": 0,
            "target": "target",
            "rollFormula": "2d10",
            "tiers": {
              "tier1": {
                "effects": [
                  {
                    "kind": "note",
                    "text": "No effect."
                  }
                ]
              },
              "tier2": {
                "effects": [
                  {
                    "kind": "note",
                    "text": "You can grab it, but it makes a melee free strike against you first."
                  },
                  {
                    "kind": "condition",
                    "name": "grabbed",
                    "duration": "endOfEncounter"
                  }
                ]
              },
              "tier3": {
                "effects": [
                  {
                    "kind": "condition",
                    "name": "grabbed",
                    "duration": "endOfEncounter"
                  }
                ]
              }
            }
          }
        ]
      }
    ]
  }
}
```
