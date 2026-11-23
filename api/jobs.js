/* 공공 채용공고 자동 받기 (Vercel 서버 함수, 주소: /api/jobs)

   - 출처 셋 (모두 공공데이터포털, 같은 인증키로 부른다)
     1) 잡알리오: 「재정경제부_공공기관 채용정보 조회서비스」(15125273) — 공공기관·공기업
        GET https://apis.data.go.kr/1051000/recruitment/list
     2) 나라일터: 「인사혁신처_공공취업정보 조회 서비스」(15156780) — 중앙부처·지자체·교육청
        GET https://apis.data.go.kr/1760000/PblJobService/getList (공공기관 공고는 잡알리오와 겹쳐서 뺀다)
     3) 클린아이: 「행정안전부 한국지역정보개발원_채용정보 조회 서비스」(15159757) — 지방공사·공단·출자출연기관
        GET https://apis.data.go.kr/B551982/openApiEmployInfo/openXmlEmployInfo (시도별로 따로 부른다, XML만 줌)
     한 출처가 실패해도 나머지는 보여 준다. 같은 기관·같은 마감 공고는 잡알리오 → 클린아이 → 나라일터 순으로 하나만 둔다.
   - 인증키: Vercel 환경 변수 DATA_GO_KR_KEY (저장소에는 넣지 않는다)
   - 결과는 Vercel CDN에 6시간 저장된다. 그래서 하루 몇 번만 API를 부르고, 공고는 저절로 새로워진다.
   - 접수 중인 공고를 모두 넣는다(2026-11-23 사용자 요청으로 거름 기준을 없앰). 신입·경력직·인턴·계약직은 types로 나눠
     화면의 채용형태 필터에서 고른다.
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
  /* 2026-11-23부터 거르지 않고 접수 중인 공고를 모두 넣는다. 고르는 건 화면의 채용형태·직무 필터로 한다. */
  const replacement = String(row.replmprYn || '').toUpperCase() === 'Y' || /대체\s*인력|육아휴직\s*대체/.test(title);

  const se = pieces(row.recrutSe), seName = text(row.recrutSeNm, 40);
  /* 코드가 있으면 코드로, 없으면 이름으로 가린다 */
  const fresh = se.length ? se.indexOf('R2010') >= 0 || se.indexOf('R2030') >= 0 : /신입/.test(seName);
  const career = se.length ? se.indexOf('R2020') >= 0 || se.indexOf('R2030') >= 0 : /경력/.test(seName);

  const hire = pieces(row.hireTypeLst), hireName = text(row.hireTypeNmLst, 60);
  const regular = hire.length ? hire.indexOf('R1010') >= 0 || hire.indexOf('R1030') >= 0 : /정규직|무기계약/.test(hireName.replace(/비정규직/g, ''));
  const intern = hire.length ? hire.indexOf('R1050') >= 0 || hire.indexOf('R1060') >= 0 || hire.indexOf('R1070') >= 0 : /인턴/.test(hireName);
  const contract = replacement || (hire.length ? hire.indexOf('R1020') >= 0 || hire.indexOf('R1040') >= 0 : /계약직|비정규/.test(hireName.replace(/무기계약직/g, '')));

  /* 채용형태 필터용: 신입·경력직은 뽑는 사람, 인턴·계약직은 고용 형태 */
  const types = [];
  if (fresh) types.push('신입');
  if (career) types.push('경력직');
  if (intern) types.push('인턴');
  if (contract || (!regular && !intern)) types.push('계약직');

  const ncs = pieces(row.ncsCdNmLst).map(function (s) { return text(s, 30); }).filter(Boolean).slice(0, 8);
  const keys = ncs.map(function (s) { return s.replace(/[.·ㆍ,\s]/g, ''); });
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

