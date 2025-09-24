// routes/email.test.routes.ts
import express from 'express';
import { BrevoMailingService } from '../utils/brevo.auth';

const router = express.Router();

// Test route for sending welcome email
router.post('/test-welcome', async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: firstName, lastName, email'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    const brevoService = new BrevoMailingService();
    
    const context = {
      user: {
        firstName,
        lastName,
        email,
        id: Date.now() // Use timestamp as fake ID for testing
      },
      company: {
        name: 'Jambolush',
        website: 'https://jambolush.com',
        supportEmail: 'support@jambolush.com',
        logo: 'https://jambolush.com/logo.png'
      }
    };

    console.log('🧪 Sending test welcome email to:', email);
    await brevoService.sendWelcomeEmail(context);

    res.json({
      success: true,
      message: `Welcome email sent successfully to ${email}`,
      timestamp: new Date().toISOString()
    });

  } catch (error:  any) {
    console.error('❌ Email test error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send email',
      error: error.message
    });
  }
});

// Test route for sending email verification
router.post('/test-verification', async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: firstName, lastName, email'
      });
    }

    const brevoService = new BrevoMailingService();
    
    const context = {
      user: {
        firstName,
        lastName,
        email,
        id: Date.now()
      },
      company: {
        name: 'Jambolush',
        website: 'https://jambolush.com',
        supportEmail: 'support@jambolush.com',
        logo: 'https://jambolush.com/logo.png'
      },
      verification: {
        code: Math.floor(100000 + Math.random() * 900000).toString(), // Random 6-digit code
        expiresIn: '10 minutes'
      }
    };

    console.log('🧪 Sending test verification email to:', email);
    await brevoService.sendEmailVerification(context);

    res.json({
      success: true,
      message: `Verification email sent successfully to ${email}`,
      verificationCode: context.verification.code, // For testing only
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Email verification test error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification email',
      error: error.message
    });
  }
});

// Get email service status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Email service is running',
    timestamp: new Date().toISOString(),
    availableTests: [
      'POST /test-welcome - Send welcome email',
      'POST /test-verification - Send verification email',
      'GET /status - Check service status'
    ]
  });
});

export default router;