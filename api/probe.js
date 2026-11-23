/* 임시 확인용: 새 채용 API 3개의 응답 모양을 본다. 확인이 끝나면 지운다. */
'use strict';
const TRIES = {
  narail: ['https://apis.data.go.kr/1760000/PblJobService/getList', [{ pageNo: '1', numOfRows: '3' }, { pageNo: '1', numOfRows: '3', resultType: 'json' }, { pageNo: '1', numOfRows: '3', _type: 'json' }]],
  narailItem: ['https://apis.data.go.kr/1760000/PblJobService/getItem', [{ idx: 'IDX' }]],
  local: ['https://apis.data.go.kr/B551982/openApiEmployInfo/openXmlEmployInfo', [{ pageNo: '1', numOfRows: '2' }, { pageNo: '1', numOfRows: '2', SIDO_CD: '11' }, { pageNo: '1', numOfRows: '2', type: 'json' }]],
  kps: ['https://apis.data.go.kr/B551881/employee/recruitments', [{ pageNo: '1', numOfRows: '5' }, { pageNo: '1', numOfRows: '5', _type: 'json' }, { pageNo: '1', numOfRows: '5', resultType: 'json' }]]
};
module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.get('t') !== 'mb7731') { res.status(404).send('{}'); return; }
  let key = String(process.env.DATA_GO_KR_KEY || '').trim();
  try { if (key.indexOf('%') >= 0) key = decodeURIComponent(key); } catch (e) {}
  const which = q.get('w') || 'narail';
  const t = TRIES[which];
  if (!t) { res.status(400).send('{}'); return; }
  const out = [];
  for (const p0 of t[1]) {
    const p = Object.assign({}, p0);
    if (p.idx === 'IDX') p.idx = q.get('idx') || '';
    Object.keys(p).forEach(function (k) { if (q.get('p_' + k) != null) p[k] = q.get('p_' + k); });
    const u = new URL(t[0]);
    u.search = new URLSearchParams(Object.assign({ serviceKey: key }, p)).toString();
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
      const body = await r.text();
      out.push({ params: p, status: r.status, len: body.length, body: body.split(key).join('***').slice(0, Number(q.get('n')) || 3500) });
    } catch (e) { out.push({ params: p, error: String(e && e.message).split(key).join('***') }); }
  }
  res.status(200).send(JSON.stringify(out, null, 1));
};
