// Tier-A kernel-fixture unit (CIGOLD-PARITY-SPEC §1.4.1 job 7). Runs each L1 kernel's
// compute() against its committed fixture defaults and asserts the L1 spec §6.4 parity
// anchors. Pure import — no server, no MCP SDK. `node --test scripts/tests/*.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compute as timeDilation } from '../../kernels/time-dilation.kernel.mjs';
import { compute as kineticProbe } from '../../kernels/kinetic-probe.kernel.mjs';
import { compute as vatFeasibility } from '../../kernels/vat-feasibility.kernel.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const fixture = (slug) =>
  JSON.parse(readFileSync(resolve(ROOT, 'kernels', 'fixtures', `${slug}.fixture.json`), 'utf8'));
const pp = (input_parameters) => ({ execution_backend: 'js', canon_version: 'test', input_parameters });

test('nt_time_dilation @ fixture — subj_between_sabbaths_yr == 25', () => {
  const { output_payload } = timeDilation(pp(fixture('time-dilation')));
  assert.equal(output_payload.subj_between_sabbaths_yr, 25);
  assert.equal(output_payload.upload_required, false);
});

test('nt_kinetic_probe @ fixture — travel_yr == 75000, staged vaporization_margin < 1', () => {
  const { output_payload } = kineticProbe(pp(fixture('kinetic-probe')));
  assert.equal(output_payload.travel_yr, 75000);
  assert.ok(output_payload.vaporization_margin < 1, 'staged terminal approach should be sub-unity');
  assert.equal(output_payload.branch, 'B_survives');
});

test('nt_vat_feasibility @ fixture — verdict feasible, sahara_pct < 1', () => {
  const { output_payload } = vatFeasibility(pp(fixture('vat-feasibility')));
  assert.equal(output_payload.verdict, 'feasible');
  assert.ok(output_payload.sahara_pct < 1, 'default scenario should be well under one Sahara');
});
