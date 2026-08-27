import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import { MercadoPagoConfig, Preference } from 'mercadopago';
import CarrinhoModel from '../models/carrinhoModel.js';
import PedidoModel from '../models/pedidoModel.js';
import CupomModel from '../models/cupomModel.js';
import ConfiguracaoModel from '../models/configuracaoModel.js';
import { syncEstoqueIfoodAutomated } from './integration/ifood/produtoIfoodController.js';

import { sendWhatsAppMessage } from '../services/whatsapp/sender.js';
import { sendWhatsAppPaymentReceipt } from '../services/whatsapp/templates.js';

import UsuarioModel from '../models/usuarioModel.js';
import Produto from '../models/produtoModel.js';
import { decrypt } from '../services/cryptoService.js';
import { calcularDesconto } from '../services/discountService.js';
import { processarPagamento } from '../services/paymentFactory.js';
import { analisarRisco } from '../services/antifraudService.js';
import { registrarEntradaFinanceira, gerarRecebivelDePedido } from '../services/financialService.js';
import { sendOrderOutForDeliveryEmail, sendOrderReadyForPickupEmail } from '../services/emailService.js';
import crypto from 'crypto';
import axios from 'axios';
import cron from 'node-cron';

let isCronRunning = false;

cron.schedule('*/10 * * * *', async () => {
    if (isCronRunning) {
        console.log('⚠️ [CRON] O job anterior ainda está rodando. Pulando execução.');
        return;
    }

    isCronRunning = true;

    try {
        console.log('⏰ [CRON] Iniciando varredura de pedidos expirados (1h+)...');
        const total = await PedidoModel.cancelarPedidosExpirados();

        if (total > 0) {
            console.log(`✅ [CRON] Sucesso: ${total} pedido(s) cancelado(s) e estoque estornado.`);
        } else {
            console.log('ℹ️ [CRON] Nenhum pedido expirado encontrado.');
        }
    } catch (error) {
        console.error('❌ [CRON] Erro crítico ao cancelar pedidos:', error);
    } finally {
        isCronRunning = false;
    }
});

const verificarLojaAberta = (horaAbertura, horaFechamento, diasStr = "0,1,2,3,4,5,6") => {
    if (!horaAbertura || !horaFechamento) return true;

    const dateManaus = new Date(new Date().toLocaleString("en-US", { timeZone: 'America/Manaus' }));
    const diaAtual = dateManaus.getDay();
    const diasAbertos = diasStr.split(',').map(Number);

    if (!diasAbertos.includes(diaAtual)) return false;

    const horaAtual = dateManaus.getHours();
    const minutoAtual = dateManaus.getMinutes();
    const minutosAgora = horaAtual * 60 + minutoAtual;

    const [abreH, abreM] = horaAbertura.split(':').map(Number);
    const minutosAbre = abreH * 60 + abreM;

    const [fechaH, fechaM] = horaFechamento.split(':').map(Number);
    const minutosFecha = fechaH * 60 + fechaM;

    if (minutosFecha < minutosAbre) {
        return minutosAgora >= minutosAbre || minutosAgora <= minutosFecha;
    }

    return minutosAgora >= minutosAbre && minutosAgora <= minutosFecha;
};

const notificarCliente = async (pedidoDb, tipoMensagem, id_tenant) => {
    const usuario = await prisma.usuarios.findFirst({
        where: { id_usuario: pedidoDb.id_usuario, id_tenant: id_tenant }
    });

    if (!usuario) return;

    const telefoneCliente = usuario.telefone_criptografado ? decrypt(usuario.telefone_criptografado) : null;
    const nomeCliente = usuario.nome_completo.split(' ')[0];

    if (tipoMensagem === 'EM_ROTA') {
        await sendOrderOutForDeliveryEmail(usuario, pedidoDb);
    } else if (tipoMensagem === 'PRONTO_RETIRADA') {
        await sendOrderReadyForPickupEmail(usuario, pedidoDb);
    }

    const numeroLimpo = telefoneCliente ? telefoneCliente.replace(/\D/g, '') : '';

    if (numeroLimpo && numeroLimpo.length >= 10) {
        let msgWhatsApp = '';

        if (tipoMensagem === 'EM_ROTA') {
            const linkRastreio = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/order/${pedidoDb.id_pedido}`;
            msgWhatsApp = `🚚 Olá *${nomeCliente}*! O seu pedido *#${pedidoDb.id_pedido}* acabou de sair para entrega.\n\n` +
                `🔑 *Seu código de segurança (PIN):* ${pedidoDb.delivery_pin}\n` +
                `Informe este código ao entregador para receber sua encomenda.\n\n` +
                `📍 *Acompanhe seu pedido aqui:* ${linkRastreio}`;

        } else if (tipoMensagem === 'PRONTO_RETIRADA') {
            msgWhatsApp = `🛍️ Olá *${nomeCliente}*! O seu pedido *#${pedidoDb.id_pedido}* já foi separado e está *pronto para retirada* em nossa loja.\n\n` +
                `Lembre-se de levar um documento com foto e informar o número do pedido. Estamos te esperando!`;
        }

        await sendWhatsAppMessage(telefoneCliente, { text: msgWhatsApp }, id_tenant);
    } else {
        console.log(`⚠️ Cliente ${nomeCliente} não possui um número de WhatsApp válido cadastrado.`);
    }
};

