import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ==========================================
// SIMULAR EMISSÃO DE SAÍDA (Aprova a venda)
// ==========================================
export const simularEmissaoSaida = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const id_nota = Number(req.params.id);

        const nota = await prisma.notas_fiscais.findFirst({
            where: { id_nota, id_tenant }
        });

        if (!nota) return res.status(404).json({ message: "Nota não encontrada." });
        if (nota.status === 'AUTORIZADA') return res.status(400).json({ message: "Esta nota já está autorizada." });

        const config = await prisma.configuracoes_fiscais.findUnique({ where: { id_tenant } });
        if (!config || !config.cnpj) return res.status(400).json({ message: "Configure o CNPJ primeiro." });

        let chaveAcessoFake = "";
        let protocoloFake = `113${Math.floor(10000000000000 + Math.random() * 90000000000000)}`;
        let xmlFake = "";
        const tipo = nota.tipo_nota.toUpperCase();

        const notaAtualizada = await prisma.$transaction(async (tx) => {
            let numero_gerado = 1;
            let serie_gerada = "1";
            
            if (tipo === 'NFE' || tipo === 'NFCE') {
                const modelo = tipo === 'NFCE' ? '65' : '55';
                serie_gerada = tipo === 'NFCE' ? config.serie_nfce : config.serie_nfe;
                numero_gerado = tipo === 'NFCE' ? config.proximo_numero_nfce : config.proximo_numero_nfe;
                
                // 🟢 CORREÇÃO: Montando a chave exata de 44 dígitos
                const cnpjFormatado = String(config.cnpj).padStart(14, '0');
                const codAleatorioComDV = Math.floor(100000000 + Math.random() * 900000000); // Exatos 9 dígitos
                const mes = String(new Date().getMonth() + 1).padStart(2, '0');
                const ano = String(new Date().getFullYear() % 100).padStart(2, '0');
                
                chaveAcessoFake = `13${ano}${mes}${cnpjFormatado}${modelo}${String(serie_gerada).padStart(3, '0')}${String(numero_gerado).padStart(9, '0')}1${codAleatorioComDV}`;
                xmlFake = `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe${chaveAcessoFake}"><natOp>VENDA DE MERCADORIA</natOp></infNFe></NFe></nfeProc>`;
                
                if (tipo === 'NFCE') await tx.configuracoes_fiscais.update({ where: { id_tenant }, data: { proximo_numero_nfce: { increment: 1 } }});
                else await tx.configuracoes_fiscais.update({ where: { id_tenant }, data: { proximo_numero_nfe: { increment: 1 } }});
            
            } else if (tipo === 'NFSE') {
                numero_gerado = config.proximo_numero_rps;
                chaveAcessoFake = `NFSE-${config.cnpj}-${Date.now()}`;
                xmlFake = `<Rps Simulado>${numero_gerado}</Rps>`;
                await tx.configuracoes_fiscais.update({ where: { id_tenant }, data: { proximo_numero_rps: { increment: 1 } }});
            
            } else if (tipo === 'NFAE') {
                numero_gerado = config.proximo_numero_nfae;
                chaveAcessoFake = `NFAE-13-${config.cnpj}-${numero_gerado}-${Date.now()}`;
                await tx.configuracoes_fiscais.update({ where: { id_tenant }, data: { proximo_numero_nfae: { increment: 1 } }});
            }

            return await tx.notas_fiscais.update({
                where: { id_nota },
                data: {
                    numero_nota: Number(numero_gerado),
                    serie: Number(serie_gerada) || 1,
                    chave_acesso: chaveAcessoFake,
                    protocolo_sefaz: protocoloFake,
                    xml_gerado: xmlFake,
                    status: 'AUTORIZADA',
                    motivo_status: `[SIMULAÇÃO] Uso da ${tipo} Autorizado`,
                    url_danfe: `/admin/danfe/${id_nota}`
                }
            });
        });

        res.status(200).json({ message: "Emissão de Saída Simulada com Sucesso!", nota: notaAtualizada });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// SIMULAR EMISSÃO DE ENTRADA (Cria compra)
// ==========================================
export const simularEmissaoEntrada = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const { id_produto, quantidade, valor_unitario } = req.body;

        if (!id_produto || !quantidade || !valor_unitario) {
            return res.status(400).json({ message: "Para simular, envie id_produto, quantidade e valor_unitario." });
        }

        const produtoDb = await prisma.produtos.findUnique({ where: { id_produto, id_tenant } });
        if (!produtoDb) return res.status(404).json({ message: "Produto não encontrado para dar entrada." });

        const notaGerada = await prisma.$transaction(async (tx) => {
            // 1. Cria um fornecedor fake (ou pega o primeiro que achar)
            let fornecedor = await tx.fornecedores.findFirst({ where: { id_tenant } });
            if (!fornecedor) {
                fornecedor = await tx.fornecedores.create({
                    data: { id_tenant, nome_loja: "Fornecedor Simulação Ltda", documento: "00000000000191", status: "Ativo" }
                });
            }

            const valor_total = Number(quantidade) * Number(valor_unitario);
            const numeroFake = Math.floor(Math.random() * 9000);
            
            // 🟢 CORREÇÃO: Garante o tamanho fixo para a chave de entrada também
            const numeroPadded = String(numeroFake).padStart(9, '0');
            const chaveFake = `3526010000000000019155001${numeroPadded}1000000001`; 

            // 2. Cria a Nota de Entrada Autorizada
            const nota = await tx.notas_fiscais.create({
                data: {
                    id_tenant,
                    id_fornecedor: fornecedor.id_fornecedor,
                    tipo_operacao: 'ENTRADA',
                    tipo_nota: 'NFE',
                    numero_nota: numeroFake,
                    serie: 1,
                    chave_acesso: chaveFake,
                    valor_total: valor_total,
                    status: 'AUTORIZADA',
                    motivo_status: '[SIMULAÇÃO] Nota de Entrada Gerada',
                    xml_gerado: '<xml>Falso</xml>',
                    itens: {
                        create: [{
                            id_produto: produtoDb.id_produto,
                            nome_produto: produtoDb.nome,
                            quantidade: Number(quantidade),
                            valor_unitario: Number(valor_unitario),
                            valor_total: valor_total,
                            cfop: "1102"
                        }]
                    }
                },
                include: { itens: true }
            });

            // 3. Atualiza o Estoque do Produto
            const novoSaldo = Number(produtoDb.estoque) + Number(quantidade);
            await tx.produtos.update({
                where: { id_produto: produtoDb.id_produto },
                data: { estoque: novoSaldo }
            });

            // 4. Registra no log de movimentação
            await tx.MovimentacaoEstoque.create({
                data: {
                    id_produto: produtoDb.id_produto,
                    tipo: 'ENTRADA_FISCAL_SIMULADA',
                    quantidade: quantidade,
                    saldo_momento: novoSaldo,
                    motivo: `Simulação de NF-e ${numeroFake}`,
                    origem_destino: "Fornecedor Simulação Ltda",
                }
            });

            return nota;
        });

        res.status(201).json({ message: "Entrada simulada e estoque atualizado!", nota: notaGerada });
    } catch (error) {
        next(error);
    }
};