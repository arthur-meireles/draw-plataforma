"use client";
/** Saudação com data ("Boa tarde, Paula") no topo do Início. */
import { usePermissions } from "@/components/layout/session";

export function greetingFor(date = new Date()) {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(date));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function HomeGreeting() {
  const { user } = usePermissions();
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
  return (
    <div className="min-w-0">
      <h1 className="truncate text-lg font-semibold text-fg max-md:text-md">
        {greetingFor()}, {user.name.split(" ")[0]}
      </h1>
      <p className="text-sm capitalize text-fg-subtle">{today}</p>
    </div>
  );
}