export const criarPreferenciaMP = async (req, res) => {
    try {
        const { total, description } = req.body;
        const accessToken = await ConfiguracaoModel.get('MERCADOPAGO_ACCESS_TOKEN', req.tenantId);
        if (!accessToken) return res.status(500).json({ message: 'Access Token MP não configurado.' });

        const client = new MercadoPagoConfig({ accessToken: accessToken.trim() });
        const preference = new Preference(client);

        const result = await preference.create({
            body: {
                items: [{ id: 'item-wallet', title: description || 'Compra na Loja', quantity: 1, unit_price: Number(total), currency_id: 'BRL' }],
                back_urls: {
                    success: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/order-success`,
                    failure: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment`,
                    pending: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment`,
                },
                auto_return: 'approved',
            }
        });

        res.json({ id: result.id });
    } catch (error) {
        console.error("Erro ao criar preferência MP:", error);
        res.status(500).json({ message: 'Erro ao gerar carteira Mercado Pago.' });
    }
};

export const criarPedido = async (req, res, next) => {
    try {
        const id_usuario = req.user?.id_usuario || (req.body.id_usuario ? Number(req.body.id_usuario) : null);
        const id_tenant = req.tenantId;

        if (!id_usuario) return res.status(401).json({ message: "Usuário não identificado. Faça login novamente." });

        const loja = await prisma.lojas.findFirst({ where: { id_tenant: id_tenant, ativo: true } });

        if (loja) {
            const isAberta = verificarLojaAberta(loja.hora_abertura, loja.hora_fechamento, loja.dias_funcionamento);
            if (!isAberta) return res.status(400).json({ message: `A loja encontra-se fechada no momento.` });
        }

        let ipCliente = 
            req.headers['cf-connecting-ip'] || 
            req.headers['x-real-ip'] || 
            (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) || 
            req.socket.remoteAddress;

        if (!ipCliente || ipCliente === '::1' || ipCliente.includes('127.0.0.1') || ipCliente.match(/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/)) {
            ipCliente = '179.184.10.10'; 
        }

        const {
            id_endereco_entrega, preco_frete = 0, paymentMethod, paymentData, dados_entrega, cupom_aplicado, id_cupom, device_id
        } = req.body;

        if (!id_endereco_entrega && Number(preco_frete) > 0 && !dados_entrega) {
            return res.status(400).json({ message: "O endereço de entrega é obrigatório." });
        }

        let carrinhoItensRaw = await CarrinhoModel.findByUserId(id_usuario, id_tenant);
        if (carrinhoItensRaw.length === 0) return res.status(400).json({ message: "Seu carrinho está vazio." });

        const carrinhoMap = new Map();
        for (const item of carrinhoItensRaw) {
            const idProd = item.produtos.id_produto;
            if (item.id_variacao) {
                const varDb = await prisma.produto_variacoes.findUnique({ where: { id_variacao: Number(item.id_variacao) } });
                item.variacao = varDb;
            }
            
            // 🟢 CORREÇÃO: Garante que itens com complementos/observações diferentes não sejam fundidos num só
            const uniqueKey = item.id_carrinho_item || (Date.now() + Math.random()).toString();
            
            if (!carrinhoMap.has(uniqueKey)) carrinhoMap.set(uniqueKey, item);
        }

        const carrinhoItens = Array.from(carrinhoMap.values());
        const usuario = await UsuarioModel.findById(id_usuario, id_tenant);
        if (!usuario) return res.status(404).json({ message: "Usuário não encontrado." });

        const cpfLimpo = decrypt(usuario.cpf_criptografado);
        const telefoneLimpo = decrypt(usuario.telefone_criptografado);

        if (!cpfLimpo) return res.status(400).json({ message: "CPF do usuário não encontrado ou inválido." });

        // 🟢 CÁLCULO DE PREÇO CORRIGIDO PARA SOMAR VARIAÇÕES E COMPLEMENTOS
        const preco_itens = carrinhoItens.reduce((total, item) => {
            let precoBase = parseFloat(item.produtos.preco || 0);
            
            if (item.variacao && item.variacao.preco_adicional) {
                precoBase += parseFloat(item.variacao.preco_adicional);
            }
            
            let precoComplementos = 0;
            let compsArray = [];
            if (item.complementos) {
                try {
                    compsArray = typeof item.complementos === 'string' ? JSON.parse(item.complementos) : item.complementos;
                    compsArray.forEach(c => {
                        // Soma o preço de cada adicional multiplicado pela sua quantidade
                        precoComplementos += (parseFloat(c.preco_adicional || c.preco || 0) * parseInt(c.quantidade || 1, 10));
                    });
                } catch (e) { console.error("Erro ao calcular complementos:", e); }
            }
            
            // Preço unitário total deste item específico (Produto + Variação + Adicionais)
            const precoUnitarioTotal = precoBase + precoComplementos;
            return total + (precoUnitarioTotal * parseInt(item.quantidade, 10));
        }, 0);

        let valorDescontoCupom = 0;
        let cupomId = null;
        let cupomDb = null;

        if (cupom_aplicado && cupom_aplicado.code) cupomDb = await CupomModel.findByCode(cupom_aplicado.code, id_tenant);
        else if (id_cupom) cupomDb = await prisma.cupons_desconto.findFirst({ where: { id_cupom: Number(id_cupom), id_tenant: id_tenant } });

        if (cupomDb) {
            const carrinhoFormatado = carrinhoItens.map(i => ({ id_produto: i.produtos.id_produto, preco: i.produtos.preco, quantidade: i.quantidade, produto: i.produtos }));
            try {
                valorDescontoCupom = calcularDesconto(carrinhoFormatado, cupomDb, Number(preco_frete));
                cupomId = cupomDb.id_cupom;
                await CupomModel.incrementUsage(cupomDb.id_cupom, id_tenant);
            } catch (err) { console.error("Erro cupom:", err.message); }
        }

        let preco_total_calculado = Math.max(0, preco_itens + Number(preco_frete) - valorDescontoCupom);
        let valorDescontoPix = 0;

        if (paymentMethod === 'PIX' && !cupomId) {
            const pixAtivoStr = await ConfiguracaoModel.get('pix_desconto_ativo', id_tenant);
            const pixPorcentagemStr = await ConfiguracaoModel.get('pix_desconto_porcentagem', id_tenant);
            if (pixAtivoStr === 'true') {
                valorDescontoPix = preco_total_calculado * (Number(pixPorcentagemStr) / 100);
                preco_total_calculado -= valorDescontoPix;
            }
        }

        const preco_total_final = Number(preco_total_calculado.toFixed(2));
        let snapshotEndereco = dados_entrega || {};

        if (id_endereco_entrega) {
            const enderecoDb = await prisma.enderecos.findFirst({
                where: { id_endereco: Number(id_endereco_entrega), id_usuario: Number(id_usuario), is_active: true }
            });
            if (!enderecoDb) return res.status(400).json({ message: "Endereço de entrega inválido." });

            snapshotEndereco = {
                entrega_logradouro: enderecoDb.logradouro,
                entrega_numero: enderecoDb.numero,
                entrega_bairro: enderecoDb.bairro,
                entrega_cidade: enderecoDb.cidade,
                entrega_estado: enderecoDb.estado,
                entrega_cep: enderecoDb.cep,
                entrega_complemento: enderecoDb.complemento
            };
        }

        const analiseRisco = await analisarRisco(usuario, { totalPrice: preco_total_final, ...snapshotEndereco }, carrinhoItens, ipCliente, id_tenant);

        if (analiseRisco.acao === 'BLOQUEAR') {
            console.warn(`⛔ Pedido Bloqueado! User: ${id_usuario}, Score: ${analiseRisco.score}`);
            return res.status(403).json({ message: "Transação não autorizada por motivos de segurança." });
        }

        const riscoPedido = analiseRisco.score;
        const [primeiroNome, ...sobrenomeArray] = usuario.nome_completo.split(' ');

        const payerDataNormalized = {
            email: usuario.email,
            firstName: primeiroNome,
            lastName: sobrenomeArray.join(' ') || 'Cliente',
            cpf: cpfLimpo,
            identification: { type: "CPF", number: cpfLimpo },
            phone: telefoneLimpo || '11999999999',
            address: {
                street: snapshotEndereco.entrega_logradouro || 'Rua Geral',
                number: snapshotEndereco.entrega_numero || 'S/N',
                city: snapshotEndereco.entrega_cidade || 'Cidade',
                state: snapshotEndereco.entrega_estado || 'SP',
                zip: snapshotEndereco.entrega_cep || '00000000',
                neighborhood: snapshotEndereco.entrega_bairro || 'Centro'
            }
        };

        const itemsParaGateway = [{
            id: `PED-${Date.now()}`,
            title: 'Pedido na Loja',
            description: `Compra contendo ${carrinhoItens.length} item(ns)`,
            category_id: 'others',
            quantity: 1,
            unit_price: preco_total_final
        }];

        const resultadoPagamento = await processarPagamento(paymentMethod, {
            amount: preco_total_final,
            token: paymentData.token,
            installments: paymentData.installments,
            payment_method_id: paymentData.payment_method_id,
            issuer_id: paymentData.issuer_id,
            items: itemsParaGateway,
            device_id: device_id,
            ip_address: ipCliente, 
            orderId: `PED-${Date.now()}`,
            payer: { ...payerDataNormalized, email: paymentData.payer?.email || payerDataNormalized.email },
            card: paymentData.card
        }, id_tenant);

        const statusPagamento = ['approved', 'succeeded', 'paid', 'CONFIRMED'].includes(resultadoPagamento.status) ? 'PAGO' : 'PENDENTE';

        const urlParaSalvar = resultadoPagamento.url_boleto || resultadoPagamento.url_pdf || resultadoPagamento.payment_url || null;
        const codigoParaSalvar = resultadoPagamento.boleto_data?.linha_digitavel || resultadoPagamento.pix_data?.qr_code || null;

        const pedidoCriado = await PedidoModel.create({
            id_usuario,
            id_endereco_entrega: id_endereco_entrega ? Number(id_endereco_entrega) : null,
            metodo_pagamento: paymentData.payment_method_id || paymentMethod,
            canal_venda: 'site',
            preco_itens, preco_frete, preco_total: preco_total_final,
            status_pagamento: statusPagamento,
            id_pagamento_gateway: String(resultadoPagamento.id),
            gateway_provider: resultadoPagamento.gateway,
            id_cupom_utilizado: cupomId,
            url_boleto: urlParaSalvar,
            linha_digitavel: codigoParaSalvar,
            id_tenant: id_tenant,
            ...snapshotEndereco
        }, carrinhoItens, id_tenant);

        try {
            for (const item of carrinhoItens) {
                const qtdComprada = Number(item.quantidade);
                const idProd = Number(item.produtos.id_produto);

                const produtoVendido = await prisma.produtos.findUnique({
                    where: { id_produto: idProd },
                    include: { composicao_pai: { include: { insumo: true } } }
                });

                if (produtoVendido && produtoVendido.composicao_pai && produtoVendido.composicao_pai.length > 0) {
                    for (const ingrediente of produtoVendido.composicao_pai) {
                        const qtdParaAbater = Number(ingrediente.quantidade_necessaria) * qtdComprada;
                        if (ingrediente.insumo) {
                            const novoEstoqueInsumo = Number(ingrediente.insumo.estoque) - qtdParaAbater;
                            await prisma.produtos.update({ where: { id_produto: ingrediente.id_insumo }, data: { estoque: novoEstoqueInsumo } });
                            await prisma.movimentacaoEstoque.create({
                                data: {
                                    id_produto: ingrediente.id_insumo, quantidade: qtdParaAbater, tipo: 'SAIDA',
                                    saldo_momento: novoEstoqueInsumo, motivo: `Consumo automático (Venda #${pedidoCriado.id_pedido || pedidoCriado.id})`,
                                    origem_destino: 'Venda E-commerce', usuario_id: id_usuario,
                                }
                            });
                        }
                    }
                    await prisma.produtos.update({ where: { id_produto: idProd }, data: { estoque: { increment: qtdComprada } } });
                }
            }
        } catch (estoqueErr) { console.error("⚠️ Erro baixa de insumos:", estoqueErr); }

        try {
            for (const item of carrinhoItens) {
                const prodDb = await prisma.produtos.findUnique({ where: { id_produto: item.produtos.id_produto } });
                if (prodDb) await syncEstoqueIfoodAutomated(id_tenant, prodDb.id_produto, prodDb.estoque);
            }
        } catch (ifoodSyncErr) { console.error("⚠️ Erro iFood Sync:", ifoodSyncErr); }

        if (statusPagamento === 'PAGO') {
            const novaReputacao = Math.min(100, (usuario.score_reputacao || 50) + 10);
            await UsuarioModel.update(usuario.id_usuario, { score_reputacao: novaReputacao }, id_tenant);

            let taxaFinal = 0;
            if (resultadoPagamento.fee_amount) taxaFinal = Number(resultadoPagamento.fee_amount);
            else if (resultadoPagamento.original_response?.fee_details) {
                taxaFinal = resultadoPagamento.original_response.fee_details.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
            }

            await registrarEntradaFinanceira({
                id_pedido: pedidoCriado.id_pedido || pedidoCriado.id, id_usuario: id_usuario,
                gateway_provider: resultadoPagamento.gateway, gateway_id: String(resultadoPagamento.id),
                tipo: 'ENTRADA', valor_bruto: preco_total_final, valor_taxa: taxaFinal,
                valor_liquido: preco_total_final - taxaFinal, id_tenant: id_tenant
            });
        }

        try { await gerarRecebivelDePedido(pedidoCriado, id_tenant); } catch (finError) {}

        const isOffline = String(paymentMethod).toUpperCase().includes('OFFLINE');

        if (statusPagamento === 'PAGO' || isOffline) {
            try {
                const lojaInfo = await prisma.tenants.findUnique({
                    where: { id: Number(id_tenant) }, select: { nome_fantasia: true, telefone_contato: true }
                });
                const nomeDaLoja = lojaInfo?.nome_fantasia || 'Nossa Loja';
                const telefoneLojista = lojaInfo?.telefone_contato;
                const linkAcompanhamento = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/order/${pedidoCriado.id_pedido || pedidoCriado.id}`;

                await sendWhatsAppPaymentReceipt(telefoneLimpo, pedidoCriado, usuario, carrinhoItens, linkAcompanhamento, id_tenant, nomeDaLoja);

                if (telefoneLojista) {
                    let telefoneLimpoLojista = telefoneLojista.replace(/\D/g, '');
                    if (telefoneLimpoLojista.length >= 10) {
                        if (!telefoneLimpoLojista.startsWith('55')) telefoneLimpoLojista = '55' + telefoneLimpoLojista;
                        const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco_total_final);
                        
                        // 🟢 WHATSAPP LOJISTA: INCLUINDO COMPLEMENTOS E VARIAÇÕES
                        let itensComprados = '';
                        carrinhoItens.forEach(item => { 
                            itensComprados += `\n- ${item.quantidade}x ${item.produtos.nome}`; 
                            if (item.variacao?.cor || item.cor) itensComprados += ` (Cor: ${item.variacao?.cor || item.cor})`;
                            if (item.variacao?.tamanho || item.tamanho) itensComprados += ` (Tam: ${item.variacao?.tamanho || item.tamanho})`;
                            
                            try {
                                const comps = typeof item.complementos === 'string' ? JSON.parse(item.complementos) : (item.complementos || []);
                                comps.forEach(c => {
                                    itensComprados += `\n   + ${c.quantidade}x ${c.nome || c.produto_add?.nome}`;
                                });
                            } catch(e) {}
                            
                            if (item.observacao) itensComprados += `\n   *Obs:* ${item.observacao}`;
                        });

                        const idDoPedidoReal = pedidoCriado.id_pedido || pedidoCriado.id;
                        const zapCliente = telefoneLimpo ? `+55${telefoneLimpo}` : 'Não informado';
                        const msgLojista = `🔔 *NOVO PEDIDO RECEBIDO!* 🔔\n\nOlá, equipe da *${nomeDaLoja}*!\nVocês acabam de receber um novo pedido.\n\n📦 *Pedido:* #${idDoPedidoReal}\n👤 *Cliente:* ${usuario.nome_completo || 'Não informado'}\n📞 *WhatsApp:* ${zapCliente}\n💳 *Valor Total:* ${valorFormatado}\n📱 *Status do Pagto:* ${statusPagamento}\n\n🛍️ *Itens Comprados:*${itensComprados}`;

                        await sendWhatsAppMessage(telefoneLimpoLojista, { text: msgLojista }, 1);
                    }
                }
            } catch (err) {}
        }

        await CarrinhoModel.clear(id_usuario, id_tenant);

        try {
            const autoPrintTermica = await ConfiguracaoModel.get('IMPRIMIR_TERMICA_AUTO', id_tenant);
            const io = req.app.get('socketio');
            const idReal = pedidoCriado.id_pedido || pedidoCriado.id;

            if (io) {
                io.emit('novo_pedido', {
                    id: idReal, total: preco_total_final, cliente: usuario.nome_completo,
                    status: statusPagamento, canal: 'site', risco: riscoPedido, id_tenant: id_tenant
                });

                if (autoPrintTermica === 'true') {
                    const impPadrao = await prisma.impressoras.findFirst({ where: { id_tenant, is_padrao: true, ativo: true } });
                    if (impPadrao) {
                        // 🟢 IMPRESSÃO TÉRMICA: ENVIANDO EXTRAS PARA O WEBSOCKET
                        const printJob = {
                            tipo: 'CONTA', mesa: `Delivery #${idReal}`, impressora: impPadrao, total: preco_total_final,
                            itens: carrinhoItens.map(i => {
                                let comps = [];
                                try { comps = typeof i.complementos === 'string' ? JSON.parse(i.complementos) : (i.complementos || []) } catch(e){}
                                return { 
                                    nome: i.produtos.nome, 
                                    quantidade: i.quantidade, 
                                    preco: (parseFloat(i.produtos.preco || 0) + parseFloat(i.variacao?.preco_adicional || 0)).toString(),
                                    cor: i.variacao?.cor || i.cor,
                                    tamanho: i.variacao?.tamanho || i.tamanho,
                                    observacao: i.observacao,
                                    complementos: comps
                                };
                            })
                        };
                        io.emit('NOVA_IMPRESSAO', { id_tenant: id_tenant, jobs: [printJob] });
                    }
                }
            }
        } catch (printErr) {}

        const paymentInfoResponse = {
            transaction_amount: preco_total_final, id_pagamento: resultadoPagamento.id, status: statusPagamento,
            gateway: resultadoPagamento.gateway, payment_url: resultadoPagamento.payment_url,
            qr_code: resultadoPagamento.pix_data?.qr_code, qr_code_base64: resultadoPagamento.pix_data?.qr_code_base64,
            date_of_expiration: resultadoPagamento.pix_data?.expiration, boleto_data: resultadoPagamento.boleto_data,
            url_boleto: urlParaSalvar, linha_digitavel: codigoParaSalvar
        };

        res.status(201).json({ message: "Pedido processado!", pedido: pedidoCriado, paymentInfo: paymentInfoResponse });

    } catch (error) {
        console.error("Erro no criarPedido:", error);
        const msg = error.message || "Erro desconhecido ao processar pedido.";
        res.status(400).json({ message: msg });
    }
};

