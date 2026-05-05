/* =====================================================
   law-api.js — 공공데이터포털 법제처 API 연동
   인증키: bfa6bfa98931720c1399de1e865802e48c1b5999df54f1d1c33ecce9305c0978
   엔드포인트: apis.data.go.kr (공공데이터포털)
   ===================================================== */

const LAW_API_KEY = '8a23b0906efd477287d55e200f5e8bc8a38c48008bef5cab928d3600c70bfd69';

/* ── CORS 프록시 (GitHub Pages 직접 호출 차단 우회) ── */
const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

/* ── 법령명 → API 검색어 매핑 ── */
const LAW_MAP = [
  { name: '산업안전보건법',                    short: '산안법',        query: '산업안전보건법'                    },
  { name: '산업안전보건법 시행령',              short: '산안법령',      query: '산업안전보건법 시행령'              },
  { name: '산업안전보건기준에 관한 규칙',       short: '안전보건규칙',  query: '산업안전보건기준에 관한 규칙'       },
  { name: '중대재해 처벌 등에 관한 법률',      short: '중처법',        query: '중대재해 처벌 등에 관한 법률'       },
  { name: '건설기술 진흥법',                   short: '건진법',        query: '건설기술 진흥법'                   },
  { name: '지하안전관리에 관한 특별법',        short: '지안법',        query: '지하안전관리에 관한 특별법'         },
  { name: '시설물의 안전 및 유지관리에 관한 특별법', short: '시안법', query: '시설물의 안전 및 유지관리에 관한 특별법' },
  { name: '사업장 위험성평가에 관한 지침',     short: '위험성평가고시', query: '사업장 위험성평가에 관한 지침'     },
  { name: '지하안전관리에 관한 특별법',        short: '지안법',        query: '지하안전관리에 관한 특별법'        },
  { name: '시설물의 안전 및 유지관리에 관한 특별법', short: '시안법',  query: '시설물의 안전 및 유지관리에 관한 특별법' },
];

/* ── 세션 캐시 ── */
const _cache = {};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   API 호출 공통 함수
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
async function apiCall(url) {
  let lastErr = null;
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(url), {
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      /* XML 응답 처리 */
      if (text.trim().startsWith('<')) return parseXML(text);
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('연결 실패: ' + lastErr?.message);
}

/* ── XML 파서 ── */
function parseXML(xmlStr) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlStr, 'text/xml');
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   법령 조문 가져오기 (2단계: 검색 → 본문)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
async function fetchLawArticles(lawName) {
  if (_cache[lawName]) return _cache[lawName];

  const item = LAW_MAP.find(m => m.name === lawName);
  if (!item) throw new Error('법령 매핑 없음: ' + lawName);

  /* 1단계: 법령 검색으로 법령ID 획득 */
  const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do`
    + `?OC=${LAW_API_KEY}&target=law&type=XML&query=${encodeURIComponent(item.query)}&display=5`;

  const searchDoc = await apiCall(searchUrl);
  const laws = searchDoc.querySelectorAll ? searchDoc.querySelectorAll('law') : [];

  let lawId = null;
  for (const law of laws) {
    const nameEl = law.querySelector('법령명한글') || law.querySelector('lawName');
    if (nameEl && nameEl.textContent.includes(item.query.slice(0, 6))) {
      const idEl = law.querySelector('법령ID') || law.querySelector('lawId');
      if (idEl) { lawId = idEl.textContent.trim(); break; }
    }
  }
  if (!lawId && laws.length > 0) {
    const idEl = laws[0].querySelector('법령ID') || laws[0].querySelector('lawId');
    if (idEl) lawId = idEl.textContent.trim();
  }
  if (!lawId) throw new Error('"' + item.query + '" 검색 결과 없음');

  /* 2단계: 법령ID로 조문 전체 가져오기 */
  const detailUrl = `https://www.law.go.kr/DRF/lawService.do`
    + `?OC=${LAW_API_KEY}&target=law&type=XML&ID=${lawId}`;

  const detailDoc = await apiCall(detailUrl);
  const articles = extractArticles(detailDoc);

  _cache[lawName] = articles;
  return articles;
}

