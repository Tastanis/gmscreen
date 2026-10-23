Cal Ability Automations - Copy/Paste Blocks

Copy exactly one JSON block at a time and paste it into the ability automation popup for the matching live sheet card.
Each block's "fields" are Cal's cards as saved on October 7, 2026, so a block pasted onto a new, empty card fills in the whole card (name, action, keywords, distance, target, cost, text and the power roll's three tiers), and pasted onto the old card changes nothing that was right.

========================================================================
01. Thorn In Foot
Section: mains
Live action id: action_1779503651502_1d50c961da0fc
Rules source: Your Allies Cannot Save You!
{
    "fields": {
        "name": "Thorn In Foot",
        "actionLabel": "Main Action",
        "keywords": "Magic, Ranged, Strike",
        "range": "Ranged 10",
        "target": "One creature",
        "cost": "None",
        "description": "Each time the target willingly moves before the end of your next turn, they take 1 psychic damage for each square they move.",
        "testLabel": "Power Roll + Presence",
        "tier1Damage": "5 + P",
        "tier1DamageType": "psychic",
        "tier2Damage": "7 + P",
        "tier2DamageType": "psychic",
        "tier3Damage": "10 + P",
        "tier3DamageType": "psychic"
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "target",
                                         "id":  "target-thorn-primary",
                                         "name":  "primary",
                                         "mode":  "token",
                                         "predicate":  "creature",
                                         "count":  1,
                                         "distance":  {
                                                          "form":  "ranged",
                                                          "value":  10
                                                      }
                                     },
                                     {
                                         "type":  "powerRoll",
                                         "id":  "roll-thorn",
                                         "attribute":  "P",
                                         "target":  "primary",
                                         "tiers":  {
                                                       "tier1":  {
                                                                     "effects":  [
                                                                                     {
                                                                                         "kind":  "damage",
                                                                                         "amount":  5,
                                                                                         "attribute":  "P",
                                                                                         "damageType":  "psychic"
                                                                                     }
                                                                                 ]
                                                                 },
                                                       "tier2":  {
                                                                     "effects":  [
                                                                                     {
                                                                                         "kind":  "damage",
                                                                                         "amount":  7,
                                                                                         "attribute":  "P",
                                                                                         "damageType":  "psychic"
                                                                                     }
                                                                                 ]
                                                                 },
                                                       "tier3":  {
                                                                     "effects":  [
                                                                                     {
                                                                                         "kind":  "damage",
                                                                                         "amount":  10,
                                                                                         "attribute":  "P",
                                                                                         "damageType":  "psychic"
                                                                                     }
                                                                                 ]
                                                                 }
                                                   }
                                     },
                                     {
                                         "type":  "trigger",
                                         "id":  "trigger-thorn-move",
                                         "target":  "primary",
                                         "condition":  "Before the end of your next turn, the target willingly moves.",
                                         "autoResolve":  true,
                                         "effectTarget":  "eventActor",
                                         "match":  {
                                                       "event":  "move",
                                                       "filter":  {
                                                                      "whose":  "target",
                                                                      "targetGroup":  "primary",
                                                                      "minDistance":  1
                                                                  }
                                                   },
                                         "effects":  [
                                                         {
                                                             "kind":  "damage",
                                                             "amountFrom":  {
                                                                                "source":  "triggeringForcedMovement"
                                                                            },
                                                             "damageType":  "psychic"
                                                         }
                                                     ],
                                         "expires":  {
                                                         "event":  "turnEnd",
                                                         "whose":  "self",
                                                         "count":  1,
                                                         "skipCurrent":  true
                                                     },
                                         "note":  "Lands by itself: 1 psychic for each square of the target's own move (a walk, a shift, a climb, a fly). A push, pull or slide does not count, and a teleport does not count."
                                     }
                                 ]
                   }
}

