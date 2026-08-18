import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encrypt } from './services/cryptoService.js';

const prisma = new PrismaClient();

const createSandboxUser = async () => {
    try {
        console.log("🌱 Iniciando a criação do ambiente Sandbox...");

        const sandboxEmail = "sandbox@admin.com";
        const sandboxPassword = "sandbox_admin";
        
        // Geramos um slug único para não dar erro de "unique constraint" se rodar de novo
        const sandboxSlug = "sandbox-store-" + Date.now(); 

        // 1. Verifica se já existe na tabela 'usuarios'
        const existe = await prisma.usuarios.findFirst({
            where: { email: sandboxEmail }
        });

        if (existe) {
            console.log("⚠️ Usuário Sandbox já existe no banco de dados!");
            return;
        }

        // 2. Hash Seguro da Senha
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(sandboxPassword, salt);

        // 3. Cria o Inquilino (Tenant) respeitando as colunas do seu schema
        const tenantSandbox = await prisma.tenants.create({
            data: {
                slug: sandboxSlug, // 👈 Obrigatório no seu schema
                nome_fantasia: "Loja Sandbox",
                documento: "00000000000",
                email: sandboxEmail,
                plano: "PRO",
                status_assinatura: "ATIVO"
            }
        });

        // 4. Cria o Usuário vinculado ao Tenant, respeitando as colunas corretas
        const userSandbox = await prisma.usuarios.create({
            data: {
                nome_completo: "Admin Sandbox", // 👈 Era "name"
                email: sandboxEmail,
                hash_senha: senhaHash,          // 👈 Era "password"
                id_tenant: tenantSandbox.id,    // 👈 Era "tenant_id"
                role: "ADMIN",
                isAdmin: true
            }
        });

        console.log("✅ Sandbox criado com sucesso!");
        console.log(`📧 Login: ${sandboxEmail}`);
        console.log(`🔑 Senha: ${sandboxPassword}`);
        console.log(`🏢 Tenant ID: ${tenantSandbox.id}`);
        console.log(`🔗 Slug: ${sandboxSlug}`);

    } catch (error) {
        console.error("❌ Erro ao criar Sandbox:", error);
    } finally {
        await prisma.$disconnect();
    }
};

createSandboxUser();