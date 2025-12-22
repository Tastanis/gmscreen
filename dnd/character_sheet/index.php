<?php
if (session_status() === PHP_SESSION_NONE) {
  session_start();
}

$sessionUser = isset($_SESSION['user']) ? strtolower($_SESSION['user']) : '';
$requestedCharacter = isset($_GET['character']) ? strtolower(trim($_GET['character'])) : '';
$activeCharacter = $requestedCharacter !== '' ? $requestedCharacter : $sessionUser;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hero Sheet</title>
  <link rel="stylesheet" href="styles.css" />
  <script type="module" src="sheet.js"></script>
</head>
<body data-character="<?php echo htmlspecialchars($activeCharacter); ?>">
  <div class="sheet">
    <header class="sheet__header">
      <div class="header__title">
        <div class="title__eyebrow">Character Sheet</div>
        <h1>Tableside Hero View</h1>
      </div>
      <div class="header__actions">
        <label class="toggle">
          <input type="checkbox" id="edit-toggle" />
          <span class="toggle__slider"></span>
          <span class="toggle__label">Edit Mode</span>
        </label>
      </div>
    </header>

    <section class="sheet__summary">
      <div class="summary__identity">
        <div class="identity__row">
          <div class="field editable-field" data-field="name">
            <label>Name</label>
            <span class="value"></span>
            <input type="text" />
          </div>
          <div class="field editable-field" data-field="level">
            <label>Level</label>
            <span class="value"></span>
            <input type="number" min="1" />
          </div>
          <div class="field editable-field" data-field="class">
            <label>Class</label>
            <span class="value"></span>
            <input type="text" />
          </div>
          <div class="field editable-field" data-field="complication">
            <label>Complication</label>
            <span class="value"></span>
            <input type="text" />
          </div>
        </div>
        <div class="identity__row">
          <div class="field editable-field" data-field="ancestry">
            <label>Ancestry</label>
            <span class="value"></span>
            <input type="text" />
          </div>
          <div class="field editable-field" data-field="culture">
            <label>Culture</label>
            <span class="value"></span>
            <input type="text" />
          </div>
          <div class="field editable-field" data-field="career">
            <label>Career</label>
            <span class="value"></span>
            <input type="text" />
          </div>
          <div class="field editable-field" data-field="classTrack">
            <label>Class Track</label>
            <span class="value"></span>
            <input type="text" />
          </div>
        </div>
      </div>
      <div class="summary__resources">
        <div class="resource editable-field" data-field="resourceLabel">
          <label>Resource Label</label>
          <span class="value"></span>
          <input type="text" />
        </div>
        <div class="resource editable-field" data-field="resourceValue">
          <label>Resource Value</label>
          <span class="value"></span>
          <input type="text" />
        </div>
        <div class="bars">
          <div class="bar">
            <div class="bar__label">Stamina</div>
            <div class="bar__track">
              <div class="bar__fill" data-bar="stamina"></div>
            </div>
            <div class="bar__caption editable-field" data-field="stamina">
              <span class="value"></span>
              <input type="number" min="0" />
            </div>
          </div>
          <div class="bar">
            <div class="bar__label">Recovery</div>
            <div class="bar__track">
              <div class="bar__fill" data-bar="recovery"></div>
            </div>
            <div class="bar__caption editable-field" data-field="recovery">
              <span class="value"></span>
              <input type="number" min="0" />
            </div>
          </div>
        </div>
        <div class="tokens">
          <div class="token" data-token="heroic">
            <div class="token__label">Heroic Token</div>
            <label class="switch">
              <input type="checkbox" />
              <span></span>
            </label>
          </div>
          <div class="token" data-token="legendary">
            <div class="token__label">Legendary Token</div>
            <label class="switch">
              <input type="checkbox" />
              <span></span>
            </label>
          </div>
        </div>
      </div>
    </section>

    <section class="sheet__body">
      <div class="tabs">
        <button class="tab tab--active" data-tab="hero">Hero</button>
        <button class="tab" data-tab="features">Features</button>
        <button class="tab" data-tab="mains">Mains</button>
        <button class="tab" data-tab="maneuvers">Maneuvers</button>
        <button class="tab" data-tab="triggers">Triggers</button>
        <button class="tab" data-tab="free-strikes">Free Strikes</button>
      </div>
      <div class="sheet__content">
        <div class="pane" data-pane="hero">
          <div class="placeholder">Add hero highlights, stats, and notes here.</div>
        </div>
        <div class="pane is-hidden" data-pane="features">
          <div class="placeholder">Feature details will live here.</div>
        </div>
        <div class="pane is-hidden" data-pane="mains">
          <div class="placeholder">Main actions and combos are coming soon.</div>
        </div>
        <div class="pane is-hidden" data-pane="maneuvers">
          <div class="placeholder">Maneuver cards and rolls slot in here.</div>
        </div>
        <div class="pane is-hidden" data-pane="triggers">
          <div class="placeholder">Trigger reactions placeholder.</div>
        </div>
        <div class="pane is-hidden" data-pane="free-strikes">
          <div class="placeholder">Free strike options will be listed here.</div>
        </div>
      </div>
    </section>
  </div>

  <aside class="sidebar">
    <div class="sidebar__section">
      <div class="sidebar__header">Common Things</div>
      <div class="sidebar__content editable-list" data-list="common">
        <ul></ul>
        <textarea class="edit-input" rows="3" placeholder="Add common items..."></textarea>
      </div>
    </div>
    <div class="sidebar__section">
      <div class="sidebar__header">Weaknesses</div>
      <div class="sidebar__content editable-list" data-list="weaknesses">
        <ul></ul>
        <textarea class="edit-input" rows="3" placeholder="List weaknesses..."></textarea>
      </div>
    </div>
    <div class="sidebar__section">
      <div class="sidebar__header">Languages</div>
      <div class="sidebar__content editable-list" data-list="languages">
        <ul></ul>
        <textarea class="edit-input" rows="3" placeholder="Add languages..."></textarea>
      </div>
    </div>
    <div class="sidebar__section">
      <div class="sidebar__header">Skills</div>
      <div class="sidebar__content">
        <div class="skill" data-skill="acrobatics">
          <label>Acrobatics</label>
          <select class="skill-select">
            <option>Untrained</option>
            <option>Trained</option>
            <option>Expert</option>
            <option>Master</option>
          </select>
        </div>
        <div class="skill" data-skill="arcana">
          <label>Arcana</label>
          <select class="skill-select">
            <option>Untrained</option>
            <option>Trained</option>
            <option>Expert</option>
            <option>Master</option>
          </select>
        </div>
        <div class="skill" data-skill="athletics">
          <label>Athletics</label>
          <select class="skill-select">
            <option>Untrained</option>
            <option>Trained</option>
            <option>Expert</option>
            <option>Master</option>
          </select>
        </div>
      </div>
    </div>
  </aside>
</body>
</html>
