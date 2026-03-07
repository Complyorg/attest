#!/usr/bin/env node
/**
 * Comply.org Attestation Renderer
 *
 * Reads attestation.json files and generates index.html + profile.md per vendor.
 * Standalone ESM — no framework dependencies.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { glob } from "glob";

const CORE_PRINCIPLES = [
  { key: "transparency", label: "Transparency", description: "Clear communication about data collection, use, and sharing practices." },
  { key: "dataMinimization", label: "Data Minimization", description: "Collecting only the data necessary for stated purposes." },
  { key: "accountability", label: "Accountability", description: "Demonstrable compliance through certifications, audits, and documented processes." },
  { key: "security", label: "Security", description: "Technical and organizational measures to protect data integrity and confidentiality." },
  { key: "quality", label: "Quality", description: "Ensuring data accuracy, completeness, and currency." },
  { key: "participation", label: "Participation", description: "Supporting data subject rights including access, rectification, and deletion." },
];

// ── Helpers ─────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function boolLabel(val) {
  if (val === true) return "Yes";
  if (val === false) return "No";
  return "Unknown";
}

function scoreColor(score) {
  if (score >= 70) return "#005981";
  if (score >= 40) return "#64748b";
  return "#94454d";
}

function principleStatusBadge(status) {
  switch (status) {
    case "verified": return '<span class="badge badge-verified">Verified</span>';
    case "submitted": return '<span class="badge badge-submitted">Submitted</span>';
    default: return '<span class="badge badge-outline">Pending</span>';
  }
}

function deriveJurisdictions(data) {
  const jurisdictions = [];
  if (data.gdprCompliant) jurisdictions.push("EU");
  if (data.ccpaCompliant) jurisdictions.push("CA");
  const locs = (data.dataLocations || []).map((l) => l.toLowerCase());
  if (locs.some((l) => l.includes("uk") || l.includes("united kingdom"))) jurisdictions.push("UK");
  if (data.hipaaCompliant || locs.some((l) => l.includes("us") || l.includes("united states"))) jurisdictions.push("US");
  return [...new Set(jurisdictions)];
}

function derivePrincipleStatus(key, data) {
  switch (key) {
    case "transparency": return data.privacyPolicyUrl ? "submitted" : "pending";
    case "dataMinimization": return data.dataRetentionPolicy ? "submitted" : "pending";
    case "accountability": return (data.certifications?.length > 0 || data.frameworks?.length > 0) ? "submitted" : "pending";
    case "security": return (data.encryptionAtRest || data.encryptionInTransit) ? "submitted" : "pending";
    case "quality": return data.hasEuDataCenter ? "submitted" : "pending";
    case "participation": return data.supportsDsars ? "submitted" : "pending";
    default: return "pending";
  }
}

function getPrincipleAssessment(key, data) {
  const latestReview = data.expertReviews?.[0];
  if (latestReview?.principles?.[key]) {
    return latestReview.principles[key].status || "pending";
  }
  return derivePrincipleStatus(key, data);
}

// ── HTML Generator ──────────────────────────────────────────────

function generateHtml(data) {
  const hasExpertReviews = (data.expertReviews || []).length > 0;
  const statusLabel = hasExpertReviews ? "Expert-Verified" : "Self-Reported";
  const statusBadgeClass = hasExpertReviews ? "badge-verified" : "badge-submitted";
  const jurisdictions = deriveJurisdictions(data);
  const dpa = data.dpaAnalysis;
  const subs = data.subprocessors || [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: data.name,
    url: data.website ?? undefined,
    description: data.description ?? undefined,
  };

  // Summary section
  let summary = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">`;
  summary += `<div>
    <div class="row"><span class="row-label">Transparency Score</span><span class="row-value" style="color:${scoreColor(data.transparencyScore)}">${data.transparencyScore}%</span></div>
    <div class="score-bar"><div class="score-fill" style="width:${data.transparencyScore}%;background:${scoreColor(data.transparencyScore)}"></div></div>
  </div>`;
  if (dpa) {
    summary += `<div>
      <div class="row"><span class="row-label">DPA Score</span><span class="row-value" style="color:${scoreColor(dpa.overallScore)}">${dpa.overallScore}%</span></div>
      <div class="score-bar"><div class="score-fill" style="width:${dpa.overallScore}%;background:${scoreColor(dpa.overallScore)}"></div></div>
    </div>`;
  }
  summary += `</div>`;
  summary += `<div class="grid" style="margin-top:0.75rem">`;
  if (data.dataLocations?.[0]) {
    summary += `<div class="row"><span class="row-label">Headquarters</span><span class="row-value">${esc(data.dataLocations[0])}</span></div>`;
  }
  summary += `<div class="row"><span class="row-label">Designated DPO</span><span class="row-value">${data.hasDesignatedDpo ? "Yes" : data.hasDesignatedDpo === false ? "No" : "—"}</span></div>`;
  summary += `</div>`;

  // Core Principles
  const principleCards = CORE_PRINCIPLES.map((p) => {
    const status = getPrincipleAssessment(p.key, data);
    return `<div class="principle-card">
      <div class="principle-header">
        <h3>${p.label}</h3>
        ${principleStatusBadge(status)}
      </div>
      <p>${p.description}</p>
    </div>`;
  }).join("\n");

  // Resources
  let resources = "";
  const securityItems = [];
  for (const cert of data.certifications || []) {
    securityItems.push(`<li><span class="check-yes">&#x2713;</span> ${esc(cert)}</li>`);
  }
  if (data.encryptionAtRest) securityItems.push(`<li><span class="check-yes">&#x2713;</span> Encryption at rest</li>`);
  if (data.encryptionInTransit) securityItems.push(`<li><span class="check-yes">&#x2713;</span> Encryption in transit</li>`);
  if (data.penTestFrequency) securityItems.push(`<li><span class="check-yes">&#x2713;</span> Penetration testing: ${esc(data.penTestFrequency)}</li>`);
  if (data.breachNotificationDays != null) {
    securityItems.push(`<li><span class="check-yes">&#x2713;</span> Breach notification: ${data.breachNotificationDays} days</li>`);
  } else if (data.hasRecentBreach === false) {
    securityItems.push(`<li><span class="check-yes">&#x2713;</span> No recent breaches reported</li>`);
  }

  let petHtml = "";
  if (data.privacyTechnologies?.length > 0) {
    petHtml = `<ul class="checklist">`;
    for (const tech of data.privacyTechnologies) {
      petHtml += `<li><span class="check-yes">&#x2713;</span> ${esc(tech)}</li>`;
    }
    petHtml += `</ul>`;
  }

  const hasSecurityCol = securityItems.length > 0;
  const hasPetCol = petHtml.length > 0;
  const gridClass = hasSecurityCol && hasPetCol ? "two-col" : "one-col";

  resources += `<div class="resources-grid ${gridClass}">`;
  if (hasSecurityCol) {
    resources += `<div class="resources-col"><h3>Security Guarantees</h3><ul class="checklist">${securityItems.join("")}</ul></div>`;
  }
  if (hasPetCol) {
    resources += `<div class="resources-col"><h3>Privacy Enhancing Measures</h3>${petHtml}</div>`;
  }
  resources += `</div>`;

  const linkResources = [
    ["DPA", data.dpaUrl],
    ["Privacy Notice", data.privacyPolicyUrl],
    ["Trust Center", data.trustCenterUrl],
    ["Security Page", data.securityPageUrl],
  ].filter(([, url]) => url);
  if (linkResources.length > 0) {
    resources += `<div style="margin-top:0.75rem">`;
    for (const [label, url] of linkResources) {
      resources += `<div class="row"><span class="row-label">${label}</span><a href="${esc(url)}" rel="noopener">${esc(url)}</a></div>`;
    }
    resources += `</div>`;
  }

  // DPA section
  let dpaHtml = "";
  if (dpa) {
    dpaHtml = `<h2 id="dpa">DPA Compliance Analysis</h2>`;
    const laws = [
      { label: "GDPR", data: dpa.gdpr },
      { label: "CCPA", data: dpa.ccpa },
    ];
    dpaHtml += `<div class="grid" style="margin-bottom:1rem">`;
    for (const law of laws) {
      if (!law.data) continue;
      const pct = law.data.total > 0 ? Math.round((law.data.score / law.data.total) * 100) : 0;
      dpaHtml += `<div class="row"><span class="row-label">${law.label}</span><span class="row-value" style="color:${scoreColor(pct)}">${law.data.score}/${law.data.total} (${pct}%)</span></div>`;
    }
    dpaHtml += `</div>`;
    const allClauses = [...(dpa.gdpr?.clauses || []), ...(dpa.ccpa?.clauses || [])];
    if (allClauses.length > 0) {
      dpaHtml += `<div class="clause-grid">`;
      for (const clause of allClauses) {
        const icon = clause.found ? '<span class="check-yes">&#x2713;</span>' : '<span class="check-no">&#x2717;</span>';
        dpaHtml += `<div class="clause">${icon} ${esc(clause.label)}</div>`;
      }
      dpaHtml += `</div>`;
    }
  }

  // Subprocessors
  let subsHtml = "";
  if (subs.length > 0) {
    const rows = subs.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.purpose)}</td><td>${s.location ? esc(s.location) : "—"}</td></tr>`).join("\n      ");
    subsHtml = `<h2 id="subprocessors">Subprocessors</h2>
  <table>
    <thead><tr><th>Name</th><th>Purpose</th><th>Location</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  }

  // Expert reviews
  let reviewsHtml = "";
  if (hasExpertReviews) {
    reviewsHtml = `<h2 id="reviews">Expert Reviews</h2>`;
    for (const review of data.expertReviews) {
      const typeLabel = review.expertType === "legal" ? "Legal" : review.expertType === "technical" ? "Technical" : "Expert";
      const date = review.completedAt ? new Date(review.completedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
      const platform = review.issuingPlatform ? ` · ${esc(review.issuingPlatform)}` : "";
      reviewsHtml += `<div class="review-card">
      <div class="review-header">
        <div>
          <span class="badge badge-outline">${esc(review.expertRefCode || "N/A")}</span>
          <span class="badge badge-verified">${typeLabel}</span>
        </div>
        <span class="subtitle">${date}${platform}</span>
      </div>`;
      if (review.summaryReport) {
        let excerpt = review.summaryReport;
        if (excerpt.length > 300) {
          const truncated = excerpt.slice(0, 300);
          const lastPeriod = truncated.lastIndexOf(".");
          excerpt = lastPeriod > 100 ? truncated.slice(0, lastPeriod + 1) : truncated + "...";
        }
        reviewsHtml += `<p style="font-size:0.875rem;color:#444551;margin-top:0.5rem">${esc(excerpt)}</p>`;
      }
      reviewsHtml += `</div>`;
    }
  }

  const generatedDate = data.generated || new Date().toISOString().split("T")[0];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index, follow">
  <title>${esc(data.name)} — Compliance Profile | Comply.org</title>
  <meta name="description" content="Public compliance profile for ${esc(data.name)}. Verified vendor attestation on Comply.org.">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, system-ui, sans-serif; color: #191A1A; background: #ffffff; line-height: 1.6; }
    .container { max-width: 860px; margin: 0 auto; padding: 2rem 1rem; }
    .page-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1.25rem; padding-bottom: 0.75rem; border-bottom: 2px solid #005981; }
    .page-header-label { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #005981; }
    .page-header-site { font-size: 0.8rem; color: #94a3b8; }
    h1 { font-size: 1.75rem; font-weight: 700; color: #005981; margin-bottom: 0.25rem; }
    .header-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.25rem; }
    .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; border: 1px solid; }
    .badge-verified { color: #15803d; border-color: #86efac; background: rgba(34,197,94,0.08); }
    .badge-submitted { color: #92400e; border-color: #fcd34d; background: rgba(251,191,36,0.08); }
    .badge-outline { color: #444551; border-color: #d1d5db; background: transparent; }
    .badge-jurisdiction { color: #005981; border-color: #b0d4e8; background: rgba(0,89,129,0.05); }
    .quick-nav { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 2rem; padding: 0.75rem; background: #f9fafb; border-radius: 8px; }
    .quick-nav a { padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.8rem; color: #444551; text-decoration: none; transition: background 0.15s; }
    .quick-nav a:hover { background: #e5e7eb; color: #005981; }
    h2 { font-size: 1.1rem; font-weight: 600; color: #005981; margin-top: 2rem; margin-bottom: 0.75rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
    .subtitle { color: #444551; font-size: 0.875rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
    .row { display: flex; justify-content: space-between; padding: 0.375rem 0; border-bottom: 1px solid #f3f4f6; }
    .row-label { color: #444551; font-size: 0.875rem; }
    .row-value { font-size: 0.875rem; font-weight: 500; }
    .score-bar { height: 6px; border-radius: 3px; background: #e2e8f0; margin-top: 0.375rem; }
    .score-fill { height: 100%; border-radius: 3px; }
    .principle-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; background: #f8f9fa; }
    .principle-card h3 { font-size: 0.875rem; font-weight: 600; color: #191A1A; margin-bottom: 0.25rem; }
    .principle-card p { font-size: 0.75rem; color: #444551; }
    .principle-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .checklist { list-style: none; }
    .checklist li { padding: 0.375rem 0; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem; }
    .check-yes { color: #005981; }
    .check-no { color: #cbd5e1; }
    .clause-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 1rem; }
    .clause { font-size: 0.8rem; padding: 0.25rem 0; display: flex; align-items: center; gap: 0.375rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; padding: 0.5rem; border-bottom: 2px solid #e5e7eb; color: #444551; font-weight: 600; }
    td { padding: 0.5rem; border-bottom: 1px solid #f3f4f6; }
    .review-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; background: #f8f9fa; }
    .review-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .resources-grid { display: grid; gap: 1.5rem; }
    .resources-grid.two-col { grid-template-columns: 1fr 1fr; }
    .resources-grid.one-col { grid-template-columns: 1fr; }
    .resources-col h3 { font-size: 0.875rem; font-weight: 600; color: #005981; margin-bottom: 0.5rem; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #444551; display: flex; justify-content: space-between; gap: 2rem; }
    .footer-label { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; margin-bottom: 0.125rem; }
    .footer-right { text-align: right; }
    @media (max-width: 480px) { .footer { flex-direction: column; text-align: center; gap: 0.75rem; } .footer-right { text-align: center; } }
    a { color: #005981; text-decoration: none; }
    a:hover { text-decoration: underline; }
    @media (max-width: 640px) { .grid, .grid-3, .clause-grid, .resources-grid.two-col { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<div class="container">
  <div class="page-header">
    <span class="page-header-label">Vendor Attestation</span>
    <span class="page-header-site">comply.org</span>
  </div>
  <div style="margin-bottom:1.5rem">
    <h1>${esc(data.name)}</h1>
    <div class="header-meta">
      <span class="badge ${statusBadgeClass}">${statusLabel}</span>
      <span class="subtitle">${esc(data.category)}${data.subcategory ? ` / ${esc(data.subcategory)}` : ""}</span>
      ${jurisdictions.map((j) => `<span class="badge badge-jurisdiction">${esc(j)}</span>`).join("")}
    </div>
  </div>

  ${data.description ? `<p style="margin-bottom:1.5rem;color:#444551">${esc(data.description)}</p>` : ""}

  <div class="quick-nav">
    <a href="#summary">Summary</a>
    <a href="#principles">Core Principles</a>
    <a href="#resources">Resources</a>
    ${dpa ? '<a href="#dpa">DPA Analysis</a>' : ""}
    ${subs.length > 0 ? '<a href="#subprocessors">Subprocessors</a>' : ""}
    ${hasExpertReviews ? '<a href="#reviews">Reviews</a>' : ""}
  </div>

  <h2 id="summary">Summary</h2>
  ${summary}

  <h2 id="principles">Core Principles</h2>
  <div class="grid-3">${principleCards}</div>

  <h2 id="resources">Resources &amp; Safeguards</h2>
  ${resources}

  ${dpaHtml}
  ${subsHtml}
  ${reviewsHtml}

  <div class="footer">
    <div class="footer-left">
      <div class="footer-label">Attestation</div>
      <p>Generated ${generatedDate}</p>
    </div>
    <div class="footer-right">
      <p><a href="https://comply.org">Comply.org Attestation Standard v1.0</a></p>
      <p>Code: MIT &middot; Specification: <a href="https://creativecommons.org/licenses/by/4.0/">CC-BY-4.0</a></p>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ── Markdown Generator ──────────────────────────────────────────

function generateMarkdown(data) {
  const hasExpertReviews = (data.expertReviews || []).length > 0;
  const statusLabel = hasExpertReviews ? "Expert-Verified" : "Self-Reported";
  const jurisdictions = deriveJurisdictions(data);
  const dpa = data.dpaAnalysis;
  const subs = data.subprocessors || [];
  const generatedDate = data.generated || new Date().toISOString().split("T")[0];

  let md = `---
slug: ${data.slug}
name: "${data.name}"
category: "${data.category}"
${data.subcategory ? `subcategory: "${data.subcategory}"` : ""}
status: "${statusLabel}"
jurisdictions: [${jurisdictions.map((j) => `"${j}"`).join(", ")}]
transparencyScore: ${data.transparencyScore}
${dpa ? `dpaComplianceScore: ${dpa.overallScore}` : ""}
generated: "${generatedDate}"
---

# ${data.name}

**${data.category}**${data.subcategory ? ` / ${data.subcategory}` : ""} | ${statusLabel}${jurisdictions.length > 0 ? ` | ${jurisdictions.join(", ")}` : ""}

${data.description ?? ""}

## Summary

- Transparency Score: ${data.transparencyScore}%
${dpa ? `- DPA Compliance Score: ${dpa.overallScore}%` : ""}
- Designated DPO: ${boolLabel(data.hasDesignatedDpo)}

## Core Principles

| Principle | Status |
|-----------|--------|
`;

  for (const p of CORE_PRINCIPLES) {
    const status = getPrincipleAssessment(p.key, data);
    md += `| ${p.label} | ${status.charAt(0).toUpperCase() + status.slice(1)} |\n`;
  }

  md += `\n## Resources & Safeguards\n\n`;
  for (const cert of data.certifications || []) md += `- ${cert}\n`;
  if (data.encryptionAtRest) md += `- Encryption at rest\n`;
  if (data.encryptionInTransit) md += `- Encryption in transit\n`;
  if (data.penTestFrequency) md += `- Penetration testing: ${data.penTestFrequency}\n`;
  if (data.breachNotificationDays != null) md += `- Breach notification: ${data.breachNotificationDays} days\n`;
  if (data.privacyTechnologies?.length > 0) {
    md += `\n### Privacy Enhancing Measures\n\n`;
    for (const tech of data.privacyTechnologies) md += `- ${tech}\n`;
  }

  const links = [
    ["DPA", data.dpaUrl],
    ["Privacy Notice", data.privacyPolicyUrl],
    ["Trust Center", data.trustCenterUrl],
    ["Security Page", data.securityPageUrl],
    ["Website", data.website],
  ].filter(([, url]) => url);
  if (links.length > 0) {
    md += `\n${links.map(([label, url]) => `- [${label}](${url})`).join("\n")}\n`;
  }

  if (dpa) {
    md += `\n## DPA Compliance Analysis\n\n| Law | Score | Percentage |\n|-----|-------|------------|\n`;
    for (const law of [{ label: "GDPR", data: dpa.gdpr }, { label: "CCPA", data: dpa.ccpa }]) {
      if (!law.data) continue;
      const pct = law.data.total > 0 ? Math.round((law.data.score / law.data.total) * 100) : 0;
      md += `| ${law.label} | ${law.data.score}/${law.data.total} | ${pct}% |\n`;
    }
  }

  if (subs.length > 0) {
    md += `\n## Subprocessors\n\n| Name | Purpose | Location |\n|------|---------|----------|\n`;
    md += subs.map((s) => `| ${s.name} | ${s.purpose} | ${s.location ?? "—"} |`).join("\n") + "\n";
  }

  if (hasExpertReviews) {
    md += `\n## Expert Reviews\n\n`;
    for (const review of data.expertReviews) {
      const typeLabel = review.expertType === "legal" ? "Legal" : review.expertType === "technical" ? "Technical" : "Expert";
      const date = review.completedAt ? new Date(review.completedAt).toISOString().split("T")[0] : "—";
      const platform = review.issuingPlatform ? ` (${review.issuingPlatform})` : "";
      md += `### ${review.expertRefCode || "N/A"} (${typeLabel}) — ${date}${platform}\n\n`;
      if (review.summaryReport) md += `${review.summaryReport}\n\n`;
    }
  }

  md += `\n---\n\n*Generated ${generatedDate}.*\n`;
  md += `\n*[Comply.org Attestation Standard v1.0](https://comply.org) — Code: MIT · Specification: [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)*\n`;

  return md;
}

// ── Main ────────────────────────────────────────────────────────

const files = await glob("*/attestation.json", {
  ignore: ["node_modules/**", "_render/**", ".git/**"],
});

console.log(`Rendering ${files.length} attestation(s)...\n`);

for (const file of files) {
  const data = JSON.parse(readFileSync(file, "utf-8"));
  const dir = dirname(file);

  const html = generateHtml(data);
  const md = generateMarkdown(data);

  writeFileSync(join(dir, "index.html"), html, "utf-8");
  writeFileSync(join(dir, "profile.md"), md, "utf-8");

  console.log(`  ✓ ${data.slug} — ${data.name}`);
}

console.log(`\nRendered ${files.length} vendor page(s).`);
