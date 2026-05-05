/* =====================================================
   law-api.js — 국가법령정보센터 오픈API 연동
   
   ■ 사전 준비 (1회):
     1. https://www.law.go.kr/LSW/openApiInfo.do 접속
     2. 회원가입 → 오픈API 신청 → 인증키 발급 (무료)
     3. 아래 LAW_API_KEY 에 발급받은 키 입력
   
   ■ CORS 처리:
     GitHub Pages는 직접 외부 API 호출 시 CORS 차단됨.
     allorigins.win 무료 프록시를 기본 사용.
     불안정 시 corsproxy.io 로 자동 폴백.
   ===================================================== */

const LAW_API_KEY = 'YOUR_API_KEY_HERE'; // ← 발급받은 인증키 입력

/* ── CORS 프록시 목록 (순서대로 폴백) ── */
const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

/* ── 법령 코드 매핑 ── */
const LAW_CODES = {
  '산업안전보건법':           { id: '산업안전보건법',     short: '산안법'    },
  '산업안전보건법 시행령':    { id: '산업안전보건법 시행령', short: '산안법령' },
  '산업안전보건기준에 관한 규칙': { id: '산업안전보건기준에 관한 규칙', short: '안전보건규칙' },
  '중대재해 처벌 등에 관한 법률': { id: '중대재해 처벌 등에 관한 법률', short: '중처법' },
  '건설기술 진흥법':          { id: '건설기술 진흥법',    short: '건진법'    },
  '지하안전관리에 관한 특별법': { id: '지하안전관리에 관한 특별법', short: '지안법' },
  '시설물의 안전 및 유지관리에 관한 특별법': { id: '시설물의 안전 및 유지관리에 관한 특별법', short: '시안법' },
  '사업장 위험성평가에 관한 지침': { id: '사업장 위험성평가에 관한 지침', short: '위험성평가고시' },
};

/* ── 캐시 (세션 내 재요청 방지) ── */
const _lawCache = {};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   핵심 함수: 법령 본문 조문 가져오기
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
async function fetchLawArticles(lawName) {
  if (_lawCache[lawName]) return _lawCache[lawName];

  const baseUrl = `https://www.law.go.kr/DRF/lawService.do`
    + `?OC=${LAW_API_KEY}&target=law&type=JSON&query=${encodeURIComponent(lawName)}`;

  let data = null;
  let lastErr = null;

  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(baseUrl), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      data = JSON.parse(text);
      break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!data) throw new Error('API 연결 실패: ' + lastErr?.message);

  /* 법령 ID 추출 → 조문 상세 요청 */
  const lawList = data?.LawSearch?.law;
  if (!lawList || !lawList.length) throw new Error('"' + lawName + '" 검색 결과 없음');

  const lawId = lawList[0].법령ID;
  const articles = await fetchArticlesByLawId(lawId);
  _lawCache[lawName] = articles;
  return articles;
}

/* ── 법령ID로 조문 목록 가져오기 ── */
async function fetchArticlesByLawId(lawId) {
  const baseUrl = `https://www.law.go.kr/DRF/lawService.do`
    + `?OC=${LAW_API_KEY}&target=law&type=JSON&ID=${lawId}`;

  let data = null;
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(baseUrl), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = JSON.parse(await res.text());
      break;
    } catch(e) {}
  }
  if (!data) throw new Error('조문 데이터 로드 실패');

  return parseLawData(data);
}

