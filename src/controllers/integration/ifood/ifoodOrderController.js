import * as orderService from '../../../services/integration/ifood/ifoodOrderService.js';
import * as chatService from '../../../services/integration/ifood/ifoodChatService.js';

// Usado pelo botão "Aceitar Pedido" no seu Front
export const aceitarPedido = async (req, res, next) => {
    try {
        const { id_ifood } = req.params;
        await orderService.despacharAcaoPedido(req.tenantId, id_ifood, 'confirm');
        
        // Atualiza no seu banco local
        await prisma.pedidos.updateMany({
            where: { id_externo_ifood: id_ifood, id_tenant: req.tenantId },
            data: { status: 'PREPARANDO' }
        });

        res.status(200).json({ message: 'Pedido confirmado no iFood!' });
    } catch (error) { next(error); }
};

// Usado pelo botão "Saiu para Entrega"
export const despacharPedido = async (req, res, next) => {
    try {
        const { id_ifood } = req.params;
        await orderService.despacharAcaoPedido(req.tenantId, id_ifood, 'dispatch');
        res.status(200).json({ message: 'Status atualizado para: Saiu para Entrega' });
    } catch (error) { next(error); }
};

// Responder Chat
export const mandarMensagem = async (req, res, next) => {
    try {
        const { id_ifood } = req.params;
        const { mensagem } = req.body;
        
        await chatService.enviarMensagemAoCliente(req.tenantId, id_ifood, mensagem);
        res.status(200).json({ message: 'Enviado!' });
    } catch (error) { next(error); }
};