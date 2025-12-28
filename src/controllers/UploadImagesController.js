import axios from 'axios';
import FormData from 'form-data';
// ✅ 1. Importe o seu Model de Configurações
import ConfiguracaoModel from '../models/configuracaoModel.js';

/**
 * @desc    Recebe um arquivo de imagem, faz o upload para o ImgBB e retorna o link.
 * @route   POST /api/uploadimages
 * @access  Private/Admin
 */
export const uploadImageToImgBB = async (req, res, next) => {
    try {
        if (!req.file) {
            res.status(400);
            throw new Error('Nenhum arquivo de imagem enviado.');
        }

        // ✅ 2. Busca a API Key salva no Banco de Dados
        const imgbbApiKey = await ConfiguracaoModel.get('IMGBB_API_KEY');

        // Validação de segurança
        if (!imgbbApiKey) {
            res.status(500);
            throw new Error('A chave da API do ImgBB não foi configurada no painel.');
        }

        // A API do ImgBB espera os dados da imagem em base64.
        const imageBase64 = req.file.buffer.toString('base64');

        // O ImgBB usa 'form-data' para o envio.
        const form = new FormData();
        form.append('image', imageBase64);

        // Prepara a requisição para a API do ImgBB
        const response = await axios.post(
            `https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, // ✅ Usa a variável do banco
            form,
            {
                headers: {
                    ...form.getHeaders(),
                },
            }
        );

        // Extrai o link da imagem da resposta do ImgBB
        const imageUrl = response.data.data.url;

        // Envia o link de volta para o frontend
        res.status(201).json({
            message: 'Imagem enviada com sucesso!',
            imagePath: imageUrl,
        });

    } catch (error) {
        console.error('❌ Erro ao fazer upload para o ImgBB:', error.response?.data || error.message);
        // Retorna o erro exato do ImgBB se disponível, ajuda a debugar
        const errorMsg = error.response?.data?.error?.message || 'Falha ao fazer upload da imagem.';
        next(new Error(errorMsg));
    }
};