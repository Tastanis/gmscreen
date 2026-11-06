# Pippa - VTT Automations

Level 4 Polder **Null**, Metakinetic tradition, Density Augmentation (November 5, 2026). Characteristics at 4th level: Might 1, Agility 3, Reason -1, Intuition 3, Presence 1.

How to add: on her sheet **✎ Edit → ⇪ Import JSON**, one block at a time (it lands in the right list by its label). The Discipline block goes in **✎ Resource** (its automation field). The Inertial Sink block is a feature (Import JSON takes it too).

Sheet numbers (no automation needed): Speed +3 and Disengage +3 (Null Speed), Disengage +1 more (Graceful Retreat), Stamina +12 and Stability +1 (Density Augmentation), Nimblestep: ignores difficult terrain (a movement passive on the feature, `{ "kind": "movement", "ignoreDifficultTerrain": true }`).

Manual (Director text): Enhanced Null Field's supernatural terrain, Psionic Leap, Shadowmeld, Small!, Danger Sense, Specialist, Inertial Sink's effective size (falls and slam damage are automated).

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
    ]
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
            "text": "Spend 1 Discipline: the potency of one effect that came with the damage is reduced by 1 for you (by hand). Metakinetic: you can use Knockback now as a free triggered action."
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

## Features

### Inertial Sink

You add your Intuition score to your effective size for interacting with creatures and objects (lifting, being affected by forced movement). When you fall, reduce the effective height by 5 more squares. Whenever you take damage from being force moved, you reduce that damage by an amount equal to your level.

```json
{
  "title": "Inertial Sink",
  "text": "You add your Intuition score to your effective size for interacting with creatures and objects (lifting, being affected by forced movement). When you fall, reduce the effective height by 5 more squares. Whenever you take damage from being force moved, you reduce that damage by an amount equal to your level.",
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
      }
    ]
  },
  "type": "feature"
}
```

