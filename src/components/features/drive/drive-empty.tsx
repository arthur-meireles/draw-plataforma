"use client";
/** Estados vazios do Drive por tipo de local. */
import { EmptyState } from "@/components/ui";
import type { DriveLocation } from "@/data/services";
import { PROJECTS_ROOT } from "@/data/services";

export function DriveEmpty({ location, searching, onClearSearch, onNewFolder, onUpload }: { location: DriveLocation; searching: boolean; onClearSearch: () => void; onNewFolder?: () => void; onUpload?: () => void }) {
  if (searching) return <EmptyState icon="search" title="Nada encontrado" description="Nenhuma pasta ou arquivo deste local combina com a busca." secondaryAction={{ label: "Limpar busca", onClick: onClearSearch }} />;
  const id = location.id;
  if (id === null)
    return <EmptyState icon="files" title="Nenhuma pasta disponível" description="O Drive da Draw segue a estrutura 01. Projetos, 02. Vendas, 03. Financeiro e demais pastas. Seu perfil ainda não tem acesso a nenhuma delas." />;
  if (id === PROJECTS_ROOT)
    return <EmptyState icon="client" title="Nenhum cliente com projetos" description="Em 01. Projetos, cada cliente tem uma pasta e cada projeto, uma subpasta. Elas aparecem sozinhas quando o projeto é criado." />;
  if (id.startsWith("cli:")) return <EmptyState icon="project" title="Este cliente ainda não tem projetos" description="As pastas dos projetos aparecem aqui assim que o primeiro projeto for criado." />;
  if (id.startsWith("prj:"))
    return <EmptyState icon="upload" title="Nenhum arquivo neste projeto" description="Os arquivos enviados aqui ficam ligados ao projeto, com histórico de versões." action={onUpload ? { label: "Enviar arquivos", icon: "upload", onClick: onUpload } : undefined} />;
  return (
    <EmptyState
      icon="folderOpen"
      title="Pasta vazia"
      description={onUpload || onNewFolder ? "Envie arquivos ou crie uma subpasta para organizar o conteúdo." : "Ainda não há arquivos nem subpastas aqui."}
      action={onUpload ? { label: "Enviar arquivos", icon: "upload", onClick: onUpload } : undefined}
      secondaryAction={onNewFolder ? { label: "Nova pasta", onClick: onNewFolder } : undefined}
    />
  );
}
