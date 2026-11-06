# Pippa - VTT Automations

Level 4 Polder **Null**, Metakinetic tradition, Density Augmentation (sheet player6; November 5, 2026). Might 1, Agility 3, Reason -1, Intuition 3, Presence 1. Stamina 60, Recoveries 8, Speed 8, Disengage 5, Stability 1, Size 1S, Save 6+.

How to add: her sheet **✎ Edit → ⇪ Import JSON** (each lands in its list by its label). The Discipline block goes in **✎ Resource**.

Manual (Director text): Enhanced Null Field's supernatural terrain, Psionic Leap, Shadowmeld, Danger Sense, Team Leader, Specialist, Phase Inversion Strike's opposite square, Kinetic Shield's bleeding, object size limits.

## Discipline (Resource automation)

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

## Main actions

### Kinetic Strike

Main Action | Melee, Psionic, Strike, Weapon | Melee 1 | One creature or object | Signature

Your opponent staggers. They cannot ignore you.

```json
{
  "name": "Kinetic Strike",
  "actionLabel": "Main Action",
  "keywords": "Melee, Psionic, Strike, Weapon",
  "range": "Melee 1",
  "target": "One creature or object",
  "cost": "Signature",
  "description": "Your opponent staggers. They cannot ignore you.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "target",
        "name": "target",
        "mode": "token",
        "predicate": "creatureOrObject",
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
        "type": "powerRoll",
        "attribute": "Agility",
        "bonus": 0,
        "target": "target",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 4,
                "attribute": "Agility"
              },
              {
                "kind": "condition",
                "name": "taunted",
                "duration": "endOfTurn"
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 5,
                "attribute": "Agility"
              },
              {
                "kind": "condition",
                "name": "taunted",
                "duration": "endOfTurn"
              },
              {
                "kind": "forcedMovement",
                "verb": "slide",
                "distance": 1
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 6,
                "attribute": "Agility"
              },
              {
                "kind": "condition",
                "name": "taunted",
                "duration": "endOfTurn"
              },
              {
                "kind": "forcedMovement",
                "verb": "slide",
                "distance": 2
              }
            ]
          }
        }
      }
    ],
    "keywords": [
      "Melee",
      "Psionic",
      "Strike",
      "Weapon"
    ]
  }
}
```

### Phase Inversion Strike

Main Action | Melee, Psionic, Strike, Weapon | Melee 1 | One creature or object | Signature

Effect: Before the push is resolved, you teleport the target to a square adjacent to you and opposite the one they started in. If the target can't be teleported this way, you can't push them.

```json
{
  "name": "Phase Inversion Strike",
  "actionLabel": "Main Action",
  "keywords": "Melee, Psionic, Strike, Weapon",
  "range": "Melee 1",
  "target": "One creature or object",
  "cost": "Signature",
  "description": "Effect: Before the push is resolved, you teleport the target to a square adjacent to you and opposite the one they started in. If the target can't be teleported this way, you can't push them.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "target",
        "name": "target",
        "mode": "token",
        "predicate": "creatureOrObject",
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
        "type": "powerRoll",
        "attribute": "Agility",
        "bonus": 0,
        "target": "target",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 4,
                "attribute": "Agility"
              },
              {
                "kind": "teleport",
                "distance": 2
              },
              {
                "kind": "forcedMovement",
                "verb": "push",
                "distance": 2
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 6,
                "attribute": "Agility"
              },
              {
                "kind": "teleport",
                "distance": 2
              },
              {
                "kind": "forcedMovement",
                "verb": "push",
                "distance": 4
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 8,
                "attribute": "Agility"
              },
              {
                "kind": "teleport",
                "distance": 2
              },
              {
                "kind": "forcedMovement",
                "verb": "push",
                "distance": 6
              }
            ]
          }
        }
      },
      {
        "type": "effect",
        "target": "self",
        "effects": [
          {
            "kind": "note",
            "text": "Teleport the target to the square on the far side of you (adjacent, opposite where it started), then push it away. If it can't go there, skip the push."
          }
        ]
      }
    ],
    "keywords": [
      "Melee",
      "Psionic",
      "Strike",
      "Weapon"
    ]
  }
}
```

