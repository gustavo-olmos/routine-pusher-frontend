import { Lembrete, LembreteEntrada } from '../../api/modelos';

/**
 * Exemplos do artigo, no formato dos DTOs do backend.
 *
 * O rascunho é a resposta real do `POST /api/v1/chat/interpretacao` em produção
 * para a frase abaixo (25/11/2026, com o Gemini), na ordem de campos em que o
 * modelo devolveu. A resposta da criação reaproveita o mesmo rascunho e as
 * mesmas datas; `uuid` e `notificacao.id` são ilustrativos, porque mudam a cada
 * lembrete criado.
 */
export const FRASE_EXEMPLO =
  'me lembra de revisar a parcela do financiamento todo dia 31, e se cair em fim de semana antecipa';

const PROXIMAS_EXECUCOES = [
  '2026-12-31T09:00:00',
  '2027-01-29T09:00:00',
  '2027-03-31T09:00:00',
  '2027-05-31T09:00:00',
  '2027-07-30T09:00:00',
];

export const EXEMPLO_RASCUNHO = {
  categoriaId: 737,
  descricao: null,
  notificacao: {
    dataFim: null,
    dataInicio: null,
    datasEspecificadas: null,
    horario: '09:00',
    metodo: ['pop-up'],
  },
  recorrencia: {
    diasDaSemana: null,
    diasFixosNoMes: [31],
    intervaloDias: null,
    intervaloHoras: null,
    intervaloMinutos: null,
    politicaDiaUtil: 'ANTECIPAR',
    posicaoDaSemanaNoMes: null,
    quantidade: null,
  },
  titulo: 'Revisar a parcela do financiamento',
} as LembreteEntrada;

export const EXEMPLO_RESPOSTA = {
  uuid: '3f2c9a1e-7b4d-4c1a-9e2f-8d6b5a4c3e21',
  titulo: 'Revisar a parcela do financiamento',
  descricao: null,
  status: 'PENDENTE',
  categoria: { id: 737, nome: 'Importante', cor: '#E53935', fatorOrdem: 1 },
  recorrencia: EXEMPLO_RASCUNHO.recorrencia,
  notificacao: {
    id: 12,
    metodo: ['pop-up'],
    horario: '09:00',
    proximaExecucao: PROXIMAS_EXECUCOES[0],
    dataInicio: null,
    dataFim: null,
  },
  proximasExecucoes: PROXIMAS_EXECUCOES,
} as unknown as Lembrete;
