import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const processarNFSe = async (pedido, config, id_tenant) => {
    // Para serviços, usamos RPS (Recibo Provisório de Serviços)
    const numero_rps = config.proximo_numero_rps;
    const serie_rps = config.serie_rps;

    // 🟢 IDENTIFICA O AMBIENTE (Sandbox ou Produção)
    const isHomologacao = config.ambiente === 'HOMOLOGACAO';
    const ambienteNome = isHomologacao ? 'Homologação (Sandbox)' : 'Produção';

    // A chave do RPS para controle interno
    const controleInterno = `RPS-${serie_rps}-${numero_rps}-${Date.now()}`;
    
    // 1. Salva o Rascunho no Banco
    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant,
            id_pedido: pedido.id_pedido,
            tipo_operacao: 'SAIDA',
            tipo_nota: 'NFSE',
            numero_nota: numero_rps,
            chave_acesso: controleInterno, 
            valor_total: pedido.preco_total,
            status: 'PROCESSANDO',
            motivo_status: `Preparando envio de NFS-e para a Prefeitura em ${ambienteNome}`
        }
    });

    // 2. Incrementa o RPS na configuração
    await prisma.configuracoes_fiscais.update({
        where: { id_tenant },
        data: { proximo_numero_rps: { increment: 1 } }
    });

    // ========================================================================
    // 🚀 TRANSMISSÃO PARA A PREFEITURA AQUI
    // ========================================================================
    try {
        // Exemplo de como o XML da prefeitura (Padrão ABRASF) seria montado
        const xmlEnvioRps = `
        <EnviarLoteRpsEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
            <LoteRps>
                <NumeroLote>1</NumeroLote>
                <Cnpj>${config.cnpj}</Cnpj>
                <InscricaoMunicipal>${config.inscricao_municipal}</InscricaoMunicipal>
                <Rps>
                    <InfRps Id="${controleInterno}">
                        <IdentificacaoRps>
                            <Numero>${numero_rps}</Numero>
                            <Serie>${serie_rps}</Serie>
                            <Tipo>1</Tipo>
                        </IdentificacaoRps>
                        <!-- Detalhes do serviço, ISS e tomador entram aqui -->
                    </InfRps>
                </Rps>
            </LoteRps>
        </EnviarLoteRpsEnvio>`;

        // Simulação da aprovação da Prefeitura:
        const prefeituraAprovou = true;

        if (prefeituraAprovou) {
            await prisma.notas_fiscais.update({
                where: { id_nota: notaSalva.id_nota },
                data: {
                    status: 'AUTORIZADA',
                    motivo_status: `NFS-e autorizada pela Prefeitura (${ambienteNome})`,
                    protocolo_sefaz: `NFSE-${Date.now()}`, // Protocolo da prefeitura
                    xml_gerado: xmlEnvioRps
                }
            });
        }

    } catch (error) {
        console.error("Erro ao enviar NFS-e para a Prefeitura:", error);
        await prisma.notas_fiscais.update({
            where: { id_nota: notaSalva.id_nota },
            data: { status: 'ERRO_TRANSMISSAO', motivo_status: "Falha de comunicação com a Prefeitura" }
        });
    }

    return await prisma.notas_fiscais.findUnique({ where: { id_nota: notaSalva.id_nota } });
};