### Stunning Blow

Main Action | Melee, Psionic, Strike, Weapon | Melee 1 | One creature or object | 3 Discipline

You focus your psionic technique into a concussive punch.

```json
{
  "name": "Stunning Blow",
  "actionLabel": "Main Action",
  "keywords": "Melee, Psionic, Strike, Weapon",
  "range": "Melee 1",
  "target": "One creature or object",
  "cost": "3 Discipline",
  "description": "You focus your psionic technique into a concussive punch.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "target",
        "name": "target",
        "mode": "token",
        "predicate": "creatureOrObject",
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
        "type": "powerRoll",
        "attribute": "Agility",
        "bonus": 0,
        "target": "target",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 4,
                "attribute": "Agility"
              },
              {
                "kind": "potency",
                "attribute": "I",
                "level": "weak",
                "onFail": [
                  {
                    "kind": "condition",
                    "name": "dazed",
                    "duration": "saveEnds"
                  },
                  {
                    "kind": "condition",
                    "name": "slowed",
                    "duration": "saveEnds"
                  }
                ]
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 5,
                "attribute": "Agility"
              },
              {
                "kind": "potency",
                "attribute": "I",
                "level": "average",
                "onFail": [
                  {
                    "kind": "condition",
                    "name": "dazed",
                    "duration": "saveEnds"
                  },
                  {
                    "kind": "condition",
                    "name": "slowed",
                    "duration": "saveEnds"
                  }
                ]
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 7,
                "attribute": "Agility"
              },
              {
                "kind": "potency",
                "attribute": "I",
                "level": "strong",
                "onFail": [
                  {
                    "kind": "condition",
                    "name": "dazed",
                    "duration": "saveEnds"
                  },
                  {
                    "kind": "condition",
                    "name": "slowed",
                    "duration": "saveEnds"
                  }
                ]
              }
            ]
          }
        }
      }
    ],
    "keywords": [
      "Melee",
      "Psionic",
      "Strike",
      "Weapon"
    ]
  }
}
```

## Maneuvers

### Null Field

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

### Null Field: Synaptic Break

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
    ],
    "usageLimit": {
      "scope": "turn",
      "key": "null-field-option",
      "warn": true,
      "message": "A Null Field option was already used this turn (once per turn, one at a time)."
    }
  }
}
```

### Null Field: Inertial Anchor

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
                "kind": "condition",
                "name": "other",
                "duration": "endOfTurn",
                "text": "Can't shift (Inertial Anchor)"
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
    ],
    "usageLimit": {
      "scope": "turn",
      "key": "null-field-option",
      "warn": true,
      "message": "A Null Field option was already used this turn (once per turn, one at a time)."
    }
  }
}
```

