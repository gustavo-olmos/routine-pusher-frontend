import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { LinhaJson, Token } from '../../dominio/json-colorido';

export type TomPainel = 'neutro' | 'rascunho' | 'criado';

interface LinhaVm {
  chave: string;
  atraso: number;
  tokens: Token[];
}

/** Linhas mostradas antes de "ver resposta completa" no modo compacto. */
const LINHAS_COMPACTO = 8;

/**
 * A resposta da API como código colorido. É a peça que mostra ao visitante — e
 * ao recrutador — a frase em português virando dado estruturado.
 *
 * `apagado` desenha só o esqueleto (chaves visíveis, valores em `···`): é o
 * bloco "pré-pronto" que espera a primeira frase. `versao` muda a cada resposta
 * nova para as linhas renascerem e a entrada animada tocar de novo.
 */
@Component({
  selector: 'rp-painel-json',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './painel-json.component.html',
  styleUrl: './painel-json.component.scss',
})
export class PainelJsonComponent {
  readonly rotulo = input('');
  readonly status = input('');
  readonly tom = input<TomPainel>('neutro');
  readonly linhas = input<LinhaJson[]>([]);
  readonly apagado = input(false);
  readonly versao = input(0);
  /** Dentro da bolha do chat (celular): sem moldura própria e começa recolhido. */
  readonly compacto = input(false);
  /** Sem rótulo e status: o artigo põe a legenda dele no lugar. */
  readonly cabecalho = input(true);

  protected readonly expandido = signal(false);

  protected readonly visiveis = computed<LinhaVm[]>(() => {
    const todas = this.linhas();
    const corte =
      this.compacto() && !this.expandido() ? todas.slice(0, LINHAS_COMPACTO) : todas;
    const v = this.versao();
    return corte.map((linha, i) => ({
      chave: `${v}-${i}`,
      atraso: this.apagado() ? 0 : i * 22,
      tokens: this.apagado() ? linha.tokens.map(apagar) : linha.tokens,
    }));
  });

  protected readonly cortado = computed(
    () => this.compacto() && this.linhas().length > LINHAS_COMPACTO,
  );

  protected alternar(): void {
    this.expandido.update(v => !v);
  }
}

function apagar(token: Token): Token {
  return token.tipo === 'chave' || token.tipo === 'pontuacao'
    ? token
    : { t: '···', tipo: 'literal' };
}
