import CarrinhoModel from '../models/carrinhoModel.js';
import PedidoModel from '../models/pedidoModel.js';
import EnderecoModel from '../models/enderecoModel.js';
import CupomModel from '../models/cupomModel.js'; // ✅ Importado
import ConfiguracaoModel from '../models/configuracaoModel.js'; // ✅ Importado
import { criarPagamentoPix, criarPagamentoCartao, criarPagamentoDebito } from '../services/mercadoPagoService.js';
import UsuarioModel from '../models/usuarioModel.js';
import { decrypt } from '../services/cryptoService.js';
import { calcularDesconto } from '../services/discountService.js'; // ✅ Importado
import Produto from '../models/produtoModel.js'; 
import axios from 'axios';
import cron from 'node-cron'; // ✅ Importado

// ✅ AGENDAMENTO: Roda a cada 10 minutos para limpar pedidos órfãos (Pendentes há mais de 1h)
cron.schedule('*/10 * * * *', async () => {
    try {
        console.log('⏰ [CRON] Verificando pedidos expirados (1h+)...');
        const total = await PedidoModel.cancelarPedidosExpirados();
        if (total > 0) {
            console.log(`✅ [CRON] ${total} pedido(s) cancelado(s) por expiração.`);
        }
    } catch (error) {
        console.error('❌ [CRON] Erro ao cancelar pedidos:', error);
    }
});

// --- Funções de Cliente ---

