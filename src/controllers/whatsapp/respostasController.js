import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🟢 LISTAR todas as respostas rápidas do Tenant (COM AUTO-CRIAÇÃO DE MODELOS)
export const getRespostasRapidas = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);

        // 1. Busca as respostas atuais do lojista
        let respostas = await prisma.respostasRapidas.findMany({
            where: { id_tenant },
            orderBy: { atalho: 'asc' }
        });

        // 2. 🟢 MÁGICA DO SAAS: Se for uma conta nova (0 respostas), injeta os modelos pré-configurados!
        if (respostas.length === 0) {
            console.log(`🌱 [Tenant ${id_tenant}] Injetando modelos de Respostas Rápidas padrão...`);
            
            const modelosPadrao = [
                {
                    id_tenant,
                    atalho: 'pix',
                    mensagem: 'Olá! Para finalizar o seu pedido, o pagamento pode ser feito via PIX.\n\n🔑 *Chave PIX:* {{chave_pix}}\n👤 *Titular:* {{nome_loja}}\n\nAssim que realizar o pagamento, por favor, me envie o comprovante aqui mesmo para eu confirmar e liberar o seu pedido! ✅'
                },
                {
                    id_tenant,
                    atalho: 'cobranca',
                    mensagem: 'Oi, {{nome_cliente}}! Tudo bem?\n\nEstou passando rapidinho para lembrar que o seu pedido ainda está aguardando pagamento. \n\nSe precisar de ajuda com a forma de pagamento ou se tiver alguma dúvida, é só me chamar aqui! Vamos garantir que seu pedido chegue logo. 📦'
                },
                {
                    id_tenant,
                    atalho: 'endereco',
                    mensagem: 'Nossa loja física está de portas abertas para te receber! 🏪\n\n📍 *Endereço:* {{endereco_loja}}\n🕒 *Horário de Funcionamento:* Segunda a Sexta, das 08h às 18h.\n\nVenha nos fazer uma visita!'
                },
                {
                    id_tenant,
                    atalho: 'catalogo',
                    mensagem: 'Que legal que você tem interesse nos nossos produtos! 😍\n\nVocê pode conferir todo o nosso catálogo atualizado com fotos e preços diretamente neste link:\n🔗 {{link_catalogo}}\n\nSe gostar de algo, é só me mandar o print ou o link aqui que eu separo para você!'
                }
            ];

            // Injeta todas de uma vez no banco de dados usando createMany
            await prisma.respostasRapidas.createMany({
                data: modelosPadrao
            });

            // Busca novamente agora que as respostas foram injetadas para devolver pro frontend
            respostas = await prisma.respostasRapidas.findMany({
                where: { id_tenant },
                orderBy: { atalho: 'asc' }
            });
        }

        res.json(respostas);
    } catch (error) {
        console.error('Erro ao buscar respostas rápidas:', error);
        res.status(500).json({ message: 'Erro ao buscar respostas rápidas.' });
    }
};

// 🟢 CRIAR uma nova resposta rápida
export const createRespostaRapida = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);
        const { atalho, mensagem } = req.body;

        if (!atalho || !mensagem) {
            return res.status(400).json({ message: 'Atalho e mensagem são obrigatórios.' });
        }

        const novaResposta = await prisma.respostasRapidas.create({
            data: {
                id_tenant,
                // Remove a barra "/" caso o usuário tenha enviado no texto do atalho
                atalho: atalho.replace(/\//g, '').trim().toLowerCase(),
                mensagem
            }
        });

        res.status(201).json(novaResposta);
    } catch (error) {
        console.error('Erro ao criar resposta rápida:', error);
        res.status(500).json({ message: 'Erro ao criar resposta rápida.' });
    }
};

// 🟢 ATUALIZAR uma resposta existente
export const updateRespostaRapida = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);
        const { id } = req.params;
        const { atalho, mensagem } = req.body;

        const resposta = await prisma.respostasRapidas.findFirst({
            where: { id: Number(id), id_tenant }
        });

        if (!resposta) {
            return res.status(404).json({ message: 'Resposta não encontrada.' });
        }

        const atualizada = await prisma.respostasRapidas.update({
            where: { id: Number(id) },
            data: {
                atalho: atalho ? atalho.replace(/\//g, '').trim().toLowerCase() : resposta.atalho,
                mensagem: mensagem || resposta.mensagem
            }
        });

        res.json(atualizada);
    } catch (error) {
        console.error('Erro ao atualizar resposta rápida:', error);
        res.status(500).json({ message: 'Erro ao atualizar resposta rápida.' });
    }
};

// 🟢 DELETAR uma resposta rápida
export const deleteRespostaRapida = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);
        const { id } = req.params;

        const resposta = await prisma.respostasRapidas.findFirst({
            where: { id: Number(id), id_tenant }
        });

        if (!resposta) {
            return res.status(404).json({ message: 'Resposta não encontrada.' });
        }

        await prisma.respostasRapidas.delete({
            where: { id: Number(id) }
        });

        res.json({ message: 'Resposta rápida removida com sucesso.' });
    } catch (error) {
        console.error('Erro ao deletar resposta rápida:', error);
        res.status(500).json({ message: 'Erro ao deletar resposta rápida.' });
    }
};