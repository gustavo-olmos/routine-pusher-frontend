import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArquiteturaComponent } from './arquitetura.component';
import { CAMADAS, MOMENTOS } from './desenho';

describe('ArquiteturaComponent', () => {
  let fixture: ComponentFixture<ArquiteturaComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ArquiteturaComponent] }).compileComponents();
    fixture = TestBed.createComponent(ArquiteturaComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  function ativas(desenho: number): string[] {
    const svg = el.querySelectorAll('svg')[desenho];
    return Array.from(svg.querySelectorAll('.rp-arq__camada--ativa .rp-arq__titulo')).map((t) => t.textContent!.trim());
  }

  it('começa em interpretar: a IA acende e o agendador fica apagado', () => {
    expect(el.querySelector('.rp-arq__texto')!.textContent).toContain('Nada é salvo');
    expect(ativas(0)).toContain('IA');
    expect(ativas(0)).not.toContain('Agendador');
  });

  it('tocar num momento troca a legenda e as camadas acesas nos dois desenhos', () => {
    const botoes = el.querySelectorAll<HTMLButtonElement>('.rp-arq__momento');
    botoes[1].click();
    fixture.detectChanges();

    expect(botoes[1].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.rp-arq__texto')!.textContent).toContain('sem IA');
    for (const i of [0, 1]) {
      expect(ativas(i)).withContext(CAMADAS[i].nome).toContain('Postgres');
      expect(ativas(i)).withContext(CAMADAS[i].nome).not.toContain('IA');
    }
  });

  it('todo momento aponta camadas que existem nos dois desenhos', () => {
    for (const d of CAMADAS) {
      const ids = d.camadas.map((c) => c.id);
      for (const m of MOMENTOS) {
        expect(m.camadas.every((id) => ids.includes(id))).withContext(`${d.nome} · ${m.titulo}`).toBeTrue();
        expect(d.caminhos[m.n]).withContext(`${d.nome} · ${m.titulo}`).toMatch(/^M/);
      }
    }
  });
});