========================================================================
02. Protective Attack
Section: mains
Live action id: action_1779503891513_bf1a1797a9b1b8
{
    "fields": {
        "name": "Protective Attack",
        "actionLabel": "Main Action",
        "keywords": "Melee, Strike, Weapon",
        "range": "Melee 1",
        "target": "One creature",
        "cost": "None",
        "description": "The target is taunted until the end of their next turn.",
        "testLabel": "Power Roll + Might or Agility",
        "tier1Damage": "5 + M or A",
        "tier1Notes": "taunted until end of next turn",
        "tier2Damage": "8 + M or A",
        "tier2Notes": "taunted until end of next turn",
        "tier3Damage": "11 + M or A",
        "tier3Notes": "taunted until end of next turn"
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "target",
                                         "id":  "target-protective-primary",
                                         "name":  "primary",
                                         "mode":  "token",
                                         "predicate":  "creature",
                                         "count":  1,
                                         "distance":  {
                                                          "form":  "melee",
                                                          "value":  1
                                                      }
                                     },
                                     {
                                         "type":  "powerRoll",
                                         "id":  "roll-protective",
                                         "attribute":  [
                                                           "Might",
                                                           "Agility"
                                                       ],
                                         "target":  "primary",
                                         "tiers":  {
                                                       "tier1":  {
                                                                     "effects":  [
                                                                                     {
                                                                                         "kind":  "damage",
                                                                                         "amount":  5,
                                                                                         "attribute":  "M",
                                                                                         "damageType":  "untyped"
                                                                                     },
                                                                                     {
                                                                                         "kind":  "condition",
                                                                                         "name":  "taunted",
                                                                                         "duration":  "endOfTurn"
                                                                                     }
                                                                                 ]
                                                                 },
                                                       "tier2":  {
                                                                     "effects":  [
                                                                                     {
                                                                                         "kind":  "damage",
                                                                                         "amount":  8,
                                                                                         "attribute":  "M",
                                                                                         "damageType":  "untyped"
                                                                                     },
                                                                                     {
                                                                                         "kind":  "condition",
                                                                                         "name":  "taunted",
                                                                                         "duration":  "endOfTurn"
                                                                                     }
                                                                                 ]
                                                                 },
                                                       "tier3":  {
                                                                     "effects":  [
                                                                                     {
                                                                                         "kind":  "damage",
                                                                                         "amount":  11,
                                                                                         "attribute":  "M",
                                                                                         "damageType":  "untyped"
                                                                                     },
                                                                                     {
                                                                                         "kind":  "condition",
                                                                                         "name":  "taunted",
                                                                                         "duration":  "endOfTurn"
                                                                                     }
                                                                                 ]
                                                                 }
                                                   },
                                         "note":  "Cal\u0027s Might is higher than Agility, so the damage attribute is M while the roll still offers Might or Agility."
                                     }
                                 ]
                   }
}

========================================================================
03. Morelia Punish and Defend
Section: mains
Live action id: action_1779504025064_ccd0f5e53d3ac
Rules source: The Gods Punish and Defend
{
    "fields": {
        "name": "Morelia Punish and Defend",
        "actionLabel": "Main Action",
        "keywords": "Magic, Melee, Strike, Weapon",
        "range": "Melee 1",
        "target": "One creature or object",
        "cost": "3 Wrath",
        "description": "You channel holy energy to smite a foe and heal an ally. Effect: You can spend a Recovery to allow yourself or one ally within 10 squares to regain Stamina equal to your recovery value.",
        "testLabel": "Power Roll + Might",
        "tier1Damage": "5 + M",
        "tier1DamageType": "holy",
        "tier2Damage": "8 + M",
        "tier2DamageType": "holy",
        "tier3Damage": "11 + M",
        "tier3DamageType": "holy"
    },
    "automation": {
        "schema": "ability-automation/v3",
        "cards": [
            {
                "type": "target",
                "id": "target-punish-primary",
                "name": "primary",
                "mode": "token",
                "predicate": "creatureOrObject",
                "count": 1,
                "distance": { "form": "melee", "value": 1 }
            },
            {
                "type": "powerRoll",
                "id": "roll-punish",
                "attribute": "M",
                "target": "primary",
                "tiers": {
                    "tier1": { "effects": [ { "kind": "damage", "amount": 5, "attribute": "M", "damageType": "holy" } ] },
                    "tier2": { "effects": [ { "kind": "damage", "amount": 8, "attribute": "M", "damageType": "holy" } ] },
                    "tier3": { "effects": [ { "kind": "damage", "amount": 11, "attribute": "M", "damageType": "holy" } ] }
                }
            },
            {
                "type": "target",
                "id": "target-punish-heal",
                "name": "healTarget",
                "mode": "token",
                "predicate": "selfOrAlly",
                "count": 1,
                "optional": true,
                "distance": { "form": "ranged", "value": 10 },
                "promptText": "Choose yourself or one ally within 10 squares to heal with Cal's Recovery."
            },
            {
                "type": "effect",
                "id": "effect-punish-recovery",
                "target": "healTarget",
                "effects": [
                    {
                        "kind": "ifPrompt",
                        "target": "healTarget",
                        "question": "Spend one of Cal's Recoveries to heal the selected target?",
                        "yesLabel": "Spend recovery",
                        "noLabel": "Skip heal",
                        "then": [
                            { "kind": "heal", "target": "healTarget", "recoveries": 1, "recoverySource": "self" },
                            {
                                "kind": "ifPrompt",
                                "target": "healTarget",
                                "question": "Is the healed target an ally other than Cal?",
                                "yesLabel": "Add Presence",
                                "noLabel": "No extra heal",
                                "then": [ { "kind": "heal", "target": "healTarget", "amount": 3 } ]
                            }
                        ]
                    }
                ]
            }
        ]
    }
}

