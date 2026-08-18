import { PrismaClient } from '@prisma/client';
import { decrypt } from '../../../services/cryptoService.js';
import axios from 'axios';
import https from 'https';

const prisma = new PrismaClient();

// ============================================================================
// FUNÇÃO AUXILIAR: MONTA A CHAVE DE ACESSO REAL (44 DÍGITOS)
// ============================================================================
const gerarChaveAcesso = (uf, dataEmissao, cnpj, modelo, serie, numero, codigoAleatorio) => {
    const ano = String(dataEmissao.getFullYear() % 100).padStart(2, '0');
    const mes = String(dataEmissao.getMonth() + 1).padStart(2, '0');
    const cnpjFormatado = String(cnpj).padStart(14, '0');
    
    // 43 primeiros dígitos
    const chaveSemDV = `${uf}${ano}${mes}${cnpjFormatado}${modelo}${String(serie).padStart(3, '0')}${String(numero).padStart(9, '0')}1${String(codigoAleatorio).padStart(8, '0')}`;
    
    // Cálculo do Dígito Verificador (Módulo 11) exigido pela Sefaz
    let soma = 0;
    let peso = 2;
    for (let i = chaveSemDV.length - 1; i >= 0; i--) {
        soma += parseInt(chaveSemDV.charAt(i)) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;

    return `${chaveSemDV}${dv}`;
};

// ============================================================================
// SERVIÇO PRINCIPAL DE NF-e e NFC-e
// ============================================================================
export const processarNFe = async (pedido, config, id_tenant, tipo_nota) => {
    // 1. Identifica se é NFC-e (Balcão) ou NF-e (Produto Grande/Atacado)
    const isNfce = tipo_nota === 'NFCE';
    const numero_gerado = isNfce ? config.proximo_numero_nfce : config.proximo_numero_nfe;
    const serie_gerada = isNfce ? config.serie_nfce : config.serie_nfe;
    const modelo = isNfce ? '65' : '55';

    // 2. 🟢 CHAVE DE MUDANÇA DE AMBIENTE (SANDBOX VS PRODUÇÃO)
    const tpAmb = config.ambiente === 'PRODUCAO' ? 1 : 2; 

    // UF do emitente (Você precisará ter o estado na configuração, ex: 13 para Amazonas)
    const cUF = '13'; 
    const dataEmissao = new Date();
    const codigoAleatorio = Math.floor(10000000 + Math.random() * 89999999);

    // 3. Gera a Chave de Acesso Oficial (Válida)
    const chaveAcessoReal = gerarChaveAcesso(cUF, dataEmissao, config.cnpj, modelo, serie_gerada, numero_gerado, codigoAleatorio);

    // 4. Salva o "Rascunho Oficial" no banco de dados primeiro
    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant,
            id_pedido: pedido.id_pedido,
            tipo_operacao: 'SAIDA',
            tipo_nota,
            numero_nota: numero_gerado,
            serie: serie_gerada,
            chave_acesso: chaveAcessoReal,
            valor_total: pedido.preco_total,
            status: 'PROCESSANDO',
            motivo_status: `Preparando envio para SEFAZ (${config.ambiente})`
        }
    });

    // Atualiza os contadores para a próxima nota não dar duplicidade
    await prisma.configuracoes_fiscais.update({
        where: { id_tenant },
        data: isNfce ? { proximo_numero_nfce: { increment: 1 } } : { proximo_numero_nfe: { increment: 1 } }
    });

    // ========================================================================
    // 🚀 O FLUXO DE TRANSMISSÃO PARA A SEFAZ COMEÇA AQUI
    // ========================================================================
    
    try {
        // Passo A: O Sistema precisa gerar o XML estrito. 
        // Abaixo está o esqueleto de como a Sefaz lê o Sandbox vs Produção.
        const xmlEstrutura = `
        <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
            <infNFe Id="NFe${chaveAcessoReal}" versao="4.00">
                <ide>
                    <cUF>${cUF}</cUF>
                    <natOp>VENDA DE MERCADORIAS</natOp>
                    <mod>${modelo}</mod>
                    <serie>${serie_gerada}</serie>
                    <nNF>${numero_gerado}</nNF>
                    <dhEmi>${dataEmissao.toISOString().substring(0, 19) + '-04:00'}</dhEmi>
                    <tpNF>1</tpNF> <!-- 1=Saída -->
                    <idDest>1</idDest>
                    <cMunFG>${config.codigo_municipio}</cMunFG>
                    <tpImp>1</tpImp>
                    <tpEmis>1</tpEmis>
                    <tpAmb>${tpAmb}</tpAmb> <!-- 🟢 1=PRODUÇÃO, 2=HOMOLOGAÇÃO (SANDBOX) -->
                    <finNFe>1</finNFe>
                    <indFinal>1</indFinal>
                    <indPres>1</indPres>
                </ide>
                <!-- ... Faltam as tags <emit>, <dest>, <det> (itens), <total>, <transp>, <pag> ... -->
            </infNFe>
        </NFe>`;

        /* 
         * Passo B: ASSINATURA DIGITAL (O coração do problema)
         * Aqui você precisa usar uma biblioteca para assinar o 'xmlEstrutura' usando o certificado A1 (config.certificado_base64).
         * Exemplo: const xmlAssinado = await assinarXmlComCertificadoA1(xmlEstrutura, config.certificado_base64, config.senha_certificado);
         */
        const xmlAssinado = `<nfeProc> ${xmlEstrutura} <!-- ASSINATURA FAKE AQUI --> </nfeProc>`; // Placeholder

        /* 
         * Passo C: TRANSMISSÃO VIA mTLS PARA A SEFAZ
         * O Axios vai abrir o cofre do certificado, colocar na conexão e bater na URL certa.
         */
        const urlSefaz = tpAmb === 1 
            ? 'https://nfe.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx' // PRODUÇÃO
            : 'https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx'; // SANDBOX

        // Simulamos o sucesso da SEFAZ para você ver o fluxo funcionando:
        const simulacaoSefazAceita = true;

        if (simulacaoSefazAceita) {
            // SE A SEFAZ APROVAR (cStat 100):
            await prisma.notas_fiscais.update({
                where: { id_nota: notaSalva.id_nota },
                data: {
                    status: 'AUTORIZADA',
                    motivo_status: `Autorizado o uso da NF-e (${config.ambiente})`,
                    protocolo_sefaz: `1${tpAmb}${Math.floor(1000000000000 + Math.random() * 9000000000000)}`, // Protocolo fictício
                    xml_gerado: xmlAssinado
                }
            });
        } else {
            // SE A SEFAZ REJEITAR (Ex: NCM errado, cStat 539)
            await prisma.notas_fiscais.update({
                where: { id_nota: notaSalva.id_nota },
                data: {
                    status: 'REJEITADA',
                    motivo_status: `Rejeição: NCM inválido (${config.ambiente})`,
                    xml_gerado: xmlAssinado
                }
            });
        }

    } catch (error) {
        console.error("Erro na comunicação com a Sefaz:", error);
        // Se a internet cair, a nota fica como ERRO_TRANSMISSAO para o usuário tentar reenviar depois.
        await prisma.notas_fiscais.update({
            where: { id_nota: notaSalva.id_nota },
            data: { status: 'ERRO_TRANSMISSAO', motivo_status: error.message }
        });
    }

    // Retornamos a nota atualizada
    return await prisma.notas_fiscais.findUnique({ where: { id_nota: notaSalva.id_nota } });
};