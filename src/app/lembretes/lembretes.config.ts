/**
 * Ajustes do agendador. Módulo descartável: quando o recurso sair, some a pasta
 * `lembretes/` e a entrada de rota em `app.routes.ts` — mais nada.
 *
 * A base da API é resolvida em runtime de propósito, e não por `fileReplacements`
 * do angular.json: assim a pasta inteira é portável para o projeto do simulador
 * sem tocar na configuração de build de lá. Se aquele projeto já tiver
 * `environments/`, troque só esta constante pelo import correspondente.
 */

const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Em desenvolvimento o backend PRECISA ser o local. `localhost:4200` chamando
 * `api.rotafin.com.br` é cross-site, e o cookie de sessão é `SameSite=Lax`:
 * ele não viaja em XHR cross-site. O sintoma é silencioso — criar devolve 200 e
 * listar devolve `[]`, porque cada requisição nasce numa sessão nova.
 */
export const API_BASE = (() => {
  const host = typeof location !== 'undefined' ? location.hostname : '';
  return LOCAIS.has(host) ? 'http://localhost:8080' : 'https://api.rotafin.com.br';
})();

export const API_V1 = `${API_BASE}/api/v1`;

/** Destino dos pontos de passagem. Trocar pela rota real do simulador no fork. */
export const SIMULADOR_URL = '/simulador';

/** Tetos por sessão anônima impostos pelo backend — estourar devolve 429. */
export const LIMITE_LEMBRETES = 10;
export const LIMITE_IA = 10;

/** A sessão morre com 30 min de inatividade; qualquer chamada renova. */
export const SESSAO_MINUTOS = 30;

/** Máximos de campo aceitos pelo backend. */
export const MAX_TITULO = 255;
export const MAX_DESCRICAO = 255;
export const MAX_FRASE = 500;

/**
 * Sugestões da tela vazia. Tema financeiro de propósito: é o primeiro degrau do
 * funil que leva ao simulador. Clicar preenche a frase, não cria nada.
 */
export const SUGESTOES: readonly string[] = [
  'me lembra de pagar a fatura do cartão todo dia 10',
  'revisar a parcela do financiamento todo último dia útil do mês',
  'conferir o extrato toda segunda de manhã',
  'juntar dinheiro pra reserva a cada 15 dias',
];

/**
 * O convite ao simulador aparece quando o lembrete recém-criado cai na categoria
 * de casa ou quando a frase fala de dívida. Casar aqui, num lugar só, para o
 * gatilho ser auditável junto com a métrica do funil.
 */
export const GATILHO_FRASE =
  /parcel|financiam|fatura|empr[ée]stim|presta[çc][ãa]o|j[uú]ros|d[íi]vida|im[óo]vel|casa pr[óo]pria/i;

export const GATILHO_CATEGORIA = 'Casa';
