# Breath — The breathing body

An interactive browser exhibit about how the chest moves air and how the lungs exchange gases. The project includes its own 3D models, fonts, and Three.js 0.180.0.

## Run

From inside `breath/`, run:

```sh
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in a browser with WebGL 2 enabled.

## Explore

- **Body** shows the five lung lobes, heart, trachea, bronchi, rib cage, spine, and diaphragm inside a translucent upper body.
- **Airways** reveals eight branching generations beyond the trachea. The camera moves toward a branch as it enters the airway view.
- **Alveolus** follows a distal airway and magnifies one acinus. Red particles show oxygen entering the blood, while blue particles show carbon dioxide entering the alveolar air. Red blood cells brighten as they bind oxygen.
- Drag to orbit, scroll to zoom, and right-drag to pan. On touch screens, pinch to zoom and drag with two fingers to pan. Click a structure or label to inspect it.
- The five scenarios set example breathing rates and tidal volumes. The sliders can override either. Use the phase-card button to pause, the top bar to enable synthesized breathing audio, or the language button to switch between English and right-to-left Arabic.

## Physiology and scope

The rest preset uses 14 breaths per minute, 500 mL per breath, 7.0 L/min of minute ventilation, and an illustrative SpO₂ of 98%. Minute ventilation is calculated from breathing rate × tidal volume. The graph shows estimated total lung air volume, using a scenario-specific end-expiratory baseline plus the volume of the current breath. After the opening waveform, it plots the last 12 seconds of simulated respiration. Quiet exhalation follows a longer, passive recoil curve. [Resting breathing and tidal volume](https://www.ncbi.nlm.nih.gov/books/NBK482502/) · [FDA on pulse oximetry](https://www.fda.gov/consumers/consumer-updates/pulse-oximeter-basics)

At 3,050 m, the oxygen fraction remains near 21%, while the lower barometric pressure reduces inspired oxygen partial pressure to about 69% of its sea-level value. The altitude preset uses 90% saturation. The asthma example lengthens exhalation and reduces airway caliber. The smoker’s-lungs example depicts smoking-related emphysema with reduced exchange area and air trapping. [CDC Yellow Book on altitude](https://www.cdc.gov/yellow-book/hcp/environmental-hazards-risks/high-altitude-travel-and-altitude-illness.html) · [Expiratory airflow limitation](https://pmc.ncbi.nlm.nih.gov/articles/PMC3625607/) · [Small airways degeneration in COPD](https://pmc.ncbi.nlm.nih.gov/articles/PMC3540907/)

The anatomical meshes describe one adult reference body. Lung expansion, rib movement, and diaphragmatic flattening use approximate deformations. The distal tree compresses the full series of airway generations, and the acinus, capillaries, blood cells, and gas particles are enlarged and animated schematically. The gas and blood-cell animations show direction and uptake, with preset-based oxygenation and perfusion. They are qualitative rather than a quantitative model of diffusion, pulse oximetry, or individual disease progression. [Adult airway and acinar morphology](https://pmc.ncbi.nlm.nih.gov/articles/PMC3926130/) · [Human alveolar counts](https://pubmed.ncbi.nlm.nih.gov/14512270/) · [Exchange surface at resting lung volume](https://pmc.ncbi.nlm.nih.gov/articles/PMC4525672/)

See [asset credits and license details](assets/CREDITS.md).