### Null Field: Gravitic Disruption

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
                "kind": "forcedMovement",
                "verb": "slide",
                "distance": 2
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
    ],
    "usageLimit": {
      "scope": "turn",
      "key": "null-field-option",
      "warn": true,
      "message": "A Null Field option was already used this turn (once per turn, one at a time)."
    }
  }
}
```

### Impart Force

Maneuver | Melee, Psionic, Strike, Weapon | Melee 1 | One creature or object | 5 Discipline

Effect: An object you target must be your size or smaller. You gain an edge on this ability. Additionally, for each square you push the target, they take 1 psychic damage.

```json
{
  "name": "Impart Force",
  "actionLabel": "Maneuver",
  "keywords": "Melee, Psionic, Strike, Weapon",
  "range": "Melee 1",
  "target": "One creature or object",
  "cost": "5 Discipline",
  "description": "Effect: An object you target must be your size or smaller. You gain an edge on this ability. Additionally, for each square you push the target, they take 1 psychic damage.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "target",
        "name": "target",
        "mode": "token",
        "predicate": "creatureOrObject",
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
                "verb": "push",
                "distance": 3
              },
              {
                "kind": "damage",
                "amount": 0,
                "damageType": "psychic",
                "amountFrom": {
                  "source": "pushedSquares"
                }
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "forcedMovement",
                "verb": "push",
                "distance": 5
              },
              {
                "kind": "damage",
                "amount": 0,
                "damageType": "psychic",
                "amountFrom": {
                  "source": "pushedSquares"
                }
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "forcedMovement",
                "verb": "push",
                "distance": 7
              },
              {
                "kind": "damage",
                "amount": 0,
                "damageType": "psychic",
                "amountFrom": {
                  "source": "pushedSquares"
                }
              }
            ]
          }
        }
      }
    ],
    "keywords": [
      "Melee",
      "Psionic",
      "Strike",
      "Weapon"
    ]
  }
}
```

### Kinetic Shield

Maneuver | Psionic | Self | Self | 5 Discipline

Effect: While you have temporary Stamina from this ability, you can't be made bleeding even while dying.

```json
{
  "name": "Kinetic Shield",
  "actionLabel": "Maneuver",
  "keywords": "Psionic",
  "range": "Self",
  "target": "Self",
  "cost": "5 Discipline",
  "description": "Effect: While you have temporary Stamina from this ability, you can't be made bleeding even while dying.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "powerRoll",
        "attribute": "Intuition",
        "bonus": 0,
        "target": "self",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "temporaryStamina",
                "amount": 10,
                "target": "self"
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "temporaryStamina",
                "amount": 15,
                "target": "self"
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "temporaryStamina",
                "amount": 20,
                "target": "self"
              }
            ]
          }
        }
      },
      {
        "type": "effect",
        "target": "self",
        "effects": [
          {
            "kind": "note",
            "text": "While this temporary Stamina lasts, Pippa can't be made bleeding, even while dying."
          }
        ]
      }
    ]
  }
}
```

### Synapse Field

Maneuver | Psionic | Self | Self | 7 Discipline

Effect: Until the end of the encounter, the size of your Null Field ability increases by 1. While the area of that ability is enlarged this way, whenever an enemy in the area takes rolled damage, they take extra psychic damage equal to twice your Intuition score.

```json
{
  "name": "Synapse Field",
  "actionLabel": "Maneuver",
  "keywords": "Psionic",
  "range": "Self",
  "target": "Self",
  "cost": "7 Discipline",
  "description": "Effect: Until the end of the encounter, the size of your Null Field ability increases by 1. While the area of that ability is enlarged this way, whenever an enemy in the area takes rolled damage, they take extra psychic damage equal to twice your Intuition score.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "effect",
        "target": "self",
        "effects": [
          {
            "kind": "auraSize",
            "aura": "Null Field",
            "by": 1,
            "until": "combatEnd"
          },
          {
            "kind": "aura",
            "radius": 1,
            "followsAura": "Null Field",
            "color": "#c084fc",
            "affects": "enemy",
            "requires": {
              "notDying": true
            },
            "triggers": [
              {
                "event": "damage",
                "whose": "occupant",
                "filter": {
                  "rolledOnly": true
                }
              }
            ],
            "effects": [
              {
                "kind": "damage",
                "amount": 0,
                "attribute": "Intuition",
                "multiplier": 2,
                "damageType": "psychic"
              }
            ],
            "expires": {
              "event": "combatEnd",
              "whose": "any"
            },
            "text": "Synapse Field: an enemy in the Null Field that takes rolled damage takes 2 x Intuition psychic damage more."
          }
        ]
      }
    ]
  }
}
```

### Knockback

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

### Grab

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

### Shadowmeld

Maneuver | Magic | Self | Self

You become an actual shadow. Effect: You flatten yourself into a shadow against a wall or floor you are touching, and become hidden from any creature you have cover or concealment from or who isn't observing you. While in shadow form, you have full awareness of your surroundings, and strikes made against you and tests made to search for you take a bane. You can't move or be force moved, and you can't take main actions or maneuvers except to exit this form or to direct creatures under your control. Any ability or effect that targets more than 1 square affects you in this form only if it explicitly affects the surface you are flattened against. You can exit this form as a maneuver. If the surface you are flattened against is destroyed, this ability ends and you take 1d6 damage that can't be reduced in any way.

```json
{
  "name": "Shadowmeld",
  "actionLabel": "Maneuver",
  "keywords": "Magic",
  "range": "Self",
  "target": "Self",
  "cost": "",
  "description": "You become an actual shadow. Effect: You flatten yourself into a shadow against a wall or floor you are touching, and become hidden from any creature you have cover or concealment from or who isn't observing you. While in shadow form, you have full awareness of your surroundings, and strikes made against you and tests made to search for you take a bane. You can't move or be force moved, and you can't take main actions or maneuvers except to exit this form or to direct creatures under your control. Any ability or effect that targets more than 1 square affects you in this form only if it explicitly affects the surface you are flattened against. You can exit this form as a maneuver. If the surface you are flattened against is destroyed, this ability ends and you take 1d6 damage that can't be reduced in any way."
}
```

## Triggered actions

### Inertial Shield

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
            "text": "Spend 1 Discipline: the potency of one effect that came with the damage is reduced by 1 for you (by hand)."
          },
          {
            "kind": "ifPrompt",
            "question": "Metakinetic: use Knockback now as a free triggered action?",
            "yesLabel": "Knockback",
            "noLabel": "No",
            "target": "self",
            "then": [
              {
                "kind": "useAbility",
                "ability": "Knockback"
              }
            ],
            "else": []
          }
        ]
      }
    ]
  }
}
```

