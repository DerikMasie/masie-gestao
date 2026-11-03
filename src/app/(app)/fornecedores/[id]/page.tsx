import { notFound } from "next/navigation";
import { db } from "@/db";
import { contextoAtual } from "@/lib/acoes";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { lerDadosBancarios, obterFornecedor } from "@/servicos/cadastros";
import { AcaoConfirmada } from "@/componentes/formulario";
import { Cartao, CabecalhoPagina, Dl } from "@/componentes/ui";
import { excluirFornecedorAcao, salvarFornecedorAcao } from "../acoes";
import { FormFornecedor } from "../form-fornecedor";

export const metadata = { title: "Fornecedor" };

export default async function EditarFornecedor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ bancarios?: string }> }) {
  const { id } = await params;
  const { bancarios } = await searchParams;
  const u = await exigirPermissaoPagina("fornecedores");
  const f = /^[0-9a-f-]{36}$/.test(id) ? await obterFornecedor(db, u.empresaId, id) : null;
  if (!f) notFound();
  const verBanc = temPermissao(u, "fornecedores_bancarios");
  const editarBanc = temPermissao(u, "fornecedores_bancarios", "editar");
  const revelar = bancarios === "1" && verBanc;
  const dados = revelar ? await lerDadosBancarios(db, await contextoAtual(), id) : null;

  return (
    <div className="max-w-4xl space-y-6">
      <CabecalhoPagina titulo={f.nome} subtitulo={f.especialidade ?? undefined} voltar={{ href: "/fornecedores", rotulo: "Fornecedores" }}
        acoes={temPermissao(u, "fornecedores", "excluir") && <AcaoConfirmada acao={excluirFornecedorAcao.bind(null, id)} confirmacao={`Excluir o fornecedor ${f.nome}?`} variante="secundario">Excluir</AcaoConfirmada>} />
      {temPermissao(u, "fornecedores", "editar") ? (
        <FormFornecedor acao={salvarFornecedorAcao.bind(null, id)} f={f}
          bancarios={revelar ? { modo: editarBanc ? "editar" : "leitura", dados } : verBanc ? { modo: "oculto" } : { modo: "bloqueado" }} />
      ) : (
        <Cartao titulo="Dados do fornecedor">
          <Dl itens={[["Razão social", f.razaoSocial], ["Telefone", f.telefone], ["E-mail", f.email]]} />
          {verBanc && !revelar && f.dadosBancariosCifrado && <p className="mt-4 text-sm"><a href="?bancarios=1" className="text-texto underline decoration-destaque decoration-2 underline-offset-2">Mostrar dados bancários</a> <span className="text-suave">(acesso registrado)</span></p>}
        </Cartao>
      )}
      {!temPermissao(u, "fornecedores", "editar") && revelar && (
        <Cartao titulo="Dados bancários">
          <Dl itens={[["Nome para depósito", dados?.nomeDeposito], ["PIX", dados?.pix], ["Banco", dados?.banco], ["Agência", dados?.agencia], ["Conta", dados?.conta]]} />
        </Cartao>
      )}
    </div>
  );
}
