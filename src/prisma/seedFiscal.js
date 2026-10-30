import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../config/prisma.js';
import { syncProductToFiscal } from '../modules/fiscal/services/ProductSyncService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CFOPS_PADRAO = [
    { codigo: '5101', descricao: 'Venda de produção do estabelecimento', tipo_operacao: 'SAIDA', aplicacao: 'INTERNA' },
    { codigo: '5102', descricao: 'Venda de mercadoria adquirida ou recebida de terceiros', tipo_operacao: 'SAIDA', aplicacao: 'INTERNA' },
    { codigo: '5405', descricao: 'Venda de mercadoria adquirida/recebida de terceiros com ST', tipo_operacao: 'SAIDA', aplicacao: 'INTERNA' },
    { codigo: '5202', descricao: 'Devolução de compra para comercialização', tipo_operacao: 'SAIDA', aplicacao: 'INTERNA' },
    { codigo: '5910', descricao: 'Remessa em bonificação, doação ou brinde', tipo_operacao: 'SAIDA', aplicacao: 'INTERNA' },
    { codigo: '5949', descricao: 'Outra saída de mercadoria ou prestação de serviço não especificado', tipo_operacao: 'SAIDA', aplicacao: 'INTERNA' },
    { codigo: '6101', descricao: 'Venda de produção do estabelecimento (Interestadual)', tipo_operacao: 'SAIDA', aplicacao: 'INTERESTADUAL' },
    { codigo: '6102', descricao: 'Venda de mercadoria adquirida ou recebida de terceiros (Interestadual)', tipo_operacao: 'SAIDA', aplicacao: 'INTERESTADUAL' },
    { codigo: '6403', descricao: 'Venda de mercadoria sujeita ao regime de ST (Interestadual)', tipo_operacao: 'SAIDA', aplicacao: 'INTERESTADUAL' },
    { codigo: '6202', descricao: 'Devolução de compra para comercialização (Interestadual)', tipo_operacao: 'SAIDA', aplicacao: 'INTERESTADUAL' },
    { codigo: '1102', descricao: 'Compra para comercialização', tipo_operacao: 'ENTRADA', aplicacao: 'INTERNA' },
    { codigo: '1202', descricao: 'Devolução de venda de mercadoria adquirida ou recebida de terceiros', tipo_operacao: 'ENTRADA', aplicacao: 'INTERNA' },
    { codigo: '1403', descricao: 'Compra para comercialização em operação com mercadoria sujeita a ST', tipo_operacao: 'ENTRADA', aplicacao: 'INTERNA' },
    { codigo: '2102', descricao: 'Compra para comercialização (Interestadual)', tipo_operacao: 'ENTRADA', aplicacao: 'INTERESTADUAL' },
    { codigo: '2202', descricao: 'Devolução de venda de mercadoria (Interestadual)', tipo_operacao: 'ENTRADA', aplicacao: 'INTERESTADUAL' }
];

const CSTS_PADRAO = [
    { codigo: '00', descricao: '00 - Tributada integralmente' },
    { codigo: '10', descricao: '10 - Tributada e com cobrança do ICMS por substituição tributária' },
    { codigo: '20', descricao: '20 - Com redução de base de cálculo' },
    { codigo: '30', descricao: '30 - Isenta ou não tributada e com cobrança do ICMS por ST' },
    { codigo: '40', descricao: '40 - Isenta' },
    { codigo: '41', descricao: '41 - Não tributada' },
    { codigo: '50', descricao: '50 - Suspensão' },
    { codigo: '51', descricao: '51 - Diferimento' },
    { codigo: '60', descricao: '60 - ICMS cobrado anteriormente por substituição tributária' },
    { codigo: '70', descricao: '70 - Com redução de base de cálculo e cobrança do ICMS por ST' },
    { codigo: '90', descricao: '90 - Outras' },
    { codigo: '01', descricao: '01 - PIS/COFINS Operação Tributável com Alíquota Básica' },
    { codigo: '04', descricao: '04 - PIS/COFINS Operação Tributável Monofásica - Revenda a Alíquota Zero' },
    { codigo: '06', descricao: '06 - PIS/COFINS Operação Tributável a Alíquota Zero' },
    { codigo: '07', descricao: '07 - PIS/COFINS Operação Isenta da Contribuição' },
    { codigo: '49', descricao: '49 - PIS/COFINS Outras Operações de Saída' },
    { codigo: '99', descricao: '99 - PIS/COFINS Outras Operações' }
];

