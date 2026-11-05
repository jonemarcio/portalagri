// Tela aberta ao ler o QR da etiqueta (/leitura/?id=LAB-0002).
// Mostra uma coisa diferente conforme o perfil e o status da amostra:
//  - coordenador, etiqueta DISPONIVEL     -> lançar coleta
//  - coordenador, amostra já lançada      -> consultar e editar (com histórico)
//  - analista LASA, ENVIADA ou PERDIDA    -> registrar recebimento
//  - demais casos                         -> só consulta

const ID = (new URLSearchParams(location.search).get('id') || '').trim().toUpperCase();
let usuario = null;
let amostra = null;                 // null quando offline e sem consulta
let campos = [];
let listas = { prestadores: [], marcas: [], frotas: [], coletores: [] };
let condicoes = [];

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...filhos) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k.startsWith('on')) n[k] = v; else n.setAttribute(k, String(v));
  }
  filhos.flat().forEach(f => n.append(f && f.nodeType ? f : document.createTextNode(f ?? '')));
  return n;
};
const status = (t) => { $('#status').textContent = t; };
const msg = (tipo, texto) => el('div', { class: 'msg ' + tipo }, texto);
const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });

// Dados do planejamento: online busca e guarda; offline usa o último guardado.
async function comCache(nome, rota) {
  try {
    const dados = await api(rota);
    localStorage.setItem(nome, JSON.stringify(dados));
    return dados;
  } catch (e) {
    if (e.codigo) throw e;
    return JSON.parse(localStorage.getItem(nome) || 'null');
  }
}

async function iniciar() {
  $('#etiqueta').textContent = ID || 'NÃO LIDA';
  if (!ID) return status('Leia o QR da etiqueta para abrir esta tela.');

  try {
    usuario = await api('me');
    localStorage.setItem('usuario', JSON.stringify(usuario));
  } catch (e) {
    if (e.codigo) {
      return status(e.codigo === 'troca_senha_obrigatoria'
        ? 'Troque sua senha antes de continuar (tela de entrada).'
        : 'Faça login na tela inicial para continuar.');
    }
    usuario = JSON.parse(localStorage.getItem('usuario') || 'null');   // sem rede
    if (!usuario) return status('Sem internet. Faça login uma vez com conexão.');
  }
  $('#quem').textContent = `${usuario.nome} · ${usuario.perfil}`;

  campos = (await comCache('cache_campos', 'planejamento/campos')) || [];
  listas = (await comCache('cache_listas', 'planejamento/listas')) || listas;
  condicoes = (await comCache('cache_condicoes', 'condicoes')) || [];

  try {
    const d = await api('amostra', { query: '&id=' + encodeURIComponent(ID) });
    amostra = d.amostra;
  } catch (e) {
    if (e.codigo === 'etiqueta_nao_encontrada') return status('Esta etiqueta não existe no sistema.');
    amostra = null;                                   // sem rede: não sabemos o status
  }
  decidirTela();
  atualizarFila();
}

function decidirTela() {
  const status_ = amostra ? amostra.status : 'DISPONIVEL';   // offline assume lançamento
  mostrarSituacao();

  if (usuario.perfil === 'analista' && ['ENVIADA', 'PERDIDA'].includes(status_)) {
    return formRecebimento();
  }
  if (usuario.perfil === 'coordenador') {
    if (status_ === 'DISPONIVEL') return formColeta();
    if (status_ === 'ENVIADA' || status_ === 'PERDIDA' || status_ === 'RECEBIDA') return formColeta(true);
  }
  if (usuario.perfil === 'admin' && status_ === 'ENVIADA') {
    $('#situacao').append(el('button', { class: 'btn perigo', onclick: marcarPerdida }, 'Marcar como Perdida'));
  }
}

