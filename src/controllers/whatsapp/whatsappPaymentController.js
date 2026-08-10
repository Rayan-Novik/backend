import { PrismaClient } from '@prisma/client';
import { processarPagamento } from '../../services/paymentFactory.js';
import { sendPixCobrança } from '../../services/whatsapp/whatsappPaymentService.js';
import PedidoModel from '../../models/pedidoModel.js';
import { encrypt } from '../../services/cryptoService.js';

const prisma = new PrismaClient();

export const gerarCobrançaChat = async (req, res) => {
    try {
        const id_tenant = req.tenantId;
        const { jid, valor, descricao, modo, itens, tipoEntrega, taxaFrete } = req.body;

        if (!jid || !valor) {
            return res.status(400).json({ error: "O JID (contato) e o valor são obrigatórios." });
        }

        const telefoneLimpo = String(jid).replace(/\D/g, ''); 
        
        const contatoCrm = await prisma.whatsappContatos.findUnique({
            where: { jid_id_tenant: { jid: String(jid), id_tenant: Number(id_tenant) } }
        });
        const nomeDoCliente = contatoCrm?.nome || 'Cliente WhatsApp';

        let clienteGenerico = await prisma.usuarios.findFirst({
            where: { 
                nome_completo: 'Venda Avulsa WhatsApp', 
                id_tenant: Number(id_tenant) 
            }
        });

        if (!clienteGenerico) {
            clienteGenerico = await prisma.usuarios.create({
                data: {
                    nome_completo: 'Venda Avulsa WhatsApp',
                    email: `avulsa_t${id_tenant}@sistema.com`, 
                    telefone_criptografado: encrypt('00000000000'),
                    cpf_criptografado: encrypt('00000000000'), 
                    hash_senha: 'senha_sistema_whatsapp', 
                    id_tenant: Number(id_tenant)
                }
            });
        }

        const freteFinal = Number(taxaFrete || 0);
        const precoDosItens = Number(valor) - freteFinal; 

        const dadosPagamento = {
            amount: valor,
            description: descricao || 'Cobrança via WhatsApp',
            payer: {
                email: clienteGenerico.email, 
                firstName: nomeDoCliente,
                lastName: '',
                identification: { type: 'CPF', number: '00000000000' }
            }
        };

        const resultadoPix = await processarPagamento('PIX', dadosPagamento, id_tenant);

        if (!resultadoPix || !resultadoPix.pix_data) {
            return res.status(500).json({ error: "O Gateway não retornou os dados do PIX." });
        }

        let carrinhoItensParaModel = [];
        if (modo === 'produtos' && itens && itens.length > 0) {
            carrinhoItensParaModel = itens.map(item => ({
                quantidade: Number(item.quantidade),
                produtos: {
                    id_produto: Number(item.id_produto),
                    nome: item.nome,
                    preco: item.preco,
                    imagem_url: item.imagem_url // 🟢 CORREÇÃO: Repassando a imagem para o banco de dados!
                }
            }));
        }

        const statusDeEntrega = tipoEntrega === 'retirada' ? 'Retirada na Loja' : 'A Combinar';

        const dadosEnderecoGhost = tipoEntrega === 'entrega' ? {
            entrega_logradouro: 'Endereço a combinar no WhatsApp',
            entrega_numero: 'S/N',
            entrega_bairro: 'A combinar',
            entrega_cidade: 'Sua Cidade',
            entrega_estado: 'AM',
            entrega_cep: '00000000'
        } : {};

        const pedidoCriado = await PedidoModel.create({
            id_usuario: clienteGenerico.id_usuario, 
            observacoes: `[Venda WhatsApp]\nCliente: ${nomeDoCliente}\nTel: ${telefoneLimpo}`, 
            canal_venda: 'whatsapp',
            metodo_pagamento: 'PIX',
            status_pagamento: 'PENDENTE',
            status_entrega: statusDeEntrega,
            preco_itens: precoDosItens,
            preco_frete: freteFinal,
            preco_total: Number(valor),
            id_pagamento_gateway: String(resultadoPix.id),
            gateway_provider: resultadoPix.gateway,
            linha_digitavel: resultadoPix.pix_data.qr_code,
            url_boleto: resultadoPix.pix_data.qr_code_url || null,
            id_tenant: id_tenant,
            ...dadosEnderecoGhost
        }, carrinhoItensParaModel, id_tenant);

        const io = req.app.get('socketio');
        if (io) {
            io.emit('novo_pedido', {
                id: pedidoCriado.id_pedido || pedidoCriado.id,
                total: Number(valor),
                cliente: `${nomeDoCliente} (WhatsApp)`,
                status: 'PENDENTE',
                canal: 'whatsapp',
                id_tenant: id_tenant
            });
        }

        await sendPixCobrança(id_tenant, jid, valor, descricao, resultadoPix.pix_data);

        return res.status(200).json({ 
            success: true, 
            message: "Cobrança gerada com sucesso!",
            gateway_usado: resultadoPix.gateway,
            id_pedido: pedidoCriado.id_pedido || pedidoCriado.id
        });

    } catch (error) {
        console.error("❌ Erro ao gerar cobrança pelo chat:", error);
        return res.status(500).json({ error: error.message || "Erro interno ao gerar cobrança." });
    }
};