========================================================================
04. Purifying Fire
Section: mains
Live action id: action_1779504169845_50d8080f3a0c4
{
    "fields": {
        "name": "Purifying Fire",
        "actionLabel": "Main Action",
        "keywords": "Magic, Melee, Ranged, Strike, Weapon",
        "range": "Melee 1 or Ranged 5",
        "target": "One creature",
        "cost": "5 Wrath",
        "description": "Effect: While the target has fire weakness from this ability, you can choose to have your abilities deal fire damage to the target instead of holy damage.",
        "testLabel": "Power Roll + Might",
        "tier1Damage": "7 + M",
        "tier1DamageType": "holy",
        "tier1Notes": "M < weak: fire weakness 3 (save ends)",
        "tier2Damage": "11 + M",
        "tier2DamageType": "holy",
        "tier2Notes": "M < average: fire weakness 5 (save ends)",
        "tier3Damage": "14 + M",
        "tier3DamageType": "holy",
        "tier3Notes": "M < strong: fire weakness 7 (save ends)"
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "target",
                                         "id":  "target-purifying-primary",
                                         "name":  "primary",
                                         "mode":  "token",
                                         "predicate":  "creature",
                                         "count":  1,
                                         "distance":  {
                                                          "form":  "meleeOrRanged",
                                                          "value":  5
                                                      }
                                     },
                                     {
                                         "type":  "powerRoll",
                                         "id":  "roll-purifying",
                                         "attribute":  "M",
                                         "target":  "primary",
                                         "tiers":  {
                                                       "tier1":  {
                                                                     "effects":  [
                                                                                     {
                                                                                         "kind":  "damage",
                                                                                         "amount":  7,
                                                                                         "attribute":  "M",
                                                                                         "damageType":  "holy"
                                                                                     },
                                                                                     {
                                                                                         "kind":  "potency",
                                                                                         "attribute":  "M",
                                                                                         "level":  "weak",
                                                                                         "onFail":  [
                                                                                                        {
                                                                                                            "kind":  "condition",
                                                                                                            "name":  "damageWeakness",
                                                                                                            "amount":  3,
                                                                                                            "damageType":  "fire",
                                                                                                            "duration":  "saveEnds"
                                                                                                        }
                                                                                                    ]
                                                                                     }
                                                                                 ]
                                                                 },
                                                       "tier2":  {
                                                                     "effects":  [
                                                                                     {
                                                                                         "kind":  "damage",
                                                                                         "amount":  11,
                                                                                         "attribute":  "M",
                                                                                         "damageType":  "holy"
                                                                                     },
                                                                                     {
                                                                                         "kind":  "potency",
                                                                                         "attribute":  "M",
                                                                                         "level":  "average",
                                                                                         "onFail":  [
                                                                                                        {
                                                                                                            "kind":  "condition",
                                                                                                            "name":  "damageWeakness",
                                                                                                            "amount":  5,
                                                                                                            "damageType":  "fire",
                                                                                                            "duration":  "saveEnds"
                                                                                                        }
                                                                                                    ]
                                                                                     }
                                                                                 ]
                                                                 },
                                                       "tier3":  {
                                                                     "effects":  [
                                                                                     {
                                                                                         "kind":  "damage",
                                                                                         "amount":  14,
                                                                                         "attribute":  "M",
                                                                                         "damageType":  "holy"
                                                                                     },
                                                                                     {
                                                                                         "kind":  "potency",
                                                                                         "attribute":  "M",
                                                                                         "level":  "strong",
                                                                                         "onFail":  [
                                                                                                        {
                                                                                                            "kind":  "condition",
                                                                                                            "name":  "damageWeakness",
                                                                                                            "amount":  7,
                                                                                                            "damageType":  "fire",
                                                                                                            "duration":  "saveEnds"
                                                                                                        }
                                                                                                    ]
                                                                                     }
                                                                                 ]
                                                                 }
                                                   }
                                     },
                                     {
                                         "type":  "effect",
                                         "id":  "effect-purifying-note",
                                         "target":  "primary",
                                         "effects":  [
                                                         {
                                                             "kind":  "note",
                                                             "text":  "While this fire weakness remains, Cal can choose for his abilities to deal fire damage to this target instead of holy damage."
                                                         }
                                                     ]
                                     }
                                 ]
                   }
}

