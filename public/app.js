/* AI 热点雷达站 前端逻辑 */
(() => {
'use strict';

const $ = (sel) => document.querySelector(sel);
const state = {
  keywords: [], signals: [], hotspots: [], schedule: [], system: {},
  showSuspect: false, unread: 0,
};

/* ---------- 工具 ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function timeAgo(unix) {
  if (!unix) return '时间未知';
  const d = Date.now() / 1000 - unix;
  if (d < 60) return '刚刚';
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 7 * 86400) return `${Math.floor(d / 86400)} 天前`;
  return new Date(unix * 1000).toLocaleDateString('zh-CN');
}

function fmtIn(sec) {
  if (sec <= 0) return '即将';
  if (sec < 60) return `${sec} 秒`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分`;
  return `${Math.floor(sec / 3600)} 时 ${Math.floor((sec % 3600) / 60)} 分`;
}

function toast(msg, level = 'ok', ms = 5000) {
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, ms);
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ---------- 渲染：系统状态 ---------- */
function renderStatus() {
  const s = state.system;
  const chip = (label, ok) => `<span class="sys-chip ${ok ? 'ok' : 'bad'}">${label}</span>`;
  $('#sysStatus').innerHTML =
    chip('AI ' + (s.openrouterReady ? '✓' : '✗'), s.openrouterReady) +
    chip('搜索 ' + (s.firecrawlReady ? '✓' : s.firecrawlCreditExhausted ? '积分耗尽' : '✗'), s.firecrawlReady) +
    chip('邮件 ' + (s.mailConfigured ? '✓' : '—'), s.mailConfigured);
  $('#liveDot').style.background = s.openrouterReady ? 'var(--green)' : 'var(--red)';
  $('#scanTag').textContent = s.openrouterReady ? 'SCANNING' : 'NO AI KEY';
}

/* ---------- 渲染：雷达 ---------- */
function renderRadar(pingKeywordId = null) {
  const kws = state.keywords.filter(k => k.enabled);
  const box = $('#radarBlips');
  const R = 42; // 最大半径百分比
  box.innerHTML = '';
  kws.forEach((k, i) => {
    const angle = (i * 360 / Math.max(kws.length, 1)) * Math.PI / 180 - Math.PI / 2;
    const hasRecent = state.signals.some(s => s.keywordId === k.id && Date.now() / 1000 - s.foundAt < 3600);
    const r = hasRecent ? R * 0.45 : R * (0.7 + (i % 3) * 0.12);
    const x = 50 + r * Math.cos(angle);
    const y = 50 + r * Math.sin(angle);
    const blip = document.createElement('div');
    blip.className = `blip${hasRecent ? ' hot' : ''}`;
    blip.style.left = `${x}%`;
    blip.style.top = `${y}%`;
    blip.innerHTML = `<span class="blip-label">${esc(k.word)}</span>`;
    box.appendChild(blip);
    if (pingKeywordId != null && k.id === pingKeywordId) {
      const ring = document.createElement('div');
      ring.className = 'ping-ring';
      ring.style.left = `${x}%`;
      ring.style.top = `${y}%`;
      box.appendChild(ring);
      setTimeout(() => ring.remove(), 4000);
    }
  });
  $('#radarLegend').innerHTML = kws.length
    ? kws.map(k => `<span>▸ <b>${esc(k.word)}</b> · ${k.kind === 'domain' ? '领域' : '监控'}</span>`).join('')
    : '<span class="empty">暂无监控目标 —— 前往「监控词」添加</span>';
}

/* ---------- 渲染：调度队列 ---------- */
function renderSchedule() {
  const el = $('#scheduleList');
  if (!state.schedule.length) { el.innerHTML = '<div class="empty">队列为空</div>'; return; }
  const byId = new Map(state.keywords.map(k => [k.id, k]));
  el.innerHTML = state.schedule.map(s => {
    const kw = byId.get(s.keywordId);
    if (!kw) return '';
    const intervalSec = (kw.kind === 'domain' ? 3600 : kw.interval_min * 60) || 1800;
    const pct = Math.max(0, Math.min(100, 100 - (s.inSec / intervalSec) * 100));
    return `<div class="sched-row">
      <span class="sched-word">${esc(kw.word)}</span>
      <span class="sched-kind">${kw.kind === 'domain' ? '热点' : '监控'}</span>
      <span class="sched-bar"><i style="width:${pct.toFixed(1)}%"></i></span>
      <span class="sched-t">${fmtIn(s.inSec)}</span>
    </div>`;
  }).join('') || '<div class="empty">队列为空</div>';
}

/* ---------- 渲染：信号流 ---------- */
function signalCard(s, isNew = false) {
  const suspect = s.verdict === 'real' && s.confidence < 75 && s.confidence >= 60;
  const conf = s.confidence || 0;
  return `<article class="signal-card${suspect ? ' suspect' : ''}${isNew ? ' new-card' : ''}" data-sig="${s.id}">
    <div class="sig-top">
      <span class="sig-kw">${esc(s.keyword)}</span>
      <span class="sig-verdict ${suspect ? 'suspect' : 'real'}">${suspect ? '◈ 疑似' : '◉ 确认'}</span>
      ${s.notified ? '<span class="sig-verdict" style="color:var(--text-dim);border-color:var(--line)">已通知</span>' : ''}
      <span class="sig-time">${timeAgo(s.foundAt)}</span>
    </div>
    <h3 class="sig-title"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></h3>
    <div class="sig-conf ${suspect ? 'conf-suspect' : ''}">
      <span class="conf-label">AI 真实度</span>
      <span class="conf-track"><i style="width:${conf}%"></i></span>
      <span class="conf-num">${conf}%</span>
    </div>
    ${s.summary ? `<p class="sig-summary">${esc(s.summary)}</p>` : ''}
    <div class="sig-meta">
      <span>⌲ ${esc(s.source || '未知来源')}</span>
      ${s.publishedAt ? `<span>◷ ${timeAgo(s.publishedAt)}</span>` : ''}
      ${s.reason ? `<span>✦ ${esc(s.reason)}</span>` : ''}
      <a href="${esc(s.url)}" target="_blank" rel="noopener">查看原文 ↗</a>
    </div>
  </article>`;
}

function renderSignals() {
  const list = state.signals.filter(s => state.showSuspect || s.confidence >= 75);
  const el = $('#signalStream');
  el.innerHTML = list.length
    ? list.map(s => signalCard(s)).join('')
    : `<div class="empty-state"><div class="empty-glyph">⌖</div><p>雷达正在扫描，尚未捕获确认信号</p><p class="empty-hint">添加监控词后，系统将自动搜索并经 AI 判定真伪后推送到这里</p></div>`;
  $('#signalCount').textContent = `${list.length} 条`;
}

/* ---------- 渲染：热点榜 ---------- */
function renderHotspots() {
  const areas = state.hotspots;
  const el = $('#hotspotAreas');
  if (!areas.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-glyph">▦</div><p>暂无热点数据</p><p class="empty-hint">在「监控词」中添加一个领域词（如"AI 编程"），系统会定时聚合该领域热点</p></div>`;
    return;
  }
  el.innerHTML = areas.map(a => `
    <section class="hotspot-area">
      <div class="hotspot-area-head">
        <h3>▦ ${esc(a.domain)}</h3>
        <span class="hs-time">${a.updatedAt ? '更新于 ' + timeAgo(a.updatedAt) : '待首次聚合'}</span>
      </div>
      ${a.items.length ? a.items.map((h, i) => `
        <div class="hotspot-item">
          <div class="hs-rank r${i + 1}">${String(i + 1).padStart(2, '0')}</div>
          <div class="hs-body">
            <div class="hs-title">${esc(h.title)}</div>
            ${h.summary ? `<p class="hs-summary">${esc(h.summary)}</p>` : ''}
            <div class="hs-heat">
              <span class="heat-track"><i style="width:${h.heat}%"></i></span>
              <span class="heat-num">热度 ${h.heat}</span>
            </div>
            ${h.sources.length ? `
              <button class="hs-toggle" data-toggle>来源 (${h.sources.length}) ▾</button>
              <div class="hs-sources" hidden>
                ${h.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">↗ [${esc(s.source || 'web')}] ${esc(s.title || s.url)}</a>`).join('')}
              </div>` : ''}
          </div>
        </div>`).join('') : '<div class="empty">本轮未发现热点</div>'}
    </section>`).join('');

  el.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const box = btn.nextElementSibling;
      const open = box.hidden;
      box.hidden = !open;
      btn.textContent = btn.textContent.replace(/[▾▴]/, open ? '▴' : '▾');
    });
  });
}

/* ---------- 渲染：监控词 ---------- */
function renderKeywords() {
  const el = $('#kwList');
  if (!state.keywords.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-glyph">◉</div><p>还没有监控目标</p><p class="empty-hint">添加监控词（如 GPT-5）或领域词（如 AI 编程）</p></div>';
    return;
  }
  const schedById = new Map(state.schedule.map(s => [s.keywordId, s]));
  el.innerHTML = state.keywords.map(k => {
    const sc = schedById.get(k.id);
    return `<div class="kw-card${k.enabled ? '' : ' paused'}">
      <span class="kw-word">${esc(k.word)}</span>
      <span class="kw-kind-badge ${k.kind}">${k.kind === 'domain' ? '领域热点' : '精准监控'}</span>
      <span class="kw-stats">
        确认 <b>${k.confirmed_count || 0}</b> · 疑似 <b style="color:var(--amber)">${k.suspect_count || 0}</b>
        · ${k.kind === 'domain' ? `热点聚合（跟随全局设置）` : `每 ${k.interval_min} 分钟`}
        ${k.last_scan_at ? ` · 上次扫描 ${timeAgo(k.last_scan_at)}` : ' · 未扫描'}
        ${sc ? ` · 下次 ${fmtIn(sc.inSec)}` : ''}
      </span>
      <span class="kw-actions">
        <button class="btn btn-sm btn-ghost" data-act="scan" data-id="${k.id}">⚡ 立即扫描</button>
        <button class="btn btn-sm btn-ghost" data-act="toggle" data-id="${k.id}">${k.enabled ? '⏸ 暂停' : '▶ 启用'}</button>
        <button class="btn btn-sm btn-danger" data-act="del" data-id="${k.id}">删除</button>
      </span>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try {
        btn.disabled = true;
        if (btn.dataset.act === 'scan') {
          await api(`/keywords/${id}/scan`, { method: 'POST' });
          toast('⚡ 已触发扫描，AI 判定完成后信号将推送到信号流');
        } else if (btn.dataset.act === 'toggle') {
          const kw = state.keywords.find(x => String(x.id) === id);
          await api(`/keywords/${id}`, { method: 'PATCH', body: { enabled: !kw.enabled } });
        } else if (btn.dataset.act === 'del') {
          if (!confirm('确定删除该监控词？其历史信号将不再关联展示。')) { btn.disabled = false; return; }
          await api(`/keywords/${id}`, { method: 'DELETE' });
        }
        await refreshState();
      } catch (e) { toast(esc(e.message), 'error'); btn.disabled = false; }
    });
  });
}

