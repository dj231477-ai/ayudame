import { describe, it, expect } from 'vitest';
import { dueOnTick, frequentReminderDue } from './reminder-cadence';

// SPEC §C-13.5, D-11.
describe('dueOnTick', () => {
  it('marca el tick en cada múltiplo del intervalo (ancho TICK_WINDOW_MIN=5)', () => {
    expect(dueOnTick(0, 10)).toBe(true);
    expect(dueOnTick(3, 10)).toBe(true);
    expect(dueOnTick(5, 10)).toBe(false);
    expect(dueOnTick(9, 10)).toBe(false);
    expect(dueOnTick(10, 10)).toBe(true);
    expect(dueOnTick(20, 10)).toBe(true);
  });
});

describe('frequentReminderDue (D-11)', () => {
  it('no dispara en el primer tick (ya hubo aviso de la transición)', () => {
    expect(frequentReminderDue(0, 30)).toBe(false);
    expect(frequentReminderDue(2, 30)).toBe(false);
  });

  it('lejos del límite, espacia cada 10 min', () => {
    expect(frequentReminderDue(10, 30)).toBe(true); // 10 % 10 == 0
    expect(frequentReminderDue(15, 30)).toBe(false); // 15 % 10 == 5, fuera del tick de 5
    expect(frequentReminderDue(20, 30)).toBe(true);
  });

  it('cerca del límite (remainingMin <= 15), cada tick (5 min)', () => {
    expect(frequentReminderDue(10, 15)).toBe(true);
    expect(frequentReminderDue(15, 10)).toBe(true);
    expect(frequentReminderDue(20, 5)).toBe(true);
  });

  it('sin límite (remainingMin=null), escala tras FREQUENT_ESCALATE_THRESHOLD_MIN elapsed', () => {
    // Solo se evalúan valores alineados al tick real (múltiplos de 5, como los dispara el cron).
    expect(frequentReminderDue(5, null)).toBe(false); // <15 elapsed, espaciado 10 -> 5%10==5, fuera del tick
    expect(frequentReminderDue(10, null)).toBe(true); // <15 elapsed, espaciado 10 -> 10%10==0
    expect(frequentReminderDue(15, null)).toBe(true); // >=15 elapsed, cada tick
    expect(frequentReminderDue(40, null)).toBe(true); // sigue para siempre (nunca se auto-marca, INV-11)
  });
});
