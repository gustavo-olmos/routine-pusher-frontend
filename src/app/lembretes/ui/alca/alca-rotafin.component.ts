import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  output,
  signal,
} from '@angular/core';

import { FunilService } from '../../funil/funil.service';

const CHAVE_VISTA = 'rp-alca-rotafin-vista';
/** Arrastar mais que isto para baixo dispensa a alça no celular. */
const LIMIAR_ARRASTE = 56;

function jaVista(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_VISTA) === '1';
  } catch {
    return false;
  }
}

function marcarVista(): void {
  try {
    sessionStorage.setItem(CHAVE_VISTA, '1');
  } catch {
    // Storage bloqueado: a alça pode voltar na próxima recarga. Sem drama.
  }
}

function prefereMenosMovimento(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A alça da RotaFin: sobe pela borda de baixo, fica um tempo e desce sozinha.
 *
 * É larga de propósito — incomoda o bastante para pedir um clique, e o clique
 * rola até o anúncio no fim do artigo, passando pelo texto. No computador ela
 * fica ~13 s e tem X; no celular, ~4 s, sem X, e sai arrastando para baixo. Os
 * tempos moram no SCSS, por breakpoint.
 *
 * Aparece uma vez por sessão do navegador. Com movimento reduzido no sistema,
 * não aparece: subir e descer sozinha é justamente o que essa pessoa pediu
 * para não ver — o anúncio continua no fim do artigo.
 */
@Component({
  selector: 'rp-alca-rotafin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './alca-rotafin.component.html',
  styleUrl: './alca-rotafin.component.scss',
})
export class AlcaRotafinComponent implements OnInit {
  private readonly funil = inject(FunilService);

  /** O clique no corpo da alça: o anfitrião rola até o anúncio. */
  readonly tocar = output<void>();

  protected readonly visivel = signal(false);
  protected readonly arraste = signal(0);
  private inicioToque: number | null = null;

  ngOnInit(): void {
    if (jaVista() || prefereMenosMovimento()) return;
    marcarVista();
    this.visivel.set(true);
    this.funil.registrar('alca_rotafin_vista');
  }

  protected aoTocar(): void {
    this.funil.registrar('alca_rotafin_tocada');
    this.visivel.set(false);
    this.tocar.emit();
  }

  protected fechar(): void {
    this.funil.registrar('alca_rotafin_fechada', { como: 'x' });
    this.visivel.set(false);
  }

  /** A animação terminou com a alça já recolhida: sai do DOM. */
  protected aoTerminar(evento: AnimationEvent): void {
    if (evento.animationName.startsWith('rpAlca')) this.visivel.set(false);
  }

  protected toqueInicio(evento: TouchEvent): void {
    this.inicioToque = evento.touches[0]?.clientY ?? null;
  }

  protected toqueMove(evento: TouchEvent): void {
    if (this.inicioToque === null) return;
    const dy = (evento.touches[0]?.clientY ?? this.inicioToque) - this.inicioToque;
    this.arraste.set(Math.max(0, dy));
  }

  protected toqueFim(): void {
    if (this.arraste() > LIMIAR_ARRASTE) {
      this.funil.registrar('alca_rotafin_fechada', { como: 'arraste' });
      this.visivel.set(false);
    }
    this.arraste.set(0);
    this.inicioToque = null;
  }
}
