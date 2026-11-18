const shapes = {
  lungs:
    '<path d="M10.5 3v7l-3 3m6-10v7l3 3M8.4 6C6 5 2 13 2 18c0 2 1 3 3 2l4-2c1.2-.6 1.5-2 1.5-4V8m5.1-2c2.4-1 6.4 7 6.4 12 0 2-1 3-3 2l-4-2c-1.2-.6-1.5-2-1.5-4V8"/>',
  pulse: '<path d="M2 12h4l3-8 5 16 3-9 2 1h3"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  mute: '<path d="M3 9h4l5-4v14l-5-4H3zM16 9l5 6m0-6-5 6"/>',
  sound: '<path d="M3 9h4l5-4v14l-5-4H3zM16 8q4 4 0 8m3-11q7 7 0 14"/>',
  pause: '<path stroke-width="2.6" d="M8 5v14m8-14v14"/>',
  play: '<path d="m7 4 12 8-12 8z"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v4"/>',
  layers: '<path d="m2 8 10-5 10 5-10 5zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  sliders:
    '<path d="M3 6h6m5 0h7M3 17h11m5 0h2"/><circle cx="11.5" cy="6" r="2.5"/><circle cx="16.5" cy="17" r="2.5"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
  book: '<path d="M2 4q5-1 10 2 5-3 10-2v15q-5-1-10 2-5-3-10-2zM12 6v15"/>',
  airways:
    '<path d="M11 2v8l-6 5v6m8-19v8l6 5v6M5 15l-3-1m17 1 3-1m-12-2 1 5-3 3m6-8-1 5 3 3"/>',
  alveolus:
    '<circle cx="12" cy="7" r="4"/><circle cx="7" cy="15" r="4"/><circle cx="17" cy="15" r="4"/>',
  rest: '<path d="M20 4c0 12-5 16-11 14-6-2-5-8 0-10 4-2 6-1 11-4zM4 21l11-11"/>',
  exercise:
    '<circle cx="15" cy="4" r="2"/><path d="m5 11 4-4 4 1 3 5h5M12 9l-4 6 5 3-2 4m-4-8-2 5H1"/>',
  altitude: '<path d="m1 20 8-13 4 6 3-9 7 16zM6 12l3 2 2-3"/>',
  asthma:
    '<path d="M2 7h12c4 0 4-5 1-5M2 12h17c4 0 4 5 1 5M2 17h9c4 0 4 5 0 5"/>',
  smoker: '<path d="M2 14h18v5H2zM16 14v5m3-8c3-4-3-4-1-8m-3 8c2-3-3-4-2-6"/>',
  drop: '<path d="M12 2s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13z"/>',
  wave: '<path d="M2 14q3 0 4-7t5 4 5 1 6-4"/>',
  heart:
    '<path d="M12 21S2 14 2 8c0-5 6-7 10-2 4-5 10-3 10 2 0 6-10 13-10 13z"/>',
};
export const icon = (k) =>
  '<svg viewBox="0 0 24 24" aria-hidden="true">' + shapes[k] + "</svg>";
