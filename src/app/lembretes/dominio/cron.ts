import { DiaSemana, Recorrencia } from '../api/modelos';

/**
 * O selo do card. A tese do produto é "recorrências que o cron não expressa",
 * então em vez de decorar o card com um texto qualquer, tentamos de fato
 * traduzir a recorrência para cron — e quando não dá, dizer isso é o argumento
 * de venda, não uma falha.
 */
export const SEM_CRON = 'sem equivalente';

/** Cron usa 0=domingo. */
const CRON_DIA: Record<DiaSemana, number> = {
  DOMINGO: 0, SEGUNDA: 1, TERCA: 2, QUARTA: 3, QUINTA: 4, SEXTA: 5, SABADO: 6,
};

const ROTULO_DIA: Record<DiaSemana, string> = {
  DOMINGO: 'domingo', SEGUNDA: 'segunda', TERCA: 'terça', QUARTA: 'quarta',
  QUINTA: 'quinta', SEXTA: 'sexta', SABADO: 'sábado',
};

const ORDINAL = ['', '1ª', '2ª', '3ª', '4ª', '5ª'];

const lista = <T>(v: readonly T[] | null | undefined): T[] => (v ? [...v] : []);

/** Hora e minuto do campo "HH:mm", com 9h como default do backend. */
function relogio(horario: string | null | undefined): { h: number; m: number } {
  const [h, m] = (horario ?? '09:00').split(':').map(Number);
  return { h: Number.isFinite(h) ? h : 9, m: Number.isFinite(m) ? m : 0 };
}

/**
 * Cron equivalente, ou `SEM_CRON` quando a regra não cabe em cinco campos.
 *
 * Não cabem, e é proposital que não caibam:
 * - `quantidade` — cron não sabe contar disparos e parar;
 * - `politicaDiaUtil` — cron não conhece feriado;
 * - `posicaoDaSemanaNoMes` — "2ª segunda do mês" não existe em cron padrão;
 * - `datasEspecificadas` — lista de datas soltas não é uma recorrência;
 * - `intervaloDias` — `* / n` no campo de dia reinicia a cada mês, então "a cada
 *   3 dias" viraria mentira; melhor admitir do que emitir cron errado.
 */
export function cronEquivalente(
  r: Recorrencia | null | undefined,
  horario: string | null | undefined,
  temDatasEspecificadas = false,
): string {
  if (!r) return SEM_CRON;
  if (temDatasEspecificadas) return SEM_CRON;
  if (r.quantidade != null) return SEM_CRON;
  if (r.politicaDiaUtil && r.politicaDiaUtil !== 'IGNORAR') return SEM_CRON;
  if (r.posicaoDaSemanaNoMes != null) return SEM_CRON;

  const { h, m } = relogio(horario);
  const diasMes = lista(r.diasFixosNoMes);
  const diasSemana = lista(r.diasDaSemana);

  if (r.intervaloMinutos) {
    return r.intervaloMinutos < 60 ? `*/${r.intervaloMinutos} * * * *` : SEM_CRON;
  }
  if (r.intervaloHoras) {
    return r.intervaloHoras < 24 ? `${m} */${r.intervaloHoras} * * *` : SEM_CRON;
  }
  if (r.intervaloDias) {
    // Só "todo dia" tem tradução honesta; qualquer outro passo desalinha na virada do mês.
    return r.intervaloDias === 1 ? `${m} ${h} * * *` : SEM_CRON;
  }
  if (diasMes.length) {
    return `${m} ${h} ${[...diasMes].sort((a, b) => a - b).join(',')} * *`;
  }
  if (diasSemana.length) {
    const nums = diasSemana.map(d => CRON_DIA[d]).sort((a, b) => a - b);
    return `${m} ${h} * * ${nums.join(',')}`;
  }
  return SEM_CRON;
}

/** Descrição curta em português, para quem não lê cron. */
export function resumoRecorrencia(
  r: Recorrencia | null | undefined,
  horario: string | null | undefined,
  qtdDatasEspecificadas = 0,
): string {
  if (qtdDatasEspecificadas > 0) {
    return qtdDatasEspecificadas === 1 ? 'uma data marcada' : `${qtdDatasEspecificadas} datas marcadas`;
  }
  if (!r) return 'sem recorrência';

  const partes: string[] = [];
  const diasMes = lista(r.diasFixosNoMes);
  const diasSemana = lista(r.diasDaSemana);

  if (r.intervaloMinutos) partes.push(`a cada ${r.intervaloMinutos} min`);
  else if (r.intervaloHoras) partes.push(`a cada ${plural(r.intervaloHoras, 'hora')}`);
  else if (r.intervaloDias) {
    partes.push(r.intervaloDias === 1 ? 'todo dia' : `a cada ${r.intervaloDias} dias`);
  } else if (r.posicaoDaSemanaNoMes != null && diasSemana.length) {
    const ord = ORDINAL[r.posicaoDaSemanaNoMes] ?? `${r.posicaoDaSemanaNoMes}ª`;
    partes.push(`${ord} ${diasSemana.map(d => ROTULO_DIA[d]).join(' e ')} do mês`);
  } else if (diasMes.length) {
    partes.push(`todo dia ${[...diasMes].sort((a, b) => a - b).join(', ')}`);
  } else if (diasSemana.length) {
    partes.push(`toda ${diasSemana.map(d => ROTULO_DIA[d]).join(' e ')}`);
  }

  // O horário só significa algo em recorrência de calendário; em intervalo, quem
  // manda é o passo, e mostrar "às 09:00" ao lado de "a cada 3 horas" confunde.
  const porCalendario = !r.intervaloMinutos && !r.intervaloHoras && !r.intervaloDias;
  if (porCalendario && horario && partes.length) partes.push(`às ${horario}`);

  if (r.politicaDiaUtil && r.politicaDiaUtil !== 'IGNORAR') {
    partes.push(TEXTO_POLITICA[r.politicaDiaUtil]);
  }
  if (r.quantidade != null) partes.push(`× ${plural(r.quantidade, 'vez', 'vezes')}`);

  return partes.length ? partes.join(', ') : 'sem recorrência';
}

const TEXTO_POLITICA: Record<string, string> = {
  PULAR: 'pulando feriado',
  ADIAR: 'adiando feriado',
  ANTECIPAR: 'antecipando feriado',
};

function plural(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
