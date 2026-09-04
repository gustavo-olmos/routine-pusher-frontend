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
  DIAS_SEMANA,
  DiaSemana,
  Lembrete,
  LembreteEntrada,
  PoliticaDiaUtil,
  RECORRENCIA_VAZIA,
} from '../api/modelos';
import { Aviso, NotificacoesService } from '../api/notificacoes.service';
import { SEM_CRON, cronEquivalente, resumoRecorrencia } from '../dominio/cron';
import {
  agoraLocalIso,
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
  LIMITE_LEMBRETES,
  MAX_DESCRICAO,
  MAX_FRASE,
  MAX_TITULO,
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
  completedNote: string;
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

/** As estratégias de recorrência são exclusivas; o formulário escolhe uma. */
type Estrategia = 'intervalo' | 'semana' | 'mes';
type Unidade = 'minutos' | 'horas' | 'dias';

/** Altura do card + gap do carrossel — precisa casar com o SCSS. */
const CARD_STEP = 364;

const dois = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'rp-routine-pusher',
  standalone: true,
  templateUrl: './routine-pusher.component.html',
  styleUrl: './routine-pusher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [NotificacoesService],
  host: { '[class.rp-dark]': 'temaAtivo() === "dark"' },
})
export class RoutinePusherComponent implements OnInit {
  private readonly store = inject(LembretesStore);
  private readonly funil = inject(FunilService);
  private readonly notificacoes = inject(NotificacoesService);

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

  protected readonly lembretes = this.store.lembretes;
  protected readonly categorias = this.store.categorias;
  protected readonly carregando = this.store.carregando;
  protected readonly enviando = this.store.enviando;
  protected readonly falha = this.store.falha;
  protected readonly convite = this.store.convite;
  protected readonly vazio = this.store.vazio;
  protected readonly noLimite = this.store.noLimite;
  protected readonly restantes = this.store.restantes;
  protected readonly avisos = this.notificacoes.avisos;

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

  protected readonly trackShift = computed(() => `translateY(-${this.index() * CARD_STEP}px)`);

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
        completedNote: l.status === 'CONCLUIDO' ? 'concluído' : 'pendente',
        nextLine: temDatas
          ? `${dataCurta(datas[0])} · ${diaSemanaCurto(datas[0])}`
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

  protected readonly animation = computed(() => (this.tick() % 2 === 0 ? 'rpRiseA' : 'rpRiseB'));

  /** Em 400 a mensagem raiz é genérica; os campos inválidos dizem mais. */
  protected readonly mensagemFalha = computed(() => {
    const f = this.falha();
    if (!f) return '';
    return resumoDosCampos(f.campos) || f.mensagem;
  });

  protected readonly erroDe = computed(() => this.falha()?.campos ?? {});

  ngOnInit(): void {
    this.funil.registrar('agendador_aberto');
    void this.store.iniciar().then(() => {
      this.selecionarPrimeiro();
      this.notificacoes.conectar();
    });
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
    if (this.noLimite()) return;
    this.store.limparFalha();
    this.fCategoria.set(this.fCategoria() ?? this.categorias()[0]?.id ?? null);
    this.formAberto.set(true);
  }

  protected fecharFormulario(): void {
    this.formAberto.set(false);
  }

  protected alternarDia(dia: DiaSemana): void {
    this.fDiasSemana.update(atual =>
      atual.includes(dia) ? atual.filter(d => d !== dia) : [...atual, dia],
    );
  }

  protected async salvarFormulario(): Promise<void> {
    if (this.enviando()) return;
    const novo = await this.store.criarPorFormulario(this.montarEntrada());
    if (!novo) return;
    this.formAberto.set(false);
    this.limparFormulario();
    this.select(novo.uuid);
  }

  /**
   * Monta o corpo do POST a partir do formulário.
   *
   * Duas armadilhas moram aqui:
   * - os intervalos vão em `recorrencia`, nunca em `notificacao`;
   * - em recorrência por intervalo, `dataInicio` é o instante ATUAL, não o do
   *   primeiro disparo: quem soma o passo é o servidor. Somar aqui atrasaria o
   *   lembrete no dobro do intervalo.
   */
  protected montarEntrada(): LembreteEntrada {
    const estrategia = this.fEstrategia();
    const porIntervalo = estrategia === 'intervalo';
    const passo = Math.max(1, Number(this.fPasso()) || 1);
    const quantidade = Number(this.fQuantidade());

    return {
      titulo: this.fTitulo().trim(),
      descricao: this.fDescricao().trim() || null,
      categoriaId: this.fCategoria() as number,
      recorrencia: {
        ...RECORRENCIA_VAZIA,
        quantidade: Number.isFinite(quantidade) && quantidade > 0 ? quantidade : null,
        intervaloMinutos: porIntervalo && this.fUnidade() === 'minutos' ? passo : null,
        intervaloHoras: porIntervalo && this.fUnidade() === 'horas' ? passo : null,
        intervaloDias: porIntervalo && this.fUnidade() === 'dias' ? passo : null,
        posicaoDaSemanaNoMes: estrategia === 'semana' ? this.fPosicaoMes() : null,
        diasFixosNoMes: estrategia === 'mes' ? this.diasDoMes() : [],
        diasDaSemana: estrategia === 'semana' ? this.fDiasSemana() : [],
        politicaDiaUtil: porIntervalo ? null : this.fPolitica(),
      },
      notificacao: {
        metodo: ['pop-up'],
        horario: porIntervalo ? null : this.fHorario(),
        dataInicio: porIntervalo ? agoraLocalIso() : null,
        dataFim: null,
        datasEspecificadas: [],
      },
    };
  }

  /** "10, 25" -> [10, 25], descartando o que não é dia de mês válido. */
  private diasDoMes(): number[] {
    const numeros = this.fDiasMes()
      .split(/[^0-9]+/)
      .map(Number)
      .filter(n => n >= 1 && n <= 31);
    return [...new Set(numeros)].sort((a, b) => a - b);
  }

  private limparFormulario(): void {
    this.fTitulo.set('');
    this.fDescricao.set('');
    this.fDiasSemana.set([]);
    this.fDiasMes.set('');
    this.fPosicaoMes.set(null);
    this.fQuantidade.set('');
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
    if (this.formAberto()) this.formAberto.set(false);
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
