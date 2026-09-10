/*
 * Service worker mínimo do agendador.
 *
 * Existe por um motivo só: no Chrome do Android o construtor `new Notification()`
 * é proibido ("Illegal constructor") e a única forma de mostrar uma notificação
 * do sistema é `ServiceWorkerRegistration.showNotification()`. No desktop o
 * construtor funcionaria, mas usar o mesmo caminho nos dois evita ter duas
 * implementações que envelhecem separadas.
 *
 * De propósito NÃO existe handler de `fetch` aqui. Sem ele este worker não
 * intercepta navegação nem requisição nenhuma, então não tem como quebrar o
 * carregamento do site nem servir versão velha de nada — que é o risco clássico
 * de adicionar um service worker a um projeto que não pediu por cache.
 *
 * Também não há `push`: notificação com a aba fechada exigiria Web Push com
 * chaves VAPID e assinatura guardada no servidor. Ver a nota em alerta.service.ts.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', evento => evento.waitUntil(self.clients.claim()));

/* Clicar no aviso traz de volta a aba que já existe, em vez de abrir outra. */
self.addEventListener('notificationclick', evento => {
  evento.notification.close();

  evento.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(janelas => {
        const aberta = janelas.find(j => j.url.includes('/lembretes'));
        if (aberta) return aberta.focus();
        return self.clients.openWindow('/lembretes');
      }),
  );
});