/* ---------- 渲染：系统提醒 ---------- */
const alerts = [];
function pushAlert(level, message) {
  alerts.unshift({ level, message, at: Date.now() });
  if (alerts.length > 5) alerts.pop();
  const panel = $('#alertPanel');
  panel.hidden = false;
  $('#alertList').innerHTML = alerts.map(a =>
    `<div class="empty" style="color:${a.level === 'error' ? 'var(--red)' : 'var(--amber)'}">▸ ${esc(a.message)}</div>`).join('');
}

/* ---------- 设置页 ---------- */
async function loadSettings() {
  const { settings, openrouterKeySet } = await api('/settings');
  const form = $('#settingsForm');
  for (const [k, v] of Object.entries(settings)) {
    const input = form.elements[k];
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = !!v;
    else input.value = v ?? '';
  }
  $('#orKeyHint').innerHTML = openrouterKeySet
    ? '✓ OPENROUTER_API_KEY 已通过 .env 配置'
    : '⚠ 尚未配置 OPENROUTER_API_KEY —— 请编辑项目根目录 .env 后重启服务（AI 判定将暂停）';
  $('#orKeyHint').style.color = openrouterKeySet ? 'var(--green)' : 'var(--amber)';
}

$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    body[el.name] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
  }
  try {
    await api('/settings', { method: 'PUT', body });
    const hint = $('#saveHint');
    hint.textContent = '✓ 已保存，调度已按新间隔重排';
    hint.classList.add('show');
    setTimeout(() => hint.classList.remove('show'), 3000);
    toast('设置已保存');
    await refreshState();
  } catch (err) { toast(esc(err.message), 'error'); }
});

