# ATTO Amostras (PWA)

Aplicativo de coleta e recebimento de amostras de colheita, com funcionamento offline.

## Arquitetura

- **Front-end:** este repositório, publicado pelo GitHub Pages (`https://jonemarcio.github.io/portalagri/`).
- **API:** Google Apps Script, implantado como App da Web, na conta `jonemarcio32@gmail.com`.
  Acesso "Qualquer pessoa"; a proteção é o token de sessão de cada usuário.
- **Dados:**
  - Planejamento (abas Campos e Listas): planilha do Google, somente leitura para o sistema.
  - Operação (Etiquetas, Historico, Usuarios, Sessoes, Condicoes): planilha própria, com escrita pela API.
- **Usuários:** e-mail `@attosementes.com.br`. A senha inicial é o crachá, com troca obrigatória no primeiro acesso.

## Arquivos

- `index.html`: login, troca de senha e recuperação por e-mail.
- `leitura/index.html`: tela do QR da etiqueta (lançamento, edição, recebimento).
- `js/api.js`: cliente da API. A URL da implantação fica em `API_URL`.
- `js/fila.js`: fila offline e sessão guardadas no IndexedDB. Envia a fila ao voltar a conexão e, no Android, em segundo plano.
- `js/leitura.js`: regras e telas da leitura.
- `sw.js`: service worker (cache offline e envio em segundo plano).

## Como atualizar a API

Quando o código do Apps Script mudar, é preciso criar uma nova versão em **Implantar > Gerenciar implantações**. Se a URL da implantação mudar, atualize `API_URL` em `js/api.js` e publique.
