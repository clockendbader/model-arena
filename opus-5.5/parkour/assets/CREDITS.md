# Credits & licences

Every third-party file shipped in this folder is listed below. Total size of `assets/` is about 24 MB.

## HDRI (sky and image-based lighting)

| File | Source | Licence |
|---|---|---|
| `hdri/belfast_sunset_puresky_2k.hdr` | Poly Haven, "Belfast Sunset (Pure Sky)": https://polyhaven.com/a/belfast_sunset_puresky | CC0 1.0 |

## PBR textures (1k JPG: diffuse, normal, AO/rough/metal packed)

All from Poly Haven, CC0 1.0 (https://polyhaven.com/license).

| Folder | Source |
|---|---|
| `textures/concrete_floor_worn_001/` | https://polyhaven.com/a/concrete_floor_worn_001 |
| `textures/concrete_wall_003/` | https://polyhaven.com/a/concrete_wall_003 |
| `textures/red_brick_03/` | https://polyhaven.com/a/red_brick_03 |
| `textures/metal_plate/` | https://polyhaven.com/a/metal_plate |
| `textures/corrugated_iron/` | https://polyhaven.com/a/corrugated_iron |
| `textures/rusty_metal_02/` | https://polyhaven.com/a/rusty_metal_02 |
| `textures/asphalt_02/` | https://polyhaven.com/a/asphalt_02 |
| `textures/plaster_grey_04/` | https://polyhaven.com/a/plaster_grey_04 |
| `textures/blue_metal_plate/` | https://polyhaven.com/a/blue_metal_plate |

## 3D models

Poly Haven models are CC0 1.0. They were re-compressed with glTF-Transform (Draco geometry and 1024 px WebP textures) to reduce download size. Nothing else was changed.

| File | Source | Licence |
|---|---|---|
| `models/exterior_aircon_unit.glb` | https://polyhaven.com/a/exterior_aircon_unit | CC0 1.0 |
| `models/barrel_03.glb` | https://polyhaven.com/a/barrel_03 | CC0 1.0 |
| `models/wooden_crate_01.glb` | https://polyhaven.com/a/wooden_crate_01 | CC0 1.0 |
| `models/cardboard_box_01.glb` | https://polyhaven.com/a/cardboard_box_01 | CC0 1.0 |
| `models/power_box_01.glb` | https://polyhaven.com/a/power_box_01 | CC0 1.0 |
| `models/utility_box_02.glb` | https://polyhaven.com/a/utility_box_02 | CC0 1.0 |
| `models/modular_airduct_rectangular_01.glb` | https://polyhaven.com/a/modular_airduct_rectangular_01 | CC0 1.0 |
| `models/metal_trash_can.glb` | https://polyhaven.com/a/metal_trash_can | CC0 1.0 |
| `models/security_camera_01.glb` | https://polyhaven.com/a/security_camera_01 | CC0 1.0 |
| `models/sophia.glb` (ghost runner) | "Sophia" by GDQuest, from the GDQuest 3D Characters repository: https://github.com/gdquest-demos/godot-4-3D-Characters (also https://opengameart.org/content/gdquest-3d-characters-repository) | CC-BY 4.0. Attribution: **Sophia character © GDQuest, CC-BY 4.0** |

## Code and libraries

| Item | Source | Licence |
|---|---|---|
| three.js r170 plus addons (GLTFLoader, DRACOLoader, RGBELoader, EffectComposer, UnrealBloomPass, OutputPass, BufferGeometryUtils), vendored in `vendor/three/` | https://github.com/mrdoob/three.js (npm `three@0.170.0`) | MIT (see `vendor/three/LICENSE`) |
| Draco decoder, in `vendor/three/addons/libs/draco/` | https://github.com/google/draco | Apache 2.0 |

## Fonts (loaded from Google Fonts at runtime; the game falls back to system fonts when offline)

| Font | Source | Licence |
|---|---|---|
| Barlow Condensed | https://fonts.google.com/specimen/Barlow+Condensed | SIL Open Font License 1.1 |
| JetBrains Mono | https://fonts.google.com/specimen/JetBrains+Mono | SIL Open Font License 1.1 |

## Made for this project (no third-party source)

- **Audio**: all sound is synthesized live with the Web Audio API in `src/audio.js`, including footsteps, wind, city hum, impacts, zipline, checkpoint chimes and the adaptive music. No audio files are used.
- **Procedural geometry**: buildings, facade window shader, water tanks, antennas, cranes, scaffolding, billboards and their glowing abstract art, cables, pipes, vents and sheds are all generated in code.
- **First-person arms**: procedural primitives posed with two-bone IK.
