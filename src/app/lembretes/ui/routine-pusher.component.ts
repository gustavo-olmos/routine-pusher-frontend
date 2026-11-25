import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { resumoDosCampos } from '../api/erros';
import {
  Categoria,
  DIAS_SEMANA,
  DiaSemana,
  Lembrete,
  PoliticaDiaUtil,
} from '../api/modelos';
import { Aviso, NotificacoesService } from '../api/notificacoes.service';
import { AlertaService } from '../alerta/alerta.service';
import { SEM_CRON, cronEquivalente, resumoRecorrencia } from '../dominio/cron';
import {
  Estrategia,
  EstadoFormulario,
  FORMULARIO_VAZIO,
  Unidade,
  mudouAgendamento,
  paraDetalhes,
  entradaParaFormulario,
  paraEntrada,
  paraFormulario,
} from '../dominio/formulario';
import {
  diaMes,
  diaSemanaCurto,
  diaSemanaLongo,
  faltaPara,
  hora,
  intervaloEntre,
  paraDatas,
} from '../dominio/datas';
import { LinhaJson, linhasJson } from '../dominio/json-colorido';
import { LembretesStore } from '../estado/lembretes.store';
import { FunilService, OrigemSaida } from '../funil/funil.service';
import {
  INTERVALO_MINIMO_MINUTOS,
  LIMITE_LEMBRETES,
  SESSAO_HORAS,
  MAX_DESCRICAO,
  MAX_FRASE,
  MAX_NOME_CATEGORIA,
  MAX_TITULO,
  PALETA,
  SIMULADOR_URL,
  SUGESTOES,
} from '../lembretes.config';
import { Tema, lerTema, oposto, salvarTema } from './tema';
import { AlcaRotafinComponent } from './alca/alca-rotafin.component';
import { ArtigoComponent } from './artigo/artigo.component';
import { EXEMPLO_RASCUNHO } from './artigo/exemplos';
import { PainelJsonComponent, TomPainel } from './painel-json/painel-json.component';

/** Uma linha da lista de lembretes ativos. */
interface LinhaVm {
  id: string;
  label: string;
  cron: string;
  noCron: boolean;
  cor: string;
  concluido: boolean;
}

/** Uma das próximas execuções, como ladrilho no card do lembrete. */
interface DataVm {
  n: string;
  dia: string;
  detalhe: string;
  gap: string;
  first: boolean;
}

/** Duração da saída do momento 1 antes do chat entrar — casa com o SCSS. */
const SAIDA_MS = 420;

