import { PrismaClient } from '@prisma/client';
import crypto from 'crypto'; 
import { decrypt } from '../../services/cryptoService.js';

const prisma = new PrismaClient();

// ============================================================================
// 1. SERVICES INTERNOS (Regras isoladas para cada tipo de nota)
// ============================================================================

const processarNFe = async (pedido, config, id_tenant, tipo_nota) => {
    const isNfce = tipo_nota === 'NFCE';
    const numero_gerado = isNfce ? config.proximo_numero_nfce : config.proximo_numero_nfe;
    const serie_gerada = isNfce ? config.serie_nfce : config.serie_nfe;
    const modelo = isNfce ? '65' : '55';

    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant,
            id_pedido: pedido.id_pedido,
            tipo_nota,
            numero_nota: numero_gerado,
            serie: serie_gerada,
            valor_total: pedido.preco_total,
            status: 'RASCUNHO',
            motivo_status: 'Aguardando envio para a SEFAZ'
        }
    });

    return notaSalva;
};

const processarNFSe = async (pedido, config, id_tenant) => {
    const numero_rps = config.proximo_numero_rps;
    const serie_rps = config.serie_rps || "1";

    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant,
            id_pedido: pedido.id_pedido,
            tipo_nota: 'NFSE',
            numero_nota: numero_rps,
            // A "Série" na NFS-e normalmente é string, mas salvamos no campo serie provisoriamente ou chave_acesso
            chave_acesso: `RPS-${serie_rps}-${numero_rps}`, 
            valor_total: pedido.preco_total,
            status: 'RASCUNHO',
            motivo_status: 'RPS gerado, aguardando conversão em NFS-e'
        }
    });

    return notaSalva;
};

const processarNFAe = async (pedido, config, id_tenant) => {
    const numero_gerado = config.proximo_numero_nfae;
    const serie_gerada = config.serie_nfae;

    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant,
            id_pedido: pedido.id_pedido,
            tipo_nota: 'NFAE',
            numero_nota: numero_gerado,
            serie: serie_gerada,
            valor_total: pedido.preco_total,
            status: 'RASCUNHO',
            motivo_status: 'Aguardando envio de Nota Avulsa para a SEFAZ'
        }
    });

    return notaSalva;
};

// ============================================================================
// 2. CONTROLLERS EXPORTADOS (Endpoints da API)
// ============================================================================

export const listarNotasFiscais = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        
        const notas = await prisma.notas_fiscais.findMany({
            where: { id_tenant },
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

        // 🟢 A MÁGICA AQUI: Descriptografar os dados do cliente antes de enviar pro Frontend
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
        console.error("Erro ao listar notas fiscais:", error);
        next(error);
    }
};

export const gerarNotaRascunho = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const { id_pedido, tipo_nota } = req.body; 

        if (!id_pedido || !tipo_nota) {
            return res.status(400).json({ message: "ID do pedido e tipo da nota são obrigatórios." });
        }

        const tipoUpperCase = tipo_nota.toUpperCase();
        const tiposPermitidos = ['NFE', 'NFCE', 'NFSE', 'NFAE'];
        
        if (!tiposPermitidos.includes(tipoUpperCase)) {
            return res.status(400).json({ message: "Tipo de nota inválido." });
        }

        // 1. Validações Iniciais
        const pedido = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_pedido), id_tenant }
        });
        if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });

        const notaExistente = await prisma.notas_fiscais.findUnique({
            where: { id_pedido: pedido.id_pedido }
        });
        if (notaExistente) {
            return res.status(400).json({ message: "Já existe uma nota fiscal vinculada a este pedido." });
        }

        const configFiscal = await prisma.configuracoes_fiscais.findUnique({
            where: { id_tenant }
        });
        if (!configFiscal || !configFiscal.cnpj) {
            return res.status(400).json({ message: "Configure o CNPJ do emissor antes de gerar a nota." });
        }

        // 2. Roteamento (Delega para a função correta)
        let novaNota;
        if (tipoUpperCase === 'NFE' || tipoUpperCase === 'NFCE') {
            novaNota = await processarNFe(pedido, configFiscal, id_tenant, tipoUpperCase);
        } else if (tipoUpperCase === 'NFSE') {
            novaNota = await processarNFSe(pedido, configFiscal, id_tenant);
        } else if (tipoUpperCase === 'NFAE') {
            novaNota = await processarNFAe(pedido, configFiscal, id_tenant);
        }

        res.status(201).json({
            message: `Rascunho de ${tipoUpperCase} gerado com sucesso!`,
            nota: novaNota
        });
    } catch (error) {
        console.error("Erro ao gerar rascunho de nota fiscal:", error);
        next(error);
    }
};

