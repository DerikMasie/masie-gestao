import Link from "next/link";
import { CalendarDays, KanbanSquare } from "lucide-react";
import { db } from "@/db";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarQuadros } from "@/servicos/quadros";
import { BotaoEnviar, Campo, Formulario } from "@/componentes/formulario";
import { CabecalhoPagina, Cartao, LinkBotao, Selo } from "@/componentes/ui";
import { criarQuadroAcao } from "./acoes";

export const metadata = { title: "Quadros" };

export default async function PaginaQuadros() {
  const u = await exigirPermissaoPagina("quadro");
  const quadros = await listarQuadros(db, u.empresaId);
  return (
    <>
      <CabecalhoPagina titulo="Quadros de atividades" subtitulo="Fluxo das atividades internas do escritório, no estilo kanban"
        acoes={<LinkBotao href="/quadros/calendario" variante="secundario"><CalendarDays className="size-4" /> Calendário</LinkBotao>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quadros.map((q) => (
          <Link key={q.id} href={`/quadros/${q.id}`} className="group rounded-xl border border-borda bg-white p-5 shadow-sm transition hover:border-zinc-900">
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-2 font-semibold"><KanbanSquare className="size-4 text-zinc-500 group-hover:text-zinc-900" />{q.nome}</span>
              {q.arquivado && <Selo>Arquivado</Selo>}
            </div>
            {q.descricao && <p className="mt-1 text-sm text-suave">{q.descricao}</p>}
            <div className="mt-4 flex gap-2 text-xs">
              <Selo>{q.abertos} em aberto</Selo>
              {q.atrasados > 0 && <Selo tom="vermelho">{q.atrasados} atrasado(s)</Selo>}
            </div>
          </Link>
        ))}
        {temPermissao(u, "quadro", "criar") && (
          <Cartao titulo="Novo quadro">
            <Formulario acao={criarQuadroAcao}>
              <Campo nome="nome" rotulo="Nome" obrigatorio placeholder="Comercial, Compras, Projetos…" />
              <Campo nome="descricao" rotulo="Descrição" />
              <BotaoEnviar>Criar com o fluxo padrão</BotaoEnviar>
            </Formulario>
          </Cartao>
        )}
      </div>
    </>
  );
}
