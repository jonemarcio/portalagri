// Fila offline e sessão guardadas no celular (IndexedDB). O service worker também lê esse banco,
// então a fila pode ser enviada em segundo plano (Android) mesmo com o app fechado.
// Toda ação do usuário é gravada no celular primeiro, e enviada quando houver internet.

const BANCO = 'atto-app';
const STORE_FILA = 'itens';
const STORE_CONFIG = 'config';
let sincronizando = false;

function abrirBanco() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(BANCO, 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE_FILA)) db.createObjectStore(STORE_FILA, { keyPath: 'uid' });
      if (!db.objectStoreNames.contains(STORE_CONFIG)) db.createObjectStore(STORE_CONFIG, { keyPath: 'chave' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function transacao(store, modo, fn) {
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, modo);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// item = { uid, rota, corpo, criadoEm, erro? }
const pendentes = () => transacao(STORE_FILA, 'readonly', s => s.getAll());
const removerDaFila = (uid) => transacao(STORE_FILA, 'readwrite', s => s.delete(uid));
const atualizarItem = (item) => transacao(STORE_FILA, 'readwrite', s => s.put(item));

const lerConfig = async (chave) => {
  const r = await transacao(STORE_CONFIG, 'readonly', s => s.get(chave));
  return r ? r.valor : null;
};
const gravarConfig = (chave, valor) => transacao(STORE_CONFIG, 'readwrite', s => s.put({ chave, valor }));
const apagarConfig = (chave) => transacao(STORE_CONFIG, 'readwrite', s => s.delete(chave));

// Pede ao navegador para enviar a fila quando a conexão voltar, mesmo com o app fechado (Android).
// Sem suporte, a fila é enviada quando o app abrir ou a internet voltar com ele aberto.
async function pedirEnvioEmSegundoPlano() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.sync) await reg.sync.register('enviar-fila');
  } catch (_) { /* sem suporte: segue com o envio pelo app */ }
}

// Não espera o pedido de sincronização: se o service worker não estiver pronto, o app não trava.
async function enfileirar(item) {
  await transacao(STORE_FILA, 'readwrite', s => s.put(item));
  pedirEnvioEmSegundoPlano();
}

/**
 * Envia os itens em ordem. Para se não houver rede ou login.
 * Erro de regra (ex.: campo não cadastrado) fica marcado na fila para revisão.
 */
async function sincronizar() {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;
  try {
    const itens = (await pendentes()).filter(i => !i.erro);
    for (const item of itens) {
      try {
        await api(item.rota, { metodo: 'POST', corpo: { ...item.corpo, uid: item.uid } });
        await removerDaFila(item.uid);
      } catch (e) {
        if (!e.codigo || e.codigo === 'nao_autenticado' || e.codigo === 'troca_senha_obrigatoria') {
          break;                       // sem rede ou sem login: tenta depois
        }
        item.erro = e.codigo;          // regra de negócio: fica para revisão
        await atualizarItem(item);
      }
    }
  } finally {
    sincronizando = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', sincronizar);
}