const dois = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'rp-routine-pusher',
  standalone: true,
  templateUrl: './routine-pusher.component.html',
  styleUrl: './routine-pusher.component.scss',
  imports: [PainelJsonComponent, AlcaRotafinComponent, ArtigoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [NotificacoesService, AlertaService],
  host: { '[class.rp-dark]': 'temaAtivo() === "dark"' },
})
export class RoutinePusherComponent implements OnInit, OnDestroy {
  private readonly store = inject(LembretesStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly funil = inject(FunilService);
  private readonly notificacoes = inject(NotificacoesService);
  private readonly alerta = inject(AlertaService);

  readonly theme = input<Tema>('light');
  /** Teto de execuções exibidas; o servidor manda cinco. */
  readonly occurrenceCount = input(5);

  protected readonly SUGESTOES = SUGESTOES;
  protected readonly DIAS_SEMANA = DIAS_SEMANA;
  protected readonly LIMITE_LEMBRETES = LIMITE_LEMBRETES;
  protected readonly MAX_FRASE = MAX_FRASE;
  protected readonly MAX_TITULO = MAX_TITULO;
  protected readonly MAX_DESCRICAO = MAX_DESCRICAO;
  protected readonly SIMULADOR_URL = SIMULADOR_URL;
  protected readonly INTERVALO_MINIMO = INTERVALO_MINIMO_MINUTOS;
  protected readonly SESSAO_HORAS = SESSAO_HORAS;
  protected readonly MAX_NOME_CATEGORIA = MAX_NOME_CATEGORIA;

  protected readonly lembretes = this.store.lembretes;
  protected readonly categorias = this.store.categorias;
  protected readonly carregando = this.store.carregando;
  protected readonly enviando = this.store.enviando;
  protected readonly falha = this.store.falha;
  protected readonly convite = this.store.convite;
  protected readonly rascunho = this.store.rascunho;
  protected readonly recemCriado = this.store.recemCriado;
  protected readonly fraseEnviada = this.store.fraseDoRascunho;
  protected readonly vazio = this.store.vazio;
  protected readonly noLimite = this.store.noLimite;
  protected readonly restantes = this.store.restantes;
  protected readonly semCategorias = this.store.semCategorias;
  protected readonly avisos = this.notificacoes.avisos;
  protected readonly permissaoAviso = this.alerta.permissao;
  protected readonly precisaInstalarNoIphone = this.alerta.precisaInstalarNoIphone;

  /**
   * Escolha explícita do visitante, ou `null` enquanto ele não tocar no botão.
   * Fica separada do input `theme` para não brigar com ele: o anfitrião continua
   * mandando no padrão, e o clique manda no resto da visita.
   */
  private readonly temaEscolhido = signal<Tema | null>(lerTema());

  protected readonly temaAtivo = computed<Tema>(() => this.temaEscolhido() ?? this.theme());
  protected readonly escuro = computed(() => this.temaAtivo() === 'dark');

  protected readonly selectedId = signal<string | null>(null);
  protected readonly draft = signal('');

  /**
   * A tela tem dois momentos. 1: ver lembretes (card + lista). 2: criar pelo
   * chat (conversa + JSON). `saindo` segura o momento 1 na tela enquanto ele
   * desliza para fora, antes de o chat entrar.
   */
  protected readonly momento = signal<1 | 2>(1);
  protected readonly saindo = signal(false);
  /** A lixeira do card pede confirmação: excluir não tem volta. */
  protected readonly confirmandoExclusao = signal(false);
  /** No celular, a pílula "+ criar" encolhe para o círculo depois de rolar. */
  protected readonly maisCompacto = signal(false);
  private timerSaida: ReturnType<typeof setTimeout> | null = null;

  /**
   * Cada mensagem nova na conversa (rascunho, criação, "digitando") rola o
   * chat até o fim — senão a resposta da IA nasce escondida atrás do campo.
   */
  private readonly rolarConversa = effect(() => {
    this.rascunho();
    this.recemCriado();
    this.enviando();
    afterNextRender(
      () => {
        const corpo = this.host.nativeElement.querySelector('.rp-chat__corpo');
        corpo?.scrollTo?.({ top: corpo.scrollHeight, behavior: prefereMenosMovimento() ? 'auto' : 'smooth' });
      },
      { injector: this.injector },
    );
  });
  protected readonly formAberto = signal(false);
  /** uuid em edição, ou null quando o formulário está criando. */
  protected readonly editandoId = signal<string | null>(null);
  /** Estado do formulário como ele abriu, para saber o que o usuário mexeu. */
  private readonly estadoOriginal = signal<EstadoFormulario | null>(null);

  /**
   * O painel de categorias tem duas portas: o selo de um lembrete, que abre com
   * alvo e deixa escolher a categoria dele, e o botão da seção, que abre sem
   * alvo só para gerenciar. Por isso o alvo não serve de interruptor.
   */
  protected readonly categoriasAberto = signal(false);
  protected readonly categoriaAlvoId = signal<string | null>(null);

  /** Editor de categoria dentro do painel; o id `null` significa criando. */
  protected readonly catEditorAberto = signal(false);
  protected readonly catEditandoId = signal<number | null>(null);
  protected readonly catNome = signal('');
  protected readonly catCor = signal('');
  protected readonly isMobile = signal(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  );

  // ---- formulário ----------------------------------------------------------
  protected readonly fTitulo = signal('');
  protected readonly fDescricao = signal('');
  protected readonly fCategoria = signal<number | null>(null);
  protected readonly fEstrategia = signal<Estrategia>('semana');
  protected readonly fPasso = signal('3');
  protected readonly fUnidade = signal<Unidade>('horas');
  protected readonly fDiasSemana = signal<DiaSemana[]>([]);
  protected readonly fPosicaoMes = signal<number | null>(null);
  protected readonly fDiasMes = signal('');
  protected readonly fHorario = signal('09:00');
  protected readonly fPolitica = signal<PoliticaDiaUtil>('IGNORAR');
  protected readonly fQuantidade = signal('');

  protected readonly index = computed(() => {
    const i = this.lembretes().findIndex(l => l.uuid === this.selectedId());
    return Math.max(0, i);
  });

  protected readonly selected = computed<Lembrete | null>(
    () => this.lembretes()[this.index()] ?? null,
  );

  protected readonly position = computed(() => {
    const total = this.lembretes().length;
    return total ? `${dois(this.index() + 1)} / ${dois(total)}` : '00 / 00';
  });

  protected readonly linhas = computed<LinhaVm[]>(() =>
    this.lembretes().map(l => {
      const especificadas = l.notificacao?.datasEspecificadas?.length ?? 0;
      const cron = cronEquivalente(l.recorrencia, l.notificacao?.horario, especificadas > 0);
      return {
        id: l.uuid,
        label: l.titulo,
        cron,
        noCron: cron === SEM_CRON,
        cor: l.categoria?.cor ?? 'currentColor',
        concluido: l.status === 'CONCLUIDO',
      };
    }),
  );

  /** O card do momento 1 em lista de um item: trocar de lembrete renasce o card e anima. */
  protected readonly cardAtual = computed(() => {
    const alvo = this.selected();
    return alvo ? [alvo] : [];
  });

  protected readonly datas = computed<DataVm[]>(() => {
    const alvo = this.selected();
    if (!alvo) return [];
    const agora = new Date();
    const lista = paraDatas(alvo.proximasExecucoes).slice(0, this.occurrenceCount());
    // Série de minutos ou horas repete o dia: aí a hora é o que diferencia.
    const mesmoDia = lista.length > 1 && diaMes(lista[0]) === diaMes(lista[1]);

    return lista.map((d, i) => ({
      n: dois(i + 1),
      dia: diaMes(d),
      detalhe: mesmoDia ? `${diaSemanaCurto(d)} · ${hora(d)}` : diaSemanaLongo(d),
      gap: i === 0 ? faltaPara(d, agora) : intervaloEntre(lista[i - 1], d),
      first: i === 0,
    }));
  });

  protected readonly resumoSelecionado = computed(() => {
    const alvo = this.selected();
    if (!alvo) return '';
    const especificadas = alvo.notificacao?.datasEspecificadas?.length ?? 0;
    return resumoRecorrencia(alvo.recorrencia, alvo.notificacao?.horario, especificadas);
  });

  // ---- momento 2: chat e JSON ----------------------------------------------

  /** Como a IA entendeu a frase, em português, para a bolha de resposta. */
  protected readonly resumoRascunho = computed(() => {
    const r = this.rascunho()?.lembrete;
    if (!r) return '';
    const especificadas = r.notificacao?.datasEspecificadas?.length ?? 0;
    return resumoRecorrencia(r.recorrencia, r.notificacao?.horario, especificadas);
  });

  /** A conversa já começou: as sugestões só aparecem antes da primeira frase. */
  protected readonly conversaIniciada = computed(
    () => !!this.rascunho() || !!this.recemCriado() || (this.enviando() && !!this.fraseEnviada()),
  );

  private readonly esqueleto = linhasJson({ lembrete: EXEMPLO_RASCUNHO, proximasExecucoes: [] });

  /**
   * O painel do JSON tem três estados: o esqueleto esperando a frase, o
   * rascunho que a IA montou (nada salvo) e a resposta do 201 depois de criar.
   */
  protected readonly painel = computed<{
    rotulo: string;
    status: string;
    tom: TomPainel;
    linhas: LinhaJson[];
    apagado: boolean;
  }>(() => {
    const criado = this.recemCriado();
    if (criado)
      return { rotulo: 'resposta da API', status: '201 Created', tom: 'criado', linhas: linhasJson(criado), apagado: false };
    const rascunho = this.rascunho();
    if (rascunho)
      return { rotulo: 'o que a IA entendeu', status: 'rascunho · não salvo', tom: 'rascunho', linhas: linhasJson(rascunho), apagado: false };
    return { rotulo: 'o que a IA entendeu', status: 'aguardando frase', tom: 'neutro', linhas: this.esqueleto, apagado: true };
  });

  /** Muda a cada resposta nova, para as linhas do JSON renascerem animadas. */
  protected readonly versaoPainel = computed(() =>
    this.recemCriado() ? 2 : this.rascunho() ? 1 : 0,
  );

  /**
   * A edição vai reagendar?  /**
   * A edição vai reagendar? Reativo, para o aviso aparecer enquanto o usuário
   * mexe, e não só depois de salvar.
   */
  protected readonly vaiReagendar = computed(() => {
    const original = this.estadoOriginal();
    return !!original && !!this.editandoId() && mudouAgendamento(original, this.estadoAtual());
  });

  /** Reagendar devolve um lembrete concluído para pendente — vale avisar. */
  protected readonly vaiReabrir = computed(
    () => this.vaiReagendar() && this.selected()?.status === 'CONCLUIDO',
  );

  /**
   * O que impede salvar, em texto — vazio quando está tudo certo.
   *
   * O domínio ainda eleva um intervalo curto para o mínimo, mas isso é rede de
   * segurança: mudar o valor do usuário sem avisar é o mesmo defeito que
   * reescrever a política de feriado em silêncio. Aqui a tela recusa e explica.
   */
  protected readonly impedimento = computed(() => {
    if (this.fEstrategia() !== 'intervalo' || this.fUnidade() !== 'minutos') return '';
    const passo = Number(this.fPasso());
    return Number.isFinite(passo) && passo >= INTERVALO_MINIMO_MINUTOS
      ? ''
      : `o intervalo mínimo é de ${INTERVALO_MINIMO_MINUTOS} minutos`;
  });

  protected readonly rotuloAvisos = computed(() => {
    switch (this.permissaoAviso()) {
      case 'granted':
        return 'avisos do navegador ligados';
      case 'denied':
        return 'o navegador bloqueou os avisos deste site — libere nas permissões dele';
      default:
        return 'avisar no navegador quando um lembrete disparar';
    }
  });

  /** Em 400 a mensagem raiz é genérica; os campos inválidos dizem mais. */
  protected readonly mensagemFalha = computed(() => {
    const f = this.falha();
    if (!f) return '';
    return resumoDosCampos(f.campos) || f.mensagem;
  });

  protected readonly erroDe = computed(() => this.falha()?.campos ?? {});

  /** Categoria que já vale para o lembrete alvo, ou `null` quando não há alvo. */
  protected readonly idCategoriaAlvo = computed(() => this.categoriaAlvo()?.categoria.id ?? null);

  /**
   * Cada cor da paleta com o aviso de quem já a ocupa.
   *
   * `cor` é única por visitante, então uma cor gasta não é uma opção — e a cor
   * atual da categoria em edição continua livre para ela mesma, senão salvar sem
   * trocar a cor viraria conflito consigo.
   */
  protected readonly paleta = computed(() => {
    const usadas = this.store.coresUsadas();
    const propria = this.catCor().toUpperCase();
    return PALETA.map(c => ({
      ...c,
      ocupada: usadas.has(c.hex) && c.hex !== propria,
    }));
  });

  /** Sem cor livre não há como criar: a unicidade limita a lista à paleta. */
  protected readonly paletaEsgotada = computed(() => this.paleta().every(c => c.ocupada));

  /**
   * Apagar a última categoria deixa o visitante sem conseguir criar lembrete —
   * `categoriaId` é obrigatório. O backend permite; a tela não oferece.
   */
  protected readonly podeExcluirCategoria = computed(() => this.categorias().length > 1);

  /** O que impede salvar a categoria, em texto — vazio quando está tudo certo. */
  protected readonly impedimentoCategoria = computed(() => {
    const nome = this.catNome().trim();
    if (!nome) return 'dê um nome à categoria';
    if (nome.length > MAX_NOME_CATEGORIA)
      return `o nome cabe em ${MAX_NOME_CATEGORIA} caracteres`;
    if (!this.catCor()) return 'escolha uma cor';
    return '';
  });

  /**
   * Os erros das rotas de categoria em português da tela.
   *
   * O 422 é o caso que obriga: a mensagem do servidor vem quebrada ("Erro ao
   * remover item. 
Detalhes...") e é um defeito conhecido do backend. Mostrar
   * o texto dele seria repassar o defeito ao visitante.
   */
  protected readonly falhaCategoria = computed(() => {
    const f = this.falha();
    if (!f) return '';
    switch (f.status) {
      case 422:
        return 'Esta categoria ainda está sendo usada por algum lembrete. Troque a categoria dele primeiro.';
      case 409:
        return 'Você já tem uma categoria com essa cor. Escolha outra.';
      case 404:
        return 'Esta categoria não existe mais nesta sessão.';
      default:
        return resumoDosCampos(f.campos) || f.mensagem;
    }
  });

  /**
   * Lido da lista, não guardado: depois do PATCH o lembrete é substituído em
   * memória, e uma cópia congelada aqui mostraria a categoria antiga.
   */
  protected readonly categoriaAlvo = computed<Lembrete | null>(
    () => this.lembretes().find(l => l.uuid === this.categoriaAlvoId()) ?? null,
  );

  ngOnInit(): void {
    this.funil.registrar('agendador_aberto');
    this.notificacoes.aoReceber = titulo => this.alertarDisparo(titulo);
    // O servidor não guarda o que disparou com o stream fora; relistar ao menos
    // traz status e próximas execuções atualizados.
    this.notificacoes.aoReconectar = () => void this.store.recarregar();
    void this.store.iniciar().then(() => {
      this.selecionarPrimeiro();
      this.notificacoes.conectar();
    });
  }

  /**
   * Monta o texto do aviso do sistema.
   *
   * O SSE manda **só o título**, então o cruzamento com a lista em memória é
   * por título: se houver dois lembretes com o mesmo nome, pode pegar o outro.
   * O texto genérico cobre o caso de não achar. A correção definitiva é o
   * stream mandar o `uuid` junto — está anotado como pedido ao backend.
   */
  private alertarDisparo(titulo: string): void {
    const alvo = this.lembretes().find(l => l.titulo === titulo);
    const corpo = alvo
      ? `${alvo.categoria.nome} · ${resumoRecorrencia(
          alvo.recorrencia,
          alvo.notificacao?.horario,
          alvo.notificacao?.datasEspecificadas?.length ?? 0,
        )}`
      : 'seu lembrete disparou agora';

    void this.alerta.avisar(titulo, corpo);
  }

  /** O pedido de permissão precisa nascer de um clique — ver AlertaService. */
  protected async ativarAvisos(): Promise<void> {
    const resultado = await this.alerta.pedirPermissao();
    this.funil.registrar('avisos_permissao', { resultado });
  }

  // ---- momento 1: seleção ---------------------------------------------------

  protected select(id: string): void {
    this.selectedId.set(id);
    this.confirmandoExclusao.set(false);
  }

  // ---- troca de momento ----------------------------------------------------

  /**
   * O "+": o card e a lista saem para a direita e só então o chat entra. Com
   * movimento reduzido, troca na hora.
   */
  protected irParaChat(): void {
    if (this.momento() === 2 || this.saindo()) return;
    this.confirmandoExclusao.set(false);
    if (prefereMenosMovimento()) {
      this.momento.set(2);
      return;
    }
    this.saindo.set(true);
    this.timerSaida = setTimeout(() => {
      this.saindo.set(false);
      this.momento.set(2);
      this.timerSaida = null;
    }, SAIDA_MS);
  }

  /**
   * Volta aos lembretes. Se um lembrete acabou de nascer, ele volta
   * selecionado; um rascunho não confirmado é descartado — nada foi salvo.
   */
  protected voltarAosLembretes(): void {
    const criado = this.recemCriado();
    this.store.descartarRascunho();
    this.store.limparFalha();
    this.draft.set('');
    if (criado) this.select(criado.uuid);
    this.momento.set(1);
  }

  // ---- criação por frase: interpretar, revisar, criar ----------------------

  protected async enviarFrase(): Promise<void> {
    const frase = this.draft().trim();
    if (!frase || this.enviando() || this.noLimite()) return;

    this.store.fraseDoRascunho.set(frase);
    const rascunho = await this.store.interpretar(frase);
    if (rascunho) this.draft.set('');
  }

  /** Confirma o rascunho: o mesmo JSON vai para o POST /lembrete. */
  protected async criarDoRascunho(): Promise<void> {
    const novo = await this.store.confirmarRascunho();
    if (novo) this.select(novo.uuid);
  }

  /** Abre o formulário preenchido com o rascunho, para ajustar antes de criar. */
  protected ajustarNoFormulario(): void {
    const rascunho = this.rascunho();
    if (!rascunho) return;
    this.store.limparFalha();
    this.editandoId.set(null);
    this.aplicarEstado(entradaParaFormulario(rascunho.lembrete));
    this.estadoOriginal.set(null);
    this.formAberto.set(true);
  }

  protected usarSugestao(frase: string): void {
    this.draft.set(frase);
    this.funil.registrar('sugestao_usada', { frase });
  }

  protected onKeydown(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      void this.enviarFrase();
    }
  }