/* ── 조문 추출 ── */
function extractArticles(doc) {
  const articles = [];
  if (!doc || !doc.querySelectorAll) return articles;

  /* 조문단위 파싱 */
  const조문들 = doc.querySelectorAll('조문단위');
  조문들.forEach(조문 => {
    const 조번호El = 조문.querySelector('조문번호');
    const 조제목El = 조문.querySelector('조문제목');
    const 조내용El = 조문.querySelector('조문내용');

    const no = 조번호El ? '제' + 조번호El.textContent.trim() + '조' : '';
    const title = 조제목El ? 조제목El.textContent.trim() : '';

    let text = 조내용El ? 조내용El.textContent.trim() : '';

    /* 항·호 내용 수집 */
    const 항들 = 조문.querySelectorAll('항');
    if (항들.length) {
      const 항texts = [];
      항들.forEach(항 => {
        const 항내용 = 항.querySelector('항내용');
        if (항내용) 항texts.push(항내용.textContent.trim());
        const 호들 = 항.querySelectorAll('호');
        호들.forEach(호 => {
          const 호내용 = 호.querySelector('호내용');
          if (호내용) 항texts.push('  ' + 호내용.textContent.trim());
        });
      });
      if (항texts.length) text += (text ? '\n' : '') + 항texts.join('\n');
    }

    if (no || title) {
      articles.push({ no, title, text: text || '(본문 없음)' });
    }
  });

  /* 조문단위가 없는 경우 조문 직접 파싱 */
  if (!articles.length) {
    const 조들 = doc.querySelectorAll('조');
    조들.forEach(조 => {
      const no = 조.getAttribute('번호') || '';
      const title = 조.getAttribute('제목') || '';
      const text = 조.textContent.trim();
      if (no || title) articles.push({ no: '제' + no + '조', title, text });
    });
  }

  return articles;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   패널 UI 컨트롤러
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
let _curLaw = null;
let _curArticles = [];

/* 탭 클릭 시 법령 로드 */
async function loadLawToPanel(lawName) {
  const body = document.getElementById('lp-body');
  if (!body) return;

  if (_cache[lawName]) {
    _curLaw = lawName;
    _curArticles = _cache[lawName];
    renderLaw(_curArticles, '');
    return;
  }

  body.innerHTML = '<div class="lp-empty">⏳ ' + lawName + ' 불러오는 중…</div>';

  try {
    const articles = await fetchLawArticles(lawName);
    _curLaw = lawName;
    _curArticles = articles;
    renderLaw(articles, '');
  } catch (e) {
    /* 오프라인 DB 폴백 */
    const fallback = _getFallback(lawName);
    if (fallback && fallback.length) {
      _curLaw = lawName;
      _curArticles = fallback;
      body.innerHTML = '<div style="font-size:10px;color:#f59e0b;padding:8px 14px 4px;">⚠️ 오프라인 DB 표시 중 (' + e.message + ')</div>';
      renderLaw(fallback, '', true);
    } else {
      body.innerHTML = '<div class="lp-empty" style="color:#f87171;">⚠️ 로드 실패<br><small style="color:#64748b;font-size:10px;">' + e.message + '</small></div>';
    }
  }
}

function _getFallback(lawName) {
  if (!window.LAW_DB) return null;
  const key = Object.keys(LAW_DB).find(k =>
    LAW_DB[k].name?.includes(lawName.slice(0, 5)) ||
    LAW_DB[k].short?.includes(lawName.slice(0, 3))
  );
  return key ? LAW_DB[key].articles : null;
}

/* 탭 동적 빌드 */
function buildApiTabs() {
  const tabs = document.getElementById('lp-tabs');
  if (!tabs || tabs.children.length) return;

  LAW_MAP.forEach((item, i) => {
    const b = document.createElement('button');
    b.className = 'lp-tab' + (i === 0 ? ' on' : '');
    b.textContent = item.short;
    b.dataset.lawName = item.name;
    b.onclick = function() {
      tabs.querySelectorAll('.lp-tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      document.getElementById('lp-search-input').value = '';
      loadLawToPanel(item.name);
    };
    tabs.appendChild(b);
  });

  loadLawToPanel(LAW_MAP[0].name);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   openLawPanel 오버라이드
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
window.openLawPanel = function(keyword) {
  document.getElementById('law-panel-overlay').classList.add('open');
  document.getElementById('law-panel').classList.add('open');
  document.body.style.overflow = 'hidden';

  buildApiTabs();

  if (keyword) {
    document.getElementById('lp-search-input').value = keyword;
    _searchAll(keyword);
  }
};

/* 전체 법령 키워드 검색 */
async function _searchAll(keyword) {
  const body = document.getElementById('lp-body');
  body.innerHTML = '<div class="lp-empty">🔍 "' + keyword + '" 검색 중…</div>';

  /* 캐시된 법령에서 먼저 검색 */
  for (const item of LAW_MAP) {
    const articles = _cache[item.name] || _getFallback(item.name) || [];
    const results = articles.filter(a =>
      (a.no && a.no.includes(keyword)) ||
      (a.title && a.title.includes(keyword)) ||
      (a.text && a.text.includes(keyword))
    );
    if (results.length) {
      /* 해당 탭 활성화 */
      document.querySelectorAll('#lp-tabs .lp-tab').forEach(b =>
        b.classList.toggle('on', b.dataset.lawName === item.name)
      );
      _curLaw = item.name;
      _curArticles = articles;
      renderLaw(results, keyword);
      return;
    }
  }
  body.innerHTML = '<div class="lp-empty">검색 결과 없음: "' + keyword + '"</div>';
}

/* 검색창 검색 */
window.lawSearch = function(q) {
  q = q.trim();
  if (!q) { renderLaw(_curArticles, ''); return; }
  const results = _curArticles.filter(a =>
    (a.no && a.no.includes(q)) ||
    (a.title && a.title.includes(q)) ||
    (a.text && a.text.includes(q))
  );
  renderLaw(results, q);
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   data-law 클릭 이벤트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
document.addEventListener('DOMContentLoaded', function() {
  document.body.addEventListener('click', function(e) {
    const el = e.target.closest('[data-law]');
    if (!el) return;
    e.preventDefault();
    const kw = el.getAttribute('data-law');
    if (kw) window.openLawPanel(kw);
  });
});
