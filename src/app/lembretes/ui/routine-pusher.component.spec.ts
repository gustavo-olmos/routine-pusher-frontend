import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';

import { credenciaisInterceptor } from '../api/credenciais.interceptor';
import { CategoriaService, LembreteService, SessaoService } from '../api/lembrete.service';
import { Categoria, Lembrete, Sessao } from '../api/modelos';
import { NotificacoesService } from '../api/notificacoes.service';
import { LembretesStore } from '../estado/lembretes.store';
import { FunilService } from '../funil/funil.service';
import { API_V1 } from '../lembretes.config';
import { RoutinePusherComponent } from './routine-pusher.component';

const SESSAO: Sessao = {
  uuid: '8763eb29-0e13-4050-87c6-c41028c2b524',
  criadaEm: '2026-09-03T17:01:00',
  expiraEm: '2026-09-03T17:31:00',
};

const CATEGORIAS: Categoria[] = [
  { id: 1, nome: 'Saúde', cor: '#43A047', fatorOrdem: 1 },
  { id: 3, nome: 'Casa', cor: '#FB8C00', fatorOrdem: 3 },
];

/** Cópia fiel de uma resposta real do POST /lembrete. */
const AGUA: Lembrete = {
  uuid: 'afbbe61c-c650-445f-9a7a-77582b29e239',
  titulo: 'Beber água',
  descricao: null,
  status: 'PENDENTE',
  categoria: CATEGORIAS[0],
  recorrencia: {
    quantidade: null,
    intervaloDias: null,
    intervaloHoras: 3,
    intervaloMinutos: null,
    posicaoDaSemanaNoMes: null,
    diasFixosNoMes: [],
    diasDaSemana: [],
    politicaDiaUtil: null,
  },
  notificacao: {
    id: 6,
    metodo: ['pop-up'],
    horario: '09:00',
    proximaExecucao: '2026-09-03T20:05:00',
    ultimaExecucao: null,
    dataInicio: '2026-09-03T17:05:00',
    dataFim: null,
    datasEspecificadas: [],
  },
  proximasExecucoes: [
    '2026-09-03T20:05:00',
    '2026-09-03T23:05:00',
    '2026-09-04T02:05:00',
    '2026-09-04T05:05:00',
    '2026-09-04T08:05:00',
  ],
};

/** Resposta da IA: repare nas listas `null`, que a resposta real traz mesmo. */
const FATURA: Lembrete = {
  uuid: 'f6503232-565e-44e0-903d-392a9419baa3',
  titulo: 'Pagar a fatura do cartão',
  descricao: null,
  status: 'PENDENTE',
  categoria: CATEGORIAS[1],
  recorrencia: {
    quantidade: null,
    intervaloDias: null,
    intervaloHoras: null,
    intervaloMinutos: null,
    posicaoDaSemanaNoMes: null,
    diasFixosNoMes: [10],
    diasDaSemana: null,
    politicaDiaUtil: 'PULAR',
  },
  notificacao: {
    id: 7,
    metodo: ['pop-up'],
    horario: '09:00',
    proximaExecucao: '2026-09-10T09:00:00',
    ultimaExecucao: null,
    dataInicio: null,
    dataFim: null,
    datasEspecificadas: null,
  },
  proximasExecucoes: ['2026-09-10T09:00:00', '2026-10-10T09:00:00'],
};

/** O EventSource real tentaria abrir um stream de verdade dentro do Karma. */
class NotificacoesFalsas {
  readonly avisos = signal<never[]>([]);
  readonly conectado = signal(false);
  conectar(): void {}
  desconectar(): void {}
  dispensar(): void {}
}

