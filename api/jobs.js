/* 공공기관 채용공고 자동 받기 (Vercel 서버 함수, 주소: /api/jobs)

   - 출처: 공공데이터포털 「재정경제부_공공기관 채용정보 조회서비스」(잡알리오, data.go.kr 15125273)
     GET https://apis.data.go.kr/1051000/recruitment/list
   - 인증키: Vercel 환경 변수 DATA_GO_KR_KEY (저장소에는 넣지 않는다)
   - 결과는 Vercel CDN에 6시간 저장된다. 그래서 하루 몇 번만 API를 부르고, 공고는 저절로 새로워진다.
   - 면접 스터디 사이트라 신입이 지원할 수 있는 정규직·무기계약직·청년인턴 중 사무·기술 직군 공고만 남긴다.
     대체인력, 현장 지원직(조리·청소·경비 등), 병원 의료직, 보훈·장애인 제한경쟁은 뺀다.
   - 화면에 넣는 모양은 src/jobs.js 의 공고 한 개와 같다. 분류 이름은 src/taxonomy.js 와 같다. */
'use strict';

const ENDPOINT = 'https://apis.data.go.kr/1051000/recruitment/list';
const VIEW = 'https://job.alio.go.kr/recruitview.do?idx=';
const ROWS = 100;
const MAX_PAGES = 10;

/* NCS 대분류 → 면스방 직무 상세 (taxonomy.js 의 이름) */
const NCS = {
  '사업관리': ['사업기획/신규사업'],
  '경영회계사무': ['경영기획/전략', '사무/문서관리', '재무/회계/세무'],
  '금융보험': ['여신/대출심사', '보험심사/손해사정'],
  '교육자연사회과학': ['대학교수/연구원'],
  '법률경찰소방교도국방': ['총무/법무/비서'],
  '보건의료': ['간호사/간호조무사', '의료기사', '병원행정/코디'],
  '문화예술디자인방송': ['그래픽/시각디자인', 'PD/연출/방송제작'],
  '운전운송': ['배송/운송/화물'],
  '영업판매': ['B2B영업', '영업관리/기획'],
  '건설': ['건축/인테리어설계', '시공/현장관리/감리', '토목/조경'],
  '기계': ['기계/자동차/조선', '설비/기계유지보수'],
  '재료': ['화학/에너지/환경'],
  '화학바이오': ['화학/에너지/환경', '바이오/제약연구개발'],
  '화학': ['화학/에너지/환경'],
  '연구': ['대학교수/연구원'],
  '섬유의복': ['패션/의류디자인'],
  '전기전자': ['전기/전자/반도체', '전기/소방/설비'],
  '정보통신': ['시스템/ERP개발', 'DevOps/클라우드/보안', 'IT기획/PM/PO'],
  '식품가공': ['식품/화장품'],
  '환경에너지안전': ['환경/안전관리', '환경/플랜트']
};
/* 면접 스터디를 거의 하지 않는 직군: 공고의 NCS 분야가 모두 여기에 들면 뺀다 (사무·기술 직군 위주로) */
const SKIP_NCS = ['음식서비스', '경비청소', '이용숙박여행오락스포츠', '운전운송', '농림어업', '인쇄목재가구공예', '섬유의복', '사회복지종교', '보건의료'];
/* 제목으로 거르는 것: 현장 지원직, 의사직, 보훈·장애인 등 지원 자격이 제한된 공고 */
const SKIP_TITLE = /조리|청소|미화|경비|운전원|운전직|영선|당직|배식|주차|시설관리|보안요원|사무보조|단기|일용|전문의|의사직|제한\s*경쟁|특별\s*(채용|고용)|보훈\s*(특별|제한)|장애인\s*제한|서비스지원직/;
const NCS_INDUSTRY = { '금융보험': '금융/보험', '정보통신': 'IT/SW', '화학바이오': '바이오/제약' };

