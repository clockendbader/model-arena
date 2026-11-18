# Dusk Runner asset credits

All runtime assets are included locally.

## Environment

Poly Haven distributes its HDRIs, models and textures under [CC0 1.0](https://polyhaven.com/license). Model folders contain the original glTF, buffers and associated 1K texture maps.

| Source asset | Local files | Use |
| --- | --- | --- |
| [Belfast Sunset Pure Sky](https://polyhaven.com/a/belfast_sunset_puresky) | sky.hdr, sky-color.jpg | 1K HDR environment illumination and 2K tonemapped, shader-graded sky |
| [Concrete Floor 02](https://polyhaven.com/a/concrete_floor_02) | concrete_floor_02_*.jpg | Albedo, normal and roughness |
| [Brick Wall 003](https://polyhaven.com/a/brick_wall_003) | brick_wall_003_*.jpg | Masonry fascia |
| [Corrugated Iron](https://polyhaven.com/a/corrugated_iron) | corrugated_iron_*.jpg | Roof decking, ducts and housings |
| [Asphalt 02](https://polyhaven.com/a/asphalt_02) | asphalt_02_*.jpg | Tar-covered rooftops |
| [Wooden Crate 01](https://polyhaven.com/a/wooden_crate_01) | wooden_crate_01/ | Freight crates |
| [Modular Airduct Rectangular 01](https://polyhaven.com/a/modular_airduct_rectangular_01) | modular_airduct_rectangular_01/ | Rooftop ventilation |
| [Propane Tank](https://polyhaven.com/a/propane_tank) | propane_tank/ | Service equipment |

The finish prism uses the GlassTransmission PBR material and 1K volume thickness map from [Glass Vase Flowers](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlassVaseFlowers), glass by Eric Chadwick, CC0 1.0. The extracted material is in glass/.

## Character

[Universal Animation Library, standard edition](https://quaternius.itch.io/universal-animation-library) by Quaternius, CC0 1.0. The [glTF distribution](https://github.com/J-Ponzo/gltf-universal-animation-library) supplies the skinned mannequin and animation tracks in runner/. The ghost uses the library's running, jumping, interaction, crouching and rolling clips. Its climbing motion is adapted from the push animation.

## Typography and renderer

- Barlow Condensed ExtraBold Italic by Jeremy Tribby, [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/barlowcondensed). SIL Open Font License 1.1, included in Barlow-OFL.txt.
- IBM Plex Mono Medium by IBM, [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/ibmplexmono). SIL Open Font License 1.1, included in Plex-OFL.txt.
- [Three.js r170](https://github.com/mrdoob/three.js/tree/r170), MIT, included in ../vendor/THREE-LICENSE. The vendored renderer and addons are from npm release 0.170.0.

## Project-created assets

The title illustration (cover.jpg) was generated specifically for Dusk Runner with the built-in image generation tool. The art brief called for a wide painterly rooftop city at dusk, a silhouetted runner jumping on the right, a glowing sunset, magenta route markers and a shadowed left side for the title.

The street grid, rooftop course, window atlases, glass material, scaffolding, cranes, fences, antennas, water towers, cables, signs, first-person gloves, original branding and particles are created by project code. All music and sound effects are synthesized with Web Audio.