const CSOSNS_PADRAO = [
    { codigo: '101', descricao: '101 - Tributada pelo Simples Nacional com permissão de crédito' },
    { codigo: '102', descricao: '102 - Tributada pelo Simples Nacional sem permissão de crédito' },
    { codigo: '103', descricao: '103 - Isenção do ICMS no Simples Nacional para faixa de receita bruta' },
    { codigo: '201', descricao: '201 - Tributada pelo Simples Nacional com permissão de crédito e com cobrança do ICMS por ST' },
    { codigo: '202', descricao: '202 - Tributada pelo Simples Nacional sem permissão de crédito e com cobrança do ICMS por ST' },
    { codigo: '203', descricao: '203 - Isenção do ICMS no Simples Nacional para faixa de receita bruta e com cobrança do ICMS por ST' },
    { codigo: '300', descricao: '300 - Imune' },
    { codigo: '400', descricao: '400 - Não tributada pelo Simples Nacional' },
    { codigo: '500', descricao: '500 - ICMS cobrado anteriormente por substituição tributária (substituído) ou por antecipação' },
    { codigo: '900', descricao: '900 - Outros' }
];

const ORIGENS_PADRAO = [
    { codigo: 0, descricao: '0 - Nacional, exceto as indicadas nos códigos 3, 4, 5 e 8' },
    { codigo: 1, descricao: '1 - Estrangeira - Importação direta, exceto a indicada no código 6' },
    { codigo: 2, descricao: '2 - Estrangeira - Adquirida no mercado interno, exceto a indicada no código 7' },
    { codigo: 3, descricao: '3 - Nacional, mercadoria ou bem com Conteúdo de Importação superior a 40% e inferior ou igual a 70%' },
    { codigo: 4, descricao: '4 - Nacional, cuja produção tenha sido feita em conformidade com os processos produtivos básicos' },
    { codigo: 5, descricao: '5 - Nacional, mercadoria ou bem com Conteúdo de Importação inferior ou igual a 40%' },
    { codigo: 6, descricao: '6 - Estrangeira - Importação direta, sem similar nacional, constante em lista da CAMEX' },
    { codigo: 7, descricao: '7 - Estrangeira - Adquirida no mercado interno, sem similar nacional, constante em lista da CAMEX' },
    { codigo: 8, descricao: '8 - Nacional, mercadoria ou bem com Conteúdo de Importação superior a 70%' }
];

const FORMAS_PAGAMENTO_PADRAO = [
    { codigo_sefaz: '01', descricao: 'Dinheiro' },
    { codigo_sefaz: '03', descricao: 'Cartão de Crédito' },
    { codigo_sefaz: '04', descricao: 'Cartão de Débito' },
    { codigo_sefaz: '15', descricao: 'Boleto Bancário' },
    { codigo_sefaz: '17', descricao: 'Pagamento Instantâneo (PIX)' },
    { codigo_sefaz: '99', descricao: 'Outros' }
];

const CENARIOS_PADRAO = [
    {
        operacao: 'SAIDA',
        documento: 'VENDA DE MERCADORIA',
        finalidade: 1,
        modelo: '55',
        cfop_padrao: '5102',
        movimenta_estoque: true,
        gera_financeiro: true
    },
    {
        operacao: 'SAIDA',
        documento: 'VENDA AO CONSUMIDOR (PDV)',
        finalidade: 1,
        modelo: '65',
        cfop_padrao: '5102',
        movimenta_estoque: true,
        gera_financeiro: true
    },
    {
        operacao: 'SAIDA',
        documento: 'DEVOLUCAO DE MERCADORIA',
        finalidade: 4,
        modelo: '55',
        cfop_padrao: '5202',
        movimenta_estoque: true,
        gera_financeiro: false
    }
];

