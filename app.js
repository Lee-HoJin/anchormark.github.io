const files = {
  mainCsv: "./main_results(tokens190~200).csv",
};

const htmlReports = [
  { title: "Anchor Detection: Window 3 Gamma 0.6", path: "./anchor_detection_window3_gamma0.6.html" },
  { title: "Anchor Quality: Rep Split", path: "./debug_rep_split_para_lex60_order0.html?v=20260528-0953" },
  { title: "Anchor Quality: Anchor Gamma 0.6", path: "./debug_window3_30_para_lex60_order0.html" },
  { title: "Anchor Quality: New Method", path: "./debug_window3_30_new_method_para_lex60_order0.html" },
];

const state = {
  main: { path: "", rows: [], headers: [], filteredRows: [], metrics: [], selectedMetric: "" },
};

const charts = {
  mainOriginal: null,
  mainParaphrased: null,
};

const els = {
  mainFiles: document.querySelector("#mainFiles"),
  mainRows: document.querySelector("#mainRows"),
  reportCount: document.querySelector("#reportCount"),
  mainStatus: document.querySelector("#mainStatus"),
  mainMetricSelect: document.querySelector("#mainMetricSelect"),
  mainSearchInput: document.querySelector("#mainSearchInput"),
  downloadMainCsv: document.querySelector("#downloadMainCsv"),
  mainOriginalChart: document.querySelector("#mainOriginalChart"),
  mainParaphrasedChart: document.querySelector("#mainParaphrasedChart"),
  mainEmpty: document.querySelector("#mainEmpty"),
  mainTableHead: document.querySelector("#mainTableHead"),
  mainTableBody: document.querySelector("#mainTableBody"),
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
  const headers = (rows.shift() ?? []).map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header));
  return {
    headers,
    rows: rows.map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    ),
  };
}

function fileLabel(path) {
  return decodeURIComponent(path.split("/").pop() || path);
}

function fetchPath(path, options) {
  return fetch(encodeURI(path), options);
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

function axisBounds(values) {
  if (!values.length) return { min: 0, max: 1 };

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue;
  const padding = range > 0 ? range * 0.22 : Math.max(Math.abs(maxValue) * 0.04, 0.05);
  const min = minValue >= 0 ? Math.max(0, minValue - padding) : minValue - padding;
  const max = maxValue + padding;

  return { min, max: max > min ? max : min + 1 };
}

function formatBarLabel(value) {
  return Number.isFinite(value) ? value.toFixed(4) : "";
}

const barValueLabelPlugin = {
  id: "barValueLabelPlugin",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = "#18201f";
    ctx.font = "600 10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;

      meta.data.forEach((bar, index) => {
        const label = formatBarLabel(Number(dataset.data[index]));
        if (!label) return;

        ctx.save();
        ctx.translate(bar.x + 2, bar.y - 8);
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      });
    });

    ctx.restore();
  },
};

function isZScore(name) {
  return /z[\s_-]*score|zscore/i.test(name);
}

function isOriginalName(name) {
  return /(^|[_\s-])(orig|original|watermarked|wm)([_\s-]|$)/i.test(name);
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

function stripMetricSplit(name) {
  return String(name)
    .replace(/^(orig|original|watermarked|wm|para|paraphrase|paraphrased|rewrite|rewritten)\s+/i, "")
    .trim();
}

function getMainMetricNames(headers, rows) {
  if (headers[0]?.toLowerCase() === "metrics") {
    return [...new Set(rows.map((row) => stripMetricSplit(row.metrics)).filter(Boolean))];
  }

  return pickNumericColumns(headers, rows)
    .map(metricLabel)
    .filter(Boolean);
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

  return {
    original: buildWideMainGroup(rows.slice(0, 3), labelColumn, originalMetrics),
    paraphrased: buildWideMainGroup(rows.slice(3, 6), labelColumn, paraphrasedMetrics),
  };
}
function findMainMetricRow(rows, split, metric) {
  const splitPatterns = {
    watermarked: /^(orig|original|watermarked|wm)\s+/i,
    paraphrased: /^(para|paraphrase|paraphrased|rewrite|rewritten)\s+/i,
  };
  const splitPattern = splitPatterns[split];

  return rows.find((row) => {
    const name = String(row.metrics || "");
    return splitPattern.test(name) && stripMetricSplit(name).toLowerCase() === metric.toLowerCase();
  });
}

function buildMainChartGroups(headers, rows, metric) {
  if (headers[0]?.toLowerCase() === "metrics") {
    const modelColumns = headers.slice(1);
    const watermarkedRow = findMainMetricRow(rows, "watermarked", metric);
    const paraphrasedRow = findMainMetricRow(rows, "paraphrased", metric);

    function makeGroup(label, row) {
      return {
        labels: modelColumns,
        datasets: row
          ? [
              {
                label,
                values: modelColumns.map((model) => numericValue(row[model]) ?? 0),
              },
            ]
          : [],
      };
    }

    return {
      original: makeGroup("Watermarked", watermarkedRow),
      paraphrased: makeGroup("Paraphrased", paraphrasedRow),
    };
  }

  const labelColumn = pickLabelColumn(headers, rows);
  const numericColumns = pickNumericColumns(headers, rows).filter((header) => header !== labelColumn);

  return {
    original: buildWideMainGroup(rows, labelColumn, numericColumns.slice(0, 3)),
    paraphrased: buildWideMainGroup(rows, labelColumn, numericColumns.slice(3, 6)),
  };
}

function clearMainCharts() {
  Object.keys(charts).forEach((key) => {
    if (!charts[key]) return;
    charts[key].destroy();
    charts[key] = null;
  });
}

function renderGroupedBarChart(canvas, group, chartKey) {
  if (!canvas || !group?.datasets.length) return;
  if (charts[chartKey]) charts[chartKey].destroy();
  const colors = chartColors(group.datasets.length);
  const values = group.datasets.flatMap((dataset) => dataset.values).filter(Number.isFinite);
  const barColors = chartColors(group.labels.length);
  const yAxis = axisBounds(values);
  charts[chartKey] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: group.labels,
      datasets: group.datasets.map((dataset, index) => ({
        label: dataset.label,
        data: dataset.values,
        backgroundColor: group.datasets.length === 1 ? barColors : colors[index],
        borderRadius: 7,
        borderSkipped: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 28 } },
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, color: "#18201f" } },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: { ticks: { color: "#68746f" }, grid: { display: false } },
        y: {
          min: yAxis.min,
          max: yAxis.max,
          ticks: { color: "#68746f" },
          grid: { color: "#ebe4d5" },
        },
      },
    },
    plugins: [barValueLabelPlugin],
  });
}

