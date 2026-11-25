/**
 * Quebra um valor JSON em linhas de tokens coloríveis, para a tela mostrar a
 * resposta da API como código — sem lib de highlight e sem `innerHTML`.
 *
 * A indentação é a do `JSON.stringify(v, null, 2)`, e o texto de cada linha,
 * concatenado, é exatamente a linha que ele produziria: o que se vê é o que o
 * servidor mandou.
 */
export type TipoToken = 'chave' | 'texto' | 'numero' | 'literal' | 'pontuacao';

export interface Token {
  t: string;
  tipo: TipoToken;
}

export interface LinhaJson {
  tokens: Token[];
}

const recuo = (n: number): Token => ({ t: '  '.repeat(n), tipo: 'pontuacao' });
const p = (t: string): Token => ({ t, tipo: 'pontuacao' });

function primitivo(v: unknown): Token {
  if (v === null || typeof v === 'boolean') return { t: String(v), tipo: 'literal' };
  if (typeof v === 'number') return { t: String(v), tipo: 'numero' };
  return { t: JSON.stringify(v), tipo: 'texto' };
}

export function linhasJson(valor: unknown): LinhaJson[] {
  const linhas: LinhaJson[] = [];

  const visitar = (v: unknown, nivel: number, chave: string | null, ultimo: boolean): void => {
    const prefixo: Token[] = [recuo(nivel)];
    if (chave !== null) prefixo.push({ t: JSON.stringify(chave), tipo: 'chave' }, p(': '));
    const virgula = ultimo ? '' : ',';

    if (Array.isArray(v)) {
      if (v.length === 0) {
        linhas.push({ tokens: [...prefixo, p('[]' + virgula)] });
        return;
      }
      linhas.push({ tokens: [...prefixo, p('[')] });
      v.forEach((item, i) => visitar(item, nivel + 1, null, i === v.length - 1));
      linhas.push({ tokens: [recuo(nivel), p(']' + virgula)] });
      return;
    }

    if (v !== null && typeof v === 'object') {
      const chaves = Object.keys(v as object);
      if (chaves.length === 0) {
        linhas.push({ tokens: [...prefixo, p('{}' + virgula)] });
        return;
      }
      linhas.push({ tokens: [...prefixo, p('{')] });
      chaves.forEach((k, i) =>
        visitar((v as Record<string, unknown>)[k], nivel + 1, k, i === chaves.length - 1),
      );
      linhas.push({ tokens: [recuo(nivel), p('}' + virgula)] });
      return;
    }

    linhas.push({ tokens: [...prefixo, primitivo(v), p(virgula)] });
  };

  visitar(valor, 0, null, true);
  return linhas;
}

/** Texto puro da linha — o que `JSON.stringify(v, null, 2)` daria nela. */
export function textoDaLinha(linha: LinhaJson): string {
  return linha.tokens.map(t => t.t).join('');
}
