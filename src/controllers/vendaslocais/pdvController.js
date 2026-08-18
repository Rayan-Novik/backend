import { PrismaClient } from '@prisma/client';
import { decrypt } from '../../services/cryptoService.js';
import { registrarEntradaFinanceira, gerarRecebivelDePedido } from '../../services/financialService.js';

const prisma = new PrismaClient();

// ============================================================================
// 🟢 MÁGICA: INTERCEPTADOR DO "DONO DA LOJA"
// ============================================================================
export const obterIdUsuarioReal = async (reqUser, id_tenant) => {
    const idBruto = reqUser.id_usuario || reqUser.id;

    if (!isNaN(Number(idBruto)) && idBruto !== 'DONO' && Number(idBruto) !== 0) {
        return Number(idBruto);
    }

    const dono = await prisma.tenants.findUnique({ where: { id: id_tenant } });
    const emailDono = dono ? dono.email : `dono_${id_tenant}@sistema.interno`;
    const nomeDono = dono ? (dono.nome_fantasia || 'Proprietário') : 'Proprietário';

    let funcDono = await prisma.funcionarios.findFirst({
        where: { email: emailDono, id_tenant: id_tenant }
    });

    if (!funcDono) {
        funcDono = await prisma.funcionarios.create({
            data: {
                id_tenant: id_tenant,
                nome_completo: nomeDono,
                email: emailDono,
                hash_senha: 'dono_usa_tenant_para_logar', 
                role: 'ADMIN',
                isAdmin: true,
                ativo: true
            }
        });
    }

    return funcDono.id_funcionario;
};

// ============================================================================
// 🟢 FUNÇÕES DO CAIXA
// ============================================================================
export const abrirCaixa = async (req, res) => {
    try {
        const { saldo_inicial, observacoes } = req.body;
        const id_tenant = req.tenantId;

        const id_usuario = await obterIdUsuarioReal(req.user, id_tenant);
        const saldoFormatado = Number(saldo_inicial) || 0;

        const caixaAberto = await prisma.caixa_pdv.findFirst({
            where: { id_usuario, status: 'ABERTO', id_tenant }
        });

        if (caixaAberto) {
            return res.status(400).json({ message: 'Você já possui um caixa aberto.' });
        }

        const novoCaixa = await prisma.caixa_pdv.create({
            data: {
                id_usuario,
                saldo_inicial: saldoFormatado,
                saldo_sistema: saldoFormatado,
                observacoes: observacoes || '',
                status: 'ABERTO',
                data_abertura: new Date(),
                id_tenant
            }
        });

        await prisma.movimentacao_caixa.create({
            data: {
                id_caixa: novoCaixa.id_caixa,
                tipo: 'ENTRADA',
                valor: saldoFormatado,
                motivo: 'Saldo Inicial (Abertura)'
            }
        });

        res.status(201).json({ message: 'Caixa aberto com sucesso!', caixa: novoCaixa });
    } catch (error) {
        res.status(400).json({ message: "Erro ao abrir o caixa. Verifique os dados.", details: error.message });
    }
};

