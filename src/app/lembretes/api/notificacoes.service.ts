import { DestroyRef, Injectable, NgZone, inject, signal } from '@angular/core';

import { API_V1 } from '../lembretes.config';

export interface Aviso {
  id: number;
  /** Cada evento do stream é o título do lembrete que disparou. */
  titulo: string;
  em: Date;
}

/** Quantos avisos ficam empilhados na tela antes de os antigos saírem. */
const MAX_VISIVEIS = 3;
const MS_NA_TELA = 8_000;

/**
 * Stream de notificações via SSE.
 *
 * Dois detalhes que quebram silenciosamente:
 * - `withCredentials` é obrigatório aqui também. Sem ele o EventSource não manda
 *   o cookie e o stream escuta a sessão errada — conecta, não dá erro, e nunca
 *   chega evento nenhum.
 * - `EventSource` roda fora do Angular. Escrever signal fora da zone não agenda
 *   detecção de mudança, então a tela não repinta; daí o `zone.run`.
 */
@Injectable()
export class NotificacoesService {
  private readonly zone = inject(NgZone);

  private fonte: EventSource | null = null;
  private seq = 0;
  private temporizadores = new Set<ReturnType<typeof setTimeout>>();

  readonly avisos = signal<Aviso[]>([]);
  readonly conectado = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.desconectar());
  }

  conectar(): void {
    if (this.fonte || typeof EventSource === 'undefined') return;

    // Fora da zone: um stream aberto dispara tarefas sem parar e, dentro da
    // zone, deixaria o Angular em detecção de mudança perpétua.
    this.zone.runOutsideAngular(() => {
      const fonte = new EventSource(`${API_V1}/notificar/sse`, { withCredentials: true });
      this.fonte = fonte;

      fonte.onopen = () => this.zone.run(() => this.conectado.set(true));
      fonte.onmessage = evento => this.zone.run(() => this.receber(evento.data));
      // O próprio EventSource reconecta; só refletimos o estado.
      fonte.onerror = () => this.zone.run(() => this.conectado.set(false));
    });
  }

  desconectar(): void {
    this.fonte?.close();
    this.fonte = null;
    this.conectado.set(false);
    this.temporizadores.forEach(clearTimeout);
    this.temporizadores.clear();
  }

  dispensar(id: number): void {
    this.avisos.update(lista => lista.filter(a => a.id !== id));
  }

  private receber(dado: string): void {
    const titulo = (dado ?? '').trim();
    if (!titulo) return;

    const aviso: Aviso = { id: ++this.seq, titulo, em: new Date() };
    this.avisos.update(lista => [...lista, aviso].slice(-MAX_VISIVEIS));

    const t = setTimeout(() => {
      this.temporizadores.delete(t);
      this.dispensar(aviso.id);
    }, MS_NA_TELA);
    this.temporizadores.add(t);
  }
}