  /** A alça e a dica levam ao artigo; a alça vai direto ao anúncio no fim dele. */
  protected rolarPara(id: 'rp-artigo' | 'rp-rotafin', evento?: Event): void {
    evento?.preventDefault();
    const alvo = this.host.nativeElement.querySelector(`#${id}`);
    alvo?.scrollIntoView({ behavior: prefereMenosMovimento() ? 'auto' : 'smooth', block: 'start' });
  }

  // ---- ações sobre um lembrete --------------------------------------------

  /**
   * O ✓ do card conclui o lembrete. A revisão das datas, que antes ele fazia,
   * passou para o rascunho do chat — lá é que a pessoa confere antes de salvar.
   */
  protected async concluirLembrete(id: string): Promise<void> {
    await this.store.concluir(id);
  }

  protected async excluir(): Promise<void> {
    const alvo = this.selected();
    if (!alvo) return;
    await this.store.excluir(alvo.uuid);
    this.confirmandoExclusao.set(false);
    this.selecionarPrimeiro();
  }

  // ---- formulário ----------------------------------------------------------

  protected abrirFormulario(): void {
    if (this.noLimite() || this.semCategorias()) return;
    this.store.limparFalha();
    this.editandoId.set(null);
    const inicial = { ...FORMULARIO_VAZIO, categoriaId: this.categorias()[0]?.id ?? null };
    this.aplicarEstado(inicial);
    this.estadoOriginal.set(null);
    this.formAberto.set(true);
  }

