/* =====================================================
   law-api.js v6 — 전면 리뉴얼
   - 오프라인 DB 즉시 표시
   - 검색 버튼 + Enter 키 지원
   - 탭 클릭 시 해당 법령만 검색
   - 전체검색 = 모든 법령에서 찾기
   ===================================================== */

const LAW_API_KEY = '8a23b0906efd477287d55e200f5e8bc8a38c48008bef5cab928d3600c70bfd69';

const PROXIES = [
  u => `https://api.corsfix.com/?${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

const LAW_MAP = [
  { key:'sanlaw',      short:'산안법',        query:'산업안전보건법'                         },
  { key:'sanlaw_rule', short:'안전보건규칙',   query:'산업안전보건기준에 관한 규칙'            },
  { key:'jungcheo',    short:'중처법',         query:'중대재해 처벌 등에 관한 법률'            },
  { key:'riskassess',  short:'위험성평가고시', query:'사업장 위험성평가에 관한 지침'           },
  { key:'gunjin',      short:'건진법',         query:'건설기술 진흥법'                        },
  { key:'jian',        short:'지안법',         query:'지하안전관리에 관한 특별법'              },
  { key:'sian',        short:'시안법',         query:'시설물의 안전 및 유지관리에 관한 특별법' },
];

const _apiCache = {};
let _curKey  = null;
let _curArticles = [];
let _tabsBuilt   = false;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   오프라인 DB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function getDB(key) {
  try {
    const db = window.LAW_DB;
    if (!db) return [];
    if (db[key]) return db[key].articles || [];
    const item = LAW_MAP.find(m => m.key === key);
    if (!item) return [];
    const found = Object.values(db).find(d => d.short === item.short);
    return found ? found.articles || [] : [];
  } catch(e) { return []; }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   검색 패널 HTML 교체 (리뉴얼)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function upgradePanelUI() {
  // 검색창 + 버튼으로 교체
  const wrap = document.querySelector('.lp-search-wrap');
  if (!wrap || wrap.dataset.upgraded) return;
  wrap.dataset.upgraded = '1';
  wrap.innerHTML = `
    <div style="display:flex;gap:6px;padding:10px 14px 6px;">
      <input id="lp-search-input" class="lp-search"
        type="text" placeholder="조문번호·키워드 검색 (예: 밀폐공간, 제36조)"
        style="flex:1;"
        onkeydown="if(event.key==='Enter')doSearch()"
      >
      <button onclick="doSearch()"
        style="flex-shrink:0;padding:7px 14px;background:rgba(245,200,66,0.15);
        border:1px solid rgba(245,200,66,0.4);border-radius:var(--r-sm);
        color:var(--gold);font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;">
        🔍 검색
      </button>
      <button onclick="doSearch('', true)"
        style="flex-shrink:0;padding:7px 12px;background:rgba(96,165,250,0.08);
        border:1px solid rgba(96,165,250,0.25);border-radius:var(--r-sm);
        color:var(--blue);font-size:11px;cursor:pointer;white-space:nowrap;" title="전체 법령 검색">
        전체
      </button>
    </div>
    <div id="lp-search-status" style="font-size:9.5px;color:var(--muted);padding:0 14px 4px;min-height:14px;"></div>`;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   탭 빌드
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function buildTabs() {
  if (_tabsBuilt) return;
  const tabsEl = document.getElementById('lp-tabs');
  if (!tabsEl) return;
  tabsEl.innerHTML = '';
  LAW_MAP.forEach((item, i) => {
    const b = document.createElement('button');
    b.className = 'lp-tab' + (i === 0 ? ' on' : '');
    b.textContent = item.short;
    b.dataset.key = item.key;
    b.onclick = () => {
      tabsEl.querySelectorAll('.lp-tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      // 탭 클릭 = 해당 법령 로드, 검색어 유지하면 그 법령에서만 검색
      const q = (document.getElementById('lp-search-input')?.value || '').trim();
      loadAndSearch(item.key, q);
    };
    tabsEl.appendChild(b);
  });
  _tabsBuilt = true;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   법령 로드 후 검색
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function loadAndSearch(key, q) {
  _curKey = key;
  const articles = _apiCache[key] || getDB(key);
  _curArticles = articles;
  setStatus(LAW_MAP.find(m=>m.key===key)?.short + ' ' + articles.length + '개 조문');
  if (!articles.length) {
    showApiButton(key);
    return;
  }
  if (q) {
    const r = filter(articles, q);
    renderLaw(r, q);
    setStatus(LAW_MAP.find(m=>m.key===key)?.short + ' — "' + q + '" ' + r.length + '건');
  } else {
    renderLaw(articles, '');
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔍 검색 버튼 클릭
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.doSearch = function(q, allLaws) {
  q = q || (document.getElementById('lp-search-input')?.value || '').trim();
  if (!q) {
    renderLaw(_curArticles, '');
    setStatus('');
    return;
  }

  if (allLaws) {
    // 전체 법령 검색
    searchAllDB(q);
  } else {
    // 현재 탭에서 검색
    const r = filter(_curArticles, q);
    if (r.length) {
      renderLaw(r, q);
      setStatus('"' + q + '" — ' + r.length + '건 (현재 탭)');
    } else {
      // 현재 탭 없으면 전체 검색으로 자동 전환
      searchAllDB(q);
    }
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   전체 오프라인 DB 검색
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function searchAllDB(q) {
  const allResults = [];
  LAW_MAP.forEach(item => {
    const articles = _apiCache[item.key] || getDB(item.key);
    const r = filter(articles, q);
    r.forEach(a => allResults.push({...a, _key: item.key, _short: item.short}));
  });

  if (allResults.length) {
    // 첫 결과 법령 탭 활성화
    const firstKey = allResults[0]._key;
    setActiveTab(firstKey);
    _curKey = firstKey;
    _curArticles = _apiCache[firstKey] || getDB(firstKey);
    // 결과를 법령별 그룹으로 표시
    renderGrouped(allResults, q);
    setStatus('"' + q + '" — 전체 ' + allResults.length + '건 (' +
      [...new Set(allResults.map(a=>a._short))].join(', ') + ')');
  } else {
    // DB에 없으면 API 검색 안내
    const body = document.getElementById('lp-body');
    if (body) body.innerHTML = `
      <div class="lp-empty">
        오프라인 DB에 <strong style="color:var(--text)">"${escH(q)}"</strong> 없음<br>
        <small style="color:var(--muted2);font-size:10px;margin-top:4px;display:block;">
          안전보건규칙·시행령 등 미수록 조문은 API 검색 이용
        </small>
        <button onclick="apiSearchAll('${escH(q)}')"
          style="margin-top:12px;padding:8px 18px;background:rgba(245,200,66,0.15);
          border:1px solid rgba(245,200,66,0.4);border-radius:8px;
          color:var(--gold);font-size:12px;font-weight:800;cursor:pointer;">
          🌐 API 전체 검색
        </button>
      </div>`;
    setStatus('"' + q + '" — DB 없음, API 검색 권장');
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   API 전체 검색 (버튼)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.apiSearchAll = async function(q) {
  const body = document.getElementById('lp-body');
  setStatus('API 검색 중…');

  let found = false;
  for (const item of LAW_MAP) {
    try {
      body.innerHTML = `<div class="lp-empty">⏳ ${item.short} (${LAW_MAP.indexOf(item)+1}/${LAW_MAP.length}) 검색 중…</div>`;
      let articles = _apiCache[item.key];
      if (!articles) {
        articles = await fetchFromApi(item.key);
        if (articles.length) _apiCache[item.key] = articles;
      }
      const r = filter(articles, q);
      if (r.length && !found) {
        found = true;
        setActiveTab(item.key);
        _curKey = item.key;
        _curArticles = articles;
        renderLaw(r, q);
        setStatus('"' + q + '" — ' + item.short + ' API에서 ' + r.length + '건 발견');
      }
    } catch(e) { continue; }
  }

  if (!found) {
    body.innerHTML = `<div class="lp-empty">전체 API 검색에도 "${escH(q)}" 없음<br>
      <small style="color:var(--muted);font-size:10px;">법령명이나 조문번호로 다시 검색해보세요</small></div>`;
    setStatus('검색 결과 없음');
  }
};

/* API 수동 갱신 */
window.apiRefresh = async function(key) {
  const body = document.getElementById('lp-body');
  const item = LAW_MAP.find(m => m.key === key);
  body.innerHTML = `<div class="lp-empty">⏳ ${item?.short} API 로딩 중…</div>`;
  setStatus('API 로딩 중…');
  try {
    const articles = await fetchFromApi(key);
    if (!articles.length) throw new Error('조문 없음');
    _apiCache[key] = articles;
    _curArticles = articles;
    renderLaw(articles, '');
    setStatus(item?.short + ' API 로드 완료 — ' + articles.length + '개 조문');
  } catch(e) {
    const offline = getDB(key);
    if (offline.length) {
      _curArticles = offline;
      renderLaw(offline, '');
      setStatus('API 실패, 오프라인 DB 표시');
    } else {
      body.innerHTML = `<div class="lp-empty" style="color:#f87171;">⚠️ ${e.message}</div>`;
    }
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   패널 열기 / 닫기
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.openLawPanel = function(keyword) {
  document.getElementById('law-panel-overlay').classList.add('open');
  document.getElementById('law-panel').classList.add('open');
  document.body.style.overflow = 'hidden';
  buildTabs();
  upgradePanelUI();

  if (keyword) {
    const inp = document.getElementById('lp-search-input');
    if (inp) inp.value = keyword;
    searchAllDB(keyword);
  } else {
    if (!_curKey) loadAndSearch(LAW_MAP[0].key, '');
  }
};

window.closeLawPanel = function() {
  document.getElementById('law-panel-overlay').classList.remove('open');
  document.getElementById('law-panel').classList.remove('open');
  document.body.style.overflow = '';
};

/* 검색창 입력 (실시간 — 현재 탭만) */
window.lawSearch = function(q) {
  // 실시간 검색은 빈 값일 때만 전체 표시, 나머지는 검색 버튼으로
  if (!q || !q.trim()) renderLaw(_curArticles, '');
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   렌더링
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function renderLaw(list, q) {
  const body = document.getElementById('lp-body');
  if (!body) return;
  if (!list || !list.length) {
    body.innerHTML = '<div class="lp-empty">조문 없음</div>';
    return;
  }
  body.innerHTML = list.map(a => makeCard(a, q)).join('');
  body.scrollTop = 0;
}

function renderGrouped(list, q) {
  const body = document.getElementById('lp-body');
  if (!body) return;
  // 법령별 그룹
  const groups = {};
  list.forEach(a => {
    if (!groups[a._key]) groups[a._key] = {short: a._short, items: []};
    groups[a._key].items.push(a);
  });
  let html = '';
  Object.entries(groups).forEach(([k, g]) => {
    html += `<div style="font-size:9.5px;font-weight:800;color:var(--muted);
      letter-spacing:1px;padding:8px 4px 4px;border-bottom:1px solid var(--border);
      margin-bottom:6px;">${g.short} (${g.items.length}건)</div>`;
    html += g.items.map(a => makeCard(a, q)).join('');
  });
  body.innerHTML = html;
  body.scrollTop = 0;
}