export const criarPedido = async (req, res, next) => {
    try {
        const id_usuario = req.user.id_usuario;
        
        const { 
            id_endereco_entrega, 
            preco_frete = 0, 
            paymentMethod, 
            paymentData, 
            dados_entrega,
            cupom_aplicado,
            device_id // ✅ AÇÃO OBRIGATÓRIA: Recebe o ID do dispositivo do frontend
        } = req.body;

        // Validações Iniciais
        if (!id_endereco_entrega && Number(preco_frete) > 0) {
            return res.status(400).json({ message: "O endereço de entrega é obrigatório para entregas." });
        }

        const carrinhoItens = await CarrinhoModel.findByUserId(id_usuario);
        if (carrinhoItens.length === 0) {
            return res.status(400).json({ message: "Seu carrinho está vazio." });
        }

        const usuario = await UsuarioModel.findById(id_usuario);
        const cpfLimpo = decrypt(usuario.cpf_criptografado);
        if (!cpfLimpo) {
            return res.status(400).json({ message: "CPF do usuário não encontrado ou inválido." });
        }

        // --- 1. Cálculo de Preço dos Itens ---
        const preco_itens = carrinhoItens.reduce((total, item) => {
            const preco = parseFloat(item.produtos.preco);
            const quantidade = parseInt(item.quantidade, 10);
            return total + (preco * quantidade);
        }, 0);

        // --- 2. Aplicação de Cupom ---
        let valorDescontoCupom = 0;
        let cupomId = null;
        if (cupom_aplicado && cupom_aplicado.code) {
            const cupomDb = await CupomModel.findByCode(cupom_aplicado.code);
            if (cupomDb) {
                const carrinhoFormatado = carrinhoItens.map(i => ({
                    id_produto: i.produtos.id_produto,
                    preco: i.produtos.preco,
                    quantidade: i.quantidade,
                    produto: i.produtos
                }));
                try {
                    valorDescontoCupom = calcularDesconto(carrinhoFormatado, cupomDb, Number(preco_frete));
                    cupomId = cupomDb.id_cupom;
                    await CupomModel.incrementUsage(cupomDb.id_cupom);
                } catch (err) { console.error("Erro cupom:", err.message); }
            }
        }

        let preco_total_calculado = Math.max(0, preco_itens + Number(preco_frete) - valorDescontoCupom);

        // --- 3. Desconto PIX ---
        let valorDescontoPix = 0;
        if (paymentMethod === 'PIX' && !cupomId) {
            const pixAtivoStr = await ConfiguracaoModel.get('pix_desconto_ativo');
            const pixPorcentagemStr = await ConfiguracaoModel.get('pix_desconto_porcentagem');
            if (pixAtivoStr === 'true') {
                valorDescontoPix = preco_total_calculado * (Number(pixPorcentagemStr) / 100);
                preco_total_calculado -= valorDescontoPix;
            }
        }

        const preco_total_final = Number(preco_total_calculado.toFixed(2));

        // ✅ AÇÃO RECOMENDADA: Mapear itens detalhados para o Antifraude
        const itemsParaGateway = carrinhoItens.map(item => ({
            id: String(item.produtos.id_produto),
            title: item.produtos.nome,
            description: item.produtos.descricao || item.produtos.nome,
            category_id: 'others', // Opcional: pode ser dinâmico
            quantity: Number(item.quantidade),
            unit_price: Number(item.produtos.preco)
        }));

        // --- 4. LÓGICA DE PAGAMENTO ---
        let pagamentoResult;
        let metodoPagamentoFinal = paymentMethod;

        const [primeiroNome, ...sobrenomeArray] = usuario.nome_completo.split(' ');
        const sobrenome = sobrenomeArray.join(' ') || 'Sobrenome';

        const commonPayerData = {
            email: usuario.email,
            firstName: primeiroNome,
            lastName: sobrenome,
            identification: { type: "CPF", number: cpfLimpo }
        };

        if (paymentMethod === 'CreditCard' || paymentMethod === 'DebitCard') {
            const { token, installments, payment_method_id, issuer_id, payer } = paymentData;
            metodoPagamentoFinal = payment_method_id;
            
            const gatewayFunc = paymentMethod === 'CreditCard' ? criarPagamentoCartao : criarPagamentoDebito;
            
            pagamentoResult = await gatewayFunc({
                amount: preco_total_final,
                token,
                installments,
                payment_method_id,
                issuer_id,
                items: itemsParaGateway, // ✅ AÇÃO RECOMENDADA
                device_id: device_id,    // ✅ AÇÃO OBRIGATÓRIA (Cartão)
                payer: {
                    ...commonPayerData,
                    email: payer.email || commonPayerData.email // Garante email do checkout
                }
            });

        } else if (paymentMethod === 'PIX') {
            metodoPagamentoFinal = 'pix';
            pagamentoResult = await criarPagamentoPix({
                amount: preco_total_final,
                items: itemsParaGateway, // ✅ AÇÃO RECOMENDADA
                payer: commonPayerData
            });
        }

        // --- 5. Finalização e Banco de Dados ---
        const statusPagamento = pagamentoResult.status === 'approved' ? 'PAGO' : 'PENDENTE';

        let snapshotEndereco = {
            entrega_logradouro: dados_entrega?.entrega_logradouro || null,
            entrega_numero: dados_entrega?.entrega_numero || null,
            entrega_bairro: dados_entrega?.entrega_bairro || null,
            entrega_cidade: dados_entrega?.entrega_cidade || null,
            entrega_estado: dados_entrega?.entrega_estado || null,
            entrega_cep: dados_entrega?.entrega_cep || null,
            entrega_complemento: dados_entrega?.entrega_complemento || null
        };

        // Se não veio dados_entrega, tenta buscar do banco
        if (!dados_entrega && id_endereco_entrega) {
            const enderecoDb = await EnderecoModel.findById(id_endereco_entrega);
            if (enderecoDb) {
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
        }

        const pedidoCriado = await PedidoModel.create({
            id_usuario,
            id_endereco_entrega: id_endereco_entrega ? Number(id_endereco_entrega) : null,
            metodo_pagamento: metodoPagamentoFinal,
            preco_itens,
            preco_frete,
            preco_total: preco_total_final,
            status_pagamento: statusPagamento,
            id_pagamento_gateway: pagamentoResult.id.toString(),
            id_cupom_utilizado: cupomId,
            ...snapshotEndereco 
        }, carrinhoItens);

        // ✅ LÓGICA DE ESTOQUE IMEDIATA:
        // Se o pagamento for aprovado agora (ex: Cartão), chama a função do Model que reduz o estoque.
        if (statusPagamento === 'PAGO') {
            await PedidoModel.updateStatusByGatewayId(pagamentoResult.id.toString(), 'PAGO');
        }

        await CarrinhoModel.clear(id_usuario);

        // Notificação Socket
        const io = req.app.get('socketio');
        if (io) {
            io.emit('novo_pedido', {
                id: pedidoCriado.id_pedido || pedidoCriado.id,
                total: preco_total_final,
                cliente: usuario.nome_completo,
                status: statusPagamento
            });
        }

        // Resposta
        res.status(201).json({
            message: "Pedido processado!",
            pedido: pedidoCriado,
            paymentInfo: paymentMethod === 'PIX' ? {
                transaction_amount: preco_total_final,
                id_pagamento: pagamentoResult.id,
                qr_code: pagamentoResult.point_of_interaction?.transaction_data?.qr_code,
                qr_code_base64: pagamentoResult.point_of_interaction?.transaction_data?.qr_code_base64,
                date_of_expiration: pagamentoResult.date_of_expiration // ✅ Crucial para o cronômetro
            } : null
        });

    } catch (error) {
        console.error("Erro no criarPedido:", error);
        next(error);
    }
};

export const getPedidoById = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const id_usuario_logado = req.user.id_usuario;
        const is_admin_logado = req.user.isAdmin;

        const pedidoCompleto = await PedidoModel.findById(
            id_pedido,
            is_admin_logado ? undefined : id_usuario_logado
        );

        if (pedidoCompleto) {
            res.status(200).json(pedidoCompleto);
        } else {
            res.status(404).json({ message: 'Pedido não encontrado.' });
        }
    } catch (error) {
        next(error);
    }
};