const dict = {
  atlas: ["Respiratory Atlas", "أطلس الجهاز التنفسي"],
  kicker: ["INTERACTIVE EXHIBIT", "معرض تفاعلي"],
  title: ["The breathing lung", "الرئة وهي تتنفس"],
  sub: [
    "Explore the anatomy, mechanics, and microscopic exchange behind every breath.",
    "استكشف التشريح وآلية التنفس وتبادل الغازات المجهري مع كل نفس.",
  ],
  pause: ["Pause simulation", "إيقاف المحاكاة"],
  play: ["Resume simulation", "استئناف المحاكاة"],
  muted: ["Sound off", "الصوت مغلق"],
  sound: ["Sound on", "الصوت مفعّل"],
  viewport: ["3D VIEWPORT", "المشهد ثلاثي الأبعاد"],
  hint: [
    "Drag to rotate · Scroll to zoom · Click to inspect",
    "اسحب للتدوير · مرّر للتكبير · انقر للاستكشاف",
  ],
  body: ["Body", "الجسم"],
  airways: ["Airways", "المجاري الهوائية"],
  alveolus: ["Alveolus", "الحويصلة"],
  scenarios: ["Breathing scenarios", "سيناريوهات التنفس"],
  phys: ["Live physiology", "المؤشرات الفسيولوجية"],
  volume: ["Lung volume", "حجم الرئة"],
  now: ["Now", "الآن"],
  controls: ["Breathing controls", "التحكم بالتنفس"],
  rate: ["Breathing rate", "معدل التنفس"],
  depth: ["Breath depth", "عمق النفس"],
  facts: ["Anatomy notes", "معلومات تشريحية"],
  fact1: [
    "Human lungs contain roughly 300–500 million alveoli.",
    "تحتوي الرئتان على نحو ٣٠٠–٥٠٠ مليون حويصلة هوائية.",
  ],
  fact2: [
    "Gas exchange spans a surface of about 70 m².",
    "تبلغ مساحة سطح تبادل الغازات نحو ٧٠ م².",
  ],
  rest: ["Rest", "الراحة"],
  exercise: ["Exercise", "التمرين"],
  altitude: ["High altitude", "المرتفعات"],
  asthma: ["Asthma", "الربو"],
  smoker: ["Smoker’s lungs", "رئة المدخّن"],
  restD: [
    "Quiet breathing at sea level, with a relaxed diaphragm during exhalation.",
    "تنفس هادئ عند مستوى سطح البحر مع ارتخاء الحجاب الحاجز أثناء الزفير.",
  ],
  exerciseD: [
    "Faster, deeper breaths meet the increased oxygen demand of working muscles.",
    "يلبّي التنفس الأسرع والأعمق حاجة العضلات العاملة إلى الأكسجين.",
  ],
  altitudeD: [
    "At about 3,000 m, lower oxygen partial pressure stimulates faster breathing.",
    "على ارتفاع نحو ٣٠٠٠ م، يحفّز انخفاض الضغط الجزئي للأكسجين التنفس الأسرع.",
  ],
  asthmaD: [
    "Narrowed conducting airways resist flow and prolong exhalation.",
    "تزيد المجاري الهوائية المتضيّقة مقاومة تدفق الهواء وتطيل الزفير.",
  ],
  smokerD: [
    "This emphysema example shows air trapping and loss of gas-exchange surface.",
    "يوضح مثال النفاخ الرئوي احتباس الهواء وتناقص سطح تبادل الغازات.",
  ],
  tidal: ["Tidal volume", "الحجم الجاري"],
  minute: ["Minute ventilation", "التهوية الدقيقة"],
  sat: ["Oxygen saturation", "تشبّع الأكسجين"],
  live: ["LIVE", "مباشر"],
  paused: ["PAUSED", "متوقف"],
  inhale: ["↑ Inhaling", "↑ شهيق"],
  exhale: ["↓ Exhaling", "↓ زفير"],
  anterior: ["ANTERIOR VIEW", "منظر أمامي"],
  orbit: ["ORBIT VIEW", "منظر مداري"],
  micro: ["MICROSCOPIC VIEW", "منظر مجهري"],
  tree: ["BRONCHIAL TREE", "الشجرة القصبية"],
  bpm: ["bpm", "نفس/د"],
  ml: ["mL", "مل"],
  lpm: ["L/min", "ل/د"],
  expand: ["Expand view", "توسيع المشهد"],
  reset: ["Reset breathing controls", "إعادة ضبط التنفس"],
  close: ["Close detail", "إغلاق التفاصيل"],
  trachea: ["Trachea", "القصبة الهوائية"],
  tracheaD: [
    "Cartilage rings keep the windpipe open as it conducts air to the bronchi.",
    "تحافظ الحلقات الغضروفية على انفتاح القصبة أثناء مرور الهواء إلى الشعبتين.",
  ],
  right: ["Right lung", "الرئة اليمنى"],
  left: ["Left lung", "الرئة اليسرى"],
  rightD: [
    "The right lung has upper, middle, and lower lobes separated by two fissures.",
    "تضم الرئة اليمنى ثلاثة فصوص يفصل بينها شقّان.",
  ],
  leftD: [
    "The left lung has two lobes and a cardiac notch that accommodates the heart.",
    "تضم الرئة اليسرى فصّين وثلمة قلبية تستوعب القلب.",
  ],
  diaphragm: ["Diaphragm", "الحجاب الحاجز"],
  diaphragmD: [
    "This domed muscle contracts and descends to increase chest volume on inspiration.",
    "تنقبض هذه العضلة المقببة وتهبط لزيادة حجم الصدر أثناء الشهيق.",
  ],
  ribs: ["Rib cage", "القفص الصدري"],
  ribsD: [
    "The ribs lift and swing outward during inspiration to expand the chest.",
    "ترتفع الأضلاع وتتجه للخارج أثناء الشهيق لتوسيع الصدر.",
  ],
  spine: ["Thoracic spine", "العمود الفقري الصدري"],
  spineD: [
    "Twelve thoracic vertebrae support the chest and articulate with the ribs.",
    "تدعم اثنتا عشرة فقرة صدرية الصدر وتتصل بالأضلاع.",
  ],
  heart: ["Heart", "القلب"],
  heartD: [
    "The right ventricle pumps blood to the lungs and the left receives oxygenated blood via the left atrium.",
    "يضخ البطين الأيمن الدم إلى الرئتين ويستقبل البطين الأيسر الدم المؤكسج عبر الأذين الأيسر.",
  ],
  bronchi: ["Main bronchi", "الشعبتان الرئيسيتان"],
  bronchiD: [
    "The trachea splits into two main bronchi, one entering each lung.",
    "تنقسم القصبة إلى شعبتين رئيسيتين تدخل كل منهما إحدى الرئتين.",
  ],
  airwaysD: [
    "Repeated branching distributes air to progressively smaller regions of each lung.",
    "يوزّع التفرع المتكرر الهواء إلى مناطق أصغر في كل رئة.",
  ],
  alveolusD: [
    "A thin alveolar wall lets oxygen diffuse into blood and carbon dioxide diffuse into the air sac.",
    "يسمح جدار الحويصلة الرقيق بانتشار الأكسجين إلى الدم وثاني أكسيد الكربون إلى الحويصلة.",
  ],
  cap: ["Capillary", "شعيرة دموية"],
  capD: [
    "Blood flows along the alveolar wall, gaining oxygen and releasing carbon dioxide.",
    "يسري الدم بمحاذاة الحويصلة فيكتسب الأكسجين ويحرّر ثاني أكسيد الكربون.",
  ],
  oxy: ["O₂ → blood", "الأكسجين ← إلى الدم"],
  co2: ["CO₂ → air sac", "ثاني أكسيد الكربون ← إلى الحويصلة"],
  cell: ["Red blood cell", "كرية دم حمراء"],
  cellD: [
    "Haemoglobin in a red blood cell binds oxygen as the cell passes an alveolus.",
    "يرتبط الهيموغلوبين بالأكسجين أثناء مرور الكرية الحمراء بالحويصلة.",
  ],
  skin: ["Thoracic wall", "جدار الصدر"],
  skinD: [
    "The translucent chest surface shows how the lungs sit inside the torso.",
    "يوضح سطح الصدر الشفاف موضع الرئتين داخل الجذع.",
  ],
};
for (const [k, en, ar] of [
  ["ru", "Right upper lobe", "الفص الأيمن العلوي"],
  ["rm", "Right middle lobe", "الفص الأيمن الأوسط"],
  ["rl", "Right lower lobe", "الفص الأيمن السفلي"],
  ["lu", "Left upper lobe", "الفص الأيسر العلوي"],
  ["ll", "Left lower lobe", "الفص الأيسر السفلي"],
]) {
  dict[k] = [en, ar];
  dict[k + "D"] = dict[(k[0] === "r" ? "right" : "left") + "D"];
}
export const t = (k, ar = false) => dict[k]?.[ar ? 1 : 0] || k;
