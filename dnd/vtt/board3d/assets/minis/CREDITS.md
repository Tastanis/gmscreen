# Minis

Made for this game by the "3D PC character models" chat from Brandon's portraits (October 14–15, 2026),
built by script with three.js r160. Original work for this site; no third-party models.
`minis.json` maps character sheets and monster ids to models (see `../../minis.mjs`).

The `*-meshy` models (the four heroes, October 15, the Sluice Drowner, October 19, and Kragen Thornwhisper and the Sluice Warden, October 20, 2026) were generated
with Meshy (meshy.ai) on Brandon's account from his own art, then given detail levels and fixed up by the same chat.


`ink-devourer.glb` (November 6, 2026) derives from Brandon's supplied
`Meshy_AI_Textured_Ink_Octopus_1107042941_texture.glb`. The ink was centered,
the attachment repaired, tentacle and hover joints added, and three detail levels
exported with shared 2K textures. Source model rights are unchanged.

Build 609 removes the emitted plume/nozzle, repairs the face, and retains the
twelve floating droplets around the sides. The hover/tentacle rig is unchanged.

`thorn-briar.glb` (November 8, 2026) starts from Codex's procedural vine rig.
Build 611 keeps every third vine joint (949 to 349), adds hooked thorns, dead
leaves and a root heart, and textures the bark from Poly Haven's `bark_willow`
(CC0). Packed with gltfpack and WebP: 1.8 MB, down from 5.1 MB.
