import ExcelJS from "exceljs";
import { db } from "@/db";
import { pode } from "@/dominio/permissoes";
import { obterUsuarioAtual, podeAcessarObra } from "@/lib/auth/atual";
import { carregarOrcamento, STATUS_ORCAMENTO } from "@/servicos/orcamentos";

/** Exporta o orçamento para Excel (valores calculados pelo sistema, com parâmetros e resumo por etapa). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await obterUsuarioAtual();
  if (!u) return new Response("Não autenticado", { status: 401 });
  if (!pode(u.perfil.permissoes, "orcamentos")) return new Response("Sem permissão", { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Não encontrado", { status: 404 });
  const c = await carregarOrcamento(db, u.empresaId, id).catch(() => null);
  if (!c || !(await podeAcessarObra(u, c.orcamento.obraId))) return new Response("Não encontrado", { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Masie Gestão";
  const ws = wb.addWorksheet("Orçamento", { views: [{ state: "frozen", ySplit: 5 }] });
  const moeda = '"R$" #,##0.00';
  ws.columns = [
    { width: 9 }, { width: 60 }, { width: 8 }, { width: 11 }, { width: 8 }, { width: 13 }, { width: 13 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 15 },
  ];
  ws.getCell("A1").value = `${c.obra.codigo} · ${c.obra.nome}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = `${c.orcamento.titulo} · nº ${c.orcamento.numero} rev. ${c.orcamento.revisao} · ${STATUS_ORCAMENTO[c.orcamento.status]}`;
  ws.getCell("A3").value = `BDI MO ${(c.parametros.bdiMaoDeObra * 100).toFixed(2)}% · BDI material ${(c.parametros.bdiMaterial * 100).toFixed(2)}% · impostos ${(c.parametros.impostos * 100).toFixed(2)}% (${c.parametros.formaImposto === "POR_DENTRO" ? "por dentro" : "por fora"})`;
  const cab = ws.getRow(5);
  cab.values = ["Item", "Descrição", "Unid.", "Quant.", "Quebra", "MO unit.", "Mat. unit.", "Custo MO", "Custo material", "Venda MO", "Venda material", "Venda total"];
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
  let r = 6;
  for (const p of c.porEtapa) {
    if (!p.itens.length) continue;
    const linha = ws.getRow(r++);
    linha.values = [String(p.etapa.ordem), p.etapa.nome.toUpperCase(), null, null, null, null, null, p.totais.custoMaoDeObra, p.totais.custoMaterial, p.totais.vendaMaoDeObra, p.totais.vendaMaterial, p.totais.venda];
    linha.font = { bold: true };
    linha.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F3" } };
    for (const i of p.itens) {
      ws.getRow(r++).values = [i.codigo, i.grupo ? `${i.grupo} — ${i.descricao}` : i.descricao, i.unidade, i.quantidade, i.quebra, i.custoUnitarioMaoDeObra, i.custoUnitarioMaterial,
        i.calculo.custoMaoDeObra, i.calculo.custoMaterial, i.calculo.vendaMaoDeObra, i.calculo.vendaMaterial, i.calculo.venda];
    }
  }
  r++;
  const t = c.totais;
  for (const [rotulo, v] of [["Custo total", t.custo], ["Venda sem imposto", t.venda], ["Impostos", t.imposto], ["Total da proposta", t.total], ["Lucro bruto", t.lucro]] as const) {
    const linha = ws.getRow(r++);
    linha.getCell(11).value = rotulo; linha.getCell(12).value = v; linha.font = { bold: rotulo === "Total da proposta" };
  }
  for (const col of [6, 7, 8, 9, 10, 11, 12]) ws.getColumn(col).numFmt = moeda;
  ws.getColumn(4).numFmt = "#,##0.00";

  const buf = await wb.xlsx.writeBuffer();
  const nome = `Orcamento_${c.obra.codigo}_n${c.orcamento.numero}_rev${c.orcamento.revisao}.xlsx`;
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
