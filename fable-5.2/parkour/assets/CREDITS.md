# Asset credits

Every third-party file in this project is listed here with its source and licence.
Everything in `assets/` is **CC0 1.0** (public domain dedication) — no attribution is
required, but the authors deserve it. Textures were downscaled / recompressed to keep
the download small, and a few prop meshes were decimated; nothing else was changed.

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/

## Sky / lighting — Poly Haven (CC0)

| File | Asset | Source |
|---|---|---|
| `sky/kloppenheim_06_puresky_4k.hdr` | Kloppenheim 06 (Pure Sky) HDRI, 4K | https://polyhaven.com/a/kloppenheim_06_puresky |

Used for the visible sky, the image-based lighting and reflections.

## PBR surface materials — Poly Haven (CC0)

Each folder in `textures/` holds `diff.jpg` (base colour), `nor.jpg` (OpenGL normal map)
and `arm.jpg` (ambient occlusion / roughness / metalness), 1K.

| Folder | Used for | Source |
|---|---|---|
| `textures/concrete_floor_worn_001` | rooftops | https://polyhaven.com/a/concrete_floor_worn_001 |
| `textures/concrete_floor_02` | rooftops, parapets | https://polyhaven.com/a/concrete_floor_02 |
| `textures/gravel_concrete_03` | gravel roofs | https://polyhaven.com/a/gravel_concrete_03 |
| `textures/asphalt_02` | street far below, some roofs | https://polyhaven.com/a/asphalt_02 |
| `textures/bitumen` | bitumen roofs | https://polyhaven.com/a/bitumen |
| `textures/red_brick_03` | brick walls | https://polyhaven.com/a/red_brick_03 |
| `textures/concrete_wall_008` | concrete walls, the finish tower | https://polyhaven.com/a/concrete_wall_008 |
| `textures/painted_plaster_wall` | plaster walls, bulkheads | https://polyhaven.com/a/painted_plaster_wall |
| `textures/metal_plate_02` | ducts, masts, steelwork | https://polyhaven.com/a/metal_plate_02 |
| `textures/blue_metal_plate` | painted metal boxes and pipes | https://polyhaven.com/a/blue_metal_plate |
| `textures/corrugated_iron_02` | corrugated slide ramp | https://polyhaven.com/a/corrugated_iron_02 |
| `textures/rusty_metal_02` | cranes, beams, tank bands | https://polyhaven.com/a/rusty_metal_02 |
| `textures/weathered_brown_planks` | scaffold planks, water tanks | https://polyhaven.com/a/weathered_brown_planks |

## Building facades — ambientCG (CC0)

Each folder in `facades/` holds `color.jpg`, `normal.jpg`, `roughness.jpg` and, where the
material has them, `metalness.jpg` and `emission.jpg` (lit windows), 1K.

| Folder | Source |
|---|---|
| `facades/Facade001` | https://ambientcg.com/a/Facade001 |
| `facades/Facade005` | https://ambientcg.com/a/Facade005 |
| `facades/Facade006` | https://ambientcg.com/a/Facade006 |
| `facades/Facade009` | https://ambientcg.com/a/Facade009 |
| `facades/Facade012` | https://ambientcg.com/a/Facade012 |
| `facades/Facade018A` | https://ambientcg.com/a/Facade018A |
| `facades/Facade019A` | https://ambientcg.com/a/Facade019A |
| `facades/Facade020A` | https://ambientcg.com/a/Facade020A |

## Rooftop props — Poly Haven models (CC0)

glTF with 1K textures, in `models/<id>/`.

| Folder | Used for | Source |
|---|---|---|
| `models/exterior_aircon_unit` | air-conditioning units (clean and rusted) | https://polyhaven.com/a/exterior_aircon_unit |
| `models/modular_airduct_rectangular_01` | ventilation ducts and vents (slide-under / vault obstacles) | https://polyhaven.com/a/modular_airduct_rectangular_01 |
| `models/modular_chainlink_fence` | chain-link fences and posts | https://polyhaven.com/a/modular_chainlink_fence |
| `models/modular_fire_escape` | fire escapes on building walls | https://polyhaven.com/a/modular_fire_escape |
| `models/modular_industrial_pipes_01` | pipes along walls and roofs | https://polyhaven.com/a/modular_industrial_pipes_01 |
| `models/utility_box_01` | electrical boxes | https://polyhaven.com/a/utility_box_01 |
| `models/utility_box_02` | electrical cabinets | https://polyhaven.com/a/utility_box_02 |
| `models/wooden_crate_02` | crates (vault obstacles) | https://polyhaven.com/a/wooden_crate_02 |
| `models/Barrel_01` | barrels | https://polyhaven.com/a/Barrel_01 |
| `models/barrel_03` | barrels | https://polyhaven.com/a/barrel_03 |
| `models/propane_tank` | gas bottles | https://polyhaven.com/a/propane_tank |
| `models/portable_generator` | generators | https://polyhaven.com/a/portable_generator |
| `models/cement_bag` | cement bags | https://polyhaven.com/a/cement_bag |
| `models/old_tyre` | tyres | https://polyhaven.com/a/old_tyre |

## Character and animations — Quaternius (CC0)

| File | Asset | Source |
|---|---|---|
| `character/runner.glb` | "Universal Base Characters" (Standard) — Superhero Male, rigged | https://quaternius.com |
| `character/runner_anims_1.glb` | "Universal Animation Library" (Standard): Idle, Jog, Sprint, Jump Start/Loop/Land, Roll, Crouch | https://quaternius.com |
| `character/runner_anims_2.glb` | "Universal Animation Library 2" (Standard): Climb Up, Slide, Ninja Jump | https://quaternius.com |

The packs were fetched from a public mirror of the Quaternius releases
(https://github.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender). The licence text shipped with
the packs is kept in `character/LICENSE-Quaternius-CC0.txt`. The model is used for the ghost runner
(full body, animated) and for the player's first-person arms (the arm part of the same mesh, posed
with IK).

## Code library (not in `assets/`)

| Path | What | Licence |
|---|---|---|
| `vendor/three/` | three.js r170 (core build + GLTFLoader, DRACOLoader, RGBELoader, EffectComposer, UnrealBloomPass and friends) | MIT — https://github.com/mrdoob/three.js — see `vendor/three/LICENSE` |

## Made for this project (no third-party source)

* **All sound and music** is synthesised at runtime with the Web Audio API (`js/audio.js`) —
  there are no audio files.
* Billboard artwork, water tanks, cranes, antennas, scaffolding, cables, ziplines and the
  buildings themselves are generated in code (`js/city.js`, `js/level.js`) and textured with
  the materials listed above.
