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

/**
 * A sessão morre com 48h de inatividade; qualquer chamada renova. O cookie dura
 * 7 dias, mas quem manda é o servidor: passadas as 48h o visitante vira outro.
 *
 * É o limite mais duro da experiência — um lembrete marcado para daqui a duas
 * semanas não sobrevive se a pessoa não voltar em dois dias. A tela avisa.
 */
export const SESSAO_HORAS = 48;

/** Recorrência por intervalo abaixo disso é recusada com 422. */
export const INTERVALO_MINIMO_MINUTOS = 5;

/** Máximos de campo aceitos pelo backend. */
export const MAX_TITULO = 255;
export const MAX_DESCRICAO = 255;
export const MAX_FRASE = 500;
export const MAX_NOME_CATEGORIA = 25;

/**
 * Paleta fechada para as categorias do visitante.
 *
 * `cor` é única dentro da lista de cada um: com um seletor livre, escolher um
 * hex já usado devolve 409 e o visitante não teria como adivinhar quais estão
 * livres. Com paleta, a tela mostra o que sobrou e o 409 vira inalcançável.
 *
 * Consequência aceita: o teto de categorias passa a ser o tamanho da paleta.
 *
 * A unicidade no servidor é sensível à caixa — `#3949ab` e `#3949AB` convivem —
 * então os hex daqui são maiúsculos e a comparação normaliza antes de comparar.
 */
export const PALETA: readonly { hex: string; nome: string }[] = [
  { hex: '#E53935', nome: 'vermelho' },
  { hex: '#D81B60', nome: 'rosa' },
  { hex: '#8E24AA', nome: 'roxo' },
  { hex: '#5E35B1', nome: 'violeta' },
  { hex: '#3949AB', nome: 'índigo' },
  { hex: '#1E88E5', nome: 'azul' },
  { hex: '#039BE5', nome: 'azul-claro' },
  { hex: '#00ACC1', nome: 'ciano' },
  { hex: '#00897B', nome: 'verde-azulado' },
  { hex: '#43A047', nome: 'verde' },
  { hex: '#7CB342', nome: 'verde-limão' },
  { hex: '#F9A825', nome: 'âmbar' },
  { hex: '#FB8C00', nome: 'laranja' },
  { hex: '#6D4C41', nome: 'marrom' },
  { hex: '#546E7A', nome: 'cinza-azulado' },
];

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
 * O convite ao simulador aparece quando a frase, o título ou o nome da categoria
 * falam de dinheiro. Casar aqui, num lugar só, para o gatilho ser auditável
 * junto com a métrica do funil.
 *
 * Até set/2026 havia um segundo gatilho, `GATILHO_CATEGORIA = 'Casa'`, apoiado
 * na lista global de categorias do servidor. Aquela lista deixou de existir: as
 * categorias agora são criadas por cada visitante, e nenhuma se chama 'Casa' por
 * padrão. Comparar por nome fixo virou um gatilho que nunca dispara — daí a
 * mesma expressão passar a valer também para o nome da categoria, que o
 * visitante escolhe.
 */
export const GATILHO_FRASE =
  /parcel|financiam|fatura|empr[ée]stim|presta[çc][ãa]o|j[uú]ros|d[íi]vida|im[óo]vel|casa pr[óo]pria/i;
