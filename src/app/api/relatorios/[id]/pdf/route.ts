import { renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { obra, relatorioSemanal } from "@/db/schema";
import { pode } from "@/dominio/permissoes";
import { obterUsuarioAtual, podeAcessarObra } from "@/lib/auth/atual";
import { RelatorioSemanalPdf } from "@/pdf/relatorio-semanal";
import { carregarRelatorio, conteudoFotos } from "@/servicos/relatorios";

/** PDF do relatório semanal (emitido = dados congelados; rascunho = dados atuais, marcado como prévia). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await obterUsuarioAtual();
  if (!u) return new Response("Não autenticado", { status: 401 });
  if (!pode(u.perfil.permissoes, "relatorios")) return new Response("Sem permissão", { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Não encontrado", { status: 404 });
  const [r] = await db.select({ obraId: relatorioSemanal.obraId, empresaId: obra.empresaId, codigo: obra.codigo }).from(relatorioSemanal)
    .innerJoin(obra, eq(obra.id, relatorioSemanal.obraId)).where(eq(relatorioSemanal.id, id));
  if (!r || r.empresaId !== u.empresaId || !(await podeAcessarObra(u, r.obraId))) return new Response("Não encontrado", { status: 404 });

  const c = await carregarRelatorio(db, u.empresaId, r.obraId, id);
  const conteudos = await conteudoFotos(db, c.fotos);
  const rel = c.relatorio;
  const versao = rel.status === "EMITIDO" ? `versão ${rel.versao} emitida em ${rel.emitidoEm!.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "PRÉVIA (não emitida)";
  const pdf = await renderToBuffer(RelatorioSemanalPdf({
    d: c.dados, versao,
    textos: { tarefasRealizadas: rel.tarefasRealizadas, tarefasProximaSemana: rel.tarefasProximaSemana, anomalias: rel.anomalias, acompanhamentoPrazo: rel.acompanhamentoPrazo },
    fotos: c.fotos.map((f, i) => ({ dados: conteudos[i]!, legenda: f.legenda, focoX: f.focoX, focoY: f.focoY })),
  }));
  const nome = `${r.codigo} Relatorio semanal - semana ${String(rel.semana).padStart(2, "0")}${rel.status === "EMITIDO" ? ` v${rel.versao}` : " (previa)"}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
