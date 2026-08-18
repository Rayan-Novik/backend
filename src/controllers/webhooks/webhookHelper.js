import UsuarioModel from '../../models/usuarioModel.js';
import PedidoModel from '../../models/pedidoModel.js';
import { sendWhatsAppPaymentReceipt } from '../../services/whatsapp/templates.js';
import { decrypt } from '../../services/cryptoService.js';

export const notificarPagamentoAprovado = async (pedidoAtualizado, id_tenant) => {
    try {
        const usuario = await UsuarioModel.findById(pedidoAtualizado.id_usuario, id_tenant);
        if (!usuario) return;

        const telefoneLimpo = usuario.telefone_criptografado ? decrypt(usuario.telefone_criptografado) : null;
        const pedidoCompleto = await PedidoModel.findById(pedidoAtualizado.id_pedido, undefined, id_tenant);
        
        const itensDoPedido = pedidoCompleto?.items || [];
        const dadosDoPedido = pedidoCompleto?.pedido || pedidoAtualizado; 

        const linkAcompanhamento = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/order/${pedidoAtualizado.id_pedido}`;

        if (telefoneLimpo) {
            await sendWhatsAppPaymentReceipt(
                telefoneLimpo,
                dadosDoPedido, 
                usuario,
                itensDoPedido,
                linkAcompanhamento,
                id_tenant
            );
        }
    } catch (error) {
        console.error("❌ Erro ao notificar pagamento aprovado:", error.message);
    }
};