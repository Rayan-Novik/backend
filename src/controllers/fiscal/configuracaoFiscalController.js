import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../../services/cryptoService.js'; // 🟢 Garanta que o decrypt está importado
import forge from 'node-forge';
import axios from 'axios'; // 🟢 Importação do Axios
import https from 'https'; // 🟢 Importação do HTTPS nativo do Node

const prisma = new PrismaClient();

export const getConfiguracaoFiscal = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;

        let config = await prisma.configuracoes_fiscais.findUnique({
            where: { id_tenant }
        });

        if (!config) {
            return res.status(200).json({
                ambiente: "HOMOLOGACAO",
                regime_tributario: "SIMPLES_NACIONAL",
                serie_nfe: 1,
                serie_nfce: 1
            });
        }

        config.senha_certificado = undefined;

        res.status(200).json(config);
    } catch (error) {
        next(error);
    }
};

export const upsertConfiguracaoFiscal = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const dados = req.body;

        let certificadoBase64 = dados.certificado_base64; 
        if (req.file) {
            certificadoBase64 = req.file.buffer.toString('base64');
        }

        let senhaProtegida = dados.senha_certificado;
        if (senhaProtegida && senhaProtegida.length > 0) {
            senhaProtegida = encrypt(senhaProtegida);
        }

        const cnpjLimpo = dados.cnpj ? dados.cnpj.replace(/\D/g, '') : null;

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
        next(error);
    }
};

export const lerDadosCertificado = async (req, res, next) => {
    try {
        if (!req.file || !req.body.senha) {
            return res.status(400).json({ message: 'Arquivo e senha são obrigatórios.' });
        }

        // Lê o arquivo pfx do buffer do multer
        const p12Der = forge.util.createBuffer(req.file.buffer.toString('binary'));
        const p12Asn1 = forge.asn1.fromDer(p12Der);
        
        // Tenta abrir o PKCS#12 com a senha informada
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, req.body.senha);

        let certBag = null;
        
        // Percorre a estrutura do arquivo em busca do certificado
        for (const safeContent of p12.safeContents) {
            for (const bag of safeContent.safeBags) {
                if (bag.type === forge.pki.oids.certBag) {
                    certBag = bag;
                    break;
                }
            }
            if (certBag) break;
        }

        if (!certBag) {
            return res.status(400).json({ message: 'Nenhum certificado válido encontrado no arquivo.' });
        }

        const cert = certBag.cert;
        const subjectAttributes = cert.subject.attributes;
        
        let razaoSocial = '';
        let cnpj = '';

        // O e-CNPJ no Brasil geralmente coloca os dados no campo CN
        const cnObj = subjectAttributes.find(attr => attr.shortName === 'CN');
        if (cnObj && cnObj.value) {
            // Separa pelo ':' que divide o nome do CNPJ (ex: EMPRESA:12345678000199)
            const parts = cnObj.value.split(':');
            razaoSocial = parts[0];
            
            if (parts.length > 1) {
                const possivelCnpj = parts[1].replace(/\D/g, '');
                if (possivelCnpj.length === 14) {
                    cnpj = possivelCnpj;
                }
            }
        }

        res.status(200).json({ razao_social: razaoSocial, cnpj });
    } catch (error) {
        console.error("Erro ao abrir certificado (senha incorreta ou arquivo corrompido):", error.message);
        return res.status(400).json({ message: 'Falha ao ler certificado. Verifique a senha.' });
    }
};

// ============================================================================
// 🟢 NOVA ROTA: TESTE DE CONEXÃO DIRETA COM A SEFAZ (mTLS)
// ============================================================================
export const testarConexaoSefaz = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;

        const config = await prisma.configuracoes_fiscais.findUnique({
            where: { id_tenant }
        });

        if (!config || !config.certificado_base64 || !config.senha_certificado) {
            return res.status(400).json({ message: "Certificado não encontrado no banco de dados. Você esqueceu de clicar em 'Salvar Configurações'?" });
        }

        let pfxBuffer, senha;
        try {
            pfxBuffer = Buffer.from(config.certificado_base64, 'base64');
            senha = decrypt(config.senha_certificado); // Descriptografa a senha do banco
        } catch (e) {
            return res.status(400).json({ message: "Erro ao ler a criptografia do certificado salvo." });
        }

        let httpsAgent;
        try {
            // Tenta abrir o cofre do certificado. Se a senha estiver errada, trava aqui!
            httpsAgent = new https.Agent({
                pfx: pfxBuffer,
                passphrase: senha,
                rejectUnauthorized: false // Ignora avisos de cadeia não confiável da SEFAZ
            });
        } catch (e) {
            return res.status(400).json({ message: "A senha do certificado está incorreta ou o arquivo .pfx está corrompido!" });
        }

        // 🟢 SELECIONA O AMBIENTE (Sandbox/Homologação ou Produção)
        const isHomologacao = config.ambiente === 'HOMOLOGACAO';
        const urlSefaz = isHomologacao 
            ? 'https://hom.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx' 
            : 'https://nfe.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx';

        try {
            // Bate na porta da SEFAZ
            await axios.get(urlSefaz, { 
                httpsAgent: httpsAgent,
                timeout: 10000 
            });

            return res.status(200).json({ 
                motivo: `Conexão validada no ambiente de ${isHomologacao ? 'SANDBOX (Homologação)' : 'PRODUÇÃO'}!` 
            });

        } catch (axiosError) {
            // A Sefaz devolve 500 para GET porque ela espera um POST SOAP. 
            // Mas se deu 500, significa que o HTTPS passou pelo firewall do governo! É sucesso!
            if (axiosError.response && axiosError.response.status === 500) {
                return res.status(200).json({ 
                    motivo: `Conexão mTLS aceita pela SEFAZ no ambiente de ${isHomologacao ? 'SANDBOX (Homologação)' : 'PRODUÇÃO'}!` 
                });
            }

            // Se der erro de timeout ou bloqueio de rede
            const erroRede = axiosError.message || 'Erro desconhecido de rede';
            return res.status(400).json({ message: `O certificado abriu, mas a rede falhou: ${erroRede}` });
        }

    } catch (error) {
        console.error("Erro crítico no teste da SEFAZ:", error);
        return res.status(500).json({ message: "Falha interna no servidor ao processar o teste." });
    }
};