// mock-backend/server.js
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// JWT configuration
const JWT_SECRET = 'agrimate_super_secret_key_12345';

// Mock Databases in-memory
const users = [];
const listings = [];
const offers = [];
const ratings = [];
const walletBalances = {}; // userId -> { settled, escrow }
const walletTransactions = []; // array of { id, userId, type, amount, status, description, createdAt }

// Seed Data helper to populate database for a farmer
const seedUserData = (userId) => {
  // 1. Initial wallet seed
  if (!walletBalances[userId]) {
    walletBalances[userId] = { settled: 1250.00, escrow: 750.00 };
    
    // Seed initial transactions
    walletTransactions.push(
      {
        id: `tx_1_${userId}`,
        userId,
        type: 'deposit',
        amount: 1250.00,
        status: 'completed',
        description: 'Maize crop listing contract fulfillment',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: `tx_2_${userId}`,
        userId,
        type: 'escrow',
        amount: 750.00,
        status: 'escrowed',
        description: 'Tomato crop listing bid acceptance',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      }
    );
  }

  // 2. Seed listings if empty
  const userListings = listings.filter(l => l.userId === userId);
  if (userListings.length === 0) {
    listings.push(
      {
        id: `listing_1_${userId}`,
        userId,
        cropName: 'Organic Tomato',
        quantity: 500,
        price: 1.5,
        grade: 'Grade A',
        description: 'Lush red organic tomatoes harvested this morning. Sweet and firm.',
        status: 'active',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: `listing_2_${userId}`,
        userId,
        cropName: 'Sweet Yellow Corn',
        quantity: 1200,
        price: 0.8,
        grade: 'Grade B',
        description: 'Golden sweet corn rows. Ideal for milling or direct purchase.',
        status: 'active',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      }
    );
  }

  // 3. Seed offers if empty
  const userOffers = offers.filter(o => o.farmerId === userId);
  if (userOffers.length === 0) {
    offers.push(
      {
        id: `offer_1_${userId}`,
        listingId: `listing_1_${userId}`,
        farmerId: userId,
        buyerName: 'Whole Foods Inc.',
        buyerId: 'buyer_101',
        quantity: 500,
        price: 1.5, // total 750
        status: 'pending',
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
      },
      {
        id: `offer_2_${userId}`,
        listingId: `listing_2_${userId}`,
        farmerId: userId,
        buyerName: 'Silo Grain Corp',
        buyerId: 'buyer_102',
        quantity: 800,
        price: 0.75, // total 600
        status: 'pending',
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
      }
    );
  }

  // 4. Seed ratings if empty
  const userRatings = ratings.filter(r => r.farmerId === userId);
  if (userRatings.length === 0) {
    ratings.push(
      {
        id: `rating_1_${userId}`,
        farmerId: userId,
        buyerName: 'Whole Foods Inc.',
        score: 5.0,
        comment: 'Tomatoes were extremely fresh and grade-conforming. Fast pickup coordination.',
        reply: null,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: `rating_2_${userId}`,
        farmerId: userId,
        buyerName: 'Organic Markets',
        score: 4.5,
        comment: 'Very good produce quality, but transporter had a slight delay. Will buy again.',
        reply: 'Thank you for the feedback! We are working with the transporter to optimize routes.',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      }
    );
  }
};

// Authentication Middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        console.error('JWT verify failed:', err);
        return res.sendStatus(403);
      }
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

