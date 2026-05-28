const params = new URLSearchParams(window.location.search);
function reportFileParam(value) {
  if (!value) return "debug_window3_30_para_lex60_order0.jsonl";
  return value.split(/[\\/]/).pop();
}

const file = reportFileParam(params.get("file"));
const title = params.get("title") || "Anchor Quality Report";

const preferredTextFields = [
  "text",
  "prompt",
  "response",
  "completion",
  "generated_text",
  "watermarked_text",
  "paraphrased_text",
  "original_text",
  "original",
  "watermarked",
  "paraphrase",
  "output",
];

const originalAnchorPattern =
  /(^|_)(anchor|anchors|anchor_tokens|selected_tokens|marked_tokens|green_tokens|original_anchor)/i;
const paraphraseAnchorPattern =
  /(para|paraphrase|paraphrased|rewrite|rewritten).*(anchor|token)|(anchor|token).*(para|paraphrase|paraphrased|rewrite|rewritten)/i;

const els = {
  title: document.querySelector("#reportTitle"),
  source: document.querySelector("#reportSource"),
  summary: document.querySelector("#summaryGrid"),
  list: document.querySelector("#sampleList"),
  empty: document.querySelector("#reportEmpty"),
  search: document.querySelector("#reportSearch"),
  mode: document.querySelector("#fieldMode"),
};

const state = {
  rows: [],
  filtered: [],
};

els.title.textContent = title;
els.source.textContent = file;

function parseJsonl(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return { line: index + 1, parse_error: error.message, raw: line };
      }
    });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stringify(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function numericValue(value) {
  const parsed = Number.parseFloat(String(value).replaceAll("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function highlighted(value, query) {
  const text = escapeHtml(stringify(value));
  if (!query) return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escapedQuery, "gi"), (match) => `<mark>${match}</mark>`);
}

function flattenTokens(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(flattenTokens);
  if (typeof value === "object") return Object.values(value).flatMap(flattenTokens);
  return String(value)
    .split(/[\s,|/]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function anchorSets(row) {
  const original = new Set();
  const paraphrase = new Set();

  Object.entries(row).forEach(([field, value]) => {
    const tokens = flattenTokens(value);
    if (tokens.length === 0) return;

    if (paraphraseAnchorPattern.test(field)) {
      tokens.forEach((token) => paraphrase.add(token));
    } else if (originalAnchorPattern.test(field)) {
      tokens.forEach((token) => original.add(token));
    }
  });

  return { original, paraphrase };
}

function tokenClass(token, anchors) {
  const bare = token.replace(/^[^\p{L}\p{N}_-]+|[^\p{L}\p{N}_-]+$/gu, "");
  const inOriginal = anchors.original.has(token) || anchors.original.has(bare);
  const inParaphrase = anchors.paraphrase.has(token) || anchors.paraphrase.has(bare);
  if (inOriginal && inParaphrase) return "anchorBoth";
  if (inOriginal) return "anchorOriginal";
  if (inParaphrase) return "anchorParaphrase";
  return "";
}

function highlightedText(value, query, anchors) {
  return stringify(value)
    .split(/(\s+)/)
    .map((piece) => {
      if (/^\s+$/.test(piece)) return piece;
      const escaped = highlighted(piece, query);
      const cls = tokenClass(piece, anchors);
      return cls ? `<span class="anchorToken ${cls}">${escaped}</span>` : escaped;
    })
    .join("");
}

function textEntries(row) {
  const entries = Object.entries(row);
  const preferred = preferredTextFields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]]);
  const longStrings = entries.filter(([field, value]) => !preferredTextFields.includes(field) && typeof value === "string" && value.length > 80);
  return [...preferred, ...longStrings].slice(0, 4);
}

function compactFields(row) {
  return Object.entries(row).filter(([field, value]) => !preferredTextFields.includes(field) && stringify(value).length <= 220);
}

function renderSummary() {
  const keys = [...new Set(state.rows.flatMap((row) => Object.keys(row)))];
  const numericKeys = keys.filter((key) => state.rows.some((row) => numericValue(row[key]) !== null));
  const metricCards = numericKeys.slice(0, 3).map((key) => {
    const values = state.rows.map((row) => numericValue(row[key])).filter((value) => value !== null);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { label: `Avg ${key}`, value: Number.isFinite(avg) ? avg.toFixed(3) : "0" };
  });
  const cards = [{ label: "Samples", value: state.rows.length.toLocaleString() }, { label: "Fields", value: keys.length.toLocaleString() }, ...metricCards];
  els.summary.innerHTML = cards.map((card) => `<article><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></article>`).join("");
}

function renderRows() {
  const query = els.search.value.trim();
  const showAll = els.mode.value === "all";

  if (state.filtered.length === 0) {
    els.list.innerHTML = "";
    els.empty.hidden = false;
    els.empty.textContent = "No samples match the current search.";
    return;
  }

  els.empty.hidden = true;
  els.list.innerHTML = state.filtered
    .map((row, index) => {
      const name = row.id ?? row.sample_id ?? row.example_id ?? row.filename ?? row.file ?? `Sample ${index + 1}`;
      const meta = Object.entries(row)
        .filter(([field, value]) => /score|rate|detect|z|p_value|pvalue|window|anchor|order/i.test(field) && stringify(value))
        .slice(0, 5)
        .map(([field, value]) => `${field}: ${stringify(value)}`)
        .join(" | ");
      const texts = textEntries(row);
      const fields = showAll ? Object.entries(row) : compactFields(row);
      const anchors = anchorSets(row);

      return `<article class="sampleCard">
        <div class="sampleHeader">
          <strong>${highlighted(name, query)}</strong>
          <span class="sampleMeta">${highlighted(meta || `Row ${index + 1}`, query)}</span>
        </div>
        <div class="legend">
          <span><span class="anchorToken anchorOriginal">Original anchor</span></span>
          <span><span class="anchorToken anchorParaphrase">Paraphrased anchor</span></span>
          <span><span class="anchorToken anchorBoth">Both</span></span>
        </div>
        <div class="textGrid">
          ${
            texts.length
              ? texts.map(([field, value]) => `<section class="textBlock"><h3>${escapeHtml(field)}</h3><p>${highlightedText(value, query, anchors)}</p></section>`).join("")
              : `<section class="textBlock"><h3>Raw</h3><p>${highlightedText(row, query, anchors)}</p></section>`
          }
        </div>
        <div class="fieldGrid">
          ${fields.map(([field, value]) => `<div class="fieldItem"><span class="fieldName">${escapeHtml(field)}</span><p class="fieldValue">${highlighted(value, query)}</p></div>`).join("")}
        </div>
      </article>`;
    })
    .join("");
}

function applyFilters() {
  const query = els.search.value.trim().toLowerCase();
  state.filtered = state.rows.filter((row) => (query ? JSON.stringify(row).toLowerCase().includes(query) : true));
  renderRows();
}

async function init() {
  try {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.rows = parseJsonl(await response.text());
    state.filtered = state.rows;
    renderSummary();
    renderRows();
  } catch (error) {
    els.empty.hidden = false;
    els.empty.textContent = `Could not load ${file}.`;
    console.error(error);
  }
}

els.search.addEventListener("input", applyFilters);
els.mode.addEventListener("change", renderRows);

init();
