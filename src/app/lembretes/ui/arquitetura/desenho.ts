/**
 * Geometria da figura de arquitetura, nos dois desenhos.
 *
 * As caixas espelham o backend de verdade (routine-pusher-backend): o filtro de
 * sessão anônima, o LembreteChatService com o contrato derivado do DTO, a
 * validação e a simulação que reaproveitam o código da criação, as strategies
 * de recorrência com a política de dia útil, o AgendadorJob sobre o Quartz e o
 * Postgres com o schema do Flyway. A IA fica atrás da porta ChatClient.
 */

export type NumeroMomento = 1 | 2 | 3;

export type IdCamada = 'navegador' | 'sessao' | 'interpretacao' | 'validacao' | 'motor' | 'agendador' | 'ia' | 'banco';

export interface Camada {
  id: IdCamada;
  x: number;
  y: number;
  w: number;
  h: number;
  titulo: string;
  sub: string;
  /** Serviço fora da API: desenhado tracejado. */
  externa?: boolean;
}

export interface Desenho {
  nome: 'computador' | 'celular';
  largura: number;
  altura: number;
  /** A moldura da API, com o rótulo no canto. */
  api: { x: number; y: number; w: number; h: number; rotulo: string };
  camadas: Camada[];
  /** Ligações fixas, tracejadas. */
  fios: string[];
  /** O caminho do ponto em cada momento. */
  caminhos: Record<NumeroMomento, string>;
}

export interface Momento {
  n: NumeroMomento;
  titulo: string;
  texto: string;
  camadas: IdCamada[];
}

export const MOMENTOS: Momento[] = [
  {
    n: 1,
    titulo: 'Interpretar',
    texto:
      'A frase sai com o relógio de quem escreve e passa pela cota da sessão. A IA preenche um schema derivado do DTO; o rascunho volta validado e com a prévia das datas. Nada é salvo.',
    camadas: ['navegador', 'sessao', 'interpretacao', 'ia', 'validacao'],
  },
  {
    n: 2,
    titulo: 'Confirmar',
    texto:
      'Um POST comum, sem IA. O motor escolhe a strategy e aplica a política de dia útil; o Quartz grava o próximo disparo no Postgres, onde sobrevive a um restart.',
    camadas: ['navegador', 'sessao', 'motor', 'agendador', 'banco'],
  },
  {
    n: 3,
    titulo: 'Disparar',
    texto:
      'Na hora marcada o Quartz acorda o job, que avisa o navegador por SSE e agenda o disparo seguinte — um de cada vez.',
    camadas: ['banco', 'agendador', 'navegador'],
  },
];

const COMPUTADOR: Desenho = {
  nome: 'computador',
  largura: 680,
  altura: 440,
  api: { x: 180, y: 40, w: 330, h: 380, rotulo: 'API · Java + Spring Boot · container na AWS' },
  camadas: [
    { id: 'navegador', x: 30, y: 60, w: 120, h: 340, titulo: 'Navegador', sub: 'Angular · Vercel' },
    { id: 'sessao', x: 200, y: 72, w: 290, h: 48, titulo: 'Sessão anônima', sub: 'cookie · cota de IA' },
    { id: 'interpretacao', x: 200, y: 140, w: 290, h: 48, titulo: 'Interpretação', sub: 'schema derivado do DTO' },
    { id: 'validacao', x: 200, y: 208, w: 290, h: 48, titulo: 'Validação e prévia', sub: 'mesmas regras do formulário' },
    { id: 'motor', x: 200, y: 276, w: 290, h: 48, titulo: 'Motor de regras', sub: 'strategies · dia útil' },
    { id: 'agendador', x: 200, y: 344, w: 290, h: 48, titulo: 'Agendador', sub: 'Quartz · um disparo por vez' },
    { id: 'ia', x: 532, y: 140, w: 128, h: 48, titulo: 'IA', sub: 'Gemini ou Claude', externa: true },
    { id: 'banco', x: 532, y: 344, w: 128, h: 48, titulo: 'Postgres', sub: 'Supabase · Flyway', externa: true },
  ],
  fios: [
    'M150 96H200',
    'M345 120V140',
    'M490 164H532',
    'M345 188V208',
    'M200 232H150',
    'M200 96H190V300H200',
    'M345 324V344',
    'M490 368H532',
    'M200 368H150',
  ],
  caminhos: {
    1: 'M150 96L345 96L345 164L596 164L345 164L345 232L150 232',
    2: 'M150 96L190 96L190 300L345 300L345 368L596 368',
    3: 'M596 368L345 368L150 368',
  },
};

const CELULAR: Desenho = {
  nome: 'celular',
  largura: 360,
  altura: 420,
  api: { x: 20, y: 84, w: 222, h: 314, rotulo: 'API · Spring Boot · AWS' },
  camadas: [
    { id: 'navegador', x: 20, y: 16, w: 324, h: 44, titulo: 'Navegador', sub: 'Angular · Vercel' },
    { id: 'sessao', x: 36, y: 116, w: 196, h: 44, titulo: 'Sessão anônima', sub: 'cookie · cota de IA' },
    { id: 'interpretacao', x: 36, y: 172, w: 196, h: 44, titulo: 'Interpretação', sub: 'schema derivado do DTO' },
    { id: 'validacao', x: 36, y: 228, w: 196, h: 44, titulo: 'Validação e prévia', sub: 'regras do formulário' },
    { id: 'motor', x: 36, y: 284, w: 196, h: 44, titulo: 'Motor de regras', sub: 'strategies · dia útil' },
    { id: 'agendador', x: 36, y: 340, w: 196, h: 44, titulo: 'Agendador', sub: 'Quartz' },
    { id: 'ia', x: 250, y: 172, w: 94, h: 44, titulo: 'IA', sub: 'Gemini/Claude', externa: true },
    { id: 'banco', x: 250, y: 340, w: 94, h: 44, titulo: 'Postgres', sub: 'Supabase', externa: true },
  ],
  fios: [
    'M134 60V116',
    'M134 160V172',
    'M232 194H250',
    'M134 216V228',
    'M28 60V362',
    'M28 250H36',
    'M28 306H36',
    'M28 362H36',
    'M134 328V340',
    'M232 362H250',
  ],
  caminhos: {
    1: 'M134 60L134 194L297 194L134 194L134 250L28 250L28 60',
    2: 'M134 60L134 138L28 138L28 306L134 306L134 362L297 362',
    3: 'M297 362L134 362L28 362L28 60',
  },
};

export const CAMADAS: Desenho[] = [COMPUTADOR, CELULAR];