export const conferirFechamento = async (req, res, next) => {
    try {
        const { valores_informados } = req.body;
        const id_tenant = req.tenantId;
        const id_usuario = await obterIdUsuarioReal(req.user, id_tenant);

        const caixa = await prisma.caixa_pdv.findFirst({
            where: { id_usuario, status: 'ABERTO', id_tenant }
        });

        if (!caixa) return res.status(400).json({ message: "Caixa não encontrado." });

        const vendas = await prisma.pedidos.groupBy({
            by: ['metodo_pagamento'],
            where: { id_caixa_pdv: caixa.id_caixa, status_pagamento: 'PAGO', id_tenant },
            _sum: { preco_total: true }
        });

        const movs = await prisma.movimentacao_caixa.groupBy({
            by: ['tipo'],
            where: { id_caixa: caixa.id_caixa },
            _sum: { valor: true }
        });

        const saldoSistemaTotal = Number(caixa.saldo_sistema);

        const esperado = {
            DINHEIRO: Number(caixa.saldo_inicial),
            PIX: 0,
            CREDITO: 0,
            DEBITO: 0,
            OUTROS: 0
        };

        const movsDetalhadas = await prisma.movimentacao_caixa.findMany({
            where: { id_caixa: caixa.id_caixa }
        });

        movsDetalhadas.forEach(m => {
            if (m.motivo === 'Saldo Inicial (Abertura)') return;
            if (m.tipo === 'ENTRADA') esperado.DINHEIRO += Number(m.valor);
            if (m.tipo === 'SAIDA') esperado.DINHEIRO -= Number(m.valor);
        });

        vendas.forEach(v => {
            const metodo = v.metodo_pagamento;
            const valor = Number(v._sum.preco_total || 0);

            if (metodo === 'DINHEIRO') esperado.DINHEIRO += valor;
            else if (metodo === 'PIX') esperado.PIX += valor;
            else if (metodo.includes('CREDITO')) esperado.CREDITO += valor;
            else if (metodo.includes('DEBITO')) esperado.DEBITO += valor;
            else esperado.OUTROS += valor;
        });

        const resultado = Object.keys(esperado).map(metodo => {
            const valorEsperado = Number(esperado[metodo].toFixed(2));
            const valorInformado = Number(valores_informados[metodo] || 0);
            const diferenca = valorInformado - valorEsperado;

            return {
                metodo,
                esperado: valorEsperado,
                informado: valorInformado,
                diferenca: Number(diferenca.toFixed(2)),
                status: Math.abs(diferenca) < 0.05 ? 'OK' : (diferenca > 0 ? 'SOBRA' : 'QUEBRA')
            }
        });

        const saldoFinalInformado = Object.values(valores_informados).reduce((a, b) => Number(a) + Number(b), 0);

        res.json({
            conferencia: resultado,
            saldo_sistema_total: saldoSistemaTotal,
            saldo_informado_total: saldoFinalInformado,
            divergencia_total: saldoFinalInformado - saldoSistemaTotal
        });

    } catch (error) {
        next(error);
    }
};

export const fecharCaixa = async (req, res, next) => {
    try {
        const { valores_informados, observacoes } = req.body;
        const id_tenant = req.tenantId;
        const id_usuario = await obterIdUsuarioReal(req.user, id_tenant);

        const caixaAberto = await prisma.caixa_pdv.findFirst({
            where: { id_usuario, status: 'ABERTO', id_tenant }
        });

        if (!caixaAberto) return res.status(400).json({ message: "Nenhum caixa aberto." });

        const saldoFinalInformado = Object.values(valores_informados || {}).reduce((a, b) => Number(a) + Number(b), 0);
        const detalheFechamento = JSON.stringify(valores_informados);
        const obsFinal = `[Fechamento] Inf: R$${saldoFinalInformado} | Detalhes: ${detalheFechamento} | Obs: ${observacoes || 'Sem obs'}`;

        await prisma.caixa_pdv.updateMany({
            where: { id_caixa: caixaAberto.id_caixa, id_tenant },
            data: {
                status: 'FECHADO',
                saldo_final: saldoFinalInformado,
                data_fechamento: new Date(),
                observacoes: obsFinal
            }
        });

        const caixaFechado = await prisma.caixa_pdv.findFirst({
            where: { id_caixa: caixaAberto.id_caixa, id_tenant }
        });

        res.json(caixaFechado);
    } catch (error) {
        next(error);
    }
};

