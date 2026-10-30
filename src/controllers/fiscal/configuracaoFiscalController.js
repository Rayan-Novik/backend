import forge from 'node-forge';
import prisma from '../../config/prisma.js';
import { encrypt, decrypt } from '../../modules/fiscal/shared/encryption.js';
import { getTenantId } from '../../modules/fiscal/shared/tenantHelper.js';
import { getSefazUrl } from '../../modules/fiscal/notas/sefaz-urls.js';
import { enviarSefaz } from '../../modules/fiscal/notas/sefaz-client.js';

const mapCrt = (crtInput) => {
    const validos = ['SIMPLES_NACIONAL', 'SIMPLES_NACIONAL_EXCESSO', 'REGIME_NORMAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'];
    if (validos.includes(crtInput)) return crtInput;
    if (crtInput === '1') return 'SIMPLES_NACIONAL';
    if (crtInput === '2') return 'SIMPLES_NACIONAL_EXCESSO';
    if (crtInput === '3') return 'REGIME_NORMAL';
    return 'SIMPLES_NACIONAL';
};

// ============================================================================
// 🏢 GET /empresas (Busca configuração e Certificado nativamente no banco)
// ============================================================================
export const getConfiguracaoFiscal = async (req, res) => {
    try {
        const tenant_id = getTenantId(req);

        let ambienteNum = 2;
        let ambienteStr = 'HOMOLOGACAO';
        const idTenantInt = Number(tenant_id);
        if (!isNaN(idTenantInt)) {
            const cfgLegada = await prisma.configuracoes_fiscais.findUnique({
                where: { id_tenant: idTenantInt }
            });
            if (cfgLegada?.ambiente === 'PRODUCAO') {
                ambienteNum = 1;
                ambienteStr = 'PRODUCAO';
            }
        }

        const empresas = await prisma.fiscal_empresas.findMany({
            where: { tenant_id },
            include: {
                estabelecimentos: {
                    include: {
                        certificados: {
                            orderBy: { created_at: 'desc' }
                        }
                    }
                }
            },
            orderBy: { created_at: 'asc' }
        });

        if (empresas && empresas.length > 0) {
            // Prioriza dinamicamente a empresa e o estabelecimento que possuem certificado digital ativo cadastrado
            const empresa = empresas.find(e =>
                e.estabelecimentos?.some(est => est.certificados?.some(c => c.ativo))
            ) || empresas[0];

            const estab = empresa.estabelecimentos?.find(est =>
                est.certificados?.some(c => c.ativo)
            ) || empresa.estabelecimentos?.[0] || null;

            const infoCertificado = estab?.certificados?.find(c => c.ativo) || estab?.certificados?.[0] || null;

            // Ordena estabelecimentos para que o que possui certificado ativo venha primeiro
            const estabelecimentosOrdenados = [...(empresa.estabelecimentos || [])].sort((a, b) => {
                const aHas = a.certificados?.some(c => c.ativo) ? 1 : 0;
                const bHas = b.certificados?.some(c => c.ativo) ? 1 : 0;
                return bHas - aHas;
            });

            return res.status(200).json({
                ...empresa,
                estabelecimentos: estabelecimentosOrdenados,
                ie: estab?.ie || empresa.ie || '',
                im: empresa.im || '',
                cnae: empresa.cnae || '',
                logradouro: estab?.logradouro || empresa.logradouro || '',
                numero: estab?.numero || empresa.numero || '',
                bairro: estab?.bairro || empresa.bairro || '',
                municipio: estab?.municipio || empresa.municipio || '',
                codigo_municipio_ibge: estab?.codigo_municipio_ibge || empresa.codigo_municipio_ibge || '',
                uf: estab?.uf || empresa.uf || 'AM',
                cep: estab?.cep || empresa.cep || '',
                telefone: empresa.telefone || '',
                email: empresa.email || '',
                csc: estab?.csc || '',
                id_token_csc: estab?.id_token_csc || '',
                ambiente: ambienteNum,
                ambiente_str: ambienteStr,
                estabelecimento_id: estab?.id || null,
                certificado_ativo: infoCertificado?.ativo || false,
                certificado_vencimento: infoCertificado?.validade_fim || null
            });
        }

        return res.status(200).json({
            crt: 'SIMPLES_NACIONAL',
            ambiente: ambienteNum,
            ambiente_str: ambienteStr,
            mensagem: 'Nenhuma empresa cadastrada ainda.'
        });
    } catch (error) {
        console.error('Erro em getConfiguracaoFiscal:', error);
        return res.status(500).json({ message: 'Falha ao buscar configurações fiscais.', error: error.message });
    }
};

