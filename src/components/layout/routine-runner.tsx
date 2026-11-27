"use client";
/**
 * Dispara a rotina diária do financeiro (RN-46) uma vez por abertura do app. No back-end real é um job agendado e
 * este componente deixa de existir. Não renderiza nada.
 */
import { useDailyRoutines } from "@/data/hooks";

export function RoutineRunner() {
  useDailyRoutines();
  return null;
}
