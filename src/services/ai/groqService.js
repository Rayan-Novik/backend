import Groq from "groq-sdk";
import fs from "fs";
import { PrismaClient } from '@prisma/client'; 
import { gerarPixViaIA, registrarPedidoPagamentoNaEntrega } from '../whatsapp/whatsappPaymentService.js';
import { sendCRMMessage } from '../whatsapp/sender.js';
import { buildSystemPrompt } from './promptService.js';
import { calcularFreteInterno } from '../frete/freteService.js';
import axios from 'axios';

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const prisma = new PrismaClient(); 

const getAIConfigData = async (id_tenant) => {
    const config = await prisma.aiConfiguracoes.findUnique({
        where: { id_tenant: Number(id_tenant) }
    });

    const provedor = config?.provedor_ia || 'GROQ'; 
    let apiKey = '';
    let model = '';

    if (provedor === 'GEMINI') {
        apiKey = config?.gemini_api_key || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Chave do Gemini não configurada.");
        apiKey = String(apiKey).trim().replace(/['"]/g, '');
        // 🚀 O SEGREDO DO ERRO 404: O modelo 1.5 saiu do ar! Atualizado para gemini-2.5-flash
        model = "gemini-2.5-flash"; 
    } else {
        apiKey = config?.groq_api_key || process.env.GROQ_API_KEY_MASTER; 
        if (!apiKey) throw new Error("Chave do Groq não configurada.");
        apiKey = String(apiKey).trim().replace(/['"]/g, '');
        model = "llama-3.3-70b-versatile";
    }

    return { provedor, apiKey, model };
};

export const processAudioWithGroq = async (filePath) => {
    try {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY_MASTER });
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-large-v3",
            response_format: "json",
            language: "pt", 
        });
        return transcription.text;
    } catch (error) {
        console.error("Erro no Groq Audio:", error);
        throw new Error("Falha ao transcrever o áudio.");
    }
};

