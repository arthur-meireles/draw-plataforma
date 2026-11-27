"use client";
/**
 * Hooks de dados (TanStack Query) sobre a "API" de `src/data/services`.
 * Telas usam SOMENTE estes hooks — nunca chamam services nem localStorage diretamente.
 */
import { useMutation, useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect } from "react";
import { ApiError, authApi, clientsApi, jobsApi, notificationsApi, peopleApi, projectTypesApi, usersApi } from "./services";

export function useApiQuery<T>(key: QueryKey, fn: () => Promise<T>, opts?: Omit<UseQueryOptions<T, ApiError>, "queryKey" | "queryFn">) {
  return useQuery<T, ApiError>({ queryKey: key, queryFn: fn, ...opts });
}

interface MutateOpts<T, A = unknown> {
  /** Adia a revalidação (ms) para uma micro-interação terminar antes de a lista se reorganizar (ex.: concluir tarefa). */
  invalidateDelay?: (args: A) => number;
  /** Mensagem de sucesso (toast). Passe `false` para não exibir. */
  success?: string | false | ((data: T) => string);
  onSuccess?: (data: T) => void;
  onError?: (err: ApiError) => void;
}

/**
 * Mutação padrão: em sucesso invalida todas as queries (o banco local é pequeno),
 * mostra toast; em erro mostra a mensagem orientada à solução vinda da API.
 */
export function useApiMutation<A, T>(fn: (args: A) => Promise<T>, opts: MutateOpts<T, A> = {}) {
  const qc = useQueryClient();
  return useMutation<T, ApiError, A>({
    mutationFn: fn,
    onSuccess: (data, args) => {
      const delay = opts.invalidateDelay?.(args) ?? 0;
      if (delay > 0) setTimeout(() => qc.invalidateQueries(), delay);
      else qc.invalidateQueries();
      if (opts.success !== false && opts.success) toast.success(typeof opts.success === "function" ? opts.success(data) : opts.success);
      opts.onSuccess?.(data);
    },
    onError: (err) => {
      if (!err.fieldErrors) toast.error(err.message || "Algo deu errado. Tente novamente.");
      opts.onError?.(err);
    },
  });
}

/* ───────── hooks compartilhados por várias telas ───────── */

export const useMe = () => useApiQuery(["me"], authApi.me, { staleTime: 60_000 });
export const useProjectTypes = (includeInactive = false) => useApiQuery(["project-types", includeInactive], () => projectTypesApi.list(includeInactive), { staleTime: 60_000 });
export const useInternalPeople = () => useApiQuery(["people", "internal"], peopleApi.internal, { staleTime: 60_000 });
export const useAllPeople = () => useApiQuery(["people", "all"], peopleApi.all, { staleTime: 60_000 });
export const useClientOptions = () => useApiQuery(["clients", "options"], () => clientsApi.list(), { staleTime: 30_000 });
export const useUnreadCount = () => useApiQuery(["notifications", "unread"], notificationsApi.unreadCount, { refetchInterval: 30_000 });
export const useOrganization = () => useApiQuery(["organization"], usersApi.organization, { staleTime: 60_000 });

/**
 * RN-34 — rotina de prazos (prazo/atraso de tarefas e projetos, documentos vencendo, recebíveis vencidos).
 * O chassi roda ao abrir o app e a cada 30 minutos; no back-end real é um job diário. Idempotente.
 */
export function useDueSweep(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = () =>
      jobsApi
        .runDueSweep()
        .then((r) => {
          if (alive && r.created > 0) qc.invalidateQueries({ queryKey: ["notifications"] });
        })
        .catch(() => {
          /* sem sessão ou armazenamento indisponível: tenta de novo no próximo ciclo */
        });
    void run();
    const id = window.setInterval(run, 30 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [enabled, qc]);
}
