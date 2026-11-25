import { Lembrete, LembreteEntrada } from '../../api/modelos';

/**
 * Exemplos do artigo, no formato real dos DTOs do backend.
 *
 * TODO(artigo): os valores são ilustrativos. Trocar pelo que o
 * `POST /chat/interpretacao` e o `POST /lembrete` devolverem de verdade para
 * a frase abaixo — o artigo promete mostrar a resposta do sistema.
 */
export const FRASE_EXEMPLO =
  'me lembra de revisar a parcela do financiamento todo dia 31, e se cair em fim de semana antecipa';

export const EXEMPLO_RASCUNHO: LembreteEntrada = {
  titulo: 'Revisar a parcela do financiamento',
  descricao: null,
  categoriaId: 1,
  recorrencia: {
    quantidade: null,
    intervaloDias: null,
    intervaloHoras: null,
    intervaloMinutos: null,
    posicaoDaSemanaNoMes: null,
    diasFixosNoMes: [31],
    diasDaSemana: null,
    politicaDiaUtil: 'ANTECIPAR',
  },
  notificacao: {
    metodo: ['pop-up'],
    horario: '09:00',
    dataInicio: null,
    dataFim: null,
    datasEspecificadas: null,
  },
} as LembreteEntrada;

export const EXEMPLO_RESPOSTA = {
  uuid: '3f2c9a1e-7b4d-4c1a-9e2f-8d6b5a4c3e21',
  titulo: 'Revisar a parcela do financiamento',
  descricao: null,
  status: 'PENDENTE',
  categoria: { id: 1, nome: 'Importante', cor: '#E53935', fatorOrdem: 1 },
  recorrencia: EXEMPLO_RASCUNHO.recorrencia,
  notificacao: {
    id: 12,
    metodo: ['pop-up'],
    horario: '09:00',
    proximaExecucao: '2026-12-31T09:00:00',
    ultimaExecucao: null,
    dataInicio: null,
    dataFim: null,
    datasEspecificadas: null,
  },
  proximasExecucoes: [
    '2026-12-31T09:00:00',
    '2027-01-29T09:00:00',
    '2027-03-31T09:00:00',
    '2027-05-31T09:00:00',
    '2027-07-30T09:00:00',
  ],
} as unknown as Lembrete;
