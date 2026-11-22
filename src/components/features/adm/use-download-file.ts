"use client";
import { toast } from "sonner";
import { useApiMutation } from "@/data/hooks";
import { filesApi } from "@/data/services";

/** Baixa a versão de um arquivo (link assinado de curta duração — RF-M7-04). */
export function useDownloadFile() {
  return useApiMutation(
    async (versionId: string) => {
      const r = await filesApi.downloadUrl(versionId);
      return r;
    },
    {
      success: false,
      onSuccess: (r) => {
        if (!r.url) {
          toast.info(`"${r.name}" é um arquivo de demonstração, sem conteúdo para baixar.`);
          return;
        }
        const a = document.createElement("a");
        a.href = r.url;
        a.download = r.name;
        a.click();
      },
    },
  );
}