  /** Abre o mesmo formulário preenchido com o lembrete do card. */
  protected abrirEdicao(): void {
    const alvo = this.selected();
    if (!alvo) return;
    this.store.limparFalha();
    this.editandoId.set(alvo.uuid);
    const original = paraFormulario(alvo);
    this.aplicarEstado(original);
    this.estadoOriginal.set(original);
    this.formAberto.set(true);
  }

  protected fecharFormulario(): void {
    this.formAberto.set(false);
    this.editandoId.set(null);
    this.estadoOriginal.set(null);
  }

  protected alternarDia(dia: DiaSemana): void {
    this.fDiasSemana.update(atual =>
      atual.includes(dia) ? atual.filter(d => d !== dia) : [...atual, dia],
    );
  }

  /**
   * Escolhe o verbo pelo que mudou: mexer só em texto ou categoria vai de
   * `PATCH /detalhes`, que preserva a série e o status. `PUT` só quando o
   * agendamento mudou, porque ele recalcula os disparos e reabre concluídos.
   */
  protected async salvarFormulario(): Promise<void> {
    if (this.enviando() || this.impedimento()) return;

    const estado = this.estadoAtual();
    const emEdicao = this.editandoId();
    let salvo: Lembrete | null;

    if (!emEdicao) {
      salvo = await this.store.criarPorFormulario(paraEntrada(estado));
    } else if (this.vaiReagendar()) {
      salvo = await this.store.atualizar(emEdicao, paraEntrada(estado));
    } else {
      salvo = await this.store.atualizarDetalhes(emEdicao, paraDetalhes(estado));
    }

    if (!salvo) return;
    this.fecharFormulario();
    this.select(salvo.uuid);
    // Criado a partir do rascunho do chat ("ajustar no formulário"): o
    // rascunho cumpriu o papel e a tela volta aos lembretes.
    if (!emEdicao && this.momento() === 2) {
      this.store.descartarRascunho();
      this.momento.set(1);
    }
  }

