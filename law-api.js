/* =====================================================
   law-api.js v5
   - 오프라인 DB 즉시 표시 (항상)
   - API: 탭별 🔄 버튼으로 수동 갱신
   - CORS: workers.dev 전용 프록시 우선
   ===================================================== */

const LAW_API_KEY = '8a23b0906efd477287d55e200f5e8bc8a38c48008bef5cab928d3600c70bfd69';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CORS 프록시 — 안정적인 순서
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const PROXIES = [
  // 1순위: corsfix (무제한, 안정)
  u => `https://api.corsfix.com/?${encodeURIComponent(u)}`,
  // 2순위: corsproxy.io
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  // 3순위: allorigins
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  // 4순위: 직접 요청 (law.go.kr가 CORS 허용한 경우)
  u => u,
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   법령 탭 목록
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
let _curKey = null;
let _curArticles = [];
let _tabsBuilt = false;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   오프라인 DB 조회 (law_db.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function getDB(key) {
  try {
    const db = window.LAW_DB;
    if (!db) return [];
    if (db[key]) return db[key].articles || [];
    // short 이름으로 폴백
    const item = LAW_MAP.find(m => m.key === key);
    if (!item) return [];
    const found = Object.values(db).find(d => d.short === item.short);
    return found ? found.articles || [] : [];
  } catch(e) { return []; }
}

function getAllArticles() {
  try {
    const db = window.LAW_DB;
    if (!db) return [];
    return Object.entries(db).flatMap(([k, v]) =>
      (v.articles || []).map(a => ({...a, _key: k, _short: v.short}))
    );
  } catch(e) { return []; }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   탭 빌드 (동기)
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
      document.getElementById('lp-search-input').value = '';
      loadLaw(item.key);
    };
    tabsEl.appendChild(b);
  });
  _tabsBuilt = true;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   법령 로드 (오프라인 DB 즉시, API 캐시 우선)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function loadLaw(key, keyword) {
  _curKey = key;
  const articles = _apiCache[key] || getDB(key);
  _curArticles = articles;
  if (articles.length) {
    renderLaw(articles, keyword || '');
  } else {
    const body = document.getElementById('lp-body');
    const item = LAW_MAP.find(m => m.key === key);
    if (body) body.innerHTML = `
      <div class="lp-empty">
        오프라인 DB 없음<br>
        <button onclick="apiRefresh('${key}')"
          style="margin-top:12px;padding:8px 18px;background:rgba(245,200,66,0.15);
          border:1px solid rgba(245,200,66,0.4);border-radius:8px;
          color:var(--gold);font-size:12px;cursor:pointer;font-weight:700;">
          🔄 API에서 불러오기 (${item ? item.short : key})
        </button>
      </div>`;
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   패널 열기 / 닫기
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.openLawPanel = function(keyword) {
  document.getElementById('law-panel-overlay').classList.add('open');
  document.getElementById('law-panel').classList.add('open');
  document.body.style.overflow = 'hidden';
  buildTabs();
  if (keyword) {
    document.getElementById('lp-search-input').value = keyword;
    searchAll(keyword);
  } else {
    if (!_curKey) loadLaw(LAW_MAP[0].key);
  }
};

window.closeLawPanel = function() {
  document.getElementById('law-panel-overlay').classList.remove('open');
  document.getElementById('law-panel').classList.remove('open');
  document.body.style.overflow = '';
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   전체 검색 (오프라인 DB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function searchAll(q) {
  const all = getAllArticles();
  const results = filterArticles(all, q);

  if (results.length) {
    // 첫 결과의 법령 탭 활성화
    const firstKey = results[0]._key;
    document.querySelectorAll('#lp-tabs .lp-tab').forEach(b =>
      b.classList.toggle('on', b.dataset.key === firstKey)
    );
    _curKey = firstKey;
    _curArticles = getDB(firstKey);
    // 같은 법령의 결과만 표시
    const sameResults = results.filter(a => a._key === firstKey);
    renderLaw(sameResults, q);
  } else {
    const body = document.getElementById('lp-body');
    if (body) body.innerHTML = `
      <div class="lp-empty">
        "<strong style="color:var(--text)">${escH(q)}</strong>" 검색 결과 없음<br>
        <small style="color:var(--muted);font-size:10px;">오프라인 DB에 없는 조문입니다</small><br>
        <button onclick="apiSearchAll('${escH(q)}')"
          style="margin-top:12px;padding:7px 16px;background:rgba(96,165,250,0.1);
          border:1px solid rgba(96,165,250,0.3);border-radius:8px;
          color:var(--blue);font-size:11px;cursor:pointer;">
          🔄 API 전체 검색
        </button>
      </div>`;
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   API 전체 검색 (버튼 클릭 시)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.apiSearchAll = async function(q) {
  const body = document.getElementById('lp-body');
  body.innerHTML = `<div class="lp-empty">🔍 API에서 "${escH(q)}" 검색 중…</div>`;

  let found = false;
  for (const item of LAW_MAP) {
    try {
      let articles = _apiCache[item.key];
      if (!articles) {
        body.innerHTML = `<div class="lp-empty">⏳ ${item.short} 로딩 중… (${LAW_MAP.indexOf(item)+1}/${LAW_MAP.length})</div>`;
        articles = await fetchFromApi(item.key);
        if (articles.length) _apiCache[item.key] = articles;
      }
      const results = filterArticles(articles, q);
      if (results.length) {
        found = true;
        document.querySelectorAll('#lp-tabs .lp-tab').forEach(b =>
          b.classList.toggle('on', b.dataset.key === item.key)
        );
        _curKey = item.key;
        _curArticles = articles;
        renderLaw(results, q);
        break;
      }
    } catch(e) { continue; }
  }

  if (!found) {
    body.innerHTML = `<div class="lp-empty">전체 API 검색에서도 "${escH(q)}" 없음</div>`;
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   API 수동 갱신 (탭별 버튼)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.apiRefresh = async function(key) {
  const body = document.getElementById('lp-body');
  const item = LAW_MAP.find(m => m.key === key);
  body.innerHTML = `<div class="lp-empty">⏳ ${item ? item.short : key} API 로딩 중…</div>`;
  try {
    const articles = await fetchFromApi(key);
    if (articles.length) {
      _apiCache[key] = articles;
      _curArticles = articles;
      renderLaw(articles, '');
    } else throw new Error('조문 없음');
  } catch(e) {
    const offline = getDB(key);
    if (offline.length) {
      _curArticles = offline;
      renderLaw(offline, '');
      showToast('API 실패 — 오프라인 DB 표시 중');
    } else {
      body.innerHTML = `<div class="lp-empty" style="color:#f87171;">⚠️ ${e.message}</div>`;
    }
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   검색창 입력
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.lawSearch = function(q) {
  q = (q || '').trim();
  if (!q) { renderLaw(_curArticles, ''); return; }
  const results = filterArticles(_curArticles, q);
  if (results.length) {
    renderLaw(results, q);
  } else {
    // 현재 탭에 없으면 전체 오프라인 검색
    searchAll(q);
  }
};

function filterArticles(articles, q) {
  if (!q || !articles) return [];
  const lq = q.toLowerCase();
  return articles.filter(a =>
    (a.no    && a.no.toLowerCase().includes(lq))    ||
    (a.title && a.title.toLowerCase().includes(lq)) ||
    (a.text  && a.text.toLowerCase().includes(lq))
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   렌더링
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function renderLaw(list, q) {
  const body = document.getElementById('lp-body');
  if (!body) return;
  if (!list || !list.length) {
    body.innerHTML = '<div class="lp-empty">검색 결과 없음</div>';
    return;
  }
  const esc = q ? q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') : '';
  body.innerHTML = list.map(a => {
    let text = escH(a.text || '');
    if (esc) text = text.replace(new RegExp('('+esc+')', 'gi'), '<em>$1</em>');
    return `<div class="lp-article">
      <div class="lp-article-no">${escH(a.no||'')}</div>
      <div class="lp-article-title">${escH(a.title||'')}</div>
      <div class="lp-article-text">${text}</div>
    </div>`;
  }).join('');
  body.scrollTop = 0;
}

function escH(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#1e293b;color:#94a3b8;padding:8px 16px;border-radius:8px;font-size:11px;z-index:9999;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   API 호출 (CORS 프록시 순환)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
async function fetchFromApi(key) {
  const item = LAW_MAP.find(m => m.key === key);
  if (!item) throw new Error('법령 매핑 없음');

  // 1단계: 법령 검색
  const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_API_KEY}&target=law&type=XML&query=${encodeURIComponent(item.query)}&display=5`;
  const searchDoc = await apiCall(searchUrl);
  if (!searchDoc) throw new Error('검색 응답 없음');

  const laws = Array.from(searchDoc.querySelectorAll('law'));
  let lawId = null;
  for (const law of laws) {
    const nm = law.querySelector('법령명한글')?.textContent || '';
    if (nm.includes(item.query.slice(0,6))) {
      lawId = law.querySelector('법령ID')?.textContent?.trim();
      if (lawId) break;
    }
  }
  if (!lawId && laws.length) {
    lawId = laws[0].querySelector('법령ID')?.textContent?.trim();
  }
  if (!lawId) throw new Error('"' + item.query + '" 법령ID 없음');

  // 2단계: 조문 조회
  const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=${LAW_API_KEY}&target=law&type=XML&ID=${lawId}`;
  const detailDoc = await apiCall(detailUrl);
  if (!detailDoc) throw new Error('조문 응답 없음');

  return parseArticles(detailDoc);
}

async function apiCall(url) {
  for (const makeProxy of PROXIES) {
    try {
      const res = await fetch(makeProxy(url), {
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.trim().startsWith('<')) {
        return new DOMParser().parseFromString(text, 'text/xml');
      }
    } catch(e) { continue; }
  }
  return null;
}

function parseArticles(doc) {
  const articles = [];
  doc.querySelectorAll('조문단위').forEach(z => {
    const no    = z.querySelector('조문번호')?.textContent?.trim() || '';
    const title = z.querySelector('조문제목')?.textContent?.trim() || '';
    let   text  = z.querySelector('조문내용')?.textContent?.trim() || '';
    z.querySelectorAll('항').forEach(h => {
      const t = h.querySelector('항내용')?.textContent?.trim();
      if (t) text += '\n' + t;
      h.querySelectorAll('호').forEach(ho => {
        const ht = ho.querySelector('호내용')?.textContent?.trim();
        if (ht) text += '\n  ' + ht;
      });
    });
    if (no || title) articles.push({ no:'제'+no+'조', title, text: text||'(본문 없음)' });
  });
  return articles;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   data-law 클릭 이벤트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
document.addEventListener('DOMContentLoaded', () => {
  document.body.addEventListener('click', e => {
    const el = e.target.closest('[data-law]');
    if (!el) return;
    if (el.classList.contains('lp-tab') ||
        el.classList.contains('law-nav-btn') ||
        el.classList.contains('tab-btn')) return;
    e.preventDefault();
    const kw = el.getAttribute('data-law');
    if (kw) window.openLawPanel(kw);
  });
});
