import { PrismaClient } from '@prisma/client';
import sql from 'mssql';
import { syncExternalProducts } from '../services/legacySyncService.js';
import { initCron } from '../services/cronManager.js';
import { encrypt, decrypt } from '../utils/crypto.js'; 

const prisma = new PrismaClient();

export const getConfig = async (req, res) => {
    try {
        const config = await prisma.config_integracao.findFirst({
            where: { id_tenant: req.tenantId }
        });
        
        if (config && config.password) {
            config.password = '********'; 
        }
        
        res.json(config || {});
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar configurações." });
    }
};

export const saveConfig = async (req, res) => {
    try {
        const { password, ...data } = req.body;
        let passwordToSave = password;

        const current = await prisma.config_integracao.findFirst({
            where: { id_tenant: req.tenantId }
        });

        if (password && password !== '********') {
            passwordToSave = encrypt(password);
        } else {
            passwordToSave = current?.password;
        }

        if (current) {
            await prisma.config_integracao.updateMany({
                where: { id_tenant: req.tenantId },
                data: { 
                    ...data, 
                    port: Number(data.port), 
                    intervalo_sync: Number(data.intervalo_sync),
                    password: passwordToSave 
                }
            });
        } else {
            await prisma.config_integracao.create({
                data: { 
                    ...data, 
                    port: Number(data.port), 
                    intervalo_sync: Number(data.intervalo_sync),
                    password: passwordToSave,
                    id_tenant: req.tenantId
                }
            });
        }

        await initCron(req.tenantId);

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erro ao salvar." });
    }
};

export const testConnection = async (req, res) => {
    let { host, port, user, password, database } = req.body;

    try {
        if (password === '********') {
            const saved = await prisma.config_integracao.findFirst({
                where: { id_tenant: req.tenantId }
            });
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

export const triggerManualSync = async (req, res) => {
    try {
        await syncExternalProducts(req.tenantId);
        res.json({ message: "Sincronização executada com sucesso." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};