/* ---------- 공통: 제목·직무명에서 직무 상세 짐작 (나라일터·클린아이는 NCS 코드가 없거나 거칠다) ---------- */
const WORDS = [
  [/전기|전력|송변전|배전/, ['전기/전자/반도체', '전기/소방/설비']],
  [/기계|설비|정비|공조|보일러/, ['기계/자동차/조선', '설비/기계유지보수']],
  [/토목|조경|측량/, ['토목/조경']],
  [/건축/, ['건축/인테리어설계', '시공/현장관리/감리']],
  [/환경|안전|소방/, ['환경/안전관리']],
  [/화학|화공|수질|에너지/, ['화학/에너지/환경']],
  [/전산|정보(?:화|통신|보호|시스템)|IT|소프트웨어|데이터/, ['시스템/ERP개발']],
  [/연구(?:원|직|위원)?|학예/, ['대학교수/연구원']],
  [/간호/, ['간호사/간호조무사']],
  [/방사선|임상병리|물리치료|작업치료|치위생|의료기사/, ['의료기사']],
  [/행정|사무|총무|경영지원/, ['사무/문서관리']],
  [/회계|재무|세무/, ['재무/회계/세무']]
];
function dutiesFromWords(s) {
  const out = [];
  WORDS.forEach(function (w) { if (w[0].test(s)) w[1].forEach(function (d) { out.push(d); }); });
  return uniq(out);
}
/* 안내·결과 글과 임원 공모는 채용 공고가 아니라서 뺀다 */
const NOT_POSTING = /합격자|최종\s*합격|결과\s*(?:공고|발표|안내|알림)|합격\s*발표|(?:시험|면접|전형)\s*(?:일정|장소)|일정\s*(?:변경|안내)|변경\s*공고|정정\s*공고|취소\s*공고|연기|위촉|비상임|임원|대표이사|이사장|(?:상임)?이사\s*(?:공개)?\s*(?:모집|초빙)|감사\s*(?:공개)?\s*(?:모집|초빙)|원장\s*(?:공개)?\s*(?:모집|초빙)/;
function typesFromTitle(t, base) {
  const types = base.slice();
  if (/인턴/.test(t) && types.indexOf('인턴') < 0) types.push('인턴');
  if (/기간제|계약|대체|한시|일용|단기|시간제|인력풀|강사/.test(t) && types.indexOf('계약직') < 0) types.push('계약직');
  if (/경력/.test(t) && types.indexOf('경력직') < 0) types.push('경력직');
  if (!types.length) types.push('신입');
  return types;
}

/* ---------- 나라일터 (인사혁신처) ---------- */
const NARA = 'https://apis.data.go.kr/1760000/PblJobService/getList';
const NARA_VIEW = 'https://www.gojobs.go.kr/apmView.do?empmnsn=';
const NARA_ROWS = 1000;
const NARA_DAYS = 60; /* 최근 60일에 올라온 공고에서 접수 중인 것만 */
const NARA_PAGES = 8;
/* 시군구 코드 앞 두 자리 → 지역 */
const AREA = { '11': '서울', '26': '부산', '27': '대구', '28': '인천', '29': '광주', '30': '대전', '31': '울산', '36': '세종', '41': '경기', '42': '강원', '51': '강원',
  '43': '충청', '44': '충청', '45': '전라', '46': '전라', '52': '전라', '47': '경상', '48': '경상', '50': '제주' };
const NARA_KIND = { g01: '국가기관', g02: '지방자치단체', g04: '교육청' };
function ymdNum(v) { const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(v == null ? '' : v).trim()); return m ? m[1] + '-' + m[2] + '-' + m[3] : ''; }

