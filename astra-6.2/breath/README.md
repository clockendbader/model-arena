# Pulmo · Respiratory Atlas

An interactive, bilingual respiratory exhibit for a WebGL 2 browser. From inside the `breath/` folder, run one command.

```sh
python3 -m http.server 8147 --bind 127.0.0.1
```

Open [the exhibit on localhost](http://localhost:8147). The project includes its anatomy, Three.js r169, and required addons locally. It needs no build, API key, or internet connection.

## Explore

Drag to orbit, scroll or pinch to zoom, and right-drag or two-finger drag to pan. Click a structure or its label for an explanation. Use **Body**, **Airways**, and **Alveolus** to change scale. The top controls switch language, pause the breathing cycle, or enable synthesized breathing audio. The reset arrow restores the current scenario’s breathing controls.

## Physiology

Minute ventilation equals respiratory rate × tidal volume. At rest, 14 breaths/min × 0.50 L gives 7.0 L/min. The graph starts with 15 seconds of the resting waveform and then records the simulated lung volume, including the air remaining after a quiet exhalation. Inspiration uses a smooth contracting phase followed by a longer passive recoil. Presets represent illustrative adult conditions.

| Scenario | Rate (breaths/min) | Tidal volume (mL) | Example SpO₂ |
| --- | ---: | ---: | ---: |
| Rest | 14 | 500 | 98% |
| Exercise | 28 | 1400 | 97% |
| High altitude | 21 | 620 | 91% |
| Asthma | 22 | 420 | 94% |
| Smoker’s lungs | 20 | 460 | 93% |

The altitude preset represents roughly 3,000 m. Lower barometric pressure reduces inspired oxygen partial pressure while oxygen remains approximately 21% of ambient air. The asthma preset constricts the procedural branch lumens and prolongs expiration. The smoking preset represents one emphysema phenotype, with a higher end-expiratory volume and reduced functioning exchange area.

## Representation

- BodyParts3D provides 18 parenchymal segment meshes grouped into five lobes, central airways, thoracic vertebrae, ribs, sternum, costal cartilages, clavicles, cropped skin, diaphragm, and heart context.
- The distal bronchial tree samples targets from each lobe and branches recursively through seven additional bifurcations. Beyond the displayed airways, the camera bridges intervening generations to a magnified cluster of alveoli.
- Breathing motion uses coordinated anatomical deformation. Regional compliance, pleural mechanics, blood chemistry, and patient-specific disease progression are simplified. SpO₂ is a scenario reference value. Rate and depth determine ventilation independently.
- The microscopic view exaggerates membrane thickness, particle size, and transport speed. Gas particles illustrate net diffusion. Oxygen travels into blood, carbon dioxide into the airspace, and red cells brighten as their haemoglobin oxygenates. The capillary network and darkened smoking tissue are illustrative.
- Breathing sound is filtered noise shaped by instantaneous airflow. It starts muted.

See [asset credits](assets/CREDITS.md) and the [source mesh inventory](assets/anatomy-manifest.tsv).

## Physiology references

- Quiet tidal volume and mechanics of ventilation. [OpenStax, The Process of Breathing](https://openstax.org/books/anatomy-and-physiology/pages/22-3-the-process-of-breathing)
- Adult alveolar count varies considerably. Ochs et al. found a mean of 480 million in six adult lungs. [The number of alveoli in the human lung](https://pubmed.ncbi.nlm.nih.gov/14512270/)
- Earlier morphometry estimated around 300 million alveoli. [Weibel and Gomez, Architecture of the human lung](https://pubmed.ncbi.nlm.nih.gov/14005590/)
- Surface area depends on inflation and measurement method. A representative educational estimate is 70 m². [Environmental Health Perspectives](https://ehp.niehs.nih.gov/doi/epdf/10.1289/ehp.7720113)
