// ah_injustice_ledger kernel — NEWTRIPOLI-ALTHIST-CHAINS-SPEC.md §4.
// Register: alt-history. guest-legal: YES — sum/multiply/compare/sort over a bounded branch array; strong §18 zk candidate.
//
// Contract (HASHWIRE-SPEC §5): compute(policy_parameters) -> { output_payload }.
// Reads only policy_parameters.input_parameters. NEVER hashes, NEVER builds the envelope.
//
// Pure aggregation → unstable-ranking verdict. Meta fan-in target of injustice-conservation (§5.2).
// Thesis (Tim-locked, TRIAGE #12): NOT conservation — the RANKING of branches is unstable under
// defensible counting rules. least_unjust_branch = "minimal under this stated accounting"; the
// accounting is the exposed, adjustable argument. Calibration figures are ILLUSTRATIVE/TUNABLE
// parameters cited to the documented record — NOT asserted history (board reframe rule).

// Vendored from data/canon.js CH_CANON.altHistory.injustice — byte-equal citation values.
const IJ_INDIRECT_MULT   = 3.5;   // canon.js: altHistory.injustice.indirectMultiplier — indirect:direct, Geneva Decl. 3–4× band
const IJ_DISPLACE_WEIGHT = 0.1;   // canon.js: altHistory.injustice.displacementWeight — injustice units / displaced person
const IJ_SOV_WEIGHT      = 1e6;   // canon.js: altHistory.injustice.sovereigntyWeight — injustice units / unit sovereignty lost
const IJ_MAX_BRANCHES    = 20;    // canon.js: altHistory.injustice.maxBranches — array bound (deterministic)

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const B = (p.branches || []).slice(0, IJ_MAX_BRANCHES);
  const score = (b, withIndirect) =>
    b.direct_deaths
    + (withIndirect ? b.indirect_deaths * p.indirect_multiplier : 0)
    + (b.refugees + b.idps) * p.displacement_weight
    + b.sovereignty_lost * p.sovereignty_weight;
  // ledger uses the active accounting (include_indirect); ties broken by branch id (stable string order).
  const ledger = B
    .map(b => ({ id: b.id, injustice_score: score(b, p.include_indirect), direct_score: score(b, false) }))
    .sort((a, z) => a.injustice_score - z.injustice_score || (a.id < z.id ? -1 : a.id > z.id ? 1 : 0))
    .map((e, i) => ({ id: e.id, injustice_score: e.injustice_score, rank: i + 1 }));
  const minBy = key => B.map(b => ({ id: b.id, s: score(b, key) }))
    .sort((a, z) => a.s - z.s || (a.id < z.id ? -1 : a.id > z.id ? 1 : 0))[0].id;
  const direct_only_leader = minBy(false);   // least-unjust counting battle-deaths only
  const weighted_leader    = minBy(true);    // least-unjust counting +indirect
  const least_unjust_branch = ledger[0].id;                       // under the ACTIVE accounting
  // Stable = turning on the active accounting's indirect counting does NOT move the least-unjust leader
  // off the direct-only leader. include_indirect:false ⇒ active==direct-only ⇒ stable (§5.2 / §8A).
  const ranking_stable = least_unjust_branch === direct_only_leader;
  const output_payload = {
    ledger,                                          // [{id, injustice_score, rank}], rank 1 = least unjust
    least_unjust_branch,
    most_unjust_branch:  ledger[ledger.length - 1].id,
    direct_only_leader,
    weighted_leader,
    ranking_stable,                                  // FALSE = the thesis (leader flips under indirect counting)
    verdict: ranking_stable
      ? 'RANKING STABLE'
      : 'RANKING UNSTABLE — least-unjust flips ' + direct_only_leader + '→' + weighted_leader + ' under indirect counting',
  };
  return { output_payload };
}
