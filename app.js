/* ============================================================
   YouTube Insights Dashboard — app.js
   ============================================================ */

const DATA_URL = 'https://storage.googleapis.com/angelgarciadatablog-analytics/daily/view-channel-growth-daily.json';

// Chart instances (kept for destroy/re-render on filter)
let chartGrowth = null;
let chartDailyViews = null;
let chartGrowthRate = null;

// Full dataset (sorted ascending by date)
let allData = [];

// ============================================================
// INIT
// ============================================================
async function init() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();

    // Sort ascending
    allData = raw.slice().sort((a, b) => new Date(a.snapshot_date) - new Date(b.snapshot_date));

    setupDatePicker();
    applyFilter();
    updateLastUpdate(allData);
  } catch (err) {
    console.error('Error loading data:', err);
    showError();
  }
}

// ============================================================
// DATE PICKER
// ============================================================
function setupDatePicker() {
  const from = document.getElementById('date-from');
  const to   = document.getElementById('date-to');
  // Use effective dates (snapshot - 1 day) so picker matches chart labels
  const minDate = effectiveDateStr(allData[0].snapshot_date);
  const maxDate = effectiveDateStr(allData[allData.length - 1].snapshot_date);

  from.min = minDate; from.max = maxDate;
  to.min   = minDate; to.max   = maxDate;
  to.value = maxDate;

  // Preset buttons
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.dataset.days, 10);
      const newFrom = new Date(maxDate);
      newFrom.setDate(newFrom.getDate() - (days - 1));
      from.value = newFrom.toISOString().slice(0, 10);
      to.value   = maxDate;
      setActivePreset(btn.id);
      applyFilter();
    });
  });

  // Deactivate preset when user edits dates manually
  from.addEventListener('change', () => { setActivePreset(null); applyFilter(); });
  to.addEventListener('change',   () => { setActivePreset(null); applyFilter(); });

  // Default: last 7 days
  document.getElementById('btn-preset-7').click();
}

