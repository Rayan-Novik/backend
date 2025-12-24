import { PrismaClient } from '@prisma/client';
import sql from 'mssql';
import { syncExternalProducts } from '../services/legacySyncService.js';
import { initCron } from '../services/cronManager.js';
import { encrypt, decrypt } from '../utils/crypto.js'; 

const prisma = new PrismaClient();

// 1. Buscar Configuração
export const getConfig = async (req, res) => {
    try {
        const config = await prisma.config_integracao.findFirst();
        if (config && config.password) {
            // Manda máscara pro frontend, nunca a senha real/criptografada
            config.password = '********'; 
        }
        res.json(config || {});
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar configurações." });
    }
};

// 2. Salvar Configuração
export const saveConfig = async (req, res) => {
    try {
        const { password, ...data } = req.body;
        let passwordToSave = password;

        // Lógica: Se a senha não for a máscara, o usuário digitou uma nova. Criptografa!
        if (password && password !== '********') {
            passwordToSave = encrypt(password);
        } else {
            // Se for a máscara, busca a senha antiga no banco para não perder
            const current = await prisma.config_integracao.findFirst();
            passwordToSave = current?.password;
        }

        const config = await prisma.config_integracao.upsert({
            where: { id: 1 }, // Sempre usa o ID 1
            update: { 
                ...data, 
                port: Number(data.port), 
                intervalo_sync: Number(data.intervalo_sync), // <--- SALVA O INTERVALO
                password: passwordToSave 
            },
            create: { 
                ...data, 
                port: Number(data.port), 
                intervalo_sync: Number(data.intervalo_sync), // <--- SALVA O INTERVALO
                password: passwordToSave 
            }
        });

        // 🔥 REINICIA O AGENDADOR COM O NOVO TEMPO
        await initCron();

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erro ao salvar." });
    }
};

// 3. Testar Conexão
export const testConnection = async (req, res) => {
    let { host, port, user, password, database } = req.body;

    try {
        // Se veio mascarado, pega a senha real do banco e descriptografa
        if (password === '********') {
            const saved = await prisma.config_integracao.findFirst();
            if (saved) password = decrypt(saved.password);
        }

        await sql.connect({
            user, password, database, server: host, port: Number(port),
            options: { encrypt: false, trustServerCertificate: true, connectTimeout: 5000 }
        });
        
        res.json({ message: "Conexão com SQL Server bem sucedida!" });
    } catch (error) {
        res.status(400).json({ message: "Falha: " + error.message });
    }
};

// 4. Forçar Sync Manual
export const triggerManualSync = async (req, res) => {
    try {
        await syncExternalProducts();
        res.json({ message: "Sincronização executada com sucesso." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};