function makeCard(a, q) {
  const esc = q ? q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') : '';
  let text = escH(a.text || '');
  if (esc) text = text.replace(new RegExp('('+esc+')', 'gi'), '<em>$1</em>');
  return `<div class="lp-article">
    <div class="lp-article-no">${escH(a.no||'')}${a._short?` <span style="font-size:8.5px;color:var(--muted);font-weight:400;">${escH(a._short)}</span>`:''}
    </div>
    <div class="lp-article-title">${escH(a.title||'')}</div>
    <div class="lp-article-text">${text}</div>
  </div>`;
}

function showApiButton(key) {
  const body = document.getElementById('lp-body');
  const item = LAW_MAP.find(m => m.key === key);
  if (body) body.innerHTML = `
    <div class="lp-empty">오프라인 DB 없음
      <br><button onclick="apiRefresh('${key}')"
        style="margin-top:10px;padding:7px 16px;background:rgba(245,200,66,0.15);
        border:1px solid rgba(245,200,66,0.4);border-radius:8px;
        color:var(--gold);font-size:12px;font-weight:700;cursor:pointer;">
        🔄 ${item?.short} API 불러오기
      </button>
    </div>`;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   유틸
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function filter(articles, q) {
  if (!q || !articles) return [];
  const lq = q.toLowerCase();
  return articles.filter(a =>
    (a.no||'').toLowerCase().includes(lq) ||
    (a.title||'').toLowerCase().includes(lq) ||
    (a.text||'').toLowerCase().includes(lq)
  );
}

function setActiveTab(key) {
  document.querySelectorAll('#lp-tabs .lp-tab').forEach(b =>
    b.classList.toggle('on', b.dataset.key === key)
  );
}

function setStatus(msg) {
  const el = document.getElementById('lp-search-status');
  if (el) el.textContent = msg;
}

function escH(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   API 호출
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
async function fetchFromApi(key) {
  const item = LAW_MAP.find(m => m.key === key);
  if (!item) throw new Error('법령 매핑 없음');
  const sUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_API_KEY}&target=law&type=XML&query=${encodeURIComponent(item.query)}&display=5`;
  const sDoc = await apiCall(sUrl);
  if (!sDoc) throw new Error('검색 응답 없음');
  const laws = Array.from(sDoc.querySelectorAll('law'));
  let id = null;
  for (const l of laws) {
    const nm = l.querySelector('법령명한글')?.textContent || '';
    if (nm.includes(item.query.slice(0,6))) { id = l.querySelector('법령ID')?.textContent?.trim(); if(id) break; }
  }
  if (!id && laws.length) id = laws[0].querySelector('법령ID')?.textContent?.trim();
  if (!id) throw new Error('"' + item.query + '" 법령 없음');
  const dDoc = await apiCall(`https://www.law.go.kr/DRF/lawService.do?OC=${LAW_API_KEY}&target=law&type=XML&ID=${id}`);
  if (!dDoc) throw new Error('조문 응답 없음');
  return parseArticles(dDoc);
}

async function apiCall(url) {
  for (const p of PROXIES) {
    try {
      const r = await fetch(p(url), {signal: AbortSignal.timeout(8000)});
      if (!r.ok) continue;
      const t = await r.text();
      if (t.trim().startsWith('<')) return new DOMParser().parseFromString(t,'text/xml');
    } catch(e) { continue; }
  }
  return null;
}

function parseArticles(doc) {
  const out = [];
  doc.querySelectorAll('조문단위').forEach(z => {
    const no = z.querySelector('조문번호')?.textContent?.trim() || '';
    const title = z.querySelector('조문제목')?.textContent?.trim() || '';
    let text = z.querySelector('조문내용')?.textContent?.trim() || '';
    z.querySelectorAll('항').forEach(h => {
      const t = h.querySelector('항내용')?.textContent?.trim();
      if (t) text += '\n' + t;
      h.querySelectorAll('호').forEach(ho => {
        const ht = ho.querySelector('호내용')?.textContent?.trim();
        if (ht) text += '\n  ' + ht;
      });
    });
    if (no || title) out.push({no:'제'+no+'조', title, text: text||'(본문 없음)'});
  });
  return out;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   data-law 클릭 이벤트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
document.addEventListener('DOMContentLoaded', () => {
  document.body.addEventListener('click', e => {
    const el = e.target.closest('[data-law]');
    if (!el) return;
    if (['lp-tab','law-nav-btn','tab-btn'].some(c => el.classList.contains(c))) return;
    e.preventDefault();
    const kw = el.getAttribute('data-law');
    if (kw) window.openLawPanel(kw);
  });
});