========================================================================
05. Judgment
Section: maneuvers
Live action id: action_1779504368699_863547a261abf
{
    "fields": {
        "name": "Judgment",
        "actionLabel": "Maneuver",
        "keywords": "Magic, Ranged",
        "range": "Ranged 10",
        "target": "One enemy",
        "description": "Effect: The target is judged by you until the end of the encounter, you use this ability again, you willingly end this effect (no action required), or another censor judges the target.<br>&nbsp;<br>Judgment Order Benefit - Paragon: The first time on a turn that you use your Judgment ability to judge a creature, you can vertical pull the judged creature up to a number of squares equal to twice your Presence score."
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "target",
                                         "id":  "target-judgment-primary",
                                         "name":  "primary",
                                         "mode":  "token",
                                         "predicate":  "enemy",
                                         "count":  1,
                                         "distance":  {
                                                          "form":  "ranged",
                                                          "value":  10
                                                      }
                                     },
                                     {
                                         "type":  "effect",
                                         "id":  "effect-judgment-mark",
                                         "target":  "primary",
                                         "effects":  [
                                                         {
                                                             "kind":  "applyMark",
                                                             "markType":  "judgment",
                                                             "duration":  "endOfEncounter",
                                                             "exclusivePerSource":  true,
                                                             "exclusivePerTarget":  true
                                                         },
                                                         {
                                                             "kind":  "ifPrompt",
                                                             "question":  "Is this the first time this turn Cal used Judgment?",
                                                             "yesLabel":  "Use Paragon pull",
                                                             "noLabel":  "Skip pull",
                                                             "then":  [
                                                                          {
                                                                              "kind":  "forcedMovement",
                                                                              "verb":  "verticalPull",
                                                                              "distance":  0,
                                                                              "attribute":  "P",
                                                                              "multiplier":  2,
                                                                              "upTo":  true
                                                                          }
                                                                      ]
                                                         },
                                                         {
                                                             "kind":  "ifPrompt",
                                                             "question":  "Spend 1 Wrath for Look On My Work and Despair? Choose no if the target is already frightened of Cal.",
                                                             "yesLabel":  "Spend Wrath",
                                                             "noLabel":  "Skip",
                                                             "then":  [
                                                                          {
                                                                              "kind":  "spend",
                                                                              "resource":  "Wrath",
                                                                              "amount":  1,
                                                                              "prompt":  "Spend 1 Wrath to frighten this Judgment target on P \u003c average.",
                                                                              "effects":  [
                                                                                              {
                                                                                                  "kind":  "potency",
                                                                                                  "attribute":  "P",
                                                                                                  "level":  "average",
                                                                                                  "onFail":  [
                                                                                                                 {
                                                                                                                     "kind":  "condition",
                                                                                                                     "name":  "frightened",
                                                                                                                     "duration":  "saveEnds"
                                                                                                                 }
                                                                                                             ]
                                                                                              }
                                                                                          ]
                                                                          }
                                                                      ]
                                                         },
                                                         {
                                                             "kind":  "note",
                                                             "text":  "If the Look On My Work target is already frightened of Cal, do not apply frightened again; deal 6 holy damage instead."
                                                         }
                                                     ]
                                     }
                                 ]
                   }
}

========================================================================
06. Blessing of the Faithful
Section: maneuvers
Live action id: action_1779504433990_6195cd85bddf28
{
    "fields": {
        "name": "Blessing of the Faithful",
        "actionLabel": "Maneuver",
        "keywords": "Area, Magic",
        "range": "Aura 3",
        "target": "Self and each ally in the area",
        "cost": "5 Wrath",
        "description": "<span>Until the end of the encounter or until you are dying, each target in the aura gains 1 surge at the end of each of your turns</span>"
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "effect",
                                         "id":  "effect-blessing-aura",
                                         "target":  "self",
                                         "effects":  [
                                                         {
                                                             "kind":  "aura",
                                                             "radius":  3,
                                                             "color":  "#facc15",
                                                             "affects":  "selfAndAlly",
                                                             "triggers":  [
                                                                              {
                                                                                  "event":  "turnEnd",
                                                                                  "whose":  "self"
                                                                              }
                                                                          ],
                                                             "effects":  [
                                                                             {
                                                                                 "kind":  "surgeGain",
                                                                                 "amount":  1
                                                                             }
                                                                         ],
                                                             "expires":  {
                                                                             "event":  "combatEnd",
                                                                             "whose":  "any"
                                                                         },
                                                             "text":  "Self and allies in Cal\u0027s 3 aura gain 1 surge at the end of each of Cal\u0027s turns."
                                                         }
                                                     ]
                                     }
                                 ]
                   }
}