/* ── 응답 데이터 → 패널용 형식 변환 ── */
function parseLawData(data) {
  const articles = [];
  const law = data?.법령 || data?.law;
  if (!law) return articles;

  const조문목록 = law?.조문?.조문단위;
  if (!조문목록) return articles;

  const list = Array.isArray(조문목록) ? 조문목록 : [조문목록];

  list.forEach(조문 => {
    const no = 조문?.조문번호 || '';
    const title = 조문?.조문제목 || '';
    const items = 조문?.조문내용;

    let text = '';
    if (items) {
      if (typeof items === 'string') {
        text = items;
      } else if (Array.isArray(items)) {
        text = items.map(i => i?.조문내용 || i || '').join('\n');
      } else if (typeof items === 'object') {
        text = items?.조문내용 || JSON.stringify(items);
      }
    }

    /* 항·호 내용 추가 */
    const항목 = 조문?.항;
    if (항목) {
      const항list = Array.isArray(항목) ? 항목 : [항목];
      항list.forEach(항 => {
        const 항내용 = 항?.항내용 || '';
        if (항내용) text += '\n' + 항내용;
        const 호목 = 항?.호;
        if (호목) {
          const 호list = Array.isArray(호목) ? 호목 : [호목];
          호list.forEach(호 => {
            const 호내용 = 호?.호내용 || '';
            if (호내용) text += '\n  ' + 호내용;
          });
        }
      });
    }

    if (no || title) {
      articles.push({ no: '제' + no + '조', title: title.trim(), text: text.trim() });
    }
  });

  return articles;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   패널 컨트롤러 (law-panel과 연동)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
let _apiCurrentLaw = null;
let _apiCurrentArticles = [];

/* 탭 클릭 시 해당 법령 로드 */
async function loadLawToPanel(lawName) {
  const body = document.getElementById('lp-body');
  if (!body) return;

  if (_lawCache[lawName]) {
    _apiCurrentLaw = lawName;
    _apiCurrentArticles = _lawCache[lawName];
    renderLaw(_apiCurrentArticles, '');
    return;
  }

  body.innerHTML = '<div class="lp-empty">⏳ ' + lawName + ' 로딩 중…</div>';

  if (LAW_API_KEY === 'YOUR_API_KEY_HERE') {
    body.innerHTML = '<div class="lp-empty" style="color:#f87171;">⚠️ API 키 미설정<br><small style="color:#64748b;font-size:10px;">law-api.js의 LAW_API_KEY에 국가법령정보센터 인증키를 입력해주세요</small></div>';
    return;
  }

  try {
    const articles = await fetchLawArticles(lawName);
    _apiCurrentLaw = lawName;
    _apiCurrentArticles = articles;
    renderLaw(articles, '');
  } catch (e) {
    body.innerHTML = '<div class="lp-empty" style="color:#f87171;">⚠️ 로드 실패<br><small style="color:#64748b;font-size:10px;">' + e.message + '</small><br><small style="color:#64748b;font-size:10px;margin-top:6px;display:block;">오프라인 DB로 전환됩니다</small></div>';
    /* 오프라인 폴백: law_db.js 데이터 사용 */
    setTimeout(() => {
      if (window.LAW_DB) {
        const fallbackKey = Object.keys(LAW_DB).find(k =>
          LAW_DB[k].name?.includes(lawName.slice(0,4)) ||
          LAW_DB[k].short?.includes(lawName.slice(0,2))
        );
        if (fallbackKey) {
          _apiCurrentArticles = LAW_DB[fallbackKey].articles || [];
          renderLaw(_apiCurrentArticles, '');
        }
      }
    }, 1500);
  }
}

/* 키워드 검색 (현재 로드된 법령에서) */
function lawApiSearch(q) {
  q = q.trim();
  if (!q) { renderLaw(_apiCurrentArticles, ''); return; }
  const r = _apiCurrentArticles.filter(a =>
    (a.no && a.no.includes(q)) ||
    (a.title && a.title.includes(q)) ||
    (a.text && a.text.includes(q))
  );
  renderLaw(r, q);
}

/* ── 패널 탭 동적 빌드 (기존 openLawPanel 대체) ── */
function buildApiTabs() {
  const tabs = document.getElementById('lp-tabs');
  if (!tabs || tabs.children.length) return;

  const lawNames = Object.keys(LAW_CODES);
  lawNames.forEach((name, i) => {
    const b = document.createElement('button');
    b.className = 'lp-tab' + (i === 0 ? ' on' : '');
    b.textContent = LAW_CODES[name].short;
    b.dataset.lawName = name;
    b.onclick = function() {
      tabs.querySelectorAll('.lp-tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      document.getElementById('lp-search-input').value = '';
      loadLawToPanel(name);
    };
    tabs.appendChild(b);
  });

  /* 첫 번째 법령 자동 로드 */
  loadLawToPanel(lawNames[0]);
}

/* ── openLawPanel 오버라이드 ── */
window._originalOpenLawPanel = window.openLawPanel;
window.openLawPanel = function(keyword) {
  document.getElementById('law-panel-overlay').classList.add('open');
  document.getElementById('law-panel').classList.add('open');
  document.body.style.overflow = 'hidden';

  buildApiTabs();

  if (keyword) {
    document.getElementById('lp-search-input').value = keyword;
    /* 전체 법령 탭에서 키워드 검색 */
    _searchAcrossAllLaws(keyword);
  }
};

/* ── 전체 법령 키워드 검색 ── */
async function _searchAcrossAllLaws(keyword) {
  const body = document.getElementById('lp-body');
  body.innerHTML = '<div class="lp-empty">🔍 전체 법령에서 "' + keyword + '" 검색 중…</div>';

  /* 1차: 현재 캐시에서 즉시 검색 */
  let found = false;
  for (const [name, info] of Object.entries(LAW_CODES)) {
    const articles = _lawCache[name] || (window.LAW_DB && _getFallback(name));
    if (!articles) continue;
    const results = articles.filter(a =>
      (a.no && a.no.includes(keyword)) ||
      (a.title && a.title.includes(keyword)) ||
      (a.text && a.text.includes(keyword))
    );
    if (results.length) {
      found = true;
      /* 해당 탭 활성화 */
      document.querySelectorAll('#lp-tabs .lp-tab').forEach(b => {
        b.classList.toggle('on', b.dataset.lawName === name);
      });
      _apiCurrentLaw = name;
      _apiCurrentArticles = articles;
      renderLaw(results, keyword);
      break;
    }
  }

  /* 2차: 캐시 미스 → 오프라인 DB 폴백 */
  if (!found && window.LAW_DB) {
    for (const [k, db] of Object.entries(LAW_DB)) {
      const results = (db.articles || []).filter(a =>
        (a.no && a.no.includes(keyword)) ||
        (a.title && a.title.includes(keyword)) ||
        (a.text && a.text.includes(keyword))
      );
      if (results.length) {
        found = true;
        _apiCurrentArticles = db.articles;
        renderLaw(results, keyword);
        break;
      }
    }
  }

  if (!found) {
    body.innerHTML = '<div class="lp-empty">검색 결과 없음: "' + keyword + '"</div>';
  }
}

function _getFallback(lawName) {
  if (!window.LAW_DB) return null;
  const key = Object.keys(LAW_DB).find(k =>
    LAW_DB[k].name?.includes(lawName.slice(0,4)) ||
    LAW_DB[k].short?.includes(lawName.slice(0,2))
  );
  return key ? LAW_DB[key].articles : null;
}

/* ── lawSearch 오버라이드 ── */
window.lawSearch = function(q) { lawApiSearch(q); };

/* ── data-law 클릭 이벤트 (DOMContentLoaded 후) ── */
document.addEventListener('DOMContentLoaded', function() {
  document.body.addEventListener('click', function(e) {
    const el = e.target.closest('[data-law]');
    if (!el) return;
    e.preventDefault();
    const kw = el.getAttribute('data-law');
    if (kw) window.openLawPanel(kw);
  });
});
