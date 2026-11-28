import { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

// Sem `withComponentInputBinding()`: ele atribui `undefined` a todo input do
// componente roteado que não tenha chave correspondente na rota, apagando os
// defaults declarados com `input()`. O agendador depende dos seus.
export const appConfig: ApplicationConfig = {
  // Hidratação: o navegador reaproveita o HTML pré-renderizado em vez de
  // apagá-lo e redesenhar a página, o que atrasava a primeira pintura no celular.
  providers: [provideRouter(routes), provideClientHydration()]
};
