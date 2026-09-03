import { HttpInterceptorFn } from '@angular/common/http';

import { API_BASE } from '../lembretes.config';

/**
 * Carimba `withCredentials` em tudo que vai para a API.
 *
 * A identidade do visitante é o cookie HttpOnly `RP_SESSAO`. Sem esta flag o
 * navegador não manda o cookie, e a chamada cai numa sessão recém-criada em vez
 * da sessão do visitante — sem erro nenhum. Por isso é interceptor e não um
 * parâmetro repetido em cada `http.get`: uma chamada esquecida basta para
 * quebrar a tela de um jeito difícil de enxergar.
 */
export const credenciaisInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.url.startsWith(API_BASE) ? req.clone({ withCredentials: true }) : req);
