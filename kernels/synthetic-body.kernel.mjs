// nt_synthetic_body — buildplan 2.1, NEWTRIPOLI-L2-SIMLIFT-SPEC.md §5.
// Register: canon. guest-legal: YES — multiply/divide/compare only; zk-provable in §18.
// Lifts synthetic-body.html render().

const OSMIUM_D   = 22.59   // canon.js: synthBody.materials.osmium (g/cm³)
const STEEL_D    = 7.85    // canon.js: synthBody.materials.steel
const TITANIUM_D = 4.5     // canon.js: synthBody.materials.titanium
const ALUMINUM_D = 2.70    // canon.js: synthBody.materials.aluminum
const CARBON_D   = 1.6     // canon.js: synthBody.materials.carbonComposite
const OSMIUM_KG  = 204     // canon.js: synthBody.totalMassKg — canon osmium build mass
const HUMAN_KG   = 70      // canon.js: synthBody.avgHumanKg
const LB_PER_KG  = 2.2046  // real-science constant; unit conversion, not in canon.js
const MATERIAL_D = { osmium:OSMIUM_D, steel:STEEL_D, titanium:TITANIUM_D, aluminum:ALUMINUM_D, carbonComposite:CARBON_D };

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const density = MATERIAL_D[p.material];
  const mass_kg = OSMIUM_KG * (density / OSMIUM_D);
  const output_payload = {
    density_gcm3:       density,
    mass_kg,
    mass_lb:            mass_kg * LB_PER_KG,
    human_mass_ratio:   mass_kg / HUMAN_KG,
    heavier_than_human: mass_kg > HUMAN_KG,
    sinks_in_water:     density > 1,
  };
  return { output_payload };
}
