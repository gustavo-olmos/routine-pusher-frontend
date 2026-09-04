import { Injectable, isDevMode, signal } from '@angular/core';

import { SIMULADOR_URL } from '../lembretes.config';

/**
 * Eventos do funil. O agendador é isca: a única métrica que importa aqui é
 * quanta gente sai dele para o simulador, e por qual porta.
 */
export type EventoFunil =
  | 'agendador_aberto'
  | 'sugestao_usada'
  | 'lembrete_criado_ia'
  | 'lembrete_criado_form'
  | 'lembrete_concluido'
  | 'lembrete_excluido'
  | 'datas_confirmadas'
  | 'tema_alternado'
  | 'convite_simulador_visto'
  | 'convite_simulador_dispensado'
  | 'saida_simulador';

/** De onde partiu o clique que levou ao simulador. */
export type OrigemSaida = 'cabecalho' | 'convite_contextual' | 'rodape';

interface Registro {
  evento: EventoFunil;
  props: Record<string, unknown>;
  em: string;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

@Injectable()
export class FunilService {
  /** Espelho em memória — útil no console durante o desenvolvimento. */
  readonly trilha = signal<Registro[]>([]);

  registrar(evento: EventoFunil, props: Record<string, unknown> = {}): void {
    const registro: Registro = { evento, props, em: new Date().toISOString() };
    this.trilha.update(t => [...t, registro].slice(-50));

    // GTM/GA4 quando existir; enquanto não existir, o push some sem quebrar nada.
    if (typeof window !== 'undefined') {
      (window.dataLayer ??= []).push({ event: evento, ...props });
    }
    if (isDevMode()) console.debug('[funil]', evento, props);
  }

  /**
   * A saída para o simulador. Registrada ANTES da navegação, porque depois do
   * unload não há garantia de que o push chegue.
   */
  registrarSaida(origem: OrigemSaida, extra: Record<string, unknown> = {}): void {
    this.registrar('saida_simulador', { origem, destino: SIMULADOR_URL, ...extra });
  }
}