/* 근무지역 이름 → taxonomy.js REGIONS */
function regionOf(name) {
  const n = String(name).replace(/\s/g, '');
  if (!n) return '';
  if (/전국|무관|제한없/.test(n)) return '지역 제한없음';
  if (/해외|국외/.test(n)) return '해외';
  if (/^충|충청/.test(n)) return '충청';
  if (/^전[남북라]|전라/.test(n)) return '전라';
  if (/^경[남북상]|경상/.test(n)) return '경상';
  const list = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '경기', '강원', '제주', '세종'];
  for (let i = 0; i < list.length; i++) if (n.indexOf(list[i]) === 0) return list[i];
  return '';
}

function pieces(v) {
  if (Array.isArray(v)) return v.map(String).map(function (s) { return s.trim(); }).filter(Boolean);
  return String(v == null ? '' : v).split(/[,|;]/).map(function (s) { return s.trim(); }).filter(Boolean);
}
/* 받은 글에서 태그·제어문자를 지우고 길이를 줄인다 (화면에서도 한 번 더 이스케이프한다) */
function text(v, max) {
  return String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 120);
}
function ymd(v) {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(v || '').trim());
  return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
}
function todayKST(now) {
  return new Date((now || Date.now()) + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }

/* API 공고 한 개 → 면스방 공고 한 개. 남기지 않을 공고면 null */
function toJob(row, today) {
  if (!row || typeof row !== 'object') return null;
  const sn = String(row.recrutPblntSn == null ? '' : row.recrutPblntSn).trim();
  if (!/^\d{1,12}$/.test(sn)) return null;
  const company = text(row.instNm, 60);
  const title = text(row.recrutPbancTtl, 120);
  const start = ymd(row.pbancBgngYmd);
  const end = ymd(row.pbancEndYmd);
  if (!company || !title || !end || end < today) return null;
  if (String(row.ongoingYn || '').toUpperCase() === 'N') return null;
  if (String(row.replmprYn || '').toUpperCase() === 'Y' || /대체\s*인력|육아휴직\s*대체/.test(title)) return null;

  const se = pieces(row.recrutSe), seName = text(row.recrutSeNm, 40);
  /* 코드가 있으면 코드로, 없으면 이름으로 가린다 */
  const fresh = se.length ? se.indexOf('R2010') >= 0 || se.indexOf('R2030') >= 0 : /신입/.test(seName);
  const career = se.length ? se.indexOf('R2020') >= 0 || se.indexOf('R2030') >= 0 : /경력/.test(seName);
  if (!fresh) return null;

  const hire = pieces(row.hireTypeLst), hireName = text(row.hireTypeNmLst, 60);
  const regular = hire.length ? hire.indexOf('R1010') >= 0 || hire.indexOf('R1030') >= 0 : /정규직|무기계약/.test(hireName.replace(/비정규직/g, ''));
  const intern = hire.length ? hire.indexOf('R1060') >= 0 || hire.indexOf('R1070') >= 0 : /인턴/.test(hireName);
  if (!regular && !intern) return null;

  const types = [];
  if (regular) types.push('신입');
  if (career && regular) types.push('경력직');
  if (intern) types.push('인턴');

  const ncs = pieces(row.ncsCdNmLst).map(function (s) { return text(s, 30); }).filter(Boolean).slice(0, 8);
  const keys = ncs.map(function (s) { return s.replace(/[.·ㆍ,\s]/g, ''); });
  if (SKIP_TITLE.test(title)) return null;
  if (keys.length && keys.every(function (k) { return SKIP_NCS.indexOf(k) >= 0; })) return null;
  const duties = uniq([].concat.apply([], keys.map(function (k) { return NCS[k] || []; })));
  const industries = uniq(['공공/비영리'].concat(keys.map(function (k) { return NCS_INDUSTRY[k] || ''; })));
  const regions = uniq(pieces(row.workRgnNmLst).map(regionOf));

  const count = Number(row.recrutNope);
  const note = [Number.isFinite(count) && count > 0 ? '선발 ' + Math.round(count) + '명' : '', hireName].filter(Boolean).join(' · ');
  const url = VIEW + sn;

  return {
    id: 'alio-' + sn,
    auto: true,
    company: company,
    title: title,
    jobs: ncs.length ? ncs : ['직무 공고문 확인'],
    duties: duties,
    types: types,
    corp: '공공기관/공기업',
    regions: regions.length >= 10 ? ['지역 제한없음'] : regions,
    industries: industries,
    apply: start ? { start: start, end: end } : { end: end },
    steps: [],
    flow: text(row.scrnprcdrMthdExpln, 80) || '',
    note: note,
    url: url,
    source: { name: '잡알리오 (공공기관 채용정보 API)', url: url }
  };
}

/* API 응답 한 쪽 → { rows, total }. 오류면 예외 */
function parsePage(data) {
  if (!data || typeof data !== 'object') throw new Error('bad-response');
  const code = String(data.resultCode);
  if (['0', '00', '200'].indexOf(code) < 0) throw new Error('api-' + code + ' ' + text(data.resultMsg, 80));
  let rows = data.result;
  if (rows && !Array.isArray(rows) && typeof rows === 'object') rows = rows.item;
  if (rows == null) rows = [];
  if (!Array.isArray(rows)) throw new Error('bad-rows');
  return { rows: rows.map(function (r) { return r && r.item && typeof r.item === 'object' ? r.item : r; }), total: Number(data.totalCount) || 0 };
}

function serviceKey() {
  let key = String(process.env.DATA_GO_KR_KEY || '').trim();
  /* 포털이 주는 Encoding 키를 넣어도 되게 한 번 풀어 둔다 (URLSearchParams가 다시 인코딩한다) */
  try { if (key.indexOf('%') >= 0) key = decodeURIComponent(key); } catch (e) { /* 그대로 쓴다 */ }
  return key;
}

async function fetchPage(key, pageNo, fetchImpl) {
  const u = new URL(ENDPOINT);
  u.search = new URLSearchParams({ serviceKey: key, resultType: 'json', ongoingYn: 'Y', pageNo: String(pageNo), numOfRows: String(ROWS) }).toString();
  const res = await fetchImpl(u, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12000) });
  const body = await res.text();
  if (body.length > 8000000) throw new Error('too-large');
  let data;
  try { data = JSON.parse(body); } catch (e) {
    /* 인증키 오류는 XML로 온다: 오류 이름만 남긴다 */
    const m = /<returnAuthMsg>([^<]*)<\/returnAuthMsg>/.exec(body) || /<errMsg>([^<]*)<\/errMsg>/.exec(body);
    throw new Error('not-json ' + res.status + (m ? ' ' + text(m[1], 60) : ''));
  }
  return parsePage(data);
}

