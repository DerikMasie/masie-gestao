import Link from "next/link";
import type { fornecedor } from "@/db/schema";
import { formatarDocumento } from "@/dominio/documentos";
import type { EstadoForm } from "@/lib/acoes";
import type { DadosBancarios } from "@/lib/validacao";
import { BotaoEnviar, Caixa, Campo, CampoArea, CampoSelecao, Formulario } from "@/componentes/formulario";
import { Cartao } from "@/componentes/ui";

/** Especialidades encontradas na aba Fornecedores da planilha AO (37 categorias). */
export const ESPECIALIDADES = [
  "Alpinista", "Ar-condicionado", "Ceramista/Azulejista", "Chaveiro", "Churrasqueiras", "Deck/ecowood", "Eletricista", "Empreiteiro",
  "Entulhos/Caliça", "Esquadrias de madeira", "Estrutura metálica", "Estrutural", "Funilaria", "Furação de viga", "Gesseiro", "Gás",
  "Hidráulico/gás", "Impermeabilização", "Incêndio", "Instalador credenciado", "Instalador esquadrias", "Instalador piso/rodapé",
  "Limpeza", "Marcenaria", "Marmoraria", "Papel de parede", "Parquet/Synteko", "Pedras naturais", "Pedreiro", "Pintor",
  "Piso Aquecido", "Projetista", "Serralheiro", "Servente", "TI", "Tecn. Seg. Trabalho", "Vidraçaria", "Loja de materiais", "Locação de equipamentos",
];

export function FormFornecedor({ acao, f, bancarios }: {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  f?: typeof fornecedor.$inferSelect;
  /** "editar" = mostra campos editáveis (já decifrados); "oculto" = não envia nada; "bloqueado" = sem permissão. */
  bancarios: { modo: "editar" | "leitura"; dados: DadosBancarios | null } | { modo: "oculto" | "bloqueado" };
}) {
  return (
    <Formulario acao={acao}>
      <Cartao titulo="Dados do fornecedor">
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3"><Campo nome="nome" rotulo="Nome conhecido" obrigatorio defaultValue={f?.nome} ajuda="Como a equipe chama o prestador. Não pode repetir." /></div>
          <div className="sm:col-span-3"><Campo nome="razaoSocial" rotulo="Razão social / nome completo" defaultValue={f?.razaoSocial ?? ""} /></div>
          <div className="sm:col-span-2"><CampoSelecao nome="tipoPessoa" rotulo="Tipo" defaultValue={f?.tipoPessoa ?? "PF"} opcoes={[{ valor: "PF", rotulo: "Pessoa física" }, { valor: "PJ", rotulo: "Pessoa jurídica" }]} /></div>
          <div className="sm:col-span-2"><Campo nome="documento" rotulo="CPF / CNPJ" defaultValue={f?.documento ? formatarDocumento(f.documento) : ""} inputMode="numeric" /></div>
          <div className="sm:col-span-2"><Campo nome="especialidade" rotulo="Especialidade" defaultValue={f?.especialidade ?? ""} list="especialidades" /></div>
          <datalist id="especialidades">{ESPECIALIDADES.map((e) => <option key={e} value={e} />)}</datalist>
          <div className="sm:col-span-3"><Campo nome="telefone" rotulo="Telefone" defaultValue={f?.telefone ?? ""} /></div>
          <div className="sm:col-span-3"><Campo nome="email" rotulo="E-mail" type="email" defaultValue={f?.email ?? ""} /></div>
          <div className="sm:col-span-6"><CampoArea nome="observacoes" rotulo="Observações" defaultValue={f?.observacoes ?? ""} /></div>
          <div className="sm:col-span-6"><Caixa nome="ativo" rotulo="Fornecedor ativo" defaultChecked={f?.ativo ?? true} /></div>
        </div>
      </Cartao>
      <Cartao titulo="Dados bancários e PIX">
        {bancarios.modo === "editar" ? (
          <>
            <input type="hidden" name="alterarBancarios" value="1" />
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="sm:col-span-3"><Campo nome="b_nomeDeposito" rotulo="Nome para depósito" defaultValue={bancarios.dados?.nomeDeposito ?? ""} /></div>
              <div className="sm:col-span-3"><Campo nome="b_pix" rotulo="Chave PIX" defaultValue={bancarios.dados?.pix ?? ""} /></div>
              <div className="sm:col-span-2"><Campo nome="b_banco" rotulo="Banco" defaultValue={bancarios.dados?.banco ?? ""} /></div>
              <div className="sm:col-span-2"><Campo nome="b_agencia" rotulo="Agência" defaultValue={bancarios.dados?.agencia ?? ""} /></div>
              <div className="sm:col-span-2"><Campo nome="b_conta" rotulo="Conta" defaultValue={bancarios.dados?.conta ?? ""} /></div>
            </div>
            <p className="mt-3 text-xs text-suave">Armazenados cifrados (AES-256). Cada visualização fica registrada na auditoria (LGPD).</p>
          </>
        ) : bancarios.modo === "leitura" ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {([["Nome para depósito", bancarios.dados?.nomeDeposito], ["PIX", bancarios.dados?.pix], ["Banco", bancarios.dados?.banco], ["Agência", bancarios.dados?.agencia], ["Conta", bancarios.dados?.conta]] as const).map(([k, v]) => (
              <div key={k}><dt className="text-xs uppercase tracking-wide text-suave">{k}</dt><dd>{v || "—"}</dd></div>
            ))}
          </dl>
        ) : bancarios.modo === "oculto" ? (
          <p className="text-sm text-suave">Dados protegidos. <Link href="?bancarios=1" className="text-texto underline decoration-destaque decoration-2 underline-offset-2">Mostrar e editar dados bancários</Link> (o acesso será registrado).</p>
        ) : (
          <p className="text-sm text-suave">Seu perfil não tem acesso a dados bancários de fornecedores.</p>
        )}
      </Cartao>
      <div className="flex gap-2">
        <BotaoEnviar>Salvar</BotaoEnviar>
        <Link href="/fornecedores" className="rounded-lg px-4 py-2 text-sm font-medium text-suave hover:bg-zinc-100">Cancelar</Link>
      </div>
    </Formulario>
  );
}
