import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

// Só para a pré-renderização no build: gera o index.html já com o artigo, que o
// LinkedIn e os buscadores leem sem rodar JavaScript. Não há servidor em produção.
const bootstrap = () => bootstrapApplication(AppComponent, config);

export default bootstrap;