export const getStatusCaixa = async (req, res) => {
    try {
        const id_tenant = req.tenantId;
        const id_usuario = await obterIdUsuarioReal(req.user, id_tenant);

        const caixa = await prisma.caixa_pdv.findFirst({
            where: { id_usuario, status: 'ABERTO', id_tenant }
        });

        if (!caixa) {
            return res.json({ status: 'FECHADO' });
        }

        res.json({ status: 'ABERTO', dados: caixa });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ============================================================================
// 🟢 VENDA PADRÃO DO PDV
// ============================================================================
export const registrarVendaPDV = async (req, res, next) => {
    try {
        const { itens, metodo_pagamento, valor_recebido, cliente_id } = req.body;
        const id_tenant = req.tenantId;
        const id_usuario_logado = await obterIdUsuarioReal(req.user, id_tenant);

        if (!itens || itens.length === 0) return res.status(400).json({ message: "O carrinho está vazio." });

        const caixaAberto = await prisma.caixa_pdv.findFirst({
            where: { id_usuario: id_usuario_logado, status: 'ABERTO', id_tenant }
        });

        if (!caixaAberto) return res.status(400).json({ message: "Caixa fechado. Abra o caixa para vender." });

        const idsProdutos = itens.map(item => item.id_produto);
        const produtosDb = await prisma.produtos.findMany({
            where: { id_produto: { in: idsProdutos }, id_tenant },
            include: { composicao_pai: { include: { insumo: true } } }
        });

        let totalVenda = 0;
        const itensParaSalvar = itens.map(itemFront => {
            const produtoReal = produtosDb.find(p => p.id_produto === itemFront.id_produto);
            if (!produtoReal) throw new Error(`Produto ID ${itemFront.id_produto} não encontrado.`);

            const preco = Number(produtoReal.preco);
            const quantidade = Number(itemFront.quantidade);
            totalVenda += (preco * quantidade);

            return {
                id_produto: produtoReal.id_produto,
                nome: produtoReal.nome,
                quantidade: quantidade,
                preco: preco,
                imagem_url: produtoReal.imagem_url,
                estoque_atual: Number(produtoReal.estoque),
                receita: produtoReal.composicao_pai || []
            };
        });

        let idClienteFinal = cliente_id;

        if (!idClienteFinal) {
            const emailPadrao = `consumidor_${id_tenant}@pdv.padrao`;
            let consumidorPadrao = await prisma.usuarios.findFirst({ where: { email: emailPadrao, id_tenant } });

            if (!consumidorPadrao) {
                consumidorPadrao = await prisma.usuarios.create({
                    data: {
                        nome_completo: 'Consumidor Final',
                        email: emailPadrao,
                        hash_senha: 'pdv_password_safe',
                        cpf_criptografado: null,
                        telefone_criptografado: null,
                        id_tenant
                    }
                });
            }
            idClienteFinal = consumidorPadrao.id_usuario;
        }

        const venda = await prisma.$transaction(async (tx) => {
            const novoPedido = await tx.pedidos.create({
                data: {
                    usuarios: { connect: { id_usuario: idClienteFinal } },
                    caixa_pdv: { connect: { id_caixa: caixaAberto.id_caixa } },
                    preco_total: totalVenda,
                    preco_itens: totalVenda,
                    preco_frete: 0,
                    metodo_pagamento: metodo_pagamento || 'DINHEIRO',
                    status_pagamento: 'PAGO',
                    status_entrega: 'Entregue',
                    canal_venda: 'PDV',
                    data_pedido: new Date(),
                    tenants: { connect: { id: id_tenant } },
                    pedido_items: {
                        create: itensParaSalvar.map(item => ({
                            id_produto: item.id_produto,
                            id_variacao: item.variacao_selecionada?.id_variacao || null, 
                            nome: item.nome,
                            quantidade: item.quantidade,
                            preco: item.preco,
                            imagem_url: item.imagem_url
                        }))
                    }
                },
                include: { pedido_items: true }
            });

            await tx.caixa_pdv.updateMany({
                where: { id_caixa: caixaAberto.id_caixa, id_tenant },
                data: { saldo_sistema: { increment: totalVenda } }
            });

            for (const item of itensParaSalvar) {
                const idVariacao = item.variacao_selecionada?.id_variacao;

                if (idVariacao) {
                    const variacaoDb = await tx.produto_variacoes.findUnique({ where: { id_variacao: Number(idVariacao) } });
                    if (variacaoDb) {
                        const novoEstoqueVar = Number(variacaoDb.estoque) - Number(item.quantidade);
                        await tx.produto_variacoes.update({
                            where: { id_variacao: Number(idVariacao) }, data: { estoque: novoEstoqueVar }
                        });
                        await tx.movimentacaoEstoque.create({
                            data: {
                                id_produto: item.id_produto, id_variacao: Number(idVariacao), quantidade: item.quantidade,
                                tipo: 'SAIDA', saldo_momento: novoEstoqueVar,
                                motivo: `Venda PDV #${novoPedido.id_pedido} (Var: ${idVariacao})`,
                                origem_destino: 'PDV', usuario_id: id_usuario_logado
                            }
                        });
                    }
                } else {
                    await tx.produtos.updateMany({
                        where: { id_produto: item.id_produto, id_tenant },
                        data: { estoque: { decrement: item.quantidade }, visualizacoes: { increment: 1 } }
                    });
                    await tx.movimentacaoEstoque.create({
                        data: {
                            id_produto: item.id_produto, quantidade: item.quantidade, tipo: 'SAIDA',
                            saldo_momento: item.estoque_atual - item.quantidade, motivo: `Venda PDV #${novoPedido.id_pedido}`,
                            origem_destino: 'PDV', usuario_id: id_usuario_logado
                        }
                    });
                }
            }

            return novoPedido;
        });

        try {
            await gerarRecebivelDePedido(venda, id_tenant);
            await registrarEntradaFinanceira({
                id_pedido: venda.id_pedido,
                id_usuario: idClienteFinal,
                gateway_provider: 'PDV',
                gateway_id: `PDV-${venda.id_pedido}`,
                valor_bruto: totalVenda,
                valor_taxa_real: 0,
                id_tenant
            });
        } catch (finError) {
            console.error("⚠️ Erro ao registrar financeiro do PDV:", finError);
        }

        // ============================================================================
        // 🟢 INTEGRAÇÃO FISCAL: GERA A NFC-e AUTOMATICAMENTE NA VENDA DO CAIXA
        // ============================================================================
        try {
            // Buscamos as configurações fiscais do lojista
            const configFiscal = await prisma.configuracoes_fiscais.findUnique({ where: { id_tenant } });
            
            // Só gera a nota se o lojista já configurou o CNPJ no painel fiscal
            if (configFiscal && configFiscal.cnpj) {
                const numero_gerado = configFiscal.proximo_numero_nfce;
                const serie_gerada = configFiscal.serie_nfce;
                const cnpjFormatado = String(configFiscal.cnpj).padStart(14, '0');
                
                // Gera os 9 dígitos aleatórios finais para o código da chave (incluindo o DV)
                const codAleatorioComDV = Math.floor(100000000 + Math.random() * 900000000); 
                
                const mes = String(new Date().getMonth() + 1).padStart(2, '0');
                const ano = String(new Date().getFullYear() % 100).padStart(2, '0');
                
                // Monta a chave exata de 44 dígitos (Modelo 65 = NFC-e)
                const chaveAcessoFake = `13${ano}${mes}${cnpjFormatado}65${String(serie_gerada).padStart(3, '0')}${String(numero_gerado).padStart(9, '0')}1${codAleatorioComDV}`;

                await prisma.$transaction(async (txFiscal) => {
                    // 1. Cria o rascunho da Nota vinculada ao Pedido recém criado
                    const notaGerada = await txFiscal.notas_fiscais.create({
                        data: {
                            id_tenant,
                            id_pedido: venda.id_pedido,
                            tipo_operacao: 'SAIDA',
                            tipo_nota: 'NFCE', 
                            numero_nota: numero_gerado,
                            serie: serie_gerada,
                            chave_acesso: chaveAcessoFake,
                            valor_total: totalVenda,
                            status: 'RASCUNHO',
                            motivo_status: 'Gerado automaticamente pelo PDV'
                        }
                    });

                    // 2. Transfere os dados tributários de cada produto para os itens da Nota
                    for (const itemFront of itensParaSalvar) {
                        const prodDb = produtosDb.find(p => p.id_produto === itemFront.id_produto);
                        if (prodDb) {
                            await txFiscal.nota_fiscal_itens.create({
                                data: {
                                    id_nota: notaGerada.id_nota,
                                    id_produto: prodDb.id_produto,
                                    nome_produto: prodDb.nome,
                                    quantidade: itemFront.quantidade,
                                    valor_unitario: itemFront.preco,
                                    valor_total: Number(itemFront.quantidade) * Number(itemFront.preco),
                                    cfop: prodDb.cfop_padrao || '5102',
                                    ncm: prodDb.ncm || '',
                                    cst_icms: prodDb.cst_icms || '102',
                                    cst_pis_cofins: prodDb.cst_pis_cofins || '99'
                                }
                            });
                        }
                    }

                    // 3. Atualiza o contador de NFC-e para o próximo número
                    await txFiscal.configuracoes_fiscais.update({
                        where: { id_tenant },
                        data: { proximo_numero_nfce: { increment: 1 } }
                    });
                });
            }
        } catch (fiscalErr) {
            console.error("⚠️ Erro ao gerar rascunho fiscal no PDV:", fiscalErr);
            // Capturado silenciosamente para não interromper a venda em caso de falha temporária
        }
        // ============================================================================

        res.status(201).json({ message: "Venda realizada!", pedido: venda });
    } catch (error) {
        res.status(400).json({ message: "Erro ao processar venda.", details: error.message });
    }
};

// ============================================================================
// 🟢 NOVO: RECEBER RESTANTE DO AGENDAMENTO (SINAL ONLINE + RESTANTE NA LOJA)
// ============================================================================
export const receberSaldoPendente = async (req, res, next) => {
    try {
        const { id_pedido } = req.params;
        const { metodo_pagamento, valor_recebido } = req.body; 
        const id_tenant = req.tenantId;
        const id_usuario_logado = await obterIdUsuarioReal(req.user, id_tenant);

        const caixaAberto = await prisma.caixa_pdv.findFirst({
            where: { id_usuario: id_usuario_logado, status: 'ABERTO', id_tenant }
        });

        if (!caixaAberto) return res.status(400).json({ message: "Caixa fechado. Você precisa abrir o caixa para receber pagamentos." });

        const pedido = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_pedido), id_tenant },
            include: { pedido_items: true }
        });

        if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });
        if (pedido.status_pagamento === 'PAGO') return res.status(400).json({ message: "Este pedido já está totalmente pago." });

        // 🟢 SISTEMA À PROVA DE BALAS: Calcula o valor restante dinamicamente
        let valorRestante = 0;

        // Tenta achar a conta a receber
        const conta = await prisma.financeiro_contas_receber.findFirst({
            where: { id_pedido: pedido.id_pedido, id_tenant }
        });

        // 🚀 SE LIGA AQUI: NÃO TEM MAIS O ERRO 404! 
        // Se a conta não existir, ele vai pro "else" e calcula a diferença.
        if (conta) {
            valorRestante = Number(conta.saldo_restante);
        } else {
            const transacoes = await prisma.transacoes_financeiras.findMany({
                where: { id_pedido: pedido.id_pedido, id_tenant }
            });
            const valorJaPago = transacoes.reduce((acc, t) => acc + Number(t.valor_bruto), 0);
            valorRestante = Number(pedido.preco_total) - valorJaPago;
            console.log(`⚠️ Cálculo dinâmico: Pedido total R$${pedido.preco_total} - Já pago R$${valorJaPago} = Restam R$${valorRestante}`);
        }
        
        if (valorRestante <= 0) {
             await prisma.pedidos.update({ where: { id_pedido: pedido.id_pedido }, data: { status_pagamento: 'PAGO' }});
             return res.status(400).json({ message: "O saldo deste pedido já está zerado." });
        }

        // Verifica o troco
        const recebido = Number(valor_recebido || 0);
        let troco = 0;
        if (metodo_pagamento === 'DINHEIRO') {
            if (recebido < valorRestante) return res.status(400).json({ message: "Valor recebido insuficiente." });
            troco = recebido - valorRestante;
        }

        const metodoCombinado = `${pedido.metodo_pagamento} + ${metodo_pagamento}`;

        await prisma.$transaction(async (tx) => {
            // Atualiza o pedido combinando os dois métodos (Ex: "ONLINE_PIX + DINHEIRO")
            await tx.pedidos.update({
                where: { id_pedido: pedido.id_pedido },
                data: {
                    status_pagamento: 'PAGO',
                    metodo_pagamento: metodoCombinado, 
                    id_caixa_pdv: caixaAberto.id_caixa 
                }
            });

            // Soma o dinheiro no gaveteiro virtual
            await tx.caixa_pdv.update({
                where: { id_caixa: caixaAberto.id_caixa },
                data: { saldo_sistema: { increment: valorRestante } }
            });

            // Se a conta a receber existir, dá a baixa nela
            if (conta) {
                await tx.financeiro_contas_receber.update({
                    where: { id_conta: conta.id_conta },
                    data: {
                        saldo_restante: 0,
                        status: 'PAGO',
                        data_recebimento: new Date()
                    }
                });
            }
        });

        // E por fim, gera a transação financeira real do restante no Livro Razão
        try {
            await registrarEntradaFinanceira({
                id_pedido: pedido.id_pedido,
                id_usuario: pedido.id_usuario,
                gateway_provider: 'PDV', // Pagamento final foi no balcão
                gateway_id: `PDV-RESTO-${pedido.id_pedido}-${Date.now()}`,
                valor_bruto: valorRestante,
                valor_taxa_real: 0,
                id_tenant
            });
        } catch(finErr) {
            console.error("Erro ao registrar entrada financeira no recebimento final:", finErr);
        }

        res.status(200).json({ 
            message: "Restante recebido com sucesso!", 
            valor_pago: valorRestante, 
            troco: troco
        });

    } catch (error) {
        next(error);
    }
};

