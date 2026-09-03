import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { Routes } from '@angular/router';

import { credenciaisInterceptor } from './api/credenciais.interceptor';
import { CategoriaService, LembreteService, SessaoService } from './api/lembrete.service';
import { LembretesStore } from './estado/lembretes.store';
import { FunilService } from './funil/funil.service';

/**
 * Tudo do agendador vive neste injetor de rota, e não no da aplicação.
 *
 * Isso é deliberado: o `provideHttpClient` local carrega o interceptor de
 * credenciais sem impor `withCredentials` a nenhuma outra chamada do site, e
 * nenhum serviço daqui fica visível para o simulador. Quando o recurso for
 * removido, apagar a pasta e a linha de rota basta — não sobra provider órfão
 * em `app.config.ts`.
 */
const routes: Routes = [
  {
    path: '',
    title: 'Lembretes · Routine Pusher',
    providers: [
      provideHttpClient(withInterceptors([credenciaisInterceptor])),
      SessaoService,
      CategoriaService,
      LembreteService,
      FunilService,
      LembretesStore,
    ],
    loadComponent: () =>
      import('./ui/routine-pusher.component').then(m => m.RoutinePusherComponent),
  },
];

export default routes;
