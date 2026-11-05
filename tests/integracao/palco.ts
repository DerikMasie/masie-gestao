import ExcelJS from "exceljs";
import palco from "../fixtures/palco-fisico.json";

/** Monta uma planilha no layout do ControlePalco (colunas F–M e semanas a partir da N) com os dados reais do Palco. */
export async function planilhaPalco(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const datas = Array.from({ length: 44 }, (_, i) => new Date(Date.UTC(2026, 9, 9 + i * 7)));
  for (const aba of ["Realizado-Físico", "Previsto fisico"]) {
    const ws = wb.addWorksheet(aba);
    const cab = ws.getRow(5);
    ["Aux1", "Aux2", "Inserir manualmente", "Nome da Tarefa", "Fornecedor", "Mão de obra acertada", "Mão de obra verba", "Valor cliente", "Duração (dias)", "% Relativo", "% Concluído"]
      .forEach((t, i) => { cab.getCell(3 + i).value = t; });
    datas.forEach((d, i) => { cab.getCell(14 + i).value = d; });
    let r = 6;
    for (const e of palco.etapas) {
      ws.getRow(r).getCell(5).value = e.ordem; ws.getRow(r).getCell(6).value = e.nome; r++;
      for (const s of palco.servicos.filter((x) => x.etapa === e.ordem)) {
        const row = ws.getRow(r++);
        row.getCell(6).value = s.nome;
        if (s.fornecedor) row.getCell(7).value = s.fornecedor;
        if (s.acertada != null) row.getCell(8).value = s.acertada;
        row.getCell(9).value = s.verba ?? "Não preencher";
        row.getCell(10).value = s.cliente;
        row.getCell(11).value = s.duracao;
        const valores = aba.startsWith("Realizado") ? s.realizado : s.previsto;
        for (const [k, v] of Object.entries(valores)) row.getCell(13 + Number(k)).value = v as number;
      }
    }
    ws.getRow(r + 1).getCell(6).value = "Duração total";
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

