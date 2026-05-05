/* =====================================================
   law-api.js — 국가법령정보센터 API 연동 v3
   - 오프라인 DB(law_db.js) 즉시 표시 → API 백그라운드 갱신
   - 탭 동기 렌더링으로 타이밍 문제 해결
   ===================================================== */

const LAW_API_KEY = '8a23b0906efd477287d55e200f5e8bc8a38c48008bef5cab928d3600c70bfd69';

const CORS_PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://proxy.cors.sh/${url}`,
  url => `https://thingproxy.freeboard.io/fetch/${url}`,
];

/* ── 법령 탭 목록 ── */
const LAW_MAP = [
  { key:'sanlaw',      short:'산안법',        query:'산업안전보건법'                         },
  { key:'sanlaw_rule', short:'안전보건규칙',   query:'산업안전보건기준에 관한 규칙'            },
  { key:'jungcheo',    short:'중처법',         query:'중대재해 처벌 등에 관한 법률'            },
  { key:'riskassess',  short:'위험성평가고시', query:'사업장 위험성평가에 관한 지침'           },
  { key:'gunjin',      short:'건진법',         query:'건설기술 진흥법'                        },
  { key:'jian',        short:'지안법',         query:'지하안전관리에 관한 특별법'              },
  { key:'sian',        short:'시안법',         query:'시설물의 안전 및 유지관리에 관한 특별법' },
];

const _cache = {};       // API 로드 캐시
let _curKey = null;      // 현재 선택된 법령 key
let _curArticles = [];   // 현재 표시 중인 조문 배열
let _tabsBuilt = false;  // 탭 빌드 완료 여부

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   오프라인 DB 조회 (law_db.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function getOfflineDB(key) {
  if (!window.LAW_DB) return null;
  // key 직접 매칭
  if (LAW_DB[key]) return LAW_DB[key].articles || [];
  // 이름으로 폴백
  const item = LAW_MAP.find(m => m.key === key);
  if (!item) return null;
  const match = Object.values(LAW_DB).find(db =>
    db.name && db.name.includes(item.query.slice(0, 5))
  );
  return match ? match.articles || [] : null;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   탭 빌드 (동기 — DOM 조작만)
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
    b.onclick = function () {
      tabsEl.querySelectorAll('.lp-tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      document.getElementById('lp-search-input').value = '';
      // 오프라인 DB 즉시 표시 후 API 백그라운드
      const offline = getOfflineDB(item.key);
      if (!_cache[item.key] && offline && offline.length) {
        _curKey = item.key;
        _curArticles = offline;
        renderLaw(offline, '', true);
        _fetchInBackground(item.key);
      } else {
        showLaw(item.key);
      }
    };
    tabsEl.appendChild(b);
  });
  _tabsBuilt = true;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   법령 표시: 오프라인 즉시 → API 백그라운드
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function showLaw(key, keyword) {
  _curKey = key;

  // 1) 캐시 있으면 즉시
  if (_cache[key]) {
    _curArticles = _cache[key];
    renderLaw(_curArticles, keyword || '');
    return;
  }

  // 2) 오프라인 DB 즉시 표시
  const offline = getOfflineDB(key);
  if (offline && offline.length) {
    _curArticles = offline;
    renderLaw(_curArticles, keyword || '', true); // true = 오프라인 표시
    _fetchInBackground(key);   // API 백그라운드 로드
    return;
  }

  // 3) 둘 다 없으면 로딩 표시 후 API
  const body = document.getElementById('lp-body');
  if (body) {
    const item = LAW_MAP.find(m => m.key === key);
    body.innerHTML = '<div class="lp-empty">⏳ ' + (item ? item.short : key) + ' 불러오는 중…</div>';
  }
  _fetchAndShow(key, keyword || '');
}

/* 백그라운드 API 로드 (오프라인 표시 중) */
async function _fetchInBackground(key) {
  try {
    const articles = await _fetchFromApi(key);
    if (articles && articles.length) {
      _cache[key] = articles;
      // 아직 같은 탭이면 갱신
      if (_curKey === key) {
        _curArticles = articles;
        const q = document.getElementById('lp-search-input')?.value || '';
        if (q) {
          window.lawSearch(q);
        } else {
          renderLaw(articles, '');
        }
      }
    }
  } catch(e) { /* 오프라인 유지 */ }
}

/* API 호출 후 표시 */
async function _fetchAndShow(key, keyword) {
  try {
    const articles = await _fetchFromApi(key);
    if (articles && articles.length) {
      _cache[key] = articles;
      _curArticles = articles;
      if (_curKey === key) renderLaw(articles, keyword);
    } else {
      throw new Error('조문 없음');
    }
  } catch(e) {
    const body = document.getElementById('lp-body');
    if (body && _curKey === key) {
      body.innerHTML = '<div class="lp-empty" style="color:#f87171;">⚠️ ' + e.message + '<br><small style="color:#64748b;font-size:10px;">인터넷 연결을 확인하세요</small></div>';
    }
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   국가법령정보센터 API 실제 호출
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
async function _fetchFromApi(key) {
  const item = LAW_MAP.find(m => m.key === key);
  if (!item) throw new Error('법령 매핑 없음');

  // 1단계: 법령 검색 → ID 획득
  const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_API_KEY}&target=law&type=XML&query=${encodeURIComponent(item.query)}&display=5`;
  const searchDoc = await _apiCall(searchUrl);
  const laws = searchDoc.querySelectorAll ? Array.from(searchDoc.querySelectorAll('law')) : [];

  let lawId = null;
  for (const law of laws) {
    const nameEl = law.querySelector('법령명한글');
    if (nameEl && nameEl.textContent.includes(item.query.slice(0, 6))) {
      const idEl = law.querySelector('법령ID');
      if (idEl) { lawId = idEl.textContent.trim(); break; }
    }
  }
  if (!lawId && laws.length) {
    const idEl = laws[0].querySelector('법령ID');
    if (idEl) lawId = idEl.textContent.trim();
  }
  if (!lawId) throw new Error('"' + item.query + '" 검색 결과 없음');

  // 2단계: 조문 전체 가져오기
  const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=${LAW_API_KEY}&target=law&type=XML&ID=${lawId}`;
  const detailDoc = await _apiCall(detailUrl);
  return _parseArticles(detailDoc);
}

/* CORS 프록시 + XML 파싱 */
async function _apiCall(url) {
  let lastErr = null;
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (text.trim().startsWith('<')) {
        return new DOMParser().parseFromString(text, 'text/xml');
      }
      throw new Error('XML 아님');
    } catch(e) { lastErr = e; }
  }
  throw new Error('연결 실패: ' + (lastErr?.message || ''));
}

