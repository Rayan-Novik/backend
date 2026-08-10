// src/services/ai/aiFactory.js
import { PrismaClient } from '@prisma/client';
import { callGroq } from './providers/groqProvider.js';
import { callGemini } from './providers/geminiProvider.js';

const prisma = new PrismaClient();

export const generateAIResponse = async (id_tenant, systemPrompt, historico, tools) => {
    const config = await prisma.aiConfiguracoes.findUnique({ where: { id_tenant: Number(id_tenant) } });
    const provedor = config?.provedor_ia || 'GROQ'; 

    if (provedor === 'GEMINI') {
        const apiKey = config?.gemini_api_key || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Chave do Gemini não configurada no painel.");
        
        // Chama a IA do Google isolada
        return await callGemini(apiKey, "gemini-1.5-flash", systemPrompt, historico, tools);
    } else {
        const apiKey = config?.groq_api_key || process.env.GROQ_API_KEY_MASTER; 
        if (!apiKey) throw new Error("Chave do Groq não configurada no painel.");
        
        // Chama a IA do Groq isolada
        return await callGroq(apiKey, "llama-3.3-70b-versatile", systemPrompt, historico, tools);
    }
};