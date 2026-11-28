import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';

import { credenciaisInterceptor } from '../api/credenciais.interceptor';
import { AlertaService } from '../alerta/alerta.service';
import { CategoriaService, LembreteService, SessaoService } from '../api/lembrete.service';
import { Categoria, Lembrete, Sessao } from '../api/modelos';
import { NotificacoesService } from '../api/notificacoes.service';
import { LembretesStore } from '../estado/lembretes.store';
import { FunilService } from '../funil/funil.service';
import { API_V1, SUGESTOES } from '../lembretes.config';
import { Interpretacao, LembreteEntrada } from '../api/modelos';
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

/** Rascunho do POST /chat/interpretacao: o corpo exato que o POST /lembrete aceita. */
const RASCUNHO_FATURA: Interpretacao = {
  lembrete: {
    titulo: 'Pagar a fatura do cartão',
    descricao: null,
    categoriaId: 3,
    recorrencia: FATURA.recorrencia,
    notificacao: { metodo: ['pop-up'], horario: '09:00', dataInicio: null, dataFim: null, datasEspecificadas: null },
  } as LembreteEntrada,
  proximasExecucoes: ['2026-09-10T09:00:00', '2026-10-10T09:00:00'],
};

/** O EventSource real tentaria abrir um stream de verdade dentro do Karma. */
class NotificacoesFalsas {
  readonly avisos = signal<never[]>([]);
  readonly conectado = signal(false);
  aoReceber: ((titulo: string) => void) | null = null;
  aoReconectar: (() => void) | null = null;
  conectar(): void {}
  desconectar(): void {}
  dispensar(): void {}
  /** Simula um evento chegando pelo stream. */
  disparar(titulo: string): void {
    this.aoReceber?.(titulo);
  }
  /** Simula o stream voltando depois de ter caído. */
  reconectar(): void {
    this.aoReconectar?.();
  }
}

/** O de verdade toca som e fala com Notification/serviceWorker. */
class AlertaFalso {
  readonly permissao = signal<'default' | 'granted' | 'denied' | 'indisponivel'>('default');
  readonly precisaInstalarNoIphone = signal(false);
  readonly avisados: { titulo: string; corpo: string }[] = [];
  pedidos = 0;

  async pedirPermissao(): Promise<'granted'> {
    this.pedidos++;
    this.permissao.set('granted');
    return 'granted';
  }

  async avisar(titulo: string, corpo: string): Promise<void> {
    this.avisados.push({ titulo, corpo });
  }
}

