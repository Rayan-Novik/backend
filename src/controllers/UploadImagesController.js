import axios from 'axios';
import FormData from 'form-data';
import { v2 as cloudinary } from 'cloudinary';
import ConfiguracaoModel from '../models/configuracaoModel.js';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp'; // 📦 Importação do Sharp

const prisma = new PrismaClient();

// 🔑 Sua chave padrão do ImgBB (Fallback)
const DEFAULT_IMGBB_API_KEY = process.env.DEFAULT_IMGBB_API_KEY;

// 🧠 Função auxiliar para descobrir automaticamente qual provedor tem as chaves configuradas
const detectActiveProvider = async (id_tenant) => {
    const dbImgbbApiKey = await ConfiguracaoModel.get('IMGBB_API_KEY', id_tenant);
    const cloudName = await ConfiguracaoModel.get('CLOUDINARY_CLOUD_NAME', id_tenant);
    const cloudApiKey = await ConfiguracaoModel.get('CLOUDINARY_API_KEY', id_tenant);
    const cloudApiSecret = await ConfiguracaoModel.get('CLOUDINARY_API_SECRET', id_tenant);
    
    let prefProvider = await ConfiguracaoModel.get('UPLOAD_PROVIDER', id_tenant);
    if (prefProvider) prefProvider = prefProvider.toLowerCase();

    const hasDbImgBB = Boolean(dbImgbbApiKey);
    const hasCloudinary = Boolean(cloudName && cloudApiKey && cloudApiSecret);

    let activeProvider = '';
    let imgbbApiKeyToUse = dbImgbbApiKey;

    if (prefProvider === 'cloudinary' && hasCloudinary) {
        activeProvider = 'cloudinary';
    } else if (prefProvider === 'imgbb' && hasDbImgBB) {
        activeProvider = 'imgbb';
    } else if (hasCloudinary) {
        activeProvider = 'cloudinary'; 
    } else if (hasDbImgBB) {
        activeProvider = 'imgbb';
    } else {
        activeProvider = 'imgbb';
        imgbbApiKeyToUse = DEFAULT_IMGBB_API_KEY;
    }

    return {
        provider: activeProvider,
        credentials: { 
            imgbbApiKey: imgbbApiKeyToUse, 
            cloudName, 
            cloudApiKey, 
            cloudApiSecret 
        }
    };
};

export const uploadImage = async (req, res, next) => {
    try {
        if (!req.file) {
            res.status(400);
            throw new Error('Nenhum arquivo de imagem enviado.');
        }

        const id_tenant = req.tenantId;
        const { provider, credentials } = await detectActiveProvider(id_tenant);

        if (!provider) {
            res.status(400);
            throw new Error('Nenhuma API de imagem configurada nesta loja. Adicione as chaves do ImgBB ou Cloudinary.');
        }

        console.log(`📡 [Tenant ${id_tenant}] Iniciando upload automático via: ${provider.toUpperCase()}`);

        // 🛠️ CONVERSÃO PARA AVIF AQUI
        // Pegamos o buffer original e convertemos para AVIF com qualidade ajustável (padrão ~80)
        const avifBuffer = await sharp(req.file.buffer)
            .avif({ quality: 80, effort: 4 }) // "effort" controla a compressão (0-9, maior = mais lento, menor tamanho)
            .toBuffer();

        let imageUrl = '';

        if (provider === 'imgbb') {
            // Usamos o novo buffer convertido em vez de req.file.buffer
            const imageBase64 = avifBuffer.toString('base64');
            const form = new FormData();
            form.append('image', imageBase64);

            const response = await axios.post(
                `https://api.imgbb.com/1/upload?key=${credentials.imgbbApiKey}`,
                form,
                { headers: { ...form.getHeaders() } }
            );

            imageUrl = response.data.data.url;
        } 
        else if (provider === 'cloudinary') {
            cloudinary.config({
                cloud_name: credentials.cloudName,
                api_key: credentials.cloudApiKey,
                api_secret: credentials.cloudApiSecret,
                secure: true
            });

            // Usamos o novo buffer e forçamos o mime type para image/avif
            const b64 = avifBuffer.toString('base64');
            const dataURI = "data:image/avif;base64," + b64;

            const result = await cloudinary.uploader.upload(dataURI, {
                folder: `produtos/loja_${id_tenant}`, 
                resource_type: "image", // Ajustado de "auto" para "image" para evitar bloqueios de formato
                // Removido fetch_format: "auto" pois a imagem já está fisicamente em AVIF agora
                transformation: [{ quality: "auto" }] 
            });

            imageUrl = result.secure_url;
        }

        res.status(201).json({
            message: 'Imagem convertida para AVIF e enviada com sucesso!',
            provider: provider, 
            imagePath: imageUrl,
        });

    } catch (error) {
        // Extrai a mensagem dependendo da estrutura do erro (Cloudinary, Axios ou nativo)
        let errorMsg = error.message || error.error?.message;
        
        // Se ainda for vazio, converte o objeto de erro para string para não perdermos o log
        if (!errorMsg) {
            errorMsg = typeof error === 'string' ? error : JSON.stringify(error);
        }

        console.error(`❌ Erro no upload (${errorMsg})`);
        
        // Tratamento específico para erros de resposta HTTP (como o Axios para ImgBB)
        if (error.response?.data?.error?.message) {
            errorMsg = `API Imagem: ${error.response.data.error.message}`;
        }
        
        next(new Error(errorMsg));
    }
};

export const getUploadProvider = async (req, res) => {
    try {
        // Agora retorna o provedor que REALMENTE está ativo e configurado (ou o padrão)
        const { provider } = await detectActiveProvider(req.tenantId);

        res.json({
            chave: 'UPLOAD_PROVIDER',
            valor: provider || 'nenhum'
        });

    } catch (error) {
        console.error("Erro ao buscar provedor de upload:", error);
        res.status(500).json({ message: 'Erro ao buscar configuração.' });
    }
};

export const getMediaGallery = async (req, res, next) => {
    try {
        let images = [];
        const id_tenant = req.tenantId;
        
        // 🕵️ Usa a mesma inteligência na galeria
        const { provider, credentials } = await detectActiveProvider(id_tenant);

        if (!provider) {
            return res.json({ provider: 'nenhum', count: 0, images: [] });
        }

        if (provider === 'cloudinary') {
            cloudinary.config({
                cloud_name: credentials.cloudName,
                api_key: credentials.cloudApiKey,
                api_secret: credentials.cloudApiSecret,
                secure: true
            });

            const result = await cloudinary.api.resources({
                type: 'upload',
                prefix: `produtos/loja_${id_tenant}`, 
                max_results: 50,
                direction: 'desc'
            });

            images = result.resources.map(img => ({
                url: img.secure_url,
                id: img.public_id,
                source: 'cloudinary'
            }));
        } 
        else if (provider === 'imgbb') {
            const produtosRecentes = await prisma.produtos.findMany({
                where: {
                    id_tenant: id_tenant,
                    imagem_url: { not: null, not: '' }
                },
                select: { imagem_url: true, id_produto: true },
                orderBy: { id_produto: 'desc' },
                take: 50,
                distinct: ['imagem_url']
            });

            images = produtosRecentes.map(p => ({
                url: p.imagem_url,
                id: p.id_produto, 
                source: 'imgbb_db_cache'
            }));
        }

        res.json({
            provider: provider,
            count: images.length,
            images: images
        });

    } catch (error) {
        console.error(`❌ Erro ao buscar galeria: ${error.message}`);
        res.json({ provider: 'unknown', count: 0, images: [], error: error.message });
    }
};