function mostrarSituacao() {
  const box = $('#situacao');
  box.hidden = false;
  box.innerHTML = '';
  if (!amostra) {
    box.append(msg('aviso', 'Sem internet: não foi possível ver o status desta etiqueta.'));
    return;
  }
  const linhas = [
    ['Status', amostra.status],
    ['Tipo', amostra.tipo],
    ['Campo', amostra.campo],
    ['Fazenda', amostra.fazenda],
    ['Cultivar', amostra.cultivar],
    ['Safra', amostra.safra],
    ['Frota', amostra.frota],
    ['Marca', amostra.marca],
    ['Prestador', amostra.prestador],
    ['Coletor', amostra.coletor],
    ['Crachá do coletor', amostra.coletor_cracha],
    ['Data da coleta', amostra.data_coleta],
    ['Observação', amostra.observacao],
    ['Condição no recebimento', amostra.condicao],
    ['Observação do recebimento', amostra.observacao_recebimento],
  ].filter(([, v]) => v);
  const dl = el('dl', {}, linhas.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, String(v))]));
  box.append(el('h2', {}, 'Situação'), dl);
}

// ---------- Validação (mesmas regras do servidor, para avisar antes) ----------

function avaliarCampo(valor) {
  const info = $('#campo-info');
  info.innerHTML = '';
  const r = campos.find(c => c.Campo === valor.trim());
  if (!r) { info.append(msg('erro', 'Campo não cadastrado. Lançamento bloqueado.')); return { bloqueia: true }; }
  if (!r.Cultivar) { info.append(msg('erro', 'Campo sem cultivar cadastrada. Lançamento bloqueado.')); return { bloqueia: true }; }
  if (!r.Ativo) info.append(msg('aviso', '⚠ Campo não planejado (status em branco). Pode seguir.'));
  info.append(msg('ok', `${r.Fazenda} · ${r.Cultivar} · ${r.Safra}`));
  return { bloqueia: false, linha: r };
}

function avaliarFrota(valor) {
  const f = listas.frotas.find(x => x.frota === valor.trim());
  const marca = $('#marca');
  const aviso = $('#frota-aviso');
  aviso.innerHTML = '';
  if (!valor.trim()) { marca.readOnly = false; return; }
  if (f) {
    marca.value = f.marca || '';
    marca.readOnly = true;
  } else {
    marca.readOnly = false;
    aviso.append(msg('aviso', '⚠ Frota não cadastrada. Digite a marca; a frota vai para o cadastro.'));
  }
}

function avaliarPrestador(valor) {
  const aviso = $('#prest-aviso');
  aviso.innerHTML = '';
  if (valor.trim() && !listas.prestadores.includes(valor.trim())) {
    aviso.append(msg('aviso', '⚠ Prestador não cadastrado. Pode seguir.'));
  }
}

// Coletor: precisa estar na aba Listas. Mostra o crachá cadastrado. Devolve o cadastro ou undefined.
function avaliarColetor(valor) {
  const aviso = $('#coletor-aviso');
  aviso.innerHTML = '';
  const nome = valor.trim();
  if (!nome) return undefined;
  const c = (listas.coletores || []).find(x => x.nome === nome);
  if (!c) {
    aviso.append(msg('erro', 'Coletor não cadastrado. Lançamento bloqueado.'));
    return undefined;
  }
  aviso.append(msg('ok', c.cracha ? `Crachá ${c.cracha}` : 'Coletor sem crachá cadastrado'));
  return c;
}

// ---------- Lançamento e edição (coordenador) ----------

