import {
  DiaSemana,
  Lembrete,
  LembreteEntrada,
  PoliticaDiaUtil,
  RECORRENCIA_VAZIA,
} from '../api/modelos';
import { agoraLocalIso } from './datas';

/**
 * Ponte entre o formulário e a API, nos dois sentidos.
 *
 * Vive fora do componente porque a ida e a volta precisam casar: editar um
 * lembrete é ler a regra para os campos e devolvê-la ao servidor. Se as duas
 * conversões divergirem, salvar sem mexer em nada muda a recorrência — e o
 * teste de ida-e-volta é o que prende isso.
 */

/** As estratégias de recorrência são exclusivas; o formulário escolhe uma. */
export type Estrategia = 'intervalo' | 'semana' | 'mes';
export type Unidade = 'minutos' | 'horas' | 'dias';

export interface EstadoFormulario {
  titulo: string;
  descricao: string;
  categoriaId: number | null;
  estrategia: Estrategia;
  passo: string;
  unidade: Unidade;
  diasSemana: DiaSemana[];
  posicaoMes: number | null;
  diasMes: string;
  horario: string;
  politica: PoliticaDiaUtil;
  quantidade: string;
}

export const FORMULARIO_VAZIO: EstadoFormulario = {
  titulo: '',
  descricao: '',
  categoriaId: null,
  estrategia: 'semana',
  passo: '3',
  unidade: 'horas',
  diasSemana: [],
  posicaoMes: null,
  diasMes: '',
  horario: '09:00',
  politica: 'IGNORAR',
  quantidade: '',
};

const lista = <T>(v: readonly T[] | null | undefined): T[] => (v ? [...v] : []);

/** Lê um lembrete do servidor para os campos do formulário. */
export function paraFormulario(lembrete: Lembrete): EstadoFormulario {
  const r = lembrete.recorrencia;
  const diasSemana = lista(r?.diasDaSemana);
  const diasMes = lista(r?.diasFixosNoMes);

  // A ordem importa: a API aceita combinações que o formulário não representa,
  // então elegemos a estratégia pelo campo que de fato governa o agendamento.
  let estrategia: Estrategia = 'semana';
  let unidade: Unidade = 'horas';
  let passo = '3';

  if (r?.intervaloMinutos) {
    estrategia = 'intervalo';
    unidade = 'minutos';
    passo = String(r.intervaloMinutos);
  } else if (r?.intervaloHoras) {
    estrategia = 'intervalo';
    unidade = 'horas';
    passo = String(r.intervaloHoras);
  } else if (r?.intervaloDias) {
    estrategia = 'intervalo';
    unidade = 'dias';
    passo = String(r.intervaloDias);
  } else if (diasSemana.length) {
    estrategia = 'semana';
  } else if (diasMes.length) {
    estrategia = 'mes';
  }

  return {
    titulo: lembrete.titulo ?? '',
    descricao: lembrete.descricao ?? '',
    categoriaId: lembrete.categoria?.id ?? null,
    estrategia,
    passo,
    unidade,
    diasSemana,
    posicaoMes: r?.posicaoDaSemanaNoMes ?? null,
    diasMes: [...diasMes].sort((a, b) => a - b).join(', '),
    horario: lembrete.notificacao?.horario ?? '09:00',
    politica: r?.politicaDiaUtil ?? 'IGNORAR',
    quantidade: r?.quantidade != null ? String(r.quantidade) : '',
  };
}

/**
 * Monta o corpo de POST/PUT a partir dos campos.
 *
 * Duas armadilhas moram aqui:
 * - os intervalos vão em `recorrencia`, nunca em `notificacao`;
 * - em recorrência por intervalo, `dataInicio` é o instante ATUAL, não o do
 *   primeiro disparo: quem soma o passo é o servidor. Somar aqui atrasaria o
 *   lembrete no dobro do intervalo.
 */
export function paraEntrada(estado: EstadoFormulario): LembreteEntrada {
  const porIntervalo = estado.estrategia === 'intervalo';
  const passo = Math.max(1, Number(estado.passo) || 1);
  const quantidade = Number(estado.quantidade);

  return {
    titulo: estado.titulo.trim(),
    descricao: estado.descricao.trim() || null,
    categoriaId: estado.categoriaId as number,
    recorrencia: {
      ...RECORRENCIA_VAZIA,
      quantidade: Number.isFinite(quantidade) && quantidade > 0 ? quantidade : null,
      intervaloMinutos: porIntervalo && estado.unidade === 'minutos' ? passo : null,
      intervaloHoras: porIntervalo && estado.unidade === 'horas' ? passo : null,
      intervaloDias: porIntervalo && estado.unidade === 'dias' ? passo : null,
      posicaoDaSemanaNoMes: estado.estrategia === 'semana' ? estado.posicaoMes : null,
      diasFixosNoMes: estado.estrategia === 'mes' ? diasDoMes(estado.diasMes) : [],
      diasDaSemana: estado.estrategia === 'semana' ? estado.diasSemana : [],
      // O servidor grava IGNORAR e null como valores distintos, embora signifiquem
      // o mesmo ("não olhe feriado"). O front escreve sempre null, senão abrir um
      // lembrete e salvar sem mexer em nada reescreveria o campo de null para
      // IGNORAR — mudança invisível na tela e real no banco.
      politicaDiaUtil:
        porIntervalo || estado.politica === 'IGNORAR' ? null : estado.politica,
    },
    notificacao: {
      metodo: ['pop-up'],
      horario: porIntervalo ? null : estado.horario,
      dataInicio: porIntervalo ? agoraLocalIso() : null,
      dataFim: null,
      datasEspecificadas: [],
    },
  };
}

/** "10, 25" -> [10, 25], descartando o que não é dia de mês válido. */
function diasDoMes(texto: string): number[] {
  const numeros = texto
    .split(/[^0-9]+/)
    .map(Number)
    .filter(n => n >= 1 && n <= 31);
  return [...new Set(numeros)].sort((a, b) => a - b);
}
