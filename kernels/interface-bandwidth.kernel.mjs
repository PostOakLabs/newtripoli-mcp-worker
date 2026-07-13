// nt_interface_bandwidth — buildplan 2.2, NEWTRIPOLI-LOG-TECHTREE-SPEC.md §1.
// Register: real-science. Lifts interface-bandwidth.html render().
// guest-legal: NO — Math.log10/Math.log2 of runtime channels; hash-verifiable only, NOT zk-provable in §18.
//
// Slider-glue note: the sim's slider stores a channel exponent (channels = 10^(c/10)) — DOM glue only.
// This kernel takes `channels` DIRECTLY as input (like nt_comms_lag takes rates). Its own log10/log2
// on the runtime channels is what makes it non-guest-legal.

const NEURONS            = 8.6e10;   // canon.js: feasibility.neurons — ~86e9 neurons (gap denominator)
const NEURALINK_CHANNELS = 1024;     // canon.js: feasibility.neuralinkChannels — present-day BCI channels; default `channels`

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const ch = p.channels;
  const fraction_of_brain  = ch / NEURONS;
  const gap_orders         = Math.log10(NEURONS) - Math.log10(ch);
  const doublings_to_close = gap_orders <= 0 ? 0 : gap_orders * Math.log2(10);
  const interface_complete = gap_orders <= 0;
  const output_payload = {
    channels:            ch,
    fraction_of_brain,
    one_in:              Math.round(NEURONS / ch),   // "1 in 10^n" reciprocal, integer
    gap_orders,
    doublings_to_close,
    interface_complete,
    writing_is_harder:   p.direction === 'write',    // the write half is the unsolved-at-scale problem
    verdict:             interface_complete ? 'INTERFACE-COMPLETE' : (gap_orders.toFixed(1) + ' ORDERS SHORT'),
  };
  return { output_payload };
}