describe('RoutinePusherComponent', () => {
  let fixture: ComponentFixture<RoutinePusherComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  /** O componente lê o tema salvo ao ser construído, então a limpeza precisa vir
   *  antes do createComponent. Karma sorteia a ordem dos testes: sem isto, o que
   *  grava 'dark' contamina o seguinte de forma intermitente. */
  function limparTema(): void {
    try { localStorage.removeItem('rp:tema'); } catch { /* aba anônima */ }
  }

  beforeEach(async () => {
    limparTema();

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
        set: {
          providers: [
            { provide: NotificacoesService, useClass: NotificacoesFalsas },
            { provide: AlertaService, useClass: AlertaFalso },
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(RoutinePusherComponent);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
  });

  afterEach(() => {
    http.verify();
    limparTema();
  });

  /** Sobe a tela com tudo carregado, ainda no chat — é por ele que se entra. */
  function carregar(lembretes: Lembrete[]): void {
    fixture.detectChanges();

    const sessao = http.expectOne(req => req.url === `${API_V1}/sessao`);
    sessao.flush(SESSAO);
    tick();

    http.expectOne(req => req.url === `${API_V1}/categoria`).flush(CATEGORIAS);
    http.expectOne(req => req.url === `${API_V1}/lembrete`).flush(lembretes);
    tick();
    fixture.detectChanges();
  }

  /** Sobe a tela e vai para os lembretes, pelo "ver lembretes" do chat. */
  function abrir(lembretes: Lembrete[]): void {
    carregar(lembretes);
    (el.querySelector('.rp-voltar') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  /** O "+": o momento 1 sai deslizando e só então o chat entra. */
  function irParaChat(): void {
    (el.querySelector('.rp-mais') as HTMLButtonElement).click();
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();
  }

  /** Escreve a frase no chat e envia: vira POST /chat/interpretacao. */
  function enviarFrase(frase: string): void {
    const campo = el.querySelector('.rp-composer__input') as HTMLTextAreaElement;
    campo.value = frase;
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('.rp-send') as HTMLButtonElement).click();
  }

  /** Do momento 1 até o rascunho na tela, sem nada salvo. */
  function interpretar(frase = 'me lembra de pagar a fatura todo dia 10'): void {
    irParaChat();
    enviarFrase(frase);
    http.expectOne(req => req.url === `${API_V1}/chat/interpretacao`).flush(RASCUNHO_FATURA);
    tick();
    fixture.detectChanges();
  }

  it('entra pelo chat: quem chega vê onde escrever, não a lista', fakeAsync(() => {
    carregar([FATURA]);

    expect(el.querySelector('.rp-chat')).withContext('chat na tela').not.toBeNull();
    expect(el.querySelector('.rp-composer__input')).withContext('campo da frase').not.toBeNull();
    expect(el.querySelector('.rp-painel-lista')).withContext('lista fora da tela').toBeNull();

    (el.querySelector('.rp-voltar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.rp-painel-lista')).withContext('lista a um clique').not.toBeNull();
    expect(el.textContent).toContain('Pagar a fatura do cartão');
  }));

  it('IA ocupada (503): aviso na conversa com contagem, e o formulário abre com a frase', fakeAsync(() => {
    carregar([FATURA]);
    enviarFrase('me lembra de regar as plantas toda segunda');
    http.expectOne(req => req.url === `${API_V1}/chat/interpretacao`).flush(
      { status: 503, erro: 'Service Unavailable', mensagem: 'Muita gente testando a IA agora', caminho: '/x', timestamp: '' },
      { status: 503, statusText: 'Service Unavailable', headers: { 'Retry-After': '3' } },
    );
    tick();
    fixture.detectChanges();

    expect(el.querySelector('.rp-alerta')).withContext('sem alerta no topo').toBeNull();
    const aviso = el.querySelector('.rp-bolha--ocupada') as HTMLElement;
    expect(aviso).withContext('aviso na conversa').not.toBeNull();
    expect(aviso.textContent).toContain('3 s');
    const tentar = aviso.querySelector('.rp-criar') as HTMLButtonElement;
    expect(tentar.disabled).withContext('espera o Retry-After').toBeTrue();

    tick(3000);
    fixture.detectChanges();
    expect(tentar.disabled).withContext('contagem acabou').toBeFalse();

    (aviso.querySelector('.rp-ajustar') as HTMLButtonElement).click();
    fixture.detectChanges();
    const titulo = el.querySelector('.rp-panel input') as HTMLInputElement | null;
    expect(titulo?.value).toBe('me lembra de regar as plantas toda segunda');
  }));

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

    // Campos aceitos por rota: /categoria -> id,nome,cor,fatorOrdem;
    // /lembrete -> uuid,titulo,descricao,status. Qualquer outro dá 400.
    expect(categoria.request.params.get('sortInfo')).toBe('fatorOrdem');
    expect(lembrete.request.params.get('sortInfo')).toBe('uuid');
    expect(lembrete.request.params.get('decrescente')).toBe('false');

    categoria.flush(CATEGORIAS);
    lembrete.flush([]);
    tick();
  }));

  it('sem lembretes, o card convida a criar e o chat oferece os exemplos', fakeAsync(() => {
    abrir([]);

    expect(el.textContent).toContain('Nenhum lembrete ainda');
    irParaChat();

    const chat = el.querySelector('.rp-examples');
    expect(chat).withContext('chat').toBeTruthy();
    expect(chat!.querySelectorAll('.rp-exemplo').length).toBe(SUGESTOES.length);
  }));

  it('clicar num exemplo preenche a frase sem criar nada', fakeAsync(() => {
    abrir([]);
    irParaChat();

    (el.querySelector('.rp-exemplo') as HTMLButtonElement).click();
    fixture.detectChanges();

    const campo = el.querySelector('.rp-composer__input') as HTMLTextAreaElement;
    expect(campo.value.length).toBeGreaterThan(0);
    // Nenhuma chamada disparada: o afterEach do http.verify() reprovaria.
  }));

  it('mostra o lembrete selecionado num card, com as datas que o servidor previu', fakeAsync(() => {
    abrir([AGUA, FATURA]);

    // Sem carrossel: um card só, o do selecionado, e a lista ao lado.
    expect(el.querySelectorAll('.rp-card').length).toBe(1);
    expect(el.querySelectorAll('.rp-card .rp-data').length).toBe(5);
    expect(el.querySelectorAll('.rp-row').length).toBe(2);
    expect(el.querySelector('.rp-card__label')?.textContent?.trim()).toBe('Beber água');

    // Tocar na linha troca o card.
    (el.querySelectorAll('.rp-row__main')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.rp-card__label')?.textContent?.trim()).toBe('Pagar a fatura do cartão');
    expect(el.querySelectorAll('.rp-card .rp-data').length).toBe(2);
  }));

  it('traduz a recorrência para cron, e admite quando não há equivalente', fakeAsync(() => {
    abrir([AGUA, FATURA]);

    // O cron saiu do card a pedido; segue na lista, que é onde ele informa.
    const selos = Array.from(el.querySelectorAll('.rp-row .rp-badge')).map(b =>
      b.textContent?.trim(),
    );
    expect(selos[0]).toBe('0 */3 * * *');
    // A fatura pula feriado — cron não sabe o que é feriado.
    expect(selos[1]).toBe('sem equivalente');
  }));

  it('o card mostra a categoria à direita e não mostra mais o cron', fakeAsync(() => {
    abrir([FATURA]);

    const card = el.querySelector('.rp-card') as HTMLElement;
    expect(card.querySelector('.rp-badge')).withContext('sem selo de cron no card').toBeNull();
    // O selo de categoria divide a linha do título, encostado à direita.
    expect(card.querySelector('.rp-card__titulo .rp-categoria')).toBeTruthy();
    expect(card.querySelector('.rp-card__titulo')?.lastElementChild?.classList)
      .toContain('rp-categoria');
  }));

  it('interpreta a frase sem salvar, e só cria quando a pessoa confirma', fakeAsync(() => {
    abrir([]);
    irParaChat();
    enviarFrase('me lembra de pagar a fatura todo dia 10');

    const chat = http.expectOne(req => req.url === `${API_V1}/chat/interpretacao`);
    expect(chat.request.body.frase).toBe('me lembra de pagar a fatura todo dia 10');
    // Sem `agora`, "amanhã às 9h" resolveria no fuso do servidor.
    expect(chat.request.body.agora).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    chat.flush(RASCUNHO_FATURA);
    tick();
    fixture.detectChanges();

    // Rascunho na tela, nada salvo: nenhum POST /lembrete até aqui.
    expect(el.querySelector('.rp-criar')).withContext('botão de confirmar').toBeTruthy();
    expect(el.textContent).toContain('rascunho · não salvo');
    http.expectNone(req => req.method === 'POST' && req.url === `${API_V1}/lembrete`);

    (el.querySelector('.rp-criar') as HTMLButtonElement).click();

    // Confirmar é reenviar o rascunho, igual, ao POST /lembrete comum.
    const post = http.expectOne(req => req.method === 'POST' && req.url === `${API_V1}/lembrete`);
    expect(post.request.body).toEqual(RASCUNHO_FATURA.lembrete);
    post.flush(FATURA, { status: 201, statusText: 'Created' });
    tick();
    http.expectOne(req => req.method === 'GET' && req.url === `${API_V1}/lembrete`).flush([FATURA]);
    tick();
    fixture.detectChanges();

    expect(el.textContent).toContain('201 Created');
    expect(el.querySelector('.rp-bolha--ok')).toBeTruthy();

    // "ver lembrete" volta ao momento 1 com o recém-criado no card.
    (el.querySelector('.rp-ver') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.rp-card__label')?.textContent?.trim()).toBe('Pagar a fatura do cartão');
  }));

  it('voltar sem confirmar descarta o rascunho — nada é salvo', fakeAsync(() => {
    abrir([AGUA]);
    interpretar();

    (el.querySelector('.rp-voltar') as HTMLButtonElement).click();
    fixture.detectChanges();

    // Nenhum POST: o http.verify() do afterEach reprovaria.
    expect(el.querySelector('.rp-card__label')?.textContent?.trim()).toBe('Beber água');
    const funil = TestBed.inject(FunilService);
    expect(funil.trilha().some(r => r.evento === 'rascunho_descartado')).toBeTrue();
  }));

  it('ajustar no formulário abre o formulário com o que a IA entendeu', fakeAsync(() => {
    abrir([]);
    interpretar();

    (el.querySelector('.rp-ajustar') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('.rp-panel--form')).toBeTruthy();
    const titulo = el.querySelector('.rp-form .rp-input') as HTMLInputElement;
    expect(titulo.value).toBe('Pagar a fatura do cartão');
    const select = el.querySelector('.rp-form select.rp-input') as HTMLSelectElement;
    expect(select.value).toBe('3');
  }));

  it('as sugestões somem depois da primeira frase', fakeAsync(() => {
    abrir([]);
    interpretar();

    expect(el.querySelector('.rp-exemplo')).toBeNull();
  }));

  it('convida ao simulador quando o lembrete fala de dívida', fakeAsync(() => {
    abrir([]);
    interpretar('me lembra de pagar a fatura todo dia 10');

    (el.querySelector('.rp-criar') as HTMLButtonElement).click();
    http.expectOne(req => req.method === 'POST' && req.url === `${API_V1}/lembrete`).flush(FATURA);
    tick();
    http.expectOne(req => req.method === 'GET' && req.url === `${API_V1}/lembrete`).flush([FATURA]);
    tick();
    fixture.detectChanges();

    // O convite mora no anúncio do fim do artigo.
    expect(el.querySelector('#rp-rotafin .rp-convite')).withContext('convite contextual').toBeTruthy();
  }));

  describe('alternador de tema', () => {
    it('abre no claro mostrando a lua, e no escuro mostra o sol', fakeAsync(() => {
      abrir([AGUA]);

      const host = fixture.nativeElement as HTMLElement;
      const botao = el.querySelector('.rp-tema') as HTMLButtonElement;

      expect(host.classList.contains('rp-dark')).withContext('começa claro').toBeFalse();
      expect(botao.getAttribute('aria-label')).toBe('usar tema escuro');
      // A lua é um path só; o sol tem o círculo.
      expect(botao.querySelector('circle')).withContext('lua no claro').toBeNull();

      botao.click();
      fixture.detectChanges();

      expect(host.classList.contains('rp-dark')).withContext('vira escuro').toBeTrue();
      expect(botao.getAttribute('aria-label')).toBe('usar tema claro');
      expect(botao.querySelector('circle')).withContext('sol no escuro').toBeTruthy();

      botao.click();
      fixture.detectChanges();
      expect(host.classList.contains('rp-dark')).withContext('volta ao claro').toBeFalse();
    }));

    it('abre no escuro quando o visitante já escolheu isso antes', fakeAsync(() => {
      // Seed antes de criar o componente: ele lê o tema salvo na construção.
      localStorage.setItem('rp:tema', 'dark');
      fixture = TestBed.createComponent(RoutinePusherComponent);
      el = fixture.nativeElement;
      abrir([AGUA]);

      expect((fixture.nativeElement as HTMLElement).classList.contains('rp-dark')).toBeTrue();
      expect(el.querySelector('.rp-tema')?.querySelector('circle'))
        .withContext('sol, porque já está escuro')
        .toBeTruthy();
    }));

    it('ignora lixo salvo e cai no padrão', fakeAsync(() => {
      localStorage.setItem('rp:tema', 'roxo');
      fixture = TestBed.createComponent(RoutinePusherComponent);
      el = fixture.nativeElement;
      abrir([AGUA]);

      expect((fixture.nativeElement as HTMLElement).classList.contains('rp-dark')).toBeFalse();
    }));

    it('guarda a escolha para a próxima visita', fakeAsync(() => {
      abrir([AGUA]);
      (el.querySelector('.rp-tema') as HTMLButtonElement).click();
      expect(localStorage.getItem('rp:tema')).toBe('dark');
    }));

    it('o clique vence o input theme do anfitrião', fakeAsync(() => {
      fixture.componentRef.setInput('theme', 'dark');
      abrir([AGUA]);

      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList.contains('rp-dark')).toBeTrue();

      (el.querySelector('.rp-tema') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(host.classList.contains('rp-dark')).withContext('escolha manda').toBeFalse();
    }));
  });

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
    irParaChat();
    enviarFrase('mais um lembrete');

    http.expectOne(req => req.url === `${API_V1}/chat/interpretacao`).flush(
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
    irParaChat();
    enviarFrase('algo');

    http.expectOne(req => req.url === `${API_V1}/chat/interpretacao`).flush(
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

  it('conclui pelo ✓ do card e relista — o PATCH responde vazio', fakeAsync(() => {
    abrir([AGUA]);

    (el.querySelector('.rp-acao--concluir') as HTMLButtonElement).click();

    const patch = http.expectOne(req => req.method === 'PATCH');
    expect(patch.request.url).toBe(`${API_V1}/lembrete/${AGUA.uuid}`);
    patch.flush('');
    tick();

    http.expectOne(req => req.url === `${API_V1}/lembrete`).flush([{ ...AGUA, status: 'CONCLUIDO' }]);
    tick();
    fixture.detectChanges();

    expect(el.querySelector('.rp-card')?.classList).toContain('rp-card--feito');
    const ok = el.querySelector('.rp-acao--concluir') as HTMLButtonElement;
    expect(ok.disabled).toBeTrue();
    expect(ok.classList).toContain('rp-acao--feito');
  }));

  it('a linha da lista é um botão só: concluir mora no card', fakeAsync(() => {
    abrir([AGUA]);

    const linha = el.querySelector('li.rp-row') as HTMLElement;
    expect(linha.tagName).toBe('LI');
    expect(linha.querySelectorAll(':scope > button').length).toBe(1);
  }));

  it('o "+" troca de momento: card e lista saem antes de o chat entrar', fakeAsync(() => {
    abrir([AGUA]);

    (el.querySelector('.rp-mais') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.rp-esq')?.classList).withContext('saindo').toContain('rp-saindo');
    expect(el.querySelector('.rp-chat')).withContext('chat ainda não').toBeNull();

    tick(500);
    fixture.detectChanges();
    expect(el.querySelector('.rp-card')).toBeNull();
    expect(el.querySelector('.rp-chat')).toBeTruthy();
    // O título fica: é o cabeçalho da página, não de um momento.
    expect(el.querySelector('.rp-title')?.textContent).toContain('Routine Pusher');

    (el.querySelector('.rp-voltar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.rp-card')).toBeTruthy();
  }));

  describe('edição', () => {
    /** Clica no lápis do card do primeiro lembrete. */
    function abrirEdicao(lembretes: Lembrete[]): void {
      abrir(lembretes);
      (el.querySelector('.rp-acao--editar') as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    it('abre o formulário preenchido com a regra do lembrete', fakeAsync(() => {
      abrirEdicao([FATURA]);

      expect(el.querySelector('.rp-panel--form')).withContext('formulário abre').toBeTruthy();
      expect(el.querySelector('.rp-panel')?.textContent).toContain('editar lembrete');

      const titulo = el.querySelector('.rp-form .rp-input') as HTMLInputElement;
      expect(titulo.value).toBe('Pagar a fatura do cartão');
      // FATURA é diasFixosNoMes [10]: a estratégia lida deve ser "dias do mês".
      const ativo = el.querySelector('.rp-segmento__op--ativo');
      expect(ativo?.textContent?.trim()).toBe('dias do mês');
    }));

    it('mostra a categoria do lembrete, não a primeira da lista', fakeAsync(() => {
      // FATURA é 'Casa' (id 3) e 'Saúde' (id 1) é a primeira opção. Com [value] só
      // no <select>, as options do @for nasciam depois e o campo caía em Saúde.
      abrirEdicao([FATURA]);

      const select = el.querySelector('.rp-form select.rp-input') as HTMLSelectElement;
      expect(select.value).toBe('3');
      expect(select.selectedOptions[0].textContent?.trim()).toBe('Casa');
    }));

    it('deixa trocar a categoria — o servidor passou a aplicar categoriaId', fakeAsync(() => {
      abrirEdicao([FATURA]);

      const select = el.querySelector('.rp-form select.rp-input') as HTMLSelectElement;
      expect(select.disabled).withContext('campo liberado').toBeFalse();
    }));

    it('mudar só o título vai de PATCH /detalhes, que preserva o agendamento', fakeAsync(() => {
      abrirEdicao([FATURA]);

      const titulo = el.querySelector('.rp-form .rp-input') as HTMLInputElement;
      titulo.value = 'Fatura renegociada';
      titulo.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      // Nada de aviso: o agendamento não foi tocado.
      expect(el.querySelector('.rp-form__aviso')).toBeNull();

      (el.querySelector('.rp-panel--form .rp-primary') as HTMLButtonElement).click();

      const patch = http.expectOne(req => req.method === 'PATCH');
      expect(patch.request.url).toBe(`${API_V1}/lembrete/${FATURA.uuid}/detalhes`);
      expect(patch.request.body).toEqual({
        titulo: 'Fatura renegociada',
        descricao: null,
        categoriaId: 3,
      });
      // PUT reagendaria e reabriria um concluído — não pode sair daqui.
      expect(patch.request.body.recorrencia).toBeUndefined();

      // A resposta traz o lembrete completo: troca em memória, sem relistar.
      patch.flush({ ...FATURA, titulo: 'Fatura renegociada' });
      tick();
      fixture.detectChanges();

      expect(el.querySelector('.rp-panel--form')).withContext('formulário fecha').toBeNull();
      expect(el.textContent).toContain('Fatura renegociada');
    }));

    it('mudar o agendamento vai de PUT, com corpo completo, e avisa antes', fakeAsync(() => {
      abrirEdicao([FATURA]);

      // FATURA é dias do mês [10]; trocar para 20 mexe na série.
      const dias = el.querySelector('.rp-form input[placeholder="10, 25"]') as HTMLInputElement;
      dias.value = '20';
      dias.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(el.querySelector('.rp-form__aviso')?.textContent).toContain('recalculada');
      expect((el.querySelector('.rp-panel--form .rp-primary') as HTMLElement).textContent)
        .toContain('reagendar');

      (el.querySelector('.rp-panel--form .rp-primary') as HTMLButtonElement).click();

      const put = http.expectOne(req => req.method === 'PUT');
      expect(put.request.url).toBe(`${API_V1}/lembrete/${FATURA.uuid}`);
      // Corpo completo: parcial devolve 400 "Failed to read request".
      expect(put.request.body.recorrencia.diasFixosNoMes).toEqual([20]);
      expect(put.request.body.notificacao.metodo).toEqual(['pop-up']);

      put.flush(FATURA);
      tick();
      http.expectOne(req => req.url === `${API_V1}/lembrete`).flush([FATURA]);
      tick();
    }));

    it('avisa que um lembrete concluído volta a pendente ao reagendar', fakeAsync(() => {
      const feito = { ...FATURA, status: 'CONCLUIDO' as const, proximasExecucoes: [] };
      abrir([feito]);
      (el.querySelector('.rp-acao--editar') as HTMLButtonElement).click();
      fixture.detectChanges();

      const dias = el.querySelector('.rp-form input[placeholder="10, 25"]') as HTMLInputElement;
      dias.value = '20';
      dias.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(el.querySelector('.rp-form__aviso')?.textContent).toContain('volta a pendente');
    }));

    it('criar depois de editar volta a ser POST, sem herdar o uuid', fakeAsync(() => {
      abrirEdicao([FATURA]);
      (el.querySelector('.rp-panel--form .rp-secondary') as HTMLButtonElement).click();
      fixture.detectChanges();

      irParaChat();
      (el.querySelector('.rp-examples .rp-reset--form') as HTMLButtonElement).click();
      fixture.detectChanges();

      const titulo = el.querySelector('.rp-form .rp-input') as HTMLInputElement;
      expect(titulo.value).withContext('campos limpos').toBe('');

      const select = el.querySelector('.rp-form select.rp-input') as HTMLSelectElement;
      expect(select.disabled).withContext('categoria liberada ao criar').toBeFalse();

      titulo.value = 'Novo lembrete';
      titulo.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (el.querySelector('.rp-panel--form .rp-primary') as HTMLButtonElement).click();

      const post = http.expectOne(req => req.method === 'POST' && req.url === `${API_V1}/lembrete`);
      post.flush(AGUA);
      tick();
      http.expectOne(req => req.url === `${API_V1}/lembrete`).flush([FATURA, AGUA]);
      tick();
    }));
  });

  describe('aviso do navegador', () => {
    function alerta(): AlertaFalso {
      return fixture.debugElement.injector.get(AlertaService) as unknown as AlertaFalso;
    }

    function stream(): NotificacoesFalsas {
      return fixture.debugElement.injector.get(NotificacoesService) as unknown as NotificacoesFalsas;
    }

    it('o evento do stream vira aviso com a categoria e a recorrência', fakeAsync(() => {
      abrir([FATURA]);

      stream().disparar('Pagar a fatura do cartão');

      expect(alerta().avisados.length).toBe(1);
      expect(alerta().avisados[0].titulo).toBe('Pagar a fatura do cartão');
      // O stream manda só o título; o corpo vem do lembrete em memória.
      expect(alerta().avisados[0].corpo).toContain('Casa');
    }));

    it('o stream voltando relista os lembretes — o que disparou fora se perdeu', fakeAsync(() => {
      abrir([]);
      expect(el.querySelectorAll('.rp-card__label').length).toBe(0);

      stream().reconectar();

      http.expectOne(req => req.url === `${API_V1}/lembrete`).flush([FATURA]);
      tick();
      fixture.detectChanges();

      expect(el.textContent).toContain('Pagar a fatura do cartão');
    }));

    it('título que não casa com nenhum lembrete ainda avisa', fakeAsync(() => {
      abrir([FATURA]);

      // Acontece se o lembrete foi excluído noutra aba entre o disparo e o
      // evento chegar. Ficar calado seria pior que um texto genérico.
      stream().disparar('Um lembrete que a lista não tem');

      expect(alerta().avisados.length).toBe(1);
      expect(alerta().avisados[0].corpo).toContain('disparou agora');
    }));

    it('o sino pede permissão, e só some quando o navegador não tem a API', fakeAsync(() => {
      abrir([FATURA]);

      const sino = el.querySelector('.rp-sino') as HTMLButtonElement;
      expect(sino).withContext('sino visível quando dá para pedir').toBeTruthy();

      sino.click();
      fixture.detectChanges();

      expect(alerta().pedidos).toBe(1);
      // Concedido, o sino continua na tela para dizer que está ligado.
      expect((el.querySelector('.rp-sino') as HTMLButtonElement).classList)
        .toContain('rp-sino--ligado');
    }));

    it('bloqueado pelo navegador, o sino fica visível e apagado', fakeAsync(() => {
      abrir([FATURA]);
      alerta().permissao.set('denied');
      fixture.detectChanges();

      // Sumir esconderia o motivo de o aviso não chegar; quem desfaz é o
      // navegador, não a tela.
      const sino = el.querySelector('.rp-sino') as HTMLButtonElement;
      expect(sino).toBeTruthy();
      expect(sino.disabled).toBeTrue();
      expect(sino.title).toContain('bloqueou');
    }));

    it('sem a API de notificação, some o sino e a tela explica o iphone', fakeAsync(() => {
      abrir([FATURA]);
      alerta().permissao.set('indisponivel');
      alerta().precisaInstalarNoIphone.set(true);
      fixture.detectChanges();

      // No Safari do iPhone a API só existe em site adicionado à Tela de
      // Início: oferecer um botão que não faz nada seria pior que explicar.
      expect(el.querySelector('.rp-sino')).toBeNull();
      // A explicação mora na nota de persistência, embaixo do campo do chat.
      irParaChat();
      expect(el.textContent).toContain('adicionar à tela de início');
    }));
  });

  describe('categorias', () => {
    /** Abre o painel pelo selo do card — com lembrete alvo. */
    function abrirPainel(lembretes: Lembrete[] = [FATURA]): Element {
      abrir(lembretes);
      (el.querySelector('.rp-card .rp-categoria') as HTMLButtonElement).click();
      fixture.detectChanges();

      const painel = el.querySelector('.rp-panel--categorias');
      expect(painel).withContext('painel de categorias').toBeTruthy();
      return painel!;
    }

    /** Abre o painel pelo botão da seção — sem alvo, só para gerenciar. */
    function abrirGerenciador(lembretes: Lembrete[] = [FATURA]): Element {
      abrir(lembretes);
      irParaChat();
      (el.querySelector('.rp-examples .rp-reset--cats') as HTMLButtonElement).click();
      fixture.detectChanges();
      return el.querySelector('.rp-panel--categorias')!;
    }

    it('mostra a categoria do lembrete como selo com a cor dela', fakeAsync(() => {
      abrir([FATURA]);

      const selo = el.querySelector('.rp-card .rp-categoria') as HTMLElement;
      expect(selo.textContent?.trim()).toBe('Casa');
      expect(selo.style.getPropertyValue('--cor-categoria')).toBe('#FB8C00');
    }));

    it('o selo abre o painel com alvo, e diz de qual lembrete fala', fakeAsync(() => {
      const painel = abrirPainel();

      expect(painel.querySelectorAll('.rp-cat').length).toBe(CATEGORIAS.length);
      expect(painel.querySelector('.rp-panel__name')?.textContent?.trim())
        .toBe('Pagar a fatura do cartão');
      const atual = painel.querySelector('.rp-cat--atual');
      expect(atual?.textContent).withContext('marca a atual').toContain('Casa');
    }));

    it('escolher outra categoria vai de PATCH /detalhes, que não reagenda', fakeAsync(() => {
      const painel = abrirPainel();

      const outra = painel.querySelectorAll('.rp-cat')[0].querySelector('.rp-cat__main');
      expect(outra!.textContent).withContext('a que não é a atual').toContain('Saúde');
      (outra as HTMLButtonElement).click();

      const patch = http.expectOne(req => req.method === 'PATCH');
      expect(patch.request.url).toBe(`${API_V1}/lembrete/${FATURA.uuid}/detalhes`);
      // Título e descrição vão como o servidor os tem: este caminho não passa
      // pelo formulário e não pode inventar texto.
      expect(patch.request.body).toEqual({
        titulo: FATURA.titulo,
        descricao: null,
        categoriaId: 1,
      });
      expect(patch.request.body.recorrencia).withContext('sem recorrência').toBeUndefined();

      patch.flush({ ...FATURA, categoria: CATEGORIAS[0] });
      tick();
      fixture.detectChanges();

      expect(el.querySelector('.rp-panel--categorias')).withContext('painel fecha').toBeNull();
      const selo = el.querySelector('.rp-card .rp-categoria') as HTMLElement;
      expect(selo.textContent?.trim()).toBe('Saúde');
    }));

    it('clicar na categoria que já vale só fecha, sem chamar a API', fakeAsync(() => {
      const painel = abrirPainel();

      (painel.querySelector('.rp-cat--atual .rp-cat__main') as HTMLButtonElement).click();
      fixture.detectChanges();

      // http.verify() no afterEach reprovaria qualquer PATCH.
      expect(el.querySelector('.rp-panel--categorias')).withContext('painel fecha').toBeNull();
    }));

    it('a seção abre o painel sem alvo, para gerenciar sem depender de lembrete', fakeAsync(() => {
      const painel = abrirGerenciador([]);

      expect(painel).toBeTruthy();
      expect(painel.querySelector('.rp-label')?.textContent?.trim()).toBe('suas categorias');
      // Sem alvo não há lembrete para marcar, logo nada de ✓.
      expect(painel.querySelector('.rp-cat--atual')).withContext('sem marca').toBeNull();
      // E o clique na linha edita, em vez de escolher.
      (painel.querySelector('.rp-cat__main') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('.rp-panel--categorias .rp-input')).toBeTruthy();
    }));

    it('criar manda fatorOrdem explícito — omitir vale zero e colide', fakeAsync(() => {
      const painel = abrirGerenciador();

      (painel.querySelector('.rp-cats__nova') as HTMLButtonElement).click();
      fixture.detectChanges();

      const nome = el.querySelector('.rp-panel--categorias .rp-input') as HTMLInputElement;
      nome.value = 'Financeiro';
      nome.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      (el.querySelector('.rp-panel--categorias .rp-primary') as HTMLButtonElement).click();

      const post = http.expectOne(req => req.method === 'POST' && req.url === `${API_V1}/categoria`);
      // CATEGORIAS ocupa fatorOrdem 1 e 3, então a próxima livre é 4. Omitir
      // esse campo mandaria zero, que colide com a segunda categoria criada.
      expect(post.request.body.fatorOrdem).toBe(4);
      expect(post.request.body.nome).toBe('Financeiro');
      expect(post.request.body.cor).toMatch(/^#[0-9A-F]{6}$/);
      expect(post.request.withCredentials).withContext('POST /categoria').toBeTrue();

      const criada = { id: 9, nome: 'Financeiro', cor: post.request.body.cor, fatorOrdem: 4 };
      post.flush(criada);
      tick();
      http.expectOne(req => req.url === `${API_V1}/categoria`).flush([...CATEGORIAS, criada]);
      tick();
      fixture.detectChanges();

      expect(el.querySelectorAll('.rp-cat').length).toBe(3);
    }));

    it('a paleta desabilita as cores que a lista já usa', fakeAsync(() => {
      const painel = abrirGerenciador();
      (painel.querySelector('.rp-cats__nova') as HTMLButtonElement).click();
      fixture.detectChanges();

      // CATEGORIAS usa #43A047 e #FB8C00; escolher uma delas daria 409, e o
      // visitante não teria como saber quais estão livres.
      const ocupadas = Array.from(el.querySelectorAll('.rp-swatch'))
        .filter(b => (b as HTMLButtonElement).disabled)
        .map(b => (b as HTMLElement).style.getPropertyValue('--cor-categoria'));

      expect(ocupadas).toContain('#43A047');
      expect(ocupadas).toContain('#FB8C00');
    }));

    it('renomear manda os três campos e preserva a posição', fakeAsync(() => {
      const painel = abrirGerenciador();

      (painel.querySelectorAll('.rp-cat')[1].querySelector('.rp-cat__acao') as HTMLButtonElement)
        .click();
      fixture.detectChanges();

      const nome = el.querySelector('.rp-panel--categorias .rp-input') as HTMLInputElement;
      expect(nome.value).withContext('vem preenchido').toBe('Casa');
      nome.value = 'Moradia';
      nome.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      (el.querySelector('.rp-panel--categorias .rp-primary') as HTMLButtonElement).click();

      const put = http.expectOne(req => req.method === 'PUT');
      expect(put.request.url).toBe(`${API_V1}/categoria/3`);
      // fatorOrdem tem de ir junto: sem ele o servidor entende zero e devolve 409.
      expect(put.request.body).toEqual({ nome: 'Moradia', cor: '#FB8C00', fatorOrdem: 3 });

      const renomeada = { id: 3, nome: 'Moradia', cor: '#FB8C00', fatorOrdem: 3 };
      put.flush(renomeada);
      tick();
      http.expectOne(req => req.url === `${API_V1}/categoria`).flush([CATEGORIAS[0], renomeada]);
      tick();

      // O lembrete carrega uma cópia da categoria: sem relistar, o card ficaria
      // com o nome de antes da edição.
      http.expectOne(req => req.url === `${API_V1}/lembrete`)
        .flush([{ ...FATURA, categoria: renomeada }]);
      tick();
      fixture.detectChanges();

      // O gerenciador abre pelo chat; o card mora no momento 1.
      (el.querySelector('.rp-panel--categorias .rp-close') as HTMLButtonElement).click();
      (el.querySelector('.rp-voltar') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('.rp-card .rp-categoria')?.textContent?.trim()).toBe('Moradia');
    }));

    it('a mensagem do 422 é nossa, não a do servidor, que vem quebrada', fakeAsync(() => {
      const painel = abrirGerenciador();

      (
        painel.querySelectorAll('.rp-cat')[1].querySelector('.rp-cat__acao--excluir') as
          HTMLButtonElement
      ).click();

      const del = http.expectOne(req => req.method === 'DELETE');
      expect(del.request.url).toBe(`${API_V1}/categoria/3`);
      del.flush(
        {
          status: 422,
          mensagem:
            'Erro ao remover item. \nDetalhesNão foi possível concluir a exclusão dessa categoria. Ainda restam lembretes associados',
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      tick();
      fixture.detectChanges();

      const erro = el.querySelector('.rp-panel--categorias .rp-form__erro');
      expect(erro?.textContent).toContain('ainda está sendo usada');
      expect(erro?.textContent).withContext('sem o texto quebrado').not.toContain('Detalhes');
    }));

    it('não deixa apagar a última categoria: sem ela não dá para criar lembrete', fakeAsync(() => {
      fixture.detectChanges();
      http.expectOne(req => req.url === `${API_V1}/sessao`).flush(SESSAO);
      tick();
      // Uma categoria só na lista.
      http.expectOne(req => req.url === `${API_V1}/categoria`).flush([CATEGORIAS[0]]);
      http.expectOne(req => req.url === `${API_V1}/lembrete`).flush([]);
      tick();
      fixture.detectChanges();
      // Já entra no chat.

      (el.querySelector('.rp-examples .rp-reset--cats') as HTMLButtonElement).click();
      fixture.detectChanges();

      // O backend deixa apagar a última e o visitante fica travado: `categoriaId`
      // é obrigatório e não sobraria nenhuma para escolher.
      const excluir = el.querySelector('.rp-cat__acao--excluir') as HTMLButtonElement;
      expect(excluir.disabled).withContext('última categoria').toBeTrue();
      expect(excluir.title).toContain('última');

      excluir.click();
      http.expectNone(req => req.method === 'DELETE');
    }));

    it('sem nenhuma categoria, a frase dá lugar ao desvio para criar uma', fakeAsync(() => {
      fixture.detectChanges();
      http.expectOne(req => req.url === `${API_V1}/sessao`).flush(SESSAO);
      tick();
      http.expectOne(req => req.url === `${API_V1}/categoria`).flush([]);
      http.expectOne(req => req.url === `${API_V1}/lembrete`).flush([]);
      tick();
      fixture.detectChanges();
      // Já entra no chat.

      // `categoriaId` é obrigatório ao criar: o campo de frase só levaria a 404.
      expect(el.querySelector('.rp-composer__input')).withContext('sem campo de frase').toBeNull();
      expect(el.textContent).toContain('Você não tem nenhuma categoria');
      expect((el.querySelector('.rp-reset--form') as HTMLButtonElement).disabled).toBeTrue();

      (el.querySelector('.rp-composer__box--travado .rp-primary') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('.rp-panel--categorias')).withContext('abre o painel').toBeTruthy();
    }));
  });

  describe('lembrete concluído', () => {
    // Concluído passou a vir com proximasExecucoes vazio. Os textos da tela
    // foram escritos quando isso nunca acontecia.
    const FEITO: Lembrete = {
      ...FATURA,
      status: 'CONCLUIDO',
      proximasExecucoes: [],
      notificacao: { ...FATURA.notificacao, proximaExecucao: null },
    };

    it('o card não promete execuções que não existem, e culpa o status', fakeAsync(() => {
      abrir([FEITO]);

      expect(el.querySelectorAll('.rp-data').length).toBe(0);
      const aviso = el.querySelector('.rp-card__sem-datas')?.textContent ?? '';
      expect(aviso).toContain('não dispara mais');
      expect(aviso).withContext('a recorrência não tem defeito').not.toContain('não previu');
    }));

    it('concluído, o ✓ fica apagado; editar e excluir continuam', fakeAsync(() => {
      abrir([FEITO]);

      expect((el.querySelector('.rp-acao--concluir') as HTMLButtonElement).disabled).toBeTrue();
      expect(el.querySelector('.rp-acao--editar')).toBeTruthy();
      expect(el.querySelector('.rp-acao--excluir')).toBeTruthy();
    }));
  });

  it('recusa intervalo abaixo do mínimo em vez de corrigir em silêncio', fakeAsync(() => {
    abrir([AGUA]);
    irParaChat();
    (el.querySelector('.rp-examples .rp-reset--form') as HTMLButtonElement).click();
    fixture.detectChanges();

    // "a cada" -> minutos -> 1
    const ops = el.querySelectorAll('.rp-segmento__op');
    (ops[ops.length - 1] as HTMLButtonElement).click();
    fixture.detectChanges();

    const unidade = el.querySelector('.rp-campo--linha select.rp-input') as HTMLSelectElement;
    unidade.value = 'minutos';
    unidade.dispatchEvent(new Event('change'));
    const passo = el.querySelector('.rp-input--curto') as HTMLInputElement;
    passo.value = '1';
    passo.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(el.querySelector('.rp-form .rp-campo__erro')?.textContent).toContain('mínimo');
    const salvar = el.querySelector('.rp-panel--form .rp-primary') as HTMLButtonElement;
    expect(salvar.disabled).withContext('salvar bloqueado').toBeTrue();

    salvar.click();
    // Nenhuma requisição: o http.verify() do afterEach reprovaria um POST aqui.
  }));

  it('exclui pela lixeira do card, depois de confirmar, e relista', fakeAsync(() => {
    abrir([AGUA, FATURA]);

    // A lixeira só pede confirmação; o DELETE sai no segundo clique.
    (el.querySelector('.rp-acao--excluir') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectNone(req => req.method === 'DELETE');
    (el.querySelector('.rp-excluir-sim') as HTMLButtonElement).click();

    const del = http.expectOne(req => req.method === 'DELETE');
    expect(del.request.url).toBe(`${API_V1}/lembrete/${AGUA.uuid}`);
    // 204 sem corpo.
    del.flush(null, { status: 204, statusText: 'No Content' });
    tick();

    http.expectOne(req => req.url === `${API_V1}/lembrete`).flush([FATURA]);
    tick();
    fixture.detectChanges();

    expect(el.querySelector('.rp-card__label')?.textContent?.trim()).toBe('Pagar a fatura do cartão');
    expect(el.querySelectorAll('.rp-row').length).toBe(1);
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