========================================================================
07. Edict of Purifying Pacifism
Section: maneuvers
Live action id: action_1779504555719_67ae7d677ba59
{
    "fields": {
        "name": "Edict of Purifying Pacifism",
        "actionLabel": "Maneuver",
        "keywords": "Area Magic",
        "range": "Aura 2",
        "target": "Each enemy in the area",
        "cost": "7 Wrath",
        "description": "<span>Until the end of the encounter or until you are dying, whenever a target makes a strike, they take holy damage equal to 6. A target judged by you takes an extra 2d6 holy damage.</span>"
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "effect",
                                         "id":  "effect-pacifism-aura",
                                         "target":  "self",
                                         "effects":  [
                                                         {
                                                             "kind":  "aura",
                                                             "radius":  2,
                                                             "color":  "#fb923c",
                                                             "affects":  "enemy",
                                                             "triggers":  [
                                                                              {
                                                                                  "event":  "actionUsed",
                                                                                  "whose":  "occupant",
                                                                                  "target":  "eventActor",
                                                                                  "filter":  {
                                                                                                 "keywordsAny":  [
                                                                                                                     "Strike"
                                                                                                                 ]
                                                                                             }
                                                                              }
                                                                          ],
                                                             "effects":  [
                                                                             {
                                                                                 "kind":  "damage",
                                                                                 "amount":  0,
                                                                                 "attribute":  "P",
                                                                                 "multiplier":  2,
                                                                                 "damageType":  "holy"
                                                                             },
                                                                             {
                                                                                 "kind":  "ifMark",
                                                                                 "predicate":  "targetJudgedBySelf",
                                                                                 "target":  "target",
                                                                                 "then":  [
                                                                                              {
                                                                                                  "kind":  "damage",
                                                                                                  "amountDice":  "2d6",
                                                                                                  "damageType":  "holy"
                                                                                              }
                                                                                          ]
                                                                             }
                                                                         ],
                                                             "expires":  {
                                                                             "event":  "combatEnd",
                                                                             "whose":  "any"
                                                                         },
                                                             "text":  "Enemies in Cal\u0027s 2 aura take 6 holy when they make a Strike; judged targets take an extra 2d6 holy."
                                                         }
                                                     ]
                                     }
                                 ]
                   }
}

