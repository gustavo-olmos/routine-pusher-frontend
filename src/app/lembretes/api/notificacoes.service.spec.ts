import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { API_V1 } from '../lembretes.config';
import {
  NotificacoesService,
  RECONEXAO_INICIAL_MS,
  RECONEXAO_TETO_MS,
} from './notificacoes.service';

/**
 * EventSource de mentira: o real abriria um stream de verdade dentro do Karma.
 * Os métodos de teste reproduzem os dois jeitos de o stream cair, que o
 * navegador distingue pelo `readyState` no `onerror`.
 */
class FonteFalsa {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static criadas: FonteFalsa[] = [];

  readyState = FonteFalsa.CONNECTING;
  fechada = false;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  constructor(readonly url: string, readonly init?: EventSourceInit) {
    FonteFalsa.criadas.push(this);
  }

  close(): void {
    this.readyState = FonteFalsa.CLOSED;
    this.fechada = true;
  }

  abrir(): void {
    this.readyState = FonteFalsa.OPEN;
    this.onopen?.(new Event('open'));
  }

  /** Servidor respondeu 502/504: o navegador desiste e não tenta mais. */
  recusar(): void {
    this.readyState = FonteFalsa.CLOSED;
    this.onerror?.(new Event('error'));
  }

  /** Rede caiu: o navegador mesmo vai tentar de novo. */
  perderRede(): void {
    this.readyState = FonteFalsa.CONNECTING;
    this.onerror?.(new Event('error'));
  }

  mandar(dado: string): void {
    this.onmessage?.(new MessageEvent('message', { data: dado }));
  }
}

describe('NotificacoesService', () => {
  const original = (window as { EventSource?: unknown }).EventSource;
  let servico: NotificacoesService;

  const fontes = () => FonteFalsa.criadas;
  const ultima = () => FonteFalsa.criadas[FonteFalsa.criadas.length - 1];

  beforeEach(() => {
    FonteFalsa.criadas = [];
    (window as { EventSource?: unknown }).EventSource = FonteFalsa;
    TestBed.configureTestingModule({ providers: [NotificacoesService] });
    servico = TestBed.inject(NotificacoesService);
  });

  afterEach(() => {
    servico.desconectar();
    (window as { EventSource?: unknown }).EventSource = original;
  });

  it('abre o stream com withCredentials, senão escuta a sessão errada', () => {
    servico.conectar();

    expect(fontes().length).toBe(1);
    expect(ultima().url).toBe(`${API_V1}/notificar/sse`);
    expect(ultima().init?.withCredentials).toBeTrue();
  });

  it('reconecta depois de CLOSED, esperando o backoff inicial', fakeAsync(() => {
    servico.conectar();
    ultima().abrir();
    expect(servico.conectado()).toBeTrue();

    const recusada = ultima();
    recusada.recusar();

    expect(servico.conectado()).toBeFalse();
    expect(recusada.fechada).withContext('fonte recusada é fechada').toBeTrue();

    tick(RECONEXAO_INICIAL_MS - 1);
    expect(fontes().length).withContext('ainda esperando').toBe(1);

    tick(1);
    expect(fontes().length).withContext('fonte nova aberta').toBe(2);
  }));

  it('queda de rede (CONNECTING) fica com o navegador, sem fonte nova', fakeAsync(() => {
    servico.conectar();
    ultima().abrir();

    ultima().perderRede();
    tick(RECONEXAO_TETO_MS);

    expect(fontes().length).toBe(1);
    expect(fontes()[0].fechada).toBeFalse();
    expect(servico.conectado()).toBeFalse();
  }));

  it('o backoff dobra a cada recusa, para no teto e zera ao abrir', fakeAsync(() => {
    servico.conectar();

    // Recusas seguidas, sem nenhuma abertura no meio.
    const esperas: number[] = [];
    let espera = RECONEXAO_INICIAL_MS;
    for (let i = 0; i < 7; i++) {
      esperas.push(espera);
      espera = Math.min(espera * 2, RECONEXAO_TETO_MS);
    }
    expect(esperas).toEqual([2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]);

    for (const ms of esperas) {
      const antes = fontes().length;
      ultima().recusar();
      tick(ms - 1);
      expect(fontes().length).withContext(`antes de ${ms}ms`).toBe(antes);
      tick(1);
      expect(fontes().length).withContext(`em ${ms}ms`).toBe(antes + 1);
    }

    // Abriu: a próxima recusa volta a esperar só o inicial.
    ultima().abrir();
    const antes = fontes().length;
    ultima().recusar();
    tick(RECONEXAO_INICIAL_MS);
    expect(fontes().length).toBe(antes + 1);
  }));

  it('aoReconectar não é chamado na primeira abertura, só nas seguintes', fakeAsync(() => {
    const reconexoes = jasmine.createSpy('aoReconectar');
    servico.aoReconectar = reconexoes;

    servico.conectar();
    ultima().abrir();
    expect(reconexoes).not.toHaveBeenCalled();

    // Volta por reconexão nossa, depois de uma recusa do servidor.
    ultima().recusar();
    tick(RECONEXAO_INICIAL_MS);
    ultima().abrir();
    expect(reconexoes).toHaveBeenCalledTimes(1);

    // Volta pela reconexão do próprio navegador: também perdeu eventos.
    ultima().perderRede();
    ultima().abrir();
    expect(reconexoes).toHaveBeenCalledTimes(2);
  }));

  it('desconectar cancela a reconexão agendada', fakeAsync(() => {
    servico.conectar();
    ultima().abrir();
    ultima().recusar();

    servico.desconectar();
    tick(RECONEXAO_TETO_MS);

    expect(fontes().length).toBe(1);
  }));

  it('conectar enquanto a reconexão está agendada não abre fonte dobrada', fakeAsync(() => {
    servico.conectar();
    ultima().recusar();

    servico.conectar();
    expect(fontes().length).toBe(1);

    tick(RECONEXAO_INICIAL_MS);
    expect(fontes().length).toBe(2);
  }));

  it('mensagem continua virando aviso com o título', fakeAsync(() => {
    const recebidos: string[] = [];
    servico.aoReceber = t => recebidos.push(t);

    servico.conectar();
    ultima().abrir();
    ultima().mandar('Pagar a fatura do cartão');

    expect(recebidos).toEqual(['Pagar a fatura do cartão']);
    expect(servico.avisos().map(a => a.titulo)).toEqual(['Pagar a fatura do cartão']);
    tick(8_000);
  }));
});
