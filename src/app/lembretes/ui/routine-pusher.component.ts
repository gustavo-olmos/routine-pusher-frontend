import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
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
  paraEntrada,
  paraFormulario,
} from '../dominio/formulario';
import {
  dataCurta,
  diaMes,
  diaSemanaCurto,
  diaSemanaLongo,
  diffDias,
  faltaPara,
  intervaloEntre,
  paraDatas,
} from '../dominio/datas';
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

interface Marca {
  left: string;
  active: boolean;
  label: string;
}

interface CardVm {
  id: string;
  label: string;
  cron: string;
  noCron: boolean;
  resumo: string;
  cor: string;
  categoria: string;
  concluido: boolean;
  nextLine: string;
  spanNote: string;
  ticks: Marca[];
}

interface ExecucaoVm {
  n: string;
  date: string;
  weekday: string;
  gap: string;
  first: boolean;
}

/** Gap entre os cards do carrossel — precisa casar com o `gap` do `.rp-track`. */
const GAP_CARDS = 24;

const dois = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'rp-routine-pusher',
  standalone: true,
  templateUrl: './routine-pusher.component.html',
  styleUrl: './routine-pusher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [NotificacoesService, AlertaService],
  host: { '[class.rp-dark]': 'temaAtivo() === "dark"' },
})
export class RoutinePusherComponent implements OnInit {
  private readonly store = inject(LembretesStore);
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
  protected readonly open = signal(false);
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
  /** Alterna o nome da animação para reexecutá-la a cada recálculo. */
  protected readonly tick = signal(0);

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

  /**
   * O deslocamento é horizontal e em porcentagem, não em pixels.
   *
   * Porcentagem em `transform` resolve contra a largura do próprio elemento, e
   * a trilha tem exatamente a largura do viewport — que é a largura de um card.
   * Assim o passo acompanha a tela sem constante mágica: a versão vertical
   * dependia de um `364` que era a altura fixa do card mais o gap, e qualquer
   * mudança no SCSS a desalinhava em silêncio.
   */
  protected readonly trackShift = computed(
    () => `translateX(calc(${this.index()} * (-100% - ${GAP_CARDS}px)))`,
  );

  protected readonly position = computed(() => {
    const total = this.lembretes().length;
    return total ? `${dois(this.index() + 1)} / ${dois(total)}` : '00 / 00';
  });

  protected readonly cards = computed<CardVm[]>(() => {
    const limite = this.occurrenceCount();
    const agora = new Date();

    return this.lembretes().map(l => {
      const datas = paraDatas(l.proximasExecucoes).slice(0, limite);
      const temDatas = datas.length > 0;
      const especificadas = l.notificacao?.datasEspecificadas?.length ?? 0;
      const cron = cronEquivalente(l.recorrencia, l.notificacao?.horario, especificadas > 0);

      return {
        id: l.uuid,
        label: l.titulo,
        cron,
        noCron: cron === SEM_CRON,
        resumo: resumoRecorrencia(l.recorrencia, l.notificacao?.horario, especificadas),
        cor: l.categoria?.cor ?? 'currentColor',
        categoria: l.categoria?.nome ?? '',
        concluido: l.status === 'CONCLUIDO',
        // Concluído passou a vir com proximasExecucoes vazio; a lista vazia já é
        // a verdade, mas o motivo dela muda o texto.
        nextLine: temDatas
          ? `${dataCurta(datas[0])} · ${diaSemanaCurto(datas[0])}`
          : l.status === 'CONCLUIDO'
            ? 'concluído — não dispara mais'
            : 'sem data prevista',
        spanNote: temDatas ? `· janela de ${diffDias(datas[datas.length - 1], agora)} dias` : '',
        ticks: this.montarMarcas(datas),
      };
    });
  });

  protected readonly execucoes = computed<ExecucaoVm[]>(() => {
    const alvo = this.selected();
    if (!alvo) return [];
    const agora = new Date();
    const datas = paraDatas(alvo.proximasExecucoes).slice(0, this.occurrenceCount());

    return datas.map((d, i) => ({
      n: dois(i + 1),
      date: dataCurta(d),
      weekday: diaSemanaLongo(d),
      gap: i === 0 ? faltaPara(d, agora) : intervaloEntre(datas[i - 1], d),
      first: i === 0,
    }));
  });