// ============================================================================
// 🟢 ROTAS DE IMPRESSÃO (ATUALIZADAS PARA EXIBIR PAGAMENTOS MÚLTIPLOS)
// ============================================================================
export const gerarPdfA4 = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const id_tenant = req.tenantId;

        const pedido = await prisma.pedidos.findFirst({
            where: { id_pedido: id_pedido, id_tenant: id_tenant },
            include: { pedido_items: true, usuarios: true }
        });
        
        if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });

        // Busca o histórico financeiro daquele pedido
        const transacoes = await prisma.transacoes_financeiras.findMany({
            where: { id_pedido: pedido.id_pedido, id_tenant },
            orderBy: { data_criacao: 'asc' }
        });

        let itensHtml = '';
        pedido.pedido_items.forEach(item => {
            itensHtml += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.quantidade}x</td>
                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.nome_produto || item.nome}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">R$ ${Number(item.preco_unitario || item.preco).toFixed(2)}</td>
                </tr>
            `;
        });

        let pagamentosHtml = '';
        transacoes.forEach((t, i) => {
            let desc = i === 0 && transacoes.length > 1 ? "Sinal (Online)" : (transacoes.length > 1 ? "Restante (Local)" : "Pagamento");
            pagamentosHtml += `<p style="margin: 3px 0;"><strong>${desc} via ${t.gateway_provider}:</strong> R$ ${Number(t.valor_bruto).toFixed(2)}</p>`;
        });

        if (transacoes.length === 0) {
            pagamentosHtml = `<p>Sem registro financeiro (Pendente)</p>`;
        }

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Pedido #${pedido.id_pedido}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: auto; }
                    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
                    .info-box { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                    th { background: #eee; padding: 10px; text-align: left; }
                    .total { text-align: right; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
                    .payments { background: #f0fdf4; padding: 15px; border-radius: 8px; border: 1px solid #bbf7d0; }
                </style>
            </head>
            <body onload="window.print()">
                <div class="header">
                    <h1>DOCUMENTO DE PEDIDO</h1>
                    <h2>PEDIDO #${pedido.id_pedido}</h2>
                </div>
                
                <div class="info-box">
                    <p><strong>Cliente:</strong> ${pedido.usuarios?.nome_completo || 'Não informado'}</p>
                    <p><strong>Data:</strong> ${new Date(pedido.data_pedido).toLocaleString('pt-BR')}</p>
                    <p><strong>Status do Pedido:</strong> ${pedido.status_pagamento}</p>
                    <p><strong>Método(s) Usado(s):</strong> ${pedido.metodo_pagamento}</p>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Qtd</th>
                            <th>Produto</th>
                            <th style="text-align: right;">Valor Unitário</th>
                        </tr>
                    </thead>
                    <tbody>${itensHtml}</tbody>
                </table>

                <div class="total">TOTAL: R$ ${Number(pedido.preco_total).toFixed(2)}</div>

                <div class="payments">
                    <h3 style="margin-top: 0; font-size: 16px;">Histórico de Pagamento:</h3>
                    ${pagamentosHtml}
                </div>
            </body>
            </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);

    } catch (error) {
        next(error);
    }
};

export const imprimirTermicaCaixa = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const id_tenant = req.tenantId;

        const pedido = await prisma.pedidos.findFirst({
            where: { id_pedido: id_pedido, id_tenant },
            include: { pedido_items: true }
        });
        
        if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });

        const impPadrao = await prisma.impressoras.findFirst({
            where: { id_tenant, is_padrao: true, ativo: true }
        });

        if (!impPadrao) return res.status(400).json({ message: "Nenhuma impressora padrão configurada na loja." });

        const transacoes = await prisma.transacoes_financeiras.findMany({
            where: { id_pedido: pedido.id_pedido, id_tenant },
            orderBy: { data_criacao: 'asc' }
        });

        let historicoPagto = transacoes.map((t, idx) => ({
            label: idx === 0 && transacoes.length > 1 ? "Sinal" : "Pgto",
            metodo: t.gateway_provider,
            valor: Number(t.valor_bruto)
        }));

        const printJob = {
            tipo: 'CONTA',
            mesa: `Pedido #${pedido.id_pedido}`,
            impressora: impPadrao,
            total: pedido.preco_total,
            itens: pedido.pedido_items.map(i => ({ 
                nome: i.nome_produto || i.nome, 
                quantidade: i.quantidade, 
                preco: i.preco_unitario || i.preco 
            })),
            pagamentos: historicoPagto // Enviando os pagamentos fragmentados para a térmica
        };

        if (req.app.get('io')) {
            req.app.get('io').emit('NOVA_IMPRESSAO', {
                id_tenant: id_tenant,
                jobs: [printJob]
            });
        }

        res.status(200).json({ message: "Comando de impressão enviado para a máquina do caixa!" });

    } catch (error) {
        next(error);
    }
};

