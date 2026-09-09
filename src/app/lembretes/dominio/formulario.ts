import {
  DetalhesEntrada,
  DiaSemana,
  Lembrete,
  LembreteEntrada,
  PoliticaDiaUtil,
  RECORRENCIA_VAZIA,
} from '../api/modelos';
import { INTERVALO_MINIMO_MINUTOS } from '../lembretes.config';
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
  const quantidade = Number(estado.quantidade);
  // Abaixo de 5 minutos o servidor recusa com 422. O campo já limita, mas a
  // trava mora aqui também para nenhum caminho escapar.
  const minimo = estado.unidade === 'minutos' ? INTERVALO_MINIMO_MINUTOS : 1;
  const passo = Math.max(minimo, Number(estado.passo) || minimo);

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

/** Corpo do PATCH de detalhes — o que dá para mudar sem reagendar nada. */
export function paraDetalhes(estado: EstadoFormulario): DetalhesEntrada {
  return {
    titulo: estado.titulo.trim(),
    descricao: estado.descricao.trim() || null,
    categoriaId: estado.categoriaId as number,
  };
}

/**
 * Diz se a edição mexeu no agendamento.
 *
 * Existe para escolher o verbo certo: `PATCH /detalhes` preserva a série e o
 * status, enquanto `PUT` recalcula os disparos e devolve um lembrete concluído
 * para PENDENTE. Corrigir uma vírgula no título pelo `PUT` ressuscitaria o
 * lembrete sem o usuário pedir.
 */
export function mudouAgendamento(antes: EstadoFormulario, depois: EstadoFormulario): boolean {
  if (antes.estrategia !== depois.estrategia) return true;

  switch (depois.estrategia) {
    case 'intervalo':
      if (antes.unidade !== depois.unidade) return true;
      if (Number(antes.passo) !== Number(depois.passo)) return true;
      break;
    case 'semana':
      // Comparado como conjunto: alternar um dia duas vezes muda a ordem do
      // array sem mudar a regra.
      if (chaveDias(antes.diasSemana) !== chaveDias(depois.diasSemana)) return true;
      if (antes.posicaoMes !== depois.posicaoMes) return true;
      break;
    case 'mes':
      if (chaveNumeros(antes.diasMes) !== chaveNumeros(depois.diasMes)) return true;
      break;
  }

  if (depois.estrategia !== 'intervalo') {
    if (antes.horario !== depois.horario) return true;
    if (antes.politica !== depois.politica) return true;
  }

  return Number(antes.quantidade || 0) !== Number(depois.quantidade || 0);
}

const chaveDias = (dias: readonly DiaSemana[]): string => [...dias].sort().join(',');

const chaveNumeros = (texto: string): string =>
  [...new Set(texto.split(/[^0-9]+/).map(Number).filter(n => n >= 1 && n <= 31))]
    .sort((a, b) => a - b)
    .join(',');