export const getPedidoById = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const id_usuario_logado = req.user.id_usuario;
        const is_admin_logado = req.user.isAdmin;
        const id_tenant = req.tenantId;

        let temPermissaoDeStaff = is_admin_logado; 

        if (!temPermissaoDeStaff) {
            const userPerms = req.user.permissoes || [];
            const rolePerms = req.user.cargo?.permissoes || [];

            if (userPerms.includes('PEDIDOS_VIEW') || userPerms.includes('PEDIDOS_MANAGE') ||
                rolePerms.includes('PEDIDOS_VIEW') || rolePerms.includes('PEDIDOS_MANAGE')) {
                temPermissaoDeStaff = true;
            }
        }

        const idUsuarioParaFiltro = temPermissaoDeStaff ? undefined : id_usuario_logado;

        const pedidoCompleto = await PedidoModel.findById(id_pedido, idUsuarioParaFiltro, id_tenant);

        if (pedidoCompleto) {
            try {
                if (pedidoCompleto.cliente) {
                    if (pedidoCompleto.cliente.cpf_criptografado) pedidoCompleto.cliente.cpf_descriptografado = decrypt(pedidoCompleto.cliente.cpf_criptografado);
                    if (pedidoCompleto.cliente.telefone_criptografado) pedidoCompleto.cliente.telefone_descriptografado = decrypt(pedidoCompleto.cliente.telefone_criptografado);
                }

                if (pedidoCompleto.usuarios) {
                    if (pedidoCompleto.usuarios.cpf_criptografado) pedidoCompleto.usuarios.cpf_descriptografado = decrypt(pedidoCompleto.usuarios.cpf_criptografado);
                    if (pedidoCompleto.usuarios.telefone_criptografado) pedidoCompleto.usuarios.telefone_descriptografado = decrypt(pedidoCompleto.usuarios.telefone_criptografado);
                }
            } catch (e) { console.error('Erro ao descriptografar dados:', e); }

            res.status(200).json(pedidoCompleto);
        } else {
            res.status(404).json({ message: 'Pedido não encontrado ou você não tem acesso a ele.' });
        }
    } catch (error) { next(error); }
};

