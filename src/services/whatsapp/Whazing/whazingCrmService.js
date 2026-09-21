import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import whazingDbService from './whazingDbService.js';
const prisma = new PrismaClient();

class WhazingCrmService {

    async _getApi(tenantId) {
        if (!tenantId) throw new Error("Tenant ID é obrigatório para acessar o Whazing.");

        const config = await prisma.whazing_configuracoes.findUnique({
            where: { id_tenant: Number(tenantId) }
        });

        if (!config || !config.api_id) {
            throw new Error("Credenciais do Whazing não configuradas para esta loja no painel.");
        }

        const baseUrl = config.base_url;

        return {
            api: axios.create({
                baseURL: `${baseUrl}/${config.api_id}`,
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Content-Type': 'application/json'
                }
            }),
            baseUrlRoot: baseUrl.split('/v1')[0]
        };
    }

    // =====================================
    // TICKETS
    // =====================================
    async getTicketsByNumber(number, tenantId) {
        try {
            const { api } = await this._getApi(tenantId);
            const response = await api.post('/showallticket', { number: String(number) });
            return Array.isArray(response.data) ? response.data : (response.data?.data || response.data?.tickets || []);
        } catch (error) {
            console.error('[CRM] Erro ao buscar tickets:', error.response?.data || error.message);
            throw new Error('Falha ao buscar tickets deste número.');
        }
    }

    async createTicket(number, tenantId) {
        try {
            const { api } = await this._getApi(tenantId);
            
            // 🟢 MÁGICA: Pesca o ID verdadeiro da fila direto do banco! (Pode ser 1, 4, 10...)
            let firstQueueId = await whazingDbService.getFirstQueueId(tenantId);
            
            // Se o sistema não achar, tenta forçar o 1 para não travar
            if (!firstQueueId) firstQueueId = 5;

            // 🟢 PAYLOAD EXATAMENTE IGUAL AO DA DOCUMENTAÇÃO!
            const payload = { 
                number: String(number), 
                status: "pending", 
                queueId: firstQueueId, 
                userId: null 
            };

            const response = await api.post('/createticket', payload);
            return response.data;
        } catch (error) {
            console.error('[CRM] Erro ao criar ticket:', error.response?.data || error.message);
            throw new Error('Falha ao criar ticket. Certifique-se de que a Whazing tenha pelo menos uma Fila (Setor) criada.');
        }
    }

    // =====================================
    // MENSAGENS (WHATSAPP)
    // =====================================
    async sendMessageByNumber(number, text, tenantId) {
        try {
            const { api } = await this._getApi(tenantId);
            const payload = {
                number: String(number),
                body: text,
                externalKey: `msg_${Date.now()}`
            };
            const response = await api.post('/', payload); 
            return response.data;
        } catch (error) {
            console.error('\n❌ ERRO WHAZING (ENVIAR MSG):', error.response?.data || error.message);
            throw new Error('Falha ao enviar mensagem WhatsApp.');
        }
    }

    async sendQuoteMessage(number, cardData, produtosList, tenantId) {
        try {
            const { api } = await this._getApi(tenantId);
            
            let itensTexto = '';
            if (produtosList && produtosList.length > 0) {
                itensTexto = produtosList.map(item => {
                    const nome = item.text || item.title || 'Produto';
                    const precoFormatado = item.preco ? `R$ ${Number(item.preco).toFixed(2)}` : '';
                    return `▫️ ${nome} ${precoFormatado ? `— ${precoFormatado}` : ''}`;
                }).join('\n');
            } else {
                itensTexto = '▫️ Nenhum produto especificado.';
            }

            const payload = {
                number: String(number),
                body: `✅ *Orçamento de Pedido*\n\nOlá! Segue o detalhamento do atendimento referente a: *${cardData.title}*.\n\n📦 *Produtos/Itens:*\n${itensTexto}\n\n💰 *Valor Total:* R$ ${Number(cardData.value || 0).toFixed(2)}\n\nSe precisar de algo, estamos à disposição!`,
                externalKey: `orcamento_${Date.now()}`
            };

            const response = await api.post('/', payload); 
            return response.data;
        } catch (error) {
            throw new Error('Falha ao enviar orçamento via WhatsApp.');
        }
    }

    // =====================================
    // CONTATOS E MENSAGENS
    // =====================================
    async searchContacts(query, tenantId) {
        try {
            const { api, baseUrlRoot } = await this._getApi(tenantId);
            
            const response = await api.get(`${baseUrlRoot}/contacts/`, {
                params: { searchParam: query }
            });
            
            return response.data; 
        } catch (error) {
            if (error.response?.status === 401) {
                console.error('⚠️ A Whazing não permitiu usar o Token da API nesta rota interna.');
            }
            return { contacts: [] }; 
        }
    }

    async getTicketMessages(ticketId, tenantId) {
        try {
            const { api } = await this._getApi(tenantId);
            const response = await api.get(`/ticket/${ticketId}`);
            return Array.isArray(response.data) ? response.data : (response.data?.messages || []);
        } catch (error) {
            return []; 
        }
    }

    // =====================================
    // CANAL E STATUS DO WHATSAPP
    // =====================================
    async getChannelStatus(tenantId) {
        try {
            const { api } = await this._getApi(tenantId);
            // O GET na Whazing geralmente é feito assim
            const response = await api.get('/statuschannel');
            return response.data;
        } catch (error) {
            console.error('[CRM] Erro ao buscar status do canal:', error.message);
            // Retorna um status de fallback para não quebrar a tela
            return { status: "DISCONNECTED", message: "Canal desconectado" };
        }
    }

    async getChannelQrCode(tenantId) {
        try {
            const { api } = await this._getApi(tenantId);
            const response = await api.post('/qrcode', { number: null });
            return response.data;
        } catch (error) {
            console.error('[CRM] Erro ao buscar QR Code:', error.message);
            throw new Error('Falha ao gerar QR Code do WhatsApp.');
        }
    }
}

export default new WhazingCrmService();