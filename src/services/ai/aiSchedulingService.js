import Groq from "groq-sdk";
import axios from "axios";
import { PrismaClient } from '@prisma/client';
import { sendCRMMessage } from '../whatsapp/sender.js';
// 🟢 IMPORTAÇÃO ATUALIZADA: Puxamos o gerador de PIX
import { confirmarAgendamentoViaIA, gerarPixViaIA } from '../whatsapp/whatsappPaymentService.js';
import { buildAgendamentoPrompt } from './promptService.js';

const prisma = new PrismaClient();
const delay = (ms) => new Promise(res => setTimeout(res, ms));

const getAIConfigData = async (id_tenant) => {
    const config = await prisma.aiConfiguracoes.findUnique({ where: { id_tenant: Number(id_tenant) } });
    const provedor = config?.provedor_ia || 'GROQ'; 
    let apiKey = '';
    let model = '';

    if (provedor === 'GEMINI') {
        apiKey = config?.gemini_api_key || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Chave do Gemini não configurada.");
        apiKey = String(apiKey).trim().replace(/['"]/g, '');
        model = "gemini-2.5-flash"; 
    } else {
        apiKey = config?.groq_api_key || process.env.GROQ_API_KEY_MASTER; 
        if (!apiKey) throw new Error("Chave do Groq não configurada.");
        apiKey = String(apiKey).trim().replace(/['"]/g, '');
        model = "llama-3.3-70b-versatile";
    }
    return { provedor, apiKey, model };
};

const toolsAgendamento = [
    {
        type: "function",
        function: {
            name: "buscar_horarios_disponiveis",
            description: "Lista os horários livres. SÓ DEVE SER USADA UMA VEZ. É proibido usar esta ferramenta para tentar confirmar se um horário já escolhido pelo cliente é válido.",
            parameters: {
                type: "object",
                properties: {
                    data_desejada: { type: "string", description: "Data no formato AAAA-MM-DD. Ex: 2026-06-25." },
                    id_servico: { type: "number", description: "ID do serviço desejado." }
                },
                required: ["data_desejada", "id_servico"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "confirmar_agendamento",
            description: "Grava a reserva após o cliente ESCOLHER claramente se quer PIX ou LOCAL.",
            parameters: {
                type: "object",
                properties: {
                    nome_cliente: { type: "string", description: "O nome completo ou primeiro nome do cliente coletado no chat." }, 
                    id_servico: { type: "number" },
                    data_inicio: { type: "string", description: "Data e Hora ISO 8601 (ex: 2026-06-25T14:30:00.000Z)" },
                    id_funcionario: { type: "number", description: "ID do profissional escolhido (ou null se qualquer um)." },
                    valor_total: { type: "number" },
                    metodo_pagamento: { type: "string", enum: ["PIX", "LOCAL"] }
                },
                required: ["nome_cliente", "id_servico", "data_inicio", "valor_total", "metodo_pagamento"] 
            }
        }
    },
    {
        type: "function",
        function: {
            name: "transferir_atendimento",
            description: "Encerra o chat ou transfere para um humano.",
            parameters: {
                type: "object",
                properties: { motivo: { type: "string" } },
                required: ["motivo"]
            }
        }
    }
];

export const processarAgendamentoIA = async (jid, id_tenant, historico, catalogoServicos, listaProfissionais, nomeLoja, agentConfig, instagramUrl) => {
    const { provedor, apiKey, model } = await getAIConfigData(id_tenant);
    const systemPrompt = buildAgendamentoPrompt(catalogoServicos, listaProfissionais, nomeLoja, agentConfig, instagramUrl);
    const messages = [ { role: "system", content: systemPrompt }, ...historico ];
    const nomeFmt = `*${agentConfig.nome_agente}*`;

    try {
        let responseMessage;

        // Bate direto na rota OpenAI Compatibility do Google (MUITO mais fácil e sem erros 404 agora)
        if (provedor === 'GEMINI') {
            const res = await axios.post(
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                {
                    model: model,
                    messages: messages,
                    tools: toolsAgendamento
                },
                {
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    }
                }
            );
            responseMessage = res.data.choices[0].message;
        } else {
            const groqClient = new Groq({ apiKey: apiKey });
            const response = await groqClient.chat.completions.create({
                model: model, messages: messages, tools: toolsAgendamento
            });
            responseMessage = response.choices[0].message;
        }

        let msgContentLimpo = responseMessage.content ? responseMessage.content.replace(/<function[^>]*>[\s\S]*?<\/function>/g, '').trim() : "";
        let deveMudarStatus = null;
        let ehEncerramento = false;
        const msgInsta = instagramUrl ? `\n\n📸 Siga nosso Instagram: ${instagramUrl}` : '';

        if (responseMessage.tool_calls) {
            for (const toolCall of responseMessage.tool_calls) {
                
                if (toolCall.function.name === "buscar_horarios_disponiveis") {
                    const args = JSON.parse(toolCall.function.arguments);
                    const localUrl = process.env.API_URL || 'http://localhost:5000/api';
                    
                    try {
                        const res = await axios.get(`${localUrl}/agendamentos/disponiveis`, {
                            params: { data: args.data_desejada, id_servico: args.id_servico },
                            headers: { 'x-tenant-id': id_tenant }
                        });

                        const horarios = res.data.horarios_disponiveis || [];
                        const profissionais = res.data.profissionais || [];
                        let profNomes = profissionais.map(p => `[ID: ${p.id_funcionario}] ${p.nome_completo}`).join(', ');

                        const msgAgenda = horarios.length > 0
                            ? `Dei uma olhada na agenda! Para o dia ${args.data_desejada.split('-').reverse().join('/')}, temos estes horários livres:\n🕒 ${horarios.join(' | ')}\n\nNossos profissionais disponíveis são: ${profNomes}\n\nQual horário e profissional fica melhor pra você?`
                            : `Poxa, a agenda do dia ${args.data_desejada.split('-').reverse().join('/')} já lotou! 😔 Quer tentar outra data?`;

                        await sendCRMMessage(jid, { text: `${nomeFmt}\n\n${msgAgenda}` }, id_tenant);
                    } catch (err) {
                        await sendCRMMessage(jid, { text: `${nomeFmt}\n\nDeu um erro na agenda, aguarde um minutinho!` }, id_tenant);
                    }
                    return;
                }

                else if (toolCall.function.name === "confirmar_agendamento") {
                    const args = JSON.parse(toolCall.function.arguments);
                    await sendCRMMessage(jid, { text: `${nomeFmt}\n\nSó um momento, estou registrando a sua reserva no sistema... ⏳` }, id_tenant);
                    
                    try {
                        // 1. Salva no banco primeiro
                        await confirmarAgendamentoViaIA(jid, id_tenant, args.id_servico, args.data_inicio, args.observacoes, args.valor_total, args.metodo_pagamento, args.id_funcionario, args.nome_cliente);
                        
                        // 2. 🟢 SE FOR PIX, CHAMA O GERADOR!
                        if (args.metodo_pagamento === "PIX") {
                            await sendCRMMessage(jid, { text: `${nomeFmt}\n\nReserva pré-confirmada! ✅ Gerando seu PIX para garantir o horário...` }, id_tenant);
                            
                            await gerarPixViaIA(
                                jid, 
                                args.valor_total, 
                                id_tenant, 
                                `Agendamento WhatsApp - Cliente: ${args.nome_cliente}`, 
                                "RETIRADA", // Sem frete para agendamento
                                "Local", 
                                [{ id_produto: args.id_servico, quantidade: 1 }]
                            );
                            
                            if (msgInsta) await sendCRMMessage(jid, { text: `${nomeFmt}${msgInsta}` }, id_tenant);
                        } else {
                            // Se o cliente digitou "Local"
                            const textFinal = `Reserva confirmada! ✅ O pagamento de R$${args.valor_total.toFixed(2)} será feito no local. Te esperamos!${msgInsta}`;
                            await sendCRMMessage(jid, { text: `${nomeFmt}\n\n${textFinal}` }, id_tenant);
                        }

                    } catch (err) {
                        await sendCRMMessage(jid, { text: `${nomeFmt}\n\nOps, alguém acabou de reservar esse horário! Pode escolher outro?` }, id_tenant);
                    }
                    return;
                }

                else if (toolCall.function.name === "transferir_atendimento") {
                    deveMudarStatus = 'arquivados';
                    ehEncerramento = true;
                }
            }
        }

        if (deveMudarStatus) {
            await delay(agentConfig.tempo_resposta * 1000);
            await sendCRMMessage(jid, { text: `${nomeFmt}\n\nTudo bem! Atendimento encerrado. 👋${msgInsta}` }, id_tenant);
            await prisma.whatsappContatos.update({
                where: { jid_id_tenant: { jid: String(jid), id_tenant: Number(id_tenant) } },
                data: { status: 'arquivados', responsavelId: null }
            });
            return;
        }

        if (msgContentLimpo) {
            await delay(agentConfig.tempo_resposta * 1000);
            await sendCRMMessage(jid, { text: `${nomeFmt}\n\n${msgContentLimpo}` }, id_tenant);
        }

    } catch (error) {
        console.error(`❌ Erro no Agendamento IA (${provedor}):`, error.response?.data || error.message);
        await sendCRMMessage(jid, { text: `${nomeFmt}\n\nMe perdi aqui, pode repetir? 😅` }, id_tenant);
    }
};