import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { inject as injetarAnalytics } from '@vercel/analytics';

import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Vercel Web Analytics: page views sem cookie. Em desenvolvimento o script só
// loga no console, para `ng serve` não mandar visita para o painel.
injetarAnalytics({ mode: isDevMode() ? 'development' : 'production' });

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
