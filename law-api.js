/* =====================================================
   law-api.js v4 — 오프라인 DB 기본 + API 선택적
   오프라인 DB(law_db.js) 항상 즉시 표시
   API는 탭 우측 🔄 버튼으로만 수동 갱신
   ===================================================== */

const LAW_API_KEY = '8a23b0906efd477287d55e200f5e8bc8a38c48008bef5cab928d3600c70bfd69';

const CORS_PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

/* ── 법령 탭 목록 (key = law_db.js의 키와 일치) ── */
const LAW_MAP = [
  { key:'sanlaw',      short:'산안법',        query:'산업안전보건법'                         },
  { key:'sanlaw_rule', short:'안전보건규칙',   query:'산업안전보건기준에 관한 규칙'            },
  { key:'jungcheo',    short:'중처법',         query:'중대재해 처벌 등에 관한 법률'            },
  { key:'riskassess',  short:'위험성평가고시', query:'사업장 위험성평가에 관한 지침'           },
  { key:'gunjin',      short:'건진법',         query:'건설기술 진흥법'                        },
  { key:'jian',        short:'지안법',         query:'지하안전관리에 관한 특별법'              },
  { key:'sian',        short:'시안법',         query:'시설물의 안전 및 유지관리에 관한 특별법' },
];

const _apiCache = {};    // API 로드 캐시 (갱신 시만 사용)
let _curKey      = null;
let _curArticles = [];
let _tabsBuilt   = false;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   오프라인 DB 조회
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function getDB(key) {
  if (!window.LAW_DB) return [];
  if (LAW_DB[key]) return LAW_DB[key].articles || [];
  // 이름 유사 매칭
  const item = LAW_MAP.find(m => m.key === key);
  if (!item) return [];
  const found = Object.values(LAW_DB).find(db =>
    db.short && item.short.includes(db.short.slice(0,2))
  );
  return found ? found.articles || [] : [];
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
    b.onclick = function() {
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
   법령 로드 — 오프라인 DB 우선, API 캐시 있으면 사용
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function loadLaw(key, keyword) {
  _curKey = key;
  // API 캐시 우선
  const articles = _apiCache[key] || getDB(key);
  _curArticles = articles;

  if (articles.length) {
    renderLaw(articles, keyword || '');
  } else {
    const body = document.getElementById('lp-body');
    if (body) body.innerHTML = `
      <div class="lp-empty">
        오프라인 DB에 데이터 없음<br>
        <button onclick="apiRefresh('${key}')" style="margin-top:12px;padding:8px 16px;background:rgba(245,200,66,0.15);border:1px solid rgba(245,200,66,0.4);border-radius:8px;color:var(--gold);font-size:12px;cursor:pointer;">
          🔄 API에서 불러오기
        </button>
      </div>`;
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   API 수동 갱신 (버튼 클릭 시)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.apiRefresh = async function(key) {
  const body = document.getElementById('lp-body');
  if (body) body.innerHTML = '<div class="lp-empty">⏳ API에서 불러오는 중…</div>';
  try {
    const articles = await _fetchFromApi(key);
    if (articles && articles.length) {
      _apiCache[key] = articles;
      _curArticles = articles;
      renderLaw(articles, '');
    } else {
      throw new Error('조문 없음');
    }
  } catch(e) {
    if (body) body.innerHTML = `<div class="lp-empty" style="color:#f87171;">⚠️ ${e.message}<br><small style="color:#64748b;font-size:10px;">네트워크 오류 — 오프라인 DB를 사용합니다</small><br>
      <button onclick="loadLaw('${key}')" style="margin-top:12px;padding:6px 14px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);border-radius:8px;color:var(--blue);font-size:11px;cursor:pointer;">← 오프라인 DB 보기</button></div>`;
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   패널 열기 / 닫기
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.openLawPanel = function(keyword) {
  document.getElementById('law-panel-overlay').classList.add('open');
  document.getElementById('law-panel').classList.add('open');
  document.body.style.overflow = 'hidden';

  buildTabs();  // 동기 — 즉시 탭 렌더링

  if (keyword) {
    document.getElementById('lp-search-input').value = keyword;
    searchAllDB(keyword);
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
   전체 오프라인 DB 키워드 검색
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function searchAllDB(keyword) {
  for (const item of LAW_MAP) {
    const articles = _apiCache[item.key] || getDB(item.key);
    const results  = filterArticles(articles, keyword);
    if (results.length) {
      // 해당 탭 활성화
      document.querySelectorAll('#lp-tabs .lp-tab').forEach(b =>
        b.classList.toggle('on', b.dataset.key === item.key)
      );
      _curKey = item.key;
      _curArticles = articles;
      renderLaw(results, keyword);
      return;
    }
  }
  // 못 찾음
  const body = document.getElementById('lp-body');
  if (body) body.innerHTML = `<div class="lp-empty">
    "<strong style="color:var(--text)">${keyword}</strong>" 검색 결과 없음<br>
    <small style="color:var(--muted);font-size:10px;">오프라인 DB에 없는 조문입니다</small>
  </div>`;
}

function filterArticles(articles, q) {
  if (!q || !articles) return [];
  return articles.filter(a =>
    (a.no    && a.no.includes(q))    ||
    (a.title && a.title.includes(q)) ||
    (a.text  && a.text.includes(q))
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   검색창 입력
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.lawSearch = function(q) {
  q = (q || '').trim();
  if (!q) { renderLaw(_curArticles, ''); return; }
  const results = filterArticles(_curArticles, q);
  renderLaw(results, q);
};

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
  body.innerHTML = list.map(a => {
    let text = escH(a.text || '');
    if (q) {
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      text = text.replace(new RegExp('(' + esc + ')', 'g'), '<em>$1</em>');
    }
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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   국가법령정보센터 API (수동 갱신 시만 사용)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
async function _fetchFromApi(key) {
  const item = LAW_MAP.find(m => m.key === key);
  if (!item) throw new Error('법령 매핑 없음');

  const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_API_KEY}&target=law&type=XML&query=${encodeURIComponent(item.query)}&display=5`;
  const searchDoc = await _apiCall(searchUrl);
  const laws = Array.from(searchDoc.querySelectorAll ? searchDoc.querySelectorAll('law') : []);

  let lawId = null;
  for (const law of laws) {
    const nameEl = law.querySelector('법령명한글');
    if (nameEl && nameEl.textContent.includes(item.query.slice(0,6))) {
      const idEl = law.querySelector('법령ID');
      if (idEl) { lawId = idEl.textContent.trim(); break; }
    }
  }
  if (!lawId && laws.length) {
    const idEl = laws[0].querySelector('법령ID');
    if (idEl) lawId = idEl.textContent.trim();
  }
  if (!lawId) throw new Error('"' + item.query + '" 검색 결과 없음');

  const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=${LAW_API_KEY}&target=law&type=XML&ID=${lawId}`;
  const detailDoc = await _apiCall(detailUrl);
  return _parseArticles(detailDoc);
}

async function _apiCall(url) {
  let lastErr = null;
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (text.trim().startsWith('<'))
        return new DOMParser().parseFromString(text, 'text/xml');
      throw new Error('응답 형식 오류');
    } catch(e) { lastErr = e; }
  }
  throw new Error(lastErr?.message || '연결 실패');
}

function _parseArticles(doc) {
  const articles = [];
  if (!doc?.querySelectorAll) return articles;
  doc.querySelectorAll('조문단위').forEach(조문 => {
    const no    = 조문.querySelector('조문번호')?.textContent.trim() || '';
    const title = 조문.querySelector('조문제목')?.textContent.trim() || '';
    let   text  = 조문.querySelector('조문내용')?.textContent.trim() || '';
    Array.from(조문.querySelectorAll('항')).forEach(항 => {
      const t = 항.querySelector('항내용')?.textContent.trim();
      if (t) text += '\n' + t;
      Array.from(항.querySelectorAll('호')).forEach(호 => {
        const h = 호.querySelector('호내용')?.textContent.trim();
        if (h) text += '\n  ' + h;
      });
    });
    if (no || title) articles.push({ no:'제'+no+'조', title, text: text||'(본문 없음)' });
  });
  return articles;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   data-law 클릭 이벤트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
document.addEventListener('DOMContentLoaded', function() {
  document.body.addEventListener('click', function(e) {
    const el = e.target.closest('[data-law]');
    if (!el) return;
    if (el.classList.contains('lp-tab') || el.classList.contains('law-nav-btn') ||
        el.classList.contains('tab-btn') || el.id === 'lp-search-input') return;
    e.preventDefault();
    const kw = el.getAttribute('data-law');
    if (kw) window.openLawPanel(kw);
  });
});
