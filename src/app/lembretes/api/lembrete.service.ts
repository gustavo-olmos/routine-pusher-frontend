import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_V1 } from '../lembretes.config';
import { agoraLocalIso } from '../dominio/datas';
import {
  Categoria,
  DetalhesEntrada,
  FraseEntrada,
  Lembrete,
  LembreteEntrada,
  Sessao,
} from './modelos';

/**
 * `sortInfo` e `decrescente` são obrigatórios nas listagens; omitir dá 400.
 *
 * O valor é validado contra a lista de campos de cada rota, e um inválido devolve
 * 400 dizendo quais servem:
 * - /lembrete  -> uuid, titulo, descricao, status  (não aceita `id`: a chave
 *   pública do lembrete é o uuid)
 * - /categoria -> id, nome, cor, fatorOrdem
 *
 * Objetos aninhados (categoria, recorrencia, notificacao) não são ordenáveis.
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

/**
 * Categorias: cenário fixo, semeado no banco e igual para todos os visitantes.
 * A escrita (POST/PUT/DELETE) exige login e não está disponível — o front só lê.
 */
@Injectable()
export class CategoriaService {
  private readonly http = inject(HttpClient);

  /** Por `fatorOrdem`: é o campo que o backend usa para a ordem de exibição. */
  listar(): Observable<Categoria[]> {
    return this.http.get<Categoria[]>(`${API_V1}/categoria`, { params: ordenacao('fatorOrdem') });
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

  /**
   * Reagenda: recalcula a série e **reabre** um lembrete concluído
   * (CONCLUIDO -> PENDENTE). Use só quando a recorrência, o horário ou as datas
   * mudarem — para texto e categoria existe `atualizarDetalhes`.
   */
  atualizar(uuid: string, entrada: LembreteEntrada): Observable<Lembrete> {
    return this.http.put<Lembrete>(`${API_V1}/lembrete/${uuid}`, entrada);
  }

  /** Edição leve: preserva agendamento e status. Devolve o lembrete completo. */
  atualizarDetalhes(uuid: string, detalhes: DetalhesEntrada): Observable<Lembrete> {
    return this.http.patch<Lembrete>(`${API_V1}/lembrete/${uuid}/detalhes`, detalhes);
  }

  /** Marca como concluído. Responde 200 com corpo vazio. */
  concluir(uuid: string): Observable<unknown> {
    return this.http.patch(`${API_V1}/lembrete/${uuid}`, null, { responseType: 'text' });
  }

  /** Responde 204 sem corpo. `responseType: 'text'` cobre isso sem parse. */
  excluir(uuid: string): Observable<unknown> {
    return this.http.delete(`${API_V1}/lembrete/${uuid}`, { responseType: 'text' });
  }
}
