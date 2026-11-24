import { Routes } from '@angular/router';

/**
 * Neste projeto o agendador é a aplicação inteira, então mora na raiz do router:
 * o endereço público é `lembretes.rotafin.com.br/`, e um segmento `lembretes`
 * aqui só repetiria o subdomínio.
 */
export const routes: Routes = [
  // Agendador: módulo descartável e isolado. Sai daqui em uma linha.
  {
    path: '',
    loadChildren: () => import('./lembretes/lembretes.routes'),
  },
  { path: '**', redirectTo: '' },
];