function naraJob(row, today) {
  if (!row || typeof row !== 'object') return null;
  const sn = String(row.idx == null ? '' : row.idx).trim();
  if (!/^\d{1,12}$/.test(sn)) return null;
  /* 목록에서는 type01=공고유형(e..), type02=기관구분(g..)이지만 반대로 올 때도 있어 값으로 가린다 */
  const codes = [String(row.type01 || ''), String(row.type02 || '')];
  const kind = codes.filter(function (c) { return /^g\d\d$/.test(c); })[0] || '';
  const ty = codes.filter(function (c) { return /^e\d\d$/.test(c); })[0] || '';
  if (kind === 'g03' || !NARA_KIND[kind]) return null; /* 공공기관은 잡알리오에서 받는다 */
  if (ty === 'e07') return null; /* 전입공모: 이미 공무원인 사람 대상 */
  const company = text(row.insttname, 60);
  const title = text(row.title, 120).replace(/&amp;/g, '&');
  const end = ymdNum(row.enddate), start = ymdNum(row.begindate);
  if (!company || !title || !end || end < today || end > '2099-12-31') return null;
  if (NOT_POSTING.test(title)) return null;
  const base = ty === 'e01' ? ['신입'] : ty === 'e02' || ty === 'e06' ? ['경력직'] : ty === 'e03' || ty === 'e04' ? ['계약직'] : [];
  const types = typesFromTitle(title, base);
  const regions = uniq(pieces(row.areacode).map(function (c) {
    const s = String(c).replace(/\D/g, '');
    return /^0+$/.test(s) ? '지역 제한없음' : AREA[s.slice(0, 2)] || '';
  }));
  const url = NARA_VIEW + sn;
  return {
    id: 'nara-' + sn, auto: true, company: company, title: title,
    jobs: ['직무 공고문 확인'], duties: dutiesFromWords(title), types: types,
    corp: '정부/지자체/교육청',
    regions: regions.length >= 10 ? ['지역 제한없음'] : regions,
    industries: ['공공/비영리'],
    apply: start && start <= end ? { start: start, end: end } : { end: end },
    steps: [], flow: '', note: NARA_KIND[kind], url: url,
    source: { name: '나라일터 (공공취업정보 API)', url: url }
  };
}
function addDays(day, n) { return new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
async function naraPage(key, pageNo, today, fetchImpl) {
  const u = new URL(NARA);
  u.search = new URLSearchParams({ serviceKey: key, _type: 'json', pageNo: String(pageNo), numOfRows: String(NARA_ROWS),
    Begin_de: addDays(today, -NARA_DAYS), End_de: today }).toString();
  const res = await fetchImpl(u, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const body = await res.text();
  if (body.length > 8000000) throw new Error('nara-too-large');
  let d;
  try { d = JSON.parse(body); } catch (e) { throw new Error('nara-not-json ' + res.status); }
  const r = d && d.response;
  const code = String(r && r.header && r.header.resultCode);
  if (code !== '00' && code !== '0') throw new Error('nara-api-' + code);
  const b = r.body || {};
  let rows = b.items && b.items.item;
  if (rows == null || rows === '') rows = [];
  if (!Array.isArray(rows)) rows = [rows];
  return { rows: rows, total: Number(b.totalCount) || 0 };
}
async function loadNara(key, fetchImpl, now) {
  const today = todayKST(now);
  const first = await naraPage(key, 1, today, fetchImpl);
  const pages = Math.min(NARA_PAGES, Math.ceil(first.total / NARA_ROWS));
  const rest = [];
  for (let p = 2; p <= pages; p++) rest.push(naraPage(key, p, today, fetchImpl).catch(function () { return { rows: [] }; }));
  const all = first.rows.concat.apply(first.rows, (await Promise.all(rest)).map(function (x) { return x.rows; }));
  return { items: all.map(function (r) { return naraJob(r, today); }).filter(Boolean), scanned: all.length };
}

/* ---------- 클린아이 (지방공기업·출자출연기관) ---------- */
const LOCAL = 'https://apis.data.go.kr/B551982/openApiEmployInfo/openXmlEmployInfo';
const LOCAL_VIEW = 'https://job.cleaneye.go.kr/user/ypCareersData.do?idx=';
/* 시도 코드: 007001 서울 … 007017 세종 (007005 광주는 전남광주통합특별시 007013으로 합쳐져 비어 있다) */
const LOCAL_SIDO = ['007001', '007002', '007003', '007004', '007005', '007006', '007007', '007008', '007009', '007010', '007011', '007012', '007013', '007014', '007015', '007016', '007017'];
function xmlText(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}
function parseLocalXml(body) {
  const code = (/<resultCode>\s*([^<]*?)\s*<\/resultCode>/.exec(body) || [])[1];
  const msg = (/<resultMsg>\s*([^<]*?)\s*<\/resultMsg>/.exec(body) || [])[1] || '';
  if (/NODATA|NOTEXISTDATA/.test(msg)) return [];
  if (code !== '00' && code !== '0') throw new Error('local-api-' + code + ' ' + text(msg, 40));
  const rows = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(body)) && rows.length < 2000) {
    const o = {};
    const f = /<([A-Za-z_0-9]+)>([\s\S]*?)<\/\1>/g;
    let g;
    while ((g = f.exec(m[1]))) o[g[1]] = xmlText(g[2]).trim();
    rows.push(o);
  }
  return rows;
}
function blank(v) { const s = text(v, 200); return s === '-' || s === 'null' ? '' : s; }
/* 한 공고가 직위별로 여러 줄로 오면 하나로 묶는다 */
function localJobs(rows, today) {
  const groups = {};
  const order = [];
  rows.forEach(function (row) {
    if (!row || typeof row !== 'object') return;
    const sn = String(row.NO || '').trim();
    if (!/^\d{1,12}$/.test(sn)) return;
    const company = text(row.ENT_NAME, 60), title = text(row.ENT_TITLE, 120);
    const end = ymd(row.PUB_END_DATE), start = ymd(row.PUB_DATE);
    if (!company || !title || !end || end < today) return;
    if (/마감|종료/.test(String(row.STATUS || ''))) return;
    const jobType = blank(row.JOB_TYPE);
    if (/비상임/.test(jobType) || NOT_POSTING.test(title)) return;
    const k = company + '|' + title + '|' + end;
    if (!groups[k]) { groups[k] = { rows: [], sn: sn, company: company, title: title, start: start, end: end }; order.push(k); }
    const gr = groups[k];
    gr.rows.push(row);
    if (Number(sn) < Number(gr.sn)) gr.sn = sn;
  });
  return order.map(function (k) {
    const gr = groups[k];
    const fresh = gr.rows.some(function (r) { return /신입/.test(r.EMPLOY_GB || ''); });
    const career = gr.rows.some(function (r) { return /경력/.test(r.EMPLOY_GB || ''); });
    const jt = uniq(gr.rows.map(function (r) { return blank(r.JOB_TYPE); }));
    const types = [];
    if (fresh) types.push('신입');
    if (career) types.push('경력직');
    if (jt.some(function (t) { return /인턴/.test(t); })) types.push('인턴');
    if (jt.some(function (t) { return /기간제|계약직/.test(t); }) || gr.rows.some(function (r) { return String(r.RE_MAN_YN).toUpperCase() === 'Y'; })) types.push('계약직');
    const typesAll = typesFromTitle(gr.title, types);
    const fields = uniq(gr.rows.map(function (r) { return blank(r.ENT_RECRUIT); }).filter(function (s) { return s && s !== '기타'; }));
    const positions = uniq(gr.rows.map(function (r) { return blank(r.POSITION); }));
    const keys = fields.map(function (s) { return s.replace(/[.·ㆍ,\s]/g, ''); });
    const duties = uniq([].concat.apply([], keys.map(function (k) { return NCS[k] || []; })).concat(dutiesFromWords(gr.title + ' ' + positions.join(' ') + ' ' + gr.rows.map(function (r) { return blank(r.DUTY_DETAIL); }).join(' '))));
    const regions = uniq(gr.rows.map(function (r) { return regionOf(r.SIDO_CD || ''); }));
    const count = gr.rows.reduce(function (n, r) { const c = Number(r.EMPLOY_NUM); return n + (Number.isFinite(c) && c > 0 ? c : 0); }, 0);
    const kind = text(gr.rows[0].ENT_GB, 20);
    const note = [count > 0 ? '선발 ' + count + '명' : '', jt.slice(0, 2).join('·'), kind].filter(Boolean).join(' · ');
    const url = LOCAL_VIEW + gr.sn;
    const jobNames = (fields.length ? fields : positions).map(function (s) { return text(s, 30); }).filter(Boolean).slice(0, 6);
    return {
      id: 'local-' + gr.sn, auto: true, company: gr.company, title: gr.title,
      jobs: jobNames.length ? jobNames : ['직무 공고문 확인'],
      duties: duties, types: typesAll,
      corp: '공공기관/공기업',
      regions: regions, industries: ['공공/비영리'],
      apply: gr.start && gr.start <= gr.end ? { start: gr.start, end: gr.end } : { end: gr.end },
      steps: [], flow: text(gr.rows[0].JUDGE_METHOD, 80).replace(/^(?:-|null)$/, ''), note: note.slice(0, 80), url: url,
      source: { name: '클린아이 (지방공공기관 채용정보 API)', url: url }
    };
  });
}
async function localSido(key, sido, fetchImpl) {
  const u = new URL(LOCAL);
  u.search = new URLSearchParams({ serviceKey: key, type: 'xml', sidoCd: sido, pageNo: '1', numOfRows: '1000' }).toString();
  const res = await fetchImpl(u, { headers: { Accept: 'application/xml' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const body = await res.text();
  if (body.length > 8000000) throw new Error('local-too-large');
  return parseLocalXml(body);
}
async function loadLocal(key, fetchImpl, now) {
  const today = todayKST(now);
  let failed = 0;
  const lists = await Promise.all(LOCAL_SIDO.map(function (c) {
    return localSido(key, c, fetchImpl).catch(function () { failed++; return []; });
  }));
  if (failed === LOCAL_SIDO.length) throw new Error('local-all-failed');
  const rows = [].concat.apply([], lists);
  return { items: localJobs(rows, today), scanned: rows.length };
}

/* ---------- 셋을 합친다 ---------- */
function squashName(s) { return String(s).replace(/\(주\)|㈜|주식회사|\(재\)|재단법인|사단법인|[\s()·.,\-]/g, ''); }
async function loadAll(key, fetchImpl, now) {
  const names = ['alio', 'local', 'nara'];
  const got = await Promise.allSettled([loadJobs(key, fetchImpl, now), loadLocal(key, fetchImpl, now), loadNara(key, fetchImpl, now)]);
  const errors = {}, counts = {};
  const seen = {}, ids = {};
  const items = [];
  got.forEach(function (g, i) {
    if (g.status !== 'fulfilled') { errors[names[i]] = String(g.reason && g.reason.message || 'error').split(key).join('***').slice(0, 80); counts[names[i]] = 0; return; }
    let n = 0;
    g.value.items.forEach(function (j) {
      const k = squashName(j.company) + '|' + j.apply.end;
      if (ids[j.id] || (i > 0 && seen[k])) return;
      ids[j.id] = true; seen[k] = true; items.push(j); n++;
    });
    counts[names[i]] = n;
  });
  if (!items.length && Object.keys(errors).length === names.length) throw new Error(errors.alio || 'all-failed');
  items.sort(function (a, b) { return a.apply.end < b.apply.end ? -1 : a.apply.end > b.apply.end ? 1 : 0; });
  return { items: items, counts: counts, errors: errors };
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
    const out = await loadAll(key, fetch, Date.now());
    /* 한 출처라도 실패했으면 1시간 뒤에 다시 받아 본다 */
    const ttl = Object.keys(out.errors).length ? 3600 : 21600;
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=' + ttl + ', stale-while-revalidate=86400');
    res.status(200).send(JSON.stringify({ updatedAt: new Date().toISOString(), counts: out.counts, errors: out.errors, items: out.items }));
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
module.exports.naraJob = naraJob;
module.exports.loadNara = loadNara;
module.exports.parseLocalXml = parseLocalXml;
module.exports.localJobs = localJobs;
module.exports.loadLocal = loadLocal;
module.exports.loadAll = loadAll;
