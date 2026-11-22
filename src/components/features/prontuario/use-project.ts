"use client";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { projectsApi } from "@/data/services";
import type { ID } from "@/data/types";

export type ProjectDetail = Awaited<ReturnType<typeof projectsApi.get>>;
export type ProjectMemberRow = Awaited<ReturnType<typeof projectsApi.members>>[number];

/** Projeto do prontuário (por código ou id). Freelancer fora do projeto recebe 404. */
export const useProject = (code: string) => useApiQuery(["project", code], () => projectsApi.get(code), { retry: false });

export const useProjectMembers = (projectId: ID) => useApiQuery(["project-members", projectId], () => projectsApi.members(projectId));

/** Edição de campos do projeto; erros da API (ex.: RN-12) aparecem em toast. */
export const useProjectUpdate = (projectId: ID) => useApiMutation((patch: Parameters<typeof projectsApi.update>[1]) => projectsApi.update(projectId, patch), { success: "Projeto atualizado" });
