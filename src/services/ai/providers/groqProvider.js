// src/services/ai/providers/groqProvider.js
import Groq from "groq-sdk";

export const callGroq = async (apiKey, model, systemPrompt, historico, tools) => {
    const cleanApiKey = String(apiKey).trim().replace(/[\r\n\t '"]/g, '');
    const groqClient = new Groq({ apiKey: cleanApiKey });
    const messages = [ { role: "system", content: systemPrompt }, ...historico ];

    const response = await groqClient.chat.completions.create({
        model: model,
        messages: messages,
        tools: tools
    });

    return response.choices[0].message;
};