async function seedTenantFiscal(tenantIdStr, tenantObj = null) {
    console.log(`\n🌱 Semeando tabelas fiscais para o Tenant [${tenantIdStr}]...`);

    // 1. CFOPs
    for (const c of CFOPS_PADRAO) {
        await prisma.fiscal_cfops.upsert({
            where: { tenant_id_codigo: { tenant_id: tenantIdStr, codigo: c.codigo } },
            update: {},
            create: { tenant_id: tenantIdStr, ...c }
        });
    }

    // 2. CSTs
    for (const c of CSTS_PADRAO) {
        await prisma.fiscal_csts.upsert({
            where: { tenant_id_codigo: { tenant_id: tenantIdStr, codigo: c.codigo } },
            update: {},
            create: { tenant_id: tenantIdStr, ...c }
        });
    }

    // 3. CSOSNs
    for (const c of CSOSNS_PADRAO) {
        await prisma.fiscal_csosns.upsert({
            where: { tenant_id_codigo: { tenant_id: tenantIdStr, codigo: c.codigo } },
            update: {},
            create: { tenant_id: tenantIdStr, ...c }
        });
    }

    // 4. Origens
    for (const o of ORIGENS_PADRAO) {
        await prisma.fiscal_origens.upsert({
            where: { tenant_id_codigo: { tenant_id: tenantIdStr, codigo: o.codigo } },
            update: {},
            create: { tenant_id: tenantIdStr, ...o }
        });
    }

    // 5. Formas de Pagamento
    for (const fp of FORMAS_PAGAMENTO_PADRAO) {
        const exists = await prisma.fiscal_formas_pagamento.findFirst({
            where: { tenant_id: tenantIdStr, codigo_sefaz: fp.codigo_sefaz }
        });
        if (!exists) {
            await prisma.fiscal_formas_pagamento.create({
                data: { tenant_id: tenantIdStr, ...fp }
            });
        }
    }

    // 6. Cenários Fiscais
    for (const cen of CENARIOS_PADRAO) {
        const exists = await prisma.fiscal_cenarios_fiscais.findFirst({
            where: { tenant_id: tenantIdStr, documento: cen.documento, modelo: cen.modelo }
        });
        if (!exists) {
            await prisma.fiscal_cenarios_fiscais.create({
                data: { tenant_id: tenantIdStr, ...cen }
            });
        }
    }

    // 7. Regras Tributárias Padrão
    const icmsCount = await prisma.fiscal_regras_icms.count({ where: { tenant_id: tenantIdStr } });
    if (icmsCount === 0) {
        await prisma.fiscal_regras_icms.create({
            data: {
                tenant_id: tenantIdStr,
                nome_regra: 'Regra Padrão Simples Nacional (CSOSN 102)',
                regime: 'SIMPLES_NACIONAL',
                uf_origem: '',
                uf_destino: '',
                cst_csosn: '102',
                aliquota: 0,
                base_calculo: 100,
                aliquota_st: 0,
                mva_st: 0,
                validade_inicio: new Date('2025-01-01')
            }
        });
    }

    const pisCount = await prisma.fiscal_regras_pis_cofins.count({ where: { tenant_id: tenantIdStr } });
    if (pisCount === 0) {
        await prisma.fiscal_regras_pis_cofins.create({
            data: {
                tenant_id: tenantIdStr,
                nome_regra: 'Regra Padrão PIS/COFINS Simples Nacional (CST 49)',
                regime: 'SIMPLES_NACIONAL',
                cst: '49',
                aliquota_pis: 0,
                aliquota_cofins: 0,
                validade_inicio: new Date('2025-01-01')
            }
        });
    }

    const ibsCount = await prisma.fiscal_regras_ibs_cbs.count({ where: { tenant_id: tenantIdStr } });
    if (ibsCount === 0) {
        await prisma.fiscal_regras_ibs_cbs.create({
            data: {
                tenant_id: tenantIdStr,
                nome_regra: 'Regra Padrão Reforma Tributária (IBS 0.1% / CBS 0.9%)',
                cst: '000',
                cClassTrib: '000001',
                aliquota_ibs: 0.1,
                aliquota_cbs: 0.9,
                validade_inicio: new Date('2025-01-01')
            }
        });
    }

    // 8. Importar tabela_ibs_cbs.csv (fiscal_csts_ibs_cbs + fiscal_class_trib_ibs_cbs)
    const csvPath = path.resolve(__dirname, '../../tabela_ibs_cbs.csv');
    const classTribCount = await prisma.fiscal_class_trib_ibs_cbs.count({ where: { tenant_id: tenantIdStr } });
    if (fs.existsSync(csvPath) && classTribCount === 0) {
        const content = fs.readFileSync(csvPath, 'utf-8');
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
        const cstCache = {};

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(';').map(c => c.replace(/^"|"$/g, '').trim());
            const cstCodigo = (cols[0] || '000').padStart(3, '0').substring(0, 3);
            const cstDesc = cols[1] || 'Tributação integral';
            const classCodigo = (cols[2] || '').padStart(6, '0').substring(0, 6);
            const classDesc = cols[4] || cols[3] || 'Classificação Tributária';

            if (!classCodigo || classCodigo === '000000') continue;

            if (!cstCache[cstCodigo]) {
                const cstRec = await prisma.fiscal_csts_ibs_cbs.upsert({
                    where: { tenant_id_codigo: { tenant_id: tenantIdStr, codigo: cstCodigo } },
                    update: {},
                    create: {
                        tenant_id: tenantIdStr,
                        codigo: cstCodigo,
                        descricao: cstDesc
                    }
                });
                cstCache[cstCodigo] = cstRec.id;
            }

            const cstId = cstCache[cstCodigo];
            await prisma.fiscal_class_trib_ibs_cbs.upsert({
                where: { tenant_id_cst_id_codigo: { tenant_id: tenantIdStr, cst_id: cstId, codigo: classCodigo } },
                update: {},
                create: {
                    tenant_id: tenantIdStr,
                    cst_id: cstId,
                    codigo: classCodigo,
                    descricao_reduzida: classDesc,
                    reducao_percentual_ibs: parseFloat((cols[6] || '0').replace(',', '.')) || 0,
                    reducao_percentual_cbs: parseFloat((cols[7] || '0').replace(',', '.')) || 0
                }
            }).catch(() => {});
        }
        console.log(`✅ [Tenant ${tenantIdStr}] Tabela IBS/CBS importada.`);
    }

    // 9. Garantir Empresa e Estabelecimento se houver dados em configuracoes_fiscais ou tenants
    const idTenantInt = Number(tenantIdStr);
    if (!isNaN(idTenantInt)) {
        const empExistente = await prisma.fiscal_empresas.findFirst({ where: { tenant_id: tenantIdStr } });
        if (!empExistente) {
            const cfgLegada = await prisma.configuracoes_fiscais.findUnique({ where: { id_tenant: idTenantInt } });
            const lojaPrincipal = await prisma.lojas.findFirst({ where: { id_tenant: idTenantInt } });
            const docCnpj = (cfgLegada?.cnpj || tenantObj?.documento || '').replace(/\D/g, '');
            if (docCnpj && docCnpj.length === 14) {
                const novaEmp = await prisma.fiscal_empresas.create({
                    data: {
                        tenant_id: tenantIdStr,
                        cnpj: docCnpj,
                        razao_social: cfgLegada?.razao_social || tenantObj?.razao_social || tenantObj?.nome_fantasia || 'Empresa Principal',
                        nome_fantasia: tenantObj?.nome_fantasia || cfgLegada?.razao_social || 'Matriz',
                        ie: cfgLegada?.inscricao_estadual || null,
                        im: cfgLegada?.inscricao_municipal || null,
                        crt: 'SIMPLES_NACIONAL',
                        logradouro: lojaPrincipal?.logradouro || 'Endereço Principal',
                        numero: lojaPrincipal?.numero || 'S/N',
                        bairro: lojaPrincipal?.bairro || 'Centro',
                        municipio: lojaPrincipal?.cidade || 'Manaus',
                        codigo_municipio_ibge: cfgLegada?.codigo_municipio || '1302603',
                        uf: (lojaPrincipal?.estado || 'AM').substring(0, 2).toUpperCase(),
                        cep: (lojaPrincipal?.cep || '69000000').replace(/\D/g, ''),
                        email: tenantObj?.email_contato || tenantObj?.email || null,
                        telefone: tenantObj?.telefone_contato ? tenantObj.telefone_contato.replace(/\D/g, '') : null
                    }
                }).catch(() => null);

                if (novaEmp) {
                    const novoEstab = await prisma.fiscal_estabelecimentos.create({
                        data: {
                            tenant_id: tenantIdStr,
                            empresa_id: novaEmp.id,
                            nome: novaEmp.nome_fantasia || novaEmp.razao_social,
                            cnpj: docCnpj,
                            ie: novaEmp.ie,
                            logradouro: novaEmp.logradouro || 'Endereço Principal',
                            numero: novaEmp.numero || 'S/N',
                            bairro: novaEmp.bairro || 'Centro',
                            codigo_municipio_ibge: novaEmp.codigo_municipio_ibge || '1302603',
                            municipio: novaEmp.municipio || 'Manaus',
                            uf: novaEmp.uf || 'AM',
                            cep: novaEmp.cep || '69000000'
                        }
                    });

                    for (const mod of ['55', '65']) {
                        const novaSerie = await prisma.fiscal_series.create({
                            data: {
                                tenant_id: tenantIdStr,
                                estabelecimento_id: novoEstab.id,
                                modelo: mod,
                                serie: 1,
                                ativo: true
                            }
                        });
                        await prisma.fiscal_numeracoes.create({
                            data: {
                                tenant_id: tenantIdStr,
                                serie_id: novaSerie.id,
                                ultimo_numero: 0
                            }
                        });
                    }
                }
            }
        }

        // 10. Sincronizar Produtos existentes deste Tenant para fiscal_produtos
        const produtos = await prisma.produtos.findMany({ where: { id_tenant: idTenantInt } });
        let syncCount = 0;
        for (const prod of produtos) {
            const idFiscal = await syncProductToFiscal(prod, {}, prod.id_fiscal ? 'PUT' : 'POST');
            if (idFiscal && idFiscal !== prod.id_fiscal) {
                await prisma.produtos.update({
                    where: { id_produto: prod.id_produto },
                    data: { id_fiscal: idFiscal }
                });
            }
            if (idFiscal) syncCount++;
        }
        console.log(`✅ [Tenant ${tenantIdStr}] ${syncCount} produtos sincronizados com fiscal_produtos.`);

        // 11. Sincronizar Fornecedores existentes para fiscal_destinatarios
        const fornecedores = await prisma.fornecedores.findMany({ where: { id_tenant: idTenantInt } });
        for (const forn of fornecedores) {
            const cnpjLimpo = (forn.cnpj || '').replace(/\D/g, '');
            if (cnpjLimpo.length === 11 || cnpjLimpo.length === 14) {
                await prisma.fiscal_destinatarios.upsert({
                    where: { tenant_id_cpf_cnpj: { tenant_id: tenantIdStr, cpf_cnpj: cnpjLimpo } },
                    update: {},
                    create: {
                        tenant_id: tenantIdStr,
                        cpf_cnpj: cnpjLimpo,
                        razao_social: forn.nome_loja || 'Fornecedor',
                        email: forn.email || null,
                        tipo_contribuinte: 'NAO_CONTRIBUINTE',
                        logradouro: forn.endereco || 'Centro',
                        numero: 'S/N',
                        bairro: 'Centro',
                        codigo_municipio_ibge: '1302603',
                        municipio: 'Manaus',
                        uf: 'AM',
                        cep: '69000000'
                    }
                }).catch(() => {});
            }
        }
    }
}

async function main() {
    console.log('🚀 Iniciando Seed e Sincronização do Módulo Fiscal Nativo no www...');
    const tenants = await prisma.tenants.findMany();
    if (tenants.length === 0) {
        await seedTenantFiscal('1');
    } else {
        for (const t of tenants) {
            await seedTenantFiscal(String(t.id), t);
        }
    }
    console.log('\n🎉 Seed e Sincronização Fiscal concluídos com sucesso!');
}

main()
    .catch(err => {
        console.error('Erro no seedFiscal:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
