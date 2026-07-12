/*
  canon.js — Single source of truth for New Tripoli / Cognitive Husbandry sim figures.
  Companion data for the CH Sim Catalogue (ch-sims/).
  Numbers are sourced to the world bible — do not hardcode these in tool files; import here.

  Sources:
    Canon - New Tripoli.md §18 (Time Dilation), §9 (Maintenance / Universal Sabbath),
    §30 (New Centauri — contact-list problem), §5 (population), §13 (apes).
  Code: MIT  ·  Content: CC BY 4.0  ·  Data: CC0 1.0
*/
"use strict";

const CH_CANON = {
  // ── Canon version (hash input; see NEWTRIPOLI-MCP-SPEC §2/§9.1) ────────────
  // Bump when any figure below changes. Read by provenance.html (falls back to
  // this literal if absent) and vendored into the MCP worker as a hash preimage field.
  CANON_VERSION: "2026.07.12",
  version: "2026.07.12",   // mirror for provenance.html:141 (C.version) compat

  // ── Series dilation ceilings and reset cadence (§18) ──────────────────────
  // resetMonths: real-time months between maintenance windows ("Universal Sabbath", §9)
  series: [
    { id: "tripoli",   name: "New Tripoli",   calendarYears: "0–4",   ceiling: 50,            resetMonths: 6,  note: "Initial absorption. Doubling schedule 2×→50×. 25 simulated years per 6-month block." },
    { id: "ganymede",  name: "New Ganymede",  calendarYears: "4–8",   ceiling: 100,           resetMonths: 12, note: "Cube geometry; home teleporters by default; annual reset." },
    { id: "pluto",     name: "New Pluto",     calendarYears: "8–12",  ceiling: 51200,         resetMonths: 6,  note: "Begins 200×, doubling every 6 months toward 50,000×+." },
    { id: "centauri",  name: "New Centauri",  calendarYears: "12–16", ceiling: 1000000,       resetMonths: 12, note: "Contact-list problem. Religion near zero." },
    { id: "andromeda", name: "New Andromeda", calendarYears: "16–20", ceiling: 1000000000,    resetMonths: 12, note: "Permanent HSS fusion. Four years at this rate yields minds as old as the planet." }
  ],

  // New Tripoli opt-in doubling schedule (§18). Offered each 6-month maintenance window.
  // Doubles from 2× up to the 50× ceiling (final step capped, not 64×).
  tripoliDoublingSchedule: [2, 4, 8, 16, 32, 50],

  // New Pluto doubling schedule (§4 / §18): 200× doubling every 6 months across ~8 cycles.
  plutoDoublingSchedule: [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200],

  // Max coherent simulated-story length per 6-month Tripoli block (§18):
  // 50× ceiling × 0.5 yr real = 25 simulated years. Used by birthday-sacrifice.
  simYearsPerBlock: 25,

  // ── Social / cognitive caps (§30) ─────────────────────────────────────────
  // Used by the contact-list panel to contextualize how dilation explodes acquaintance counts.
  socialCaps: {
    dunbar: 150,              // stable social relationships
    bernardKillworthLow: 230, // estimated total network size (low)
    bernardKillworthHigh: 290,// estimated total network size (high)
    lifetimeAcquaintance: 600 // ~people meaningfully met in a pre-Blip lifetime
  },

  // ── Population / world figures (§5, §13) — for catalogue context ───────────
  population: {
    humans: 8.1e9,            // ~8.1 billion humans
    apes: 825000,             // ~825,000 non-human great apes
    biologicalFraction: 0.10, // 10% biological substrate / 90% fully digital (§2 Neo Sequence, §26)
    apeDilationCeiling: 2,    // general ape limit, vs 50× human (§13)
    apeDilationException: 4   // a few dozen chimps opt into 4×
  },

  // ── Brain-in-a-Vat feasibility (CH "Technical Feasibility" napkin math) ─────
  feasibility: {
    brainWatts: 20,            // resting human brain power draw (~20 W)
    brainMassKg: 1.35,         // ~1.3–1.4 kg
    // Per the napkin math: ~40 W at 2x, ~100 W at 5x → metabolic load scales with speed.
    supportOverhead: 3,        // fridge-unit life-support + active cooling multiplier (assumption)
    digitalMindWatts: 50,      // "laptop-sized" compute unit per fully-digitized mind (assumption)
    lifespanYr: 122,           // demonstrated neuronal-lifespan ceiling, yr (Audit §4.8; Calment). upload_required threshold for nt_time_dilation.
    landauerJ: 3e-21,          // Landauer limit ≈ kT ln2 at 310 K (~2.97e-21 J/bit); digital-mind pricing floor (Audit §5).
    neurons: 8.6e10,           // ~86 billion neurons (interface-bandwidth denominator).
    neuralinkChannels: 1024,   // present-day BCI channel count (interface-bandwidth numerator).
    alphaFrameMs: 100,         // ~10 Hz alpha-band perceptual frame, ms (comms-lag frame budget).
    // Augmentation spectrum: realistic subjective-acceleration ceiling by how much
    // biological substrate is replaced, and the binding constraint at each stage (§ Feasibility).
    // SCHEMA (reconciled 2026-07-12, Build Plan §0.3): each stage carries a { floor, ceiling }
    //   acceleration RANGE. `ceiling` preserves the six canon single-value ceilings
    //   (2/4/6/50/5000/1e9); `floor` is the low end of the plausible range. The four biological
    //   stages take their floors from acceleration-ceiling.html's original ranges (bio 1.5–2,
    //   sensory 2–4, metabolic 3–6, synaptic 10–50); hybrid/upload chain monotonically from the
    //   prior ceiling. This is the single source for both the sim STAGES table and the
    //   nt_acceleration_ceiling kernel/hash preimage (ceiling_x_range = {floor, ceiling}).
    augmentation: [
      { id:"vat",      stage:"Pure biological vat",         floor:1.5, ceiling:2,          bottleneck:"Sleep elimination + metabolic optimization only. Tissue still rate-limits everything." },
      { id:"sensory",  stage:"Sensory interface augmented", floor:2,   ceiling:4,          bottleneck:"Retina/optic-nerve & cochlear bypass; the bottleneck shifts inward to the cortex." },
      { id:"metabolic",stage:"Metabolic support augmented", floor:3,   ceiling:6,          bottleneck:"Active heat extraction + external neurotransmitter supply, before thermal/synaptic limits bite." },
      { id:"synaptic", stage:"Synaptic augmentation",       floor:10,  ceiling:50,         bottleneck:"Key circuits' chemical synapses replaced with electronic/photonic equivalents (speculative)." },
      { id:"hybrid",   stage:"Hybrid cortex",               floor:50,  ceiling:5000,       bottleneck:"Cortex largely silicon/photonic; identity-continuity of the biological 'self' core becomes the open question." },
      { id:"upload",   stage:"Full emulation / upload",     floor:5000,ceiling:1000000000, bottleneck:"Substrate-speed ceiling — but is this still the same brain? Identity continuity is acute." }
    ],
    // Sahara solar (sourced: area ~9.2M km^2; ~2,500 kWh/m^2/yr; "~1.2% powers the world").
    saharaAreaM2: 9.2e12,                 // 9.2 million km^2
    saharaIrradianceKWhM2Yr: 2500,        // annual solar irradiance
    saharaYieldWPerM2: 25,                // avg continuous ELECTRICAL yield (~10% system efficiency)
    // → full-Sahara electrical capacity ≈ 9.2e12 * 25 = 2.3e14 W (230 TW);
    //   1.2% ≈ 2.76 TW ≈ world average electricity demand. Internally consistent.
    worldElectricityTW: 2.7
  },

  // ── Ring & housing geometry (§5) ────────────────────────────────────────
  housing: {
    ringRadiusKm: 750,
    ringCircumferenceKm: 4712,     // 2π·750
    residentialFloors: 12,         // ground floor is retail
    areaPerPersonM2: 70,           // ~750 sq ft solo occupant
    // canon capacity table (ring width → people housed)
    table: [[200,1.62e8],[500,4.04e8],[1000,8.1e8],[5000,4.0e9],[10000,8.1e9]],
    downtownCoreKm2: 40000,        // 677× Manhattan
    skyscraperResidents: 2e6,      // ALL buildings >150m worldwide, combined
    coreResidentsLow: 200e6, coreResidentsHigh: 400e6
  },

  // ── Synthetic body (§35 / §37) ──────────────────────────────────────────
  synthBody: {
    materials: {                   // skeleton material → density g/cm³
      osmium: 22.59, steel: 7.85, titanium: 4.5, aluminum: 2.70, carbonComposite: 1.6
    },
    canonMaterial: "osmium",
    totalMassLb: 450, totalMassKg: 204, avgHumanKg: 70,   // osmium build ≈ 3× human
    rechargeHours: 8, motionDaysPerCharge: 14,
    notes: "Osmium skeleton: 3× iron, 5× titanium. Brain irreparable in field; deep-structure damage needs precision fab that doesn't exist yet (§36)."
  },

  // ── ETI kinetic-probe delivery (Cognitive Husbandry) ──────────────────────
  probe: {
    distanceLyLow: 5000, distanceLyHigh: 10000,
    densityGcm3: 22.6,             // osmium-class
    diameterCm: 21.8,              // ~bowling ball
    massKg: 122,                   // ≈ sphere of that size at osmium density
    aiPersonalities: 100,          // §19 — 100+ AI personalities aboard
    vaporizationJPerKg: 4.5e6,     // osmium: ~4–5 MJ/kg total to vaporize (latent + heat-up + fusion). kinetic-probe margin.
    terminalVMs: 1000,             // ~1 km/s ordnance-scale terminal speed a shock-protected slug survives (deceleration-lottery gate).
    survives: ["terrestrial planet","moon","asteroid","dwarf planet"],
    destroys: ["gas giant","star"],
    branches: ["Grey Goo / Paperclip","Passive Surveillance","Cognitive Husbandry"]
  },

  // ── Selection Problem criterion fractions (CH "The Selection Problem") ─────
  // excl = fraction of 8.1B deleted if that criterion is required. Illustrative of
  // scale, not exact demographics. Single source for selection-sorter.html + nt_selection_cost.
  selection: {
    criteria: {
      all: 0, literacy: 0.15, education: 0.55, nocrime: 0.10, creative: 0.85,
      productive: 0.40, iq: 0.50, health: 0.16, wealth: 0.84, digital: 0.32,
      faith: 0.24, english: 0.81, adult: 0.26, nocriminal: 0.22, longevity: 0.999
    }
  },

  // ── Constants ─────────────────────────────────────────────────────────────
  YEAR_DAYS: 365.25,
  YEAR_HOURS: 8766,          // 365.25 * 24
  YEAR_SECONDS: 31557600     // 365.25 * 86400
};

if (typeof module !== "undefined" && module.exports) { module.exports = CH_CANON; }
