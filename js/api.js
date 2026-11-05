// Cliente da API (Apps Script). O token da sessão fica guardado no celular (IndexedDB, em fila.js).
const API_URL = 'https://script.google.com/macros/s/AKfycbwxIQMTBK1EYwJknyGw6lrla75_CB6kdBKTfxnHWrFEzEjMQuaurOpvwZDz6R57u-Pp-Q/exec';

async function api(rota, { metodo = 'GET', corpo, query = '' } = {}) {
  const t = (await lerConfig('token')) || '';
  let r;
  if (metodo === 'GET') {
    const qs = new URLSearchParams(query);
    qs.set('r', rota);
    if (t) qs.set('t', t);
    r = await fetch(API_URL + '?' + qs.toString());
  } else {
    r = await fetch(API_URL, {
      method: 'POST',
      // text/plain evita a verificação prévia (preflight) do CORS
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...(corpo || {}), r: rota, t }),
    });
  }
  // Sem rede, o fetch já falha antes. Resposta que não é JSON também cai aqui, sem código.
  const j = await r.json();
  if (!j.ok) {
    const e = new Error(j.erro);
    e.codigo = j.erro;               // erro de regra ou de login
    throw e;
  }
  return j.dados;
}