$('#btnTestMail').addEventListener('click', async () => {
  const form = $('#settingsForm');
  const body = {};
  for (const el of form.elements) {
    if (!el.name?.startsWith('mail')) continue;
    body[el.name] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
  }
  if (body.mailPass === '********') delete body.mailPass;
  body.mailEnabled = 1;
  const btn = $('#btnTestMail');
  btn.disabled = true; btn.textContent = '发送中…';
  try {
    const r = await api('/settings/test-mail', { method: 'POST', body });
    if (r.ok || r.messageId) toast('✉ 测试邮件已发送，请查收收件箱');
    else toast(esc(r.error || '发送失败'), 'error', 8000);
  } catch (e) { toast(esc(e.message), 'error', 8000); }
  btn.disabled = false; btn.textContent = '发送测试邮件';
});

/* ---------- 监控词表单 ---------- */
$('#kwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const word = $('#kwWord').value.trim();
  if (!word) return;
  try {
    await api('/keywords', {
      method: 'POST',
      body: { word, kind: $('#kwKind').value, interval_min: Number($('#kwInterval').value) || undefined },
    });
    $('#kwWord').value = '';
    toast(`◉ 「${esc(word)}」已加入雷达，15~40 秒内完成首轮扫描`);
    await refreshState();
  } catch (err) { toast(esc(err.message), 'error'); }
});

