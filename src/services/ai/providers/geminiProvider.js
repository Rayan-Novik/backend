// src/services/ai/providers/geminiProvider.js
import axios from 'axios';

// O Google exige que os tipos sejam em MAIÚSCULO, então traduzimos automaticamente aqui
const translateSchemaToGemini = (schema) => {
    if (!schema) return undefined;
    const result = { type: schema.type.toUpperCase() };
    if (schema.description) result.description = schema.description;
    if (schema.properties) {
        result.properties = {};
        for (const key in schema.properties) {
            result.properties[key] = translateSchemaToGemini(schema.properties[key]);
        }
    }
    if (schema.items) result.items = translateSchemaToGemini(schema.items);
    if (schema.enum) result.enum = schema.enum;
    if (schema.required) result.required = schema.required;
    return result;
};

export const callGemini = async (apiKey, model, systemPrompt, historico, tools) => {
    const cleanApiKey = String(apiKey).trim().replace(/[\r\n\t '"]/g, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanApiKey}`;

    const contents = historico.map(msg => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content || " " }]
    }));

    const geminiTools = tools && tools.length > 0 ? [{
        functionDeclarations: tools.map(t => ({
            name: t.function.name,
            description: t.function.description,
            parameters: translateSchemaToGemini(t.function.parameters)
        }))
    }] : undefined;

    const payload = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: contents
    };
    if (geminiTools) payload.tools = geminiTools;

    const res = await axios.post(url, payload, { headers: { "Content-Type": "application/json" } });
    const responsePart = res.data.candidates[0].content.parts[0];
    
    let responseMessage = { content: "", tool_calls: null };

    // Traduz a resposta do Google de volta pro padrão que o seu sistema já conhece
    if (responsePart.functionCall) {
        responseMessage.tool_calls = [{
            function: {
                name: responsePart.functionCall.name,
                arguments: JSON.stringify(responsePart.functionCall.args)
            }
        }];
    } else {
        responseMessage.content = responsePart.text;
    }

    return responseMessage;
};