  private estadoAtual(): EstadoFormulario {
    return {
      titulo: this.fTitulo(),
      descricao: this.fDescricao(),
      categoriaId: this.fCategoria(),
      estrategia: this.fEstrategia(),
      passo: this.fPasso(),
      unidade: this.fUnidade(),
      diasSemana: this.fDiasSemana(),
      posicaoMes: this.fPosicaoMes(),
      diasMes: this.fDiasMes(),
      horario: this.fHorario(),
      politica: this.fPolitica(),
      quantidade: this.fQuantidade(),
    };
  }

  private aplicarEstado(estado: EstadoFormulario): void {
    this.fTitulo.set(estado.titulo);
    this.fDescricao.set(estado.descricao);
    this.fCategoria.set(estado.categoriaId);
    this.fEstrategia.set(estado.estrategia);
    this.fPasso.set(estado.passo);
    this.fUnidade.set(estado.unidade);
    this.fDiasSemana.set(estado.diasSemana);
    this.fPosicaoMes.set(estado.posicaoMes);
    this.fDiasMes.set(estado.diasMes);
    this.fHorario.set(estado.horario);
    this.fPolitica.set(estado.politica);
    this.fQuantidade.set(estado.quantidade);
  }

  // ---- funil ---------------------------------------------------------------