### Reorder

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

### Metakinetic Mastery: surge

Free Triggered Action | Psionic | Self | Self

With 4 or more discipline: the first time in a combat round that you take damage or are force moved, you gain 1 surge, even if you resist the effect. With 8 or more (4th level): 2 surges instead.

```json
{
  "name": "Metakinetic Mastery: surge",
  "actionLabel": "Free Triggered Action",
  "keywords": "Psionic",
  "range": "Self",
  "target": "Self",
  "trigger": "The first time in a round you take damage or are force moved, with 4+ Discipline.",
  "cost": "",
  "description": "With 4 or more discipline: the first time in a combat round that you take damage or are force moved, you gain 1 surge, even if you resist the effect. With 8 or more (4th level): 2 surges instead.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "trigger",
        "resolve": "popup",
        "condition": "First time this round you take damage (4+ Discipline).",
        "match": {
          "event": "damage",
          "filter": {
            "whose": "self",
            "resourceMin": 4
          }
        }
      },
      {
        "type": "trigger",
        "resolve": "popup",
        "condition": "First time this round you are force moved, even if you resist (4+ Discipline).",
        "match": {
          "event": "forcedMovement",
          "filter": {
            "whose": "self",
            "resourceMin": 4,
            "includeResisted": true
          }
        }
      },
      {
        "type": "branch",
        "condition": {
          "kind": "resource",
          "min": 8
        },
        "then": [
          {
            "type": "effect",
            "target": "self",
            "effects": [
              {
                "kind": "surgeGain",
                "amount": 2,
                "target": "self"
              }
            ]
          }
        ],
        "else": [
          {
            "type": "effect",
            "target": "self",
            "effects": [
              {
                "kind": "surgeGain",
                "amount": 1,
                "target": "self"
              }
            ]
          }
        ]
      }
    ],
    "usageLimit": {
      "scope": "round",
      "key": "metakinetic-surge"
    }
  }
}
```

### Reactive Tumble

Free Triggered Action |  | Self | Self

Whenever you are force moved, you can use a free triggered action to shift 1 square after the forced movement is resolved.

```json
{
  "name": "Reactive Tumble",
  "actionLabel": "Free Triggered Action",
  "keywords": "",
  "range": "Self",
  "target": "Self",
  "trigger": "You are force moved.",
  "cost": "",
  "description": "Whenever you are force moved, you can use a free triggered action to shift 1 square after the forced movement is resolved.",
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [
      {
        "type": "trigger",
        "resolve": "popup",
        "condition": "You are force moved.",
        "match": {
          "event": "forcedMovement",
          "filter": {
            "whose": "self",
            "minDistance": 1
          }
        }
      },
      {
        "type": "effect",
        "target": "self",
        "effects": [
          {
            "kind": "shift",
            "distance": 1,
            "target": "self"
          }
        ]
      }
    ]
  }
}
```

