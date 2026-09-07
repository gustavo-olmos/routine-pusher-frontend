import { Lembrete, Recorrencia } from '../api/modelos';
import { FORMULARIO_VAZIO, paraEntrada, paraFormulario } from './formulario';

const RECORRENCIA_BASE: Recorrencia = {
  quantidade: null,
  intervaloDias: null,
  intervaloHoras: null,
  intervaloMinutos: null,
  posicaoDaSemanaNoMes: null,
  diasFixosNoMes: [],
  diasDaSemana: [],
  politicaDiaUtil: null,
};

function lembrete(recorrencia: Partial<Recorrencia>, horario: string | null = '09:00'): Lembrete {
  return {
    uuid: 'u1',
    titulo: 'Pagar a fatura',
    descricao: 'todo mês',
    status: 'PENDENTE',
    categoria: { id: 3, nome: 'Casa', cor: '#FB8C00', fatorOrdem: 3 },
    recorrencia: { ...RECORRENCIA_BASE, ...recorrencia },
    notificacao: {
      metodo: ['pop-up'],
      horario,
      dataInicio: null,
      dataFim: null,
      datasEspecificadas: [],
    },
    proximasExecucoes: [],
  };
}

describe('paraFormulario', () => {
  it('lê intervalo em horas', () => {
    const f = paraFormulario(lembrete({ intervaloHoras: 3 }, null));
    expect(f.estrategia).toBe('intervalo');
    expect(f.unidade).toBe('horas');
    expect(f.passo).toBe('3');
  });

  it('lê intervalo em minutos e em dias', () => {
    expect(paraFormulario(lembrete({ intervaloMinutos: 15 }, null)).unidade).toBe('minutos');
    expect(paraFormulario(lembrete({ intervaloDias: 2 }, null)).unidade).toBe('dias');
  });

  it('lê dias da semana com posição no mês e política de feriado', () => {
    const f = paraFormulario(
      lembrete({ diasDaSemana: ['TERCA', 'QUINTA'], posicaoDaSemanaNoMes: 2, politicaDiaUtil: 'PULAR' }),
    );
    expect(f.estrategia).toBe('semana');
    expect(f.diasSemana).toEqual(['TERCA', 'QUINTA']);
    expect(f.posicaoMes).toBe(2);
    expect(f.politica).toBe('PULAR');
  });

  it('lê dias do mês como texto ordenado', () => {
    const f = paraFormulario(lembrete({ diasFixosNoMes: [25, 10] }));
    expect(f.estrategia).toBe('mes');
    expect(f.diasMes).toBe('10, 25');
  });

  it('tolera as listas nulas que a IA devolve', () => {
    const f = paraFormulario(lembrete({ diasFixosNoMes: [10], diasDaSemana: null }));
    expect(f.estrategia).toBe('mes');
    expect(f.diasSemana).toEqual([]);
  });

  it('traz título, descrição e categoria para os campos', () => {
    const f = paraFormulario(lembrete({ diasFixosNoMes: [10] }));
    expect(f.titulo).toBe('Pagar a fatura');
    expect(f.descricao).toBe('todo mês');
    expect(f.categoriaId).toBe(3);
    expect(f.horario).toBe('09:00');
  });

  it('usa string vazia para descrição nula, não "null"', () => {
    const semDescricao = { ...lembrete({ diasFixosNoMes: [10] }), descricao: null };
    expect(paraFormulario(semDescricao).descricao).toBe('');
  });
});

