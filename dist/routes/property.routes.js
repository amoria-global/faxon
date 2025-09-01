"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
//src/routes/property.routes.ts
const express_1 = require("express");
const property_controller_1 = require("../controllers/property.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const property_middleware_1 = require("../middleware/property.middleware");
const router = (0, express_1.Router)();
const propertyController = new property_controller_1.PropertyController();
// --- PUBLIC PROPERTY ROUTES ---
// Search and browse properties
router.get('/', propertyController.searchProperties);
router.get('/search', propertyController.searchProperties);
router.get('/featured', propertyController.getFeaturedProperties);
router.get('/suggestions/locations', propertyController.getLocationSuggestions);
router.get('/:id', propertyController.getPropertyById);
router.get('/:id/similar', propertyController.getSimilarProperties);
router.get('/:id/reviews', propertyController.getPropertyReviews);
// --- PROTECTED ROUTES (Authentication Required) ---
router.use(auth_middleware_1.authenticate); // All routes below require authentication
// --- HOST PROPERTY MANAGEMENT ---
// CRUD operations for properties
router.post('/', property_middleware_1.validateProperty, propertyController.createProperty);
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
router.post('/reviews', propertyController.createReview);
exports.default = router;