// ============================================================================
// 💾 POST ou PUT /empresas e /certificados (Cria/Atualiza nativamente)
// ============================================================================
export const upsertConfiguracaoFiscal = async (req, res) => {
    try {
        const tenant_id = getTenantId(req);
        const dados = req.body;
        let cnpjLimpo = dados.cnpj ? String(dados.cnpj).replace(/\D/g, '') : null;

        // Se veio campo de ambiente, sincroniza com tabela de configuração do tenant
        if (dados.ambiente !== undefined) {
            const ambStr = (String(dados.ambiente) === '1' || String(dados.ambiente).toUpperCase() === 'PRODUCAO') ? 'PRODUCAO' : 'HOMOLOGACAO';
            const idTenantInt = Number(tenant_id);
            if (!isNaN(idTenantInt)) {
                await prisma.configuracoes_fiscais.upsert({
                    where: { id_tenant: idTenantInt },
                    create: { id_tenant: idTenantInt, ambiente: ambStr },
                    update: { ambiente: ambStr }
                }).catch(() => null);
            }
        }

        // Tenta achar empresa existente para preenchimento de campos omitidos
        let empresaExistente = await prisma.fiscal_empresas.findFirst({
            where: {
                OR: [
                    ...(dados.id ? [{ id: String(dados.id) }] : []),
                    ...(cnpjLimpo ? [{ cnpj: cnpjLimpo }] : []),
                    { tenant_id }
                ]
            },
            include: { estabelecimentos: true }
        });

        if (empresaExistente) {
            if (!cnpjLimpo) cnpjLimpo = empresaExistente.cnpj;
            if (!dados.razao_social) dados.razao_social = empresaExistente.razao_social;
        }

        if (!cnpjLimpo || !dados.razao_social) {
            return res.status(400).json({ message: 'CNPJ e Razão Social são obrigatórios.' });
        }

        const crtMapped = mapCrt(dados.crt || dados.regime_tributario || (empresaExistente?.crt));
        const cepLimpo = dados.cep ? String(dados.cep).replace(/\D/g, '') : (empresaExistente?.cep || '');
        const foneLimpo = dados.telefone ? String(dados.telefone).replace(/\D/g, '') : (empresaExistente?.telefone || null);
        const codMun = String(dados.codigo_municipio_ibge || dados.codigo_municipio || empresaExistente?.codigo_municipio_ibge || '1302603');
        const nomeMun = dados.municipio || dados.nome_municipio || empresaExistente?.municipio || 'Manaus';
        const ufVal = (dados.uf || empresaExistente?.uf || 'AM').toUpperCase().substring(0, 2);

        const empresaData = {
            tenant_id,
            cnpj: cnpjLimpo,
            razao_social: dados.razao_social,
            nome_fantasia: dados.nome_fantasia || dados.razao_social,
            ie: dados.ie || dados.inscricao_estadual || null,
            im: dados.im || dados.inscricao_municipal || null,
            crt: crtMapped,
            cnae: dados.cnae || null,
            logradouro: dados.logradouro || 'Não informado',
            numero: dados.numero ? String(dados.numero) : 'S/N',
            bairro: dados.bairro || 'Centro',
            municipio: nomeMun,
            codigo_municipio_ibge: codMun,
            uf: ufVal,
            cep: cepLimpo || '69000000',
            pais: dados.pais || 'Brasil',
            telefone: foneLimpo,
            email: dados.email || null
        };

        let empresa = await prisma.fiscal_empresas.findFirst({
            where: {
                OR: [
                    ...(dados.id ? [{ id: String(dados.id) }] : []),
                    { cnpj: cnpjLimpo },
                    { tenant_id }
                ]
            },
            include: { estabelecimentos: true }
        });

        if (empresa) {
            empresa = await prisma.fiscal_empresas.update({
                where: { id: empresa.id },
                data: empresaData,
                include: { estabelecimentos: true }
            });
        } else {
            empresa = await prisma.fiscal_empresas.create({
                data: empresaData,
                include: { estabelecimentos: true }
            });
        }

        // Atualiza ou cria o estabelecimento Matriz
        let estab = empresa.estabelecimentos?.[0] || null;
        const estabData = {
            tenant_id,
            empresa_id: empresa.id,
            nome: dados.nome_fantasia || dados.razao_social || 'Matriz',
            cnpj: cnpjLimpo,
            ie: dados.ie || dados.inscricao_estadual || null,
            logradouro: dados.logradouro || 'Não informado',
            numero: dados.numero ? String(dados.numero) : 'S/N',
            bairro: dados.bairro || 'Centro',
            codigo_municipio_ibge: codMun,
            municipio: nomeMun,
            uf: ufVal,
            cep: cepLimpo || '69000000',
            csc: dados.csc !== undefined ? (dados.csc || null) : (estab?.csc || null),
            id_token_csc: dados.id_token_csc !== undefined ? (dados.id_token_csc || null) : (estab?.id_token_csc || null)
        };

        if (estab) {
            estab = await prisma.fiscal_estabelecimentos.update({
                where: { id: estab.id },
                data: estabData
            });
        } else {
            estab = await prisma.fiscal_estabelecimentos.create({
                data: estabData
            });
        }

        // Garante que existem séries padrão (55 e 65) e numerações para este estabelecimento
        for (const mod of ['55', '65']) {
            let serieExistente = await prisma.fiscal_series.findFirst({
                where: { estabelecimento_id: estab.id, modelo: mod },
                include: { numeracoes: true }
            });
            if (!serieExistente) {
                serieExistente = await prisma.fiscal_series.create({
                    data: {
                        tenant_id,
                        estabelecimento_id: estab.id,
                        modelo: mod,
                        serie: 1,
                        ativo: true
                    }
                });
                await prisma.fiscal_numeracoes.create({
                    data: {
                        tenant_id,
                        serie_id: serieExistente.id,
                        ultimo_numero: 0
                    }
                });
            } else if (!serieExistente.numeracoes) {
                await prisma.fiscal_numeracoes.create({
                    data: {
                        tenant_id,
                        serie_id: serieExistente.id,
                        ultimo_numero: 0
                    }
                });
            }
        }

        // Processa Certificado Digital (.pfx) se enviado
        let validadeFimCert = null;
        if (req.file && dados.senha_certificado && estab.id) {
            const p12Der = forge.util.createBuffer(req.file.buffer.toString('binary'));
            const p12Asn1 = forge.asn1.fromDer(p12Der);
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, dados.senha_certificado);

            let certObj = null;
            for (const safeContent of p12.safeContents) {
                for (const bag of safeContent.safeBags) {
                    if (bag.type === forge.pki.oids.certBag && bag.cert) {
                        certObj = bag.cert;
                        break;
                    }
                }
                if (certObj) break;
            }

            if (!certObj) {
                return res.status(400).json({ message: 'Nenhum certificado X.509 válido encontrado no arquivo PFX.' });
            }

            const cnObj = certObj.subject.attributes.find(attr => attr.shortName === 'CN');
            const titular = cnObj?.value || dados.razao_social;
            const validadeInicio = certObj.validity.notBefore;
            const validadeFim = certObj.validity.notAfter;
            validadeFimCert = validadeFim;

            const arquivoBase64 = req.file.buffer.toString('base64');
            const pfxEncrypted = encrypt(arquivoBase64);
            const senhaEncrypted = encrypt(dados.senha_certificado);

            await prisma.fiscal_certificados.updateMany({
                where: { estabelecimento_id: estab.id },
                data: { ativo: false }
            });

            await prisma.fiscal_certificados.create({
                data: {
                    tenant_id,
                    estabelecimento_id: estab.id,
                    certificado_base64: pfxEncrypted.encryptedData,
                    certificado_iv: pfxEncrypted.iv,
                    certificado_auth_tag: pfxEncrypted.authTag,
                    senha_criptografada: senhaEncrypted.encryptedData,
                    senha_iv: senhaEncrypted.iv,
                    senha_auth_tag: senhaEncrypted.authTag,
                    validade_inicio: validadeInicio,
                    validade_fim: validadeFim,
                    titular,
                    tipo: 'A1',
                    ativo: true
                }
            });
        }

        // Sincroniza também na tabela legada configuracoes_fiscais do www
        const idTenantNumeric = Number(tenant_id);
        if (!isNaN(idTenantNumeric) && idTenantNumeric > 0) {
            try {
                await prisma.configuracoes_fiscais.upsert({
                    where: { id_tenant: idTenantNumeric },
                    update: {
                        cnpj: cnpjLimpo,
                        razao_social: dados.razao_social,
                        inscricao_estadual: dados.ie || dados.inscricao_estadual || null,
                        inscricao_municipal: dados.im || dados.inscricao_municipal || null,
                        regime_tributario: crtMapped,
                        codigo_municipio: codMun,
                        ...(validadeFimCert ? { vencimento_cert: validadeFimCert } : {})
                    },
                    create: {
                        id_tenant: idTenantNumeric,
                        cnpj: cnpjLimpo,
                        razao_social: dados.razao_social,
                        inscricao_estadual: dados.ie || dados.inscricao_estadual || null,
                        inscricao_municipal: dados.im || dados.inscricao_municipal || null,
                        regime_tributario: crtMapped,
                        codigo_municipio: codMun,
                        ...(validadeFimCert ? { vencimento_cert: validadeFimCert } : {})
                    }
                });
            } catch (syncErr) {
                console.warn('Aviso ao sincronizar configuracoes_fiscais:', syncErr.message);
            }
        }

        return res.status(200).json({
            message: 'Configurações e Certificado salvos com sucesso!',
            empresa_id: empresa.id,
            estabelecimento_id: estab.id
        });
    } catch (error) {
        console.error('Erro em upsertConfiguracaoFiscal:', error);
        return res.status(500).json({ message: error.message || 'Erro ao salvar configurações fiscais.' });
    }
};