## Free strikes

### Melee Weapon Free Strike

Free Strike | Charge, Melee, Strike, Weapon | Melee 1 | One creature or object

Melee Weapon Free Strike: an unarmed strike or an improvised weapon. Power Roll + Might or Agility (Agility, her best).

```json
{
  "name": "Melee Weapon Free Strike",
  "actionLabel": "Free Strike",
  "keywords": "Charge, Melee, Strike, Weapon",
  "range": "Melee 1",
  "target": "One creature or object",
  "cost": "",
  "description": "Melee Weapon Free Strike: an unarmed strike or an improvised weapon. Power Roll + Might or Agility (Agility, her best).",
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": [
      "Charge",
      "Melee",
      "Strike",
      "Weapon"
    ],
    "cards": [
      {
        "type": "target",
        "name": "target",
        "mode": "token",
        "predicate": "creatureOrObject",
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
        "type": "powerRoll",
        "attribute": "Agility",
        "bonus": 0,
        "target": "target",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 2,
                "attribute": "Agility"
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 5,
                "attribute": "Agility"
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 7,
                "attribute": "Agility"
              }
            ]
          }
        }
      }
    ]
  }
}
```

### Ranged Weapon Free Strike

Free Strike | Ranged, Strike, Weapon | Ranged 5 | One creature or object

Ranged Weapon Free Strike: an unarmed strike or an improvised weapon. Power Roll + Might or Agility (Agility, her best).

```json
{
  "name": "Ranged Weapon Free Strike",
  "actionLabel": "Free Strike",
  "keywords": "Ranged, Strike, Weapon",
  "range": "Ranged 5",
  "target": "One creature or object",
  "cost": "",
  "description": "Ranged Weapon Free Strike: an unarmed strike or an improvised weapon. Power Roll + Might or Agility (Agility, her best).",
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": [
      "Ranged",
      "Strike",
      "Weapon"
    ],
    "cards": [
      {
        "type": "target",
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
          "value": 5
        }
      },
      {
        "type": "powerRoll",
        "attribute": "Agility",
        "bonus": 0,
        "target": "target",
        "rollFormula": "2d10",
        "tiers": {
          "tier1": {
            "effects": [
              {
                "kind": "damage",
                "amount": 2,
                "attribute": "Agility"
              }
            ]
          },
          "tier2": {
            "effects": [
              {
                "kind": "damage",
                "amount": 4,
                "attribute": "Agility"
              }
            ]
          },
          "tier3": {
            "effects": [
              {
                "kind": "damage",
                "amount": 6,
                "attribute": "Agility"
              }
            ]
          }
        }
      }
    ]
  }
}
```

## Features

### Metakinetic Mastery

Whenever you use your Inertial Shield ability, you can then use the Knockback maneuver as a free triggered action. With 2+ discipline: whenever you use Knockback, the forced movement distance gains a bonus equal to your Intuition score. 4+: the first time in a combat round that you take damage or are force moved, you gain 1 surge, even if you resist the effect. 6+: you gain an edge on the Grab and Knockback maneuvers. 8+ (4th level): the first time in a combat round that you take damage or are force moved, you gain 2 surges, even if you resist the effect. Benefits based on discipline last until the end of your turn, even if you spend below the amount during your turn. (Automated in Knockback, Grab and "Metakinetic Mastery: surge".)

```json
{
  "type": "feature",
  "title": "Metakinetic Mastery",
  "text": "Whenever you use your Inertial Shield ability, you can then use the Knockback maneuver as a free triggered action. With 2+ discipline: whenever you use Knockback, the forced movement distance gains a bonus equal to your Intuition score. 4+: the first time in a combat round that you take damage or are force moved, you gain 1 surge, even if you resist the effect. 6+: you gain an edge on the Grab and Knockback maneuvers. 8+ (4th level): the first time in a combat round that you take damage or are force moved, you gain 2 surges, even if you resist the effect. Benefits based on discipline last until the end of your turn, even if you spend below the amount during your turn. (Automated in Knockback, Grab and \"Metakinetic Mastery: surge\".)",
  "tags": [
    "Null",
    "Tradition"
  ]
}
```

