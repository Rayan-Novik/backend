import express from 'express';
import { PrismaClient } from '@prisma/client';
// 🚀 IMPORTANTE: Importando o porteiro (apiKeyAuth) e o segurança (requirePermission)
import { apiKeyAuth, requirePermission } from '../middlewares/apiKeyAuth.js';
import { decrypt } from '../services/cryptoService.js';
import { dispatchWebhook } from '../services/webhookService.js';

const router = express.Router();
const prisma = new PrismaClient();

// ============================================================================
// PORTEIRO: Todas as rotas deste arquivo vão passar pela verificação da chave primeiro
// ============================================================================
router.use(apiKeyAuth);

// ============================================================================
// 📦 ROTAS DE PRODUTOS
// ============================================================================

// Rota GET /api/v1/produtos (Requer permissão: ler_produtos)
router.get('/produtos', requirePermission('ler_produtos'), async (req, res) => {
    try {
        // 🚀 PAGINAÇÃO: Recebe os parâmetros ou usa os padrões (1 e 50)
        const pagina = parseInt(req.query.pagina) || 1;
        const limite = parseInt(req.query.limite) || 50; 
        
        // 🛡️ TRAVA DE SEGURANÇA: Impede que o CRM peça mais de 100 itens por vez e trave seu banco
        const limiteSeguro = limite > 100 ? 100 : limite; 
        
        // 🧮 CALCULO: Quantos produtos o banco deve pular para chegar na página certa
        const pular = (pagina - 1) * limiteSeguro;

        const produtos = await prisma.produtos.findMany({
            where: { id_tenant: req.tenant_id }, 
            select: {
                id_produto: true,
                nome: true,
                descricao: true,
                preco: true,
                estoque: true,
                imagem_url: true,
                peso: true,
                ativo: true,
                id_externo: true // 💡 Adicionado o id_externo para o CRM se achar!
            },
            take: limiteSeguro,
            skip: pular,
            orderBy: { id_produto: 'desc' }
        });

        // Conta quantos produtos a loja tem no total para montar as páginas
        const totalProdutos = await prisma.produtos.count({
            where: { id_tenant: req.tenant_id }
        });

        res.json({
            sucesso: true,
            sandbox: req.is_sandbox || false,
            paginacao: {
                total_itens: totalProdutos,
                pagina_atual: pagina,
                total_paginas: Math.ceil(totalProdutos / limiteSeguro),
                itens_na_pagina: produtos.length
            },
            produtos: produtos
        });
    } catch (error) {
        console.error("Erro na API Pública ao buscar produtos:", error);
        res.status(500).json({ error: 'Erro ao buscar produtos da loja.' });
    }
});

// Rota POST /api/v1/produtos (Requer permissão: escrever_produtos)
router.post('/produtos', requirePermission('escrever_produtos'), async (req, res) => {
    try {
        const {
            nome, preco, estoque = 0, descricao = '', imagem_url = null, peso = 0.30, ativo = true, id_externo = null
        } = req.body;

        if (!nome || preco === undefined) {
            return res.status(400).json({ error: 'Os campos "nome" e "preco" são obrigatórios.' });
        }

        // 🚀 MODO SANDBOX: Retorna sucesso sem salvar no banco
        if (req.is_sandbox) {
            return res.status(201).json({
                sucesso: true,
                sandbox: true,
                mensagem: '[SANDBOX] Produto validado com sucesso. Nenhuma alteração feita em produção.',
                produto: {
                    id_produto: Math.floor(Math.random() * 90000) + 10000,
                    nome: String(nome),
                    preco: Number(preco),
                    estoque: Number(estoque),
                    id_externo: id_externo
                }
            });
        }

        const novoProduto = await prisma.produtos.create({
            data: {
                id_tenant: req.tenant_id,
                nome: String(nome),
                preco: Number(preco),
                estoque: Number(estoque),
                descricao: String(descricao),
                imagem_url: imagem_url ? String(imagem_url) : null,
                peso: Number(peso),
                ativo: Boolean(ativo),
                id_externo: id_externo ? String(id_externo) : null
            },
            select: { id_produto: true, nome: true, preco: true, estoque: true, id_externo: true }
        });

        res.status(201).json({
            sucesso: true,
            mensagem: 'Produto cadastrado com sucesso!',
            produto: novoProduto
        });

    } catch (error) {
        console.error("Erro na API Pública ao cadastrar produto:", error);
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Já existe um produto com este id_externo cadastrado nesta loja.' });
        }
        res.status(500).json({ error: 'Erro interno ao criar o produto.' });
    }
});

