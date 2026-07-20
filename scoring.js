/*
 * Ms. Early Bird — Escalation scoring (single source of truth)
 * Pure, dependency-free. Runs in BOTH Node (server pipeline) and the browser (dashboard).
 *
 *   Node:     const { scoreRow, scoreRows } = require("./scoring.js");
 *   Browser:  <script src="scoring.js"></script>  ->  window.MsEarlyBirdScoring.scoreRow(row)
 *
 * Keep this file as the ONLY place the scoring math lives. The Node alert pipeline and the
 * dashboard both import it, so a weight change here updates both at once.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api; // Node
  if (root) root.MsEarlyBirdScoring = api;                                   // Browser (window)
})(typeof self !== "undefined" ? self : this, function () {
  const CONFIG = {
    caseAgingThresholdDays: 7,
    highOcaThreshold: 30,
    responseDelayThresholdDays: 3,
    customerEngagedThresholdDays: 1,
    keywords: [
      "urgent", "blocker", "asap", "critical", "outage", "not working",
      "broken", "failure", "down", "production issue", "escalation",
      "sev1", "sev 1", "sev2", "sev 2",
    ],
  };

  function clamp(n, min = 0, max = 100) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }
  function clamp01(n) { return Math.max(0, Math.min(1, n)); }
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

  function toNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const cleaned = String(value).replace(/[%,$]/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  }
  function isNullish(value) {
    return value === null || value === undefined || String(value).trim() === "";
  }
  function normalizeText(value) {
    return isNullish(value) ? "" : String(value).trim().toLowerCase();
  }
  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  function daysBetween(later, earlier) {
    return (later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24);
  }
  function containsKeyword(text, keywords) {
    const t = normalizeText(text);
    return keywords.some((k) => t.includes(k.toLowerCase()));
  }
  function uniqueJoin(items) {
    return [...new Set(items.filter(Boolean))].join(", ");
  }
  function pickFirst(row, keys) {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
        return row[key];
      }
    }
    return "";
  }
  function parseFailureTimeFromNextSla(row) {
    const raw = row["Next Sla"] || row["Next SLA"] || "";
    if (!raw) return null;
    const text = String(raw).trim();
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.FailureTime) return toDate(parsed.FailureTime);
    } catch (err) {
      const match = text.match(/"FailureTime"\s*:\s*"([^"]+)"/i);
      if (match && match[1]) return toDate(match[1]);
    }
    return null;
  }
  function getNextUpdateDueFromRow(row) {
    return parseFailureTimeFromNextSla(row) || toDate(row["Next Update Due"]);
  }

  // Ball is in the customer's court (pending response), owned by eng with low escalation
  // chance (pending engineering), or awaiting customer confirmation (resolution provided).
  function isLowRiskStatus(statusReason) {
    const sr = normalizeText(statusReason);
    return (
      sr === "resolution provided" ||
      sr === "pending response" ||
      sr === "pending engineering"
    );
  }

  function scoreRow(row) {
    const today = new Date();

    const statusReason = row["Status Reason"];
    const escalatedDate = row["Escalated Date"];
    const dateCreated = toDate(row["Date Created"]);
    const nextUpdateDue = getNextUpdateDueFromRow(row);
    const lastReopenedDate = toDate(row["Last Reopened Date"]);

    const sentimentScore = clamp(toNumber(row["Customer Sentiment Score"], 0), 0, 100);
    const lastUpdateToCustomerPeriod = Math.max(0, toNumber(row["Last Update To Customer (Period)"], 0));
    const lastUpdateFromCustomerPeriod = Math.max(0, toNumber(row["Last Update From Customer (Period)"], 0));
    const oca = Math.max(0, toNumber(row["OCA (Case) (Case Extension)"], 0));

    const hoursToDue = nextUpdateDue
      ? (nextUpdateDue.getTime() - today.getTime()) / (1000 * 60 * 60)
      : null;
    const pastDue = hoursToDue !== null && hoursToDue <= 0;
    const dueSoonRisk = hoursToDue === null ? 0 : pastDue ? 1 : clamp01(1 - hoursToDue / 72);

    const sentimentRisk = clamp01((100 - sentimentScore) / 100);
    const responseDelayRisk = clamp01(lastUpdateToCustomerPeriod / 3);
    const ocaRisk = clamp01(Math.log1p(oca) / Math.log1p(30));

    const keywordText = [row["Title"], row["Description"], row["Latest External Note(Inbound)"]]
      .filter(Boolean).join(" | ");
    const keywordRisk = containsKeyword(keywordText, CONFIG.keywords) ? 1 : 0;

    const priority = normalizeText(row["Priority"]);
    const priorityRisk =
      priority.startsWith("p1") ? 1 :
      priority.startsWith("p2") ? 0.7 :
      priority.startsWith("p3") ? 0.4 :
      priority.startsWith("p4") ? 0.15 : 0.3;

    const supportLevel = normalizeText(pickFirst(row, [
      "Support Level (Entitled Product) (Product Entitlement)",
      "Support Level (Entitled Product)",
      "Entitled Product",
    ]));
    const supportRisk =
      supportLevel.includes("expert") ? 0.15 :
      supportLevel.includes("elite") || supportLevel.includes("ultimate") ? 0.25 : 0;

    const reopenedRisk = lastReopenedDate ? 1 : 0;

    const slaRisk = (
      (normalizeText(row["Update Case SLA Met"]) === "no" ? 1 : 0) +
      (normalizeText(row["First Response SLA Met"]) === "no" ? 1 : 0) +
      (pastDue ? 1 : 0)
    ) / 3;

    const customerEngagedRisk = clamp01(1 - Math.min(lastUpdateFromCustomerPeriod / 3, 1));

    const weightedRisk =
      0.30 * sentimentRisk +
      0.22 * dueSoonRisk +
      0.18 * responseDelayRisk +
      0.14 * slaRisk +
      0.08 * ocaRisk +
      0.04 * keywordRisk +
      0.03 * priorityRisk +
      0.01 * supportRisk +
      0.015 * reopenedRisk +
      0.005 * customerEngagedRisk;

    const Escalation_Probability = Math.round(100 * sigmoid((weightedRisk - 0.45) * 8));

    const reasons = [];
    if (keywordRisk) reasons.push("urgent/blocker keywords detected");
    if (lastUpdateToCustomerPeriod >= CONFIG.responseDelayThresholdDays) reasons.push("Response delay detected");
    if (dateCreated && daysBetween(today, dateCreated) > CONFIG.caseAgingThresholdDays) reasons.push("case aging beyond threshold");
    if (sentimentScore <= 25) reasons.push("Negative Sentiment Detected");
    if (hoursToDue !== null && hoursToDue > 0 && hoursToDue <= 24) reasons.push("SLA risk approaching");
    if (lastUpdateFromCustomerPeriod < CONFIG.customerEngagedThresholdDays) reasons.push("Customer Actively engaged");
    if (oca > CONFIG.highOcaThreshold) reasons.push("High OCA");
    if (normalizeText(row["Update Case SLA Met"]) === "no") reasons.push("Update SLA failed");
    if (normalizeText(row["First Response SLA Met"]) === "no") reasons.push("First SLA failed");
    if (lastReopenedDate) reasons.push("Case Reopened");
    const Escalation_Reason = uniqueJoin(reasons);

    let Escalation_Risk_Band = "Low";
    if (Escalation_Probability >= 75) Escalation_Risk_Band = "Critical";
    else if (Escalation_Probability >= 55) Escalation_Risk_Band = "High";
    else if (Escalation_Probability >= 30) Escalation_Risk_Band = "Medium";

    // Pending / resolution -> Low (intended business rule).
    if (isLowRiskStatus(statusReason)) Escalation_Risk_Band = "Low";
    // Already escalated -> its own category (placed last so it wins over Low).
    if (!isNullish(escalatedDate)) Escalation_Risk_Band = "Escalated";

    return {
      Escalation_Probability,
      Escalation_Risk_Band,
      Escalation_Reason,
      Escalation_Potential_Reason: Escalation_Reason, // alias for existing pipeline consumers
    };
  }

  function scoreRows(rows) {
    return rows.map((r) => Object.assign({}, r, scoreRow(r)));
  }

  return { scoreRow, scoreRows, isLowRiskStatus, CONFIG };
});
