export const uiCatalogue = [
  {
    slug: "rc-column",
    name: "RC Column",
    group: "Concrete",
    pilot: true,
  },
  {
    slug: "rc-beam",
    name: "RC Beam",
    group: "Concrete",
    pilot: false,
  },
  {
    slug: "stairs",
    name: "Stairs",
    group: "Concrete",
    pilot: true,
  },
  {
    slug: "steel-deck",
    name: "Steel Deck Designer",
    group: "Concrete",
    pilot: false,
  },
  {
    slug: "shear-wall",
    name: "Shear Wall Designer",
    group: "Concrete",
    pilot: false,
  },
  {
    slug: "slab",
    name: "Slab Design",
    group: "Concrete",
    pilot: true,
  },
  {
    slug: "retaining-wall",
    name: "Concrete Retaining Wall",
    group: "Concrete",
    pilot: false,
  },
  {
    slug: "shallow-foundation",
    name: "Shallow Foundation",
    group: "Concrete",
    pilot: false,
  },
  {
    slug: "pile-cap",
    name: "Pile Cap",
    group: "Concrete",
    pilot: false,
  },
  {
    slug: "driven-pile",
    name: "Pre-stress Driven Pile",
    group: "Concrete",
    pilot: false,
  },
  {
    slug: "bored-pile",
    name: "Bored Pile",
    group: "Concrete",
    pilot: false,
  },
  {
    slug: "gravity-loads",
    name: "Gravity Load Planner",
    group: "LOADS",
    pilot: false,
  },
  {
    slug: "load-combinations",
    name: "Load Combination Planner",
    group: "LOADS",
    pilot: false,
  },
  {
    slug: "seismic-loads",
    name: "Seismic Loads",
    group: "LOADS",
    pilot: false,
  },
  {
    slug: "wind-loads",
    name: "Wind Loads",
    group: "LOADS",
    pilot: false,
  },
  {
    slug: "steel-column",
    name: "Steel Column",
    group: "Steel",
    pilot: true,
  },
  {
    slug: "steel-beam",
    name: "Steel Beam",
    group: "Steel",
    pilot: false,
  },
  {
    slug: "base-plate",
    name: "Base Plate",
    group: "Steel",
    pilot: true,
  },
  {
    slug: "purlins",
    name: "Purlins",
    group: "Steel",
    pilot: false,
  },
  {
    slug: "soil-bearing-capacity",
    name: "Soil Bearing Capacity",
    group: "Geotechnical",
    pilot: true,
  },
  {
    slug: "pile-bearing-capacity",
    name: "Pile Bearing Capacity",
    group: "Geotechnical",
    pilot: false,
  },
  {
    slug: "settlement",
    name: "Settlement Analysis",
    group: "Geotechnical",
    pilot: false,
  },
  {
    slug: "slope-stability",
    name: "Slope Stability Analysis",
    group: "Geotechnical",
    pilot: false,
  },
  {
    slug: "liquefaction",
    name: "Liquefaction Analysis",
    group: "Geotechnical",
    pilot: false,
  },
  {
    slug: "riprap",
    name: "Riprap",
    group: "Geotechnical",
    pilot: false,
  },
] as const;
export type UiModule = (typeof uiCatalogue)[number];

/**
 * Trade → sub-level structure shared by the launcher catalogue and the project
 * explorer. Keep this system: Structural (Concrete, Loads, Steel) and
 * Geotechnical (Foundation & soil). `group` is the UiModule.group key.
 */
export const uiTrades = [
  {
    trade: "Structural",
    subs: [
      { group: "Concrete", label: "Concrete" },
      { group: "LOADS", label: "Loads" },
      { group: "Steel", label: "Steel" },
    ],
  },
  {
    trade: "Geotechnical",
    subs: [{ group: "Geotechnical", label: "Foundation & soil" }],
  },
] as const;
