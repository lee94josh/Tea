export type TeaTypeKey =
  | "green"
  | "black"
  | "white"
  | "oolong"
  | "puerh"
  | "herbal"
  | "yellow";

export interface TeaFlavorNote {
  label: string;
  category:
    | "vegetal"
    | "floral"
    | "fruity"
    | "earthy"
    | "spicy"
    | "nutty"
    | "sweet"
    | "umami";
}

export interface BrewingGuide {
  tempRangeC: [number, number];
  steepTimeSec: [number, number];
  waterToLeaf: string;
  vessel: string;
  notes: string;
}

export interface TeaTypeEducation {
  key: TeaTypeKey;
  displayName: string;
  color: string;
  bgColor: string;
  tagline: string;
  originRegions: string[];
  caffeineLevel: "none" | "low" | "medium" | "high" | "very-high";
  oxidationLevel: string;
  flavorNotes: TeaFlavorNote[];
  brewing: BrewingGuide;
  healthHighlights: string[];
  famousVarieties: {
    name: string;
    origin: string;
    description: string;
  }[];
  funFact: string;
  processingSteps: string[];
}

export const TEA_EDUCATION: Record<TeaTypeKey, TeaTypeEducation> = {
  green: {
    key: "green",
    displayName: "Green Tea",
    color: "text-green-800",
    bgColor: "bg-green-100",
    tagline: "Unoxidized leaves preserving natural freshness and delicate flavors.",
    originRegions: ["China", "Japan", "Korea"],
    caffeineLevel: "medium",
    oxidationLevel: "0%",
    flavorNotes: [
      { label: "Grassy", category: "vegetal" },
      { label: "Umami", category: "umami" },
      { label: "Vegetal", category: "vegetal" },
      { label: "Nutty", category: "nutty" },
      { label: "Floral", category: "floral" },
      { label: "Sweet", category: "sweet" },
    ],
    brewing: {
      tempRangeC: [70, 80],
      steepTimeSec: [60, 180],
      waterToLeaf: "2g per 100ml",
      vessel: "Gaiwan, glass teapot, or kyusu",
      notes:
        "Never use boiling water — it scorches the leaves and creates bitterness. Multiple short infusions reveal different flavor layers.",
    },
    healthHighlights: [
      "Rich in EGCG, a potent antioxidant linked to cardiovascular health",
      "L-theanine promotes calm alertness without jitteriness",
      "May support metabolism and blood sugar regulation",
      "Lower caffeine than black tea — suitable for afternoon drinking",
    ],
    famousVarieties: [
      {
        name: "Dragonwell (Longjing)",
        origin: "Hangzhou, China",
        description: "Flat, sword-shaped leaves with a sweet, nutty, pan-fired character.",
      },
      {
        name: "Gyokuro",
        origin: "Uji, Japan",
        description: "Shade-grown 3 weeks before harvest, intensely umami and sweet.",
      },
      {
        name: "Sencha",
        origin: "Japan",
        description: "Japan's most common green tea — steamed, grassy, and refreshing.",
      },
      {
        name: "Gunpowder",
        origin: "Zhejiang, China",
        description: "Rolled into pellets, smoky and bold, used in Moroccan mint tea.",
      },
      {
        name: "Boseong",
        origin: "Korea",
        description: "Korean green tea with a delicate marine and sweet profile.",
      },
    ],
    funFact:
      "Gyokuro's shade-growing doubles its L-theanine content compared to standard green teas, making it one of the most calming teas despite its moderate caffeine.",
    processingSteps: [
      "Plucking young leaves and buds",
      "Immediate heat application — steaming (Japan) or pan-firing (China) — to halt oxidation",
      "Rolling or shaping the leaves",
      "Drying to reduce moisture to ~3%",
    ],
  },

  black: {
    key: "black",
    displayName: "Black Tea",
    color: "text-amber-900",
    bgColor: "bg-amber-100",
    tagline: "Fully oxidized leaves with bold, malty, and robust character.",
    originRegions: ["India", "Sri Lanka", "China", "Kenya"],
    caffeineLevel: "high",
    oxidationLevel: "100%",
    flavorNotes: [
      { label: "Malty", category: "earthy" },
      { label: "Brisk", category: "earthy" },
      { label: "Caramel", category: "sweet" },
      { label: "Fruity", category: "fruity" },
      { label: "Earthy", category: "earthy" },
      { label: "Spicy", category: "spicy" },
    ],
    brewing: {
      tempRangeC: [95, 100],
      steepTimeSec: [180, 300],
      waterToLeaf: "3g per 200ml",
      vessel: "Teapot or mug, pre-warmed",
      notes:
        "Use freshly boiled water for most varieties. Darjeeling first flush is more delicate — try 85–90°C. Milk and sugar are traditional with Assam and Ceylon styles.",
    },
    healthHighlights: [
      "High in theaflavins and thearubigins — oxidation-specific antioxidants",
      "May support gut health by promoting beneficial bacteria",
      "Linked to improved alertness and focus",
      "Can be consumed with milk without significant reduction in antioxidant uptake",
    ],
    famousVarieties: [
      {
        name: "Darjeeling First Flush",
        origin: "West Bengal, India",
        description: "Light, floral, and muscatel — often called the 'champagne of teas'.",
      },
      {
        name: "Assam TGFOP",
        origin: "Assam, India",
        description: "Full-bodied, malty, and bold — ideal with milk.",
      },
      {
        name: "Ceylon OP",
        origin: "Sri Lanka",
        description: "Brisk and bright with citrus notes — the base of many breakfast blends.",
      },
      {
        name: "Keemun",
        origin: "Qimen, China",
        description: "Winey and floral with hints of cocoa — used in English Breakfast blends.",
      },
      {
        name: "Dian Hong",
        origin: "Yunnan, China",
        description: "Golden-tipped, smooth, and naturally honey-sweet.",
      },
    ],
    funFact:
      "In China, black tea is called 'red tea' (红茶, hóngchá) because of the reddish color of the brewed liquid — not the leaf color.",
    processingSteps: [
      "Plucking leaves (typically 2 leaves and a bud)",
      "Withering — spreading leaves to reduce moisture 50–70%",
      "Rolling to break cell walls and initiate oxidation",
      "Full oxidation in a humid environment (3–5 hours)",
      "Firing/drying to halt oxidation and reduce moisture",
      "Sorting and grading by leaf size",
    ],
  },

  white: {
    key: "white",
    displayName: "White Tea",
    color: "text-stone-600",
    bgColor: "bg-stone-100",
    tagline: "Minimally processed buds and young leaves with delicate, sweet complexity.",
    originRegions: ["Fujian, China", "Darjeeling, India", "Sri Lanka"],
    caffeineLevel: "low",
    oxidationLevel: "0–5% (minimal natural)",
    flavorNotes: [
      { label: "Honey", category: "sweet" },
      { label: "Melon", category: "fruity" },
      { label: "Floral", category: "floral" },
      { label: "Hay", category: "vegetal" },
      { label: "Cucumber", category: "vegetal" },
    ],
    brewing: {
      tempRangeC: [75, 85],
      steepTimeSec: [120, 300],
      waterToLeaf: "3–5g per 150ml (leaves are bulky)",
      vessel: "Glass or porcelain teapot",
      notes:
        "White tea is very forgiving — longer steeps are fine and don't cause bitterness. Aged white tea (3+ years) benefits from slightly hotter water (90°C) to open up flavors.",
    },
    healthHighlights: [
      "Highest antioxidant content of any tea due to minimal processing",
      "Antibacterial properties studied for dental health",
      "Very low caffeine — suitable for evening drinking",
      "Silver Needle is considered therapeutic-grade in traditional Chinese medicine",
    ],
    famousVarieties: [
      {
        name: "Silver Needle (Baihao Yinzhen)",
        origin: "Fujian, China",
        description: "Only the finest silvery buds — delicate, sweet, and impossibly light.",
      },
      {
        name: "White Peony (Bai Mu Dan)",
        origin: "Fujian, China",
        description: "Buds plus two leaves — more body than Silver Needle, still very floral.",
      },
      {
        name: "Shou Mei",
        origin: "Fujian, China",
        description: "Older leaves, earthier and more robust — often aged intentionally.",
      },
    ],
    funFact:
      "White tea was historically reserved for Chinese emperors. The 'hair-like' white down on Silver Needle buds was a mark of the highest quality tribute tea.",
    processingSteps: [
      "Hand-plucking of buds (Silver Needle) or buds with young leaves",
      "Withering outdoors in sunlight or indoors in controlled humidity",
      "Gentle air-drying — no pan-firing, no rolling",
      "Optional: aging for 1–30+ years to develop deeper flavors",
    ],
  },

  oolong: {
    key: "oolong",
    displayName: "Oolong Tea",
    color: "text-orange-800",
    bgColor: "bg-orange-100",
    tagline: "The vast middle ground — partially oxidized for infinite variety.",
    originRegions: ["Fujian, China", "Taiwan", "Guangdong, China"],
    caffeineLevel: "medium",
    oxidationLevel: "15–85% (varies enormously by style)",
    flavorNotes: [
      { label: "Floral", category: "floral" },
      { label: "Fruity", category: "fruity" },
      { label: "Roasted", category: "earthy" },
      { label: "Creamy", category: "sweet" },
      { label: "Orchid", category: "floral" },
      { label: "Toasty", category: "nutty" },
    ],
    brewing: {
      tempRangeC: [85, 95],
      steepTimeSec: [30, 60],
      waterToLeaf: "5g per 100ml (gongfu style)",
      vessel: "Gaiwan or small clay teapot — gongfu method",
      notes:
        "Oolong demands the gongfu method: small vessel, high leaf-to-water ratio, many short infusions (5–10+). Lightly oxidized oolongs at 85°C; heavily roasted at 95°C.",
    },
    healthHighlights: [
      "Combines antioxidants found in both green and black tea",
      "Traditionally used in weight management — supports fat metabolism",
      "May help regulate blood sugar after meals",
      "Wu Yi Rock oolongs are studied for their unique mineral health compounds",
    ],
    famousVarieties: [
      {
        name: "Tie Guan Yin (Iron Goddess)",
        origin: "Anxi, Fujian, China",
        description: "Jade-style, floral and orchid-like with a lingering sweetness.",
      },
      {
        name: "Da Hong Pao (Big Red Robe)",
        origin: "Wuyi Mountains, Fujian",
        description: "Rock oolong — roasted, mineral, complex, historically legendary.",
      },
      {
        name: "High Mountain Ali Shan",
        origin: "Ali Shan, Taiwan",
        description: "High-altitude oolong with buttery, floral, and creamy sweetness.",
      },
      {
        name: "Oriental Beauty (Dong Fang Mei Ren)",
        origin: "Taiwan",
        description: "Insect-bitten leaves create unique honey and muscatel character.",
      },
      {
        name: "Phoenix Dan Cong",
        origin: "Chaozhou, Guangdong",
        description: "Single-bush oolongs with specific varietals: honey orchid, duck shit aroma, etc.",
      },
    ],
    funFact:
      "Oriental Beauty owes its distinctive honey-muscatel flavor to leafhoppers — tiny insects whose bites trigger a defense response that produces unique aromatic compounds.",
    processingSteps: [
      "Plucking (often specific varietals)",
      "Solar withering outdoors",
      "Indoor withering with intermittent tossing to bruise leaf edges",
      "Partial oxidation — stopped at the target % by heat",
      "Rolling (ball-style or strip-style depending on type)",
      "Roasting — light to heavy depending on style",
      "Repeat rolling/roasting cycles for some styles",
    ],
  },

  puerh: {
    key: "puerh",
    displayName: "Pu-erh Tea",
    color: "text-stone-800",
    bgColor: "bg-stone-200",
    tagline: "Aged and fermented — the world's only living tea that improves with time.",
    originRegions: ["Yunnan, China"],
    caffeineLevel: "medium",
    oxidationLevel: "Post-fermented (sheng: natural aging; shou: accelerated wet-piling)",
    flavorNotes: [
      { label: "Earthy", category: "earthy" },
      { label: "Mushroom", category: "earthy" },
      { label: "Leather", category: "earthy" },
      { label: "Camphor", category: "spicy" },
      { label: "Dark Fruit", category: "fruity" },
      { label: "Tobacco", category: "earthy" },
    ],
    brewing: {
      tempRangeC: [95, 100],
      steepTimeSec: [10, 30],
      waterToLeaf: "5–7g per 100ml",
      vessel: "Clay teapot (dedicated to pu-erh) or gaiwan",
      notes:
        "Always rinse pu-erh first (10–15 second rinse, discard). Gongfu method is essential. Aged sheng can give 20+ infusions. Shou is approachable immediately; sheng is better with 5–10+ years of aging.",
    },
    healthHighlights: [
      "Fermentation produces unique probiotics and beneficial microorganisms",
      "Traditionally used to aid digestion after heavy meals in Yunnan and Hong Kong",
      "May support cholesterol regulation — studied extensively in China",
      "Lovastatin found naturally in some aged pu-erh cakes",
    ],
    famousVarieties: [
      {
        name: "Sheng (Raw) Pu-erh",
        origin: "Yunnan, China",
        description: "Naturally aged — bright and bitter when young, mellowing to complex sweetness over decades.",
      },
      {
        name: "Shou (Ripe) Pu-erh",
        origin: "Yunnan, China",
        description: "Artificially fermented via wet-piling — earthy, smooth, and ready to drink immediately.",
      },
      {
        name: "Menghai Dayi 7542",
        origin: "Xishuangbanna, Yunnan",
        description: "The benchmark recipe for sheng pu-erh — widely collected and aged.",
      },
      {
        name: "Lao Cha Tou",
        origin: "Yunnan, China",
        description: "Nuggets of compressed leaves from shou production — super smooth and sweet.",
      },
    ],
    funFact:
      "Some pu-erh cakes from the 1950s–1970s now sell for tens of thousands of dollars. A 500g 'Red Mark' cake from the 1950s can exceed $30,000 USD at auction.",
    processingSteps: [
      "Plucking large-leaf Yunnan maocha (sun-dried green tea)",
      "Sun-withering and kill-green (sha qing)",
      "Rolling and sun-drying",
      "SHENG path: pressing into cakes, natural aging 5–50+ years",
      "SHOU path: wet-piling (wo dui) — 45–60 days of microbial fermentation",
      "Pressing into various shapes (bing/cake, tuo, brick)",
    ],
  },

  herbal: {
    key: "herbal",
    displayName: "Herbal & Tisane",
    color: "text-purple-800",
    bgColor: "bg-purple-100",
    tagline: "Caffeine-free infusions from flowers, roots, fruits, and herbs.",
    originRegions: ["Global — varies by plant"],
    caffeineLevel: "none",
    oxidationLevel: "N/A — not from Camellia sinensis",
    flavorNotes: [
      { label: "Floral", category: "floral" },
      { label: "Fruity", category: "fruity" },
      { label: "Herby", category: "vegetal" },
      { label: "Spicy", category: "spicy" },
      { label: "Sweet", category: "sweet" },
      { label: "Earthy", category: "earthy" },
    ],
    brewing: {
      tempRangeC: [95, 100],
      steepTimeSec: [300, 600],
      waterToLeaf: "2g per 200ml (varies greatly by plant)",
      vessel: "Any teapot or mug — cover while steeping",
      notes:
        "Herbal teas are very forgiving — over-steeping rarely causes bitterness. Cover your cup while steeping to preserve essential oils. Roots can be simmered rather than just steeped.",
    },
    healthHighlights: [
      "Chamomile: apigenin promotes relaxation and sleep quality",
      "Peppermint: menthol aids digestion and clears sinuses",
      "Hibiscus: high vitamin C, may lower blood pressure",
      "Rooibos: rich in aspalathin, an antioxidant unique to this plant",
      "Ginger: gingerols are powerful anti-inflammatory and anti-nausea compounds",
    ],
    famousVarieties: [
      {
        name: "Chamomile",
        origin: "Egypt, Germany",
        description: "Apple-scented flowers — calming and sleep-promoting.",
      },
      {
        name: "Peppermint",
        origin: "Global cultivation",
        description: "Cool, refreshing, and digestive — one of the most consumed herbal infusions.",
      },
      {
        name: "Rooibos",
        origin: "Cederberg, South Africa",
        description: "Naturally sweet and nutty, completely caffeine-free.",
      },
      {
        name: "Hibiscus (Roselle)",
        origin: "West Africa, Mexico",
        description: "Tart, cranberry-like, brilliant red — also called Agua de Jamaica.",
      },
      {
        name: "Yerba Mate",
        origin: "South America",
        description: "Contains caffeine (an exception) — grassy, earthy, energizing.",
      },
    ],
    funFact:
      "Technically, herbal 'teas' are not tea at all — true tea must come from Camellia sinensis. The correct term is 'tisane' (from the French), though 'herbal tea' is universally understood.",
    processingSteps: [
      "Varies entirely by plant — flowers may be dried fresh",
      "Roots are typically sliced and slow-dried",
      "Leaves may be wilted, dried, or freeze-dried",
      "Blending of multiple herbs is common for flavor balance",
    ],
  },

  yellow: {
    key: "yellow",
    displayName: "Yellow Tea",
    color: "text-yellow-800",
    bgColor: "bg-yellow-100",
    tagline: "China's rarest category — green tea with a gentle yellowing step for extra smoothness.",
    originRegions: ["Hunan, China", "Anhui, China", "Sichuan, China"],
    caffeineLevel: "medium",
    oxidationLevel: "0–10% (slight, from yellowing step)",
    flavorNotes: [
      { label: "Mellow", category: "sweet" },
      { label: "Sweet", category: "sweet" },
      { label: "Grassy", category: "vegetal" },
      { label: "Toasty", category: "nutty" },
      { label: "Clean", category: "vegetal" },
    ],
    brewing: {
      tempRangeC: [70, 80],
      steepTimeSec: [45, 120],
      waterToLeaf: "3g per 150ml",
      vessel: "Glass or porcelain — watching the leaves unfurl is part of the experience",
      notes:
        "Brew similarly to green tea but expect a mellower, rounder cup without grassiness. Yellow tea is exceptionally rare outside China.",
    },
    healthHighlights: [
      "Similar antioxidant profile to green tea with gentler processing",
      "The yellowing step may make polyphenols slightly more bioavailable",
      "Lower in astringency — digestively gentler than green tea",
    ],
    famousVarieties: [
      {
        name: "Jun Shan Yin Zhen",
        origin: "Dongting Lake, Hunan",
        description: "Silver needle style — one of China's Ten Famous Teas. Rare and expensive.",
      },
      {
        name: "Meng Ding Huang Ya",
        origin: "Ya'an, Sichuan",
        description: "Imperial yellow tea with ancient history — sweet and mellow.",
      },
      {
        name: "Huo Shan Huang Ya",
        origin: "Anhui",
        description: "More accessible yellow tea with pleasant toasty and sweet notes.",
      },
    ],
    funFact:
      "Yellow tea production nearly disappeared in the 20th century — the knowledge of the 'sealed yellowing' (men huan) step was held by very few families. It remains the rarest of the six true tea categories.",
    processingSteps: [
      "Plucking young buds similar to green or white tea",
      "Kill-green (sha qing) — light pan-firing to halt enzymatic activity",
      "Sealed yellowing (men huan) — wrapping warm leaves in cloth/paper for 24–72 hours",
      "Final drying",
    ],
  },
};

export const TEA_TYPE_KEYS = Object.keys(TEA_EDUCATION) as TeaTypeKey[];

export const CAFFEINE_LABELS: Record<TeaTypeEducation["caffeineLevel"], string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  "very-high": "Very High",
};

export const FLAVOR_CATEGORY_COLORS: Record<TeaFlavorNote["category"], string> = {
  vegetal: "bg-green-100 text-green-700",
  floral: "bg-pink-100 text-pink-700",
  fruity: "bg-orange-100 text-orange-700",
  earthy: "bg-stone-200 text-stone-700",
  spicy: "bg-red-100 text-red-700",
  nutty: "bg-amber-100 text-amber-700",
  sweet: "bg-yellow-100 text-yellow-700",
  umami: "bg-teal-100 text-teal-700",
};