const toolsDelivery = [
    {
        type: "function",
        function: {
            name: "calcular_frete_ia",
            description: "Calcula o valor do frete baseando-se no CEP do cliente.",
            parameters: {
                type: "object",
                properties: {
                    cep: { type: "string", description: "CEP, ex: 07034130" }
                },
                required: ["cep"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "finalizar_pedido",
            description: "Finaliza o pedido somando produtos e frete.",
            parameters: {
                type: "object",
                properties: {
                    valor: { type: "number" },
                    frete: { type: "number" },
                    descricao: { type: "string" },
                    metodo_pagamento: { type: "string", enum: ["PIX", "ENTREGA"] },
                    metodo_envio: { type: "string", enum: ["ENTREGA", "RETIRADA"] },
                    endereco: { type: "string" },
                    itens_comprados: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                id_produto: { type: "number" },
                                id_variacao: { type: "number" },
                                quantidade: { type: "number" }
                            },
                            required: ["id_produto", "quantidade"]
                        }
                    }
                },
                required: ["valor", "descricao", "metodo_pagamento", "metodo_envio", "itens_comprados"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "transferir_atendimento",
            description: "Transfere para humano ou encerra chat.",
            parameters: {
                type: "object",
                properties: { motivo: { type: "string" } },
                required: ["motivo"]
            }
        }
    }
];

export const processarMensagemIA = async (jid, id_tenant, historicoMensagens, catalogoLoja, nomeLoja, agentConfig, instagramUrl) => {

    const { provedor, apiKey, model } = await getAIConfigData(id_tenant);
    const systemPrompt = buildSystemPrompt(catalogoLoja, nomeLoja, agentConfig, instagramUrl);
    const messages = [ { role: "system", content: systemPrompt }, ...historicoMensagens ];
    const nomeFormatado = `*${agentConfig.nome_agente}*`;

    try {
        let responseMessage;

        if (provedor === 'GEMINI') {
            const res = await axios.post(
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                {
                    model: model,
                    messages: messages,
                    tools: toolsDelivery
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
                model: model,
                messages: messages,
                tools: toolsDelivery
            });
            responseMessage = response.choices[0].message;
        }
        
        let msgContentLimpo = responseMessage.content ? responseMessage.content.replace(/<function[^>]*>[\s\S]*?<\/function>/g, '').trim() : "";
        let deveMudarStatus = null;
        let ehEncerramento = false;

        const msgInsta = instagramUrl ? `\n\nAh, aproveita e segue a gente no Instagram para acompanhar as novidades! 📸\n👉 ${instagramUrl}` : '';

        if (responseMessage.tool_calls) {
            for (const toolCall of responseMessage.tool_calls) {
                
                if (toolCall.function.name === "calcular_frete_ia") {
                    const { cep } = JSON.parse(toolCall.function.arguments);
                    const valorFrete = await calcularFreteInterno(id_tenant, cep); 
                    const textoFrete = valorFrete 
                        ? `O frete para o CEP ${cep} custa R$ ${valorFrete.custo.toFixed(2)} (Prazo: ${valorFrete.prazo}). Posso seguir com o pedido?`
                        : `Não consegui calcular o frete para o CEP ${cep}. Poderia verificar se o CEP está correto?`;
                    
                    await sendCRMMessage(jid, { text: `${nomeFormatado}\n\n${textoFrete}` }, id_tenant);
                    return;
                }
                
                else if (toolCall.function.name === "finalizar_pedido") {
                    const args = JSON.parse(toolCall.function.arguments);
                    
                    for (const item of args.itens_comprados) {
                        const prod = await prisma.produtos.findUnique({ where: { id_produto: item.id_produto } });
                        if (prod && prod.estoque < item.quantidade) {
                            await sendCRMMessage(jid, { text: `${nomeFormatado}\n\nOps! Infelizmente não temos ${item.quantidade} unidades de *${prod.nome}* agora.` }, id_tenant);
                            return; 
                        }
                    }
                    
                    if (args.metodo_pagamento === "PIX") {
                        await sendCRMMessage(jid, { text: `${nomeFormatado}\n\nPerfeito! Gerando o seu PIX, só um instante... ⏳` }, id_tenant);
                        await gerarPixViaIA(jid, args.valor, id_tenant, args.descricao, args.metodo_envio, args.endereco, args.itens_comprados);
                        if (msgInsta) await sendCRMMessage(jid, { text: `${nomeFormatado}${msgInsta}` }, id_tenant);
                    } else {
                        await registrarPedidoPagamentoNaEntrega(jid, id_tenant, args.valor, args.descricao, args.metodo_envio, args.endereco, args.itens_comprados);
                        const txtLocal = args.metodo_envio === "RETIRADA" 
                            ? `Pedido registrado com sucesso! ✅\n\nVocê pagará *R$ ${args.valor.toFixed(2).replace('.', ',')}* quando vier retirar. 🛍️${msgInsta}` 
                            : `Pedido registrado com sucesso! ✅\n\nVocê pagará *R$ ${args.valor.toFixed(2).replace('.', ',')}* no momento da entrega em: *${args.endereco}* 🛵💨${msgInsta}`;
                        
                        await sendCRMMessage(jid, { text: `${nomeFormatado}\n\n${txtLocal}` }, id_tenant);
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
            await sendCRMMessage(jid, { text: `${nomeFormatado}\n\nTudo bem! Atendimento encerrado. 👋${msgInsta}` }, id_tenant);
            await prisma.whatsappContatos.update({
                where: { jid_id_tenant: { jid: String(jid), id_tenant: Number(id_tenant) } },
                data: { status: deveMudarStatus, responsavelId: null }
            });
            return;
        }

        if (msgContentLimpo) {
            await delay(agentConfig.tempo_resposta * 1000);
            await sendCRMMessage(jid, { text: `${nomeFormatado}\n\n${msgContentLimpo}` }, id_tenant);
        }

    } catch (error) {
        console.error(`❌ Erro de comunicação com o ${provedor}:`, error.response?.data || error.message);
        await sendCRMMessage(jid, { text: `${nomeFormatado}\n\nMe perdi um pouco aqui com o sistema, pode repetir? 😅` }, id_tenant);
    }
};