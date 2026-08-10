import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import generateToken from '../../utils/generateToken.js';
import { encrypt, decrypt } from '../../services/cryptoService.js';

const prisma = new PrismaClient();

// ==========================================
// 🔐 LOGIN EXCLUSIVO PARA FUNCIONÁRIOS
// ==========================================
export const loginFuncionario = async (req, res, next) => {
    try {
        const { email, senha } = req.body;

        const funcionario = await prisma.funcionarios.findFirst({
            where: { email: email, ativo: true },
            include: { cargos: true } 
        });

        if (!funcionario) {
            return res.status(404).json({ message: "Colaborador não encontrado ou inativo." });
        }

        const loja = await prisma.tenants.findUnique({ 
            where: { id: funcionario.id_tenant } 
        });

        if (!loja || !loja.ativo) {
            return res.status(403).json({ message: "A loja vinculada a esta conta está inativa." });
        }

        const isMatch = await bcrypt.compare(senha, funcionario.hash_senha);

        if (!isMatch) {
            return res.status(401).json({ message: 'Senha incorreta.' });
        }

        const novaSessaoToken = crypto.randomUUID();

        await prisma.funcionarios.update({
            where: { id_funcionario: funcionario.id_funcionario },
            data: { sessao_token: novaSessaoToken }
        });
        
        return res.json({
            id_usuario: funcionario.id_funcionario,
            nome_completo: funcionario.nome_completo,
            email: funcionario.email,
            codigo_acesso: funcionario.codigo_acesso,
            imagem: funcionario.imagem, // 🟢 AQUI! Retornando a imagem do perfil do funcionário
            token: generateToken(funcionario.id_funcionario, loja.id, novaSessaoToken),
            isAdmin: funcionario.isAdmin,
            role: funcionario.role,
            id_tenant: loja.id,
            tenantSlug: loja.slug,
            permissoes: funcionario.cargos ? funcionario.cargos.permissoes : []
        });

    } catch (error) {
        console.error("ERRO NO LOGIN DE FUNCIONÁRIO:", error.message);
        next(error);
    }
};

// ==========================================
// 👥 LISTAR TODOS OS FUNCIONÁRIOS
// ==========================================
export const getAllFuncionarios = async (req, res, next) => {
    try {
        const funcionarios = await prisma.funcionarios.findMany({
            where: { id_tenant: req.tenantId },
            select: {
                id_funcionario: true,
                nome_completo: true,
                email: true,
                role: true,
                id_cargo: true, // 🟢 Enviando o ID do cargo pro frontend
                isAdmin: true,
                codigo_acesso: true,
                ativo: true,
                criado_em: true
            }
        });
        res.status(200).json(funcionarios);
    } catch (error) {
        next(error);
    }
};

// ==========================================
// ➕ REGISTRAR NOVO FUNCIONÁRIO
// ==========================================
export const registrarFuncionario = async (req, res, next) => {
    try {
        // 🟢 Recebendo o id_cargo do body
        const { nome_completo, email, senha, role, isAdmin, codigo_acesso, cpf, ativo, id_cargo } = req.body;
        const id_tenant = req.tenantId;

        const emailExiste = await prisma.funcionarios.findFirst({
            where: { email: email, id_tenant: id_tenant }
        });

        if (emailExiste) {
            return res.status(400).json({ message: 'E-mail já cadastrado nesta loja.' });
        }

        if (codigo_acesso) {
            const codigoExiste = await prisma.funcionarios.findFirst({
                where: { codigo_acesso: codigo_acesso, id_tenant: id_tenant }
            });
            if (codigoExiste) {
                return res.status(400).json({ message: 'Este código de acesso já está em uso.' });
            }
        }

        let cpfCriptografado = null;
        if (cpf) {
            const cpfLimpo = cpf.replace(/\D/g, '');
            cpfCriptografado = encrypt(cpfLimpo);
        }

        const salt = await bcrypt.genSalt(10);
        const hash_senha = await bcrypt.hash(senha, salt);

        const novoFuncionario = await prisma.funcionarios.create({
            data: {
                id_tenant: id_tenant,
                nome_completo,
                email,
                hash_senha,
                role: role,
                id_cargo: id_cargo || null, // 🟢 Salvando a ligação com a tabela cargos
                isAdmin: isAdmin || false,
                codigo_acesso: codigo_acesso || null,
                cpf_criptografado: cpfCriptografado,
                ativo: ativo !== undefined ? ativo : true
            }
        });

        res.status(201).json({
            id_funcionario: novoFuncionario.id_funcionario,
            nome_completo: novoFuncionario.nome_completo,
            email: novoFuncionario.email,
            role: novoFuncionario.role
        });

    } catch (error) {
        next(error);
    }
};

