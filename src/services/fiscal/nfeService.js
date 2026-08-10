import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Serve tanto para NF-e (Modelo 55) quanto NFC-e (Modelo 65)
export const processarNFe = async (pedido, config, id_tenant, tipo_nota) => {
    const isNfce = tipo_nota === 'NFCE';
    const numero_gerado = isNfce ? config.proximo_numero_nfce : config.proximo_numero_nfe;
    const serie_gerada = isNfce ? config.serie_nfce : config.serie_nfe;
    const modelo = isNfce ? '65' : '55';

    // Simulação de geração de chave SEFAZ
    const chaveAcessoFake = `13${new Date().getFullYear() % 100}${String(new Date().getMonth() + 1).padStart(2, '0')}${config.cnpj}${modelo}${String(serie_gerada).padStart(3, '0')}${String(numero_gerado).padStart(9, '0')}1${Math.floor(10000000 + Math.random() * 90000000)}`;
    const xmlFake = `<nfeProc><NFe><infNFe Id="NFe${chaveAcessoFake}"><natOp>VENDA</natOp></infNFe></NFe></nfeProc>`;

    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant,
            id_pedido: pedido.id_pedido,
            tipo_nota,
            numero_nota: numero_gerado,
            serie: serie_gerada,
            chave_acesso: chaveAcessoFake,
            valor_total: pedido.preco_total,
            xml_gerado: xmlFake,
            status: 'RASCUNHO', // ou 'AUTORIZADA' na simulação completa
            motivo_status: 'Rascunho SEFAZ gerado'
        }
    });

    // Incrementa o contador na configuração
    await prisma.configuracoes_fiscais.update({
        where: { id_tenant },
        data: isNfce ? { proximo_numero_nfce: { increment: 1 } } : { proximo_numero_nfe: { increment: 1 } }
    });

    return notaSalva;
};