function applyFilter() {
  const from = document.getElementById('date-from').value;
  const to   = document.getElementById('date-to').value;

  const filtered = allData.filter(d => {
    const date = effectiveDateStr(d.snapshot_date);
    return date >= from && date <= to;
  });

  if (filtered.length === 0) return;
  renderAll(filtered);
  updateFooterRange(filtered);
  updateDaysBadge(from, to);
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll(data) {
  renderKPIs(data);
  renderChartGrowth(data);
  renderChartDailyViews(data);
  renderChartGrowthRate(data);
  updateFooterRange(data);
}

// ============================================================
// KPI CARDS
// ============================================================
function renderKPIs(data) {
  const latest  = data[data.length - 1];
  const prev7   = data.length >= 8 ? data[data.length - 8] : data[0];

  // Suscriptores — delta semanal siempre sobre el dataset completo
  const latestGlobal = allData[allData.length - 1];
  const prev7Global  = allData.length >= 8 ? allData[allData.length - 8] : allData[0];
  const subsDelta    = latestGlobal.subscriber_count - prev7Global.subscriber_count;
  const subsNote     = 'vs. hace 7 días';

  // Vistas totales — delta desde el snapshot anterior (ayer)
  const prevDay = data.length >= 2 ? data[data.length - 2] : null;
  const viewsDelta = prevDay ? latest.view_count - prevDay.view_count : null;

  // Videos — delta semanal
  const videosDelta = latest.video_count - prev7.video_count;

  // Promedio de nuevas vistas por día — siempre sobre los últimos 7 snapshots del dataset completo
  const last7Global = allData.slice(-7);
  const validDailyViews = last7Global.map(d => d.new_views_daily).filter(v => v !== null && v !== undefined);
  const avgDailyViews = validDailyViews.length > 0
    ? Math.round(validDailyViews.reduce((a, b) => a + b, 0) / validDailyViews.length)
    : null;

  const kpis = [
    {
      label: 'Suscriptores',
      value: formatNumber(latestGlobal.subscriber_count),
      delta: subsDelta,
      deltaLabel: subsDelta === 0
        ? 'Sin cambio esta semana'
        : `${subsDelta > 0 ? '+' : ''}${subsDelta} esta semana`,
      deltaClass: subsDelta > 0 ? 'kpi-delta--up' : subsDelta < 0 ? 'kpi-delta--down' : 'kpi-delta--neutral',
      period: subsNote,
    },
    {
      label: 'Vistas Totales',
      value: formatNumber(latest.view_count),
      delta: viewsDelta,
      deltaLabel: viewsDelta !== null
        ? `${viewsDelta > 0 ? '+' : ''}${formatNumber(viewsDelta)} desde el último snapshot`
        : 'Sin datos previos',
      deltaClass: viewsDelta > 0 ? 'kpi-delta--up' : viewsDelta < 0 ? 'kpi-delta--down' : 'kpi-delta--neutral',
      period: `Snapshot: ${formatDate(latest.snapshot_date)}`,
    },
    {
      label: 'Videos Publicados',
      value: formatNumber(latest.video_count),
      delta: videosDelta,
      deltaLabel: videosDelta === 0
        ? 'Sin nuevos videos esta semana'
        : `${videosDelta > 0 ? '+' : ''}${videosDelta} esta semana`,
      deltaClass: videosDelta > 0 ? 'kpi-delta--up' : videosDelta < 0 ? 'kpi-delta--down' : 'kpi-delta--neutral',
      period: 'vs. hace 7 días',
    },
    {
      label: 'Vistas / Día',
      value: avgDailyViews !== null ? formatNumber(avgDailyViews) : '—',
      deltaLabel: avgDailyViews !== null ? 'Promedio últimos 7 días' : 'Sin datos suficientes',
      deltaClass: avgDailyViews > 0 ? 'kpi-delta--up' : 'kpi-delta--neutral',
      period: 'nuevas vistas por día',
    },
  ];

  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <span class="kpi-label">${k.label}</span>
      <span class="kpi-value">${k.value}</span>
      <span class="kpi-delta ${k.deltaClass}">${k.deltaLabel}</span>
      <span class="kpi-period">${k.period}</span>
    </div>
  `).join('');
}

// ============================================================
// CHART: Crecimiento Acumulado (dual axis)
// ============================================================
function renderChartGrowth(data) {
  const timeline = buildDailyTimeline(data);
  const labels = timeline.map(d => formatDateShort(d.snapshot_date));
  const views  = timeline.map(d => d._missing ? null : d.view_count);
  const subs   = timeline.map(d => d._missing ? null : d.subscriber_count);

  // Calcular rangos ignorando nulls (días sin snapshot)
  const validViews = views.filter(v => v !== null);
  const validSubs  = subs.filter(v => v !== null);
  const viewsMin = Math.min(...validViews);
  const viewsMax = Math.max(...validViews);
  const viewsRange = viewsMax - viewsMin || 1;
  const subsMin = Math.min(...validSubs);
  const subsMax = Math.max(...validSubs);
  const subsRange = subsMax - subsMin || 1;

  const ctx = document.getElementById('chart-growth').getContext('2d');
  if (chartGrowth) chartGrowth.destroy();

  chartGrowth = new Chart(ctx, {
    type: 'line',
    plugins: [ChartDataLabels],
    data: {
      labels,
      datasets: [
        {
          label: 'Vistas',
          data: views,
          borderColor: '#2674ed',
          backgroundColor: 'rgba(38,116,237,0.08)',
          borderWidth: 2,
          pointRadius: data.length > 30 ? 0 : 3,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.3,
          yAxisID: 'y',
          datalabels: {
            display: data.length <= 30,
            align: 'top',
            anchor: 'end',
            color: '#b0b0b0',
            font: { size: 10, weight: '500' },
            formatter: v => formatNumberCompact(v),
          },
        },
        {
          label: 'Suscriptores',
          data: subs,
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124,58,237,0.05)',
          borderWidth: 2,
          pointRadius: data.length > 30 ? 0 : 3,
          pointHoverRadius: 5,
          fill: false,
          tension: 0.3,
          yAxisID: 'y2',
          datalabels: { display: false },
        },
      ],
    },
    options: chartOptions({
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          min: viewsMin - viewsRange * 1.5, // padding inferior → datos en mitad superior
          max: viewsMax + viewsRange * 0.2,
          ticks: {
            color: '#b0b0b0',
            font: { size: 11 },
            callback: v => v >= viewsMin - viewsRange * 0.1 ? formatNumberCompact(v) : '',
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y2: {
          type: 'linear',
          position: 'right',
          min: subsMin - subsRange * 0.2,
          max: subsMax + subsRange * 1.5, // padding superior → datos en mitad inferior
          ticks: {
            color: '#7c3aed',
            font: { size: 11 },
            callback: v => v <= subsMax + subsRange * 0.1 ? v.toLocaleString('es-ES') : '',
          },
          grid: { drawOnChartArea: false },
        },
      },
    }),
  });
}

// ============================================================
// CHART: Nuevas vistas por día
// ============================================================
function renderChartDailyViews(data) {
  const timeline = buildDailyTimeline(data);
  const labels = timeline.map(d => formatDateShort(d.snapshot_date));
  const values = timeline.map(d => d._missing ? null : (d.new_views_daily ?? 0));
  const validValues = values.filter(v => v > 0);
  const avg = validValues.length > 0
    ? Math.round(validValues.reduce((a, b) => a + b, 0) / validValues.length)
    : 0;
  const avgLine = values.map(() => avg);

  const ctx = document.getElementById('chart-daily-views').getContext('2d');
  if (chartDailyViews) chartDailyViews.destroy();

  chartDailyViews = new Chart(ctx, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: {
      labels,
      datasets: [
        {
          label: 'Nuevas vistas',
          data: values,
          backgroundColor: 'rgba(38,116,237,0.6)',
          borderColor: '#2674ed',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
          datalabels: {
            display: true,
            anchor: 'end',
            align: 'end',
            color: '#b0b0b0',
            font: { size: 10, weight: '500' },
            formatter: v => v > 0 ? formatNumberCompact(v) : '',
          },
        },
        {
          type: 'line',
          label: `Media: ${formatNumberCompact(avg)} vistas/día`,
          data: avgLine,
          borderColor: '#7dd3fc',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0,
          datalabels: { display: false },
        },
      ],
    },
    options: chartOptions({
      scales: {
        y: {
          ticks: {
            color: '#b0b0b0',
            font: { size: 11 },
            callback: v => formatNumberCompact(v),
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
    }),
  });

  // Inyectar leyenda solo para la línea de media (dataset index 1)
  chartDailyViews.options.plugins.legend = {
    display: true,
    position: 'top',
    align: 'end',
    labels: {
      filter: (item) => item.datasetIndex === 1,
      color: '#7dd3fc',
      font: { size: 11, weight: '600' },
      boxWidth: 24,
      boxHeight: 1,
      padding: 8,
    },
  };
  chartDailyViews.update();
}

// ============================================================
// CHART: Tasa de crecimiento de vistas
// ============================================================
function renderChartGrowthRate(data) {
  const timeline = buildDailyTimeline(data);
  const labels = timeline.map(d => formatDateShort(d.snapshot_date));
  const values = timeline.map(d =>
    d._missing || d.view_growth_rate_pct === null || d.view_growth_rate_pct === undefined
      ? null
      : parseFloat(d.view_growth_rate_pct.toFixed(4))
  );

  const ctx = document.getElementById('chart-growth-rate').getContext('2d');
  if (chartGrowthRate) chartGrowthRate.destroy();

  chartGrowthRate = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Tasa de crecimiento (%)',
        data: values,
        borderColor: '#ec4899',
        backgroundColor: 'rgba(236,72,153,0.08)',
        borderWidth: 2,
        pointRadius: timeline.length > 30 ? 0 : 3,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.3,
      }],
    },
    options: chartOptions({
      scales: {
        y: {
          ticks: {
            color: '#b0b0b0',
            font: { size: 11 },
            callback: v => `${v}%`,
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
    }),
  });
}

// ============================================================
// CHART BASE OPTIONS
// ============================================================
function chartOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1a1a',
        borderColor: '#2a2a2a',
        borderWidth: 1,
        titleColor: '#ffffff',
        bodyColor: '#b0b0b0',
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#b0b0b0',
          font: { size: 11 },
          maxRotation: 45,
          autoSkip: true,
          maxTicksLimit: 10,
        },
        grid: { color: 'rgba(255,255,255,0.03)' },
      },
      ...(extra.scales || {}),
    },
    ...Object.fromEntries(
      Object.entries(extra).filter(([k]) => k !== 'scales')
    ),
  };
}

// ============================================================
// HELPERS
// ============================================================
function formatNumber(n) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('es-ES');
}

function formatNumberCompact(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n;
}

// Rellena todos los días del rango con null donde no haya snapshot
// → las líneas muestran un hueco visible en los días sin datos
function buildDailyTimeline(data) {
  if (data.length === 0) return data;
  const byDate = {};
  data.forEach(d => { byDate[d.snapshot_date.slice(0, 10)] = d; });
  const result = [];
  const start = new Date(data[0].snapshot_date.slice(0, 10));
  const end   = new Date(data[data.length - 1].snapshot_date.slice(0, 10));
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    result.push(byDate[key] ?? { snapshot_date: key, _missing: true });
  }
  return result;
}

// Snapshots capturados a ~3:00 AM → los datos reflejan el cierre del día anterior
function effectiveDate(iso) {
  const d = new Date(iso);
  d.setDate(d.getDate() - 1);
  return d;
}

function effectiveDateStr(iso) {
  return effectiveDate(iso).toISOString().slice(0, 10);
}

function formatDate(iso) {
  return effectiveDate(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateShort(iso) {
  const d = effectiveDate(iso);
  const days = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SÁ'];
  const dow = days[d.getDay()];
  const date = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  return `${dow} ${date}`;
}

function updateLastUpdate(data) {
  const latest = data[data.length - 1];
  const el = document.getElementById('last-update');
  el.textContent = `Datos hasta: ${formatDate(latest.snapshot_date)}`;
}

function updateFooterRange(data) {
  const el = document.getElementById('footer-range');
  if (!el || data.length === 0) return;
  const from = formatDate(data[0].snapshot_date);
  const to   = formatDate(data[data.length - 1].snapshot_date);
  el.textContent = `${from} → ${to}`;
}

function setActivePreset(activeId) {
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.classList.toggle('btn-preset--active', btn.id === activeId);
  });
}

function updateDaysBadge(from, to) {
  const el = document.getElementById('date-range-days');
  if (!el || !from || !to) return;
  const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  el.textContent = `${days} día${days !== 1 ? 's' : ''}`;
}

function showError() {
  document.getElementById('kpi-grid').innerHTML = `
    <div style="grid-column:1/-1;color:var(--danger);font-size:14px;padding:20px 0;">
      Error al cargar los datos. Comprueba la consola para más detalles.
    </div>
  `;
}

// ============================================================
// WEEKLY DATA
// ============================================================

const WEEKLY_DATA_URL = 'https://storage.googleapis.com/angelgarciadatablog-analytics/weekly/view-all-playlist-videos-weekly.json';

const PLAYLIST_COLORS = ['#2674ed','#7c3aed','#ec4899','#10b981','#f59e0b','#06b6d4','#ef4444'];

let weeklyAllData         = [];
let currentWeeklyVideos   = [];
let chartWeeklyViews      = null;
let chartWeeklyVideoViews = null;

async function initWeekly() {
  try {
    const res = await fetch(WEEKLY_DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    weeklyAllData = raw.slice().sort((a, b) => new Date(a.snapshot_date) - new Date(b.snapshot_date));
    const latestSnapshot = weeklyAllData[weeklyAllData.length - 1].snapshot_date.slice(0, 10);
    const filtered = weeklyAllData.filter(d => d.snapshot_date.slice(0, 10) === latestSnapshot);
    renderWeekly(filtered, latestSnapshot);
  } catch (err) {
    console.error('Error loading weekly data:', err);
  }
}

function renderWeekly(data, snapshotDate) {
  const { playlists, videos } = aggregateWeeklyData(data);
  currentWeeklyVideos = videos;

  // Update subtitle with snapshot date
  const subtitleEl = document.getElementById('weekly-subtitle');
  if (subtitleEl && snapshotDate) {
    const d = new Date(snapshotDate + 'T00:00:00');
    const formatted = d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    subtitleEl.innerHTML = `Snapshot del <span class="subtitle-note">${formatted}</span>`;
  }

  renderPlaylistCards(playlists);
  renderWeeklyChart(playlists);
  renderWeeklyVideoChart(videos);
}

// ---- Aggregation ----

function aggregateWeeklyData(data) {
  // Playlist: dedupe by (playlist_id, snapshot_date), then sum across snapshots
  const plSnapshotSeen = new Set();
  const playlistAgg = {};

  data.forEach(d => {
    const pid = d.playlist_id;
    const snapKey = `${pid}::${d.snapshot_date.slice(0, 10)}`;

    if (!playlistAgg[pid]) {
      playlistAgg[pid] = {
        id: pid, title: d.playlist_title,
        thumbnail: d.playlist_thumbnail_url, url: d.playlist_url,
        views_gained: 0, likes_gained: 0, engagement: 0,
        total_views: 0, like_rate: 0, active_pct: 0, video_count: 0,
        bySnapshot: {},
      };
    }
    if (!plSnapshotSeen.has(snapKey)) {
      plSnapshotSeen.add(snapKey);
      const p = playlistAgg[pid];
      const wv = d.playlist_total_views_gained || 0;
      p.views_gained += wv;
      p.likes_gained += d.playlist_total_likes_gained || 0;
      p.engagement   += d.playlist_total_engagement_score || 0;
      if ((d.total_playlist_views || 0) > p.total_views) {
        p.total_views  = d.total_playlist_views || 0;
        p.like_rate    = d.playlist_like_rate_pct || 0;
        p.active_pct   = d.playlist_active_video_pct || 0;
        p.video_count  = d.playlist_video_count || 0;
      }
      const snap = d.snapshot_date.slice(0, 10);
      p.bySnapshot[snap] = (p.bySnapshot[snap] || 0) + wv;
    }
  });

  const playlists = Object.values(playlistAgg).sort((a, b) => b.views_gained - a.views_gained);

  // Video: sum across snapshots
  const videoAgg = {};
  data.forEach(d => {
    const vid = d.video_id;
    if (!videoAgg[vid]) {
      videoAgg[vid] = {
        id: vid, title: d.video_title,
        thumbnail: d.video_thumbnail_url, url: d.video_url,
        playlist_id: d.playlist_id, playlist_title: d.playlist_title,
        views_gained: 0, likes_gained: 0, engagement: 0,
        total_views: 0, days_since_published: 0,
      };
    }
    const v = videoAgg[vid];
    v.views_gained += d.views_gained || 0;
    v.likes_gained += d.likes_gained || 0;
    v.engagement   += d.engagement_score || 0;
    if ((d.total_views || 0) > v.total_views) {
      v.total_views = d.total_views || 0;
      v.days_since_published = d.days_since_published || 0;
    }
  });

  const videos = Object.values(videoAgg).sort((a, b) => b.views_gained - a.views_gained);
  return { playlists, videos };
}

// ---- Render playlist cards (with inline accordion) ----

function renderPlaylistCards(playlists) {
  const container = document.getElementById('playlist-cards');
  if (!playlists.length) { container.innerHTML = ''; return; }

  const maxViews = playlists[0].views_gained || 1;
  const chevron = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  container.innerHTML = playlists.map(p => `
    <div class="pl-item" data-playlist-id="${p.id}">
      <div class="pl-row" role="button" tabindex="0" aria-expanded="false">
        <img class="pl-row-thumb" src="${p.thumbnail}" alt="${escHtml(p.title)}" loading="lazy">
        <div class="pl-row-body">
          <div class="pl-row-top">
            <span class="pl-row-title">${escHtml(p.title)}</span>
            <span class="pl-row-gained">+${formatNumber(p.views_gained)} <span class="pl-row-gained-label">vistas</span></span>
          </div>
          <div class="pl-row-bar-wrap">
            <div class="pl-row-bar" style="width:${Math.round(p.views_gained / maxViews * 100)}%"></div>
          </div>
          <div class="pl-row-meta">
            <span>${formatNumberCompact(p.total_views)} acum.</span>
            <span>${p.video_count} videos</span>
            <span>${p.like_rate.toFixed(1)}% likes</span>
          </div>
        </div>
        <span class="pl-chevron">${chevron}</span>
      </div>
      <div class="pl-videos-panel" aria-hidden="true"></div>
    </div>
  `).join('');

  container.querySelectorAll('.pl-row').forEach(row => {
    row.addEventListener('click', () => {
      const item  = row.closest('.pl-item');
      const pid   = item.dataset.playlistId;
      const isOpen = item.classList.contains('pl-item--open');

      // Close all open items
      container.querySelectorAll('.pl-item--open').forEach(openItem => {
        openItem.classList.remove('pl-item--open');
        openItem.querySelector('.pl-row').setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        item.classList.add('pl-item--open');
        row.setAttribute('aria-expanded', 'true');
        const panel = item.querySelector('.pl-videos-panel');
        renderVideosInPanel(panel, pid);
      }
    });

    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
    });
  });
}

// ---- Render videos inside accordion panel ----

function renderVideosInPanel(panel, playlistId) {
  const videos = currentWeeklyVideos.filter(v => v.playlist_id === playlistId);

  if (!videos.length) {
    panel.innerHTML = '<p class="pl-panel-empty">Sin videos disponibles.</p>';
    return;
  }

  const maxViews = videos[0].views_gained || 1;

  panel.innerHTML = `
    <div class="pl-panel-header">
      <span class="pl-panel-title">Videos</span>
      <span class="pl-panel-count">${videos.length}</span>
    </div>
    <div class="pl-panel-videos">
      ${videos.map((v, i) => `
        <a href="${v.url}" target="_blank" rel="noopener" class="video-row">
          <span class="video-rank">${i + 1}</span>
          <img class="video-thumb" src="${v.thumbnail}" alt="${escHtml(v.title)}" loading="lazy">
          <div class="video-info">
            <div class="video-title">${escHtml(v.title)}</div>
            <div class="video-meta">${v.days_since_published}d publicado</div>
            <div class="video-bar-wrap">
              <div class="video-bar" style="width:${Math.round(v.views_gained / maxViews * 100)}%"></div>
            </div>
          </div>
          <div class="video-stats">
            <span class="video-views-gained">+${formatNumber(v.views_gained)}</span>
            <span class="video-views-total">${formatNumberCompact(v.total_views)} total</span>
          </div>
        </a>
      `).join('')}
    </div>
  `;
}

// ---- Render weekly chart ----

function renderWeeklyChart(playlists) {
  const ctx = document.getElementById('chart-weekly-views').getContext('2d');
  if (chartWeeklyViews) chartWeeklyViews.destroy();

  const top    = playlists.slice(0, 5);
  const labels = top.map(p => firstWords(p.title));
  const values = top.map(p => p.views_gained);
  const colors = top.map((_, i) => PLAYLIST_COLORS[i % PLAYLIST_COLORS.length]);

  chartWeeklyViews = new Chart(ctx, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: {
      labels,
      datasets: [{
        label: 'Vistas ganadas',
        data: values,
        backgroundColor: colors.map(c => c + 'b3'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        datalabels: {
          anchor: 'end',
          align: 'end',
          color: '#b0b0b0',
          font: { size: 10, weight: '600' },
          formatter: v => v > 0 ? `+${formatNumberCompact(v)}` : '',
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: (context) => renderPlaylistTooltip(context, top),
        },
      },
      scales: {
        x: {
          ticks: { color: '#b0b0b0', font: { size: 11 }, maxRotation: 0 },
          grid: { color: 'rgba(255,255,255,0.03)' },
        },
        y: {
          ticks: { color: '#b0b0b0', font: { size: 11 }, callback: v => formatNumberCompact(v) },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
    },
  });
}

// ---- Render weekly video chart ----

function renderWeeklyVideoChart(videos) {
  const ctx = document.getElementById('chart-weekly-video-views').getContext('2d');
  if (chartWeeklyVideoViews) chartWeeklyVideoViews.destroy();

  const top    = videos.slice(0, 5);
  const labels = top.map(v => firstWords(v.title));
  const values = top.map(v => v.views_gained);
  const colors = top.map((_, i) => PLAYLIST_COLORS[i % PLAYLIST_COLORS.length]);

  chartWeeklyVideoViews = new Chart(ctx, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: {
      labels,
      datasets: [{
        label: 'Vistas ganadas',
        data: values,
        backgroundColor: colors.map(c => c + 'b3'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        datalabels: {
          anchor: 'end',
          align: 'end',
          color: '#b0b0b0',
          font: { size: 10, weight: '600' },
          formatter: v => v > 0 ? `+${formatNumberCompact(v)}` : '',
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: (context) => renderVideoTooltip(context, top),
        },
      },
      scales: {
        x: {
          ticks: { color: '#b0b0b0', font: { size: 11 }, maxRotation: 0 },
          grid: { color: 'rgba(255,255,255,0.03)' },
        },
        y: {
          ticks: { color: '#b0b0b0', font: { size: 11 }, callback: v => formatNumberCompact(v) },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
    },
  });
}

function renderVideoTooltip(context, videos) {
  const { chart, tooltip } = context;
  const wrapper = chart.canvas.parentNode;
  let el = wrapper.querySelector('.chart-tooltip-custom');

  if (!el) {
    el = document.createElement('div');
    el.className = 'chart-tooltip-custom';
    wrapper.appendChild(el);
  }

  if (tooltip.opacity === 0) { el.style.display = 'none'; return; }

  const idx = tooltip.dataPoints[0].dataIndex;
  const v   = videos[idx];

  el.innerHTML = `
    <img src="${v.thumbnail}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;display:block;margin-bottom:8px;">
    <div class="tooltip-pl-title">${escHtml(v.title)}</div>
    <div class="tooltip-pl-views">+${formatNumber(v.views_gained)} <span class="tooltip-pl-label">vistas</span></div>
    <div class="tooltip-pl-meta">${formatNumberCompact(v.total_views)} acum. · ${v.days_since_published}d publicado</div>
  `;

  const tooltipW = 192;
  const canvasW  = chart.canvas.offsetWidth;
  let left = tooltip.caretX + 14;
  if (left + tooltipW > canvasW) left = tooltip.caretX - tooltipW - 14;

  el.style.display = 'block';
  el.style.left    = `${left}px`;
  el.style.top     = `${tooltip.caretY - el.offsetHeight / 2}px`;
}

function renderPlaylistTooltip(context, playlists) {
  const { chart, tooltip } = context;
  const wrapper = chart.canvas.parentNode;
  let el = wrapper.querySelector('.chart-tooltip-custom');

  if (!el) {
    el = document.createElement('div');
    el.className = 'chart-tooltip-custom';
    wrapper.appendChild(el);
  }

  if (tooltip.opacity === 0) { el.style.display = 'none'; return; }

  const idx = tooltip.dataPoints[0].dataIndex;
  const p   = playlists[idx];

  el.innerHTML = `
    <img src="${p.thumbnail}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;display:block;margin-bottom:8px;">
    <div class="tooltip-pl-title">${escHtml(p.title)}</div>
    <div class="tooltip-pl-views">+${formatNumber(p.views_gained)} <span class="tooltip-pl-label">vistas</span></div>
    <div class="tooltip-pl-meta">${formatNumberCompact(p.total_views)} acum. · ${p.video_count} videos</div>
  `;

  const tooltipW = 192;
  const canvasW  = chart.canvas.offsetWidth;
  let left = tooltip.caretX + 14;
  if (left + tooltipW > canvasW) left = tooltip.caretX - tooltipW - 14;

  el.style.display = 'block';
  el.style.left    = `${left}px`;
  el.style.top     = `${tooltip.caretY - el.offsetHeight / 2}px`;
}


// ---- Weekly helpers ----

function formatWeekLabel(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function shortTitle(title, maxLen = 28) {
  const parts = title.split(' - ');
  const candidate = parts[parts.length - 1];
  if (candidate.length <= maxLen) return candidate;
  return title.slice(0, maxLen - 1) + '…';
}

function firstWords(title, maxWords = 4) {
  const words = title.split(' ');
  if (words.length <= maxWords) return title;
  return words.slice(0, maxWords).join(' ') + '…';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// START
// ============================================================
init();
initWeekly();
