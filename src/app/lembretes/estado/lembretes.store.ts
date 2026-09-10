import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CategoriaService, LembreteService, SessaoService } from '../api/lembrete.service';
import { Falha, normalizarFalha } from '../api/erros';
import {
  Categoria,
  CategoriaEntrada,
  DetalhesEntrada,
  Lembrete,
  LembreteEntrada,
  Sessao,
} from '../api/modelos';
import { FunilService } from '../funil/funil.service';
import { GATILHO_FRASE, LIMITE_IA, LIMITE_LEMBRETES } from '../lembretes.config';

/** Por que o convite ao simulador apareceu — vira propriedade da métrica. */
export type MotivoConvite = 'categoria' | 'frase';

export interface Convite {
  motivo: MotivoConvite;
  titulo: string;
}

/**
 * Fonte única da tela. O componente só lê signals e chama métodos daqui;
 * nada de HTTP no componente.
 */
@Injectable()
export class LembretesStore {
  private readonly sessaoApi = inject(SessaoService);
  private readonly categoriaApi = inject(CategoriaService);
  private readonly lembreteApi = inject(LembreteService);
  private readonly funil = inject(FunilService);

  readonly sessao = signal<Sessao | null>(null);
  readonly categorias = signal<Categoria[]>([]);
  readonly lembretes = signal<Lembrete[]>([]);

  readonly carregando = signal(true);
  readonly enviando = signal(false);
  readonly falha = signal<Falha | null>(null);
  readonly convite = signal<Convite | null>(null);

  /**
   * Contagem local de chamadas de IA. É só uma dica para a interface avisar
   * antes de bater na parede — quem decide de verdade é o 429 do servidor.
   */
  readonly iaUsada = signal(0);

  readonly vazio = computed(() => !this.carregando() && this.lembretes().length === 0);
  readonly total = computed(() => this.lembretes().length);
  readonly restantes = computed(() => Math.max(0, LIMITE_LEMBRETES - this.total()));
  readonly noLimite = computed(() => this.total() >= LIMITE_LEMBRETES);
  readonly iaRestantes = computed(() => Math.max(0, LIMITE_IA - this.iaUsada()));

  /**
   * Sem categoria não há como criar lembrete: `categoriaId` é obrigatório e
   * precisa existir na lista do visitante. O backend deixa apagar a última, e
   * quem fizer isso fica travado — a tela precisa saber disso para desviar.
   */
  readonly semCategorias = computed(() => !this.carregando() && this.categorias().length === 0);

  /**
   * Próxima posição livre. `fatorOrdem` é único, e criar sem mandar um valor
   * explícito manda zero — o que colide na segunda categoria criada assim.
   */
  readonly proximaOrdem = computed(
    () => Math.max(0, ...this.categorias().map(c => c.fatorOrdem)) + 1,
  );

  /** Cores já gastas, normalizadas: o servidor compara com a caixa, a tela não. */
  readonly coresUsadas = computed(
    () => new Set(this.categorias().map(c => c.cor.toUpperCase())),
  );

  /** Abre a sessão e carrega o cenário. A sessão vem primeiro de propósito: */
  /** é a chamada que faz o servidor emitir o cookie que todas as outras usam. */
  async iniciar(): Promise<void> {
    this.carregando.set(true);
    try {
      this.sessao.set(await firstValueFrom(this.sessaoApi.obter()));
      const [categorias, lembretes] = await Promise.all([
        firstValueFrom(this.categoriaApi.listar()),
        firstValueFrom(this.lembreteApi.listar()),
      ]);
      this.categorias.set(categorias);
      this.lembretes.set(lembretes);
      this.falha.set(null);
    } catch (erro) {
      this.falha.set(normalizarFalha(erro));
    } finally {
      this.carregando.set(false);
    }
  }

  async recarregar(): Promise<void> {
    try {
      this.lembretes.set(await firstValueFrom(this.lembreteApi.listar()));
    } catch (erro) {
      this.falha.set(normalizarFalha(erro));
    }
  }

  /** O caminho principal: uma frase vira lembrete estruturado. */
  async criarPorFrase(frase: string): Promise<Lembrete | null> {
    return this.enviar(
      () => this.lembreteApi.criarPorFrase(frase),
      novo => {
        this.iaUsada.update(n => n + 1);
        this.funil.registrar('lembrete_criado_ia', {
          categoria: novo.categoria?.nome,
          caracteres: frase.length,
        });
        this.avaliarConvite(novo, frase);
      },
    );
  }

  async criarPorFormulario(entrada: LembreteEntrada): Promise<Lembrete | null> {
    return this.enviar(
      () => this.lembreteApi.criar(entrada),
      novo => {
        this.funil.registrar('lembrete_criado_form', { categoria: novo.categoria?.nome });
        this.avaliarConvite(novo, novo.titulo);
      },
    );
  }

  /**
   * Edição leve: título, descrição e categoria, sem tocar no agendamento.
   *
   * Substitui o lembrete em memória com a resposta em vez de relistar — o
   * servidor devolve o objeto completo, e relistar só abriria uma janela
   * mostrando estado velho.
   */
  async atualizarDetalhes(uuid: string, detalhes: DetalhesEntrada): Promise<Lembrete | null> {
    if (this.enviando()) return null;
    this.enviando.set(true);
    this.falha.set(null);
    try {
      const alterado = await firstValueFrom(this.lembreteApi.atualizarDetalhes(uuid, detalhes));
      this.lembretes.update(lista => lista.map(l => (l.uuid === uuid ? alterado : l)));
      this.funil.registrar('lembrete_editado', { escopo: 'detalhes' });
      return alterado;
    } catch (erro) {
      this.falha.set(normalizarFalha(erro));
      return null;
    } finally {
      this.enviando.set(false);
    }
  }

