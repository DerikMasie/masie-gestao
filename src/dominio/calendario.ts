/**
 * Calendário semanal da obra. Datas no formato ISO "AAAA-MM-DD", tratadas em UTC
 * para não sofrer com fuso horário/horário de verão.
 *
 * Substitui as colunas fixas de semanas da planilha (limitadas a 72–80 e com somas truncadas
 * em 36–47 semanas — erros 9 e 10 do diagnóstico). Quinzena e mês são derivados da semana.
 */

export interface Semana {
  numero: number;
  inicio: string;
  fim: string;
}

const DIA = 86_400_000;

export function paraData(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new RangeError(`Data inválida: ${iso}`);
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) throw new RangeError(`Data inválida: ${iso}`);
  return d;
}

export function paraIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function somarDias(iso: string, dias: number): string {
  return paraIso(new Date(paraData(iso).getTime() + dias * DIA));
}

export function diferencaDias(de: string, ate: string): number {
  return Math.round((paraData(ate).getTime() - paraData(de).getTime()) / DIA);
}

/** Segunda-feira da semana que contém a data. */
export function segundaDaSemana(iso: string): string {
  const d = paraData(iso);
  const diaSemana = (d.getUTCDay() + 6) % 7; // 0 = segunda
  return somarDias(iso, -diaSemana);
}

/** Gera as semanas (segunda a domingo) que cobrem o intervalo [inicio, fim]. */
export function gerarSemanas(inicio: string, fim: string, limite = 520): Semana[] {
  if (diferencaDias(inicio, fim) < 0) throw new RangeError("A data de término deve ser posterior à data de início");
  const semanas: Semana[] = [];
  let seg = segundaDaSemana(inicio);
  let numero = 1;
  while (diferencaDias(seg, fim) >= 0) {
    if (numero > limite) throw new RangeError(`Prazo excede ${limite} semanas`);
    semanas.push({ numero, inicio: seg, fim: somarDias(seg, 6) });
    seg = somarDias(seg, 7);
    numero++;
  }
  return semanas;
}

/** Semanas novas necessárias quando o término é prorrogado (nunca remove semanas existentes). */
export function semanasFaltantes(existentes: Semana[], inicio: string, fim: string): Semana[] {
  const todas = gerarSemanas(inicio, fim);
  const ultimo = existentes.reduce((m, s) => Math.max(m, s.numero), 0);
  return todas.filter((s) => s.numero > ultimo);
}

export function quinzenaDaSemana(numeroSemana: number): number {
  return Math.ceil(numeroSemana / 2);
}

/** Mês de calendário (AAAA-MM) da semana, pela data de início (segunda-feira). */
export function mesDaSemana(semana: Pick<Semana, "inicio">): string {
  return semana.inicio.slice(0, 7);
}

export function hojeIso(agora = new Date()): string {
  // Data local de São Paulo, para "hoje" bater com o calendário do usuário.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}