describe('ida e volta', () => {
  // Este é o teste que segura a edição: abrir um lembrete e salvar sem tocar em
  // nada não pode alterar a regra. Se as duas conversões divergirem, o usuário
  // perde a recorrência sem ver.
  const casos: { nome: string; rec: Partial<Recorrencia>; horario: string | null }[] = [
    { nome: 'intervalo em horas', rec: { intervaloHoras: 3 }, horario: null },
    { nome: 'intervalo em minutos', rec: { intervaloMinutos: 30 }, horario: null },
    { nome: 'intervalo em dias', rec: { intervaloDias: 2 }, horario: null },
    { nome: 'dias da semana', rec: { diasDaSemana: ['SEGUNDA', 'SEXTA'] }, horario: '08:30' },
    {
      nome: 'semana com posição e feriado',
      rec: { diasDaSemana: ['SEGUNDA'], posicaoDaSemanaNoMes: 2, politicaDiaUtil: 'ANTECIPAR' },
      horario: '07:00',
    },
    { nome: 'dias do mês', rec: { diasFixosNoMes: [10, 25] }, horario: '09:00' },
    {
      nome: 'dias do mês com contagem',
      rec: { diasFixosNoMes: [1], quantidade: 4 },
      horario: '12:00',
    },
  ];

  for (const caso of casos) {
    it(`preserva ${caso.nome}`, () => {
      const original = lembrete(caso.rec, caso.horario);
      const volta = paraEntrada(paraFormulario(original));

      expect(volta.recorrencia).toEqual(original.recorrencia);
      expect(volta.notificacao.horario).toBe(original.notificacao.horario);
      expect(volta.titulo).toBe(original.titulo);
      expect(volta.categoriaId).toBe(original.categoria.id);
    });
  }

  it('em intervalo, dataInicio é o agora — o servidor é quem soma o passo', () => {
    const volta = paraEntrada(paraFormulario(lembrete({ intervaloHoras: 3 }, null)));
    expect(volta.notificacao.dataInicio).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(volta.notificacao.horario).toBeNull();
  });

  it('em calendário, dataInicio fica nulo e o horário manda', () => {
    const volta = paraEntrada(paraFormulario(lembrete({ diasFixosNoMes: [10] }, '09:00')));
    expect(volta.notificacao.dataInicio).toBeNull();
    expect(volta.notificacao.horario).toBe('09:00');
  });
});

describe('política de dia útil', () => {
  it('escreve null quando é "ignorar" — o servidor grava os dois valores', () => {
    // Sem isto, editar um lembrete sem política trocaria null por IGNORAR no banco.
    const entrada = paraEntrada({
      ...FORMULARIO_VAZIO,
      categoriaId: 1,
      estrategia: 'mes',
      diasMes: '10',
      politica: 'IGNORAR',
    });
    expect(entrada.recorrencia.politicaDiaUtil).toBeNull();
  });

  it('preserva as políticas que mudam o agendamento', () => {
    const base = { ...FORMULARIO_VAZIO, categoriaId: 1, estrategia: 'mes' as const, diasMes: '10' };
    expect(paraEntrada({ ...base, politica: 'PULAR' }).recorrencia.politicaDiaUtil).toBe('PULAR');
    expect(paraEntrada({ ...base, politica: 'ADIAR' }).recorrencia.politicaDiaUtil).toBe('ADIAR');
    expect(paraEntrada({ ...base, politica: 'ANTECIPAR' }).recorrencia.politicaDiaUtil)
      .toBe('ANTECIPAR');
  });

  it('em intervalo não manda política — feriado não se aplica a passo fixo', () => {
    const entrada = paraEntrada({
      ...FORMULARIO_VAZIO,
      categoriaId: 1,
      estrategia: 'intervalo',
      politica: 'PULAR',
    });
    expect(entrada.recorrencia.politicaDiaUtil).toBeNull();
  });
});

describe('paraEntrada', () => {
  it('descarta dias do mês fora de 1..31 e repetidos', () => {
    const entrada = paraEntrada({
      ...FORMULARIO_VAZIO,
      categoriaId: 1,
      estrategia: 'mes',
      diasMes: '0, 10, 10, 32, 25, abc',
    });
    expect(entrada.recorrencia.diasFixosNoMes).toEqual([10, 25]);
  });

  it('ignora quantidade vazia ou não positiva', () => {
    const base = { ...FORMULARIO_VAZIO, categoriaId: 1, estrategia: 'mes' as const, diasMes: '1' };
    expect(paraEntrada({ ...base, quantidade: '' }).recorrencia.quantidade).toBeNull();
    expect(paraEntrada({ ...base, quantidade: '0' }).recorrencia.quantidade).toBeNull();
    expect(paraEntrada({ ...base, quantidade: '3' }).recorrencia.quantidade).toBe(3);
  });

  it('nunca deixa o passo abaixo de 1', () => {
    const base = { ...FORMULARIO_VAZIO, categoriaId: 1, estrategia: 'intervalo' as const };
    expect(paraEntrada({ ...base, passo: '0' }).recorrencia.intervaloHoras).toBe(1);
    expect(paraEntrada({ ...base, passo: '' }).recorrencia.intervaloHoras).toBe(1);
  });

  it('apara título e converte descrição vazia em null', () => {
    const entrada = paraEntrada({
      ...FORMULARIO_VAZIO,
      categoriaId: 1,
      titulo: '  Beber água  ',
      descricao: '   ',
      estrategia: 'mes',
      diasMes: '1',
    });
    expect(entrada.titulo).toBe('Beber água');
    expect(entrada.descricao).toBeNull();
  });
});
