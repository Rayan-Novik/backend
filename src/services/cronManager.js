import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { syncExternalProducts } from './legacySyncService.js';
import { renovarTokenMercadoPago } from '../controllers/webhookController.js';

// 🟢 IMPORTA A FUNÇÃO QUE LÊ OS EVENTOS DE PEDIDOS DO IFOOD
import { lerFilaDeEventos } from './integration/ifood/ifoodOrderService.js';

const prisma = new PrismaClient();

const activeTasks = {}; 
const runningStates = {};
const ifoodRunningStates = {}; // Proteção para o iFood

// --- CRON DO MERCADO PAGO ---
export const initMPRefreshCron = () => {
    // Agenda para todo domingo à meia-noite ('0 0 * * 0')
    cron.schedule('0 0 * * 0', async () => {
        console.log("🕒 [CRON GLOBAL] Iniciando renovação semanal de tokens Mercado Pago...");
        
        try {
            const configs = await prisma.configuracoes.findMany({
                where: { chave: 'MERCADOPAGO_REFRESH_TOKEN' }
            });

            for (const config of configs) {
                await renovarTokenMercadoPago(config.id_tenant);
            }
            
            console.log(`✅ [CRON GLOBAL] Renovação concluída para ${configs.length} tenants.`);
        } catch (error) {
            console.error("❌ [CRON GLOBAL] Erro ao buscar tenants para renovação MP:", error);
        }
    });
};

// =========================================================
// 🟢 NOVO: CRON GLOBAL DE POLLING DE PEDIDOS DO IFOOD
// =========================================================
export const initIfoodPollingCron = () => {
    // Roda a cada 30 segundos (Intervalo exigido pelo iFood)
    cron.schedule('*/30 * * * * *', async () => {
        try {
            // 1. Pega todas as lojas que estão conectadas no iFood
            const lojasConectadas = await prisma.ifoodAuth.findMany({
                select: { id_tenant: true, merchantId: true }
            });

            if (lojasConectadas.length === 0) return;

            // 2. Dispara a leitura da fila para todas as lojas em paralelo
            await Promise.allSettled(
                lojasConectadas.map(async (loja) => {
                    const tenantId = loja.id_tenant;

                    // Proteção para não encavalar requisições se a API do iFood demorar
                    if (ifoodRunningStates[tenantId]) return;

                    try {
                        ifoodRunningStates[tenantId] = true;
                        
                        // Chama o motor de Polling (Faz o GET e dá o ACK)
                        await lerFilaDeEventos(tenantId);
                        
                    } catch (err) {
                        console.error(`[CRON iFood] Falha silenciosa no Tenant ${tenantId}`);
                    } finally {
                        ifoodRunningStates[tenantId] = false;
                    }
                })
            );

        } catch (error) {
            console.error("❌ [CRON GLOBAL iFood] Erro mestre no Polling:", error.message);
        }
    });
};

// --- CRON LEGADO (SYNC EXTERNO) ---
const getCronExpression = (minutos) => {
    const min = Number(minutos);
    if (!min || isNaN(min) || min < 1) return '0 * * * *'; 

    if (min >= 60) {
        const horas = Math.floor(min / 60);
        return `0 */${horas} * * *`;
    }
    
    return `*/${min} * * * *`;
};

export const initCron = async (id_tenant) => {
    try {
        const config = await prisma.config_integracao.findFirst({
            where: { id_tenant: id_tenant }
        });
        
        if (activeTasks[id_tenant]) {
            activeTasks[id_tenant].stop();
            delete activeTasks[id_tenant];
        }

        if (!config || !config.ativo) {
            return;
        }

        const minutos = config.intervalo_sync || 60;
        const expression = getCronExpression(minutos);

        activeTasks[id_tenant] = cron.schedule(expression, async () => {
            
            if (runningStates[id_tenant]) {
                console.warn(`[CRON] Tenant ${id_tenant}: Sincronização anterior em andamento. Pulando.`);
                return;
            }

            try {
                runningStates[id_tenant] = true;
                await syncExternalProducts(id_tenant);
            } catch (err) {
                console.error(`[CRON] Erro no Tenant ${id_tenant}:`, err);
            } finally {
                runningStates[id_tenant] = false;
            }
        });

    } catch (error) {
        console.error(`[CRON] Erro fatal no inicializador do Tenant ${id_tenant}:`, error);
    }
};