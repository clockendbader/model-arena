# Breath — an interactive journey into the human lungs

A browser exhibit that follows a breath from the chest wall, down the bronchial tree, to a single
cluster of alveoli where oxygen and carbon dioxide change places. The anatomy is real (BodyParts3D),
the physiology is computed live, and the interface is in English and Arabic.

## Run it

```
python3 -m http.server 8000
```

Run that inside this folder, then open <http://localhost:8000>. Nothing is installed or downloaded:
three.js, the fonts and all models are in the folder, so it also works offline. If port 8000 is
already in use, pick another number in both places.

It needs a browser with WebGL 2 (current Chrome, Edge, Firefox or Safari). A static server is required
because browsers do not load ES modules from `file://`.

## Using it

| | |
| --- | --- |
| Drag / scroll / right-drag | Orbit, zoom, pan |
| Click a structure or a label | Its name (in both languages) and a one-sentence explanation |
| `1` `2` `3`, or the stepper at the bottom | Fly to Body, Airways, Alveolus |
| Scenario buttons | Rest, Exercise, High altitude (3,500 m), Asthma, Smoker's lungs |
| Sliders | Breathing rate (6–40 /min) and breath depth (200–3,000 mL) |
| Labels, Layers, Sound | Toggle the 3D labels; hide skin, skeleton or vessels; mute |
| `L` or the language button | English / Arabic (right-to-left) |
| `M`, `Esc` | Mute; close the info card |

Optional URL parameters for kiosks: `?lang=ar`, `?autostart` (skip the title card),
`&level=1` or `2`, `&scenario=exercise|altitude|asthma|smoker`.

## What is real and what is generated

- **Real meshes** (BodyParts3D): the five lung lobes, trachea and bronchi down to the segmental
  level, larynx, heart, aorta, venae cavae, pulmonary arteries and veins, diaphragm, ribs, costal
  cartilages, sternum, clavicles, spine and skin.
- **Generated in code**: the deeper airways, which grow from the tips of the real bronchi into each
  lobe; the alveoli, capillary nets and red blood cells; every particle; the breathing sound.

## The numbers

The readouts come from a small model in `js/physiology.js`, not from a lookup table:

- minute ventilation = rate × tidal volume; alveolar ventilation subtracts the dead space
- arterial CO₂ = CO₂ production × 0.863 / alveolar ventilation
- alveolar O₂ from the alveolar gas equation, using barometric pressure (760 mmHg at sea level,
  493 mmHg at 3,500 m)
- arterial O₂ = alveolar O₂ minus a scenario-specific gradient (larger in asthma and emphysema)
- SpO₂ from the Severinghaus oxygen dissociation curve

At rest this gives 14 breaths/min, 500 mL, 7.0 L/min and 97 %; about 87 % at altitude.

## Files

```
index.html            page, import map, loader
css/style.css         interface
js/main.js            scene, camera flights, picking, render loop
js/physiology.js      breathing cycle, gas exchange, scenarios
js/deform.js          the chest-wall motion, shared by shaders and JavaScript
js/anatomy.js         materials for the real meshes
js/airways.js         procedural bronchial tree and air particles
js/alveoli.js         the alveolar scene: sacs, capillaries, red cells, gas molecules
js/ui.js  js/i18n.js  panels, labels, English and Arabic text
js/audio.js           synthesised breathing sound
assets/               thorax.glb, airways.json, studio HDRI, fonts, CREDITS.md
vendor/three/         three.js r170 and the add-ons used
tools/                the script that built thorax.glb and airways.json
```

## Rebuilding the models (optional)

The app does not need this. To regenerate `assets/thorax.glb` and `assets/airways.json` from the
original BodyParts3D files (Node 18+, about 190 MB of downloads):

```
cd tools && npm install && npm run fetch && npm run build
```

## Simplifications

- Chest motion is one smooth displacement field (about 1.5 cm of diaphragm descent in a quiet
  breath, up to about 5.5 cm in the deepest) rather than a rotation of each rib about its own joints.
- The heart beats and moves as a rigid shape; its chambers are not modelled.
- 21 of the 23 airway generations are drawn, and the tree is thinned towards the periphery
  (thousands of branches rather than millions).
- At the alveolus level, capillaries and red cells are drawn up to twice their true size relative
  to the air sacs, red-cell transit is slowed about fourfold, and gas molecules are symbolic.
- Scenario values are typical textbook figures, not a diagnosis; SpO₂ is a steady-state estimate.
- Arabic text uses Western digits for the live readouts.

Licences and sources for every asset are in [`assets/CREDITS.md`](assets/CREDITS.md).