export const getMeusPedidos = async (req, res, next) => {
    try {
        const id_usuario = Number(req.user.id_usuario);
        const id_tenant = req.tenantId;

        const pedidos = await prisma.pedidos.findMany({
            where: { id_usuario: id_usuario, id_tenant: id_tenant },
            orderBy: { data_pedido: 'desc' },
            include: {
                pedido_items: true, 
                enderecos: true,
                usuarios: { select: { nome_completo: true, email: true, telefone_criptografado: true, cpf_criptografado: true } }
            }
        });

        const pedidosFormatados = pedidos.map(p => {
            let enderecoStr = 'Retirada / Não informado';
            if (p.enderecos) {
                enderecoStr = `${p.enderecos.logradouro || ''}, ${p.enderecos.numero || 'S/N'}`;
                if (p.enderecos.complemento) enderecoStr += ` - ${p.enderecos.complemento}`;
                if (p.enderecos.bairro) enderecoStr += ` - ${p.enderecos.bairro}`;
                if (p.enderecos.cidade && p.enderecos.estado) enderecoStr += `, ${p.enderecos.cidade}/${p.enderecos.estado}`;
                if (p.enderecos.cep) enderecoStr += ` - CEP: ${p.enderecos.cep}`;
            }

            let telefoneReal = 'Não informado';
            let cpfReal = 'Não informado';

            if (p.usuarios) {
                try { if (p.usuarios.telefone_criptografado) telefoneReal = decrypt(p.usuarios.telefone_criptografado); } catch (err) { }
                try { if (p.usuarios.cpf_criptografado) cpfReal = decrypt(p.usuarios.cpf_criptografado); } catch (err) { }
            }

            return {
                id_pedido: p.id_pedido, data_criacao: p.data_pedido,
                status_pedido: p.status_pagamento || p.status_entrega || 'PENDENTE',
                status_entrega: p.status_entrega || 'Pendente', delivery_pin: p.delivery_pin || null,
                valor_total: Number(p.preco_total), preco_frete: Number(p.preco_frete) || 0,
                metodo_pagamento: p.metodo_pagamento || 'Não informado', gateway_provider: p.gateway_provider || 'Padrão',
                endereco_entrega: enderecoStr,
                cliente: { nome: p.usuarios?.nome_completo || 'Cliente', email: p.usuarios?.email || 'Sem email', telefone: telefoneReal, cpf: cpfReal },
                
                // 🟢 INCLUINDO DADOS DE VARIAÇÕES E COMPLEMENTOS NA RESPOSTA DE HISTÓRICO
                itens: p.pedido_items.map(item => ({
                    id_item: item.id_pedido_item || item.id_produto || Math.floor(Math.random() * 1000),
                    nome_produto: item.nome_produto || item.nome || 'Produto do Pedido',
                    quantidade: Number(item.quantidade || 1), 
                    preco_unitario: Number(item.preco_unitario || item.preco || 0),
                    imagem_url: item.imagem_url || item.imagem || null,
                    complementos: item.complementos || '[]',
                    observacao: item.observacao || '',
                    cor: item.cor || '',
                    tamanho: item.tamanho || ''
                }))
            };
        });

        res.status(200).json(pedidosFormatados);

    } catch (error) {
        console.error("Erro ao buscar meus pedidos:", error);
        res.status(500).json({ message: "Erro ao buscar histórico de pedidos." });
    }
};