  protected readonly detalheResumo = computed(() => {
    const alvo = this.selected();
    if (!alvo) return '';
    const especificadas = alvo.notificacao?.datasEspecificadas?.length ?? 0;
    return resumoRecorrencia(alvo.recorrencia, alvo.notificacao?.horario, especificadas);
  });

  /**
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

  protected readonly animation = computed(() => (this.tick() % 2 === 0 ? 'rpRiseA' : 'rpRiseB'));

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

  // ---- carrossel -----------------------------------------------------------

  protected select(id: string): void {
    this.selectedId.set(id);
    this.tick.update(t => t + 1);
  }

  protected step(delta: number): void {
    const lista = this.lembretes();
    if (!lista.length) return;
    const proximo = (this.index() + delta + lista.length) % lista.length;
    this.select(lista[proximo].uuid);
  }

  protected abrirDetalhe(id: string): void {
    this.selectedId.set(id);
    this.open.set(true);
    this.tick.update(t => t + 1);
  }

  protected fecharDetalhe(): void {
    this.open.set(false);
  }

  // ---- criação por frase (o caminho principal) -----------------------------

  protected async enviarFrase(): Promise<void> {
    const frase = this.draft().trim();
    if (!frase || this.enviando() || this.noLimite()) return;

    const novo = await this.store.criarPorFrase(frase);
    if (!novo) return;

    this.draft.set('');
    this.select(novo.uuid);
    // Abre o detalhe na hora: ver a frase virar datas concretas é o momento
    // que prende o visitante — esconder isso atrás de um clique desperdiça.
    this.open.set(true);
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

  // ---- ações sobre um lembrete --------------------------------------------

  /**
   * O ✓ é aceite das datas, não conclusão do lembrete: o visitante está dizendo
   * "sim, era isso que eu queria". Não chama a API — só fecha. Vale como métrica
   * porque é o sinal mais direto de que a leitura da frase pela IA acertou.
   */
  protected confirmarDatas(): void {
    const alvo = this.selected();
    this.funil.registrar('datas_confirmadas', {
      titulo: alvo?.titulo,
      execucoes: alvo?.proximasExecucoes?.length ?? 0,
    });
    this.open.set(false);
  }

  /** Concluir mora na lista, não no detalhe: o painel é para inspecionar datas. */
  protected async concluirLembrete(id: string): Promise<void> {
    await this.store.concluir(id);
    this.tick.update(t => t + 1);
  }

  protected async excluir(): Promise<void> {
    const alvo = this.selected();
    if (!alvo) return;
    await this.store.excluir(alvo.uuid);
    this.open.set(false);
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

  /** Abre o mesmo formulário preenchido com o lembrete aberto no detalhe. */
  protected abrirEdicao(): void {
    const alvo = this.selected();
    if (!alvo) return;
    this.store.limparFalha();
    this.editandoId.set(alvo.uuid);
    const original = paraFormulario(alvo);
    this.aplicarEstado(original);
    this.estadoOriginal.set(original);
    this.open.set(false);
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

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.catEditorAberto()) this.fecharEditorCategoria();
    else if (this.categoriasAberto()) this.fecharCategorias();
    else if (this.formAberto()) this.fecharFormulario();
    else this.open.set(false);
  }

  private selecionarPrimeiro(): void {
    this.selectedId.set(this.lembretes()[0]?.uuid ?? null);
  }

  private montarMarcas(datas: Date[]): Marca[] {
    if (!datas.length) return [];
    const inicio = datas[0].getTime();
    const janela = Math.max(1, datas[datas.length - 1].getTime() - inicio);
    let anterior = -100;

    return datas.map((d, i) => {
      // Proporcional ao intervalo real, mas sem deixar dois rótulos colarem:
      // em séries de minutos as datas quase coincidem no eixo.
      let pct = datas.length === 1 ? 50 : 4 + ((d.getTime() - inicio) / janela) * 92;
      if (pct - anterior < 15) pct = anterior + 15;
      anterior = pct;
      return { left: `${Math.min(97, pct).toFixed(2)}%`, active: i === 0, label: diaMes(d) };
    });
  }
}
