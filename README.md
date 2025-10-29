# GM Screen & Virtual Tabletop

## Overview
This repository hosts a PHP-driven dashboard for managing a Dungeons & Dragons campaign alongside a browser-based virtual tabletop (VTT). The dashboard authenticates table participants, persists party data in JSON files by default, and can be pointed at MySQL through the configurable database helper in `dnd/includes/`. The companion VTT under `dnd/vtt/` exposes PHP APIs and modular JavaScript to mirror the game board, run combat, and sync state with the GM tools.

Legacy ASL learning portals and the scroller mini-game remain in the repo for reference; they share the same styling assets and authentication helpers but are isolated from the D&D-specific code paths.

## Repository Layout
- `dnd/` – Main GM experience.
  - `index.php` provides the password-only login and session guard used by the dashboard and VTT launcher.
  - `dashboard.php` renders the GM control surface and ensures chat history directories exist before loading data.
  - `includes/` collects shared helpers, including the MySQL configuration wrapper that can initialise campaign tables when you move off JSON storage.
  - `data/` stores JSON fixtures for characters, inventory, combat, and token state; copying the `.example` files lets you seed a new table without a database.
  - `js/` and `css/` hold the dashboard-facing scripts and styles, including the DOM bootstrapper that hydrates the in-browser VTT controls.
  - `vtt/` is a self-contained workspace for the virtual tabletop with its own API endpoints, assets, storage, and combat tracker module documented in its nested README.
- `tests/` – PHPUnit coverage for token normalisation and helper utilities consumed by the tabletop endpoints.
- `common/` – Shared classroom utilities (goal tracking, student management) reused by the ASL portals.
- `asl1/` and `asl2/` – First and second iteration of the ASL Hub learning management system retained for archival reference.
- `scrollergame/` – Standalone ASL word scrolling mini-game used by the ASL portals.
- `BACKUP_AUTO_RELOAD_FIX.md`, `BACKUP_SYSTEM_CHANGES.md`, and `CLAUDE.md` – Internal documentation snapshots describing previous migrations and fixes.

## Getting Started
1. **Install dependencies**
   ```bash
   composer install
   npm install
   ```
   Composer pulls in PHPUnit for the PHP test suite, while npm installs the JavaScript test runner dependencies.

2. **Seed campaign data**
   Copy the `.example` files in `dnd/data/` to remove the suffix and populate them with your party information. The dashboard and VTT will read and update these JSON stores out of the box.

3. **Run a local server**
   Use PHP's built-in web server to expose the GM dashboard and tabletop. From the repository root:
   ```bash
   php -S localhost:8000 -t dnd
   ```
   Then visit `http://localhost:8000` to reach the dashboard login. Log in with one of the character passwords defined in `dnd/index.php` to launch the GM view and VTT links.

## Testing
- **PHP unit tests**
  ```bash
  ./vendor/bin/phpunit --configuration phpunit.xml.dist
  ```
  The suite exercises the token normalisation helpers that guard the VTT storage APIs.

- **JavaScript tests**
  ```bash
  npm test
  ```
  Node's built-in test runner executes the VTT UI and polling tests described in the VTT workspace README.

## Additional Notes
- The VTT combat tracker (`dnd/vtt/combat-tracker/`) ships with Markdown specs and seeded JSON so you can explore the feature without configuring a database.
- When you're ready to persist data in MySQL, update the credentials in `dnd/includes/database-config.php` and call the helper to create the campaign tables.
