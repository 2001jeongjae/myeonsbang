/* 임시 확인용: 새 채용 API 3개의 응답 모양을 본다. 확인이 끝나면 지운다. */
'use strict';
const BASE = {
  narail: 'https://apis.data.go.kr/1760000/PblJobService/getList',
  narailItem: 'https://apis.data.go.kr/1760000/PblJobService/getItem',
  local: 'https://apis.data.go.kr/B551982/openApiEmployInfo/openXmlEmployInfo',
  kps: 'https://apis.data.go.kr/B551881/employee/recruitments'
};
module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.get('t') !== 'mb7731') { res.status(404).send('{}'); return; }
  let key = String(process.env.DATA_GO_KR_KEY || '').trim();
  try { if (key.indexOf('%') >= 0) key = decodeURIComponent(key); } catch (e) {}
  const base = BASE[q.get('w')];
  if (!base) { res.status(400).send('{}'); return; }
  const p = { serviceKey: key };
  q.forEach(function (v, k) { if (k.indexOf('p_') === 0) p[k.slice(2)] = v; });
  const u = new URL(base);
  u.search = new URLSearchParams(p).toString();
  const t0 = Date.now();
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(Number(q.get('to')) || 9000) });
    const body = await r.text();
    res.status(200).send(JSON.stringify({ status: r.status, ms: Date.now() - t0, len: body.length, body: body.split(key).join('***').slice(0, Number(q.get('n')) || 4000) }));
  } catch (e) {
    res.status(200).send(JSON.stringify({ ms: Date.now() - t0, error: String(e && e.message).split(key).join('***') }));
  }
};
