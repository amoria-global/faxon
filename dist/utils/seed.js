"use strict";
// src/scripts/seed.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Starting database seed...');
    try {
        // Clean up existing data (optional - uncomment if needed)
        // console.log('🧹 Cleaning existing data...');
        // await prisma.session.deleteMany({});
        // await prisma.verificationToken.deleteMany({});
        // await prisma.account.deleteMany({});
        // await prisma.user.deleteMany({});
        // Create test users
        console.log('👥 Creating test users...');
        // Admin user
        const adminPassword = await bcryptjs_1.default.hash('Admin123!', 12);
        const adminUser = await prisma.user.upsert({
            where: { email: 'admin@jambolush.com' },
            update: {},
            create: {
                email: 'admin@jambolush.com',
                firstName: 'Admin',
                lastName: 'User',
                password: adminPassword,
                emailVerified: true,
                isActive: true,
            },
        });
        // Create admin email account
        await prisma.account.upsert({
            where: {
                provider_providerAccountId: {
                    provider: 'email',
                    providerAccountId: adminUser.id,
                },
            },
            update: {},
            create: {
                userId: adminUser.id,
                type: 'email',
                provider: 'email',
                providerAccountId: adminUser.id,
            },
        });
        // Test user with email account
        const testPassword = await bcryptjs_1.default.hash('Test123!', 12);
        const testUser = await prisma.user.upsert({
            where: { email: 'test@jambolush.com' },
            update: {},
            create: {
                email: 'test@jambolush.com',
                firstName: 'Test',
                lastName: 'User',
                password: testPassword,
                emailVerified: true,
                isActive: true,
            },
        });
        // Create test user email account
        await prisma.account.upsert({
            where: {
                provider_providerAccountId: {
                    provider: 'email',
                    providerAccountId: testUser.id,
                },
            },
            update: {},
            create: {
                userId: testUser.id,
                type: 'email',
                provider: 'email',
                providerAccountId: testUser.id,
            },
        });
        // OAuth user (Google)
        const oauthUser = await prisma.user.upsert({
            where: { email: 'oauth@jambolush.com' },
            update: {},
            create: {
                email: 'oauth@jambolush.com',
                firstName: 'OAuth',
                lastName: 'User',
                password: null, // OAuth users don't have passwords
                emailVerified: true,
                isActive: true,
            },
        });
        // Create Google account for OAuth user
        await prisma.account.upsert({
            where: {
                provider_providerAccountId: {
                    provider: 'google',
                    providerAccountId: 'google-123456',
                },
            },
            update: {},
            create: {
                userId: oauthUser.id,
                type: 'oauth',
                provider: 'google',
                providerAccountId: 'google-123456',
            },
        });
        // Unverified user
        const unverifiedPassword = await bcryptjs_1.default.hash('Unverified123!', 12);
        const unverifiedUser = await prisma.user.upsert({
            where: { email: 'unverified@jambolush.com' },
            update: {},
            create: {
                email: 'unverified@jambolush.com',
                firstName: 'Unverified',
                lastName: 'User',
                password: unverifiedPassword,
                emailVerified: false,
                isActive: true,
            },
        });
        // Create unverified user email account
        await prisma.account.upsert({
            where: {
                provider_providerAccountId: {
                    provider: 'email',
                    providerAccountId: unverifiedUser.id,
                },
            },
            update: {},
            create: {
                userId: unverifiedUser.id,
                type: 'email',
                provider: 'email',
                providerAccountId: unverifiedUser.id,
            },
        });
        // Create verification token for unverified user
        const verificationToken = 'test-verification-token-123';
        await prisma.verificationToken.upsert({
            where: { token: verificationToken },
            update: {},
            create: {
                identifier: unverifiedUser.id,
                token: verificationToken,
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
            },
        });
        console.log('✅ Seed completed successfully!');
        console.log('\n📋 Test accounts created:');
        console.log('1. Admin User:');
        console.log('   Email: admin@jambolush.com');
        console.log('   Password: Admin123!');
        console.log('   Status: ✅ Email verified, Active');
        console.log('');
        console.log('2. Test User:');
        console.log('   Email: test@jambolush.com');
        console.log('   Password: Test123!');
        console.log('   Status: ✅ Email verified, Active');
        console.log('');
        console.log('3. OAuth User:');
        console.log('   Email: oauth@jambolush.com');
        console.log('   Provider: Google');
        console.log('   Status: ✅ Email verified, Active');
        console.log('');
        console.log('4. Unverified User:');
        console.log('   Email: unverified@jambolush.com');
        console.log('   Password: Unverified123!');
        console.log('   Status: ❌ Email not verified, Active');
        console.log('   Verification token:', verificationToken);
        console.log('');
        console.log('🚀 You can now start testing the authentication system!');
    }
    catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
// Execute the seed function
main()
    .then(async () => {
    process.exit(0);
})
    .catch(async (e) => {
    console.error(e);
    process.exit(1);
});