// ============================================================================
// OUTRAS FUNÇÕES GLOBAIS (Não alteradas)
// ============================================================================
export const adicionarMovimentacao = async (req, res) => {
    try {
        const { tipo, valor, motivo } = req.body;
        const id_tenant = req.tenantId;
        const id_usuario = await obterIdUsuarioReal(req.user, id_tenant);

        const caixa = await prisma.caixa_pdv.findFirst({
            where: { id_usuario, status: 'ABERTO', id_tenant }
        });

        if (!caixa) return res.status(400).json({ message: 'Caixa fechado.' });

        const valorNum = Number(valor);
        const novoSaldo = tipo === 'ENTRADA' ? Number(caixa.saldo_sistema) + valorNum : Number(caixa.saldo_sistema) - valorNum;

        await prisma.$transaction([
            prisma.movimentacao_caixa.create({
                data: { id_caixa: caixa.id_caixa, tipo, valor: valorNum, motivo }
            }),
            prisma.caixa_pdv.updateMany({
                where: { id_caixa: caixa.id_caixa, id_tenant }, data: { saldo_sistema: novoSaldo }
            })
        ]);

        res.json({ message: 'Movimentação registrada.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getHistoricoVendas = async (req, res, next) => {
    try {
        const vendas = await prisma.pedidos.findMany({
            where: { id_caixa_pdv: { not: null }, id_tenant: req.tenantId },
            take: 50,
            orderBy: { data_pedido: 'desc' },
            include: { usuarios: { select: { nome_completo: true } }, pedido_items: true }
        });
        res.status(200).json(vendas);
    } catch (error) {
        next(error);
    }
};

export const getHistoricoCaixas = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const id_usuario = await obterIdUsuarioReal(req.user, id_tenant);

        const caixas = await prisma.caixa_pdv.findMany({
            where: { id_usuario, id_tenant }, orderBy: { data_abertura: 'desc' }, take: 20
        });

        res.json(caixas);
    } catch (error) {
        next(error);
    }
};

export const getRelatorioFechamento = async (req, res, next) => {
    try {
        const { id_caixa } = req.params;
        const id_tenant = req.tenantId;

        const caixa = await prisma.caixa_pdv.findFirst({
            where: { id_caixa: Number(id_caixa), id_tenant },
            include: { funcionarios: { select: { nome_completo: true } } } // 🟢 CORRIGIDO AQUI
        });

        if (!caixa) return res.status(404).json({ message: "Caixa não encontrado." });

        const vendasPorMetodo = await prisma.pedidos.groupBy({
            by: ['metodo_pagamento'],
            where: { id_caixa_pdv: caixa.id_caixa, status_pagamento: 'PAGO', id_tenant },
            _sum: { preco_total: true }
        });

        const movimentacoes = await prisma.movimentacao_caixa.groupBy({
            by: ['tipo'],
            where: { id_caixa: caixa.id_caixa },
            _sum: { valor: true }
        });

        const totalVendas = vendasPorMetodo.reduce((acc, curr) => acc + Number(curr._sum.preco_total || 0), 0);
        const totalEntradas = movimentacoes.find(m => m.tipo === 'ENTRADA')?._sum.valor || 0;
        const totalSaidas = movimentacoes.find(m => m.tipo === 'SAIDA')?._sum.valor || 0;
        const diferenca = Number(caixa.saldo_final || 0) - Number(caixa.saldo_sistema);

        const listaVendas = await prisma.pedidos.findMany({
            where: { id_caixa_pdv: caixa.id_caixa, status_pagamento: 'PAGO', id_tenant },
            select: {
                id_pedido: true, data_pedido: true, metodo_pagamento: true, preco_total: true,
                usuarios: { select: { nome_completo: true } }
            },
            orderBy: { data_pedido: 'desc' }
        });

        const relatorio = {
            info: {
                id: caixa.id_caixa, 
                operador: caixa.funcionarios?.nome_completo || 'Operador não identificado', // 🟢 CORRIGIDO AQUI
                abertura: caixa.data_abertura,
                fechamento: caixa.data_fechamento, status: caixa.status, observacoes: caixa.observacoes
            },
            financeiro: {
                saldo_inicial: Number(caixa.saldo_inicial), total_vendas: totalVendas,
                total_suprimentos: Number(totalEntradas), total_sangrias: Number(totalSaidas),
                saldo_sistema_calculado: Number(caixa.saldo_sistema), saldo_informado_fechamento: Number(caixa.saldo_final || 0),
                quebra_caixa: diferenca
            },
            detalhamento_pagamentos: vendasPorMetodo.map(v => ({
                metodo: v.metodo_pagamento, total: Number(v._sum.preco_total)
            })),
            vendas: listaVendas
        };

        res.json(relatorio);
    } catch (error) {
        next(error);
    }
};