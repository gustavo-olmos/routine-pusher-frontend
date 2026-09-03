import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CategoriaService, LembreteService, SessaoService } from '../api/lembrete.service';
import { Falha, normalizarFalha } from '../api/erros';
import { Categoria, Lembrete, LembreteEntrada, Sessao } from '../api/modelos';
import { FunilService } from '../funil/funil.service';
import {
  GATILHO_CATEGORIA,
  GATILHO_FRASE,
  LIMITE_IA,
  LIMITE_LEMBRETES,
} from '../lembretes.config';

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

  /** uuid do último lembrete criado, para a tela focar nele. */
  readonly recemCriado = signal<string | null>(null);

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
    return this.criar(
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
    return this.criar(
      () => this.lembreteApi.criar(entrada),
      novo => {
        this.funil.registrar('lembrete_criado_form', { categoria: novo.categoria?.nome });
        this.avaliarConvite(novo, novo.titulo);
      },
    );
  }

  async concluir(uuid: string): Promise<void> {
    await this.mutar(() => this.lembreteApi.concluir(uuid), 'lembrete_concluido');
  }

  async excluir(uuid: string): Promise<void> {
    await this.mutar(() => this.lembreteApi.excluir(uuid), 'lembrete_excluido');
  }

  limparFalha(): void {
    this.falha.set(null);
  }

  dispensarConvite(): void {
    const atual = this.convite();
    if (atual) this.funil.registrar('convite_simulador_dispensado', { motivo: atual.motivo });
    this.convite.set(null);
  }

  private async criar(
    chamada: () => import('rxjs').Observable<Lembrete>,
    aoCriar: (novo: Lembrete) => void,
  ): Promise<Lembrete | null> {
    if (this.enviando()) return null;
    this.enviando.set(true);
    this.falha.set(null);
    try {
      const novo = await firstValueFrom(chamada());
      // Relista em vez de dar push: a ordenação é do servidor, e emular a regra
      // aqui é a receita para a lista pular de posição no próximo refresh.
      await this.recarregar();
      this.recemCriado.set(novo.uuid);
      aoCriar(novo);
      return novo;
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
   * Decide se o lembrete recém-criado merece o convite ao simulador. A categoria
   * "Casa" é o sinal do backend; a frase é o sinal do usuário.
   */
  private avaliarConvite(novo: Lembrete, textoOriginal: string): void {
    const porCategoria = novo.categoria?.nome === GATILHO_CATEGORIA;
    const porFrase = GATILHO_FRASE.test(textoOriginal) || GATILHO_FRASE.test(novo.titulo);
    if (!porCategoria && !porFrase) return;

    const motivo: MotivoConvite = porCategoria ? 'categoria' : 'frase';
    this.convite.set({ motivo, titulo: novo.titulo });
    this.funil.registrar('convite_simulador_visto', { motivo, titulo: novo.titulo });
  }
}