/* ---------- Tab 切换 ---------- */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tabpane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`#pane-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'settings') loadSettings();
  });
});

$('#showSuspect').addEventListener('change', (e) => {
  state.showSuspect = e.target.checked;
  renderSignals();
});

$('#btnRefreshHotspots').addEventListener('click', refreshState);

/* ---------- 浏览器通知 ---------- */
if ('Notification' in window && Notification.permission === 'default') {
  setTimeout(() => Notification.requestPermission(), 4000);
}
function browserNotify(s) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(`◉ 雷达捕获 [${s.keyword}]`, {
    body: `${s.title}\nAI 真实度 ${s.confidence}%`,
    tag: `sig-${s.id}`,
  });
}

/* ---------- 标题闪烁 ---------- */
let flashTimer = null;
function flashTitle() {
  state.unread++;
  document.title = `(${state.unread}) 🔴 新信号 · AI 热点雷达站`;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { document.title = 'AI 热点雷达站'; state.unread = 0; }, 30000);
}
window.addEventListener('focus', () => {
  document.title = 'AI 热点雷达站'; state.unread = 0;
});

/* ---------- SSE ---------- */
function connectSSE() {
  const es = new EventSource('/api/events');
  es.addEventListener('signal', (e) => {
    const s = JSON.parse(e.data);
    state.signals.unshift(s);
    state.signals = state.signals.slice(0, 60);
    renderSignals();
    renderRadar(s.keywordId);
    browserNotify(s);
    flashTitle();
    toast(`◉ 新信号 <b>[${esc(s.keyword)}]</b> ${esc(s.title.slice(0, 40))}`, 'ok', 8000);
  });
  es.addEventListener('hotspots', () => refreshState());
  es.addEventListener('schedule', (e) => {
    const d = JSON.parse(e.data);
    state.schedule = d.nextSchedules || [];
    renderSchedule();
  });
  es.addEventListener('system_alert', (e) => {
    const d = JSON.parse(e.data);
    pushAlert(d.level, d.message);
    toast(`⚠ ${esc(d.message)}`, d.level === 'error' ? 'error' : 'warn', 8000);
  });
  es.addEventListener('provider_error', (e) => {
    const d = JSON.parse(e.data);
    toast(`⚠ ${esc(d.provider)}: ${esc(d.message)}`, 'warn', 6000);
  });
  es.onerror = () => {
    $('#liveDot').style.background = 'var(--red)';
    setTimeout(connectSSE, 4000); // EventSource 会自动重连，这里仅更新指示灯
  };
  es.onopen = () => renderStatus();
}

/* ---------- 初始化 ---------- */
async function refreshState() {
  try {
    const d = await api('/state');
    state.keywords = d.keywords;
    state.signals = d.signals;
    state.hotspots = d.hotspots;
    state.schedule = d.schedule;
    state.system = d.system;
    renderStatus(); renderRadar(); renderSchedule();
    renderSignals(); renderHotspots(); renderKeywords();
  } catch (e) {
    toast('无法连接雷达站: ' + esc(e.message), 'error');
  }
}

setInterval(() => { // 每 30s 局部刷新调度倒计时
  if (state.schedule.length) {
    state.schedule.forEach(s => { s.inSec = Math.max(0, s.nextAt - Math.floor(Date.now() / 1000)); });
    renderSchedule();
  }
}, 30000);

refreshState();
connectSSE();
})();
