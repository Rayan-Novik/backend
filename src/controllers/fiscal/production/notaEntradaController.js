import { PrismaClient } from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';

const prisma = new PrismaClient();

// ============================================================================
// LISTAR NOTAS DE ENTRADA (PRODUÇÃO)
// ============================================================================
export const listarNotasEntrada = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        
        const notas = await prisma.notas_fiscais.findMany({
            where: { id_tenant, tipo_operacao: 'ENTRADA' },
            orderBy: { data_emissao: 'desc' },
            include: {
                fornecedores: true, // Traz os dados do emissor (fornecedor)
                itens: {
                    include: { produtos: true } // Traz os itens mapeados com o estoque local
                }
            }
        });

        res.status(200).json(notas);
    } catch (error) {
        next(error);
    }
};

// ============================================================================
// IMPORTAR XML REAL DO FORNECEDOR (PRODUÇÃO)
// ============================================================================
export const importarXmlEntrada = async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ message: "Arquivo XML é obrigatório." });

        const xmlString = req.file.buffer.toString('utf-8');
        const parsed = await xml2js.parseStringPromise(xmlString, { explicitArray: false });

        // Navega até a tag infNFe (suporta XML com ou sem protocolo nfeProc)
        const infNFe = parsed.nfeProc ? parsed.nfeProc.NFe.infNFe : parsed.NFe.infNFe;
        if (!infNFe) return res.status(400).json({ message: "XML inválido ou não é uma NF-e." });

        const emitente = infNFe.emit;
        const itensXml = Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det];
        const chaveAcesso = infNFe.$.Id.replace('NFe', '');

        // Formata os itens para o Frontend exibir
        const itens = itensXml.map(item => ({
            codigo_fornecedor: item.prod.cProd,
            ean: item.prod.cEAN !== 'SEM GTIN' ? item.prod.cEAN : '',
            nome: item.prod.xProd,
            ncm: item.prod.NCM,
            cfop: item.prod.CFOP,
            quantidade: Number(item.prod.qCom),
            valor_unitario: Number(item.prod.vUnCom),
            valor_total: Number(item.prod.vProd),
        }));

        res.status(200).json({
            chave_acesso: chaveAcesso,
            numero_nota: Number(infNFe.ide.nNF),
            serie: Number(infNFe.ide.serie),
            data_emissao: infNFe.ide.dhEmi,
            valor_total: Number(infNFe.total.ICMSTot.vNF),
            fornecedor: {
                cnpj: emitente.CNPJ || emitente.CPF,
                nome_loja: emitente.xNome,
            },
            itens
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erro ao ler o arquivo XML. Verifique se é um arquivo válido da SEFAZ." });
    }
};

// 2️⃣ SALVA A NOTA, CRIA O FORNECEDOR E ALIMENTA O ESTOQUE
export const confirmarEntrada = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const { chave_acesso, numero_nota, serie, valor_total, fornecedor, itens } = req.body;

        const notaGerada = await prisma.$transaction(async (tx) => {
            // 1. Busca ou Cria o Fornecedor
            let fornDb = await tx.fornecedores.findFirst({ where: { id_tenant, documento: fornecedor.cnpj } });
            if (!fornDb) {
                fornDb = await tx.fornecedores.create({
                    data: { id_tenant, documento: fornecedor.cnpj, nome_loja: fornecedor.nome_loja, status: 'Ativo' }
                });
            }

            // 2. Cria a Nota Fiscal no banco
            const nota = await tx.notas_fiscais.create({
                data: {
                    id_tenant,
                    id_fornecedor: fornDb.id_fornecedor,
                    tipo_operacao: 'ENTRADA',
                    tipo_nota: 'NFE',
                    numero_nota,
                    serie,
                    chave_acesso,
                    valor_total,
                    status: 'AUTORIZADA',
                    motivo_status: 'XML Importado Manualmente'
                }
            });

            // 3. Processa os itens e atualiza o estoque
            for (const item of itens) {
                // 🟢 MÁGICA DO FATOR DE CONVERSÃO AQUI:
                const fator = Number(item.fator_conversao) || 1;
                const quantidadeRealParaEstoque = Number(item.quantidade) * fator;
                const custoUnitarioReal = Number(item.valor_unitario) / fator;

                // Salva o item na nota (mantém os dados originais do XML para o fisco)
                await tx.nota_fiscal_itens.create({
                    data: {
                        id_nota: nota.id_nota,
                        id_produto: item.id_produto_vinculado || null,
                        nome_produto: item.nome,
                        quantidade: item.quantidade, // Original do XML (Ex: 1 Fardo)
                        valor_unitario: item.valor_unitario, // Original do XML (Ex: 60 reais)
                        valor_total: item.valor_total,
                        cfop: item.cfop,
                        ncm: item.ncm
                    }
                });

                // Se o usuário vinculou a um produto do sistema, aumenta o estoque!
                if (item.id_produto_vinculado) {
                    const prod = await tx.produtos.findUnique({ where: { id_produto: item.id_produto_vinculado }});
                    if (prod) {
                        const novoSaldo = Number(prod.estoque) + quantidadeRealParaEstoque;
                        
                        await tx.produtos.update({
                            where: { id_produto: prod.id_produto },
                            data: { 
                                estoque: novoSaldo, 
                                preco_custo: custoUnitarioReal // 🟢 Atualiza o preço de custo correto da unidade!
                            } 
                        });

                        await tx.movimentacaoEstoque.create({
                            data: {
                                id_produto: prod.id_produto,
                                tipo: 'ENTRADA_XML',
                                quantidade: quantidadeRealParaEstoque, // 🟢 Mostra a entrada real no log
                                saldo_momento: novoSaldo,
                                motivo: `Entrada via XML NFe ${numero_nota} (Conversão: 1 = ${fator})`,
                                origem_destino: fornecedor.nome_loja
                            }
                        });
                    }
                }
            }
            return nota;
        });

        res.status(201).json({ message: "Nota importada e estoque atualizado!", nota: notaGerada });
    } catch (error) {
        next(error);
    }
};