// ==========================================
// ✏️ ATUALIZAR FUNCIONÁRIO
// ==========================================
export const updateFuncionario = async (req, res, next) => {
    try {
        const { id } = req.params;
        const id_tenant = req.tenantId;
        // 🟢 Recebendo o id_cargo do body
        const { nome_completo, email, role, isAdmin, senha, codigo_acesso, ativo, id_cargo } = req.body;

        const funcionarioAtual = await prisma.funcionarios.findFirst({
            where: { id_funcionario: Number(id), id_tenant: id_tenant }
        });

        if (!funcionarioAtual) {
            return res.status(404).json({ message: 'Colaborador não encontrado.' });
        }

        const dadosParaAtualizar = {
            nome_completo: nome_completo || funcionarioAtual.nome_completo,
            email: email || funcionarioAtual.email,
            role: role || funcionarioAtual.role,
            id_cargo: id_cargo !== undefined ? id_cargo : funcionarioAtual.id_cargo, // 🟢 Salvando na edição
            isAdmin: isAdmin !== undefined ? isAdmin : funcionarioAtual.isAdmin,
            ativo: ativo !== undefined ? ativo : funcionarioAtual.ativo,
            codigo_acesso: codigo_acesso !== undefined ? codigo_acesso : funcionarioAtual.codigo_acesso
        };

        if (senha) {
            const salt = await bcrypt.genSalt(10);
            dadosParaAtualizar.hash_senha = await bcrypt.hash(senha, salt);
        }

        const updatedFuncionario = await prisma.funcionarios.update({
            where: { id_funcionario: Number(id) },
            data: dadosParaAtualizar
        });

        res.json({
            id_funcionario: updatedFuncionario.id_funcionario,
            nome_completo: updatedFuncionario.nome_completo,
            role: updatedFuncionario.role,
            isAdmin: updatedFuncionario.isAdmin
        });

    } catch (error) {
        next(error);
    }
};

// ==========================================
// 🗑️ DELETAR FUNCIONÁRIO
// ==========================================
export const deleteFuncionario = async (req, res, next) => {
    try {
        const { id } = req.params;
        const id_tenant = req.tenantId;

        const funcionario = await prisma.funcionarios.findFirst({
            where: { id_funcionario: Number(id), id_tenant: id_tenant }
        });

        if (!funcionario) {
            return res.status(404).json({ message: 'Colaborador não encontrado.' });
        }

        if (req.user && req.user.id_usuario === Number(id)) {
            return res.status(400).json({ message: 'Você não pode deletar a sua própria conta.' });
        }

        await prisma.funcionarios.delete({
            where: { id_funcionario: Number(id) }
        });
        
        res.json({ message: 'Funcionário removido com sucesso' });

    } catch (error) {
        next(error);
    }
};

