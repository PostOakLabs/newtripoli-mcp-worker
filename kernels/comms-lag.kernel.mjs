// nt_comms_lag — buildplan 2.1, NEWTRIPOLI-L2-SIMLIFT-SPEC.md §2.
// Register: canon + feasibility. Guest-legal: YES — rates taken directly; multiply/max/compare only. zk-provable in §18.
//
// Lifts comms-lag.html render(). The sim's pow/log10 are slider glue only
// (rate = round(10^slider)) — this kernel takes the rate directly as input, so that glue never enters.

const ALPHA_FRAME_MS   = 100;      // canon.js: feasibility.alphaFrameMs — ~10 Hz alpha perceptual frame, ms
const SERIES0_CEILING  = 50;       // canon.js: series[0].ceiling (New Tripoli) — default your_rate_x. §18
const CENTAURI_CEILING = 1000000;  // canon.js: series[3].ceiling (New Centauri) — default their_rate_x. §30

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const frame_pct    = p.latency_ms / ALPHA_FRAME_MS * 100;
  const round_trip_s = 2 * p.latency_ms / 1000;
  const your_wait_s  = round_trip_s * p.your_rate_x;
  const their_wait_s = round_trip_s * p.their_rate_x;
  const output_payload = {
    frame_pct,
    round_trip_s,
    your_subjective_wait_s:  your_wait_s,
    their_subjective_wait_s: their_wait_s,
    worst_subjective_wait_s: Math.max(your_wait_s, their_wait_s),
    slower_party:            p.their_rate_x >= p.your_rate_x ? 'them' : 'you',
  };
  return { output_payload };
}
