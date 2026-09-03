import { agoraLocalIso, faltaPara, intervaloEntre, paraData, paraDatas } from './datas';

describe('datas', () => {
  describe('agoraLocalIso', () => {
    it('formata o relógio LOCAL, sem converter para UTC', () => {
      // A armadilha: toISOString() devolveria 21:45Z para um horário local de
      // 18:45 no Brasil. O backend lê data-hora sem fuso, então mandar UTC
      // resolveria "amanhã às 9h" no dia errado perto da meia-noite.
      const local = new Date(2026, 7, 31, 18, 45, 30);
      expect(agoraLocalIso(local)).toBe('2026-08-31T18:45:30');
    });

    it('preenche mês, dia, hora e minuto com dois dígitos', () => {
      expect(agoraLocalIso(new Date(2026, 0, 5, 9, 7, 3))).toBe('2026-01-05T09:07:03');
    });

    it('não vaza o fuso no formato', () => {
      expect(agoraLocalIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('paraData', () => {
    it('lê data-hora do servidor como horário local', () => {
      const d = paraData('2026-09-10T09:00:00');
      expect(d.getHours()).toBe(9);
      expect(d.getDate()).toBe(10);
    });

    it('normaliza data pura, que o JS leria como UTC', () => {
      const d = paraData('2026-09-10');
      expect(d.getDate()).toBe(10);
      expect(d.getHours()).toBe(0);
    });

    it('tolera proximasExecucoes nulo', () => {
      expect(paraDatas(null)).toEqual([]);
      expect(paraDatas(undefined)).toEqual([]);
    });
  });

  describe('faltaPara', () => {
    const agora = new Date(2026, 8, 3, 12, 0, 0);

    it('usa minutos abaixo de uma hora, porque "0d" não diz nada', () => {
      expect(faltaPara(new Date(2026, 8, 3, 12, 30), agora)).toBe('em 30min');
    });

    it('usa horas abaixo de um dia', () => {
      expect(faltaPara(new Date(2026, 8, 3, 15, 0), agora)).toBe('em 3h');
    });

    it('usa dias acima disso', () => {
      expect(faltaPara(new Date(2026, 8, 10, 12, 0), agora)).toBe('em 7d');
    });

    it('não mostra tempo negativo', () => {
      expect(faltaPara(new Date(2026, 8, 1, 12, 0), agora)).toBe('agora');
    });
  });

  describe('intervaloEntre', () => {
    it('escala junto com o passo da recorrência', () => {
      const base = new Date(2026, 8, 3, 12, 0);
      expect(intervaloEntre(base, new Date(2026, 8, 3, 12, 15))).toBe('+15min');
      expect(intervaloEntre(base, new Date(2026, 8, 3, 15, 0))).toBe('+3h');
      expect(intervaloEntre(base, new Date(2026, 8, 6, 12, 0))).toBe('+3d');
    });
  });
});