export const getAllPedidos = async (req, res, next) => {
    try {
        const { origem } = req.query;
        let filtro = {};
        if (origem === 'ifood') filtro = { canal_venda: 'ifood' };
        else if (origem === 'site') filtro = { canal_venda: { not: 'ifood' } };

        const pedidos = await PedidoModel.findAll(filtro, req.tenantId);
        res.json(pedidos);
    } catch (error) { next(error); }
};

export const updatePedidoParaEntregue = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const id_tenant = req.tenantId;
        const pedido = await PedidoModel.findById(id_pedido, undefined, id_tenant);

        if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });

        const isLocalDelivery = true;

        if (isLocalDelivery) {
            const pin = Math.floor(1000 + Math.random() * 9000).toString();
            const driverToken = crypto.randomUUID();
            const expires = new Date();
            expires.setHours(expires.getHours() + 24);

            await prisma.pedidos.updateMany({
                where: { id_pedido: id_pedido, id_tenant: id_tenant },
                data: { status_entrega: 'Em Rota de Entrega', delivery_pin: pin, driver_token: driverToken, driver_token_expires: expires }
            });

            await notificarCliente(pedido, 'EM_ROTA', id_tenant);

            return res.json({
                message: 'Pedido em rota de entrega.', status_entrega: 'Em Rota de Entrega',
                link_motorista: `${process.env.FRONTEND_URL}/driver/delivery/${driverToken}`, pin_cliente: pin
            });
        } else {
            const pedidoAtualizado = await prisma.pedidos.updateMany({
                where: { id_pedido: id_pedido, id_tenant: id_tenant }, data: { status_entrega: 'Enviado' }
            });
            return res.json(pedidoAtualizado);
        }
    } catch (error) { next(error); }
};

