import { HttpErrorResponse } from '@angular/common/http';

/** Corpo de erro padrão do backend. */
export interface CorpoErro {
  timestamp: string;
  status: number;
  erro: string;
  mensagem: string;
  caminho: string;
  /** Só em erro de validação (400) — chave é o caminho do campo. */
  camposInvalidos?: Record<string, string>;
}

export interface Falha {
  status: number;
  mensagem: string;
  /** Pronto para marcar campo no formulário; vazio quando não é validação. */
  campos: Record<string, string>;
  /** 429: teto da sessão. Merece texto próprio, não "algo deu errado". */
  limiteAtingido: boolean;
  /** Rede/CORS/servidor fora — em dev quase sempre é o backend local desligado. */
  semRede: boolean;
}

const SEM_REDE =
  'Não consegui falar com a API. Em desenvolvimento, suba o backend em ' +
  'localhost:8080 — chamar api.rotafin.com.br a partir de localhost é cross-site ' +
  'e o cookie de sessão (SameSite=Lax) não viaja.';

const GENERICA = 'Algo deu errado ao falar com o servidor. Tente de novo.';

/** Traduz qualquer erro do HttpClient para algo que a tela consegue mostrar. */
export function normalizarFalha(erro: unknown): Falha {
  if (!(erro instanceof HttpErrorResponse)) {
    return { status: 0, mensagem: GENERICA, campos: {}, limiteAtingido: false, semRede: false };
  }

  // status 0 = a requisição nem chegou (offline, DNS, CORS, backend desligado).
  if (erro.status === 0) {
    return { status: 0, mensagem: SEM_REDE, campos: {}, limiteAtingido: false, semRede: true };
  }

  const corpo = corpoDoErro(erro);
  const campos = corpo?.camposInvalidos ?? {};

  if (erro.status === 429) {
    return {
      status: 429,
      mensagem: corpo?.mensagem ?? 'Você atingiu o limite desta sessão anônima.',
      campos,
      limiteAtingido: true,
      semRede: false,
    };
  }

  return {
    status: erro.status,
    // Em 400 a mensagem raiz é genérica ("Um ou mais campos são inválidos");
    // o que ajuda de verdade está em camposInvalidos.
    mensagem: corpo?.mensagem ?? GENERICA,
    campos,
    limiteAtingido: false,
    semRede: false,
  };
}

/** O corpo pode vir como objeto já parseado ou como texto, dependendo do responseType. */
function corpoDoErro(erro: HttpErrorResponse): CorpoErro | null {
  const bruto = erro.error;
  if (bruto && typeof bruto === 'object') return bruto as CorpoErro;
  if (typeof bruto === 'string' && bruto.trim().startsWith('{')) {
    try {
      return JSON.parse(bruto) as CorpoErro;
    } catch {
      return null;
    }
  }
  return null;
}

/** Junta os campos inválidos numa linha só, para telas sem formulário. */
export function resumoDosCampos(campos: Record<string, string>): string {
  return Object.values(campos).join(' · ');
}