========================================================================
08. Triggered Action (My Life for Yours)
Section: triggers
Live action id: action_1779504610833_235d3bc58cbe48
{
    "fields": {
        "name": "My Life for Yours",
        "actionLabel": "Triggered Action",
        "keywords": "Magic, Ranged",
        "range": "Ranged 10",
        "target": "Self or one ally",
        "trigger": "The target starts their turn or takes damage",
        "cost": "None",
        "description": "<div><p>You spend a Recovery and the target regains Stamina equal to 34.</p><p><br></p><p>Spend 1 Wrath--You can end one effect on the target that is ended by a saving throw or that ends at the end of their turn, or a prone target can stand up.</p></div>"
    },
    "automation": {
        "schema": "ability-automation/v3",
        "cards": [
            {
                "type": "trigger",
                "id": "trigger-my-life-self-turn",
                "condition": "Cal starts his turn.",
                "match": { "event": "turnStart", "filter": { "whose": "self" } }
            },
            {
                "type": "trigger",
                "id": "trigger-my-life-ally-turn",
                "condition": "An ally starts their turn.",
                "match": { "event": "turnStart", "filter": { "whose": "ally" } }
            },
            {
                "type": "trigger",
                "id": "trigger-my-life-self-damage",
                "condition": "Cal takes damage.",
                "match": { "event": "damage", "filter": { "whose": "self", "minAmount": 1 } }
            },
            {
                "type": "trigger",
                "id": "trigger-my-life-ally-damage",
                "condition": "An ally takes damage.",
                "match": { "event": "damage", "filter": { "whose": "ally", "minAmount": 1 } }
            },
            {
                "type": "target",
                "id": "target-my-life-recipient",
                "name": "recipient",
                "mode": "token",
                "predicate": "selfOrAlly",
                "count": 1,
                "distance": { "form": "ranged", "value": 10 },
                "promptText": "Choose yourself or the ally who started their turn or took the triggering damage."
            },
            {
                "type": "effect",
                "id": "effect-my-life-heal",
                "target": "recipient",
                "effects": [
                    { "kind": "heal", "target": "recipient", "recoveries": 1, "recoverySource": "self" },
                    {
                        "kind": "ifPrompt",
                        "target": "recipient",
                        "question": "Is the target an ally other than Cal (Blessing of Life)?",
                        "yesLabel": "Add Presence",
                        "noLabel": "No extra heal",
                        "then": [ { "kind": "heal", "target": "recipient", "amount": 3 } ]
                    },
                    {
                        "kind": "ifPrompt",
                        "target": "recipient",
                        "question": "Spend 1 Wrath to end a save/end-of-turn effect on the target, or stand a prone target up?",
                        "yesLabel": "Spend Wrath",
                        "noLabel": "Skip",
                        "then": [
                            {
                                "kind": "spend",
                                "resource": "Wrath",
                                "amount": 1,
                                "prompt": "Spend 1 Wrath for the My Life for Yours rider.",
                                "effects": [
                                    { "kind": "note", "text": "End one save-ends/end-of-turn effect on the target, or stand a prone target up. Apply the removal manually." }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    }
}

========================================================================
09. Triggered Action (Resist the Unnatural)
Section: triggers
Live action id: action_1779504726512_71f4fd668ac0c8
{
    "fields": {
        "name": "Resist the Unnatural",
        "actionLabel": "Triggered Action",
        "useWhen": "When you take damage that isn't untyped",
        "range": "Self",
        "target": "Self",
        "trigger": "You take damage that isn’t untyped.",
        "description": "Your instinctive resilience protects you from injuries beyond the routine.<div><br></div><div>Trigger: Whenever you take damage that isn’t untyped.</div><div>Effect: You can use a triggered action to take half the damage.</div>"
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "trigger",
                                         "id":  "trigger-resist-damage",
                                         "condition":  "Cal takes typed damage that is not untyped.",
                                         "match":  {
                                                       "event":  "damage",
                                                       "filter":  {
                                                                      "whose":  "self",
                                                                      "minAmount":  1
                                                                  }
                                                   },
                                         "effects":  [
                                                         {
                                                             "kind":  "ifPrompt",
                                                             "question":  "Is the triggering damage typed damage, not untyped?",
                                                             "yesLabel":  "Halve it",
                                                             "noLabel":  "Do nothing",
                                                             "then":  [
                                                                          {
                                                                              "kind":  "halveTriggeringDamage",
                                                                              "rounding":  "up"
                                                                          }
                                                                      ]
                                                         }
                                                     ],
                                         "note":  "Ability triggers cannot filter out untyped damage yet, so this asks before refunding the half damage."
                                     }
                                 ]
                   }
}

========================================================================
10. Free Triggered Action (Judgment main action rebuke)
Section: triggers
Live action id: action_1780273102615_aa1a74f2473bb
{
    "fields": {
        "name": "Judgment - Main Action Rebuke",
        "actionLabel": "Free Triggered Action",
        "keywords": "Magic, FreeTriggered",
        "trigger": "A creature judged by you uses a main action and is within your line of effect.",
        "description": "Whenever a creature judged by you uses a main action and is within your line of effect, you can use a free triggered action to deal holy damage equal to twice your Presence score to them."
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "trigger",
                                         "id":  "trigger-judgment-main-action",
                                         "condition":  "A creature judged by Cal uses a main action and is within line of effect.",
                                         "match":  {
                                                       "event":  "actionUsed",
                                                       "filter":  {
                                                                      "whose":  "judgedTarget",
                                                                      "actionKind":  "main",
                                                                      "lineOfEffectTo":  "self"
                                                                  }
                                                   },
                                         "effects":  [
                                                         {
                                                             "kind":  "ifPrompt",
                                                             "question":  "Is the judged creature within Cal\u0027s line of effect?",
                                                             "yesLabel":  "Deal 6 holy",
                                                             "noLabel":  "Skip",
                                                             "then":  [
                                                                          {
                                                                              "kind":  "damage",
                                                                              "target":  "eventActor",
                                                                              "amount":  0,
                                                                              "attribute":  "P",
                                                                              "multiplier":  2,
                                                                              "damageType":  "holy"
                                                                          }
                                                                      ]
                                                         }
                                                     ],
                                         "note":  "The VTT stores lineOfEffectTo but does not evaluate it yet."
                                     }
                                 ]
                   }
}

========================================================================
11. Free Triggered Action (Judgment new target)
Section: triggers
Live action id: action_1780273114468_6607d1542407
{
    "fields": {
        "name": "Judgment - New Target",
        "actionLabel": "Free Triggered Action",
        "keywords": "Magic, Ranged, FreeTriggered",
        "range": "Ranged 10",
        "target": "One enemy",
        "trigger": "A creature judged by you is reduced to 0 Stamina.",
        "description": "When a creature judged by you is reduced to 0 Stamina, you can use a free triggered action to use Judgment against a new target."
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "trigger",
                                         "id":  "trigger-judgment-zero",
                                         "condition":  "A creature judged by Cal is reduced to 0 Stamina.",
                                         "match":  {
                                                       "event":  "staminaZero",
                                                       "filter":  {
                                                                      "whose":  "judgedTarget",
                                                                      "direction":  "down"
                                                                  }
                                                   }
                                     },
                                     {
                                         "type":  "target",
                                         "id":  "target-judgment-new",
                                         "name":  "newJudgmentTarget",
                                         "mode":  "token",
                                         "predicate":  "enemy",
                                         "count":  1,
                                         "distance":  {
                                                          "form":  "ranged",
                                                          "value":  10
                                                      },
                                         "promptText":  "Choose the new Judgment target."
                                     },
                                     {
                                         "type":  "effect",
                                         "id":  "effect-judgment-new",
                                         "target":  "newJudgmentTarget",
                                         "effects":  [
                                                         {
                                                             "kind":  "applyMark",
                                                             "markType":  "judgment",
                                                             "duration":  "endOfEncounter",
                                                             "exclusivePerSource":  true,
                                                             "exclusivePerTarget":  true
                                                         },
                                                         {
                                                             "kind":  "ifPrompt",
                                                             "question":  "Spend 1 Wrath for Look On My Work and Despair on the new target? Choose no if already frightened of Cal.",
                                                             "yesLabel":  "Spend Wrath",
                                                             "noLabel":  "Skip",
                                                             "then":  [
                                                                          {
                                                                              "kind":  "spend",
                                                                              "resource":  "Wrath",
                                                                              "amount":  1,
                                                                              "prompt":  "Spend 1 Wrath to frighten the new Judgment target on P \u003c strong.",
                                                                              "effects":  [
                                                                                              {
                                                                                                  "kind":  "potency",
                                                                                                  "attribute":  "P",
                                                                                                  "level":  "strong",
                                                                                                  "onFail":  [
                                                                                                                 {
                                                                                                                     "kind":  "condition",
                                                                                                                     "name":  "frightened",
                                                                                                                     "duration":  "saveEnds"
                                                                                                                 }
                                                                                                             ]
                                                                                              }
                                                                                          ]
                                                                          }
                                                                      ]
                                                         },
                                                         {
                                                             "kind":  "note",
                                                             "text":  "If the new target is already frightened of Cal, do not apply frightened again; deal 6 holy damage instead."
                                                         }
                                                     ]
                                     }
                                 ]
                   }
}

========================================================================
12. Free Triggered Action (Judgment: stop shift)
Section: triggers
Live action id: action_1780274930123_b34653314140c
{
    "fields": {
        "name": "Judgment - Wrath: Stop Shift",
        "actionLabel": "Free Triggered Action",
        "keywords": "FreeTriggered",
        "trigger": "An adjacent creature judged by you starts to shift.",
        "cost": "1 Wrath",
        "description": "When an adjacent creature judged by you starts to shift, you make a melee free strike against them and their speed becomes 0 until the end of the current turn, preventing them from shifting."
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "trigger",
                                         "id":  "trigger-judgment-stop-shift",
                                         "condition":  "An adjacent creature judged by Cal starts to shift.",
                                         "match":  {
                                                       "event":  "move",
                                                       "filter":  {
                                                                      "whose":  "judgedTarget",
                                                                      "leavesAdjacency":  true,
                                                                      "minDistance":  1
                                                                  }
                                                   },
                                         "effects":  [
                                                         {
                                                             "kind":  "freeStrike",
                                                             "target":  "self",
                                                             "against":  "enemy",
                                                             "asPowerRoll":  true,
                                                             "text":  "Choose the judged creature who started to shift."
                                                         },
                                                         {
                                                             "kind":  "condition",
                                                             "target":  "eventActor",
                                                             "name":  "other",
                                                             "duration":  "endOfTurn",
                                                             "text":  "speed is 0 until the end of the current turn"
                                                         }
                                                     ],
                                         "note":  "Movement triggers fire after the VTT observes movement, so the speed-0 prevention may still need table enforcement."
                                     }
                                 ]
                   }
}