export const confirmDeliveryByDriver = async (req, res, next) => {
    try {
        const { driverToken, pin, paymentCollected } = req.body;
        if (!driverToken || !pin) return res.status(400).json({ message: 'Token e PIN são obrigatórios.' });

        const pedido = await prisma.pedidos.findFirst({
            where: { driver_token: driverToken, driver_token_expires: { gt: new Date() } },
            include: { pedido_items: true }
        });

        if (!pedido) return res.status(404).json({ message: 'Link de entrega inválido ou expirado.' });
        if (pedido.delivery_pin !== pin) return res.status(400).json({ message: 'PIN incorreto. Peça ao cliente o código correto.' });

        const isOffline = pedido.metodo_pagamento && pedido.metodo_pagamento.toUpperCase().includes('OFFLINE');
        if (isOffline && !paymentCollected) return res.status(400).json({ message: 'Você precisa confirmar o recebimento do pagamento.' });

        const novoStatusPagamento = isOffline ? 'PAGO' : pedido.status_pagamento;

        await prisma.pedidos.update({
            where: { id_pedido: pedido.id_pedido },
            data: { status_entrega: 'Entregue', status_pagamento: novoStatusPagamento, driver_token: null, driver_token_expires: null }
        });

        if (pedido.pedido_items && pedido.pedido_items.length > 0) {
            try {
                await prisma.$transaction(async (tx) => {
                    for (const item of pedido.pedido_items) {
                        if (item.id_produto) {
                            let estoqueFinal = 0;
                            if (item.id_variacao) {
                                const variacaoDb = await tx.produto_variacoes.findUnique({ where: { id_variacao: Number(item.id_variacao) } });
                                if (variacaoDb) {
                                    estoqueFinal = Math.max(0, Number(variacaoDb.estoque) - Number(item.quantidade));
                                    await tx.produto_variacoes.update({ where: { id_variacao: variacaoDb.id_variacao }, data: { estoque: estoqueFinal } });
                                }
                            } else {
                                const produtoDb = await tx.produtos.findUnique({ where: { id_produto: item.id_produto } });
                                if (produtoDb) {
                                    estoqueFinal = Math.max(0, Number(produtoDb.estoque) - Number(item.quantidade));
                                    await tx.produtos.update({ where: { id_produto: item.id_produto }, data: { estoque: estoqueFinal } });
                                }
                            }
                            await tx.movimentacaoEstoque.create({
                                data: {
                                    id_produto: item.id_produto, quantidade: Number(item.quantidade), tipo: 'SAIDA',
                                    saldo_momento: estoqueFinal, motivo: `Venda Pedido #${pedido.id_pedido} - Confirmado na Entrega`,
                                    origem_destino: 'Baixa Automática (Motorista)', usuario_id: pedido.id_usuario
                                }
                            });
                        }
                    }
                });

                for (const item of pedido.pedido_items) {
                    try {
                        const produtoAtualizado = await prisma.produtos.findUnique({ where: { id_produto: item.id_produto } });
                        if (produtoAtualizado) await syncEstoqueIfoodAutomated(pedido.id_tenant, produtoAtualizado.id_produto, produtoAtualizado.estoque);
                    } catch (ifoodErr) { console.error(`Erro ao sincronizar estoque iFood para produto ${item.id_produto}:`, ifoodErr); }
                }

            } catch (transactionError) {
                console.error("❌ Erro fatal na transação de estoque:", transactionError);
                throw new Error("Falha ao atualizar estoque do pedido. Operação cancelada.");
            }
        }
        res.json({ message: 'Entrega confirmada com sucesso e estoque atualizado!' });

    } catch (error) { next(error); }
};

