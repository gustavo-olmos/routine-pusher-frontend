/** Utilidades de data. Puras, sem Angular. */

const MS_DIA = 86_400_000;

const dois = (n: number) => String(n).padStart(2, '0');

/**
 * Instante atual como ISO **local**, no formato que o backend espera
 * (`2026-08-31T18:45:00`).
 *
 * Não use `toISOString()`: ele converte para UTC, e no Brasil isso empurra o
 * relógio em 3 horas — "amanhã às 9h" viraria outro dia perto da meia-noite.
 */
export function agoraLocalIso(agora = new Date()): string {
  return (
    `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}` +
    `T${dois(agora.getHours())}:${dois(agora.getMinutes())}:${dois(agora.getSeconds())}`
  );
}

/**
 * O backend manda data-hora local sem fuso. `new Date('2026-09-10T09:00:00')`
 * já interpreta como local em todo browser moderno, mas datas só-data
 * (`2026-09-10`) seriam lidas como UTC — então normalizamos antes.
 */
export function paraData(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
}

export const paraDatas = (lista: readonly string[] | null | undefined): Date[] =>
  (lista ?? []).map(paraData);

/** Dias inteiros de `a` até `b`, nunca negativo. */
export const diffDias = (a: Date, b: Date) =>
  Math.max(0, Math.round((a.getTime() - b.getTime()) / MS_DIA));

export const dataCurta = (d: Date) => d.toLocaleDateString('pt-BR');

export const diaMes = (d: Date) => `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;

export const hora = (d: Date) => `${dois(d.getHours())}:${dois(d.getMinutes())}`;

export const diaSemanaLongo = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'long' });

export const diaSemanaCurto = (d: Date) =>
  d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

/**
 * Distância até a próxima execução em texto curto. Abaixo de um dia o número em
 * dias seria sempre "0d", que não diz nada — então cai para horas ou minutos.
 */
export function faltaPara(alvo: Date, agora = new Date()): string {
  const ms = alvo.getTime() - agora.getTime();
  if (ms <= 0) return 'agora';
  const minutos = Math.round(ms / 60_000);
  if (minutos < 60) return `em ${minutos}min`;
  const horas = Math.round(ms / 3_600_000);
  if (horas < 24) return `em ${horas}h`;
  return `em ${Math.round(ms / MS_DIA)}d`;
}

/** Intervalo entre duas execuções consecutivas, na mesma escala de `faltaPara`. */
export function intervaloEntre(anterior: Date, atual: Date): string {
  const ms = atual.getTime() - anterior.getTime();
  const minutos = Math.round(ms / 60_000);
  if (minutos < 60) return `+${minutos}min`;
  const horas = Math.round(ms / 3_600_000);
  if (horas < 24) return `+${horas}h`;
  return `+${Math.round(ms / MS_DIA)}d`;
}