function renderMainChart() {
  const { headers, rows } = state.main;
  const metric = state.main.selectedMetric || state.main.metrics[0] || "";
  const groups = buildMainChartGroups(headers, rows, metric);

  if (!rows.length || (!groups.original.datasets.length && !groups.paraphrased.datasets.length)) {
    clearMainCharts();
    showEmpty(els.mainEmpty, `${fileLabel(state.main.path || "main_results.csv")} loaded, but no watermarked/paraphrased values were found for ${metric || "the selected metric"}.`);
    console.warn("main_results headers:", headers);
    console.warn("main_results rows:", rows);
    return;
  }

  els.mainEmpty.hidden = true;
  renderGroupedBarChart(els.mainOriginalChart, groups.original, "mainOriginal");
  renderGroupedBarChart(els.mainParaphrasedChart, groups.paraphrased, "mainParaphrased");
}

function formatCell(value) {
  if (/^https?:\/\//i.test(value)) {
    return `<a href="${escapeAttribute(value)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`;
  }
  return escapeHtml(value);
}

function renderMainTable() {
  const { headers, filteredRows } = state.main;
  els.mainTableHead.innerHTML = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`;
  if (filteredRows.length === 0) {
    els.mainTableBody.innerHTML = `<tr><td class="empty" colspan="${headers.length || 1}">No rows match the current search.</td></tr>`;
    return;
  }
  els.mainTableBody.innerHTML = filteredRows
    .map((row) => `<tr>${headers.map((header) => `<td>${formatCell(row[header] ?? "")}</td>`).join("")}</tr>`)
    .join("");
}

function applyMainSearch() {
  const query = els.mainSearchInput.value.trim().toLowerCase();
  state.main.filteredRows = state.main.rows.filter((row) =>
    query ? Object.values(row).join(" ").toLowerCase().includes(query) : true,
  );
  renderMainTable();
}

function renderReports() {
  els.reportCount.textContent = htmlReports.length.toLocaleString();
  els.reportGrid.innerHTML = htmlReports
    .map(
      (report) => `<a class="reportCard" href="${escapeAttribute(report.path)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(report.title)}</strong><span>${escapeHtml(report.path)}</span></a>`,
    )
    .join("");
}

async function loadMainCsv(path) {
  try {
    clearMainCharts();
    const response = await fetchPath(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const main = { path, ...parseCsv(await response.text()) };
    const metrics = getMainMetricNames(main.headers, main.rows);
    state.main = { ...main, filteredRows: main.rows, metrics, selectedMetric: metrics[0] || "" };
    els.mainRows.textContent = main.rows.length.toLocaleString();
    setStatus(els.mainStatus, "ready", fileLabel(path));
    els.mainMetricSelect.innerHTML = metrics
      .map((metric) => `<option value="${escapeAttribute(metric)}">${escapeHtml(metric)}</option>`)
      .join("");
    els.mainSearchInput.value = "";
    renderMainChart();
    renderMainTable();
  } catch (error) {
    setStatus(els.mainStatus, "missing", "Missing");
    showEmpty(els.mainEmpty, `Could not load ${fileLabel(path)}.`);
    els.mainRows.textContent = "0";
    els.mainTableHead.innerHTML = "";
    els.mainTableBody.innerHTML = `<tr><td class="empty">Could not load ${escapeHtml(fileLabel(path))}.</td></tr>`;
    console.error(error);
  }
}

async function initMainResults() {
  try {
    els.mainFiles.textContent = "1";
    await loadMainCsv(files.mainCsv);
  } catch (error) {
    setStatus(els.mainStatus, "missing", "Missing");
    showEmpty(els.mainEmpty, "Could not find any main_results CSV files.");
    console.error(error);
  }
}

els.mainMetricSelect.addEventListener("change", () => {
  state.main.selectedMetric = els.mainMetricSelect.value;
  renderMainChart();
});
els.mainSearchInput.addEventListener("input", applyMainSearch);
els.downloadMainCsv.addEventListener("click", () => {
  if (state.main.path) window.location.href = state.main.path;
});

renderReports();
initMainResults();
