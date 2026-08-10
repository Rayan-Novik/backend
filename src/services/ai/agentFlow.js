import { PrismaClient } from '@prisma/client';
import { processarMensagemIA } from './groqService.js'; // 🚚 IA de Vendas/Delivery
import { processarAgendamentoIA } from './aiSchedulingService.js'; // 🗓️ NOVA IA de Agendamentos

const prisma = new PrismaClient();

export const handleAIAttendance = async (remoteJid, id_tenant, textoCliente) => {
    try {
        // 1. Busca nome da loja
        const loja = await prisma.tenants.findUnique({
            where: { id: Number(id_tenant) },
            select: { nome_fantasia: true }
        });
        const nomeLoja = loja ? loja.nome_fantasia : "nossa loja";

        // 2. BUSCA CONFIGURAÇÕES DA IA E O MODO DE OPERAÇÃO
        const configIA = await prisma.aiConfiguracoes.findUnique({
            where: { id_tenant: Number(id_tenant) }
        });

        // Valores padrão caso o tenant ainda não tenha configurado
        const config = configIA || {
            nome_agente: "Chico",
            personalidade: "Neutro e Direto",
            ramo_loja: "Restaurante / Lanches",
            tempo_resposta: 3,
            modo_apenas_agendamento: false // 🟢 Por padrão é Delivery
        };

        // 3. BUSCA O INSTAGRAM DA LOJA
        const configs = await prisma.configuracoes.findMany({
            where: {
                id_tenant: Number(id_tenant),
                chave: { in: ['INSTAGRAM_ATIVO', 'LINK_INSTAGRAM'] }
            }
        });

        let instaAtivo = false;
        let linkInsta = '';

        configs.forEach(c => {
            if (c.chave === 'INSTAGRAM_ATIVO') instaAtivo = c.valor === 'true';
            if (c.chave === 'LINK_INSTAGRAM') linkInsta = c.valor;
        });
        const instagramUrl = (instaAtivo && linkInsta) ? linkInsta : null;

        // 4. PREPARA O HISTÓRICO DE MENSAGENS PARA A IA LER
        const ultimasMensagens = await prisma.whatsappMensagens.findMany({
            where: { remoteJid: remoteJid, id_tenant: Number(id_tenant) },
            orderBy: { data_envio: 'desc' },
            take: 6
        });

        const historicoFormatado = ultimasMensagens.reverse().map(m => {
            let textoLimpo = m.conteudo;
            if (m.tipo === 'audio' && textoLimpo.includes('[IA]:')) {
                textoLimpo = textoLimpo.split('[IA]:')[1].trim();
            }
            return {
                role: m.fromMe ? "assistant" : "user",
                content: textoLimpo
            };
        });

        // =====================================================================
        // 🟢 ROTEADOR: SE O MODO DE AGENDAMENTOS ESTIVER ATIVO NA TELA DA IA
        // =====================================================================
        if (config.modo_apenas_agendamento === true) {
            
            // A. Busca SOMENTE produtos marcados como SERVICO
            const servicos = await prisma.produtos.findMany({
                where: { id_tenant: Number(id_tenant), ativo: true, tipo_produto: 'SERVICO' },
                select: { 
                    id_produto: true, nome: true, preco: true, tempo_duracao: true, descricao: true,
                    produto_variacoes: { select: { id_variacao: true, cor: true, tamanho: true, preco_adicional: true } }
                }
            });

            // B. Busca a lista de PROFISSIONAIS/FUNCIONÁRIOS ativos da loja
            const profissionais = await prisma.funcionarios.findMany({
                where: { id_tenant: Number(id_tenant), ativo: true },
                select: { id_funcionario: true, nome_completo: true }
            });

            // C. Formata o catálogo de serviços
            const catalogoServicos = servicos.map(s => {
                let txt = `[ID: ${s.id_produto}] ${s.nome} - R$${s.preco} (Duração: ${s.tempo_duracao} minutos)`;
                if (s.descricao) txt += `\n    Descrição: ${s.descricao}`;
                if (s.produto_variacoes && s.produto_variacoes.length > 0) {
                    txt += `\n    Opções de Variação: ` + s.produto_variacoes.map(v => `[ID Var: ${v.id_variacao}] ${v.cor || ''} ${v.tamanho || ''} (+R$${v.preco_adicional})`).join(' | ');
                }
                return txt;
            }).join('\n\n');

            // D. Formata a lista de profissionais
            const listaProfissionais = profissionais.map(p => `[ID: ${p.id_funcionario}] ${p.nome_completo}`).join('\n');

            // E. Chama o NOVO arquivo que criamos (aiSchedulingService.js)
            await processarAgendamentoIA(
                remoteJid, 
                Number(id_tenant), 
                historicoFormatado, 
                catalogoServicos, 
                listaProfissionais, 
                nomeLoja, 
                config, 
                instagramUrl
            );

        } else {
            // =====================================================================
            // 🍔 MODO DELIVERY / E-COMMERCE (Comportamento Padrão)
            // =====================================================================
            
            const produtos = await prisma.produtos.findMany({
                where: { 
                    id_tenant: Number(id_tenant), 
                    active_ecommerce: true,
                    ativo: true,
                    tipo_produto: { in: ['FINAL', 'MISTO'] } 
                },
                take: 30, 
                select: { 
                    id_produto: true, nome: true, preco: true, descricao: true, estoque: true,
                    produto_variacoes: { select: { id_variacao: true, cor: true, tamanho: true, estoque: true, preco_adicional: true } },
                    composicao_pai: { select: { insumo: { select: { nome: true } } } }
                }
            });

            const catalogoFormatado = produtos.map(p => {
                let itemText = `[ID: ${p.id_produto}] - ${p.nome}: Base R$${p.preco} | Estoque Geral: ${p.estoque} unidades`;
                
                if (p.descricao) itemText += `\n    Descrição: ${p.descricao}`;
                
                if (p.composicao_pai && p.composicao_pai.length > 0) {
                    const ingredientes = p.composicao_pai.map(c => c.insumo?.nome).filter(Boolean).join(', ');
                    if (ingredientes) itemText += `\n    Ingredientes: ${ingredientes}`;
                }

                if (p.produto_variacoes && p.produto_variacoes.length > 0) {
                    itemText += `\n    VARIAÇÕES DISPONÍVEIS DESTE ITEM:`;
                    p.produto_variacoes.forEach(v => {
                        const precoReal = Number(p.preco) + Number(v.preco_adicional);
                        const varNome = [v.cor, v.tamanho].filter(Boolean).join(' - ');
                        itemText += `\n      - [Var ID: ${v.id_variacao}] ${varNome}: R$${precoReal.toFixed(2)} | Estoque: ${v.estoque} unidades`;
                    });
                } else {
                    itemText += `\n    (Produto único, não possui variação de cor/tamanho)`;
                }

                return itemText + '\n';
            }).join('\n');

            // Chama o arquivo padrão de Vendas (groqService.js)
            await processarMensagemIA(
                remoteJid, 
                Number(id_tenant), 
                historicoFormatado, 
                catalogoFormatado, 
                nomeLoja, 
                config, 
                instagramUrl,
                false
            );
        }

    } catch (iaError) {
        console.error(`❌ [Tenant ${id_tenant}] Falha no Fluxo do Agente IA:`, iaError);
    }
};