function formColeta(editando = false) {
  const dados = editando && amostra ? amostra : {};
  const f = $('#form');
  f.hidden = false;
  f.innerHTML = '';

  const tipo = el('select', { id: 'tipo' },
    el('option', { value: '' }, 'Selecione'),
    el('option', { value: 'MAQUINA' }, 'Máquina'),
    el('option', { value: 'TALHAO' }, 'Talhão'));
  tipo.value = dados.tipo || '';

  const campo = el('input', { id: 'campo', list: 'dl-campos', autocomplete: 'off', value: dados.campo || '', placeholder: 'Digite o campo' });
  campo.oninput = () => avaliarCampo(campo.value);

  const frota = el('input', { id: 'frota', list: 'dl-frotas', autocomplete: 'off', value: dados.frota || '', placeholder: 'Digite a frota' });
  frota.oninput = () => avaliarFrota(frota.value);

  const marca = el('input', { id: 'marca', value: dados.marca || '', placeholder: 'Marca' });
  const prest = el('input', { id: 'prestador', list: 'dl-prest', autocomplete: 'off', value: dados.prestador || '', placeholder: 'Prestador' });
  prest.oninput = () => avaliarPrestador(prest.value);
  const coletor = el('input', { id: 'coletor', list: 'dl-coletores', autocomplete: 'off', value: dados.coletor || '', placeholder: 'Digite o coletor' });
  coletor.oninput = () => avaliarColetor(coletor.value);
  const data = el('input', { id: 'data', type: 'date', value: dados.data_coleta || hojeISO() });
  const obs = el('textarea', { id: 'observacao', rows: 3 }, dados.observacao || '');

  f.append(
    el('h2', {}, editando ? 'Editar coleta' : 'Lançar coleta'),
    el('label', {}, 'Tipo de amostragem', tipo),
    el('label', {}, 'Campo', campo), el('div', { id: 'campo-info' }),
    el('label', {}, 'Frota', frota), el('div', { id: 'frota-aviso' }),
    el('label', {}, 'Marca', marca),
    el('label', {}, 'Prestador', prest), el('div', { id: 'prest-aviso' }),
    el('label', {}, 'Coletor', coletor), el('div', { id: 'coletor-aviso' }),
    el('label', {}, 'Data da coleta', data),
    el('label', {}, 'Observação', obs),
    el('button', { class: 'btn', type: 'button', onclick: () => revisarColeta(editando) }, 'Revisar'),
    el('datalist', { id: 'dl-campos' }, campos.map(c => el('option', { value: c.Campo, label: `${c.Fazenda} · ${c.Cultivar || 'sem cultivar'}` }))),
    el('datalist', { id: 'dl-frotas' }, listas.frotas.map(x => el('option', { value: x.frota }))),
    el('datalist', { id: 'dl-prest' }, listas.prestadores.map(p => el('option', { value: p }))),
    el('datalist', { id: 'dl-coletores' }, (listas.coletores || []).map(c => el('option', { value: c.nome, label: c.cracha ? `Crachá ${c.cracha}` : '' })))
  );
  if (dados.campo) avaliarCampo(dados.campo);
  if (dados.frota) avaliarFrota(dados.frota);
  if (dados.coletor) avaliarColetor(dados.coletor);
}

function lerColeta() {
  return {
    tipo: $('#tipo').value,
    campo: $('#campo').value.trim(),
    frota: $('#frota').value.trim(),
    marca: $('#marca').value.trim(),
    prestador: $('#prestador').value.trim(),
    coletor: $('#coletor').value.trim(),
    data: $('#data').value,
    observacao: $('#observacao').value.trim(),
  };
}

function revisarColeta(editando) {
  const d = lerColeta();
  if (!d.tipo) return alertar('Escolha o tipo de amostragem.');
  if (!d.data) return alertar('Informe a data da coleta.');
  const c = avaliarCampo(d.campo);
  if (c.bloqueia) return;
  if (!d.coletor) return alertar('Informe o coletor.');
  const col = avaliarColetor(d.coletor);
  if (!col) return alertar('Coletor não cadastrado.');

  const r = $('#resumo');
  r.hidden = false;
  r.innerHTML = '';
  r.append(
    el('h2', {}, 'Conferência'),
    el('dl', {}, Object.entries({
      'Etiqueta': ID, 'Tipo': d.tipo, 'Campo': d.campo, 'Cultivar': c.linha.Cultivar,
      'Frota': d.frota, 'Marca': d.marca, 'Prestador': d.prestador,
      'Coletor': col.cracha ? `${col.nome} (crachá ${col.cracha})` : col.nome,
      'Data': d.data, 'Observação': d.observacao,
    }).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v || '-')])),
    el('button', { class: 'btn', onclick: () => confirmarColeta(editando, d) }, 'Confirmar e enviar'),
    el('button', { class: 'btn secundario', onclick: () => { r.hidden = true; } }, 'Voltar e editar')
  );
}

