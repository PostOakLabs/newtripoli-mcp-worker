// Freeze L1 golden execution hashes (CIGOLD-PARITY-SPEC §1.4.5). HUMAN-RUN, not in CI.
// Recomputes all three L1 goldens at fixture defaults and writes kernels/fixtures/goldens.json.
// Idempotent. Run ONLY after canon-sync (§1.4.2) + browser↔worker parity (§4) both pass.
//
// Usage:
//   node scripts/freeze-goldens.mjs                 # freeze with parity_verified:false (provisional)
//   node scripts/freeze-goldens.mjs --parity-verified   # final freeze once PARITY.build reports green
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reproduceAll, TOOLS } from './_goldens-lib.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = resolve(ROOT, 'kernels', 'fixtures', 'goldens.json');
const parityVerified = process.argv.includes('--parity-verified');

const { canon_version, hashes, errors } = await reproduceAll();

const out = {
  _meta: {
    canon_version,
    frozen_at: '2026-07-12',
    parity_verified: parityVerified,
    note: 'P1 L1 goldens — bare-hex execution_hash at fixture (default) inputs. Regenerate via freeze-goldens.mjs.',
  },
};
for (const t of TOOLS) {
  if (errors[t.id]) {
    // A tool whose pure wrapper throws cannot be frozen — record the blocker instead of a hash,
    // so goldens.json is an honest ledger and check-goldens flags it red until upstream is fixed.
    out[t.id] = { execution_hash: null, blocked: errors[t.id] };
  } else {
    out[t.id] = { execution_hash: hashes[t.id] };
  }
}

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

console.log(`Froze goldens → kernels/fixtures/goldens.json (canon_version=${canon_version}, parity_verified=${parityVerified}):`);
for (const t of TOOLS) {
  console.log(`  ${t.id}: ${errors[t.id] ? 'BLOCKED — ' + errors[t.id] : hashes[t.id]}`);
}
