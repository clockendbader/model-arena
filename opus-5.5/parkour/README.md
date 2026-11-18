# HIGHLINE: a rooftop run at golden hour

A first-person parkour game for the browser, built with three.js. It has no build step and needs no installs.

## Run

```bash
cd parkour
python3 -m http.server 8000
```

Then open **http://localhost:8000** in a desktop Chrome, Edge or Firefox and click to play. (Any static file server works. Opening `index.html` straight from disk won't work, because ES modules need http.)

## Controls

| Key | Action |
|---|---|
| W A S D | Run |
| Mouse | Look (pointer lock) |
| Shift | Sprint (builds momentum) |
| Space | Jump. Hold for more height. Use it near walls to wall-run, kick off or climb. |
| C (or Ctrl) | Slide while running. Tap it just before a big landing to roll. |
| E | Grab a zipline |
| R | Back to the last checkpoint |
| Esc | Pause: resume, checkpoint, restart, sensitivity, volume, runner's vision, ghost |

Tip: use **C** rather than Ctrl, because Ctrl+W closes the browser tab.

## What's in it

- **Movement**:
  - momentum running with a slow climb to top speed
  - variable-height jump with 120 ms coyote time and jump buffer
  - 1.5 s wall-run with a kick-off jump, and a wall-climb
  - ledge grab and mantle, plus auto-vault over waist-high obstacles while sprinting
  - slide that speeds up on downhill slopes
  - roll on a timed landing; otherwise a stumble, and a fatal fall when it's too high
  - ziplines
- **Course**: 10 checkpoints across about 20 rooftops. Moves are taught in order (jump, vault, roll, slide, wall-run, climb, ledge grab, zipline), and it ends with a chain section and a scaffold climb to the finish. It has two optional shortcuts: a side ledge after the vaults, and a crate-and-catwalk route after the first zipline. Falling sends you back to the last checkpoint behind a fast fade.
- **Systems**:
  - timer with green or red splits against your best
  - ghost of your best run, saved in localStorage
  - start, pause and results screens
  - runner's vision: red highlights on surfaces you can use, which you can toggle
- **Presentation**:
  - HDRI sky, a low warm sun with 2048 px real-time shadows, PBR materials and ACES tone mapping
  - bloom, distance and height fog, procedural window facades with lit interiors
  - head bob, a FOV that widens with speed, wall-run tilt, landing dip, roll spin
  - speed lines with radial blur, procedural arms, dust and spark particles
  - fully synthesized adaptive audio

## Code layout

```
index.html          UI overlays, import map, styles
src/main.js         boot, loading, main loop (physics fixed at 120 Hz, interpolated camera)
src/config.js       all movement / camera tuning constants
src/physics.js      AABB + ramp collision world, capsule sweep, raycasts
src/player.js       movement state machine
src/cameraRig.js    bob, tilt, dips, roll, FOV, shake
src/arms.js         first-person arms (IK)
src/level.js        the course: rooftops, obstacles, ziplines, checkpoints, hints
src/city.js         surrounding city, cranes, billboards, cables, street
src/props.js        GLB props (instanced) + procedural props
src/materials.js    PBR materials, facade shader, runner's vision
src/geometry.js     box/tube helpers and static batching
src/renderer.js     renderer, lights, fog, post-processing
src/audio.js        Web Audio synthesis
src/game.js         run state, checkpoints, splits, persistence
src/ghost.js        ghost recording + playback
src/markers.js      checkpoint beacons
src/particles.js    dust / sparks
src/ui.js           HUD and menus
assets/             HDRI, textures, models (see assets/CREDITS.md)
vendor/three/       pinned three.js r170 + addons
```
