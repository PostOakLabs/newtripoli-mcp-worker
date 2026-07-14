// ch_stadium_capacity kernel — NEWTRIPOLI-ALTHIST-CHAINS-SPEC.md §5.
// Register: alt-history. guest-legal: NO — Math.cos irradiance of runtime latitude; hash-verifiable only, NOT zk-provable §18.
//
// Contract (HASHWIRE-SPEC §5): compute(policy_parameters) -> { output_payload }.
// Reads only policy_parameters.input_parameters. NEVER hashes, NEVER builds the envelope.
//
// Geometry over physical constants: population/irradiance → substrate footprint + panel area,
// fits_single_stadium. Iconic book-1 image; least prose-dependent NT row (TRIAGE 5-table).
// The honest tension: substrate footprint fits a stadium while the matching power supply needs a
// desert. Calibration figures are ILLUSTRATIVE/TUNABLE parameters cited to the documented record.

// Vendored from data/canon.js — byte-equal citation values.
const ST_GHI_EQUATOR   = 5;      // canon.js: altHistory.stadium.ghiEquatorKwh — GHI ≈ 5·cos(lat) kWh/m²/day (ENHANCEMENTS §7)
const ST_LATITUDE      = 45;     // canon.js: altHistory.stadium.latitudeDeg — mid-lat default (Russia-2024 stadium order)
const ST_POWER_PER_CAP = 20;     // canon.js: altHistory.stadium.powerPerCapitaW — W per hosted mind
const ST_PANEL_EFF     = 0.22;   // canon.js: altHistory.stadium.panelEfficiency — modern PV
const ST_STADIUM_AREA  = 200000; // canon.js: altHistory.stadium.stadiumAreaM2 — large-stadium footprint incl. grounds
const ST_AREA_PER_CAP  = 1e-6;   // canon.js: altHistory.stadium.areaPerCapitaM2 — substrate footprint per mind
const HUMANS           = 8.1e9;  // canon.js: population.humans — default hosted population

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const latRad          = p.latitude * Math.PI / 180;
  const ghi_kwh_m2_day  = ST_GHI_EQUATOR * Math.cos(latRad);            // GHI ≈ 5·cos(lat)
  const irradiance_w_m2 = ghi_kwh_m2_day * 1000 / 24;                   // avg W/m² over 24 h
  const total_power_w   = p.population * p.power_per_capita_w;
  const panel_w_per_m2  = irradiance_w_m2 * p.panel_efficiency;
  const panel_area_m2   = total_power_w / panel_w_per_m2;
  const footprint_m2    = p.population * p.area_per_capita_m2;          // physical substrate footprint
  const fits            = footprint_m2 <= p.stadium_area_m2;
  const stadiums_required = Math.ceil(footprint_m2 / p.stadium_area_m2);
  const output_payload = {
    irradiance_w_m2:     Math.round(irradiance_w_m2 * 100) / 100,       // 2-dp deterministic
    footprint_m2:        String(Math.round(footprint_m2)),             // I-JSON: pop·area can exceed 2^53
    panel_area_m2:       String(Math.round(panel_area_m2)),            // I-JSON: can exceed 2^53
    total_power_w:       String(Math.round(total_power_w)),            // I-JSON: pop·power can exceed 2^53
    fits_single_stadium: fits,                                         // bool — the iconic claim
    stadiums_required,                                                 // int
    verdict: fits ? 'FITS A SINGLE STADIUM' : (stadiums_required + ' STADIUMS'),
  };
  return { output_payload };
}
