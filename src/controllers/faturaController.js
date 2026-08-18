import axios from 'axios';
import crypto from 'node:crypto'; 
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🟢 CHAVES DO MERCADO PAGO (Coloque no seu arquivo .env)
// MP_ACCESS_TOKEN_SAAS = Seu Access Token de Produção
// MP_WEBHOOK_SECRET_SAAS = Segredo do Webhook (opcional para reforçar segurança)
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN_SAAS;

// ============================================================================
// 1️⃣ GERAR COBRANÇA (PIX OU BOLETO) - MERCADO PAGO
// ============================================================================
export const gerarCobrancaSaaS = async (req, res) => {
    try {
        const id_tenant = req.tenantId;
        const { metodo } = req.body; // Espera "PIX" ou "BOLETO"

        if (!MP_ACCESS_TOKEN) {
            return res.status(400).json({ message: "Access Token do Mercado Pago não configurado no servidor." });
        }

        const loja = await prisma.tenants.findUnique({
            where: { id: id_tenant }
        });

        if (!loja) return res.status(404).json({ message: "Loja não encontrada." });

        const planoBanco = await prisma.planos.findFirst({
            where: { nome: loja.plano }
        });

        if (!planoBanco) {
            return res.status(400).json({ message: "Plano não encontrado no sistema." });
        }

        if (Number(planoBanco.preco_mensal) <= 0) {
            return res.status(400).json({ message: "Este é um plano gratuito, não é necessário gerar fatura." });
        }

        const valor = Number(planoBanco.preco_mensal);

        // Define o método exato que o Mercado Pago exige
        const paymentMethodId = metodo === "BOLETO" ? "bolbradesco" : "pix";
        
        // Define a data de vencimento (3 dias a partir de hoje)
        const vencimento = new Date();
        vencimento.setDate(vencimento.getDate() + 3);

        // Limpa o documento para o Mercado Pago não rejeitar
        const docLimpo = loja.documento?.replace(/\D/g, '') || '00000000000';
        const docType = docLimpo.length > 11 ? 'CNPJ' : 'CPF';

        // ========================= CRIA O PAGAMENTO NO MP =========================
        const paymentData = {
            transaction_amount: valor,
            description: `Assinatura SaaS - Plano ${planoBanco.nome}`,
            payment_method_id: paymentMethodId,
            date_of_expiration: vencimento.toISOString(), // Expira em 3 dias
            payer: {
                email: loja.email || loja.email_contato || 'contato@loja.com',
                first_name: loja.nome_fantasia || "Lojista",
                identification: {
                    type: docType,
                    number: docLimpo
                }
            }
        };

        const response = await axios.post('https://api.mercadopago.com/v1/payments', paymentData, {
            headers: { 
                'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                'X-Idempotency-Key': crypto.randomUUID() // Evita duplicidade se der lag
            }
        });

        const pagamento = response.data;

        // ========================= EXTRAI OS LINKS =========================
        let pixPayload = null;
        let urlPagamento = null;

        if (pagamento.payment_method_id === "pix") {
            pixPayload = pagamento.point_of_interaction?.transaction_data?.qr_code;
            urlPagamento = pagamento.point_of_interaction?.transaction_data?.ticket_url; // Link do checkout do PIX
        } else {
            urlPagamento = pagamento.transaction_details?.external_resource_url; // Link do PDF do Boleto
        }

        // ========================= SALVAR NO BANCO =========================
        await prisma.faturas_saas.create({
            data: {
                tenant_id: id_tenant,
                descricao: `Plano ${planoBanco.nome}`,
                valor: valor,
                status: "PENDENTE",
                external_id: pagamento.id.toString(), // Salva o ID do MP
                url_pagamento: urlPagamento,
                pix_copia_cola: pixPayload
            }
        });

        res.json({
            url_pagamento: urlPagamento,
            pix_copia_cola: pixPayload
        });

    } catch (error) {
        console.error("Erro Mercado Pago:", error.response?.data || error.message);
        res.status(500).json({ message: "Erro ao gerar cobrança no Mercado Pago." });
    }
};

// ============================================================================
// 2️⃣ WEBHOOK MERCADO PAGO
// ============================================================================
export const webhookMercadoPago = async (req, res) => {
    try {
        const body = req.body;

        // O Mercado Pago envia notificações de vários tipos. Queremos os de pagamento.
        if (body.action === "payment.created" || body.action === "payment.updated") {
            const paymentId = body.data?.id;

            if (!paymentId) return res.sendStatus(200);

            // 🟢 BLINDAGEM DE SEGURANÇA: Vai buscar o pagamento direto no MP
            // Isso evita que hackers mandem POSTs falsos simulando pagamentos
            const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
            });

            const paymentData = mpResponse.data;

            // Se o status for 'approved', a gente libera a loja!
            if (paymentData.status === "approved") {
                const externalId = paymentData.id.toString();

                const fatura = await prisma.faturas_saas.findUnique({
                    where: { external_id: externalId }
                });

                if (fatura && fatura.status !== "PAGO") {
                    const novoVencimento = new Date();
                    novoVencimento.setDate(novoVencimento.getDate() + 30); // Libera mais 30 dias

                    await prisma.tenants.update({
                        where: { id: fatura.tenant_id },
                        data: {
                            status_assinatura: "ATIVO",
                            data_vencimento: novoVencimento
                        }
                    });

                    await prisma.faturas_saas.update({
                        where: { id: fatura.id },
                        data: {
                            status: "PAGO",
                            pago_em: new Date()
                        }
                    });

                    console.log(`✅ [SaaS] Fatura de ${paymentData.transaction_amount} paga. Loja ${fatura.tenant_id} renovada!`);
                }
            }
        }

        // MP exige que você sempre retorne 200 rápido
        res.sendStatus(200);
    } catch (error) {
        console.error("Erro no Webhook do Mercado Pago:", error.message);
        res.sendStatus(500);
    }
};

// ============================================================================
// 3️⃣ HISTÓRICO DE FATURAS (Igual)
// ============================================================================
export const getHistoricoFaturas = async (req, res) => {
    try {
        const id_tenant = req.tenantId;

        const faturas = await prisma.faturas_saas.findMany({
            where: { tenant_id: id_tenant },
            orderBy: { criado_em: 'desc' },
            take: 10
        });

        res.json(faturas);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar histórico." });
    }
};

// ============================================================================
// 4️⃣ STATUS DA ASSINATURA (Igual)
// ============================================================================
export const getStatusAssinatura = async (req, res) => {
    try {
        const loja = await prisma.tenants.findUnique({
            where: { id: req.tenantId },
            select: { id: true, status_assinatura: true, data_vencimento: true, plano: true }
        });

        if (!loja) {
            return res.status(404).json({ message: "Loja não encontrada." });
        }

        let statusAtual = loja.status_assinatura;
        const hoje = new Date();

        if (
            loja.data_vencimento &&
            new Date(loja.data_vencimento) < hoje &&
            (statusAtual === 'ATIVO' || statusAtual === 'TRIAL')
        ) {
            statusAtual = 'VENCIDA';

            await prisma.tenants.update({
                where: { id: loja.id },
                data: { status_assinatura: statusAtual }
            });
        }

        res.json({
            status_assinatura: statusAtual,
            data_vencimento: loja.data_vencimento,
            plano: loja.plano
        });

    } catch (error) {
        console.error("Erro ao buscar status:", error);
        res.status(500).json({ message: "Erro ao buscar status." });
    }
};