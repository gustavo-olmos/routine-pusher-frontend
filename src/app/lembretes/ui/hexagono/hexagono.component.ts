import { ChangeDetectionStrategy, Component } from '@angular/core';

interface Ponto {
  x: number;
  y: number;
}

interface Adaptador extends Ponto {
  w: number;
  h: number;
  rotulo: string;
  /** Rótulo alternativo: o adaptador que entra no lugar sem mexer no centro. */
  troca?: string;
}

interface Texto extends Ponto {
  texto: string;
  classe: 'nome' | 'sub' | 'nucleo' | 'nucleo-sub' | 'porta';
  ancora?: 'start' | 'middle' | 'end';
}

interface Desenho {
  nome: 'computador' | 'celular';
  largura: number;
  altura: number;
  centro: Ponto;
  /** Raios dos hexágonos: aplicação, domínio, motor. */
  raios: [number, number, number];
  adaptadores: Adaptador[];
  setas: string[];
  portas: Ponto[];
  textos: Texto[];
}

/** Hexágono de ponta para cima, como string de `points`. */
function hexagono(c: Ponto, r: number): string {
  const dx = r * 0.866;
  return [
    [c.x, c.y - r],
    [c.x + dx, c.y - r / 2],
    [c.x + dx, c.y + r / 2],
    [c.x, c.y + r],
    [c.x - dx, c.y + r / 2],
    [c.x - dx, c.y - r / 2],
  ]
    .map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`)
    .join(' ');
}

const COMPUTADOR: Desenho = {
  nome: 'computador',
  largura: 680,
  altura: 500,
  centro: { x: 340, y: 250 },
  raios: [215, 150, 88],
  adaptadores: [
    { x: 18, y: 150, w: 112, h: 40, rotulo: 'REST' },
    { x: 18, y: 230, w: 112, h: 40, rotulo: 'SSE' },
    { x: 18, y: 310, w: 112, h: 40, rotulo: 'Jobs do Quartz' },
    { x: 550, y: 110, w: 112, h: 40, rotulo: 'IA · Gemini', troca: 'IA · Claude' },
    { x: 550, y: 190, w: 112, h: 40, rotulo: 'Feriados BR' },
    { x: 550, y: 270, w: 112, h: 40, rotulo: 'Cookie' },
    { x: 550, y: 350, w: 112, h: 40, rotulo: 'Postgres' },
  ],
  setas: ['M130 170H175', 'M130 250H160', 'M130 330H175', 'M550 130H500', 'M550 210H480', 'M550 290H480', 'M550 370H510'],
  portas: [
    { x: 470, y: 210 },
    { x: 470, y: 290 },
  ],
  textos: [
    { x: 74, y: 132, texto: 'entrada', classe: 'porta' },
    { x: 606, y: 92, texto: 'saída', classe: 'porta' },
    { x: 340, y: 68, texto: 'Aplicação', classe: 'nome' },
    { x: 340, y: 86, texto: 'casos de uso são interfaces', classe: 'sub' },
    { x: 340, y: 432, texto: 'interpretar · simular · criar · concluir', classe: 'sub' },
    { x: 340, y: 128, texto: 'Domínio', classe: 'nome' },
    { x: 340, y: 147, texto: 'Lembrete · Notificação', classe: 'sub' },
    { x: 340, y: 356, texto: 'Categoria · Sessão', classe: 'sub' },
    { x: 240, y: 252, texto: 'Feriado', classe: 'sub' },
    { x: 340, y: 236, texto: 'Motor de', classe: 'nucleo' },
    { x: 340, y: 256, texto: 'recorrência', classe: 'nucleo' },
    { x: 340, y: 278, texto: 'sem Spring, HTTP ou IA', classe: 'nucleo-sub' },
    { x: 480, y: 254, texto: 'portas', classe: 'porta', ancora: 'start' },
  ],
};

const CELULAR: Desenho = {
  nome: 'celular',
  largura: 360,
  altura: 580,
  centro: { x: 180, y: 278 },
  raios: [170, 118, 62],
  adaptadores: [
    { x: 12, y: 16, w: 104, h: 36, rotulo: 'REST' },
    { x: 128, y: 16, w: 104, h: 36, rotulo: 'SSE' },
    { x: 244, y: 16, w: 104, h: 36, rotulo: 'Jobs Quartz' },
    { x: 26, y: 490, w: 148, h: 36, rotulo: 'IA · Gemini', troca: 'IA · Claude' },
    { x: 186, y: 490, w: 148, h: 36, rotulo: 'Feriados BR' },
    { x: 26, y: 534, w: 148, h: 36, rotulo: 'Cookie' },
    { x: 186, y: 534, w: 148, h: 36, rotulo: 'Postgres' },
  ],
  setas: ['M64 52V160', 'M180 52V100', 'M296 52V160', 'M100 490V420', 'M260 490V420'],
  portas: [
    { x: 282, y: 248 },
    { x: 282, y: 308 },
  ],
  textos: [
    { x: 180, y: 140, texto: 'Aplicação', classe: 'nome' },
    { x: 180, y: 416, texto: 'casos de uso', classe: 'sub' },
    { x: 180, y: 184, texto: 'Domínio', classe: 'nome' },
    { x: 180, y: 206, texto: 'Lembrete · Notificação', classe: 'sub' },
    { x: 180, y: 354, texto: 'Categoria · Sessão', classe: 'sub' },
    { x: 104, y: 280, texto: 'Feriado', classe: 'sub' },
    { x: 180, y: 266, texto: 'Motor de', classe: 'nucleo' },
    { x: 180, y: 284, texto: 'recorrência', classe: 'nucleo' },
    { x: 180, y: 304, texto: 'sem Spring', classe: 'nucleo-sub' },
  ],
};

/**
 * Fig. 2 do artigo: a arquitetura hexagonal do backend. Adaptadores por fora,
 * casos de uso, o domínio com as portas que ele declara e, no centro, o motor
 * de recorrência. As setas fluem para dentro — as dependências apontam para o
 * centro — e o adaptador de IA se troca sozinho sem que nada lá dentro mude.
 *
 * A animação é só CSS; com movimento reduzido tudo fica parado.
 */
@Component({
  selector: 'rp-hexagono',
  standalone: true,
  templateUrl: './hexagono.component.html',
  styleUrl: './hexagono.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HexagonoComponent {
  protected readonly desenhos = [COMPUTADOR, CELULAR].map((d) => ({
    ...d,
    camadas: d.raios.map((r) => hexagono(d.centro, r)),
  }));
}
