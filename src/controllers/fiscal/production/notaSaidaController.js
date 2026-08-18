import { PrismaClient } from '@prisma/client';
import { decrypt } from '../../../services/cryptoService.js';

const prisma = new PrismaClient();

// ============================================================================
// SERVICES INTERNOS DE SAÍDA
// ============================================================================
const processarNFe = async (pedido, config, id_tenant, tipo_nota) => {
    const isNfce = tipo_nota === 'NFCE';
    const numero_gerado = isNfce ? config.proximo_numero_nfce : config.proximo_numero_nfe;
    const serie_gerada = isNfce ? config.serie_nfce : config.serie_nfe;
    const modelo = isNfce ? '65' : '55';

    // 🟢 CORREÇÃO: Gerando 9 dígitos no final para completar os 44 da chave!
    const cnpjFormatado = String(config.cnpj).padStart(14, '0');
    const codAleatorioComDV = Math.floor(100000000 + Math.random() * 900000000); // Exatos 9 dígitos
    
    const chaveAcessoFake = `13${new Date().getFullYear() % 100}${String(new Date().getMonth() + 1).padStart(2, '0')}${cnpjFormatado}${modelo}${String(serie_gerada).padStart(3, '0')}${String(numero_gerado).padStart(9, '0')}1${codAleatorioComDV}`;

    return await prisma.notas_fiscais.create({
        data: {
            id_tenant,
            id_pedido: pedido.id_pedido,
            tipo_operacao: 'SAIDA',
            tipo_nota,
            numero_nota: numero_gerado,
            serie: serie_gerada,
            chave_acesso: chaveAcessoFake,
            valor_total: pedido.preco_total,
            status: 'RASCUNHO',
            motivo_status: 'Rascunho SEFAZ gerado'
        }
    });
};

const processarNFSe = async (pedido, config, id_tenant) => {
    const numero_rps = config.proximo_numero_rps;
    const serie_rps = config.serie_rps || "1";

    return await prisma.notas_fiscais.create({
        data: {
            id_tenant,
            id_pedido: pedido.id_pedido,
            tipo_operacao: 'SAIDA',
            tipo_nota: 'NFSE',
            numero_nota: numero_rps,
            chave_acesso: `RPS-${serie_rps}-${numero_rps}`, 
            valor_total: pedido.preco_total,
            status: 'RASCUNHO',
            motivo_status: 'RPS gerado, aguardando conversão em NFS-e'
        }
    });
};

const processarNFAe = async (pedido, config, id_tenant) => {
    const numero_gerado = config.proximo_numero_nfae;
    const serie_gerada = config.serie_nfae;

    return await prisma.notas_fiscais.create({
        data: {
            id_tenant,
            id_pedido: pedido.id_pedido,
            tipo_operacao: 'SAIDA',
            tipo_nota: 'NFAE',
            numero_nota: numero_gerado,
            serie: serie_gerada,
            valor_total: pedido.preco_total,
            status: 'RASCUNHO',
            motivo_status: 'Aguardando envio de Nota Avulsa para a SEFAZ'
        }
    });
};

// ============================================================================
// CONTROLLERS EXPORTADOS
// ============================================================================
export const listarNotasSaida = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        
        const notas = await prisma.notas_fiscais.findMany({
            where: { id_tenant, tipo_operacao: 'SAIDA' },
            orderBy: { data_emissao: 'desc' },
            include: {
                pedidos: {
                    include: {
                        usuarios: true,      
                        enderecos: true,     
                        pedido_items: true   
                    }
                }
            }
        });

        const notasFormatadas = notas.map(nota => {
            if (nota.pedidos && nota.pedidos.usuarios) {
                const cliente = nota.pedidos.usuarios;
                if (cliente.cpf_criptografado) {
                    cliente.cpf_descriptografado = decrypt(cliente.cpf_criptografado);
                }
                if (cliente.telefone_criptografado) {
                    cliente.telefone_descriptografado = decrypt(cliente.telefone_criptografado);
                }
            }
            return nota;
        });

        res.status(200).json(notasFormatadas);
    } catch (error) {
        next(error);
    }
};

export const gerarNotaRascunho = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const { id_pedido, tipo_nota } = req.body; 

        if (!id_pedido || !tipo_nota) return res.status(400).json({ message: "ID do pedido e tipo da nota são obrigatórios." });

        const tipoUpperCase = tipo_nota.toUpperCase();
        if (!['NFE', 'NFCE', 'NFSE', 'NFAE'].includes(tipoUpperCase)) {
            return res.status(400).json({ message: "Tipo de nota inválido." });
        }

        const pedido = await prisma.pedidos.findFirst({ where: { id_pedido: Number(id_pedido), id_tenant } });
        if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });

        const configFiscal = await prisma.configuracoes_fiscais.findUnique({ where: { id_tenant } });
        if (!configFiscal || !configFiscal.cnpj) return res.status(400).json({ message: "Configure o CNPJ do emissor." });

        let novaNota;
        if (tipoUpperCase === 'NFE' || tipoUpperCase === 'NFCE') novaNota = await processarNFe(pedido, configFiscal, id_tenant, tipoUpperCase);
        else if (tipoUpperCase === 'NFSE') novaNota = await processarNFSe(pedido, configFiscal, id_tenant);
        else if (tipoUpperCase === 'NFAE') novaNota = await processarNFAe(pedido, configFiscal, id_tenant);

        res.status(201).json({ message: `Rascunho de ${tipoUpperCase} gerado!`, nota: novaNota });
    } catch (error) {
        next(error);
    }
};