/* XML → 조문 배열 */
function _parseArticles(doc) {
  const articles = [];
  if (!doc?.querySelectorAll) return articles;

  doc.querySelectorAll('조문단위').forEach(조문 => {
    const no    = 조문.querySelector('조문번호')?.textContent.trim() || '';
    const title = 조문.querySelector('조문제목')?.textContent.trim() || '';
    let   text  = 조문.querySelector('조문내용')?.textContent.trim() || '';

    const 항들 = Array.from(조문.querySelectorAll('항'));
    if (항들.length) {
      const lines = [];
      항들.forEach(항 => {
        const t = 항.querySelector('항내용')?.textContent.trim();
        if (t) lines.push(t);
        항.querySelectorAll('호').forEach(호 => {
          const h = 호.querySelector('호내용')?.textContent.trim();
          if (h) lines.push('  ' + h);
        });
      });
      if (lines.length) text += (text ? '\n' : '') + lines.join('\n');
    }

    if (no || title) articles.push({ no: '제' + no + '조', title, text: text || '(본문 없음)' });
  });
  return articles;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   패널 열기 / 닫기
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.openLawPanel = function(keyword) {
  document.getElementById('law-panel-overlay').classList.add('open');
  document.getElementById('law-panel').classList.add('open');
  document.body.style.overflow = 'hidden';

  buildTabs();   // 동기 — 즉시 탭 렌더링

  if (keyword) {
    document.getElementById('lp-search-input').value = keyword;
    _searchAllAndShow(keyword);
  } else {
    // 키워드 없으면 첫 탭(산안법) 기본 로드 — 오프라인 DB 즉시
    if (!_curKey) {
      const firstKey = LAW_MAP[0].key;
      const offline = getOfflineDB(firstKey);
      if (offline && offline.length) {
        _curKey = firstKey;
        _curArticles = offline;
        renderLaw(offline, '', true);
        _fetchInBackground(firstKey);
      } else {
        showLaw(firstKey);
      }
    }
  }
};

window.closeLawPanel = function() {
  document.getElementById('law-panel-overlay').classList.remove('open');
  document.getElementById('law-panel').classList.remove('open');
  document.body.style.overflow = '';
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   키워드 전체 검색
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function _searchAllAndShow(keyword) {
  // 캐시 + 오프라인 DB 전체 순서대로 탐색
  for (const item of LAW_MAP) {
    const articles = _cache[item.key] || getOfflineDB(item.key) || [];
    const results = _filter(articles, keyword);
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
  // 못 찾으면 산안법 탭에서 API 검색 시도
  showLaw(LAW_MAP[0].key, keyword);
}

function _filter(articles, q) {
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
  const results = _filter(_curArticles, q);
  renderLaw(results, q);
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   renderLaw (오프라인 배너 포함)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function renderLaw(list, q, isOffline) {
  const body = document.getElementById('lp-body');
  if (!body) return;
  if (!list || !list.length) {
    body.innerHTML = '<div class="lp-empty">검색 결과 없음</div>';
    return;
  }
  let banner = isOffline
    ? '<div style="font-size:10px;color:#f59e0b;padding:6px 14px 0;">📱 오프라인 DB 표시 중 (백그라운드 최신화 중…)</div>'
    : '';
  body.innerHTML = banner + list.map(a => {
    let text = (a.text || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   data-law 클릭 이벤트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
document.addEventListener('DOMContentLoaded', function() {
  document.body.addEventListener('click', function(e) {
    const el = e.target.closest('[data-law]');
    if (!el) return;
    // 탭 버튼·닫기 버튼은 제외
    if (el.classList.contains('lp-tab') || el.classList.contains('lp-close') ||
        el.classList.contains('law-nav-btn') || el.classList.contains('tab-btn')) return;
    e.preventDefault();
    const kw = el.getAttribute('data-law');
    if (kw) window.openLawPanel(kw);
  });
});