========================================================================
13. Free Triggered Action (Judgment: bane power roll)
Section: triggers
Live action id: action_1780274938055_d303cfb0781e78
{
    "fields": {
        "name": "Judgment - Wrath: Bane Power Roll",
        "actionLabel": "Free Triggered Action",
        "keywords": "FreeTriggered",
        "trigger": "A creature judged by you within 10 squares makes a power roll.",
        "cost": "1 Wrath",
        "description": "When a creature judged by you within 10 squares makes a power roll, you cause them to take a bane on the roll."
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "trigger",
                                         "id":  "trigger-judgment-bane-roll",
                                         "condition":  "A creature judged by Cal within 10 squares makes a power roll.",
                                         "match":  {
                                                       "event":  "powerRoll",
                                                       "filter":  {
                                                                      "whose":  "judgedTarget",
                                                                      "withinSquares":  10
                                                                  }
                                                   },
                                         "effects":  [
                                                         {
                                                             "kind":  "note",
                                                             "text":  "Apply one bane to the triggering power roll. This must be applied before the roll resolves; the VTT cannot retroactively add the bane after the roll event fires."
                                                         }
                                                     ]
                                     }
                                 ]
                   }
}

========================================================================
14. Free Triggered Action (Judgment: reduce potency)
Section: triggers
Live action id: action_1780274946089_ff06f53d9a2e1
{
    "fields": {
        "name": "Judgment - Wrath: Reduce Potency",
        "actionLabel": "Free Triggered Action",
        "keywords": "FreeTriggered",
        "trigger": "A creature judged by you within 10 squares uses an ability with a potency that targets only one creature.",
        "cost": "1 Wrath",
        "description": "When a creature judged by you within 10 squares uses an ability with a potency that targets only one creature, the potency is reduced by 1 for that creature."
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "trigger",
                                         "id":  "trigger-judgment-reduce-potency",
                                         "condition":  "A creature judged by Cal within 10 squares uses an ability with a potency that targets only one creature.",
                                         "match":  {
                                                       "event":  "potency",
                                                       "filter":  {
                                                                      "whose":  "judgedTarget",
                                                                      "withinSquares":  10,
                                                                      "maxTargets":  1
                                                                  }
                                                   },
                                         "effects":  [
                                                         {
                                                             "kind":  "note",
                                                             "text":  "Reduce the triggering potency by 1 for that one target. The VTT cannot currently mutate a potency check that is already in progress."
                                                         }
                                                     ]
                                     }
                                 ]
                   }
}