// ============================================================================
// 🔐 LEITURA DE CERTIFICADO DIGITAL (Em Memória RAM)
// ============================================================================
export const lerDadosCertificado = async (req, res) => {
    try {
        if (!req.file || !req.body.senha) {
            return res.status(400).json({ message: 'Arquivo e senha são obrigatórios.' });
        }

        const p12Der = forge.util.createBuffer(req.file.buffer.toString('binary'));
        const p12Asn1 = forge.asn1.fromDer(p12Der);
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, req.body.senha);

        let certBag = null;
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

        const cnObj = subjectAttributes.find(attr => attr.shortName === 'CN');
        if (cnObj && cnObj.value) {
            const parts = cnObj.value.split(':');
            razaoSocial = parts[0];
            if (parts.length > 1) {
                const possivelCnpj = parts[1].replace(/\D/g, '');
                if (possivelCnpj.length === 14) {
                    cnpj = possivelCnpj;
                }
            }
        }

        return res.status(200).json({
            razao_social: razaoSocial,
            cnpj,
            validade_fim: cert.validity.notAfter
        });
    } catch (error) {
        console.error('Erro ao abrir certificado (senha incorreta):', error.message);
        return res.status(400).json({ message: 'Falha ao ler certificado. Verifique a senha.' });
    }
};

