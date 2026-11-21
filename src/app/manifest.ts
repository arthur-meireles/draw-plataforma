import type { MetadataRoute } from "next";

/** Manifest do PWA (10.6). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Draw — Gestão Integrada",
    short_name: "Draw",
    description: "Projetos, comercial, financeiro e freelancers da Draw Legal Design.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "pt-BR",
    dir: "ltr",
    theme_color: "#ffffff",
    background_color: "#f3f4f6",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Minhas tarefas", url: "/minhas-tarefas", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Novo projeto", url: "/projetos/novo", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Caixa de entrada", url: "/caixa-de-entrada", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