// Rota PUT /api/v1/produtos/:id/estoque (Requer permissão: escrever_produtos)
router.put('/produtos/:id/estoque', requirePermission('escrever_produtos'), async (req, res) => {
    try {
        const id_produto = Number(req.params.id);
        const { estoque } = req.body;

        if (estoque === undefined || isNaN(estoque)) {
            return res.status(400).json({ error: 'O campo "estoque" é obrigatório e deve ser um número.' });
        }

        const produtoExistente = await prisma.produtos.findFirst({
            where: { id_produto: id_produto, id_tenant: req.tenant_id }
        });

        if (!produtoExistente) {
            return res.status(404).json({ error: 'Produto não encontrado ou não pertence a esta loja.' });
        }

        // 🚀 MODO SANDBOX: Retorna sucesso sem salvar no banco
        if (req.is_sandbox) {
            return res.json({
                sucesso: true,
                sandbox: true,
                mensagem: '[SANDBOX] Estoque validado com sucesso. Nenhuma alteração feita em produção.',
                produto: { id_produto: id_produto, nome: produtoExistente.nome, estoque: Number(estoque) }
            });
        }

        const produtoAtualizado = await prisma.produtos.update({
            where: { id_produto: id_produto },
            data: { estoque: Number(estoque) },
            select: { id_produto: true, nome: true, estoque: true, preco: true }
        });

        res.json({
            sucesso: true,
            mensagem: 'Estoque sincronizado com sucesso!',
            produto: produtoAtualizado
        });

    } catch (error) {
        console.error("Erro na API Pública ao atualizar estoque:", error);
        res.status(500).json({ error: 'Erro interno ao atualizar o estoque do produto.' });
    }
});

// ============================================================================
// 🛒 ROTAS DE PEDIDOS
// ============================================================================

// Rota GET /api/v1/pedidos (Requer permissão: ler_pedidos)
router.get('/pedidos', requirePermission('ler_pedidos'), async (req, res) => {
    try {
        // 🚀 AQUI TAMBÉM PODERIA TER PAGINAÇÃO, SE QUISER!
        const pedidosRaw = await prisma.pedidos.findMany({
            where: { id_tenant: req.tenant_id }, 
            orderBy: { data_pedido: 'desc' }, 
            take: 50, 
            select: {
                id_pedido: true, status_pagamento: true, status_entrega: true, preco_total: true,
                preco_frete: true, metodo_pagamento: true, data_pedido: true, metodo_envio: true,
                codigo_rastreio: true, canal_venda: true, entrega_cep: true, entrega_logradouro: true,
                entrega_numero: true, entrega_complemento: true, entrega_bairro: true,
                entrega_cidade: true, entrega_estado: true,
                usuarios: {
                    select: { nome_completo: true, email: true, telefone_criptografado: true, cpf_criptografado: true }
                },
                pedido_items: true 
            }
        });

        const pedidosFormatados = pedidosRaw.map(pedido => {
            let clienteLimpo = null;
            if (pedido.usuarios) {
                let cpfReal = null;
                let telefoneReal = null;
                try {
                    if (pedido.usuarios.cpf_criptografado) cpfReal = decrypt(pedido.usuarios.cpf_criptografado);
                    if (pedido.usuarios.telefone_criptografado) telefoneReal = decrypt(pedido.usuarios.telefone_criptografado);
                } catch (err) {
                    console.error(`Erro ao descriptografar dados do pedido ${pedido.id_pedido}`);
                }
                clienteLimpo = {
                    nome: pedido.usuarios.nome_completo, email: pedido.usuarios.email,
                    telefone: telefoneReal, cpf: cpfReal
                };
            }

            return {
                id_pedido: pedido.id_pedido, status_pagamento: pedido.status_pagamento, status_entrega: pedido.status_entrega,
                preco_total: pedido.preco_total, preco_frete: pedido.preco_frete, metodo_pagamento: pedido.metodo_pagamento,
                data_pedido: pedido.data_pedido, metodo_envio: pedido.metodo_envio, codigo_rastreio: pedido.codigo_rastreio,
                canal_venda: pedido.canal_venda,
                endereco_entrega: {
                    cep: pedido.entrega_cep, logradouro: pedido.entrega_logradouro, numero: pedido.entrega_numero,
                    complemento: pedido.entrega_complemento, bairro: pedido.entrega_bairro, cidade: pedido.entrega_cidade, estado: pedido.entrega_estado
                },
                cliente: clienteLimpo, 
                itens: pedido.pedido_items
            };
        });

        res.json({ sucesso: true, sandbox: req.is_sandbox || false, total: pedidosFormatados.length, pedidos: pedidosFormatados });
        
    } catch (error) {
        console.error("Erro na API Pública de Pedidos:", error);
        res.status(500).json({ error: 'Erro ao buscar pedidos da loja.' });
    }
});

