# newtripoli-mcp-worker

The MCP (Model Context Protocol) server behind [New Tripoli](https://newtripoli.xyz) — a set of deterministic, hash-verifiable science instruments for the *New Tripoli* speculative-world scenario (relativistic time dilation, orbital ring habitats, digital-mind substrate economics, kinetic-probe delivery, and more).

Every tool call returns a **cryptographically verifiable execution hash** (SHA-256 over its inputs + canon version + output), so any answer this server gives can be independently re-derived and checked, not just trusted.

**Live endpoint:** `https://mcp.newtripoli.xyz/mcp`

## What this is

New Tripoli is a hard-sf orbital-habitat scenario with a fully worked-out internal physics: subjective-time acceleration via mind emulation, an orbital ring housing a post-biological population, digital-mind substrate economics bounded by the Landauer limit, and relativistic kinetic-probe logistics. The canon numbers for all of this live in `Canon - New Tripoli.md` on the [site repo](https://github.com/PostOakLabs/newtripoli).

This worker exposes that canon as **callable, composable tools** for any MCP-speaking client (Claude Desktop, Claude Code, Cursor, or a raw HTTP client), so an agent — or a person — can run the actual math instead of asking an LLM to eyeball it.

## Tools (13)

| Tool | What it computes |
|---|---|
| `nt_time_dilation` | Subjective-years-lived multiplier for a dilation rate + Sabbath reset interval |
| `nt_kinetic_probe` | Relativistic kinetic-probe delivery: travel time, cruise KE, vaporization margin (deceleration lottery) |
| `nt_vat_feasibility` | Population power draw (biological + Landauer-priced digital minds) vs. the Sahara solar cap |
| `nt_acceleration_ceiling` | Acceleration ceiling by augmentation stage (vat → sensory → metabolic → synaptic → hybrid → upload) |
| `nt_comms_lag` | Round-trip comms lag between two parties running at different subjective-time rates |
| `nt_ring_density` | Orbital ring + core habitat housing capacity |
| `nt_birthday_sacrifice` | Subjective-time cost of a dilation gap between you and a family member |
| `nt_synthetic_body` | Synthetic body mass budget |
| `nt_selection_cost` | Selection cost for a given population/criteria |
| `nt_interface_bandwidth` | Brain-interface bandwidth gap |
| `nt_tech_tree_path` | Post-Wake tech-tree path solver |
| `nt_provenance` | Chaingraph provenance manifest for any prior tool run |
| `nt_feasibility_crosswalk` | Graded D1–D10 feasibility claim ledger, crosswalked against a scenario config |

Plus discovery/utility tools: `list_newtripoli_tools`, `find_tool`, `find_chain`, `build_workflow_links`, `verify_execution_hash`, `run_chain`.

The authoritative, always-current list (with input schemas, citations, and hash notes) is generated to [`data/tools-manifest.json`](data/tools-manifest.json) — read that instead of re-deriving this table from source.

## Chains (7)

Chains thread multiple tools together, passing each step's `execution_hash` into the next and producing a `composite_execution_hash` for the whole run:

- **intake-to-arc** — the whole scenario as a 4-step delivery → power → dilation → thermal pipeline; verdict = weakest link, no gate.
- **deceleration-lottery** — fast-fail on the kinetic probe's own vaporized/destroyed branch.
- **substrate-decision** — the biological-holds vs. upload-required hinge, gated on time dilation's flag.
- **energy-envelope** — "can it actually run": gated on vat feasibility's Sahara-capacity fraction.
- **friendship-across-tiers** — the physics of friendship: two dilated parties at different rates, plus comms budget.
- **provenance-anchor** — the OCG backbone every other chain terminates into: any tool's run, anchored to a provenance manifest.
- **feasibility-audit-crosswalk** — meta fan-in: grades all C-D1..C-D10 claims against one scenario config, then anchors provenance.

Run a chain with `run_chain`; each step and the composite result are independently hash-verifiable.

## Connecting

### Claude Desktop / Claude Code

Add to your MCP config (`claude_desktop_config.json` or `.claude/settings.json`, depending on client):

```json
{
  "mcpServers": {
    "newtripoli": {
      "url": "https://mcp.newtripoli.xyz/mcp"
    }
  }
}
```

### Cursor

Add a remote MCP server pointing at `https://mcp.newtripoli.xyz/mcp` in Cursor's MCP settings.

### Generic HTTP / any MCP client

The server speaks standard MCP over Streamable HTTP at `https://mcp.newtripoli.xyz/mcp`. `initialize` returns server name `newtripoli-mcp`. No auth required.

## Execution-hash / provenance model (OCG)

Every canon-register tool call is wrapped in a HASHWIRE envelope: the preimage is `{policy_parameters, output_payload}` (sorted keys → JSON → SHA-256 → bare hex), where `policy_parameters` bundles `execution_backend`, the current `canon_version`, and the tool's input parameters. Kernels themselves are pure — they compute an output payload and never hash; the worker wrapper owns hashing, the permalink, citations, and versioning.

That means:
- The same inputs against the same canon version always produce the same hash.
- A canon bump moves affected hashes traceably (it's inside the preimage).
- Any client can re-run `verify_execution_hash` to confirm a hash without trusting the server's say-so.

Full provenance semantics, schema, and the graph of tool/chain relationships are documented at:
- [`https://newtripoli.xyz/ch-sims/mcp.html`](https://newtripoli.xyz/ch-sims/mcp.html) — human-readable MCP + provenance explainer
- [`chaingraph.json`](https://newtripoli.xyz/chaingraph.json) — machine-readable tool/chain graph (schema `nt-chaingraph-0.4.0`)

## Development

```bash
npm ci
npm run generate       # regenerate manifest + re-stamp build digest after any worker.mjs edit
npm run check          # canon-sync, kernel-digest, tool-goldens, chain-goldens gates
npx wrangler deploy    # deploy (also runs generate)
```

Kernels live in `kernels/`, the HTTP/MCP wrapper is `worker.mjs`, canon constants are vendored with `// canon.js:` citations back to `Canon - New Tripoli.md`. Tool and chain goldens are frozen fixtures checked in CI (preflight → deploy → smoke).

## License

- **Code:** MIT
- **Prose** (canon text, citations, descriptions): CC BY 4.0
- **Data** (`data/*.json` — manifests, chaingraph, goldens): CC0
