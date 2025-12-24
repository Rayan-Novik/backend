import axios from 'axios';
import FormData from 'form-data';

/**
 * @desc    Gera UMA variação de uma imagem de produto existente.
 * @route   POST /api/images/generate-single-variation
 * @access  Private/Admin
 */
export const generateSingleImageVariation = async (req, res, next) => {
    try {
        const { imageUrl, promptContext } = req.body;
        if (!imageUrl) {
            res.status(400);
            throw new Error('A URL da imagem principal é necessária.');
        }

        console.log(`🤖 A receber imagem base para gerar variação: ${imageUrl}`);

        // --- Passo 1: Descarregar e converter a imagem base ---
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBase64 = Buffer.from(imageResponse.data, 'binary').toString('base64');
        console.log('✅ Imagem base convertida para Base64.');

        // --- Passo 2: Preparar e enviar o pedido para a API do Gemini ---
        // O prompt agora é mais flexível, aceitando contexto adicional
        const basePrompt = `Crie uma variação profissional desta imagem de produto para um anúncio de e-commerce. Mantenha o mesmo produto, mas pode alterar ligeiramente o ângulo, a iluminação ou o cenário. O fundo deve ser limpo, branco ou de estúdio. Estilo fotorrealista, 8k.`;
        const finalPrompt = promptContext ? `${basePrompt} ${promptContext}` : basePrompt;

        const geminiPayload = {
            contents: [{
                parts: [
                    { text: finalPrompt },
                    { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
                ]
            }],
            // ✅ ATUALIZADO: Pede apenas UMA imagem de volta
            generation_config: { "candidateCount": 1 }
        };

        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('A GOOGLE_API_KEY não está configurada.');
        }
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
        
        const geminiResponse = await axios.post(geminiApiUrl, geminiPayload);
        
        // ✅ ATUALIZADO: Pega a primeira (e única) imagem gerada
        const generatedImageBase64 = geminiResponse.data.candidates?.[0]?.content.parts.find(p => p.inline_data)?.inline_data.data;
        if (!generatedImageBase64) {
            throw new Error('A API do Gemini não retornou uma imagem.');
        }
        console.log(`✅ Uma nova imagem gerada com sucesso pelo Gemini.`);

        // --- Passo 3: Fazer o upload da nova imagem para o ImgBB ---
        const form = new FormData();
        form.append('image', generatedImageBase64);
        const uploadResult = await axios.post(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, form, { headers: form.getHeaders() });

        const newImageUrl = uploadResult.data.data.url;
        console.log('✅ Nova imagem enviada para o ImgBB:', newImageUrl);

        // --- Passo 4: Retornar o link da imagem única para o Frontend ---
        res.json({
            message: 'Variação de imagem gerada com sucesso!',
            imageUrl: newImageUrl, // Envia um único URL
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

