import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

// Sem `withComponentInputBinding()`: ele atribui `undefined` a todo input do
// componente roteado que não tenha chave correspondente na rota, apagando os
// defaults declarados com `input()`. O agendador depende dos seus.
export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes)]
};
