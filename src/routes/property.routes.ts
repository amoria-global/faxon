import { Router } from 'express';
import { PropertyController } from '../controllers/property.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateProperty } from '../middleware/property.middleware';

const router = Router();
const propertyController = new PropertyController();

// --- PUBLIC PROPERTY ROUTES ---
// Search and browse properties
router.get('/search', propertyController.searchProperties);
router.get('/featured', propertyController.getFeaturedProperties);
router.get('/suggestions/locations', propertyController.getLocationSuggestions);
router.get('/:id', propertyController.getPropertyById);
router.get('/:id/similar', propertyController.getSimilarProperties);
router.get('/:id/reviews', propertyController.getPropertyReviews);

// --- PROTECTED ROUTES (Authentication Required) ---
router.use(authenticate); // All routes below require authentication

// --- HOST PROPERTY MANAGEMENT ---
// CRUD operations for properties
router.post('/', validateProperty, propertyController.createProperty);
router.put('/:id', propertyController.updateProperty);
router.delete('/:id', propertyController.deleteProperty);

// Get host's properties
router.get('/host/dashboard', propertyController.getHostDashboard);
router.get('/host/my-properties', propertyController.getMyProperties);

// Property status management
router.patch('/:id/activate', propertyController.activateProperty);
router.patch('/:id/deactivate', propertyController.deactivateProperty);

// --- MEDIA MANAGEMENT ---
router.post('/:id/images', propertyController.uploadPropertyImages);
router.delete('/:id/images', propertyController.removePropertyImage);

// --- BOOKING MANAGEMENT ---
router.post('/bookings', propertyController.createBooking);
router.get('/:id/bookings', propertyController.getPropertyBookings);

// --- REVIEW MANAGEMENT ---
router.post('/:id/reviews', propertyController.createReview);

export default router;