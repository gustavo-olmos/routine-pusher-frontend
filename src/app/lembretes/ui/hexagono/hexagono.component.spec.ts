import { TestBed } from '@angular/core/testing';

import { HexagonoComponent } from './hexagono.component';

describe('HexagonoComponent', () => {
  it('desenha os três hexágonos e os adaptadores nos dois desenhos, com a troca da IA', async () => {
    await TestBed.configureTestingModule({ imports: [HexagonoComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HexagonoComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    const svgs = el.querySelectorAll('svg');
    expect(svgs.length).toBe(2);
    svgs.forEach((svg) => {
      expect(svg.querySelectorAll('polygon').length).toBe(3);
      expect(svg.querySelectorAll('.rp-hex__adaptador').length).toBe(7);
      expect(svg.querySelector('.rp-hex__rotulo--b')?.textContent).toContain('Claude');
      expect(svg.textContent).toContain('recorrência');
    });
    expect(el.querySelector('figcaption')?.textContent).toContain('FeriadoPort');
  });
});
