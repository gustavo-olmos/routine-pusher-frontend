import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { linhasJson } from '../../dominio/json-colorido';
import { Convite } from '../../estado/lembretes.store';
import { OrigemSaida } from '../../funil/funil.service';
import { SIMULADOR_URL } from '../../lembretes.config';
import { PainelJsonComponent } from '../painel-json/painel-json.component';
import { EXEMPLO_RASCUNHO, EXEMPLO_RESPOSTA } from './exemplos';

/**
 * A seção abaixo do app: um artigo em tom de revista sobre o que o backend faz
 * com a frase, e o anúncio da RotaFin no fim. É para onde a alça leva.
 *
 * Fundo branco nos dois temas, de propósito: é uma página editorial, e o
 * contraste com o app reforça que são coisas diferentes.
 */
@Component({
  selector: 'rp-artigo',
  standalone: true,
  imports: [PainelJsonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './artigo.component.html',
  styleUrl: './artigo.component.scss',
})
export class ArtigoComponent {
  /** Convite contextual: um lembrete sobre dinheiro troca o texto do anúncio. */
  readonly convite = input<Convite | null>(null);
  readonly saida = output<OrigemSaida>();

  protected readonly SIMULADOR_URL = SIMULADOR_URL;
  protected readonly linhasIa = linhasJson(EXEMPLO_RASCUNHO);
  protected readonly linhasResposta = linhasJson(EXEMPLO_RESPOSTA);

  protected readonly etapas = [
    { n: '01', titulo: 'A frase', texto: 'Escrita como numa conversa, sem sintaxe.' },
    { n: '02', titulo: 'A IA', texto: '[modelo e formato de saída]' },
    { n: '03', titulo: 'A validação', texto: '[o que é checado antes de salvar]' },
    { n: '04', titulo: 'O motor de regras', texto: 'Uma strategy por tipo: cron, simples, complexos.' },
    { n: '05', titulo: 'A resposta', texto: 'O lembrete salvo, com as próximas execuções.' },
  ];
}
