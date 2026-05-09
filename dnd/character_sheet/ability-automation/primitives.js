(function () {
  "use strict";

  const ATTRIBUTES = ["Might", "Agility", "Reason", "Intuition", "Presence"];

  const primitives = [
    {
      type: "target",
      label: "Target",
      description: "Choose a token or skip target selection when the ability does not need one.",
    },
    {
      type: "action",
      label: "Action",
      description: "Run a power roll, deal damage, apply an effect, or add another automation step.",
    },
  ];

  const actionTypes = [
    {
      type: "powerRoll",
      label: "Power Roll",
      description: "Roll 2d10 plus an attribute and select a tier.",
    },
    {
      type: "dealStaminaDamage",
      label: "Deal Stamina Damage",
      description: "Apply the selected power-roll tier damage to the selected target.",
    },
    {
      type: "note",
      label: "Note",
      description: "Capture a future automation detail without executing it yet.",
    },
  ];

  function getPrimitive(type) {
    return primitives.find((primitive) => primitive.type === type) || primitives[0];
  }

  function getActionType(type) {
    return actionTypes.find((actionType) => actionType.type === type) || actionTypes[0];
  }

  window.AbilityAutomationPrimitives = {
    ATTRIBUTES,
    primitives,
    actionTypes,
    getPrimitive,
    getActionType,
  };
})();
