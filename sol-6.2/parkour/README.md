# Afterheight

A desktop-browser rooftop time trial set in District 07 at sunset. Follow the red route across eleven sectors of the Highline and race your personal-best ghost on subsequent runs.

## Run locally

From this folder, run:

```sh
python3 -m http.server 8017 --bind 127.0.0.1
```

Open [http://127.0.0.1:8017](http://127.0.0.1:8017) in a desktop browser with WebGL 2, then click **Click to Play**. Everything is served from this folder, including Three.js r180 and the art assets. Use the same browser and address to keep your best run.

| Input | Action |
| --- | --- |
| WASD / mouse | Move / look |
| Shift | Sprint |
| Space | Jump. Hold to jump higher. Press again during a wall-run to kick off. |
| C or Ctrl | Slide while sprinting or roll just before a hard landing |
| E | Grab a nearby zipline |
| V | Toggle runner’s vision |
| R | Respawn at the last checkpoint |
| Esc | Pause and release the mouse |

Sprint into a low barrier to vault it. Jump beside a red wall to wall-run or jump straight into a ledge to climb and mantle. Checkpoints save your position and record a split. The run clock pauses with the game.

## Project layout

- `game.js` manages pointer lock, the camera, menus, timing, saves and checkpoint progression.
- `movement.js` runs the fixed-step controller, collision and move transitions.
- `level.js` builds the handcrafted route, skyline and collision geometry.
- `visuals.js` sets up rendering, the first-person gloves, particles and the animated ghost.
- `audio.js` synthesizes effects and music.
- [Asset credits](assets/CREDITS.md) list sources and licenses.
