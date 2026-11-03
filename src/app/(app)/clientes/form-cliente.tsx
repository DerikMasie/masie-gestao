import Link from "next/link";
import type { cliente } from "@/db/schema";
import { formatarDocumento } from "@/dominio/documentos";
import type { EstadoForm } from "@/lib/acoes";
import { BotaoEnviar, Campo, CampoArea, CampoSelecao, Formulario } from "@/componentes/formulario";
import { Cartao } from "@/componentes/ui";

export function FormCliente({ acao, c }: { acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>; c?: typeof cliente.$inferSelect }) {
  return (
    <Formulario acao={acao}>
      <Cartao>
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2"><CampoSelecao nome="tipoPessoa" rotulo="Tipo" defaultValue={c?.tipoPessoa ?? "PF"} opcoes={[{ valor: "PF", rotulo: "Pessoa física" }, { valor: "PJ", rotulo: "Pessoa jurídica" }]} /></div>
          <div className="sm:col-span-4"><Campo nome="nome" rotulo="Nome / razão social" obrigatorio defaultValue={c?.nome} /></div>
          <div className="sm:col-span-2"><Campo nome="documento" rotulo="CPF / CNPJ" defaultValue={c?.documento ? formatarDocumento(c.documento) : ""} inputMode="numeric" /></div>
          <div className="sm:col-span-2"><Campo nome="email" rotulo="E-mail" type="email" defaultValue={c?.email ?? ""} /></div>
          <div className="sm:col-span-2"><Campo nome="telefone" rotulo="Telefone" defaultValue={c?.telefone ?? ""} /></div>
          <div className="sm:col-span-6"><Campo nome="endereco" rotulo="Endereço" defaultValue={c?.endereco ?? ""} /></div>
          <div className="sm:col-span-6"><CampoArea nome="observacoes" rotulo="Observações" defaultValue={c?.observacoes ?? ""} /></div>
        </div>
      </Cartao>
      <div className="flex gap-2">
        <BotaoEnviar>Salvar</BotaoEnviar>
        <Link href="/clientes" className="rounded-lg px-4 py-2 text-sm font-medium text-suave hover:bg-slate-100">Cancelar</Link>
      </div>
    </Formulario>
  );
}
