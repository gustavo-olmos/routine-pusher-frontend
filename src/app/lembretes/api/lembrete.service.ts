import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_V1 } from '../lembretes.config';
import { agoraLocalIso } from '../dominio/datas';
import { Categoria, FraseEntrada, Lembrete, LembreteEntrada, Sessao } from './modelos';

/**
 * `sortInfo` e `decrescente` são obrigatórios nas listagens — sem eles a resposta
 * é 400. E atenção ao valor: `sortInfo=id` funciona em /categoria mas devolve
 * 400 ("Erro ao comparar objetos: id") em /lembrete, cuja chave é `uuid`.
 */
function ordenacao(campo: string, decrescente = false): HttpParams {
  return new HttpParams().set('sortInfo', campo).set('decrescente', decrescente);
}

@Injectable()
export class SessaoService {
  private readonly http = inject(HttpClient);

  /** Emite o cookie `RP_SESSAO` na primeira chamada e renova a validade nas demais. */
  obter(): Observable<Sessao> {
    return this.http.get<Sessao>(`${API_V1}/sessao`);
  }

  encerrar(): Observable<unknown> {
    return this.http.delete(`${API_V1}/sessao`, { responseType: 'text' });
  }
}

@Injectable()
export class CategoriaService {
  private readonly http = inject(HttpClient);

  /** Cenário fixo (5 itens), não dado do visitante: o front só lê. */
  listar(): Observable<Categoria[]> {
    return this.http.get<Categoria[]>(`${API_V1}/categoria`, { params: ordenacao('id') });
  }
}

@Injectable()
export class LembreteService {
  private readonly http = inject(HttpClient);

  listar(): Observable<Lembrete[]> {
    return this.http.get<Lembrete[]>(`${API_V1}/lembrete`, { params: ordenacao('uuid') });
  }

  criar(entrada: LembreteEntrada): Observable<Lembrete> {
    return this.http.post<Lembrete>(`${API_V1}/lembrete`, entrada);
  }

  /**
   * Criação por linguagem natural. `agora` vai sempre preenchido: é o relógio de
   * quem pede que resolve "amanhã às 9h" — sem ele vale o fuso do servidor.
   */
  criarPorFrase(frase: string): Observable<Lembrete> {
    const corpo: FraseEntrada = { frase, agora: agoraLocalIso() };
    return this.http.post<Lembrete>(`${API_V1}/chat/lembrete`, corpo);
  }

  atualizar(uuid: string, entrada: LembreteEntrada): Observable<Lembrete> {
    return this.http.put<Lembrete>(`${API_V1}/lembrete/${uuid}`, entrada);
  }

  /** Marca como concluído. Responde 200 com corpo vazio. */
  concluir(uuid: string): Observable<unknown> {
    return this.http.patch(`${API_V1}/lembrete/${uuid}`, null, { responseType: 'text' });
  }

  /** Responde texto puro ("Lembrete excluído com sucesso!"), não JSON. */
  excluir(uuid: string): Observable<unknown> {
    return this.http.delete(`${API_V1}/lembrete/${uuid}`, { responseType: 'text' });
  }
}
