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
`vercel.app` é public suffix. O front só funciona publicado num subdomínio de
`rotafin.com.br`, e cada origem precisa estar em `CORS_ALLOWED_ORIGINS` no
backend; fora da lista, o preflight leva 403.

Limites por sessão: 10 lembretes, 10 chamadas de IA, 48h de inatividade
(`SESSAO_HORAS` em `lembretes.config.ts`). Qualquer chamada renova o prazo. O
cookie dura 7 dias, mas quem manda é o servidor: passadas as 48h, o visitante
vira outro.

## Publicação

Projeto próprio na Vercel, em `https://lembretes.rotafin.com.br`, servido na
raiz. O `vercel.json` da raiz roda `npm run build` e devolve `index.html` para
qualquer caminho que não seja arquivo.

**O endereço do backend vem do `.env`** (`API_URL`). O Angular 17 não lê `.env`,
então `scripts/build.mjs` carrega o arquivo e roda o build com a opção `define`,
que troca o identificador `API_URL` pelo texto no bundle. Uma variável de
ambiente de mesmo nome vence o arquivo, e o script recusa URL ausente ou sem
`https`. Duas regras ficam de fora do `.env`:

- em `localhost` vale sempre `http://localhost:8080` (ver "Sessão");
- `ng build` direto não passa pelo script; sem `API_URL`, a tela falha ao
  carregar com uma mensagem dizendo isso, em vez de cair calada num endereço
  chumbado.

Subdomínio, e não um `*.vercel.app`, por causa do cookie: só no mesmo site da
API ele viaja como cookie próprio. Para um domínio novo funcionar, três coisas
fora deste repo: o domínio no projeto da Vercel, o CNAME no registro.br e a
origem em `CORS_ALLOWED_ORIGINS` no backend.

## Mapa

| Arquivo | Papel |
| --- | --- |
| `lembretes.config.ts` | Base da API (do `.env`, no build), limites, sugestões, gatilhos, URL do simulador. |
| `lembretes.routes.ts` | Rota lazy + injetor isolado com todos os providers. |
| `api/modelos.ts` | Contratos, conferidos contra as respostas reais. |
| `api/credenciais.interceptor.ts` | `withCredentials` em tudo que vai para a API. |
| `api/erros.ts` | Normaliza erro do HttpClient (429, `camposInvalidos`, falha de rede). |
| `api/lembrete.service.ts` | Sessão, categorias e CRUD de lembretes. |
| `api/notificacoes.service.ts` | SSE, fora da zone do Angular. Reabre com backoff quando o servidor recusa o stream, e avisa a tela ao voltar para ela relistar. |
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
