import { sendWhatsAppMessage } from './sender.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Envia uma notificação para o Lojista informando sobre um novo pedido.
 * Usa sempre a sessão MASTER (do dono do SaaS) para o disparo.
 * * @param {number} tenantId - ID do Lojista
 * @param {object} pedido - Dados do pedido recém-criado
 */
export const notificarLojistaNovoPedido = async (tenantId, pedido) => {
    try {
        // 1. Busca os dados do lojista no banco para pegar o telefone dele
        const tenant = await prisma.tenants.findUnique({
            where: { id: parseInt(tenantId) },
            select: { nome_fantasia: true, telefone_contato: true }
        });

        if (!tenant || !tenant.telefone_contato) {
            console.log(`🔕 [Notifier] Tenant ${tenantId} não possui telefone de contato configurado.`);
            return false;
        }

        // 2. Limpa a formatação do telefone (ex: "(92) 99902-2847" -> "5592999022847")
        let telefoneLimpo = tenant.telefone_contato.replace(/\D/g, '');
        if (!telefoneLimpo.startsWith('55')) {
            telefoneLimpo = '55' + telefoneLimpo;
        }

        // 3. Monta a mensagem bonitinha
        const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pedido.total || 0);
        
        const mensagem = 
`🔔 *NOVO PEDIDO RECEBIDO!* 🔔

Olá, equipe da *${tenant.nome_fantasia}*!
Você acaba de receber um novo pedido na sua loja virtual.

📦 *Pedido:* #${pedido.id}
👤 *Cliente:* ${pedido.nome_cliente || 'Não informado'}
💳 *Valor Total:* ${valorFormatado}
📱 *Status:* ${pedido.status || 'Aguardando Pagamento'}

Acesse seu painel ArarinhaCloud para ver os detalhes e preparar o envio!
🌐 https://app.ararinhacloud.shop`;

        // 4. Dispara a mensagem usando a sessão MASTER
        console.log(`🚀 [Notifier] Enviando notificação para o Lojista ${tenantId} no número ${telefoneLimpo}...`);
        
        // Passamos 'MASTER' como tenantId para o sender, garantindo que saia do seu número
        const sucesso = await sendWhatsAppMessage(telefoneLimpo, { text: mensagem }, 'MASTER');

        if (sucesso) {
            console.log(`✅ [Notifier] Notificação enviada com sucesso para ${tenant.nome_fantasia}.`);
        } else {
            console.log(`❌ [Notifier] Falha ao enviar notificação para ${tenant.nome_fantasia}. O robô Master está conectado?`);
        }

        return sucesso;

    } catch (error) {
        console.error(`❌ [Notifier] Erro fatal ao notificar lojista:`, error);
        return false;
    }
};