export const getDeliveryDataByToken = async (req, res, next) => {
    try {
        const { token } = req.params;
        const pedido = await prisma.pedidos.findFirst({
            where: { driver_token: token, driver_token_expires: { gt: new Date() } },
            include: { usuarios: { select: { nome_completo: true, telefone_criptografado: true } } }
        });

        if (!pedido) return res.status(404).json({ message: 'Link inválido ou expirado.' });

        let telefoneDecrypted = null;
        if (pedido.usuarios?.telefone_criptografado) telefoneDecrypted = decrypt(pedido.usuarios.telefone_criptografado);

        res.json({
            id_pedido: pedido.id_pedido, cliente: pedido.usuarios?.nome_completo || pedido.nome_completo,
            telefone: telefoneDecrypted, endereco: `${pedido.entrega_logradouro}, ${pedido.entrega_numero} - ${pedido.entrega_bairro}, ${pedido.entrega_cidade}`,
            status_entrega: pedido.status_entrega, preco_total: pedido.preco_total, metodo_pagamento: pedido.metodo_pagamento
        });
    } catch (error) { next(error); }
};

export const updatePedidoStatus = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const { status_entrega } = req.body;
        const id_tenant = req.tenantId;

        const pedido = await PedidoModel.findById(id_pedido, undefined, id_tenant);

        if (pedido) {
            await prisma.pedidos.updateMany({
                where: { id_pedido: id_pedido, id_tenant: id_tenant }, data: { status_entrega }
            });

            if (status_entrega === 'Pronto para Retirada') await notificarCliente(pedido, 'PRONTO_RETIRADA', id_tenant);

            res.json({ message: "Status atualizado com sucesso." });
        } else {
            res.status(404).json({ message: 'Pedido não encontrado' });
        }
    } catch (error) { next(error); }
};

export const deletePedido = async (req, res, next) => {
    try {
        await PedidoModel.remove(Number(req.params.id), req.tenantId);
        res.json({ message: 'Pedido removido com sucesso' });
    } catch (error) { next(error); }
};

export const publishToMercadoLivre = async (req, res, next) => {
    try {
        const { id: productId } = req.params;
        const id_tenant = req.tenantId;

        const produto = await Produto.findById(Number(productId), id_tenant);

        if (!produto) return res.status(404).json({ message: 'Produto não encontrado nesta loja.' });
        if (produto.mercado_livre_id) return res.status(400).json({ message: 'Este produto já foi publicado no Mercado Livre.' });

        const accessToken = await ConfiguracaoModel.get('MERCADO_LIVRE_ACCESS_TOKEN', id_tenant);
        if (!accessToken) return res.status(500).json({ message: 'Access Token do Mercado Livre não configurado para esta loja.' });

        const anuncio = {
            title: produto.nome, category_id: "MLB1652", price: parseFloat(produto.preco), currency_id: "BRL",
            available_quantity: produto.estoque, buying_mode: "buy_it_now", listing_type_id: "gold_special",
            condition: "new", description: { plain_text: produto.descricao }, pictures: [{ source: produto.imagem_url }]
        };

        const { data } = await axios.post('https://api.mercadolibre.com/items', anuncio, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });

        await Produto.update(produto.id_produto, { mercado_livre_id: data.id }, id_tenant);
        res.json({ message: 'Produto publicado com sucesso!', url: data.permalink });

    } catch (error) {
        console.error("Erro ao publicar no Mercado Livre:", error.response?.data || error.message);
        next(new Error('Não foi possível publicar o produto no Mercado Livre.'));
    }
};

export const updateDriverLocation = async (req, res, next) => {
    try {
        const { token } = req.params;
        const { lat, lng } = req.body;

        const pedido = await prisma.pedidos.findFirst({ where: { driver_token: token, status_entrega: 'Em Rota de Entrega' } });

        if (pedido) {
            await prisma.pedidos.update({
                where: { id_pedido: pedido.id_pedido }, data: { driver_lat: parseFloat(lat), driver_lng: parseFloat(lng) }
            });
        }
        res.json({ success: true });
    } catch (error) { next(error); }
};

export const getNovosPedidosCount = async (req, res, next) => {
    try {
        const tenantIdFormatado = Number(req.tenantId);
        const countTextos = await prisma.pedidos.count({
            where: { id_tenant: tenantIdFormatado, status_entrega: { in: ['Pendente', 'PENDENTE', 'pendente'] } }
        });

        let countNulos = 0;
        try { countNulos = await prisma.pedidos.count({ where: { id_tenant: tenantIdFormatado, status_entrega: null } }); } catch (err) { }
        res.json({ count: countTextos + countNulos });

    } catch (error) {
        console.error("Erro ao contar pedidos novos:", error);
        res.status(500).json({ count: 0 });
    }
};

