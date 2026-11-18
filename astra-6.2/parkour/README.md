# Dusk Runner

A first-person rooftop time trial for a desktop browser with WebGL 2, keyboard and mouse. The course spans 24 rooftops in eight sectors. All assets, fonts and Three.js r170 are bundled locally.

## Run

From this folder:

```sh
python3 serve.py
```

Open **http://localhost:8000** and click **Click to play**. No build, package installation or external asset server is required.

## Controls

| Input | Action |
| --- | --- |
| W A S D / mouse | Move / look |
| Shift | Sprint |
| Space | Jump. Hold for height. Press again during a wall-run to kick off. |
| C or Ctrl | Crouch, slide at speed, or prepare a landing roll |
| E | Grab a nearby zipline |
| R | Return to the most recent checkpoint |
| V | Toggle runner’s vision |
| Esc | Pause, resume, restart or adjust sensitivity |
| Left / right arrows | Alternate turning controls |

Follow the painted chevrons through each illuminated checkpoint gate in order. Sprint into low red barriers to vault. Jump toward the side wall at an angle to wall-run, or sprint into a taller face to climb. Approaching a lip within reach pulls you up. Tap crouch just before a large drop lands to preserve speed. A zipline can be released early with Space.

The timer excludes pauses and keeps running through falls. Completing a faster run replaces the personal best, eight cumulative splits and sampled ghost in localStorage for this browser and origin. Clearing site storage resets the record.

## Implementation

- **level.js** builds the course, batches static city geometry, loads licensed models and material maps, and sets up sky and lighting.
- **player.js** handles fixed 120 Hz movement, vertical clearance, collisions, traversal states and the camera.
- **game.js** handles input, rendering, race timing, checkpoints, storage, menus and results.
- **actors.js** animates first-person gloves, the skinned ghost and particles.
- **audio.js** synthesizes wind, city ambience, footfalls, traversal cues and a layered musical pulse.

The controller uses a fixed-width player footprint with axis-separated box collisions. Mantles and vaults use short authored movement curves. The ghost interpolates recorded poses at roughly 10 Hz. First-person gloves have their own camera-space animation. The district outside the route uses repeated modular building components. The title artwork is a separate illustration.

Source links and licences are in [assets/CREDITS.md](assets/CREDITS.md).