describe('RoutinePusherComponent', () => {
  let fixture: ComponentFixture<RoutinePusherComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoutinePusherComponent],
      providers: [
        provideHttpClient(withInterceptors([credenciaisInterceptor])),
        provideHttpClientTesting(),
        SessaoService,
        CategoriaService,
        LembreteService,
        FunilService,
        LembretesStore,
      ],
    })
      .overrideComponent(RoutinePusherComponent, {
        set: { providers: [{ provide: NotificacoesService, useClass: NotificacoesFalsas }] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(RoutinePusherComponent);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
  });

  afterEach(() => http.verify());

  /** Sobe a tela até a lista carregada. */
  function abrir(lembretes: Lembrete[]): void {
    fixture.detectChanges();

    const sessao = http.expectOne(req => req.url === `${API_V1}/sessao`);
    sessao.flush(SESSAO);
    tick();

    http.expectOne(req => req.url === `${API_V1}/categoria`).flush(CATEGORIAS);
    http.expectOne(req => req.url === `${API_V1}/lembrete`).flush(lembretes);
    tick();
    fixture.detectChanges();
  }

  it('manda withCredentials em toda chamada — sem isso cada requisição vira uma sessão nova', fakeAsync(() => {
    fixture.detectChanges();

    const sessao = http.expectOne(req => req.url === `${API_V1}/sessao`);
    expect(sessao.request.withCredentials).withContext('GET /sessao').toBeTrue();
    sessao.flush(SESSAO);
    tick();

    const categoria = http.expectOne(req => req.url === `${API_V1}/categoria`);
    const lembrete = http.expectOne(req => req.url === `${API_V1}/lembrete`);
    expect(categoria.request.withCredentials).withContext('GET /categoria').toBeTrue();
    expect(lembrete.request.withCredentials).withContext('GET /lembrete').toBeTrue();

    categoria.flush(CATEGORIAS);
    lembrete.flush([]);
    tick();
  }));

  it('ordena as listagens com os campos que cada recurso aceita', fakeAsync(() => {
    fixture.detectChanges();
    http.expectOne(req => req.url === `${API_V1}/sessao`).flush(SESSAO);
    tick();

    const categoria = http.expectOne(req => req.url === `${API_V1}/categoria`);
    const lembrete = http.expectOne(req => req.url === `${API_V1}/lembrete`);

    expect(categoria.request.params.get('sortInfo')).toBe('id');
    // /lembrete com sortInfo=id devolve 400: o DTO tem uuid, não id.
    expect(lembrete.request.params.get('sortInfo')).toBe('uuid');
    expect(lembrete.request.params.get('decrescente')).toBe('false');

    categoria.flush(CATEGORIAS);
    lembrete.flush([]);
    tick();
  }));

  it('mostra sugestões financeiras quando não há lembrete', fakeAsync(() => {
    abrir([]);

    const sugestoes = el.querySelectorAll('.rp-sugestao');
    expect(sugestoes.length).toBeGreaterThan(0);
    expect(el.textContent).toContain('Nenhum lembrete ainda');
  }));

  it('desenha um card por lembrete, com as datas que o servidor previu', fakeAsync(() => {
    abrir([AGUA, FATURA]);

    expect(el.querySelectorAll('.rp-card').length).toBe(2);
    // proximasExecucoes vira a régua da timeline.
    expect(el.querySelectorAll('.rp-card')[0].querySelectorAll('.rp-tick').length).toBe(5);
    expect(el.textContent).toContain('Beber água');
  }));

  it('traduz a recorrência para cron, e admite quando não há equivalente', fakeAsync(() => {
    abrir([AGUA, FATURA]);

    const selos = Array.from(el.querySelectorAll('.rp-card .rp-badge')).map(b =>
      b.textContent?.trim(),
    );
    expect(selos[0]).toBe('0 */3 * * *');
    // A fatura pula feriado — cron não sabe o que é feriado.
    expect(selos[1]).toBe('sem equivalente');
  }));

  it('cria por frase mandando o relógio do usuário e reabre a lista', fakeAsync(() => {
    abrir([]);

    const campo = el.querySelector('.rp-composer__input') as HTMLTextAreaElement;
    campo.value = 'me lembra de pagar a fatura todo dia 10';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (el.querySelector('.rp-send') as HTMLButtonElement).click();

    const chat = http.expectOne(req => req.url === `${API_V1}/chat/lembrete`);
    expect(chat.request.body.frase).toBe('me lembra de pagar a fatura todo dia 10');
    // Sem `agora`, "amanhã às 9h" resolveria no fuso do servidor.
    expect(chat.request.body.agora).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    chat.flush(FATURA);
    tick();

    // Relista em vez de dar push: a ordem é do servidor.
    http.expectOne(req => req.url === `${API_V1}/lembrete`).flush([FATURA]);
    tick();
    fixture.detectChanges();

    expect(el.querySelectorAll('.rp-card').length).toBe(1);
  }));

  it('convida ao simulador quando o lembrete fala de dívida', fakeAsync(() => {
    abrir([]);

    const campo = el.querySelector('.rp-composer__input') as HTMLTextAreaElement;
    campo.value = 'me lembra de pagar a fatura todo dia 10';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('.rp-send') as HTMLButtonElement).click();

    http.expectOne(req => req.url === `${API_V1}/chat/lembrete`).flush(FATURA);
    tick();
    http.expectOne(req => req.url === `${API_V1}/lembrete`).flush([FATURA]);
    tick();
    fixture.detectChanges();

    expect(el.querySelector('.rp-convite')).withContext('convite contextual').toBeTruthy();
  }));

  it('registra a saída para o simulador — a única métrica que importa aqui', fakeAsync(() => {
    abrir([AGUA]);

    const funil = TestBed.inject(FunilService);
    const rodape = el.querySelector('.rp-footer__link--quiet') as HTMLAnchorElement;
    rodape.addEventListener('click', e => e.preventDefault());
    rodape.click();

    const saida = funil.trilha().find(r => r.evento === 'saida_simulador');
    expect(saida).toBeTruthy();
    expect(saida!.props['origem']).toBe('rodape');
  }));

  it('trata 429 como limite de sessão, não como erro genérico', fakeAsync(() => {
    abrir([]);

    const campo = el.querySelector('.rp-composer__input') as HTMLTextAreaElement;
    campo.value = 'mais um lembrete';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('.rp-send') as HTMLButtonElement).click();

    http.expectOne(req => req.url === `${API_V1}/chat/lembrete`).flush(
      { status: 429, mensagem: 'Limite de 10 chamadas de IA nesta sessão.' },
      { status: 429, statusText: 'Too Many Requests' },
    );
    tick();
    fixture.detectChanges();

    const alerta = el.querySelector('.rp-alerta');
    expect(alerta?.classList).toContain('rp-alerta--limite');
    expect(alerta?.textContent).toContain('Limite de 10 chamadas');
  }));

  it('mostra os campos inválidos de um 400, que dizem mais que a mensagem raiz', fakeAsync(() => {
    abrir([]);

    const campo = el.querySelector('.rp-composer__input') as HTMLTextAreaElement;
    campo.value = 'algo';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('.rp-send') as HTMLButtonElement).click();

    http.expectOne(req => req.url === `${API_V1}/chat/lembrete`).flush(
      {
        status: 400,
        mensagem: 'Um ou mais campos são inválidos',
        camposInvalidos: { 'notificacao.metodo': 'Informe ao menos um método de notificação' },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    tick();
    fixture.detectChanges();

    expect(el.querySelector('.rp-alerta')?.textContent).toContain('ao menos um método');
  }));

  it('explica a falha de rede apontando o backend local', fakeAsync(() => {
    fixture.detectChanges();
    http.expectOne(req => req.url === `${API_V1}/sessao`).error(new ProgressEvent('error'));
    tick();
    fixture.detectChanges();

    expect(el.querySelector('.rp-alerta')?.textContent).toContain('localhost:8080');
  }));

  it('conclui pelo detalhe e relista, porque o PATCH responde vazio', fakeAsync(() => {
    abrir([AGUA]);

    (el.querySelector('.rp-card') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.rp-panel')).toBeTruthy();
    expect(el.querySelectorAll('.rp-occurrence').length).toBe(5);

    (el.querySelector('.rp-primary') as HTMLButtonElement).click();

    const patch = http.expectOne(req => req.method === 'PATCH');
    expect(patch.request.url).toBe(`${API_V1}/lembrete/${AGUA.uuid}`);
    patch.flush('');
    tick();

    http.expectOne(req => req.url === `${API_V1}/lembrete`).flush([{ ...AGUA, status: 'CONCLUIDO' }]);
    tick();
    fixture.detectChanges();

    expect(el.querySelector('.rp-card')?.classList).toContain('rp-card--feito');
  }));

  it('monta o POST do formulário com o intervalo em recorrencia e dataInicio no agora', fakeAsync(() => {
    abrir([AGUA]);

    const comp = fixture.componentInstance as unknown as {
      fTitulo: { set(v: string): void };
      fCategoria: { set(v: number): void };
      fEstrategia: { set(v: string): void };
      fUnidade: { set(v: string): void };
      fPasso: { set(v: string): void };
      salvarFormulario(): Promise<unknown>;
    };
    comp.fTitulo.set('Beber água');
    comp.fCategoria.set(1);
    comp.fEstrategia.set('intervalo');
    comp.fUnidade.set('horas');
    comp.fPasso.set('3');
    void comp.salvarFormulario();
    tick();

    const post = http.expectOne(req => req.method === 'POST' && req.url === `${API_V1}/lembrete`);
    const corpo = post.request.body;

    // O intervalo mora em recorrencia, nunca em notificacao.
    expect(corpo.recorrencia.intervaloHoras).toBe(3);
    expect(corpo.notificacao.intervaloHoras).toBeUndefined();
    // Em intervalo, dataInicio é o instante atual: o servidor é quem soma o passo.
    expect(corpo.notificacao.dataInicio).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(corpo.notificacao.horario).toBeNull();
    expect(corpo.notificacao.metodo).toEqual(['pop-up']);
    expect(corpo.categoriaId).toBe(1);

    post.flush(AGUA);
    tick();
    http.expectOne(req => req.url === `${API_V1}/lembrete`).flush([AGUA]);
    tick();
  }));
});