// ==========================================
// 🗑️ INFORMAÇÔES FUNCIONÁRIO
// ==========================================
export const getFuncionarioProfile = async (req, res) => {
    try {
        const id_tenant = req.tenantId; // Injetado com sucesso pelo protect
        
        let id_funcionario;

        // Se houver um parâmetro na URL e não for a palavra "me" (Admin visualizando)
        if (req.params.id && req.params.id !== 'me') {
            id_funcionario = parseInt(req.params.id, 10);
        } else {
            // Autogestão: Lê exatamente a propriedade injetada pelo seu authMiddleware
            id_funcionario = req.user?.id_usuario; 
        }

        // Validação de segurança para impedir parâmetros inválidos ou tokens malformados
        if (!id_funcionario || isNaN(id_funcionario)) {
            return res.status(400).json({ 
                message: 'Identificação do funcionário inválida ou ausente na sessão.' 
            });
        }

        const funcionario = await prisma.funcionarios.findFirst({
            where: { 
                id_funcionario: id_funcionario,
                id_tenant: id_tenant // Mantém o isolamento de dados do SaaS
            },
            select: {
                id_funcionario: true,
                nome_completo: true,
                email: true,
                role: true,
                ativo: true,
                imagem: true,
                especialidade: true,
                bio: true,
                formacao: true,
                atuacao: true,
                sobre: true,
                id_cargo: true
            }
        });

        if (!funcionario) {
            return res.status(404).json({ message: 'Profissional não encontrado nesta loja.' });
        }

        res.status(200).json(funcionario);
    } catch (error) {
        console.error('Erro ao buscar perfil do profissional:', error);
        res.status(500).json({ message: 'Erro interno ao buscar dados do profissional.' });
    }
};

// ============================================================================
// ATUALIZAR INFORMAÇÕES DO PERFIL DO FUNCIONÁRIO/PROFISSIONAL
// ============================================================================
export const updateFuncionarioProfile = async (req, res) => {
    try {
        const id_tenant = req.tenantId;
        
        let id_funcionario;

        if (req.params.id && req.params.id !== 'me') {
            id_funcionario = parseInt(req.params.id, 10);
        } else {
            // Autogestão: Puxa do req.user mapeado no middleware protect
            id_funcionario = req.user?.id_usuario;
        }

        if (!id_funcionario || isNaN(id_funcionario)) {
            return res.status(400).json({ 
                message: 'Identificação do funcionário inválida ou ausente na sessão.' 
            });
        }

        const { 
            nome_completo, 
            imagem, 
            especialidade, 
            bio, 
            formacao, 
            atuacao, 
            sobre 
        } = req.body;

        // Garante que o registro pertence ao tenant correto antes de atualizar
        const funcionarioExistente = await prisma.funcionarios.findFirst({
            where: { 
                id_funcionario: id_funcionario,
                id_tenant: id_tenant
            }
        });

        if (!funcionarioExistente) {
            return res.status(404).json({ message: 'Profissional não encontrado ou acesso negado.' });
        }

        const dadosAtualizados = {};
        
        if (nome_completo !== undefined) dadosAtualizados.nome_completo = nome_completo;
        if (imagem !== undefined) dadosAtualizados.imagem = imagem;
        if (especialidade !== undefined) dadosAtualizados.especialidade = especialidade;
        if (bio !== undefined) dadosAtualizados.bio = bio;
        if (formacao !== undefined) dadosAtualizados.formacao = formacao;
        if (atuacao !== undefined) dadosAtualizados.atuacao = atuacao;
        if (sobre !== undefined) dadosAtualizados.sobre = sobre;

        const funcionarioAtualizado = await prisma.funcionarios.update({
            where: { id_funcionario: id_funcionario },
            data: dadosAtualizados,
            select: {
                id_funcionario: true,
                nome_completo: true,
                imagem: true,
                especialidade: true,
                bio: true,
                formacao: true,
                atuacao: true,
                sobre: true
            }
        });

        res.status(200).json({ 
            message: "Perfil do profissional atualizado com sucesso!",
            profissional: funcionarioAtualizado 
        });

    } catch (error) {
        console.error("Erro ao atualizar perfil do profissional:", error);
        res.status(500).json({ message: 'Erro interno ao atualizar os dados do profissional.' });
    }
};