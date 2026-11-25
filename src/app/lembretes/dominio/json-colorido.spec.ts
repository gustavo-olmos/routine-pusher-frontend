import { linhasJson, textoDaLinha } from './json-colorido';

describe('linhasJson', () => {
  const amostra = {
    titulo: 'Revisar a parcela',
    descricao: null,
    categoriaId: 1,
    recorrencia: { diasFixosNoMes: [31], diasDaSemana: [], politicaDiaUtil: 'ANTECIPAR' },
    ativo: true,
    vazio: {},
  };

  it('reproduz linha a linha o JSON.stringify indentado', () => {
    const esperado = JSON.stringify(amostra, null, 2).split('\n');
    expect(linhasJson(amostra).map(textoDaLinha)).toEqual(esperado);
  });

  it('classifica cada valor pelo tipo, para a tela colorir', () => {
    const tipos = linhasJson(amostra).flatMap(l => l.tokens.map(t => t.tipo));
    expect(tipos).toContain('chave');
    expect(tipos).toContain('texto');
    expect(tipos).toContain('numero');
    expect(tipos).toContain('literal');
  });
});
