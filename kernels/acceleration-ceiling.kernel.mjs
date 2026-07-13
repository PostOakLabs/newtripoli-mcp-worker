// nt_acceleration_ceiling — buildplan 2.1, NEWTRIPOLI-L2-SIMLIFT-SPEC.md §1.
// Register: feasibility. Guest-legal: YES — average/multiply/compare only; zk-provable in §18.
//
// Lifts acceleration-ceiling.html render(). Uses the canon augmentation ids (vat/sensory/
// metabolic/synaptic/hybrid/upload) — NOT the sim's stale "bio" fallback key.

const BRAIN_W = 20; // canon.js: feasibility.brainWatts — thermal load = 20 W × mid acceleration

// Full stage table, vendored verbatim (id + floor + ceiling only; bottleneck string kept for output).
// canon.js: feasibility.augmentation[].{id,floor,ceiling,bottleneck}
const AUGMENTATION = [
  { id: "vat",       floor: 1.5,  ceiling: 2,          bottleneck: "Sleep elimination + metabolic optimization only. Tissue still rate-limits everything." },
  { id: "sensory",   floor: 2,    ceiling: 4,          bottleneck: "Retina/optic-nerve & cochlear bypass; the bottleneck shifts inward to the cortex." },
  { id: "metabolic", floor: 3,    ceiling: 6,          bottleneck: "Active heat extraction + external neurotransmitter supply, before thermal/synaptic limits bite." },
  { id: "synaptic",  floor: 10,   ceiling: 50,         bottleneck: "Key circuits' chemical synapses replaced with electronic/photonic equivalents (speculative)." },
  { id: "hybrid",    floor: 50,   ceiling: 5000,       bottleneck: "Cortex largely silicon/photonic; identity-continuity of the biological 'self' core becomes the open question." },
  { id: "upload",    floor: 5000, ceiling: 1000000000, bottleneck: "Substrate-speed ceiling — but is this still the same brain? Identity continuity is acute." },
];

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const st = AUGMENTATION.find((a) => a.id === p.stage) || AUGMENTATION[0];
  const lo = st.floor, hi = st.ceiling;
  const mid = (lo + hi) / 2;
  const output_payload = {
    ceiling_floor_x:      lo,
    ceiling_x:            hi,
    mid_x:                mid,
    thermal_load_w:       mid > 1000 ? null : BRAIN_W * mid, // sim: 'n/a (non-biological)' above 1000×
    subjective_yr_at_mid: p.wall_clock_yr * mid,
    bottleneck:           st.bottleneck,
  };
  return { output_payload };
}
