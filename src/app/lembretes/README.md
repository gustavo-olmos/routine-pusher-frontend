# Agendador de lembretes — módulo descartável

Recurso temporário. Existe para atrair visitante e empurrar para o simulador de
financiamento. Quando cumprir o papel, sai inteiro.

## Como remover

1. `rm -rf src/app/lembretes/`
2. Apagar a entrada do agendador em `app.routes.ts`.
3. Apagar a entrada de `assets` do `rp-notificacoes-sw.js` no `angular.json`
   (em `build` e em `test`).

É só isso. Nada aqui é provido em `app.config.ts`, nenhum serviço vaza para o
resto do site e não há estado compartilhado com o simulador.

## Como levar para o projeto do simulador

1. Copiar a pasta `lembretes/` para `src/app/`.
2. Acrescentar a rota:
   ```ts
   { path: 'lembretes', loadChildren: () => import('./lembretes/lembretes.routes') }
   ```
3. Em `lembretes.config.ts`, apontar `SIMULADOR_URL` para a rota real.
4. Garantir as fontes IBM Plex no `index.html` (Sans 400/500/600 e Mono 400/500/600).
5. Copiar a entrada de `assets` do `rp-notificacoes-sw.js` do `angular.json`.

Os únicos pontos que tocam o mundo de fora estão em `lembretes.config.ts`.

## Isolamento

`lembretes.routes.ts` declara `provideHttpClient` **no injetor da rota**, não no
da aplicação. Duas consequências desejadas:

- o interceptor de credenciais vale só para o agendador — nenhuma chamada do
  simulador ganha `withCredentials` sem querer;
- o agendador **não** herda os interceptors globais do site anfitrião. Se lá
  houver um de autenticação, ele não roda aqui, que é o correto: esta API usa
  sessão anônima por cookie, não token.

## Sessão

A identidade é o cookie HttpOnly `RP_SESSAO`. JavaScript não lê nem escreve —
quem gerencia é o navegador. Nada de id de sessão em `localStorage`.

**Em desenvolvimento, o backend precisa estar em `localhost:8080`.** O cookie é
`SameSite=Lax` e não viaja em XHR cross-site; `localhost:4200` chamando
`api.rotafin.com.br` faz cada requisição nascer numa sessão nova. O sintoma é
traiçoeiro: criar responde 200, listar responde `[]`, sem erro nenhum.
`API_BASE` já resolve isso sozinho pelo hostname.

Pelo mesmo motivo, preview da Vercel (`*.vercel.app`) não terá sessão —
`vercel.app` é public suffix. Só `rotafin.com.br` e `www.rotafin.com.br`.

Limites por sessão: 10 lembretes, 10 chamadas de IA, 48h de inatividade
(`SESSAO_HORAS` em `lembretes.config.ts`). Qualquer chamada renova o prazo. O
cookie dura 7 dias, mas quem manda é o servidor: passadas as 48h, o visitante
vira outro.

## Publicação

O build de produção sai com `baseHref: '/lembretes/'` e os arquivos em
`dist/routine-pusher-frontend/lembretes/`, publicados como projeto próprio na
Vercel (`vercel.json` na raiz). O endereço público, `www.rotafin.com.br/lembretes`,
é um rewrite no `vercel.json` do simulador que repassa o caminho para esse deploy.

Caminho, e não subdomínio, porque para o navegador a origem continua sendo
`www.rotafin.com.br`, a única que o CORS da API aceita. `lembretes.rotafin.com.br`
leva 403 no preflight e ainda pediria um CNAME manual no registro.br. Pelo mesmo
motivo, o endereço `*.vercel.app` do deploy abre a tela, mas a API o recusa.

Duas consequências no código:

- o service worker é registrado por **caminho relativo**, que resolve contra o
  `<base href>`. Com barra na frente ele sairia da pasta publicada e cairia no
  simulador;
- a ativação do worker é esperada na própria registration, e não em
  `navigator.serviceWorker.ready`: quem abre `/lembretes` sem a barra final está
  fora do escopo `/lembretes/`, e o `ready` nunca resolveria.

## Mapa

| Arquivo | Papel |
| --- | --- |
| `lembretes.config.ts` | Base da API, limites, sugestões, gatilhos, URL do simulador. O único arquivo a tocar ao portar. |
| `lembretes.routes.ts` | Rota lazy + injetor isolado com todos os providers. |
| `api/modelos.ts` | Contratos, conferidos contra as respostas reais. |
| `api/credenciais.interceptor.ts` | `withCredentials` em tudo que vai para a API. |
| `api/erros.ts` | Normaliza erro do HttpClient (429, `camposInvalidos`, falha de rede). |
| `api/lembrete.service.ts` | Sessão, categorias e CRUD de lembretes. |
| `api/notificacoes.service.ts` | SSE, fora da zone do Angular. |
| `dominio/cron.ts` | Traduz a recorrência para cron — e admite quando não dá. |
| `dominio/datas.ts` | Formatação e o ISO **local** que o backend espera. |
| `estado/lembretes.store.ts` | Fonte única da tela. O componente não faz HTTP. |
| `funil/funil.service.ts` | Instrumentação das saídas para o simulador. |
| `ui/routine-pusher.component.*` | A tela. |

## Armadilhas da API que o código já contorna

- **`sortInfo=id` quebra em `/lembrete`** (400 "Erro ao comparar objetos: id"):
  o DTO tem `uuid`. Em `/categoria`, `id` funciona.
- **`DELETE` responde 204 sem corpo**, não JSON — daí o `responseType: 'text'`,
  que não tenta fazer parse do vazio.
- **Concluir (`PATCH /lembrete/{uuid}`) responde 200 com corpo vazio**: o estado
  novo só existe no servidor, então toda mutação relista.
- **As listas voltam `null`**, não `[]` (`diasDaSemana: null` na resposta da IA).
- **Request e response divergem**: manda `categoriaId`, recebe `categoria` objeto.
- **Os intervalos moram em `recorrencia`**, nunca em `notificacao`.
- **Em recorrência por intervalo, `dataInicio` é o instante ATUAL**, não o do
  primeiro disparo: quem soma o passo é o servidor. Somar aqui atrasa em dobro.
- **`agora` precisa ser ISO local**, não `toISOString()` — UTC empurra o relógio
  em 3 horas e resolve "amanhã às 9h" no dia errado.

## Funil

`FunilService` empurra para `window.dataLayer` (GTM/GA4) e mantém uma trilha em
memória para depurar. O evento que importa é `saida_simulador`, com `origem` em
`cabecalho`, `convite_contextual` ou `rodape`. Sem um destino de analytics
configurado o push some sem quebrar nada.

## Testes

`npm test -- --watch=false --browsers=ChromeHeadless`

Cobrem as armadilhas acima: `withCredentials` em toda chamada, o `sortInfo`
certo por recurso, o corpo do POST do formulário, a tradução para cron, 429
como limite, `camposInvalidos` de 400 e a falha de rede.