export const simularEmissaoSefaz = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const id_nota = Number(req.params.id);

        const nota = await prisma.notas_fiscais.findFirst({
            where: { id_nota, id_tenant }
        });

        if (!nota) return res.status(404).json({ message: "Nota não encontrada." });
        if (nota.status === 'AUTORIZADA') return res.status(400).json({ message: "Esta nota já está autorizada." });

        const config = await prisma.configuracoes_fiscais.findUnique({ where: { id_tenant } });
        if (!config || !config.cnpj) {
            return res.status(400).json({ message: "Configure o CNPJ e o Certificado antes de emitir a nota." });
        }

        // Variavéis para simulação
        let chaveAcessoFake = "";
        let protocoloFake = `113${Math.floor(10000000000000 + Math.random() * 90000000000000)}`;
        let xmlFake = "";
        const tipo = nota.tipo_nota.toUpperCase();

        // Tratamento da Simulação para cada tipo
        const notaAtualizada = await prisma.$transaction(async (tx) => {
            let numero_gerado = 1;
            let serie_gerada = "1";
            
            if (tipo === 'NFE' || tipo === 'NFCE') {
                const modelo = tipo === 'NFCE' ? '65' : '55';
                serie_gerada = tipo === 'NFCE' ? config.serie_nfce : config.serie_nfe;
                numero_gerado = tipo === 'NFCE' ? config.proximo_numero_nfce : config.proximo_numero_nfe;
                
                // Garante que o CNPJ tenha 14 dígitos preenchendo com zeros (evita chave menor que 44 se o CNPJ for teste)
                const cnpjFormatado = String(config.cnpj).padStart(14, '0');
                
                // 8 dígitos do código + 1 do dígito verificador = 9 dígitos
                const codigoAleatorioComDV = Math.floor(100000000 + Math.random() * 900000000);
                
                chaveAcessoFake = `13${new Date().getFullYear() % 100}${String(new Date().getMonth() + 1).padStart(2, '0')}${cnpjFormatado}${modelo}${String(serie_gerada).padStart(3, '0')}${String(numero_gerado).padStart(9, '0')}1${codigoAleatorioComDV}`;
                xmlFake = `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe${chaveAcessoFake}"><natOp>VENDA DE MERCADORIA</natOp></infNFe></NFe></nfeProc>`;
                
                if (tipo === 'NFCE') {
                    await tx.configuracoes_fiscais.update({ where: { id_tenant }, data: { proximo_numero_nfce: { increment: 1 } }});
                } else {
                    await tx.configuracoes_fiscais.update({ where: { id_tenant }, data: { proximo_numero_nfe: { increment: 1 } }});
                }
            
            } else if (tipo === 'NFSE') {
                numero_gerado = config.proximo_numero_rps;
                serie_gerada = config.serie_rps || "1";
                chaveAcessoFake = `NFSE-${config.cnpj}-${Date.now()}`;
                xmlFake = `<EnviarLoteRpsEnvio><LoteRps><NumeroLote>${numero_gerado}</NumeroLote><Rps><InfRps Id="RPS${numero_gerado}"></InfRps></Rps></LoteRps></EnviarLoteRpsEnvio>`;
                
                await tx.configuracoes_fiscais.update({ where: { id_tenant }, data: { proximo_numero_rps: { increment: 1 } }});
            
            } else if (tipo === 'NFAE') {
                numero_gerado = config.proximo_numero_nfae;
                serie_gerada = config.serie_nfae;
                chaveAcessoFake = `NFAE-13-${config.cnpj}-${numero_gerado}-${Date.now()}`;
                xmlFake = `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe><natOp>NOTA AVULSA</natOp></infNFe></NFe></nfeProc>`;
                
                await tx.configuracoes_fiscais.update({ where: { id_tenant }, data: { proximo_numero_nfae: { increment: 1 } }});
            }

            // Atualiza a nota com os dados gerados E a URL do PDF fake
            return await tx.notas_fiscais.update({
                where: { id_nota },
                data: {
                    numero_nota: Number(numero_gerado),
                    serie: Number(serie_gerada) || 1,
                    chave_acesso: chaveAcessoFake,
                    protocolo_sefaz: protocoloFake,
                    xml_gerado: xmlFake,
                    status: 'AUTORIZADA',
                    motivo_status: `Autorizado o uso da ${tipo} (Simulação)`,
                    // 🟢 MUDAMOS AQUI: Aponta para a tela de DANFE do nosso painel
                    url_danfe: `/admin/danfe/${id_nota}`
                }
            });
        });

        res.status(200).json({
            message: `${nota.tipo_nota} emitida com sucesso (Simulação)!`,
            nota: notaAtualizada
        });

    } catch (error) {
        console.error("Erro ao simular emissão:", error);
        next(error);
    }
};