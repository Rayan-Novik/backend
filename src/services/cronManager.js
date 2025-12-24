import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { syncExternalProducts } from './legacySyncService.js';

const prisma = new PrismaClient();
let currentTask = null; // Guarda a tarefa ativa na memória

// Função para converter minutos em Sintaxe Cron
// Ex: 10 -> "*/10 * * * *"
// Ex: 60 -> "0 * * * *" (Toda hora cheia)
const getCronExpression = (minutos) => {
    if (minutos >= 60) {
        const horas = Math.floor(minutos / 60);
        return `0 */${horas} * * *`; // A cada X horas
    }
    return `*/${minutos} * * * *`; // A cada X minutos
};

export const initCron = async () => {
    try {
        const config = await prisma.config_integracao.findFirst();
        
        // Se já existe uma tarefa rodando, para ela antes de criar outra
        if (currentTask) {
            console.log("🛑 [CRON] Parando tarefa anterior...");
            currentTask.stop();
            currentTask = null;
        }

        if (!config || !config.ativo) {
            console.log("⏸️ [CRON] Sincronização automática está DESATIVADA.");
            return;
        }

        const minutos = config.intervalo_sync || 10;
        const expression = getCronExpression(minutos);

        console.log(`⏱️ [CRON] Agendando sincronização para a cada ${minutos} minutos (${expression}).`);

        // Cria a nova tarefa
        currentTask = cron.schedule(expression, () => {
            syncExternalProducts();
        });

    } catch (error) {
        console.error("Erro ao iniciar Cron:", error);
    }
};