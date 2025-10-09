# Dice Roller Module

The dashboard dice roller is bundled as a self-contained module so it can be reused or
ported to another project quickly. This document outlines the structure, runtime
requirements, and behaviours that must remain intact when copying the component.

## Directory Layout

```
dice-roller/
├── dice-roller.css   # Standalone styles for the modal, buttons, and project flow
├── dice-roller.js    # UI construction + behaviour (queueing, rolling, chat hooks)
└── README.md         # This guide
```

Include both the CSS and JS files in any page that exposes the dice button:

```html
<link rel="stylesheet" href="dice-roller/dice-roller.css">
<script src="dice-roller/dice-roller.js" defer></script>
```

## Bootstrapping

The module instantiates itself as soon as the DOM is ready by looking for a
trigger button with the ID `dice-roller-btn`:

```html
<button id="dice-roller-btn">Dice Roller</button>
```

If you need a different button ID, edit the final line of `dice-roller.js`.
Only one instance is needed; it injects the modal into `document.body`.

## Runtime Dependencies

The roller is framework-free, but it expects the following globals that already
exist on the Strixhaven dashboard:

- `window.dashboardChat.sendMessage(payload)` – called with `{ message, type, payload }`
  so that rolls appear in the shared chat feed. Returns a Promise (optional).
- `window.switchSection(sectionId)` – used to jump to the "Projects" tab before
  starting a project roll. Should accept `'projects'` and return a Promise or
  void.
- `window.currentCharacter` – the character identifier to include in chat
  payloads.

If any of these APIs are missing the code fails silently (it guards with `if` checks).

## Core Concepts

### Roll Queue

- Buttons add standard dice (`1d2`, `1d4`, …), power rolls (`2d10`), or modifiers (`+1`, `-2`).
- The queue display mirrors the current expression in both the standard and
  project views. Clearing wipes both displays and resets the result panel.

### Advantage Toggle

- Toggled from either the standard or project layout.
- When active the roller resolves two rolls and keeps the higher result. The UI
  labels the result as "Result (Advantage)" and lists both attempts in the
  detail panel.

### Result Panel

- Shared logic updates every visible result container so the latest roll is
  preserved when switching between views.
- Displays the total, modifiers, individual dice, and advantage details.

## Project Roll Flow

1. Click **Project Roll** in the standard layout.
2. The modal switches to a "Pick a project" screen and highlights the Projects
   section (via `switchSection('projects')`).
3. Clicking any `.project-item` inside `#projects-list` captures the project
   index and name, then the modal enters the streamlined project controls:
   - Quick buttons: Power Roll, D10, Edge, Bane, +1, +2
   - Manual result toggle + input
   - Roll Project button + advantage toggle + result panel
4. Submitting the roll (automatic or manual) sends a `type: 'project_roll'`
   payload to chat, marks the status as `pending`, and returns to the standard
   dice roller.
5. Cancelling at any time restores the normal layout and clears the queue.

All state transitions are handled internally by `setProjectMode(mode)`.

## Styling Notes

- The CSS intentionally avoids leaking styles by scoping everything to the
  `.dice-*` namespace.
- The palette matches the dashboard's dark theme; adjust gradient colours if you
  port it to a lighter UI.
- Thick dividers (`.dice-divider`) visually break the sections as requested.

## Extending or Moving the Module

- Keep the directory together; `dice-roller.js` expects its companion CSS.
- If you relocate files, update the `<link>` and `<script>` paths and the import
  statements wherever they are referenced.
- When integrating into a different app provide stubs for `dashboardChat` and
  `switchSection`, or edit the publish/focus helpers accordingly.

With these steps an LLM (or developer) can copy the folder, wire up the three
expected globals, and drop the roller into another project without hunting for
related code.
