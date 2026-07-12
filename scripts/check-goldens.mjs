// Golden-hash drift gate (CIGOLD-PARITY-SPEC §1.4.5). CI job. Recomputes all three L1
// goldens at fixture defaults and compares to committed kernels/fixtures/goldens.json.
// Any mismatch FAILS red — the intentional-vs-silent distinction:
//   • Intentional canon bump → editor moves CANON_VERSION (+ canon.js) AND re-runs
//     freeze-goldens.mjs in the same commit → goldens.json diff is visible + expected → green.
//   • Silent drift (kernel math / canon changed without re-freeze, wrong canon_version) →
//     recompute ≠ committed → RED.
// Also asserts goldens.json._meta.canon_version == worker CANON_VERSION (a re-freeze that
// forgot to bump _meta, or vice-versa, fails).
//
// Usage: node scripts/check-goldens.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reproduceAll, TOOLS } from './_goldens-lib.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GOLDENS = resolve(ROOT, 'kernels', 'fixtures', 'goldens.json');

let committed;
try {
  committed = JSON.parse(readFileSync(GOLDENS, 'utf8'));
} catch (e) {
  console.error(`FAIL: could not read/parse kernels/fixtures/goldens.json — ${e.message}`);
  process.exitCode = 1;
  process.exit();
}

const { canon_version, hashes, errors } = await reproduceAll();
const diffs = [];

const metaCV = committed?._meta?.canon_version;
if (metaCV !== canon_version) {
  diffs.push(`_meta.canon_version='${metaCV}' != worker CANON_VERSION='${canon_version}'`);
}

for (const t of TOOLS) {
  if (errors[t.id]) {
    // Tool's pure wrapper throws → cannot verify a golden. Red until the upstream defect is fixed.
    diffs.push(`${t.id}: wrapper THREW — ${errors[t.id]} (unfreezable; fix the kernel/hash contract)`);
    continue;
  }
  const want = committed?.[t.id]?.execution_hash;
  const got = hashes[t.id];
  if (want !== got) {
    diffs.push(`${t.id}: committed=${want} recomputed=${got}`);
  }
}

if (diffs.length) {
  console.error(`FAIL: golden-hash drift (${diffs.length} issue(s)):`);
  for (const d of diffs) console.error(`  ${d}`);
  console.error('  → intentional canon change? bump CANON_VERSION + re-run `node scripts/freeze-goldens.mjs`.');
  process.exitCode = 1;
} else {
  console.log(`PASS: goldens fresh (canon_version='${canon_version}'):`);
  for (const t of TOOLS) console.log(`  ${t.id}: ${hashes[t.id]}`);
}
