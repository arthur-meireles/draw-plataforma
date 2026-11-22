import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/** Adaptador OpenNext para rodar o Next.js em Cloudflare Workers. Sem cache incremental: o app é client-side. */
export default defineCloudflareConfig({});