  protected irParaSimulador(origem: OrigemSaida): void {
    const atual = this.convite();
    this.funil.registrarSaida(origem, atual ? { motivo: atual.motivo } : {});
  }

  /** Lua no claro, sol no escuro: o botão mostra para onde vai, não onde está. */
  protected alternarTema(): void {
    const proximo = oposto(this.temaAtivo());
    this.temaEscolhido.set(proximo);
    salvarTema(proximo);
    this.funil.registrar('tema_alternado', { para: proximo });
  }

  // ---- categorias ----------------------------------------------------------

  /**
   * Com `uuid`, o painel abre para escolher a categoria daquele lembrete; sem
   * ele, abre só para gerenciar a lista — que é o único caminho quando ainda
   * não existe lembrete nenhum.
   */
  protected abrirCategorias(uuid: string | null = null): void {
    this.store.limparFalha();
    this.categoriaAlvoId.set(uuid);
    this.catEditorAberto.set(false);
    this.categoriasAberto.set(true);
  }

  protected fecharCategorias(): void {
    this.categoriasAberto.set(false);
    this.categoriaAlvoId.set(null);
    this.catEditorAberto.set(false);
  }

  /**
   * Troca a categoria do lembrete pelo `PATCH /detalhes`: preserva a série e o
   * status, ao contrário do `PUT`. Título e descrição vão como o servidor os
   * tem — este caminho não passa pelo formulário e não deve inventar texto.
   */
  protected async escolherCategoria(categoria: Categoria): Promise<void> {
    const alvo = this.categoriaAlvo();
    if (!alvo || this.enviando()) return;

    if (categoria.id === alvo.categoria.id) {
      this.fecharCategorias();
      return;
    }

    const salvo = await this.store.atualizarDetalhes(alvo.uuid, {
      titulo: alvo.titulo,
      descricao: alvo.descricao,
      categoriaId: categoria.id,
    });
    if (salvo) this.fecharCategorias();
  }