export const gerarPdfA4 = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const id_tenant = req.tenantId;

        const pedido = await PedidoModel.findById(id_pedido, undefined, id_tenant);
        if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });

        let itensHtml = '';
        pedido.pedido_items.forEach(item => {
            // 🟢 PDF DO ADMIN: RENDERIZANDO OS COMPLEMENTOS
            let extrasHtml = '';
            if (item.cor) extrasHtml += `<br><small style="color:#555;">Cor: ${item.cor}</small>`;
            if (item.tamanho) extrasHtml += `<br><small style="color:#555;">Tamanho: ${item.tamanho}</small>`;
            
            try {
                const comps = typeof item.complementos === 'string' ? JSON.parse(item.complementos) : (item.complementos || []);
                comps.forEach(c => {
                    extrasHtml += `<br><small style="color:#555;">+ ${c.quantidade}x ${c.nome || c.produto_add?.nome}</small>`;
                });
            } catch(e) {}

            if (item.observacao) extrasHtml += `<br><small style="color:#e74c3c; font-weight:bold;">Obs: ${item.observacao}</small>`;

            itensHtml += `<tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.quantidade}x</td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.nome_produto || item.nome}${extrasHtml}</td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">R$ ${Number(item.preco_unitario || item.preco).toFixed(2)}</td>
            </tr>`;
        });

        const html = `<!DOCTYPE html><html><head><title>Pedido #${pedido.id_pedido}</title><style>body { font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: auto; } .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; } .info-box { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 30px; } table { width: 100%; border-collapse: collapse; margin-bottom: 30px; } th { background: #eee; padding: 10px; text-align: left; } .total { text-align: right; font-size: 24px; font-weight: bold; }</style></head><body onload="window.print()"><div class="header"><h1>DOCUMENTO DE PEDIDO</h1><h2>PEDIDO #${pedido.id_pedido}</h2></div><div class="info-box"><p><strong>Cliente:</strong> ${pedido.usuarios?.nome_completo || 'Não informado'}</p><p><strong>Data:</strong> ${new Date(pedido.data_pedido).toLocaleString('pt-BR')}</p><p><strong>Canal de Venda:</strong> ${pedido.canal_venda}</p><p><strong>Status do Pagamento:</strong> ${pedido.status_pagamento}</p></div><table><thead><tr><th>Qtd</th><th>Produto</th><th style="text-align: right;">Valor Unitário</th></tr></thead><tbody>${itensHtml}</tbody></table><div class="total">TOTAL: R$ ${Number(pedido.preco_total).toFixed(2)}</div></body></html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);

    } catch (error) { next(error); }
};

export const imprimirTermicaCaixa = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const id_tenant = req.tenantId;

        const pedido = await PedidoModel.findById(id_pedido, undefined, id_tenant);
        if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });

        const impPadrao = await prisma.impressoras.findFirst({ where: { id_tenant, is_padrao: true, ativo: true } });
        if (!impPadrao) return res.status(400).json({ message: "Nenhuma impressora padrão configurada na loja." });

        // 🟢 IMPRESSÃO TÉRMICA MANUAL: ENVIANDO DADOS COMPLETOS PARA SOCKET
        const printJob = {
            tipo: 'CONTA', mesa: `E-commerce / Delivery`, impressora: impPadrao, total: pedido.preco_total,
            itens: pedido.pedido_items.map(i => {
                let comps = [];
                try { comps = typeof i.complementos === 'string' ? JSON.parse(i.complementos) : (i.complementos || []) } catch(e){}
                return {
                    nome: i.nome_produto || i.nome, 
                    quantidade: i.quantidade, 
                    preco: i.preco_unitario || i.preco,
                    cor: i.cor,
                    tamanho: i.tamanho,
                    observacao: i.observacao,
                    complementos: comps
                };
            })
        };

        if (req.app.get('io')) {
            req.app.get('io').emit('NOVA_IMPRESSAO', { id_tenant: id_tenant, jobs: [printJob] });
        }

        res.status(200).json({ message: "Comando de impressão enviado para a máquina do caixa!" });

    } catch (error) { next(error); }
};

export const getCarrinho = async (req, res) => {
    try {
        const id_usuario = req.user.id_usuario;
        const carrinhoItens = await CarrinhoModel.findByUserId(id_usuario, req.tenantId);

        if (!carrinhoItens || carrinhoItens.length === 0) {
            return res.status(200).json([]); // Retorna array vazio em vez de erro 400
        }

        const carrinhoFormatado = [];

        for (const item of carrinhoItens) {
            let variacaoObj = null;

            if (item.id_variacao) {
                variacaoObj = await prisma.produto_variacoes.findUnique({
                    where: { id_variacao: Number(item.id_variacao) }
                });
            }

            carrinhoFormatado.push({
                id_produto: item.produtos.id_produto,
                nome: item.produtos.nome,
                preco: variacaoObj && variacaoObj.preco_adicional > 0 
                       ? Number(item.produtos.preco) + Number(variacaoObj.preco_adicional) 
                       : item.produtos.preco,
                imagem_url: variacaoObj?.imagem_url || item.produtos.imagem_url,
                quantidade: parseFloat(item.quantidade),
                unidade: item.produtos.unidade,
                id_variacao: variacaoObj ? variacaoObj.id_variacao : null,
                cor: variacaoObj ? variacaoObj.cor : null,
                tamanho: variacaoObj ? variacaoObj.tamanho : null,
                // 🟢 RETORNANDO NOVOS CAMPOS PARA O FRONTEND
                complementos: item.complementos ? (typeof item.complementos === 'string' ? JSON.parse(item.complementos) : item.complementos) : [],
                observacao: item.observacao || ''
            });
        }

        res.status(200).json(carrinhoFormatado);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar o carrinho.", error: error.message });
    }
};

export const addAoCarrinho = async (req, res) => {
    try {
        const id_usuario = req.user.id_usuario;
        // 🟢 RECEBENDO NOVOS CAMPOS DO FRONT
        const { id_produto, quantidade, id_variacao, complementos, observacao } = req.body;

        if (!id_produto || !quantidade || Number(quantidade) <= 0) {
            return res.status(400).json({ message: "ID do produto e quantidade válida são obrigatórios." });
        }

        // 🟢 ENVIANDO PARA O CarrinhoModel. O Model precisará estar preparado para aceitá-los na Query do Prisma
        await CarrinhoModel.addOrUpdate(id_usuario, id_produto, quantidade, req.tenantId, id_variacao, complementos, observacao);
        res.status(201).json({ message: "Produto adicionado ao carrinho com sucesso!" });
    } catch (error) {
        res.status(500).json({ message: "Erro ao adicionar produto ao carrinho.", error: error.message });
    }
};

export const atualizarQuantidade = async (req, res) => {
    try {
        const id_usuario = req.user.id_usuario;
        const { id_produto, quantidade } = req.body;

        if (!id_produto || quantidade === undefined || Number(quantidade) <= 0) {
            return res.status(400).json({ message: "Dados inválidos." });
        }

        await CarrinhoModel.updateQuantity(id_usuario, id_produto, quantidade, req.tenantId);
        res.status(200).json({ message: "Quantidade atualizada com sucesso" });
    } catch (error) {
        console.error("Erro update:", error);
        res.status(500).json({ message: "Erro ao atualizar quantidade", error: error.message });
    }
};

export const removerDoCarrinho = async (req, res) => {
    try {
        const id_usuario = req.user.id_usuario;
        const { id_produto } = req.params;

        await CarrinhoModel.remove(id_usuario, Number(id_produto), req.tenantId);
        res.status(200).json({ message: 'Item removido com sucesso' });
    } catch (error) {
        res.status(500).json({ message: "Erro ao remover item.", error: error.message });
    }
};