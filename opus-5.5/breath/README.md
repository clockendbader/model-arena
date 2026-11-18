# Breath: the living lung

An interactive 3D simulation of the human lungs and breathing that runs in the browser.

## Run

```sh
python3 -m http.server 8000
```

Run this from inside the `breath/` folder, then open **http://localhost:8000**.
You need a local server because browsers block ES modules and model loading from `file://`.
Nothing needs installing. three.js r170 is vendored in `assets/vendor/three`.

## What you can do

- **Three zoom levels**, with camera flights between them:
  - **Body:** a glass torso with the ribcage, diaphragm, trachea, five lung lobes and the heart in the cardiac notch, all breathing.
  - **Airways:** fly down the bronchial tree, from the trachea to generation 11, following one branch.
  - **Alveolus:** a cluster of alveoli in a capillary net. O₂ (red) crosses from air to blood, CO₂ (blue) crosses from blood to air, and red cells brighten as they load oxygen.
- **Scenarios:** Rest, Exercise, High altitude (3,500 m), Asthma and Smoker's lungs. Each one changes the motion, the visuals and the numbers.
- **Sliders** for breathing rate and breath depth (tidal volume).
- **Live readouts:** breaths per minute, tidal volume, minute ventilation, SpO₂, alveolar PO₂, arterial PCO₂, heart rate, and a lung-volume graph.
- **Mouse controls:** drag to orbit, scroll to zoom, right-drag to pan. **Click** any structure to see its name and a one-line explanation.
- **Buttons:** labels, X-ray mode, sound (synthesised breathing that follows airflow, with a wheeze in asthma), a facts panel, and an **English / العربية** toggle with full right-to-left layout.

## Project layout

```
index.html          page and UI markup (import map → assets/vendor/three)
src/main.js         renderer, scenes, camera flights, picking, frame loop
src/physiology.js   breathing cycle and gas-exchange model (scenarios live here)
src/breathing.js    shared GLSL/JS breathing deformation
src/anatomy.js      loads the GLB models, materials, rib and diaphragm motion
src/airways.js      bronchial-tree mesh and airflow particles
src/alveolus.js     alveolus/capillary micro-scene
src/ui.js, i18n.js  interface, labels, English/Arabic strings
src/audio.js        Web Audio breathing synthesiser
assets/             models (GLB), airway data, HDRI, vendored three.js, CREDITS.md
tools/              build script that produced assets/ from BodyParts3D
```

## Rebuilding the models (optional)

The built assets are already in `assets/`. To regenerate them:

1. Download `partof_BP3D_4.0_obj_99.zip` and `partof_element_parts.txt` from the
   [BodyParts3D download page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html).
2. Unzip the archive.
3. Install the build dependencies: `npm i @gltf-transform/core@4 meshoptimizer@0.22`.
4. Run:
   ```sh
   node --max-old-space-size=8192 tools/build_models.mjs <unzipped obj dir> <partof_element_parts.txt> assets
   ```

Licences and sources for every asset are listed in [`assets/CREDITS.md`](assets/CREDITS.md).
