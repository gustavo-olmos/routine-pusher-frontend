import { Routes } from '@angular/router';

/**
 * Neste projeto o agendador é a aplicação inteira, então mora na raiz do router.
 * O `/lembretes` da URL pública vem do `baseHref` do build de produção (ver
 * angular.json), não de um segmento de rota — senão o endereço viraria
 * `/lembretes/lembretes`.
 */
export const routes: Routes = [
  // Agendador: módulo descartável e isolado. Sai daqui em uma linha.
  {
    path: '',
    loadChildren: () => import('./lembretes/lembretes.routes'),
  },
  { path: '**', redirectTo: '' },
];