// ============================================================================
// 🟢 TESTE DE CONEXÃO DIRETA COM A SEFAZ
// ============================================================================
export const testarConexaoSefaz = async (req, res) => {
    try {
        const tenant_id = getTenantId(req);

        const empresa = await prisma.fiscal_empresas.findFirst({
            where: { tenant_id },
            include: {
                estabelecimentos: {
                    include: {
                        certificados: { where: { ativo: true }, orderBy: { created_at: 'desc' } }
                    }
                }
            }
        });

        if (!empresa || !empresa.estabelecimentos?.[0]) {
            return res.status(400).json({ message: 'Nenhuma empresa/estabelecimento configurado para este tenant.' });
        }

        const estab = empresa.estabelecimentos[0];
        const cert = estab.certificados?.[0];

        if (!cert) {
            return res.status(400).json({ message: 'Nenhum Certificado Digital A1 ativo encontrado. Envie o certificado primeiro.' });
        }

        const pfxBase64 = decrypt(cert.certificado_base64, cert.certificado_iv, cert.certificado_auth_tag);
        const senha = decrypt(cert.senha_criptografada, cert.senha_iv, cert.senha_auth_tag);
        const pfxBuffer = Buffer.from(pfxBase64, 'base64');

        const uf = estab.uf || empresa.uf || 'AM';
        const ambiente = 2;
        const cUFMap = {
            RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
            MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
            MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42', RS: '43',
            MS: '50', MT: '51', GO: '52', DF: '53'
        };
        const cUF = cUFMap[uf] || '13';

        const xmlConsStatServ = `<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${ambiente}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ></consStatServ>`;

        try {
            const urlStatus = getSefazUrl(uf, ambiente, '55', 'NfeStatusServico');
            const respostaSefaz = await enviarSefaz(
                xmlConsStatServ,
                urlStatus,
                pfxBuffer,
                senha,
                'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF',
                'nfeDadosMsg'
            );

            return res.status(200).json({
                status: 'ONLINE',
                cStat: respostaSefaz.cStat,
                xMotivo: respostaSefaz.xMotivo,
                uf,
                ambiente: 'HOMOLOGACAO',
                message: `SEFAZ (${uf}): ${respostaSefaz.cStat} - ${respostaSefaz.xMotivo || 'Serviço em Operação'}`
            });
        } catch (sefazErr) {
            return res.status(200).json({
                status: 'CERTIFICADO_VALIDO',
                uf,
                ambiente: 'HOMOLOGACAO',
                validade_fim: cert.validade_fim,
                message: `Certificado A1 válido (Titular: ${cert.titular}, vencimento: ${new Date(cert.validade_fim).toLocaleDateString('pt-BR')}). Detalhe SEFAZ: ${sefazErr.message}`
            });
        }
    } catch (error) {
        console.error('Erro no teste de Sefaz:', error.message);
        return res.status(500).json({ message: 'Falha ao testar conexão com a SEFAZ: ' + error.message });
    }
};