import { Recorrencia } from '../api/modelos';
import { SEM_CRON, cronEquivalente, resumoRecorrencia } from './cron';

const base: Recorrencia = {
  quantidade: null,
  intervaloDias: null,
  intervaloHoras: null,
  intervaloMinutos: null,
  posicaoDaSemanaNoMes: null,
  diasFixosNoMes: [],
  diasDaSemana: [],
  politicaDiaUtil: null,
};

const r = (patch: Partial<Recorrencia>): Recorrencia => ({ ...base, ...patch });

describe('cronEquivalente', () => {
  it('traduz intervalo em horas', () => {
    expect(cronEquivalente(r({ intervaloHoras: 3 }), null)).toBe('0 */3 * * *');
  });

  it('traduz dias fixos do mês com o horário', () => {
    expect(cronEquivalente(r({ diasFixosNoMes: [10] }), '09:00')).toBe('0 9 10 * *');
  });

  it('ordena os dias do mês', () => {
    expect(cronEquivalente(r({ diasFixosNoMes: [25, 10] }), '09:00')).toBe('0 9 10,25 * *');
  });

  it('mapeia dias da semana para a numeração do cron (domingo = 0)', () => {
    const rec = r({ diasDaSemana: ['QUINTA', 'TERCA'] });
    expect(cronEquivalente(rec, '09:00')).toBe('0 9 * * 2,4');
  });

  describe('admite não haver equivalente', () => {
    // Este é o argumento do produto: dizer "sem equivalente" é mais honesto —
    // e mais vendável — do que emitir um cron que mente.

    it('quando há política de feriado, que o cron desconhece', () => {
      expect(cronEquivalente(r({ diasDaSemana: ['TERCA'], politicaDiaUtil: 'PULAR' }), '09:00'))
        .toBe(SEM_CRON);
    });

    it('quando há posição da semana no mês', () => {
      expect(cronEquivalente(r({ diasDaSemana: ['SEGUNDA'], posicaoDaSemanaNoMes: 2 }), '09:00'))
        .toBe(SEM_CRON);
    });

    it('quando o disparo tem contagem, que o cron não sabe interromper', () => {
      expect(cronEquivalente(r({ intervaloHoras: 3, quantidade: 5 }), null)).toBe(SEM_CRON);
    });

    it('quando o passo em dias não é 1, porque */n reinicia a cada mês', () => {
      expect(cronEquivalente(r({ intervaloDias: 3 }), '09:00')).toBe(SEM_CRON);
      expect(cronEquivalente(r({ intervaloDias: 1 }), '09:00')).toBe('0 9 * * *');
    });

    it('quando são datas soltas, que não formam recorrência', () => {
      expect(cronEquivalente(r({ diasFixosNoMes: [10] }), '09:00', true)).toBe(SEM_CRON);
    });

    it('quando a recorrência está vazia', () => {
      expect(cronEquivalente(base, '09:00')).toBe(SEM_CRON);
      expect(cronEquivalente(null, '09:00')).toBe(SEM_CRON);
    });
  });

  it('tolera listas nulas, como as que a IA devolve', () => {
    // A resposta do /chat/lembrete traz diasDaSemana: null, não [].
    const daIa = r({ diasFixosNoMes: [10], diasDaSemana: null });
    expect(cronEquivalente(daIa, '09:00')).toBe('0 9 10 * *');
  });
});

describe('resumoRecorrencia', () => {
  it('descreve intervalo sem colar o horário, que ali não significa nada', () => {
    expect(resumoRecorrencia(r({ intervaloHoras: 3 }), '09:00')).toBe('a cada 3 horas');
  });

  it('descreve dias do mês com o horário', () => {
    expect(resumoRecorrencia(r({ diasFixosNoMes: [10] }), '09:00')).toBe('todo dia 10, às 09:00');
  });

  it('descreve a posição da semana no mês', () => {
    const rec = r({ diasDaSemana: ['SEGUNDA'], posicaoDaSemanaNoMes: 2 });
    expect(resumoRecorrencia(rec, '09:00')).toBe('2ª segunda do mês, às 09:00');
  });

  it('anuncia a política de feriado', () => {
    const rec = r({ diasDaSemana: ['TERCA', 'QUINTA'], politicaDiaUtil: 'PULAR' });
    expect(resumoRecorrencia(rec, '09:00')).toBe('toda terça e quinta, às 09:00, pulando feriado');
  });

  it('conta as repetições quando há limite', () => {
    expect(resumoRecorrencia(r({ intervaloDias: 1, quantidade: 1 }), null)).toBe('todo dia, × 1 vez');
    expect(resumoRecorrencia(r({ intervaloDias: 1, quantidade: 4 }), null)).toBe('todo dia, × 4 vezes');
  });

  it('prefere as datas específicas quando existem', () => {
    expect(resumoRecorrencia(base, '09:00', 3)).toBe('3 datas marcadas');
  });
});
