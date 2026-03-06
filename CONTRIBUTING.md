# Contributing an Attestation

Any platform, auditor, or vendor can submit a compliance attestation via pull request.

## Step-by-step

1. **Fork** this repository.

2. **Create a directory** named after your vendor slug (lowercase, alphanumeric + hyphens):
   ```
   my-vendor/attestation.json
   ```

3. **Write your `attestation.json`** conforming to the [Comply.org Attestation Standard v1.0](https://comply.org) schema. Required fields:
   - `$complyVersion`: Must be `"1.0"`
   - `slug`: Must match your directory name
   - `name`, `category`, `transparencyScore`
   - `certifications`, `frameworks`, `dataLocations`, `aiCapabilities`, `aiTechniques` (arrays, may be empty)
   - `expertReviews` (array, may be empty for self-reported attestations)

   See the [schema](https://github.com/complyorg/v1/blob/main/schema/attestation.schema.json) and [examples](https://github.com/complyorg/v1/tree/main/examples) for reference.

4. **Do NOT add HTML or Markdown files** — these are auto-generated after merge.

5. **Open a pull request**. The `validate-pr.yml` workflow will automatically validate your attestation against the schema.

6. A maintainer will review and merge. After merge, `render.yml` generates your public page at `https://attest.comply.org/{your-slug}/`.

## Expert Reviews

If your attestation includes expert reviews, each review must have:
- `expertRefCode`: A traceable identifier (no personal information)
- `issuingPlatform`: The platform that verified the expert
- `expertType`: One of `"legal"`, `"technical"`, or `"general"`
- `completedAt`: ISO 8601 timestamp
- `principles`: Assessment of all 6 core principles

The issuing platform is responsible for expert identity verification (KYC).

## Updating Your Attestation

Submit a new PR updating your `attestation.json`. The same validation and rendering pipeline applies.

## Questions

Open an issue in this repository or in [complyorg/v1](https://github.com/complyorg/v1).