async function loadJobs(key, fetchImpl, now) {
  const today = todayKST(now);
  const first = await fetchPage(key, 1, fetchImpl);
  const pages = Math.min(MAX_PAGES, Math.ceil(first.total / ROWS));
  const rest = [];
  for (let p = 2; p <= pages; p++) rest.push(fetchPage(key, p, fetchImpl).catch(function () { return { rows: [], total: 0 }; }));
  const all = first.rows.concat.apply(first.rows, (await Promise.all(rest)).map(function (x) { return x.rows; }));
  const seen = {};
  const items = [];
  all.forEach(function (row) {
    const j = toJob(row, today);
    if (j && !seen[j.id]) { seen[j.id] = true; items.push(j); }
  });
  items.sort(function (a, b) { return a.apply.end < b.apply.end ? -1 : a.apply.end > b.apply.end ? 1 : 0; });
  return { items: items, scanned: all.length, total: first.total };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const key = serviceKey();
  if (!key) {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    res.status(200).send(JSON.stringify({ items: [], error: 'no-key' }));
    return;
  }
  try {
    const out = await loadJobs(key, fetch, Date.now());
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=21600, stale-while-revalidate=86400');
    res.status(200).send(JSON.stringify({ updatedAt: new Date().toISOString(), source: 'alio', scanned: out.scanned, items: out.items }));
  } catch (e) {
    /* 인증키가 응답에 섞여 나오지 않게 오류 이름만 남긴다 */
    const msg = String(e && e.message || 'error').split(key).join('***').slice(0, 120);
    console.error('[api/jobs]', msg);
    res.setHeader('Cache-Control', 'public, s-maxage=600');
    res.status(200).send(JSON.stringify({ items: [], error: msg }));
  }
};
module.exports.toJob = toJob;
module.exports.parsePage = parsePage;
module.exports.loadJobs = loadJobs;
module.exports.regionOf = regionOf;
