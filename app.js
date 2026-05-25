const files = {
  detection: ["../outputs/detection/detection_results.csv"],
  main: ["./main_results.csv", "../outputs/main_results.csv", "../outputs/detection/main_results.csv"],
  hyper: ["./hyperparameter_analysis.csv", "../outputs/hyperparameter_analysis.csv", "../outputs/detection/hyperparameter_analysis.csv"],
};

const htmlReports = [
  { title: "Anchor Quality: KGW", path: "./debug_window3_30_para_lex60_order0.html" },
  { title: "Anchor Quality: New Method", path: "./debug_window3_30_new_method_para_lex60_order0.html" },
];

const state = {
  detection: { rows: [], headers: [], filteredRows: [] },
  main: { rows: [], headers: [] },
  hyper: { rows: [], headers: [] },
};

const els = {
  mainRows: document.querySelector("#mainRows"),
  hyperRows: document.querySelector("#hyperRows"),
  reportCount: document.querySelector("#reportCount"),
  mainStatus: document.querySelector("#mainStatus"),
  mainOriginalChart: document.querySelector("#mainOriginalChart"),
  mainParaphrasedChart: document.querySelector("#mainParaphrasedChart"),
  hyperStatus: document.querySelector("#hyperStatus"),
  hyperChart: document.querySelector("#hyperChart"),
  mainEmpty: document.querySelector("#mainEmpty"),
  hyperEmpty: document.querySelector("#hyperEmpty"),
  tableHead: document.querySelector("#tableHead"),
  tableBody: document.querySelector("#tableBody"),
  searchInput: document.querySelector("#searchInput"),
  resultFilter: document.querySelector("#resultFilter"),
  downloadCsv: document.querySelector("#downloadCsv"),
  reportGrid: document.querySelector("#reportGrid"),
};

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  const headers = rows.shift() ?? [];
  return {
    headers,
    rows: rows.map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    ),
  };
}

async function loadFirst(paths) {
  const errors = [];
  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { path, ...parseCsv(await response.text()) };
    } catch (error) {
      errors.push(`${path}: ${error.message}`);
    }
  }
  throw new Error(errors.join("\n"));
}

