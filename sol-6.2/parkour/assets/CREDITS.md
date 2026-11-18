# Asset credits

## Sky and materials

All Poly Haven assets below are distributed under [CC0 1.0](https://polyhaven.com/license). Material folders contain the 1K JPEG color, OpenGL normal and packed ambient occlusion, roughness and metalness maps used by the game.

| Local asset | Source | License |
| --- | --- | --- |
| `sky.hdr` | [Industrial Sunset (Pure Sky), 2K Radiance HDR](https://polyhaven.com/a/industrial_sunset_puresky) | CC0 1.0 |
| `materials/concrete_floor_worn_02/` | [Concrete Floor Worn 02](https://polyhaven.com/a/concrete_floor_worn_02) | CC0 1.0 |
| `materials/factory_brick/` | [Factory Brick](https://polyhaven.com/a/factory_brick) | CC0 1.0 |
| `materials/metal_plate/` | [Metal Plate](https://polyhaven.com/a/metal_plate) | CC0 1.0 |
| `materials/asphalt_02/` | [Asphalt 02](https://polyhaven.com/a/asphalt_02) | CC0 1.0 |
| `materials/facade/` | [Facade 009, 1K JPG glass facade, ambientCG](https://ambientcg.com/view?id=Facade009) | [CC0 1.0](https://ambientcg.com/license) |

## Industrial glTF props

Each GLB packages the source glTF geometry and its 1K JPEG textures into a single local file. The game places individual prefabs from the modular sets.

| Local asset | Source | License |
| --- | --- | --- |
| `models/exterior_aircon_unit.glb` | [Exterior Aircon Unit](https://polyhaven.com/a/exterior_aircon_unit) | CC0 1.0 |
| `models/plastic_crate_02.glb` | [Plastic Crate 02](https://polyhaven.com/a/plastic_crate_02) | CC0 1.0 |
| `models/small_lpg_tank.glb` | [Small LPG Tank](https://polyhaven.com/a/small_lpg_tank) | CC0 1.0 |
| `models/modular_airduct_circular_01.glb` | [Modular Airduct Circular 01](https://polyhaven.com/a/modular_airduct_circular_01) | CC0 1.0 |
| `models/portable_generator.glb` | [Portable Generator](https://polyhaven.com/a/portable_generator) | CC0 1.0 |
| `models/overhead_crane.glb` | [Overhead Crane](https://polyhaven.com/a/overhead_crane) | CC0 1.0 |
| `models/modular_pipes.glb` | [Modular Pipes](https://polyhaven.com/a/modular_pipes) | CC0 1.0 |

## Character and animations

| Local asset | Source | License |
| --- | --- | --- |
| `runner.glb` | [Quaternius Universal Animation Library Standard](https://quaternius.com/packs/universalanimationlibrary.html), [compressed GLB from 3D Valley](https://static.3dvalley.com/qt/universalanimationlibrary.UAL1_Standard/animations.glb) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `climb.glb` | [Quaternius Universal Animation Library 2 Standard](https://quaternius.com/packs/universalanimationlibrary2.html), [compressed GLB from 3D Valley](https://static.3dvalley.com/qt/universalanimationlibrary2.UAL2_Standard/animations.glb) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

The ghost uses the Quaternius mannequin and animation clips with a translucent material created for this game.

## Fonts and libraries

| Local asset | Source | License |
| --- | --- | --- |
| `fonts/barlow-condensed-*.woff2` | [Barlow Condensed by Jeremy Tribby](https://fonts.google.com/specimen/Barlow+Condensed) | [SIL OFL 1.1](fonts/Barlow-OFL.txt) |
| `fonts/ibm-plex-mono-*.woff2` | [IBM Plex Mono by IBM](https://fonts.google.com/specimen/IBM+Plex+Mono) | [SIL OFL 1.1](fonts/IBM-Plex-OFL.txt) |
| `three/` | [Three.js r180, 0.180.0](https://github.com/mrdoob/three.js/tree/r180), with its matching addons | [MIT](three/LICENSE) |
| `three/examples/jsm/libs/draco/gltf/` | [Google Draco glTF decoder](https://github.com/google/draco), as bundled with Three.js r180 | [Apache 2.0](three/examples/jsm/libs/draco/LICENSE) |
| `three/examples/jsm/libs/meshopt_decoder.module.js` | [meshoptimizer by Arseny Kapoulkine](https://github.com/zeux/meshoptimizer), as bundled with Three.js r180 | [MIT](three/examples/jsm/libs/meshoptimizer-LICENSE) |

The game generates its skyline modules, water towers, railings, scaffolding, signage, first-person gloves, particles and audio at runtime. The Afterheight mark is original. The soundtrack and effects are synthesized with Web Audio.
