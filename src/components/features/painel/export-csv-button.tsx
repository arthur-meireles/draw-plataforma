"use client";
/** "Exportar CSV" de uma tabela do painel (UTF-8 com BOM, separador ";"). */
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { downloadCsv, type CsvCell } from "@/lib/csv";

export function ExportCsvButton({ filename, headers, rows, disabled }: { filename: string; headers: string[]; rows: CsvCell[][]; disabled?: boolean }) {
  return (
    <Button
      size="xs"
      variant="ghost"
      icon="download"
      disabled={disabled || !rows.length}
      onClick={() => {
        downloadCsv(`draw-${filename}-${new Date().toISOString().slice(0, 10)}`, headers, rows);
        toast.success("CSV exportado");
      }}
    >
      Exportar CSV
    </Button>
  );
}
