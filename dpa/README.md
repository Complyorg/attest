# Public DPA hosting

Publicly hosted Data Processing Agreements (DPAs) for vendors who have
**consented** to make their proposed/standard DPA publicly available from
their Comply.org attestation.

## Convention

| | |
|---|---|
| **Repo path** | `dpa/<slug>.pdf` |
| **Public URL** | `https://attest.comply.org/dpa/<slug>.pdf` |
| **Linked from** | the vendor's attestation `dpaUrl` field → rendered as the **DPA** link on `attest.comply.org/<slug>/` |

PDFs live in this **top-level `dpa/` folder**, never inside a vendor's
`<slug>/` directory — the page-export pipeline does `rm -rf <slug>` before
copying regenerated pages, which would delete a PDF stored there. This
folder is outside that path and is left untouched by both the export and the
manifest-based cleanup.

## Publishing

From the Vendor.Watch repo:

```
npx tsx scripts/publish-dpa-pdf.ts --slug <slug> --pdf /path/to/their-dpa.pdf \
  --attest-dir /path/to/complyorg-attest
```

The script copies the PDF here, sets the vendor's `dpaUrl` to the public URL,
records `public_pdf_url` on the vendor's `vw_dpa_documents` record, and
regenerates the attestation page. Commit + push this repo to publish.

## Requirements before publishing a real DPA

- The document is the **vendor's own** proposed/standard DPA.
- The vendor has given **written consent** to host it publicly.
- Label it as a vendor template, not a signed/executed agreement.

`SAMPLE-dpa.pdf` is a demonstration placeholder only — not attributed to any
vendor and of no legal effect.
