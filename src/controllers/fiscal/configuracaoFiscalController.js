import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import { encrypt } from '../../services/cryptoService.js';

export const getConfiguracaoFiscal = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;

        let config = await prisma.configuracoes_fiscais.findUnique({
            where: { id_tenant }
        });

        // Se não existir, retorna um objeto vazio ou com valores padrão para o frontend preencher
        if (!config) {
            return res.status(200).json({
                ambiente: "HOMOLOGACAO",
                regime_tributario: "SIMPLES_NACIONAL",
                serie_nfe: 1,
                serie_nfce: 1
            });
        }

        // Remove a senha do certificado por segurança antes de enviar ao frontend
        config.senha_certificado = undefined;

        res.status(200).json(config);
    } catch (error) {
        console.error("Erro ao buscar configuração fiscal:", error);
        next(error);
    }
};

export const upsertConfiguracaoFiscal = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const dados = req.body;

        // 1. Processamento do arquivo: Se o Multer enviou, converte para Base64
        let certificadoBase64 = dados.certificado_base64; 
        if (req.file) {
            certificadoBase64 = req.file.buffer.toString('base64');
        }

        // 2. Criptografia da senha: Só criptografa se uma nova senha for enviada
        // Dica: Se o campo vier vazio no update, você pode optar por manter a antiga ou limpar.
        let senhaProtegida = dados.senha_certificado;
        if (senhaProtegida && senhaProtegida.length > 0) {
            senhaProtegida = encrypt(senhaProtegida);
        }

        // 3. Limpeza do CNPJ
        const cnpjLimpo = dados.cnpj ? dados.cnpj.replace(/\D/g, '') : null;

        // 4. Preparação dos dados para o Prisma
        // Usamos campos de objeto para não sobrescrever com 'undefined' caso algum campo não venha
        const dataUpdate = {
            cnpj: cnpjLimpo,
            razao_social: dados.razao_social,
            inscricao_estadual: dados.inscricao_estadual,
            inscricao_municipal: dados.inscricao_municipal,
            regime_tributario: dados.regime_tributario,
            ambiente: dados.ambiente,
            serie_nfe: dados.serie_nfe ? Number(dados.serie_nfe) : 1,
            serie_nfce: dados.serie_nfce ? Number(dados.serie_nfce) : 1,
            serie_nfae: dados.serie_nfae ? Number(dados.serie_nfae) : 1,
            serie_rps: dados.serie_rps,
            codigo_municipio: dados.codigo_municipio,
            // Só atualiza certificado/senha se forem enviados
            ...(certificadoBase64 && { certificado_base64: certificadoBase64 }),
            ...(senhaProtegida && { senha_certificado: senhaProtegida })
        };

        const configSalva = await prisma.configuracoes_fiscais.upsert({
            where: { id_tenant },
            update: dataUpdate,
            create: {
                id_tenant,
                ...dataUpdate,
                regime_tributario: dados.regime_tributario || "SIMPLES_NACIONAL",
                ambiente: dados.ambiente || "HOMOLOGACAO"
            }
        });

        res.status(200).json({ message: "Configurações fiscais salvas com sucesso!" });
    } catch (error) {
        console.error("Erro ao salvar configuração fiscal:", error);
        next(error);
    }
};