### Null Speed

You gain a bonus to speed and to the number of squares you can shift when you take the Disengage move action equal to your Agility score (+3). Already in her Speed 8 and Disengage 5.

```json
{
  "type": "feature",
  "title": "Null Speed",
  "text": "You gain a bonus to speed and to the number of squares you can shift when you take the Disengage move action equal to your Agility score (+3). Already in her Speed 8 and Disengage 5.",
  "tags": [
    "Null"
  ]
}
```

### Density Augmentation

You gain a +6 bonus to Stamina, increasing by 6 at 4th, 7th and 10th levels (+12 now), and a +1 bonus to stability. Already in her Stamina 60 and Stability 1.

```json
{
  "type": "feature",
  "title": "Density Augmentation",
  "text": "You gain a +6 bonus to Stamina, increasing by 6 at 4th, 7th and 10th levels (+12 now), and a +1 bonus to stability. Already in her Stamina 60 and Stability 1.",
  "tags": [
    "Null",
    "Augmentation"
  ]
}
```

### Psionic Martial Arts

Whenever you use the Knockback or Grab maneuver, you use Intuition instead of Might for the power roll and for determining if you can target creatures larger than you. Additionally, whenever you use the Knockback maneuver, you can choose to slide the target instead of pushing them.

```json
{
  "type": "feature",
  "title": "Psionic Martial Arts",
  "text": "Whenever you use the Knockback or Grab maneuver, you use Intuition instead of Might for the power roll and for determining if you can target creatures larger than you. Additionally, whenever you use the Knockback maneuver, you can choose to slide the target instead of pushing them.",
  "tags": [
    "Null"
  ]
}
```

### Inertial Sink

You add your Intuition score to your effective size for the purpose of interacting with creatures and objects, such as for determining whether you can lift an object, whether you are affected by forced movement, and so forth (automated for forced movement; her sheet and token still show 1S). This has no effect on whether you can be grabbed. When you fall, you reduce the effective height of the fall by 5 squares in addition to any other reductions (automated). Whenever you take damage from being force moved, you reduce that damage by an amount equal to your level (automated).

```json
{
  "type": "feature",
  "title": "Inertial Sink",
  "text": "You add your Intuition score to your effective size for the purpose of interacting with creatures and objects, such as for determining whether you can lift an object, whether you are affected by forced movement, and so forth (automated for forced movement; her sheet and token still show 1S). This has no effect on whether you can be grabbed. When you fall, you reduce the effective height of the fall by 5 squares in addition to any other reductions (automated). Whenever you take damage from being force moved, you reduce that damage by an amount equal to your level (automated).",
  "tags": [
    "Null",
    "Tradition"
  ],
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [],
    "passives": [
      {
        "kind": "forcedMovementDamage",
        "reduce": "level",
        "label": "Inertial Sink"
      },
      {
        "kind": "fall",
        "reduce": 5,
        "label": "Inertial Sink"
      },
      {
        "kind": "size",
        "bonus": "Intuition",
        "label": "Inertial Sink"
      }
    ]
  }
}
```

### Psionic Leap

You can long jump and high jump a distance equal to twice your Agility score (6) without needing to make a test.

```json
{
  "type": "feature",
  "title": "Psionic Leap",
  "text": "You can long jump and high jump a distance equal to twice your Agility score (6) without needing to make a test.",
  "tags": [
    "Null"
  ]
}
```

### Enhanced Null Field

While using your Null Field ability, you disrupt magic and psionic power suffusing the area around you. During combat, any temporary supernatural terrain effects of your level or lower are removed when your aura partially or fully overlaps with their location. Permanent supernatural terrain effects of your level or lower are temporarily negated while your aura overlaps with their location, but return when the aura no longer overlaps with them.