async function confirmarColeta(editando, d) {
  if (editando && amostra) {
    const mapa = { tipo: 'tipo', campo: 'campo', frota: 'frota', marca: 'marca', prestador: 'prestador', coletor: 'coletor', data: 'data_coleta', observacao: 'observacao' };
    const alteracoes = {};
    for (const [chave, coluna] of Object.entries(mapa)) {
      if ((amostra[coluna] || '') !== (d[chave] || '')) alteracoes[chave] = d[chave];
    }
    if (!Object.keys(alteracoes).length) return alertar('Nada foi alterado.');
    await enfileirarEAtualizar({ rota: 'coleta/editar', corpo: { id: ID, alteracoes } }, 'Alteração guardada.');
  } else {
    await enfileirarEAtualizar({ rota: 'coleta', corpo: { id: ID, ...d } }, 'Coleta guardada.');
  }
}

// ---------- Recebimento (analista LASA) ----------

function formRecebimento() {
  const f = $('#form');
  f.hidden = false;
  f.innerHTML = '';
  const cond = el('select', { id: 'condicao' }, el('option', { value: '' }, 'Selecione'),
    condicoes.filter(c => c.ativo == 1).map(c => el('option', { value: c.codigo, 'data-obs': c.exige_observacao }, `${c.codigo} – ${c.descricao}`)));
  const obs = el('textarea', { id: 'observacao', rows: 3, placeholder: 'Observação' });
  const aviso = el('div', { id: 'obs-aviso' });
  cond.onchange = () => {
    const exige = cond.selectedOptions[0]?.dataset.obs == 1;
    aviso.innerHTML = '';
    if (exige) aviso.append(msg('aviso', 'Observação obrigatória para esta condição.'));
  };
  f.append(
    el('h2', {}, 'Recebimento'),
    el('label', {}, 'Condição da amostra', cond),
    el('label', {}, 'Observação', obs), aviso,
    el('button', { class: 'btn', type: 'button', onclick: confirmarRecebimento }, 'Confirmar recebimento')
  );
}

async function confirmarRecebimento() {
  const condicao = $('#condicao').value;
  const observacao = $('#observacao').value.trim();
  if (!condicao) return alertar('Escolha a condição da amostra.');
  const cfg = condicoes.find(c => c.codigo === condicao);
  if (cfg && cfg.exige_observacao == 1 && !observacao) return alertar('Esta condição exige observação.');
  await enfileirarEAtualizar({ rota: 'recebimento', corpo: { id: ID, condicao, observacao } }, 'Recebimento guardado.');
}

// ---------- Perdida (admin) ----------

async function marcarPerdida() {
  if (!confirm('Marcar esta amostra como Perdida?')) return;
  try {
    await api('perdida', { metodo: 'POST', corpo: { id: ID } });
    status('Amostra marcada como Perdida.');
  } catch (e) {
    alertar('Não foi possível: ' + e.codigo);
  }
}

// ---------- Utilidades ----------

function alertar(texto) {
  status(texto);
}

async function enfileirarEAtualizar(item, mensagemOk) {
  await enfileirar({ uid: crypto.randomUUID(), rota: item.rota, corpo: item.corpo, criadoEm: Date.now() });
  $('#resumo').hidden = true;
  if (navigator.onLine) await sincronizar();
  status(mensagemOk + (navigator.onLine ? '' : ' Será enviada quando houver internet.'));
  atualizarFila();
}

async function atualizarFila() {
  const itens = await pendentes();
  const box = $('#fila');
  box.hidden = itens.length === 0;
  if (!itens.length) return;
  const com_erro = itens.filter(i => i.erro);
  box.textContent = `Pendentes para enviar: ${itens.length - com_erro.length}` +
    (com_erro.length ? ` · Com erro de regra: ${com_erro.map(i => i.erro).join(', ')}` : '');
}

window.addEventListener('online', async () => {
  await sincronizar();
  atualizarFila();
});

iniciar();
