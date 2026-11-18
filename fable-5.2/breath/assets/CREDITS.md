# Credits and licences

Everything in this project is either open-licensed third-party material (listed here) or was written for it.

## Anatomy — BodyParts3D

`thorax.glb` and `airways.json` are derived from **BodyParts3D**, a 3D atlas of the human body.

- Attribution: *BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution-Share Alike 2.1 Japan.*
- Project: https://lifesciencedb.jp/bp3d/
- Archive: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/
- STL files were taken from this mirror of the release: https://github.com/Kevin-Mattheus-Moerman/BodyParts3D
  (`assets/BodyParts3D_data/stl/<ID>.stl`)
- Licence: CC BY-SA 2.1 JP — https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en

Parts used (FMA = Foundational Model of Anatomy ID; BP = BodyParts3D's own ID):

| Structure | BodyParts3D parts |
| --- | --- |
| Lungs (five separate lobes) | FMA7333 upper lobe of right lung, FMA7383 middle lobe of lung, FMA7337 lower lobe of right lung, FMA7370 upper lobe of left lung, FMA7371 lower lobe of left lung |
| Trachea, bronchi, larynx | FMA7394 trachea, FMA7409 bronchus, FMA55099 thyroid cartilage |
| Heart and great vessels | FMA7274 wall of heart, FMA3736 ascending aorta, FMA3768 arch of aorta, FMA3784 descending aorta, FMA4720 superior vena cava, FMA10951 inferior vena cava, FMA66326 pulmonary artery, FMA66643 pulmonary vein |
| Diaphragm | FMA13295 diaphragm |
| Skin (cropped to the torso) | FMA7163 skin |
| Sternum, clavicles, costal cartilages | FMA7486 manubrium, FMA7487 body of sternum, FMA7488 xiphoid process, FMA13322 right clavicle, FMA13323 left clavicle, BP24 left costal cartilage, BP28 right costal cartilage |
| Ribs 1–12, both sides | FMA7857, FMA7882, FMA7909, FMA7957, FMA7987, FMA8012, FMA8039, FMA8066, FMA8093, FMA8148, FMA8175, FMA8202, FMA8229, FMA8256, FMA8283, FMA8310, FMA8364, FMA8391, FMA8445, FMA8472, FMA8531, FMA8532, FMA8533, FMA8534 |
| Vertebrae C7, T1–T12, L1–L2 | FMA9165, FMA9187, FMA9209, FMA9248, FMA9922, FMA9945, FMA9968, FMA9991, FMA10014, FMA10037, FMA10059, FMA10081, FMA12525, FMA13072, FMA13073 |
| Intervertebral discs C7–T12 | FMA10458, FMA13495, FMA13500, FMA13501, FMA13502, FMA13503, FMA13504, FMA13505, FMA13506, FMA13507, FMA13508, FMA13509, FMA13900 |

**Changes made.** The meshes were converted from STL to one binary glTF file, moved to a common origin and scaled
(1 unit = 10 cm), welded, simplified to about 0.5 million triangles in total, lightly smoothed (heart, diaphragm),
and merged into groups (ribs, spine, discs, sternum, clavicles, cartilages, aorta, venae cavae). The skin was cropped
to the torso; the aorta and inferior vena cava were cut below the diaphragm. `airways.json` holds a centreline
skeleton with radii that was computed from the trachea and bronchus meshes, plus sample points inside each lobe.
The script that does all of this is in `tools/`.

**Share-alike.** Because they are adaptations of BodyParts3D, `thorax.glb` and `airways.json` are shared under the
same licence, CC BY-SA 2.1 JP.

## Lighting — Poly Haven

| File | Source | Licence |
| --- | --- | --- |
| `studio_small_08_1k.hdr` | "Studio Small 08", Poly Haven — https://polyhaven.com/a/studio_small_08 | CC0 1.0 (public domain) |

## Fonts (`assets/fonts/`)

All are under the SIL Open Font License 1.1 (https://openfontlicense.org) and were downloaded as WOFF2 from
Fontsource (https://fontsource.org, files served by https://cdn.jsdelivr.net/npm/@fontsource/).

| Files | Typeface | Source |
| --- | --- | --- |
| `ibm-plex-sans-400/500/600.woff2` | IBM Plex Sans, © IBM Corp. | https://github.com/IBM/plex |
| `ibm-plex-sans-arabic-400/500/600.woff2` | IBM Plex Sans Arabic, © IBM Corp. | https://github.com/IBM/plex |
| `ibm-plex-mono-400/500.woff2` | IBM Plex Mono, © IBM Corp. | https://github.com/IBM/plex |
| `instrument-serif-400.woff2` | Instrument Serif, © The Instrument Serif Project Authors | https://github.com/Instrument/instrument-serif |
| `noto-naskh-arabic-500.woff2` | Noto Naskh Arabic, © The Noto Project Authors | https://github.com/notofonts/arabic |

## Code library (`vendor/three/`)

| Files | Source | Licence |
| --- | --- | --- |
| three.js r170 (`three.module.min.js`) and add-ons: OrbitControls, GLTFLoader, RGBELoader, BufferGeometryUtils, EffectComposer, RenderPass, ShaderPass, MaskPass, UnrealBloomPass, OutputPass and their shaders | https://github.com/mrdoob/three.js (npm `three@0.170.0`) | MIT — see `vendor/three/LICENSE` |

## Made for this project (no third-party source)

- The deeper bronchial tree, the alveoli, capillaries, red blood cells and all particles are generated in code.
- The breathing sound is synthesised live with the Web Audio API; no recordings are used.
- The physiology model, shaders, interface and Arabic translation.
