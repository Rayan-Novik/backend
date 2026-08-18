import { PrismaClient } from '@prisma/client';
import { processarPagamento } from './paymentFactory.js';
import { registrarEntradaFinanceira, gerarRecebivelDePedido } from './financialService.js';

const prisma = new PrismaClient();

// Esta é a função que a IA está tentando chamar e que estava faltando
export const processarVendaService = async (dadosVenda, usuarioLogado) => {
    const { 
        itens, 
        metodo_pagamento, 
        valor_recebido, 
        cliente_id,
        canal_venda = 'PDV' 
    } = dadosVenda;

    // 1. Validação Básica
    if (!itens || itens.length === 0) {
        throw new Error("O carrinho está vazio.");
    }

    // 2. Verifica Caixa Aberto
    const caixa = await prisma.caixa_pdv.findFirst({
        where: { id_usuario: usuarioLogado.id_usuario, status: 'ABERTO' }
    });

    if (!caixa) throw new Error('Caixa fechado. Abra o caixa para realizar vendas.');

    // 3. Prepara Cliente
    let id_usuario_pedido = cliente_id;
    if (!id_usuario_pedido) {
        let consumidor = await prisma.usuarios.findUnique({ where: { email: 'consumidor@pdv.padrao' } });
        if (!consumidor) {
            consumidor = await prisma.usuarios.create({
                data: { nome_completo: 'Consumidor Final', email: 'consumidor@pdv.padrao', hash_senha: 'safe', role: 'CLIENTE' }
            });
        }
        id_usuario_pedido = consumidor.id_usuario;
    }

    // 4. Busca Produtos e Calcula Total
    const idsProdutos = itens.map(i => i.id_produto);
    const produtosDb = await prisma.produtos.findMany({ where: { id_produto: { in: idsProdutos } } });

    let totalVenda = 0;
    const itensParaSalvar = itens.map(itemFront => {
        const produtoReal = produtosDb.find(p => p.id_produto === itemFront.id_produto);
        if (!produtoReal) throw new Error(`Produto ID ${itemFront.id_produto} não encontrado.`);
        
        const preco = Number(produtoReal.preco);
        const qtd = Number(itemFront.quantidade);
        totalVenda += (preco * qtd);

        return {
            id_produto: produtoReal.id_produto,
            nome: produtoReal.nome,
            quantidade: qtd,
            preco: preco,
            imagem_url: produtoReal.imagem_url
        };
    });

    // 5. Lógica de Pagamento
    let status_pagamento = 'PENDENTE';
    let gateway_info = { id: `PDV-${Date.now()}`, gateway: 'PDV_LOCAL' };

    if (metodo_pagamento === 'DINHEIRO') {
        if (Number(valor_recebido) < totalVenda) throw new Error('Valor recebido insuficiente.');
        status_pagamento = 'PAGO';
    } else if (['CARTAO_CREDITO', 'CARTAO_DEBITO'].includes(metodo_pagamento)) {
        status_pagamento = 'PAGO';
    } else if (metodo_pagamento === 'PIX') {
        try {
            // Tenta gerar o PIX real
            const pgto = await processarPagamento('PIX', { amount: totalVenda, payer: { email: usuarioLogado.email || 'cliente@temp.com' } });
            gateway_info = pgto;
            status_pagamento = 'PENDENTE'; 
        } catch (e) {
            console.error("Erro ao gerar Pix:", e);
            // Fallback
            gateway_info = { id: `PIX-MANUAL-${Date.now()}`, gateway: 'MANUAL', qr_code: 'erro-geracao' };
        }
    }

    // 6. Transação no Banco
    const venda = await prisma.$transaction(async (tx) => {
        const novoPedido = await tx.pedidos.create({
            data: {
                usuarios: { connect: { id_usuario: id_usuario_pedido } },
                caixa_pdv: { connect: { id_caixa: caixa.id_caixa } },
                preco_total: totalVenda,
                preco_itens: totalVenda,
                preco_frete: 0,
                metodo_pagamento,
                status_pagamento,
                status_entrega: 'Entregue',
                canal_venda,
                data_pedido: new Date(),
                id_pagamento_gateway: String(gateway_info.id),
                gateway_provider: gateway_info.gateway,
                pedido_items: {
                    create: itensParaSalvar.map(i => ({
                        id_produto: i.id_produto,
                        nome: i.nome,
                        quantidade: i.quantidade,
                        preco: i.preco,
                        imagem_url: i.imagem_url
                    }))
                }
            },
            include: { pedido_items: true }
        });

        // Log Financeiro Rápido
        await tx.transacoes_financeiras.create({
            data: {
                id_pedido: novoPedido.id_pedido,
                id_usuario: id_usuario_pedido,
                gateway_provider: canal_venda,
                gateway_id: `${canal_venda}-${novoPedido.id_pedido}`,
                tipo: 'VENDA',
                valor_bruto: totalVenda,
                valor_taxa: 0,
                valor_liquido: totalVenda,
                data_criacao: new Date()
            }
        });

        // Atualiza Caixa se for Dinheiro
        if (metodo_pagamento === 'DINHEIRO') {
            await tx.caixa_pdv.update({
                where: { id_caixa: caixa.id_caixa },
                data: { saldo_sistema: { increment: totalVenda } }
            });
        }

        // Baixa Estoque
        for (const item of itensParaSalvar) {
            await tx.produtos.update({
                where: { id_produto: item.id_produto },
                data: { estoque: { decrement: item.quantidade } }
            });
        }

        return novoPedido;
    });

    // 7. Financeiro Completo
    try {
        await gerarRecebivelDePedido(venda, 2); 
        await registrarEntradaFinanceira({
            id_pedido: venda.id_pedido,
            id_usuario: id_usuario_pedido,
            gateway_provider: canal_venda,
            gateway_id: `${canal_venda}-${venda.id_pedido}`,
            valor_bruto: totalVenda,
            valor_taxa_real: 0
        });
    } catch (e) {
        console.error("Erro financeiro pós-venda:", e);
    }

    return {
        pedido: venda,
        troco: metodo_pagamento === 'DINHEIRO' ? Number(valor_recebido) - totalVenda : 0,
        gateway_data: gateway_info
    };
};