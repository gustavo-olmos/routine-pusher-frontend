/** Contratos da API do agendador — conferidos contra as respostas reais. */

export type StatusLembrete = 'PENDENTE' | 'CONCLUIDO';

export type DiaSemana =
  | 'SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA'
  | 'SEXTA' | 'SABADO' | 'DOMINGO';

/** O que fazer quando o disparo cai em feriado ou fim de semana. */
export type PoliticaDiaUtil = 'IGNORAR' | 'PULAR' | 'ADIAR' | 'ANTECIPAR';

export interface Sessao {
  uuid: string;
  criadaEm: string;
  expiraEm: string;
}

export interface Categoria {
  id: number;
  nome: string;
  cor: string;
  fatorOrdem: number;
}

/**
 * Como o lembrete se repete. Escolha UMA estratégia — os intervalos moram aqui,
 * não em `notificacao`, e misturar dois eixos é o caminho mais curto para o 422.
 *
 * Na resposta do servidor as listas podem vir `null` em vez de `[]`; leia sempre
 * com guarda.
 */
export interface Recorrencia {
  /** Nº de disparos; `null` = indefinido. */
  quantidade: number | null;
  intervaloDias: number | null;
  intervaloHoras: number | null;
  intervaloMinutos: number | null;
  /** 1..5, combinada com `diasDaSemana`: "2ª segunda do mês". */
  posicaoDaSemanaNoMes: number | null;
  diasFixosNoMes: number[] | null;
  diasDaSemana: DiaSemana[] | null;
  politicaDiaUtil: PoliticaDiaUtil | null;
}

export interface Notificacao {
  /** Só na resposta. */
  id?: number;
  /** Lista não vazia — obrigatória. */
  metodo: string[];
  /** "HH:mm", para recorrência de calendário. */
  horario: string | null;
  proximaExecucao?: string | null;
  ultimaExecucao?: string | null;
  /**
   * Em repetição por intervalo é o momento ATUAL, não o do primeiro disparo:
   * o servidor é quem soma o intervalo. Somar aqui atrasa o lembrete em dobro.
   */
  dataInicio: string | null;
  dataFim: string | null;
  datasEspecificadas: string[] | null;
}

/** Corpo de POST/PUT. Repare: manda `categoriaId`, recebe `categoria`. */
export interface LembreteEntrada {
  titulo: string;
  descricao?: string | null;
  categoriaId: number;
  recorrencia: Recorrencia;
  notificacao: Notificacao;
}

export interface Lembrete {
  uuid: string;
  titulo: string;
  descricao: string | null;
  status: StatusLembrete;
  categoria: Categoria;
  recorrencia: Recorrencia;
  notificacao: Notificacao;
  /** Já calculado pelo servidor — a fonte das datas na tela. */
  proximasExecucoes: string[] | null;
}

export interface FraseEntrada {
  frase: string;
  /** Relógio de quem pede. Sem isto, "amanhã às 9h" resolve no fuso do servidor. */
  agora?: string;
}

/** Recorrência vazia — ponto de partida de todo formulário. */
export const RECORRENCIA_VAZIA: Recorrencia = {
  quantidade: null,
  intervaloDias: null,
  intervaloHoras: null,
  intervaloMinutos: null,
  posicaoDaSemanaNoMes: null,
  diasFixosNoMes: [],
  diasDaSemana: [],
  politicaDiaUtil: null,
};

export const DIAS_SEMANA: readonly { valor: DiaSemana; curto: string }[] = [
  { valor: 'SEGUNDA', curto: 'seg' },
  { valor: 'TERCA', curto: 'ter' },
  { valor: 'QUARTA', curto: 'qua' },
  { valor: 'QUINTA', curto: 'qui' },
  { valor: 'SEXTA', curto: 'sex' },
  { valor: 'SABADO', curto: 'sáb' },
  { valor: 'DOMINGO', curto: 'dom' },
];
