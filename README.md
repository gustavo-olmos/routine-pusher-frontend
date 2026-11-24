# Routine Pusher — Web

Type a sentence like *"remind me to call the bank every Monday at 10am"* and get back a real
recurring reminder: an LLM turns the sentence into a schedule, the server fires it at the set
time, and the browser shows it with a sound and a system notification. It works in Portuguese
and English. No sign-up is needed: each visitor gets an anonymous session that expires after 48
hours without use.

**Live demo:** https://www.rotafin.com.br/lembretes

**Backend:** https://github.com/gustavo-olmos/routine-pusher-backend (Java 17 · Spring Boot 3.3)

The interface is in Brazilian Portuguese. The sentence box also understands English.

## Stack

- Angular 17: standalone components, signals, and a lazy route with its own injector
- TypeScript 5.4 · RxJS 7 · SCSS
- Server-Sent Events for reminders firing, and Web Notifications through a minimal service worker
- Jasmine + Karma unit tests
- Hosted on Vercel and served under rotafin.com.br through a rewrite

Design notes and API pitfalls (in Portuguese): [src/app/lembretes/README.md](src/app/lembretes/README.md)
