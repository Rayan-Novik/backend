import CarrinhoModel from '../models/carrinhoModel.js';
import PedidoModel from '../models/pedidoModel.js';
import EnderecoModel from '../models/enderecoModel.js';
import { criarPagamentoPix, criarPagamentoCartao, criarPagamentoDebito } from '../services/mercadoPagoService.js'
import UsuarioModel from '../models/usuarioModel.js';
import { decrypt } from '../services/cryptoService.js';

// --- Funções de Cliente (Existentes) ---

export const criarPedido = async (req, res, next) => {
    try {
        const id_usuario = req.user.id_usuario;
        
        // Recebe dados do frontend
        const { id_endereco_entrega, preco_frete = 0, paymentMethod, paymentData, dados_entrega } = req.body;

        // --- Validações ---
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

        // --- Cálculo de Preço ---
        const preco_itens = carrinhoItens.reduce((total, item) => {
            const preco = parseFloat(item.produtos.preco);
            const quantidade = parseInt(item.quantidade, 10);
            if (!isNaN(preco) && !isNaN(quantidade)) {
                return total + (preco * quantidade);
            }
            return total;
        }, 0);
        
        const preco_total = preco_itens + Number(preco_frete);
        if (preco_total <= 0) {
            return res.status(400).json({ message: "O valor total do pedido deve ser maior que zero." });
        }

        // --- LÓGICA DE PAGAMENTO ---
        let pagamentoResult;
        let metodoPagamentoFinal = paymentMethod;

        if (paymentMethod === 'CreditCard') {
            const { token, installments, payment_method_id, issuer_id, payer } = paymentData;
            metodoPagamentoFinal = payment_method_id;
            pagamentoResult = await criarPagamentoCartao({
                amount: preco_total, token, installments, payment_method_id, issuer_id,
                payer: {
                    email: payer.email,
                    identification: { type: payer.identification.type, number: payer.identification.number }
                }
            });

        } else if (paymentMethod === 'DebitCard') {
            const { token, payment_method_id, issuer_id, payer } = paymentData;
            metodoPagamentoFinal = payment_method_id;
            pagamentoResult = await criarPagamentoDebito({
                amount: preco_total, token, payment_method_id, issuer_id,
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
                amount: preco_total,
                payer: {
                    email: usuario.email,
                    firstName: primeiroNome,
                    lastName: sobrenome,
                    identification: { type: "CPF", number: cpfLimpo }
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
            snapshotEndereco = {
                entrega_logradouro: dados_entrega.entrega_logradouro,
                entrega_numero: dados_entrega.entrega_numero,
                entrega_bairro: dados_entrega.entrega_bairro,
                entrega_cidade: dados_entrega.entrega_cidade,
                entrega_estado: dados_entrega.entrega_estado,
                entrega_cep: dados_entrega.entrega_cep,
                entrega_complemento: dados_entrega.entrega_complemento
            };
        }

        else if (id_endereco_entrega) {
            try {
                // Busca os detalhes no banco de dados usando o ID
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
                    console.log("⚠️ Snapshot recuperado via ID pelo Backend:", snapshotEndereco);
                }
            } catch (err) {
                console.error("Erro ao buscar endereço de backup:", err);
                // Não trava o pedido, mas avisa no log
            }
        }

        // --- Criação do Pedido no Banco ---
        const pedidoCriado = await PedidoModel.create({
            id_usuario,
            id_endereco_entrega: id_endereco_entrega ? Number(id_endereco_entrega) : null,
            metodo_pagamento: metodoPagamentoFinal,
            preco_itens,
            preco_frete,
            preco_total,
            status_pagamento: statusPagamento,
            id_pagamento_gateway: pagamentoResult.id.toString(),
            ...snapshotEndereco 
        }, carrinhoItens);

        await CarrinhoModel.clear(id_usuario);

        // ✅ INÍCIO DA NOTIFICAÇÃO EM TEMPO REAL
        // Recupera o socket que configuramos no app.js
        const io = req.app.get('socketio');
        
        if (io) {
            // Emite o evento 'novo_pedido' para todos os clientes conectados (Dashboard Admin/Mobile)
            // Envia apenas dados essenciais para o alerta
            io.emit('novo_pedido', {
                id: pedidoCriado.id_pedido || pedidoCriado.id, // Garante que pegue o ID correto
                total: preco_total,
                cliente: usuario.nome_completo,
                status: statusPagamento,
                tipo: id_endereco_entrega ? 'Entrega' : 'Retirada'
            });
            console.log(`🔔 Notificação enviada para o pedido #${pedidoCriado.id_pedido || pedidoCriado.id}`);
        }
        // ✅ FIM DA NOTIFICAÇÃO EM TEMPO REAL

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
                    id_pagamento: pagamentoResult.id,
                    qr_code: pagamentoResult.point_of_interaction?.transaction_data?.qr_code,
                    qr_code_base64: pagamentoResult.point_of_interaction?.transaction_data?.qr_code_base64,
                }
            });
        }

    } catch (error) {
        next(error);
    }
};

export const getPedidoById = async (req, res, next) => {
    try {
        console.log('--- DIAGNÓSTICO: INÍCIO getPedidoById ---');

        // 1. O que a URL está a enviar?
        console.log('ID do pedido recebido (req.params.id):', req.params.id);
        const id_pedido = Number(req.params.id);

        // 2. Quem está a fazer a requisição? O token está correto?
        console.log('Dados do usuário do token (req.user):', req.user);
        const id_usuario_logado = req.user.id_usuario;
        const is_admin_logado = req.user.isAdmin;
        console.log('O usuário é admin?', is_admin_logado);

        const pedidoCompleto = await PedidoModel.findById(
            id_pedido,
            is_admin_logado ? undefined : id_usuario_logado
        );

        console.log('Resultado da busca no banco:', pedidoCompleto ? 'Pedido encontrado' : 'Pedido NÃO encontrado');
        console.log('--- DIAGNÓSTICO: FIM getPedidoById ---');

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
        // Agora chama a função correta do Model para buscar todos os pedidos do usuário
        const pedidos = await PedidoModel.findAllByUserId(id_usuario); // Correto!
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
            res.status(404);
            throw new Error('Pedido não encontrado');
        }
    } catch (error) {
        next(error);
    }
};

export const updatePedidoStatus = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const { status_entrega } = req.body; // Recebe 'Pronto para Retirada', 'Entregue', etc.

        const pedido = await PedidoModel.findById(id_pedido);

        if (pedido) {
            const pedidoAtualizado = await PedidoModel.update(id_pedido, {
                status_entrega: status_entrega
            });
            
            res.json(pedidoAtualizado);
        } else {
            res.status(404);
            throw new Error('Pedido não encontrado');
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

        if (!produto) {
            return res.status(404).json({ message: 'Produto não encontrado.' });
        }
        if (produto.mercado_livre_id) {
            return res.status(400).json({ message: 'Este produto já foi publicado no Mercado Livre.' });
        }

        const accessToken = await ConfiguracaoModel.get('MERCADO_LIVRE_ACCESS_TOKEN');
        if (!accessToken) {
            return res.status(500).json({ message: 'Access Token do Mercado Livre não configurado.' });
        }

        const anuncio = {
            title: produto.nome,
            category_id: "MLB1652", // Exemplo: Categoria de Notebooks
            price: parseFloat(produto.preco),
            currency_id: "BRL",
            available_quantity: produto.estoque,
            buying_mode: "buy_it_now",
            listing_type_id: "gold_special",
            condition: "new",
            description: {
                plain_text: produto.descricao
            },
            pictures: [
                { source: produto.imagem_url }
            ]
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