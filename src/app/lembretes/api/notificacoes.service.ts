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

/** Espera antes de reabrir um stream que o servidor recusou; dobra até o teto. */
export const RECONEXAO_INICIAL_MS = 2_000;
export const RECONEXAO_TETO_MS = 60_000;

/**
 * Stream de notificações via SSE.
 *
 * Dois detalhes que quebram silenciosamente:
 * - `withCredentials` é obrigatório aqui também. Sem ele o EventSource não manda
 *   o cookie e o stream escuta a sessão errada — conecta, não dá erro, e nunca
 *   chega evento nenhum.
 * - `EventSource` roda fora do Angular. Escrever signal fora da zone não agenda
 *   detecção de mudança, então a tela não repinta; daí o `zone.run`.
 *
 * ## Reconexão
 *
 * O EventSource só reconecta sozinho quando a **rede** cai: o `onerror` chega
 * com `readyState` em `CONNECTING` e o navegador tenta de novo. Se o servidor
 * **responde** com status diferente de 200 — um 502/504 durante deploy, por
 * exemplo —, ele vai para `CLOSED` e desiste para sempre. Esse caso é nosso:
 * fechar, esperar com backoff e abrir uma fonte nova.
 *
 * O backend manda um comentário `:ping` ao abrir e a cada 20s, para proxies não
 * derrubarem a conexão ociosa. O EventSource ignora comentários, então
 * `onmessage` continua recebendo só títulos.
 *
 * O servidor não guarda replay: o que disparou com o stream fora se perdeu. Por
 * isso `aoReconectar`, chamado a cada abertura depois da primeira — a tela
 * relista e ao menos mostra o estado atual dos lembretes.
 */
@Injectable()
export class NotificacoesService {
  private readonly zone = inject(NgZone);

  private fonte: EventSource | null = null;
  private seq = 0;
  private temporizadores = new Set<ReturnType<typeof setTimeout>>();

  private religar: ReturnType<typeof setTimeout> | null = null;
  private espera = RECONEXAO_INICIAL_MS;
  private aberturas = 0;

  readonly avisos = signal<Aviso[]>([]);
  readonly conectado = signal(false);

  /**
   * Chamado a cada evento do stream, com o título cru.
   *
   * É um gancho em vez de uma chamada direta ao alerta porque o stream **só
   * manda o título** — quem sabe cruzar isso com o lembrete em memória e montar
   * um texto decente é a tela, não este serviço.
   */
  aoReceber: ((titulo: string) => void) | null = null;

  /**
   * Chamado quando o stream volta depois de ter caído — por rede ou por
   * reconexão nossa. Nunca na primeira abertura: aí a lista acabou de carregar.
   */
  aoReconectar: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.desconectar());
  }

  conectar(): void {
    if (this.fonte || this.religar || typeof EventSource === 'undefined') return;
    this.abrir();
  }

  desconectar(): void {
    this.fonte?.close();
    this.fonte = null;
    if (this.religar) clearTimeout(this.religar);
    this.religar = null;
    this.espera = RECONEXAO_INICIAL_MS;
    this.aberturas = 0;
    this.conectado.set(false);
    this.temporizadores.forEach(clearTimeout);
    this.temporizadores.clear();
  }

  private abrir(): void {
    // Fora da zone: um stream aberto dispara tarefas sem parar e, dentro da
    // zone, deixaria o Angular em detecção de mudança perpétua.
    this.zone.runOutsideAngular(() => {
      const fonte = new EventSource(`${API_V1}/notificar/sse`, { withCredentials: true });
      this.fonte = fonte;

      fonte.onopen = () => this.zone.run(() => this.aoAbrir());
      fonte.onmessage = evento => this.zone.run(() => this.receber(evento.data));
      fonte.onerror = () => this.zone.run(() => this.aoFalhar(fonte));
    });
  }

  private aoAbrir(): void {
    this.conectado.set(true);
    this.espera = RECONEXAO_INICIAL_MS;
    if (++this.aberturas > 1) this.aoReconectar?.();
  }

  private aoFalhar(fonte: EventSource): void {
    this.conectado.set(false);

    // CONNECTING: queda de rede, o navegador já está tentando de novo.
    // Fonte diferente da atual: evento atrasado de uma que já descartamos.
    if (fonte !== this.fonte || fonte.readyState !== EventSource.CLOSED) return;

    fonte.close();
    this.fonte = null;

    const espera = this.espera;
    this.espera = Math.min(espera * 2, RECONEXAO_TETO_MS);
    // Fora da zone pelo mesmo motivo do stream: um timer pendente de até 60s
    // deixaria a aplicação "instável" para o Angular o tempo todo.
    this.zone.runOutsideAngular(() => {
      this.religar = setTimeout(() => {
        this.religar = null;
        this.abrir();
      }, espera);
    });
  }

  dispensar(id: number): void {
    this.avisos.update(lista => lista.filter(a => a.id !== id));
  }

  private receber(dado: string): void {
    const titulo = (dado ?? '').trim();
    if (!titulo) return;

    const aviso: Aviso = { id: ++this.seq, titulo, em: new Date() };
    this.avisos.update(lista => [...lista, aviso].slice(-MAX_VISIVEIS));

    this.aoReceber?.(titulo);

    const t = setTimeout(() => {
      this.temporizadores.delete(t);
      this.dispensar(aviso.id);
    }, MS_NA_TELA);
    this.temporizadores.add(t);
  }
}
