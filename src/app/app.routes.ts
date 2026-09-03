import { Routes } from '@angular/router';

export const routes: Routes = [
  // Agendador: módulo descartável e isolado. Sai daqui em uma linha.
  {
    path: 'lembretes',
    loadChildren: () => import('./lembretes/lembretes.routes'),
  },
  { path: '', pathMatch: 'full', redirectTo: 'lembretes' },
  { path: '**', redirectTo: 'lembretes' },
];
