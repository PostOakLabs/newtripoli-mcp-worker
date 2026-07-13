// nt_provenance — buildplan 2.2, NEWTRIPOLI-LOG-TECHTREE-SPEC.md §3.
// Provenance/integrity meta-tool = emit_chaingraph_artifact specialized: assembles a
// tamper-evident chaingraph manifest for an arbitrary sim run, optionally threaded to a
// parent artifact's execution_hash. Wraps the SAME HASHWIRE §5 hash path — no new hash logic.
// Register: real-science.
// guest-legal: YES — structural copy + count only; wraps the standard HASHWIRE §5 hash path, no new hash logic.

const SCHEMA_VERSION = 'nt-chaingraph-0.4.0';   // matches the artifact envelope's audit_signature.schema_version

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const inputs      = p.inputs || {};
  const canon_refs  = p.canon_refs || [];
  const parent_hash = p.parent_hash ?? null;
  const manifest = {
    sim_id:          p.sim_id,
    declared_inputs: inputs,
    canon_refs,
    parent_hash,
    schema_version:  SCHEMA_VERSION,
  };
  const output_payload = {
    sim_id:          p.sim_id,
    canon_refs,
    input_key_count: Object.keys(inputs).length,
    canon_ref_count: canon_refs.length,
    has_parent:      parent_hash !== null,
    manifest,
  };
  return { output_payload };
}
