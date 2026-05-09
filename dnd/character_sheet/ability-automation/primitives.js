(function () {
  "use strict";

  const ATTRIBUTES = ["Might", "Agility", "Reason", "Intuition", "Presence"];

  const primitives = [
    {
      type: "target",
      label: "Target",
      description: "Choose the creatures or objects affected by the ability.",
    },
    {
      type: "powerRollDamage",
      label: "Power Roll Damage",
      description: "Roll 2d10 plus an attribute and define damage for each tier.",
    },
    {
      type: "dealStaminaDamage",
      label: "Deal Stamina Damage",
      description: "Apply the selected power-roll tier damage to the chosen target.",
    },
    {
      type: "note",
      label: "Automation Note",
      description: "Capture future automation details without making them executable yet.",
    },
  ];

  function getPrimitive(type) {
    return primitives.find((primitive) => primitive.type === type) || primitives[0];
  }

  window.AbilityAutomationPrimitives = {
    ATTRIBUTES,
    primitives,
    getPrimitive,
  };
})();