export const getMeusPedidos = async (req, res, next) => {
    try {
        const id_usuario = req.user.id_usuario;
        const pedidos = await PedidoModel.findAllByUserId(id_usuario);
        res.status(200).json(pedidos);
    } catch (error) {
        next(error);
    }
};

// --- Funções de Admin ---

export const getAllPedidos = async (req, res, next) => {
    try {
        const pedidos = await PedidoModel.findAll();
        res.json(pedidos);
    } catch (error) {
        next(error);
    }
};

export const updatePedidoParaEntregue = async (req, res, next) => {
    try {
        const pedido = await PedidoModel.findById(Number(req.params.id), undefined);
        if (pedido) {
            const pedidoAtualizado = await PedidoModel.update(Number(req.params.id), {
                status_entrega: 'Enviado'
            });
            res.json(pedidoAtualizado);
        } else {
            res.status(404).json({ message: 'Pedido não encontrado' });
        }
    } catch (error) {
        next(error);
    }
};

export const updatePedidoStatus = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const { status_entrega } = req.body;
        const pedido = await PedidoModel.findById(id_pedido);
        if (pedido) {
            const pedidoAtualizado = await PedidoModel.update(id_pedido, { status_entrega });
            res.json(pedidoAtualizado);
        } else {
            res.status(404).json({ message: 'Pedido não encontrado' });
        }
    } catch (error) {
        next(error);
    }
};

export const deletePedido = async (req, res, next) => {
    try {
        await PedidoModel.remove(Number(req.params.id));
        res.json({ message: 'Pedido removido com sucesso' });
    } catch (error) {
        next(error);
    }
};

export const publishToMercadoLivre = async (req, res, next) => {
    try {
        const { id: productId } = req.params;
        const produto = await Produto.findById(Number(productId));

        if (!produto) return res.status(404).json({ message: 'Produto não encontrado.' });
        if (produto.mercado_livre_id) return res.status(400).json({ message: 'Este produto já foi publicado no Mercado Livre.' });

        const accessToken = await ConfiguracaoModel.get('MERCADO_LIVRE_ACCESS_TOKEN');
        if (!accessToken) return res.status(500).json({ message: 'Access Token do Mercado Livre não configurado.' });

        const anuncio = {
            title: produto.nome,
            category_id: "MLB1652",
            price: parseFloat(produto.preco),
            currency_id: "BRL",
            available_quantity: produto.estoque,
            buying_mode: "buy_it_now",
            listing_type_id: "gold_special",
            condition: "new",
            description: { plain_text: produto.descricao },
            pictures: [{ source: produto.imagem_url }]
        };

        const { data } = await axios.post('https://api.mercadolibre.com/items', anuncio, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        await Produto.update(produto.id_produto, { mercado_livre_id: data.id });
        res.json({ message: 'Produto publicado com sucesso!', url: data.permalink });

    } catch (error) {
        console.error("Erro ao publicar no Mercado Livre:", error.response?.data || error.message);
        next(new Error('Não foi possível publicar o produto no Mercado Livre.'));
    }
};