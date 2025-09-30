"use strict";
// services/pesapal.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PesapalService = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
class PesapalService {
    constructor(config) {
        this.credentials = {};
        this.ipnRegistration = null;
        this.ipnRegistrationPromise = null;
        this.config = config;
        this.client = axios_1.default.create({
            baseURL: this.config.baseUrl,
            timeout: this.config.timeout,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }
        });
        // Request interceptor for authentication
        this.client.interceptors.request.use(async (config) => {
            // Skip auth for token endpoint
            if (config.url?.includes('/api/Auth/RequestToken')) {
                return config;
            }
            const token = await this.getValidToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        });
        // Response interceptor for error handling
        this.client.interceptors.response.use((response) => response, async (error) => {
            if (error.response?.status === 401) {
                // Token expired, refresh and retry
                this.credentials = {};
                const token = await this.getValidToken();
                if (token && error.config) {
                    error.config.headers.Authorization = `Bearer ${token}`;
                    return this.client.request(error.config);
                }
            }
            return Promise.reject(error);
        });
    }
    // === AUTHENTICATION ===
    async getValidToken() {
        try {
            // Check if current token is still valid
            if (this.credentials.accessToken && this.credentials.expiresAt) {
                if (Date.now() < this.credentials.expiresAt - 60000) { // 1 minute buffer
                    return this.credentials.accessToken;
                }
            }
            // Get new token
            const authData = {
                consumer_key: this.config.consumerKey,
                consumer_secret: this.config.consumerSecret
            };
            const response = await axios_1.default.post(`${this.config.baseUrl}/api/Auth/RequestToken`, authData, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            if (response.data.error) {
                throw new Error(`Pesapal auth error: ${response.data.error.message}`);
            }
            const expiresAt = new Date(response.data.expiryDate).getTime();
            this.credentials = {
                accessToken: response.data.token,
                expiresAt
            };
            return this.credentials.accessToken;
        }
        catch (error) {
            console.error('Pesapal authentication failed:', error.response?.data || error.message);
            return null;
        }
    }
    // === IPN MANAGEMENT ===
    async getValidIPNId() {
        try {
            // If we already have a registration request in progress, wait for it
            if (this.ipnRegistrationPromise) {
                return await this.ipnRegistrationPromise;
            }
            // Check if current IPN registration is still valid
            if (this.ipnRegistration && this.isIPNValid(this.ipnRegistration)) {
                return this.ipnRegistration.ipn_id;
            }
            // Create a new registration promise to prevent multiple concurrent registrations
            this.ipnRegistrationPromise = this.registerIPNUrl();
            try {
                const ipnId = await this.ipnRegistrationPromise;
                return ipnId;
            }
            finally {
                // Clear the promise once completed (success or failure)
                this.ipnRegistrationPromise = null;
            }
        }
        catch (error) {
            console.error('Failed to get valid IPN ID:', error);
            throw new Error(`IPN registration failed: ${error.message}`);
        }
    }
    async registerIPNUrl() {
        try {
            console.log('Registering IPN URL with Pesapal...');
            const ipnUrl = this.config.callbackUrl.replace('/callback', '/ipn'); // Use IPN-specific endpoint
            const registrationData = {
                url: ipnUrl,
                ipn_notification_type: 'GET'
            };
            const response = await this.client.post('/api/URLSetup/RegisterIPN', registrationData);
            if (response.data.error) {
                throw new Error(`IPN registration error: ${response.data.error.message}`);
            }
            if (!response.data.ipn_id) {
                throw new Error('IPN registration did not return an IPN ID');
            }
            // Cache the registration
            this.ipnRegistration = {
                ipn_id: response.data.ipn_id,
                url: ipnUrl,
                registered_at: new Date(),
                expires_at: response.data.expires_at ? new Date(response.data.expires_at) : undefined
            };
            console.log(`IPN URL registered successfully. IPN ID: ${response.data.ipn_id}`);
            return response.data.ipn_id;
        }
        catch (error) {
            console.error('IPN registration failed:', error);
            throw new Error(error.response?.data?.error?.message ||
                error.message ||
                'Failed to register IPN URL');
        }
    }
    isIPNValid(registration) {
        // Check if registration is recent (valid for 24 hours)
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        const age = Date.now() - registration.registered_at.getTime();
        if (age > maxAge) {
            return false;
        }
        // Check if it has an expiry date and it's still valid
        if (registration.expires_at) {
            return registration.expires_at.getTime() > Date.now();
        }
        return true;
    }
    async getRegisteredIPNs() {
        try {
            const response = await this.client.get('/api/URLSetup/GetIpnList');
            return response.data || [];
        }
        catch (error) {
            console.error('Failed to get registered IPNs:', error);
            return [];
        }
    }
    // === CHECKOUT (DEPOSIT) OPERATIONS ===
    async createCheckout(request) {
        try {
            // Ensure we have a valid IPN ID
            const ipnId = await this.getValidIPNId();
            // Add the IPN ID to the request
            const checkoutRequestWithIPN = {
                ...request,
                notification_id: ipnId
            };
            console.log('Creating Pesapal checkout with IPN ID:', ipnId);
            const response = await this.client.post('/api/Transactions/SubmitOrderRequest', checkoutRequestWithIPN);
            if (response.data.error) {
                throw new Error(`Pesapal checkout error: ${response.data.error.message}`);
            }
            return response.data;
        }
        catch (error) {
            console.error('Pesapal checkout failed:', error);
            throw new Error(error.response?.data?.error?.message ||
                error.message ||
                'Checkout request failed');
        }
    }
    // === TRANSACTION STATUS ===
    async getTransactionStatus(orderTrackingId) {
        try {
            const response = await this.client.get(`/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`);
            return response.data;
        }
        catch (error) {
            console.error('Get transaction status failed:', error);
            throw new Error(error.response?.data?.error?.message ||
                error.message ||
                'Failed to get transaction status');
        }
    }
    // === PAYOUT OPERATIONS ===
    async createPayout(request) {
        try {
            const response = await this.client.post('/api/Transactions/Openfloat/SubmitDirectPayRequest', request);
            if (response.data.error) {
                throw new Error(`Pesapal payout error: ${response.data.error.message}`);
            }
            return response.data;
        }
        catch (error) {
            console.error('Pesapal payout failed:', error);
            throw new Error(error.response?.data?.error?.message ||
                error.message ||
                'Payout request failed');
        }
    }
    async getPayoutStatus(requestId) {
        try {
            const response = await this.client.get(`/api/Transactions/Openfloat/GetTransactionStatus?requestId=${requestId}`);
            return response.data;
        }
        catch (error) {
            console.error('Get payout status failed:', error);
            throw new Error(error.response?.data?.error?.message ||
                error.message ||
                'Failed to get payout status');
        }
    }
    // === REFUND OPERATIONS ===
    async processRefund(orderTrackingId, amount) {
        try {
            const requestData = {
                order_tracking_id: orderTrackingId
            };
            if (amount) {
                requestData.amount = amount;
            }
            const response = await this.client.post('/api/Transactions/RefundRequest', requestData);
            if (response.data.error) {
                throw new Error(`Pesapal refund error: ${response.data.error.message}`);
            }
            return response.data;
        }
        catch (error) {
            console.error('Pesapal refund failed:', error);
            throw new Error(error.response?.data?.error?.message ||
                error.message ||
                'Refund request failed');
        }
    }
    // === WEBHOOK VALIDATION ===
    validateWebhook(payload, signature) {
        try {
            const expectedSignature = crypto_1.default
                .createHmac('sha256', this.config.webhookSecret)
                .update(payload)
                .digest('hex');
            return crypto_1.default.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
        }
        catch (error) {
            console.error('Webhook validation failed:', error);
            return false;
        }
    }
    // === UTILITY METHODS ===
    generateMerchantReference(prefix = 'TXN') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    }
    validateMobileNumber(phoneNumber, countryCode = 'RW') {
        // Rwanda phone number validation
        if (countryCode === 'RW') {
            const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
            const rwandaRegex = /^(\+250|250|0)?(7[0-9]{8})$/;
            const match = cleanPhone.match(rwandaRegex);
            if (!match) {
                return {
                    isValid: false,
                    errors: ['Invalid Rwanda phone number format']
                };
            }
            const nationalNumber = match[2];
            const formattedNumber = '250' + nationalNumber;
            // Determine provider based on prefix
            let provider;
            const prefix = nationalNumber.substring(1, 3); // Get 2nd and 3rd digits
            if (['70', '71', '72', '73'].includes(prefix)) {
                provider = 'MTN';
            }
            else if (['75', '76'].includes(prefix)) {
                provider = 'AIRTEL';
            }
            else if (['78', '79'].includes(prefix)) {
                provider = 'TIGO';
            }
            else {
                return {
                    isValid: false,
                    errors: ['Unsupported mobile provider']
                };
            }
            return {
                isValid: true,
                formattedNumber,
                provider
            };
        }
        return {
            isValid: false,
            errors: ['Unsupported country code']
        };
    }
    validateBankAccount(accountNumber, bankCode) {
        // Basic bank account validation
        if (!accountNumber || accountNumber.length < 8 || accountNumber.length > 20) {
            return {
                isValid: false,
                errors: ['Account number must be 8-20 digits long']
            };
        }
        if (!/^\d+$/.test(accountNumber)) {
            return {
                isValid: false,
                errors: ['Account number must contain only digits']
            };
        }
        if (!bankCode || bankCode.length < 3) {
            return {
                isValid: false,
                errors: ['Invalid bank code']
            };
        }
        return { isValid: true };
    }
    formatAmount(amount) {
        // Ensure amount has max 2 decimal places
        return Math.round(amount * 100) / 100;
    }
    mapPesapalStatusToEscrowStatus(pesapalStatus) {
        switch (pesapalStatus.toUpperCase()) {
            case 'PENDING':
                return 'PENDING';
            case 'COMPLETED':
                return 'HELD';
            case 'FAILED':
            case 'INVALID':
                return 'FAILED';
            case 'REVERSED':
                return 'REFUNDED';
            default:
                return 'PENDING';
        }
    }
    // === ERROR HANDLING ===
    handlePesapalError(error) {
        if (error.response?.data?.error) {
            const pesapalError = error.response.data.error;
            return new Error(`Pesapal API Error (${pesapalError.code}): ${pesapalError.message}`);
        }
        if (error.response?.status === 401) {
            return new Error('Pesapal authentication failed');
        }
        if (error.response?.status === 429) {
            return new Error('Pesapal rate limit exceeded. Please try again later');
        }
        if (error.response?.status >= 500) {
            return new Error('Pesapal service temporarily unavailable');
        }
        return new Error(error.message || 'Unknown Pesapal error');
    }
    // === HEALTH CHECK ===
    async healthCheck() {
        try {
            const token = await this.getValidToken();
            if (!token) {
                return {
                    healthy: false,
                    message: 'Authentication failed'
                };
            }
            // Check IPN status
            let ipnStatus = 'unknown';
            try {
                await this.getValidIPNId();
                ipnStatus = 'registered';
            }
            catch (error) {
                ipnStatus = 'failed';
            }
            return {
                healthy: true,
                message: 'Pesapal service is healthy',
                ipnStatus
            };
        }
        catch (error) {
            return {
                healthy: false,
                message: error.message || 'Health check failed'
            };
        }
    }
    // === MANUAL IPN MANAGEMENT (for debugging) ===
    async forceRegisterIPN() {
        // Clear cached registration
        this.ipnRegistration = null;
        this.ipnRegistrationPromise = null;
        // Force re-registration
        return await this.getValidIPNId();
    }
    getCurrentIPNInfo() {
        return this.ipnRegistration;
    }
}
exports.PesapalService = PesapalService;
