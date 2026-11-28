import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  NgZone,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChildren,
} from '@angular/core';

import { CAMADAS, Camada, Desenho, Momento, MOMENTOS, NumeroMomento } from './desenho';

/** Tempo da frase atravessando o caminho de um momento. */
const VIAGEM_MS = 2600;
/** Quanto o momento fica parado na tela antes do próximo, no modo automático. */
const PAUSA_MS = 2200;

/**
 * A figura de arquitetura do artigo: uma frase (o ponto azul) atravessa o
 * sistema em três momentos — interpretar, confirmar e disparar.
 *
 * Os momentos avançam sozinhos enquanto a figura está na tela; tocar num deles
 * assume o controle e o automático para. Com movimento reduzido, nada anda: o
 * ponto aparece no fim do caminho e o momento só muda pelo toque.
 *
 * Há dois desenhos — horizontal no computador, vertical no celular — e o CSS
 * mostra um só. Cada um tem o próprio ponto; a animação move os dois.
 */
@Component({
  selector: 'rp-arquitetura',
  standalone: true,
  templateUrl: './arquitetura.component.html',
  styleUrl: './arquitetura.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArquiteturaComponent implements OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly desenhos = CAMADAS;
  protected readonly momentos = MOMENTOS;
  protected readonly atual = signal<NumeroMomento>(1);
  protected readonly momento = computed<Momento>(() => MOMENTOS[this.atual() - 1]);

  private readonly caminhos = viewChildren<ElementRef<SVGPathElement>>('caminho');
  private readonly pontos = viewChildren<ElementRef<SVGCircleElement>>('ponto');

  private automatico = true;
  private visivel = false;
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private observador: IntersectionObserver | null = null;

  constructor() {
    afterNextRender(
      () => {
        if (typeof IntersectionObserver === 'undefined') {
          this.viajar();
          return;
        }
        this.observador = new IntersectionObserver(
          ([entrada]) => {
            const antes = this.visivel;
            this.visivel = entrada.isIntersecting;
            if (this.visivel && !antes) this.viajar();
            if (!this.visivel) this.parar();
          },
          { threshold: 0.45 },
        );
        this.observador.observe(this.host.nativeElement);
      },
      { injector: this.injector },
    );
  }

  ngOnDestroy(): void {
    this.parar();
    this.observador?.disconnect();
  }

  protected ativa(camada: Camada): boolean {
    return this.momento().camadas.includes(camada.id);
  }

  protected escolher(n: NumeroMomento): void {
    this.automatico = false;
    this.parar();
    this.atual.set(n);
    afterNextRender(() => this.viajar(), { injector: this.injector });
  }

  protected caminhoDe(desenho: Desenho): string {
    return desenho.caminhos[this.atual()];
  }

  /** Leva o ponto do começo ao fim do caminho do momento atual. */
  private viajar(): void {
    this.parar();
    const caminhos = this.caminhos().map((c) => c.nativeElement);
    const pontos = this.pontos().map((p) => p.nativeElement);
    if (!caminhos.length) return;

    const parado = prefereMenosMovimento();
    this.zone.runOutsideAngular(() => {
      let inicio: number | null = null;
      const passo = (agora: number) => {
        inicio ??= agora;
        const k = parado ? 1 : Math.min((agora - inicio) / VIAGEM_MS, 1);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        caminhos.forEach((caminho, i) => {
          const ponto = pontos[i];
          if (!ponto) return;
          // O desenho escondido pelo CSS pode recusar a medida (Firefox): fica parado.
          try {
            const p = caminho.getPointAtLength(e * caminho.getTotalLength());
            ponto.setAttribute('cx', String(p.x));
            ponto.setAttribute('cy', String(p.y));
          } catch {
            /* desenho fora da tela */
          }
        });
        if (k < 1) {
          this.raf = requestAnimationFrame(passo);
        } else if (this.automatico && !parado && this.visivel) {
          this.timer = setTimeout(() => this.zone.run(() => this.avancar()), PAUSA_MS);
        }
      };
      this.raf = requestAnimationFrame(passo);
    });
  }

  private avancar(): void {
    this.atual.set(((this.atual() % 3) + 1) as NumeroMomento);
    // O caminho do <path> muda com o sinal: espera o desenho antes de medir.
    afterNextRender(() => this.viajar(), { injector: this.injector });
  }

  private parar(): void {
    cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function prefereMenosMovimento(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