```json
{
  "type": "feature",
  "title": "Enhanced Null Field",
  "text": "While using your Null Field ability, you disrupt magic and psionic power suffusing the area around you. During combat, any temporary supernatural terrain effects of your level or lower are removed when your aura partially or fully overlaps with their location. Permanent supernatural terrain effects of your level or lower are temporarily negated while your aura overlaps with their location, but return when the aura no longer overlaps with them.",
  "tags": [
    "Null"
  ]
}
```

### Regenerative Field

The first time each combat round that an enemy in the area of your Null Field ability uses a main action, you gain 2 discipline instead of 1. (In her Discipline automation.)

```json
{
  "type": "feature",
  "title": "Regenerative Field",
  "text": "The first time each combat round that an enemy in the area of your Null Field ability uses a main action, you gain 2 discipline instead of 1. (In her Discipline automation.)",
  "tags": [
    "Null"
  ]
}
```

### Small!

Polder: your size is 1S.

```json
{
  "type": "feature",
  "title": "Small!",
  "text": "Polder: your size is 1S.",
  "tags": [
    "Polder"
  ]
}
```

### Nimblestep

Polder: you ignore the effects of difficult terrain and can move at full speed while sneaking.

```json
{
  "type": "feature",
  "title": "Nimblestep",
  "text": "Polder: you ignore the effects of difficult terrain and can move at full speed while sneaking.",
  "tags": [
    "Polder"
  ],
  "automation": {
    "schema": "ability-automation/v3",
    "cards": [],
    "passives": [
      {
        "kind": "movement",
        "ignoreDifficultTerrain": true,
        "label": "Nimblestep"
      }
    ]
  }
}
```

### Graceful Retreat

Polder: you gain a +1 bonus to the distance you can shift when you take the Disengage move action. Already in her Disengage 5.

```json
{
  "type": "feature",
  "title": "Graceful Retreat",
  "text": "Polder: you gain a +1 bonus to the distance you can shift when you take the Disengage move action. Already in her Disengage 5.",
  "tags": [
    "Polder"
  ]
}
```

### Danger Sense

Perk: whenever you are in a natural environment (but not in a settlement in that environment), you gain an edge on tests made using the Alertness skill, and you can't be surprised. Additionally, you have a connection to nature that warns you if any natural disaster is imminent within the next 72 hours, though you don't know exactly what it will entail (an earthquake, a wildfire, and so forth).

```json
{
  "type": "feature",
  "title": "Danger Sense",
  "text": "Perk: whenever you are in a natural environment (but not in a settlement in that environment), you gain an edge on tests made using the Alertness skill, and you can't be surprised. Additionally, you have a connection to nature that warns you if any natural disaster is imminent within the next 72 hours, though you don't know exactly what it will entail (an earthquake, a wildfire, and so forth).",
  "tags": [
    "Perk"
  ]
}
```

### Team Leader

Perk: at the start of a group test or montage test, you can spend a hero token. If you do, all participants make tests as if they also had any skill you have from the exploration group.

```json
{
  "type": "feature",
  "title": "Team Leader",
  "text": "Perk: at the start of a group test or montage test, you can spend a hero token. If you do, all participants make tests as if they also had any skill you have from the exploration group.",
  "tags": [
    "Perk"
  ]
}
```

### Specialist

Perk: choose one skill you have from the lore skill group. You always have a double edge on tests made to recall lore using this skill. Your specialist knowledge grants you notoriety in fields related to the chosen skill: you treat your Renown as 1 higher when negotiating with an NPC who knows your reputation, or 2 higher if they have the same skill you chose.

```json
{
  "type": "feature",
  "title": "Specialist",
  "text": "Perk: choose one skill you have from the lore skill group. You always have a double edge on tests made to recall lore using this skill. Your specialist knowledge grants you notoriety in fields related to the chosen skill: you treat your Renown as 1 higher when negotiating with an NPC who knows your reputation, or 2 higher if they have the same skill you chose.",
  "tags": [
    "Perk"
  ]
}
```