  /**
   * Edição com reagendamento. O `PUT` exige o corpo completo — mandar só o campo
   * alterado devolve 400 — e **reabre** um lembrete concluído.
   */
  async atualizar(uuid: string, entrada: LembreteEntrada): Promise<Lembrete | null> {
    return this.enviar(
      () => this.lembreteApi.atualizar(uuid, entrada),
      alterado =>
        this.funil.registrar('lembrete_editado', {
          escopo: 'agendamento',
          categoria: alterado.categoria?.nome,
        }),
    );
  }

  async concluir(uuid: string): Promise<void> {
    await this.mutar(() => this.lembreteApi.concluir(uuid), 'lembrete_concluido');
  }

  async excluir(uuid: string): Promise<void> {
    await this.mutar(() => this.lembreteApi.excluir(uuid), 'lembrete_excluido');
  }

  // ---- categorias ----------------------------------------------------------

  async criarCategoria(entrada: CategoriaEntrada): Promise<Categoria | null> {
    return this.escreverCategoria(() => this.categoriaApi.criar(entrada), 'categoria_criada');
  }

  /**
   * Relista os lembretes junto: cada um carrega uma **cópia** da categoria, e
   * sem isso o card continua exibindo o nome e a cor de antes da edição.
   */
  async atualizarCategoria(id: number, entrada: CategoriaEntrada): Promise<Categoria | null> {
    return this.escreverCategoria(
      () => this.categoriaApi.atualizar(id, entrada),
      'categoria_editada',
      true,
    );
  }

  /** `false` também quando o servidor recusa por haver lembretes associados (422). */
  async excluirCategoria(id: number): Promise<boolean> {
    const feito = await this.escreverCategoria(
      () => this.categoriaApi.excluir(id),
      'categoria_excluida',
    );
    return feito !== null;
  }

  limparFalha(): void {
    this.falha.set(null);
  }

  dispensarConvite(): void {
    const atual = this.convite();
    if (atual) this.funil.registrar('convite_simulador_dispensado', { motivo: atual.motivo });
    this.convite.set(null);
  }

  private async escreverCategoria<T>(
    chamada: () => import('rxjs').Observable<T>,
    evento: 'categoria_criada' | 'categoria_editada' | 'categoria_excluida',
    relistarLembretes = false,
  ): Promise<T | null> {
    if (this.enviando()) return null;
    this.enviando.set(true);
    this.falha.set(null);
    try {
      const resultado = await firstValueFrom(chamada());
      // A ordem é do servidor (`fatorOrdem`), então relista em vez de emendar
      // a lista em memória.
      this.categorias.set(await firstValueFrom(this.categoriaApi.listar()));
      if (relistarLembretes) await this.recarregar();
      this.funil.registrar(evento);
      return resultado;
    } catch (erro) {
      this.falha.set(normalizarFalha(erro));
      return null;
    } finally {
      this.enviando.set(false);
    }
  }

  private async enviar(
    chamada: () => import('rxjs').Observable<Lembrete>,
    aoConcluir: (resultado: Lembrete) => void,
  ): Promise<Lembrete | null> {
    if (this.enviando()) return null;
    this.enviando.set(true);
    this.falha.set(null);
    try {
      const resultado = await firstValueFrom(chamada());
      // Relista em vez de dar push: a ordenação é do servidor, e emular a regra
      // aqui é a receita para a lista pular de posição no próximo refresh.
      await this.recarregar();
      aoConcluir(resultado);
      return resultado;
    } catch (erro) {
      this.falha.set(normalizarFalha(erro));
      return null;
    } finally {
      this.enviando.set(false);
    }
  }

  private async mutar(
    chamada: () => import('rxjs').Observable<unknown>,
    evento: 'lembrete_concluido' | 'lembrete_excluido',
  ): Promise<void> {
    try {
      await firstValueFrom(chamada());
      // O PATCH responde vazio e o DELETE responde texto: em ambos os casos o
      // estado novo só existe no servidor.
      await this.recarregar();
      this.funil.registrar(evento);
    } catch (erro) {
      this.falha.set(normalizarFalha(erro));
    }
  }

  /**
   * Decide se o lembrete recém-criado merece o convite ao simulador.
   *
   * O gatilho por categoria era o nome fixo "Casa", de quando a lista era global
   * e do servidor. Com categorias criadas por cada visitante isso nunca mais
   * dispararia, então a mesma expressão passou a valer para o nome que ele
   * escolheu — "Financiamento" conta tanto quanto a frase.
   */
  private avaliarConvite(novo: Lembrete, textoOriginal: string): void {
    const porCategoria = GATILHO_FRASE.test(novo.categoria?.nome ?? '');
    const porFrase = GATILHO_FRASE.test(textoOriginal) || GATILHO_FRASE.test(novo.titulo);
    if (!porCategoria && !porFrase) return;

    const motivo: MotivoConvite = porCategoria ? 'categoria' : 'frase';
    this.convite.set({ motivo, titulo: novo.titulo });
    this.funil.registrar('convite_simulador_visto', { motivo, titulo: novo.titulo });
  }
}
