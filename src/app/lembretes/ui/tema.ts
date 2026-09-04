/** Preferência de tema do visitante. Puro, sem Angular. */

export type Tema = 'light' | 'dark';

const CHAVE = 'rp:tema';

const ehTema = (v: unknown): v is Tema => v === 'light' || v === 'dark';

/**
 * Tema salvo, ou `null` se o visitante nunca escolheu.
 *
 * Tudo em try/catch: em aba anônima, com cookies de terceiros bloqueados ou com
 * dados do site desativados, só de LER o localStorage o navegador lança.
 */
export function lerTema(): Tema | null {
  try {
    const salvo = localStorage.getItem(CHAVE);
    return ehTema(salvo) ? salvo : null;
  } catch {
    return null;
  }
}

/** Grava a escolha. Falhar aqui não pode derrubar a tela — o tema só não persiste. */
export function salvarTema(tema: Tema): void {
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    /* segue sem persistir */
  }
}

/**
 * O que o sistema operacional pede. Não é usado como padrão de propósito — o
 * padrão vem do input `theme`, para a tela abrir igual ao design. Para seguir o
 * SO, troque o valor inicial de `temaEscolhido` por `lerTema() ?? temaDoSistema()`.
 */
export function temaDoSistema(): Tema {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export const oposto = (tema: Tema): Tema => (tema === 'dark' ? 'light' : 'dark');
