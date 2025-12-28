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

// --- Funções de Cliente ---

export const criarPedido = async (req, res, next) => {
    try {
        const id_usuario = req.user.id_usuario;
        
        // Recebe dados do frontend
        const { 
            id_endereco_entrega, 
            preco_frete = 0, 
            paymentMethod, 
            paymentData, 
            dados_entrega,
            cupom_aplicado // ✅ Recebe objeto { code: 'ABC' }
        } = req.body;

        // --- Validações Básicas ---
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

        // --- 1. Cálculo de Preço dos Itens (Recalcula do zero por segurança) ---
        const preco_itens = carrinhoItens.reduce((total, item) => {
            const preco = parseFloat(item.produtos.preco);
            const quantidade = parseInt(item.quantidade, 10);
            if (!isNaN(preco) && !isNaN(quantidade)) {
                return total + (preco * quantidade);
            }
            return total;
        }, 0);

        // --- 2. Aplicação de Cupom (Backend Validation) ---
        let valorDescontoCupom = 0;
        let cupomId = null;

        if (cupom_aplicado && cupom_aplicado.code) {
            const cupomDb = await CupomModel.findByCode(cupom_aplicado.code);
            if (cupomDb) {
                // Formata o carrinho para o serviço de desconto
                const carrinhoFormatado = carrinhoItens.map(i => ({
                    id_produto: i.produtos.id_produto,
                    preco: i.produtos.preco,
                    quantidade: i.quantidade,
                    produto: i.produtos
                }));

                try {
                    // Recalcula o desconto usando a mesma lógica do frontend
                    valorDescontoCupom = calcularDesconto(carrinhoFormatado, cupomDb, Number(preco_frete));
                    cupomId = cupomDb.id_cupom;
                    
                    // Incrementa uso do cupom (poderia ser feito após confirmação de pagamento, mas aqui garante a reserva)
                    await CupomModel.incrementUsage(cupomDb.id_cupom);
                } catch (err) {
                    console.error("Erro ao validar cupom no backend:", err.message);
                }
            }
        }

        // Total parcial (Itens + Frete - Cupom)
        let preco_total_calculado = Math.max(0, preco_itens + Number(preco_frete) - valorDescontoCupom);

        // --- 3. Aplicação de Desconto PIX (COM TRAVA DE CUPOM) ---
        let valorDescontoPix = 0;
        
        // ✅ AQUI ESTÁ A LÓGICA DE EXCLUSÃO: Só aplica Pix se não tiver cupom (cupomId é null)
        if (paymentMethod === 'PIX' && !cupomId) {
            const pixAtivoStr = await ConfiguracaoModel.get('pix_desconto_ativo');
            const pixPorcentagemStr = await ConfiguracaoModel.get('pix_desconto_porcentagem');
            
            const pixAtivo = pixAtivoStr === 'true';
            const pixPorcentagem = Number(pixPorcentagemStr || 0);

            if (pixAtivo && pixPorcentagem > 0) {
                valorDescontoPix = preco_total_calculado * (pixPorcentagem / 100);
                preco_total_calculado = preco_total_calculado - valorDescontoPix;
            }
        }

        // Preço Total Final (Arredondado para 2 casas decimais)
        const preco_total_final = Number(preco_total_calculado.toFixed(2));

        if (preco_total_final <= 0) {
            return res.status(400).json({ message: "O valor total do pedido deve ser maior que zero." });
        }

        console.log(`💰 Checkout: Itens: ${preco_itens} | Frete: ${preco_frete} | Cupom: -${valorDescontoCupom} | Pix: -${valorDescontoPix} | TOTAL: ${preco_total_final}`);

        // --- LÓGICA DE PAGAMENTO ---
        let pagamentoResult;
        let metodoPagamentoFinal = paymentMethod;

        // Dados do pagador
        const payerInfo = {
            email: usuario.email,
            identification: { type: "CPF", number: cpfLimpo }
        };

        if (paymentMethod === 'CreditCard') {
            const { token, installments, payment_method_id, issuer_id, payer } = paymentData;
            metodoPagamentoFinal = payment_method_id;
            pagamentoResult = await criarPagamentoCartao({
                amount: preco_total_final, // ✅ Usa valor com desconto correto
                token, installments, payment_method_id, issuer_id,
                payer: {
                    email: payer.email,
                    identification: { type: payer.identification.type, number: payer.identification.number }
                }
            });

        } else if (paymentMethod === 'DebitCard') {
            const { token, payment_method_id, issuer_id, payer } = paymentData;
            metodoPagamentoFinal = payment_method_id;
            pagamentoResult = await criarPagamentoDebito({
                amount: preco_total_final, // ✅ Usa valor com desconto correto
                token, payment_method_id, issuer_id,
                payer: {
                    email: payer.email,
                    identification: { type: payer.identification.type, number: payer.identification.number }
                }
            });

        } else if (paymentMethod === 'PIX') {
            metodoPagamentoFinal = 'pix';
            const [primeiroNome, ...sobrenomeArray] = usuario.nome_completo.split(' ');
            const sobrenome = sobrenomeArray.join(' ');
            
            pagamentoResult = await criarPagamentoPix({
                amount: preco_total_final, // ✅ Usa valor com desconto correto (Pix ou Cupom)
                payer: {
                    ...payerInfo,
                    firstName: primeiroNome,
                    lastName: sobrenome
                },
            });

        } else {
            return res.status(400).json({ message: "Método de pagamento não reconhecido." });
        }
        
        const statusPagamento = pagamentoResult.status === 'approved' ? 'PAGO' : 'PENDENTE';

        // --- Snapshot de Endereço ---
        let snapshotEndereco = {
            entrega_logradouro: null, entrega_numero: null, entrega_bairro: null,
            entrega_cidade: null, entrega_estado: null, entrega_cep: null, entrega_complemento: null
        };

        if (dados_entrega) {
            snapshotEndereco = { ...dados_entrega };
        }
        else if (id_endereco_entrega) {
            try {
                const enderecoDb = await EnderecoModel.findById(id_endereco_entrega);
                if (enderecoDb) {
                    snapshotEndereco = {
                        entrega_logradouro: enderecoDb.logradouro || enderecoDb.rua,
                        entrega_numero: enderecoDb.numero,
                        entrega_bairro: enderecoDb.bairro,
                        entrega_cidade: enderecoDb.cidade,
                        entrega_estado: enderecoDb.estado || enderecoDb.uf,
                        entrega_cep: enderecoDb.cep,
                        entrega_complemento: enderecoDb.complemento
                    };
                }
            } catch (err) {
                console.error("Erro ao buscar endereço de backup:", err);
            }
        }

        // --- Criação do Pedido no Banco ---
        const pedidoCriado = await PedidoModel.create({
            id_usuario,
            id_endereco_entrega: id_endereco_entrega ? Number(id_endereco_entrega) : null,
            metodo_pagamento: metodoPagamentoFinal,
            preco_itens,
            preco_frete,
            preco_total: preco_total_final, // ✅ Salva o valor real a ser pago
            status_pagamento: statusPagamento,
            id_pagamento_gateway: pagamentoResult.id.toString(),
            id_cupom_utilizado: cupomId, // ✅ Salva o ID do cupom se foi usado
            ...snapshotEndereco 
        }, carrinhoItens);

        await CarrinhoModel.clear(id_usuario);

        // Notificação Socket
        const io = req.app.get('socketio');
        if (io) {
            io.emit('novo_pedido', {
                id: pedidoCriado.id_pedido || pedidoCriado.id,
                total: preco_total_final,
                cliente: usuario.nome_completo,
                status: statusPagamento,
                tipo: id_endereco_entrega ? 'Entrega' : 'Retirada'
            });
        }

        // --- Resposta ---
        if (paymentMethod === 'CreditCard' || paymentMethod === 'DebitCard') {
            res.status(201).json({
                message: `Pagamento ${statusPagamento === 'PAGO' ? 'aprovado' : 'pendente'}.`,
                pedido: pedidoCriado
            });
        } else { // PIX
            res.status(201).json({
                message: "Pedido criado! Aguardando pagamento PIX.",
                pedido: pedidoCriado,
                paymentInfo: {
                    transaction_amount: preco_total_final, // ✅ Envia o valor correto pro frontend
                    id_pagamento: pagamentoResult.id,
                    qr_code: pagamentoResult.point_of_interaction?.transaction_data?.qr_code,
                    qr_code_base64: pagamentoResult.point_of_interaction?.transaction_data?.qr_code_base64,
                }
            });
        }

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