function numericValue(value) {
  const parsed = Number.parseFloat(String(value).replaceAll("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function setStatus(element, type, text) {
  element.className = `status ${type}`;
  element.textContent = text;
}

function showEmpty(element, message) {
  element.hidden = false;
  element.textContent = message;
}

function chartColors(count) {
  const palette = ["#0c7a75", "#d9664f", "#d6a13d", "#6f5b89", "#3f6f9f", "#6f7d42"];
  return Array.from({ length: count }, (_, index) => palette[index % palette.length]);
}

function isZScore(name) {
  return /z[\s_-]*score|zscore/i.test(name);
}

function isOriginalName(name) {
  return /(^|[_\s-])(orig|original)([_\s-]|$)/i.test(name);
}

function isParaphrasedName(name) {
  return /para|paraphrase|paraphrased|rewrite|rewritten/i.test(name);
}

function pickLabelColumn(headers, rows) {
  const named = headers.find((header) => /method|model|attack|dataset|name|type|config|setting/i.test(header));
  if (named) return named;
  return headers.find((header) => rows.some((row) => numericValue(row[header]) === null && row[header] !== "")) ?? headers[0];
}

function pickNumericColumns(headers, rows) {
  return headers.filter((header) => rows.some((row) => numericValue(row[header]) !== null));
}

function metricLabel(header) {
  return header
    .replace(/(^|[_\s-])(orig|original|para|paraphrase|paraphrased|rewrite|rewritten)([_\s-]|$)/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildWideMainGroup(rows, labelColumn, columns) {
  return {
    labels: rows.map((row, index) => row[labelColumn] || `Row ${index + 1}`),
    datasets: columns.map((column) => ({
      label: metricLabel(column) || column,
      values: rows.map((row) => numericValue(row[column]) ?? 0),
    })),
  };
}

function buildLongMainGroups(headers, rows) {
  const metricColumn = headers.find((header) => /metric|measure|score|name/i.test(header));
  const groupColumn = headers.find((header) => /group|split|variant|text|condition|type/i.test(header));
  const labelColumn = headers.find((header) => /method|model|attack|dataset|config|setting/i.test(header));
  const valueColumn =
    headers.find((header) => /value|mean|avg|result|rate|score/i.test(header) && rows.some((row) => numericValue(row[header]) !== null)) ??
    pickNumericColumns(headers, rows)[0];

  if (!metricColumn || !valueColumn) return null;

  const labels = [...new Set(rows.map((row) => row[labelColumn] || row.method || row.model || "Result"))];
  const originalMetrics = [...new Set(rows.filter((row) => isOriginalName(row[groupColumn] || row[metricColumn])).map((row) => row[metricColumn]))]
    .filter((metric) => !isZScore(metric))
    .slice(0, 3);
  const paraphrasedMetrics = [...new Set(rows.filter((row) => isParaphrasedName(row[groupColumn] || row[metricColumn])).map((row) => row[metricColumn]))]
    .filter((metric) => !isZScore(metric))
    .slice(0, 3);

  function makeGroup(metrics, fallbackRows) {
    const selected = metrics.length
      ? metrics
      : [...new Set(fallbackRows.map((row) => row[metricColumn]))].filter((metric) => !isZScore(metric)).slice(0, 3);
    return {
      labels,
      datasets: selected.map((metric) => ({
        label: metricLabel(metric) || metric,
        values: labels.map((label) => {
          const row = rows.find(
            (candidate) =>
              (candidate[labelColumn] || candidate.method || candidate.model || "Result") === label &&
              candidate[metricColumn] === metric,
          );
          return numericValue(row?.[valueColumn]) ?? 0;
        }),
      })),
    };
  }

  return {
    original: makeGroup(originalMetrics, rows.slice(0, 3)),
    paraphrased: makeGroup(paraphrasedMetrics, rows.slice(3, 6)),
  };
}

function buildMainChartGroups(headers, rows) {
  if (headers[0]?.toLowerCase() === "metrics") {
    const modelColumns = headers.slice(1);

    function rowFor(label) {
      return rows.find((row) => String(row.metrics).toLowerCase() === label.toLowerCase());
    }

    function makeGroup(prefix) {
      const metricRows = [
        ["AUC", rowFor(`${prefix} AUC`)],
        ["F1", rowFor(`${prefix} F1`)],
        ["ACC", rowFor(`${prefix} Acc`)],
      ].filter(([, row]) => row);

      return {
        labels: modelColumns,
        datasets: metricRows.map(([metric, row]) => ({
          label: metric,
          values: modelColumns.map((model) => numericValue(row[model]) ?? 0),
        })),
      };
    }

    return {
      original: makeGroup("Original"),
      paraphrased: makeGroup("Paraphrased"),
    };
  }

  return {
    original: buildWideMainGroup(rows, labelColumn, numericColumns.slice(0, 3)),
    paraphrased: buildWideMainGroup(rows, labelColumn, numericColumns.slice(3, 6)),
  };
}

function renderGroupedBarChart(canvas, group) {
  if (!canvas || !group?.datasets.length) return;
  const colors = chartColors(group.datasets.length);
  new Chart(canvas, {
    type: "bar",
    data: {
      labels: group.labels,
      datasets: group.datasets.map((dataset, index) => ({
        label: dataset.label,
        data: dataset.values,
        backgroundColor: colors[index],
        borderRadius: 7,
        borderSkipped: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, color: "#18201f" } },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: { ticks: { color: "#68746f" }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: "#68746f" }, grid: { color: "#ebe4d5" } },
      },
    },
  });
}

function renderMainChart() {
  const { headers, rows } = state.main;
  const groups = buildMainChartGroups(headers, rows);

  if (!rows.length || (!groups.original.datasets.length && !groups.paraphrased.datasets.length)) {
    showEmpty(els.mainEmpty, "main_results.csv loaded, but no original/paraphrased numeric metric columns were found.");
    console.warn("main_results headers:", headers);
    console.warn("main_results rows:", rows);
    return;
  }

  renderGroupedBarChart(els.mainOriginalChart, groups.original);
  renderGroupedBarChart(els.mainParaphrasedChart, groups.paraphrased);
}

function renderHyperChart() {
  const { headers, rows } = state.hyper;
  const labelColumn =
    headers.find((header) => /param|alpha|beta|gamma|lambda|threshold|step|x|value/i.test(header)) ??
    headers[0];
  const numericColumns = pickNumericColumns(headers, rows).filter((header) => header !== labelColumn);
  if (!rows.length || !labelColumn || numericColumns.length === 0) {
    showEmpty(els.hyperEmpty, "hyperparameter_analysis.csv loaded, but no line-series columns were found.");
    return;
  }
  const colors = chartColors(numericColumns.length);
  new Chart(els.hyperChart, {
    type: "line",
    data: {
      labels: rows.map((row, index) => row[labelColumn] || `Row ${index + 1}`),
      datasets: numericColumns.map((column, index) => ({
        label: column,
        data: rows.map((row) => numericValue(row[column]) ?? null),
        borderColor: colors[index],
        backgroundColor: colors[index],
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.32,
        spanGaps: true,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, color: "#18201f" } } },
      scales: {
        x: { ticks: { color: "#68746f" }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: "#68746f" }, grid: { color: "#ebe4d5" } },
      },
    },
  });
}

function isDetected(row) {
  const direct = Object.entries(row).find(([key]) => /detect|watermark|prediction|result/i.test(key));
  const value = String(direct?.[1] ?? Object.values(row).join(" ")).toLowerCase();
  if (/\b(not detected|false|clean|negative|no watermark|benign)\b/.test(value)) return false;
  return /\b(detected|true|watermarked|positive|yes)\b/.test(value);
}

function formatCell(header, value, row) {
  if (/detect|watermark|prediction|result/i.test(header)) {
    const detected = isDetected(row);
    return `<span class="pill ${detected ? "good" : "bad"}">${escapeHtml(value || (detected ? "Detected" : "Not detected"))}</span>`;
  }
  if (/^https?:\/\//i.test(value)) {
    return `<a href="${escapeAttribute(value)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`;
  }
  return escapeHtml(value);
}

function renderTable() {
  const { headers, filteredRows } = state.detection;
  els.tableHead.innerHTML = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`;
  if (filteredRows.length === 0) {
    els.tableBody.innerHTML = `<tr><td class="empty" colspan="${headers.length || 1}">No rows match the current filters.</td></tr>`;
    return;
  }
  els.tableBody.innerHTML = filteredRows
    .map((row) => `<tr>${headers.map((header) => `<td>${formatCell(header, row[header] ?? "", row)}</td>`).join("")}</tr>`)
    .join("");
}

function applyFilters() {
  const query = els.searchInput.value.trim().toLowerCase();
  const filter = els.resultFilter.value;
  state.detection.filteredRows = state.detection.rows.filter((row) => {
    const detected = isDetected(row);
    const matchesFilter = filter === "all" || (filter === "detected" && detected) || (filter === "not-detected" && !detected);
    const matchesQuery = query === "" || Object.values(row).join(" ").toLowerCase().includes(query);
    return matchesFilter && matchesQuery;
  });
  renderTable();
}

function renderReports() {
  els.reportCount.textContent = htmlReports.length.toLocaleString();
  els.reportGrid.innerHTML = htmlReports
    .map(
      (report) => `<a class="reportCard" href="${escapeAttribute(report.path)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(report.title)}</strong><span>${escapeHtml(report.path)}</span></a>`,
    )
    .join("");
}

async function initCharts() {
  try {
    const main = await loadFirst(files.main);
    state.main = main;
    els.mainRows.textContent = main.rows.length.toLocaleString();
    setStatus(els.mainStatus, "ready", main.path);
    renderMainChart();
  } catch (error) {
    setStatus(els.mainStatus, "missing", "Missing");
    showEmpty(els.mainEmpty, "Could not load main_results.csv. Check the path list in app.js.");
    console.error(error);
  }
  try {
    const hyper = await loadFirst(files.hyper);
    state.hyper = hyper;
    els.hyperRows.textContent = hyper.rows.length.toLocaleString();
    setStatus(els.hyperStatus, "ready", hyper.path);
    renderHyperChart();
  } catch (error) {
    setStatus(els.hyperStatus, "missing", "Missing");
    showEmpty(els.hyperEmpty, "Could not load hyperparameter_analysis.csv. Check the path list in app.js.");
    console.error(error);
  }
}

async function initTable() {
  try {
    const detection = await loadFirst(files.detection);
    state.detection = { ...detection, filteredRows: detection.rows };
    renderTable();
  } catch (error) {
    els.tableBody.innerHTML = `<tr><td class="empty">Could not load detection_results.csv.</td></tr>`;
    console.error(error);
  }
}

els.searchInput.addEventListener("input", applyFilters);
els.resultFilter.addEventListener("change", applyFilters);
els.downloadCsv.addEventListener("click", () => {
  window.location.href = files.detection[0];
});

renderReports();
initCharts();
initTable();
