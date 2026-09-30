# Whole-square height displays - 1.19.183

GM inspection and token settings show groundSquare(height), using the existing
terrain rule floor(height + 0.5). Fractional physical heights remain intact.
Unchanged displayed values and decimal input do not save a rounded flightHeight.
Deliberate whole-square edits use the existing canonical save path.

Ability range, effective creature height, support and collision calculations are
unchanged. Focused tests and the isolated Chrome fixture
`node dnd/vtt/tools/test-height-display-browser.cjs` verify both production display
paths, fractional retention, unchanged-square no-op and intentional edits.
The fixture uses mocked context and saves; it does not establish live deployment.
