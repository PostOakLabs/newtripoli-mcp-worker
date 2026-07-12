// HASHWIRE-SPEC §7.4 hash-reproduction self-test. Standalone: re-implements the
// vendored JCS hash logic (byte-equal to worker.mjs / lib/_hash.mjs) so it runs under
// plain `node` with no Workers runtime. Uses node:crypto for SHA-256.
// Not a golden freeze — real goldens come per-kernel in buildplan 1.4.
import { webcrypto } from 'node:crypto';
const crypto = webcrypto;

function assertIJson(v){
  if(typeof v==='number'){
    if(!Number.isFinite(v))throw new Error('Non-finite');
    if(Number.isInteger(v)&&!Number.isSafeInteger(v))throw new Error('Unsafe int');
  } else if(Array.isArray(v)){ v.forEach(assertIJson); }
  else if(v&&typeof v==='object'){ for(const k of Object.keys(v)) assertIJson(v[k]); }
}
const cgCanon=(v)=>Array.isArray(v)?v.map(cgCanon):(v&&typeof v==='object')?Object.keys(v).sort().reduce((o,k)=>(o[k]=cgCanon(v[k]),o),{}):v;
function canonicalPreimage(pp,op){ const obj={policy_parameters:pp,output_payload:op}; assertIJson(obj); return JSON.stringify(cgCanon(obj)); }
async function executionHash(pp,op){
  const bytes=new TextEncoder().encode(canonicalPreimage(pp,op));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.error('FAIL: '+m);} };

const op = { r: 3 };
const pp = { execution_backend:'js', canon_version:'2026.07.12', input_parameters:{ a:1, b:2 } };

const h1 = await executionHash(pp, op);
// (a) 64-char bare lowercase hex, no prefix
ok(/^[0-9a-f]{64}$/.test(h1), '(a) bare-lowercase-hex-64: '+h1);
// (b) determinism
const h2 = await executionHash(pp, op);
ok(h1===h2, '(b) determinism');
// (c) JCS key-sort invariance — reorder input_parameters keys
const ppReordered = { execution_backend:'js', canon_version:'2026.07.12', input_parameters:{ b:2, a:1 } };
const h3 = await executionHash(ppReordered, op);
ok(h1===h3, '(c) key-sort invariance');
// (d) canon_version is in the preimage — changing it changes the hex
const ppCanon = { execution_backend:'js', canon_version:'2099.01.01', input_parameters:{ a:1, b:2 } };
const h4 = await executionHash(ppCanon, op);
ok(h1!==h4, '(d) canon_version moves the hash');
// (e) round-trip verify recompute path
const recomputed = await executionHash(pp, op);
ok(recomputed===h1, '(e) verify round-trip valid');

console.log('HASHWIRE selftest: '+pass+' passed, '+fail+' failed. produced_hex='+h1);
if(fail>0) process.exit(1);
