import axios from 'axios';
import FormData from 'form-data';

export const generateSingleImageVariation = async (req, res, next) => {
    try {
        const { imageUrl, promptContext } = req.body;
        if (!imageUrl) {
            res.status(400);
            throw new Error('A URL da imagem principal é necessária.');
        }

        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBase64 = Buffer.from(imageResponse.data, 'binary').toString('base64');

        const basePrompt = `Crie uma variação profissional desta imagem de produto para um anúncio de e-commerce. Mantenha o mesmo produto, mas pode alterar ligeiramente o ângulo, a iluminação ou o cenário. O fundo deve ser limpo, branco ou de estúdio. Estilo fotorrealista, 8k.`;
        const finalPrompt = promptContext ? `${basePrompt} ${promptContext}` : basePrompt;

        const geminiPayload = {
            contents: [{
                parts: [
                    { text: finalPrompt },
                    { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
                ]
            }],
            generation_config: { "candidateCount": 1 }
        };

        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('A GOOGLE_API_KEY não está configurada.');
        }
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
        
        const geminiResponse = await axios.post(geminiApiUrl, geminiPayload);
        
        const generatedImageBase64 = geminiResponse.data.candidates?.[0]?.content.parts.find(p => p.inline_data)?.inline_data.data;
        if (!generatedImageBase64) {
            throw new Error('A API do Gemini não retornou uma imagem.');
        }

        const form = new FormData();
        form.append('image', generatedImageBase64);
        const uploadResult = await axios.post(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, form, { headers: form.getHeaders() });

        const newImageUrl = uploadResult.data.data.url;

        res.json({
            message: 'Variação de imagem gerada com sucesso!',
            imageUrl: newImageUrl, 
        });

    } catch (error) {
        if (error.response && error.response.status === 429) {
            const customError = new Error('Você fez muitas requisições. Por favor, aguarde um minuto e tente novamente.');
            res.status(429);
            next(customError);
        } else {
            console.error('❌ Erro no processo de geração de imagem:', error.response?.data || error.message);
            next(new Error('Não foi possível gerar a variação da imagem.'));
        }
    }
};