// Rota PUT /api/v1/pedidos/:id/rastreio (Requer permissão: escrever_pedidos)
router.put('/pedidos/:id/rastreio', requirePermission('escrever_pedidos'), async (req, res) => {
    try {
        const id_pedido = Number(req.params.id);
        const { codigo_rastreio, metodo_envio } = req.body;

        if (!codigo_rastreio) {
            return res.status(400).json({ error: 'O campo "codigo_rastreio" é obrigatório.' });
        }

        const pedidoExistente = await prisma.pedidos.findFirst({
            where: { id_pedido: id_pedido, id_tenant: req.tenant_id }
        });

        if (!pedidoExistente) {
            return res.status(404).json({ error: 'Pedido não encontrado ou não pertence a esta loja.' });
        }

        // 🚀 MODO SANDBOX: Retorna sucesso sem salvar no banco
        if (req.is_sandbox) {
            return res.json({
                sucesso: true,
                sandbox: true,
                mensagem: '[SANDBOX] Rastreio validado com sucesso. Nenhuma alteração feita em produção.',
                pedido: { id_pedido: id_pedido, codigo_rastreio: codigo_rastreio, metodo_envio: metodo_envio || pedidoExistente.metodo_envio, status_entrega: 'Enviado' }
            });
        }

        const pedidoAtualizado = await prisma.pedidos.update({
            where: { id_pedido: id_pedido },
            data: {
                codigo_rastreio: String(codigo_rastreio),
                metodo_envio: metodo_envio ? String(metodo_envio) : pedidoExistente.metodo_envio,
                status_entrega: 'Enviado' 
            },
            select: { id_pedido: true, status_entrega: true, codigo_rastreio: true, metodo_envio: true }
        });

        res.json({ sucesso: true, mensagem: 'Código de rastreio salvo e pedido marcado como Enviado!', pedido: pedidoAtualizado });

    } catch (error) {
        console.error("Erro na API Pública ao atualizar rastreio:", error);
        res.status(500).json({ error: 'Erro interno ao atualizar o rastreio do pedido.' });
    }
});

// ============================================================================
// ⚠️ AVISO SOBRE ROTAS DE WEBHOOK
// ============================================================================

// Rota POST /api/v1/webhooks/settings (Requer permissão: escrever_pedidos - Apenas para segurança)
router.post('/webhooks/settings', requirePermission('escrever_pedidos'), async (req, res) => {
    try {
        const { url, evento } = req.body;
        if (!url) return res.status(400).json({ error: 'A URL é obrigatória.' });

        if (req.is_sandbox) {
             return res.json({ sucesso: true, sandbox: true, message: '[SANDBOX] Webhook configurado (Fake)!' });
        }

        await prisma.tenant_webhooks.create({
            data: { id_tenant: req.tenant_id, url: url, evento: evento || 'pedido.pago' }
        });
        res.json({ sucesso: true, message: 'Webhook configurado via API!' });
    } catch (e) { 
        res.status(500).json({ error: 'Erro ao salvar.' }); 
    }
});

router.get('/testar-webhook', requirePermission('escrever_pedidos'), async (req, res) => {
    try {
        const payloadFake = {
            id_pedido: "TESTE-123", valor_total: 157.90, metodo_pagamento: "PIX",
            cliente: { nome: "Ararinha do RJ (Teste)", email: "ararinhateste@ararinhacloud.shop", cpf: "012.345.678-09" }
        };

        await dispatchWebhook(req.tenant_id, 'pedido.pago', payloadFake);
        res.json({ sucesso: true, mensagem: "Webhook enviado! Olhe o site Webhook.site" });
    } catch (error) {
        console.error("Erro no teste de webhook:", error);
        res.status(500).json({ error: "Erro ao disparar webhook." });
    }
});

export default router;