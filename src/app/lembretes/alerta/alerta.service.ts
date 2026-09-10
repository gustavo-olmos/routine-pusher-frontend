import { Injectable, signal } from '@angular/core';

/**
 * O aviso que sai da tela: som e notificação do sistema operacional.
 *
 * O toast visual continua onde estava (`.rp-aviso`); isto é o que alcança quem
 * não está olhando para a aba.
 *
 * ## O que funciona onde
 *
 * - **Desktop** (Chrome, Firefox, Edge, Safari): `new Notification()` bastaria,
 *   mas usamos o mesmo caminho do Android para não manter duas implementações.
 * - **Android**: o construtor `new Notification()` **lança** "Illegal
 *   constructor". Só `ServiceWorkerRegistration.showNotification()` funciona —
 *   daí o worker mínimo em `rp-notificacoes-sw.js`.
 * - **iPhone**: `window.Notification` não existe numa aba comum do Safari. A API
 *   só aparece quando o site foi **adicionado à Tela de Início** (iOS 16.4+).
 *   Por isso `indisponivel` é um estado de primeira classe aqui, e a tela conta
 *   isso em vez de oferecer um botão que não faria nada.
 *
 * ## O limite que continua de pé
 *
 * O gatilho é o SSE, que vive na página. Com a aba fechada não chega evento e
 * não há o que notificar. Notificação com a aba fechada seria Web Push: chaves
 * VAPID, `pushManager.subscribe()` e a assinatura guardada no servidor para ele
 * empurrar o disparo. Isso é trabalho de backend, não de front.
 */
export type EstadoPermissao = NotificationPermission | 'indisponivel';

/** Caminho servido na raiz — ver a entrada de `assets` no angular.json. */
const ARQUIVO_SW = '/rp-notificacoes-sw.js';

@Injectable()
export class AlertaService {
  readonly permissao = signal<EstadoPermissao>(estadoInicial());

  /** iPhone fora da Tela de Início: não é "seu navegador é velho", tem solução. */
  readonly precisaInstalarNoIphone = signal(
    estadoInicial() === 'indisponivel' && ehIos(),
  );

  private contexto: AudioContext | null = null;
  private registro: ServiceWorkerRegistration | null = null;

  /**
   * Pedir permissão exige gesto do usuário — o Safari recusa fora de um clique,
   * e o Chrome pune quem pede na carga da página escondendo o pedido.
   */
  async pedirPermissao(): Promise<EstadoPermissao> {
    if (this.permissao() === 'indisponivel') return 'indisponivel';

    // O toque que abre a permissão é também o gesto que destrava o áudio: o
    // navegador só deixa tocar som depois de alguma interação com a página.
    this.prepararSom();

    let resultado: NotificationPermission;
    try {
      resultado = await Notification.requestPermission();
    } catch {
      // Safari antigo só tem a versão com callback.
      resultado = await new Promise<NotificationPermission>(ok =>
        Notification.requestPermission(ok),
      );
    }

    this.permissao.set(resultado);
    if (resultado === 'granted') await this.garantirWorker();
    return resultado;
  }

  /**
   * Um lembrete disparou. O som toca sempre; a notificação do sistema só quando
   * a aba não está à vista, porque com ela aberta o toast já disse a mesma coisa
   * e duplicar vira barulho.
   */
  async avisar(titulo: string, corpo: string): Promise<void> {
    this.tocar();

    if (this.permissao() !== 'granted') return;
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

    const opcoes: NotificationOptions = {
      body: corpo,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      // Mesma tag: dois disparos seguidos trocam o aviso em vez de empilhar.
      tag: 'rp-lembrete',
      requireInteraction: false,
    };

    try {
      const registro = await this.garantirWorker();
      if (registro) {
        await registro.showNotification(titulo, opcoes);
        return;
      }
      // Sem worker (desktop com registro recusado, por exemplo): o construtor
      // ainda serve. No Android ele lança, e o catch abaixo segura.
      new Notification(titulo, opcoes);
    } catch {
      // O aviso do sistema é um extra. O toast da tela já apareceu, e derrubar
      // o fluxo por causa dele seria trocar um alerta por nenhum.
    }
  }

  /**
   * Cria o contexto de áudio a partir de um gesto do usuário.
   *
   * Chamado no clique que pede permissão porque é o único momento garantido de
   * interação; a partir daí o `resume()` em `tocar()` já basta.
   */
  private prepararSom(): void {
    if (this.contexto) return;
    const Ctor =
      typeof window === 'undefined'
        ? undefined
        : window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
    if (Ctor) this.contexto = new Ctor();
  }

  /**
   * Duas notas curtas sintetizadas na hora.
   *
   * Sem arquivo de áudio de propósito: o módulo tem de continuar removível
   * apagando a pasta, e um .mp3 em `assets/` seria mais uma ponta solta fora
   * dela — além de um download a mais para um som de 200ms.
   */
  private tocar(): void {
    try {
      this.prepararSom();
      const ctx = this.contexto;
      if (!ctx) return;
      // Aba em segundo plano costuma suspender o contexto.
      if (ctx.state === 'suspended') void ctx.resume();

      const inicio = ctx.currentTime;
      [880, 1174.66].forEach((hz, i) => {
        const oscilador = ctx.createOscillator();
        const ganho = ctx.createGain();
        oscilador.type = 'sine';
        oscilador.frequency.value = hz;

        const t = inicio + i * 0.13;
        // Rampa em vez de liga/desliga: corte seco em onda senoidal estala.
        ganho.gain.setValueAtTime(0.0001, t);
        ganho.gain.linearRampToValueAtTime(0.15, t + 0.012);
        ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

        oscilador.connect(ganho).connect(ctx.destination);
        oscilador.start(t);
        oscilador.stop(t + 0.24);
      });
    } catch {
      // Som é enfeite: política de autoplay, contexto barrado, aba suspensa.
      // Nada disso pode impedir o aviso visual.
    }
  }

  private async garantirWorker(): Promise<ServiceWorkerRegistration | null> {
    if (this.registro) return this.registro;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

    try {
      this.registro = await navigator.serviceWorker.register(ARQUIVO_SW);
      // `register` resolve antes de o worker estar ativo; `showNotification`
      // numa registration ainda instalando não mostra nada.
      await navigator.serviceWorker.ready;
      return this.registro;
    } catch {
      return null;
    }
  }
}

function estadoInicial(): EstadoPermissao {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'indisponivel';
  return Notification.permission;
}

function ehIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS se apresenta como Mac; o toque é o que o denuncia.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}