========================================================================
15. Free Triggered Action (Judgment: melee damage taunt)
Section: triggers
Live action id: action_1780274956221_e53656897d4a6
{
    "fields": {
        "name": "Judgment - Wrath: Melee Damage Taunt",
        "actionLabel": "Free Triggered Action",
        "keywords": "FreeTriggered",
        "trigger": "You damage a creature judged by you with a melee ability.",
        "cost": "1 Wrath",
        "description": "If you damage a creature judged by you with a melee ability, the creature is taunted by you until the end of their next turn."
    },
    "automation":  {
                       "schema":  "ability-automation/v3",
                       "cards":  [
                                     {
                                         "type":  "trigger",
                                         "id":  "trigger-judgment-melee-taunt",
                                         "condition":  "Cal damages a judged creature with a melee ability.",
                                         "match":  {
                                                       "event":  "damageDealt",
                                                       "filter":  {
                                                                      "whose":  "self",
                                                                      "targetWhose":  "judgedTarget",
                                                                      "keywordsAny":  [
                                                                                          "Melee"
                                                                                      ],
                                                                      "minAmount":  1
                                                                  }
                                                   },
                                         "effects":  [
                                                         {
                                                             "kind":  "condition",
                                                             "target":  "eventTarget",
                                                             "name":  "taunted",
                                                             "duration":  "endOfTurn"
                                                         }
                                                     ]
                                     }
                                 ]
                   }
}

========================================================================
16. Shining Armor Kit
Section: features (paste into the feature's automation box)
Live feature id: feature_1780442005704_d3888411e83b18
Rules source: Shining Armor kit (melee damage bonus +2/+2/+2). "reach": "melee" makes the +2 land only on a target within the ability's melee distance (Build 551).
{
    "schema": "ability-automation/v3",
    "version": 3,
    "cards": [],
    "modifiers": [
        {
            "match": {
                "keywordsAll": [
                    "Melee",
                    "Weapon"
                ],
                "keywordsAny": [],
                "keywordsNone": [],
                "damageType": "",
                "attribute": "",
                "reach": "melee"
            },
            "apply": {
                "damageBonus": 2,
                "rangeBonus": 0,
                "forcedMovementBonus": 0,
                "damageType": "",
                "note": "Shining Armor: +2/+2/+2 melee damage bonus to melee weapon abilities, against a target within melee distance, including melee free strikes."
            },
            "label": "Shining Armor - Melee Damage Bonus"
        }
    ],
    "passives": [],
    "keywords": [],
    "usageLimit": null,
    "warnings": []
}