  /** O clique na linha: escolher, quando há lembrete alvo; editar, quando não há. */
  protected acionarCategoria(categoria: Categoria): void {
    if (this.categoriaAlvo()) void this.escolherCategoria(categoria);
    else this.editarCategoria(categoria);
  }

  protected novaCategoria(): void {
    if (this.paletaEsgotada()) return;
    this.store.limparFalha();
    this.catEditandoId.set(null);
    this.catNome.set('');
    this.catCor.set(this.paleta().find(c => !c.ocupada)?.hex ?? '');
    this.catEditorAberto.set(true);
  }

  protected editarCategoria(categoria: Categoria): void {
    this.store.limparFalha();
    this.catEditandoId.set(categoria.id);
    this.catNome.set(categoria.nome);
    this.catCor.set(categoria.cor);
    this.catEditorAberto.set(true);
  }

  protected fecharEditorCategoria(): void {
    this.catEditorAberto.set(false);
    this.store.limparFalha();
  }

  /**
   * `fatorOrdem` vai sempre explícito: omitir manda zero, e zero colide com
   * quem já estiver lá. Ao criar, a categoria entra no fim da lista; ao editar,
   * mantém a posição que tinha — a tela não reordena, porque trocar duas
   * posições sob índice único exige um valor temporário e três chamadas.
   */
  protected async salvarCategoria(): Promise<void> {
    if (this.enviando() || this.impedimentoCategoria()) return;

    const id = this.catEditandoId();
    const atual = id === null ? null : this.categorias().find(c => c.id === id);
    const entrada = {
      nome: this.catNome().trim(),
      cor: this.catCor(),
      fatorOrdem: atual ? atual.fatorOrdem : this.store.proximaOrdem(),
    };

    const salva =
      id === null
        ? await this.store.criarCategoria(entrada)
        : await this.store.atualizarCategoria(id, entrada);

    if (!salva) return;
    this.catEditorAberto.set(false);
    // Criada a partir da tela travada (sem categoria nenhuma), o formulário de
    // lembrete precisa nascer apontando para ela.
    if (this.fCategoria() === null) this.fCategoria.set(salva.id);
  }