// 1. Register User Endpoint
app.post('/api/users/registerUser', (req, res) => {
  console.log('Received registration request:', req.body);
  const { fullName, username, email, phoneNumber, region, password, role, vehicleNumber } = req.body;
  
  if (!fullName || !username || !email || !password || !role) {
    return res.status(400).json({ error: 'Missing required registration fields' });
  }

  if (role === 'transporter' && (!vehicleNumber || !vehicleNumber.trim())) {
    return res.status(400).json({ error: 'Vehicle plate number or ID is required for transporters' });
  }

  const existingUser = users.find(u => u.email === email || u.username === username);
  if (existingUser) {
    return res.status(400).json({ error: 'User with this email or username already exists' });
  }

  const newUser = {
    id: `user_${Date.now()}`,
    fullName,
    username,
    email,
    phoneNumber,
    region,
    password,
    role,
    vehicleNumber: role === 'transporter' ? vehicleNumber : undefined
  };

  users.push(newUser);
  console.log('Registered user successfully:', newUser);

  // Initialize and seed data for the farmer
  if (role === 'farmer') {
    seedUserData(newUser.id);
  }

  const token = jwt.sign(
    {
      id: newUser.id,
      fullName: newUser.fullName,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      region: newUser.region,
      vehicleNumber: newUser.vehicleNumber,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.status(201).json({ message: 'User registered successfully', token });
});

// 2. Login User Endpoint
app.post('/api/auth/login', (req, res) => {
  console.log('Received login request:', req.body);
  const { emailOrUsername, password } = req.body;

  if (!emailOrUsername || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  const user = users.find(
    u => (
      u.email === emailOrUsername.toLowerCase() || 
      u.username === emailOrUsername || 
      u.phoneNumber === emailOrUsername
    ) && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials. Please register first.' });
  }

  // Ensure data is seeded for logins
  if (user.role === 'farmer') {
    seedUserData(user.id);
  }

  const token = jwt.sign(
    {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      role: user.role,
      region: user.region,
      vehicleNumber: user.vehicleNumber,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  console.log('User logged in:', user.username);
  return res.json({ message: 'Login successful', token });
});

// 3. Google Sign-In Verification Endpoint
app.post('/api/auth/google', (req, res) => {
  const mockGoogleUser = {
    id: 'user_google_farmer_101',
    fullName: 'Google Farmer',
    username: 'google_farmer',
    email: 'google@agrimate.com',
    role: 'farmer',
    region: 'Central Valley, CA',
  };

  seedUserData(mockGoogleUser.id);

  const jwtToken = jwt.sign(mockGoogleUser, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ token: jwtToken });
});

// 4. Apple Sign-In Verification Endpoint
app.post('/api/auth/apple', (req, res) => {
  const mockAppleUser = {
    id: 'user_apple_farmer_102',
    fullName: 'Apple Farmer',
    username: 'apple_farmer',
    email: 'apple@agrimate.com',
    role: 'farmer',
    region: 'Bono East Region, GH',
  };

  seedUserData(mockAppleUser.id);

  const jwtToken = jwt.sign(mockAppleUser, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ token: jwtToken });
});


// ==========================================
// CORE FARMER ENDPOINTS (AUTHENTICATED)
// ==========================================

// --- LISTINGS ENDPOINTS ---

// Get Farmer Listings
app.get('/api/listings', authenticateJWT, (req, res) => {
  const userListings = listings.filter(l => l.userId === req.user.id && l.status !== 'deleted');
  return res.json(userListings);
});

// Create Listing
app.post('/api/listings', authenticateJWT, (req, res) => {
  const { cropName, quantity, price, grade, description } = req.body;
  if (!cropName || !quantity || !price || !grade) {
    return res.status(400).json({ error: 'Missing required crop fields' });
  }

  const newListing = {
    id: `listing_${Date.now()}`,
    userId: req.user.id,
    cropName,
    quantity: parseFloat(quantity),
    price: parseFloat(price),
    grade,
    description: description || '',
    status: 'active',
    createdAt: new Date().toISOString()
  };

  listings.push(newListing);
  console.log('Created listing:', newListing);
  return res.status(201).json(newListing);
});

// Edit Listing
app.put('/api/listings/:id', authenticateJWT, (req, res) => {
  const { id } = req.params;
  const { cropName, quantity, price, grade, description } = req.body;

  const listingIndex = listings.findIndex(l => l.id === id && l.userId === req.user.id);
  if (listingIndex === -1) {
    return res.status(404).json({ error: 'Listing not found or unauthorized' });
  }

  listings[listingIndex] = {
    ...listings[listingIndex],
    cropName: cropName || listings[listingIndex].cropName,
    quantity: quantity ? parseFloat(quantity) : listings[listingIndex].quantity,
    price: price ? parseFloat(price) : listings[listingIndex].price,
    grade: grade || listings[listingIndex].grade,
    description: description || listings[listingIndex].description,
  };

  return res.json(listings[listingIndex]);
});

// Delete Listing
app.delete('/api/listings/:id', authenticateJWT, (req, res) => {
  const { id } = req.params;
  const listingIndex = listings.findIndex(l => l.id === id && l.userId === req.user.id);
  
  if (listingIndex === -1) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  listings[listingIndex].status = 'deleted';
  return res.json({ success: true, message: 'Listing deleted successfully' });
});


// --- OFFERS & ESCROW ENDPOINTS ---

// Fetch Farmer Offers
app.get('/api/offers', authenticateJWT, (req, res) => {
  const farmerOffers = offers.filter(o => o.farmerId === req.user.id);
  return res.json(farmerOffers);
});

// Accept Offer -> Locks funds in Escrow
app.post('/api/offers/:id/accept', authenticateJWT, (req, res) => {
  const { id } = req.params;
  const offerIndex = offers.findIndex(o => o.id === id && o.farmerId === req.user.id);

  if (offerIndex === -1) {
    return res.status(404).json({ error: 'Offer not found' });
  }

  const offer = offers[offerIndex];
  if (offer.status !== 'pending') {
    return res.status(400).json({ error: 'Offer is already processed' });
  }

  offers[offerIndex].status = 'accepted';
  
  // Escrow Math
  const totalAmount = offer.price * offer.quantity;
  if (!walletBalances[req.user.id]) {
    walletBalances[req.user.id] = { settled: 0, escrow: 0 };
  }
  walletBalances[req.user.id].escrow += totalAmount;

  // Log Escrow Transaction
  walletTransactions.push({
    id: `tx_${Date.now()}`,
    userId: req.user.id,
    type: 'escrow',
    amount: totalAmount,
    status: 'escrowed',
    description: `Escrow payment locked for crop contract (${offer.buyerName})`,
    createdAt: new Date().toISOString()
  });

  // Update associated listing status to indicate deal is made
  const listingIndex = listings.findIndex(l => l.id === offer.listingId);
  if (listingIndex !== -1) {
    listings[listingIndex].status = 'sold';
  }

  console.log(`Offer accepted. ${totalAmount} locked in escrow.`);
  return res.json(offers[offerIndex]);
});

// Reject Offer
app.post('/api/offers/:id/reject', authenticateJWT, (req, res) => {
  const { id } = req.params;
  const offerIndex = offers.findIndex(o => o.id === id && o.farmerId === req.user.id);

  if (offerIndex === -1) {
    return res.status(404).json({ error: 'Offer not found' });
  }

  offers[offerIndex].status = 'rejected';
  return res.json(offers[offerIndex]);
});

// Fulfill Order -> Marks as Ready for Pickup & releases escrow to settled balance
app.post('/api/orders/:id/fulfill', authenticateJWT, (req, res) => {
  const { id } = req.params; // offer/contract id
  const offerIndex = offers.findIndex(o => o.id === id && o.farmerId === req.user.id);

  if (offerIndex === -1) {
    return res.status(404).json({ error: 'Order contract not found' });
  }

  const offer = offers[offerIndex];
  if (offer.status !== 'accepted') {
    return res.status(400).json({ error: 'Contract must be accepted before fulfillment' });
  }

  offers[offerIndex].status = 'fulfilled'; // Ready for pickup

  const totalAmount = offer.price * offer.quantity;
  if (walletBalances[req.user.id]) {
    // Release from escrow to settled balance
    walletBalances[req.user.id].escrow = Math.max(0, walletBalances[req.user.id].escrow - totalAmount);
    walletBalances[req.user.id].settled += totalAmount;

    // Log Settlement Transaction
    walletTransactions.push({
      id: `tx_${Date.now()}`,
      userId: req.user.id,
      type: 'deposit',
      amount: totalAmount,
      status: 'completed',
      description: `Escrow released. Funds settled for crop delivery (${offer.buyerName})`,
      createdAt: new Date().toISOString()
    });
  }

  console.log(`Order fulfilled. Released ${totalAmount} from escrow to settled balance.`);
  return res.json(offers[offerIndex]);
});


// --- WALLET & MOMO ENDPOINTS ---

// Fetch Wallet Balance and History
app.get('/api/wallet', authenticateJWT, (req, res) => {
  const balance = walletBalances[req.user.id] || { settled: 0, escrow: 0 };
  const history = walletTransactions.filter(t => t.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.json({ balance, history });
});

// Withdraw Funds via MoMo
app.post('/api/wallet/withdraw', authenticateJWT, (req, res) => {
  const { amount, momoNumber } = req.body;
  
  if (!amount || !momoNumber) {
    return res.status(400).json({ error: 'Withdrawal amount and MoMo number are required' });
  }

  const withdrawAmount = parseFloat(amount);
  const balance = walletBalances[req.user.id] || { settled: 0, escrow: 0 };

  if (balance.settled < withdrawAmount) {
    return res.status(400).json({ error: 'Insufficient settled balance for this withdrawal' });
  }

  // Deduct settled balance
  walletBalances[req.user.id].settled -= withdrawAmount;

  // Log withdrawal transaction
  const tx = {
    id: `tx_withdraw_${Date.now()}`,
    userId: req.user.id,
    type: 'withdrawal',
    amount: withdrawAmount,
    status: 'completed',
    description: `Mobile Money withdrawal to number: ${momoNumber}`,
    createdAt: new Date().toISOString()
  };

  walletTransactions.push(tx);
  console.log(`MoMo Withdrawal complete: ${withdrawAmount} to ${momoNumber}`);
  return res.json({ balance: walletBalances[req.user.id], transaction: tx });
});


// --- RATINGS ENDPOINTS ---

// Get Farmer Reviews
app.get('/api/ratings', authenticateJWT, (req, res) => {
  const farmerReviews = ratings.filter(r => r.farmerId === req.user.id);
  const totalScore = farmerReviews.reduce((sum, r) => sum + r.score, 0);
  const averageRating = farmerReviews.length > 0 ? (totalScore / farmerReviews.length).toFixed(1) : '5.0';

  return res.json({ reviews: farmerReviews, averageRating });
});

// Reply to review
app.post('/api/ratings/:id/reply', authenticateJWT, (req, res) => {
  const { id } = req.params;
  const { replyText } = req.body;

  if (!replyText || !replyText.trim()) {
    return res.status(400).json({ error: 'Reply text is required' });
  }

  const reviewIndex = ratings.findIndex(r => r.id === id && r.farmerId === req.user.id);
  if (reviewIndex === -1) {
    return res.status(404).json({ error: 'Review not found' });
  }

  ratings[reviewIndex].reply = replyText.trim();
  console.log('Submitted review reply:', ratings[reviewIndex]);
  return res.json(ratings[reviewIndex]);
});


// --- ANALYTICS ENDPOINTS ---

// Fetch Farmer Metrics
app.get('/api/analytics', authenticateJWT, (req, res) => {
  const farmerId = req.user.id;
  const activeListings = listings.filter(l => l.userId === farmerId && l.status === 'active').length;
  const soldListings = listings.filter(l => l.userId === farmerId && l.status === 'sold').length;
  
  // Calculate completed revenue from transactions
  const userTxs = walletTransactions.filter(t => t.userId === farmerId);
  const grossRevenue = userTxs
    .filter(t => t.type === 'deposit' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);

  // Return performance metrics
  return res.json({
    activeListings,
    soldListings,
    totalListings: activeListings + soldListings,
    grossRevenue: grossRevenue.toFixed(2),
    avgDeliveryTime: '2.4 days',
    offerAcceptRate: '85%'
  });
});

// Fetch Farmer Dashboard Summary
app.get('/api/dashboard', authenticateJWT, (req, res) => {
  const farmerId = req.user.id;
  const activeListingsCount = listings.filter(l => l.userId === farmerId && l.status === 'active').length;
  const pendingOffersCount = offers.filter(o => o.farmerId === farmerId && o.status === 'pending').length;
  const balance = walletBalances[farmerId] || { settled: 0, escrow: 0 };
  
  const farmerReviews = ratings.filter(r => r.farmerId === farmerId);
  const totalScore = farmerReviews.reduce((sum, r) => sum + r.score, 0);
  const averageRating = farmerReviews.length > 0 ? (totalScore / farmerReviews.length).toFixed(1) : '5.0';

  return res.json({
    activeListingsCount,
    pendingOffersCount,
    settledBalance: balance.settled,
    escrowBalance: balance.escrow,
    ratingScore: parseFloat(averageRating)
  });
});


// Start server
const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock AgriMate backend server running on http://0.0.0.0:${PORT}`);
});
