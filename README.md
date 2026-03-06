# Comply.org Vendor Attestations

This repository hosts public vendor compliance attestation pages served at **[attest.comply.org](https://attest.comply.org)**.

Each vendor directory contains an `attestation.json` file conforming to the [Comply.org Attestation Standard v1.0](https://comply.org). HTML and Markdown pages are auto-generated from these JSON files after merge.

## Structure

```
{vendor-slug}/
  attestation.json   ← Source of truth (you submit this)
  index.html         ← Auto-generated (do NOT edit)
  profile.md         ← Auto-generated (do NOT edit)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for step-by-step instructions on submitting an attestation.

## Automated Pipelines

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `validate-pr.yml` | PRs touching `attestation.json` | Schema validation |
| `sweep.yml` | Weekly (Monday 6 AM UTC) | Re-validate all attestations, warn on stale entries |
| `render.yml` | Push to main | Generate HTML/MD pages |

## License

- Code: [MIT](https://opensource.org/licenses/MIT)
- Specification: [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)