  protected async removerCategoria(categoria: Categoria): Promise<void> {
    if (this.enviando() || !this.podeExcluirCategoria()) return;
    await this.store.excluirCategoria(categoria.id);
  }

  protected dispensarConvite(): void {
    this.store.dispensarConvite();
  }

  protected dispensarAviso(aviso: Aviso): void {
    this.notificacoes.dispensar(aviso.id);
  }

  protected limparFalha(): void {
    this.store.limparFalha();
  }

  // ---- eventos globais -----------------------------------------------------

  @HostListener('window:resize')
  protected onResize(): void {
    this.isMobile.set(window.innerWidth < 640);
  }

  @HostListener('window:scroll')
  protected onScroll(): void {
    this.maisCompacto.set(window.scrollY > 40);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.catEditorAberto()) this.fecharEditorCategoria();
    else if (this.categoriasAberto()) this.fecharCategorias();
    else if (this.formAberto()) this.fecharFormulario();
    else if (this.confirmandoExclusao()) this.confirmandoExclusao.set(false);
  }

  ngOnDestroy(): void {
    if (this.timerSaida) clearTimeout(this.timerSaida);
  }

  private selecionarPrimeiro(): void {
    this.selectedId.set(this.lembretes()[0]?.uuid ?? null);
  }


}

function prefereMenosMovimento(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
