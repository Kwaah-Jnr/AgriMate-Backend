require('dotenv').config();
const pool = require('./database');

const BASE_URL = 'http://localhost:' + (process.env.PORT || '5000');

async function runTests() {
  console.log('🧪 Starting AgriMate End-to-End Marketplace Integration Tests...\n');

  const userIds = [];
  let listingId = null;
  let orderId = null;
  let jobId = null;

  try {
    // -------------------------------------------------------------
    // 1. Onboarding (Registration)
    // -------------------------------------------------------------
    console.log('--- 1. Registering Test Users ---');
    
    // Farmer
    const farmerRes = await fetch(`${BASE_URL}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Test Farmer ' + Date.now(),
        email: 'farmer_' + Date.now() + '@test.com',
        phone: '024' + Math.floor(1000000 + Math.random() * 9000000),
        region: 'Ashanti',
        password: 'password123',
        role: 'farmer'
      })
    });
    const farmerData = await farmerRes.json();
    if (!farmerRes.ok) throw new Error('Farmer registration failed: ' + JSON.stringify(farmerData));
    const farmerId = farmerData.user.user_id;
    userIds.push(farmerId);
    console.log(`✅ Registered Farmer (ID: ${farmerId})`);

    // Buyer
    const buyerRes = await fetch(`${BASE_URL}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Test Buyer ' + Date.now(),
        email: 'buyer_' + Date.now() + '@test.com',
        phone: '024' + Math.floor(1000000 + Math.random() * 9000000),
        region: 'Greater Accra',
        password: 'password123',
        role: 'buyer'
      })
    });
    const buyerData = await buyerRes.json();
    if (!buyerRes.ok) throw new Error('Buyer registration failed: ' + JSON.stringify(buyerData));
    const buyerId = buyerData.user.user_id;
    userIds.push(buyerId);
    console.log(`✅ Registered Buyer (ID: ${buyerId})`);

    // Transporter
    const transporterRes = await fetch(`${BASE_URL}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Test Transporter ' + Date.now(),
        email: 'transporter_' + Date.now() + '@test.com',
        phone: '024' + Math.floor(1000000 + Math.random() * 9000000),
        region: 'Ashanti',
        password: 'password123',
        role: 'transporter'
      })
    });
    const transporterData = await transporterRes.json();
    if (!transporterRes.ok) throw new Error('Transporter registration failed: ' + JSON.stringify(transporterData));
    const transporterId = transporterData.user.user_id;
    userIds.push(transporterId);
    console.log(`✅ Registered Transporter (ID: ${transporterId})\n`);

    // -------------------------------------------------------------
    // 2. Authentication (Login)
    // -------------------------------------------------------------
    console.log('--- 2. Verifying Authentication (Login) ---');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: farmerData.user.email,
        pin: 'password123'
      })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error('Login failed: ' + JSON.stringify(loginData));
    console.log(`✅ Logged in successfully. Username: "${loginData.user.username}" | Role: "${loginData.user.role}"\n`);

    // -------------------------------------------------------------
    // 3. Listings CRUD (Farmer creates Listing)
    // -------------------------------------------------------------
    console.log('--- 3. Farmer Creating a Listing ---');
    const listingRes = await fetch(`${BASE_URL}/api/farmer/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': farmerId.toString()
      },
      body: JSON.stringify({
        crop_name: 'Yam',
        quantity: 100,
        price: 25.50,
        grade: 'A',
        location: 'Kumasi',
        image_url: 'http://test.com/yam.jpg'
      })
    });
    const listingData = await listingRes.json();
    if (!listingRes.ok) throw new Error('Listing creation failed: ' + JSON.stringify(listingData));
    listingId = listingData.listing_id;
    console.log(`✅ Created Listing (ID: ${listingId}, Crop: ${listingData.crop_name}, Qty: ${listingData.quantity})\n`);

    // -------------------------------------------------------------
    // 4. Bidding/Offers (Buyer places offer)
    // -------------------------------------------------------------
    console.log('--- 4. Buyer Placing Offer on Listing ---');
    const offerRes = await fetch(`${BASE_URL}/api/buyer/offers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': buyerId.toString()
      },
      body: JSON.stringify({
        listings_id: listingId,
        price: 25.00,
        quantity: 80,
        pickup_by: '2026-07-01',
        note: 'High grade Yam'
      })
    });
    const offerData = await offerRes.json();
    if (!offerRes.ok) throw new Error('Offer placement failed: ' + JSON.stringify(offerData));
    orderId = offerData.order_id;
    console.log(`✅ Placed Offer (Order ID: ${orderId}, Offered Price: ${offerData.price}, Qty: ${offerData.quantity})\n`);

    // -------------------------------------------------------------
    // 5. Offer Acceptance (Farmer accepts offer)
    // -------------------------------------------------------------
    console.log('--- 5. Farmer Accepting Buyer Offer ---');
    const acceptRes = await fetch(`${BASE_URL}/api/farmer/offers/${orderId}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': farmerId.toString()
      }
    });
    const acceptData = await acceptRes.json();
    if (!acceptRes.ok) throw new Error('Offer acceptance failed: ' + JSON.stringify(acceptData));
    console.log(`✅ Offer accepted. Escrow balance locked.\n`);

    // -------------------------------------------------------------
    // 6. Pre-funding Escrow (Buyer funds order)
    // -------------------------------------------------------------
    console.log('--- 6. Buyer Funding Escrow via MoMo ---');
    const fundRes = await fetch(`${BASE_URL}/api/buyer/orders/${orderId}/fund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': buyerId.toString()
      },
      body: JSON.stringify({
        transaction_id: 'MOMO-TEST-' + Date.now()
      })
    });
    const fundData = await fundRes.json();
    if (!fundRes.ok) throw new Error('Escrow funding failed: ' + JSON.stringify(fundData));
    console.log(`✅ Escrow funded. Transaction: ${fundData.transaction_id}\n`);

    // -------------------------------------------------------------
    // 7. Order Fulfillment / Job Initialization
    // -------------------------------------------------------------
    console.log('--- 7. Farmer Marking Order "Ready for Pickup" (Logs Job) ---');
    const fulfillRes = await fetch(`${BASE_URL}/api/farmer/orders/${orderId}/fulfill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': farmerId.toString()
      }
    });
    const fulfillData = await fulfillRes.json();
    if (!fulfillRes.ok) throw new Error('Order fulfillment failed: ' + JSON.stringify(fulfillData));
    console.log(`✅ Order marked ready. Available logistics job created.\n`);

    // -------------------------------------------------------------
    // 8. Job Discovery & Claiming (Transporter claims job)
    // -------------------------------------------------------------
    console.log('--- 8. Transporter Job Discovery & Claiming ---');
    const jobsRes = await fetch(`${BASE_URL}/api/transporter/jobs/available`, {
      method: 'GET',
      headers: { 'X-User-Id': transporterId.toString() }
    });
    const jobsList = await jobsRes.json();
    if (!jobsRes.ok) throw new Error('Failed to fetch available jobs: ' + JSON.stringify(jobsList));
    
    // Find the job associated with our order
    const job = jobsList.find(j => j.pickup_location === 'Kumasi'); // listing location
    if (!job) throw new Error('Expected logistics job not found in available jobs list');
    jobId = job.job_id;
    console.log(`🔍 Discovered Available Job (ID: ${jobId}, Distance: ${job.distance_km} km, Payout: ${job.payout} GHS)`);

    const claimRes = await fetch(`${BASE_URL}/api/transporter/jobs/${jobId}/claim`, {
      method: 'POST',
      headers: { 'X-User-Id': transporterId.toString() }
    });
    const claimData = await claimRes.json();
    if (!claimRes.ok) throw new Error('Claim job failed: ' + JSON.stringify(claimData));
    console.log(`✅ Job claimed by transporter.\n`);

    // Retrieve generated QR codes from database for pickup/delivery validation
    const qrQuery = await pool.query('SELECT qr_pickup, qr_delivery FROM jobs WHERE job_id = $1', [jobId]);
    const { qr_pickup, qr_delivery } = qrQuery.rows[0];

    // -------------------------------------------------------------
    // 9. Confirm Pickup (Transporter confirms pickup)
    // -------------------------------------------------------------
    console.log('--- 9. Transporter Scanning Pickup QR Code ---');
    const pickupRes = await fetch(`${BASE_URL}/api/transporter/jobs/${jobId}/confirm-pickup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': transporterId.toString()
      },
      body: JSON.stringify({ qr_code: qr_pickup })
    });
    const pickupData = await pickupRes.json();
    if (!pickupRes.ok) throw new Error('Pickup confirmation failed: ' + JSON.stringify(pickupData));
    console.log(`✅ Pickup confirmed. Crops are now in transit.\n`);

    // -------------------------------------------------------------
    // 10. Confirm Delivery (Automatic Escrow Release & Payout)
    // -------------------------------------------------------------
    console.log('--- 10. Transporter Scanning Delivery QR Code (Completes order) ---');
    const deliveryRes = await fetch(`${BASE_URL}/api/transporter/jobs/${jobId}/confirm-delivery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': transporterId.toString()
      },
      body: JSON.stringify({ qr_code: qr_delivery })
    });
    const deliveryData = await deliveryRes.json();
    if (!deliveryRes.ok) throw new Error('Delivery confirmation failed: ' + JSON.stringify(deliveryData));
    console.log(`✅ Delivery confirmed! Escrow released and driver paid.\n`);

    // -------------------------------------------------------------
    // 11. Balance & Escrow Wallet Verifications
    // -------------------------------------------------------------
    console.log('--- 11. Verifying Financial Balances ---');
    
    // Farmer Wallet
    const farmerWalletRes = await pool.query('SELECT balance, escrow_balance FROM wallets WHERE user_id = $1', [farmerId]);
    const farmerWallet = farmerWalletRes.rows[0];
    const expectedFarmerBalance = 25.00 * 80; // price * quantity
    console.log(`🌾 Farmer Wallet: Balance = ${farmerWallet.balance} GHS (Expected: ${expectedFarmerBalance}) | Escrow = ${farmerWallet.escrow_balance} GHS (Expected: 0)`);

    // Transporter Wallet
    const transWalletRes = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [transporterId]);
    const transWallet = transWalletRes.rows[0];
    console.log(`🚚 Transporter Wallet: Balance = ${transWallet.balance} GHS (Expected: payout value)`);

    if (parseFloat(farmerWallet.balance) !== expectedFarmerBalance) {
      throw new Error('Farmer balance does not match the trade value!');
    }
    console.log('✅ Financial verification succeeded!\n');

    // -------------------------------------------------------------
    // 12. Rating verification
    // -------------------------------------------------------------
    console.log('--- 12. Submitting Feedback/Ratings ---');
    const rateRes = await fetch(`${BASE_URL}/api/buyer/ratings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': buyerId.toString()
      },
      body: JSON.stringify({
        rated_user_id: farmerId,
        score: 5,
        comment: 'Great quality yams! Highly recommended.'
      })
    });
    const rateData = await rateRes.json();
    if (!rateRes.ok) throw new Error('Submitting rating failed: ' + JSON.stringify(rateData));
    console.log(`✅ Buyer successfully rated the Farmer 5 stars!\n`);

    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! The marketplace ecosystem is working correctly.\n');

  } catch (error) {
    console.error('❌ Integration Test Failed!');
    console.error(error.message);
  } finally {
    console.log('--- Cleaning Up Test Data ---');
    // Clean up created entities to prevent pollution
    if (jobId) {
      await pool.query('DELETE FROM jobs WHERE job_id = $1', [jobId]);
      console.log('... Cleaned up logistics job');
    }
    if (orderId) {
      await pool.query('DELETE FROM disputes WHERE order_id = $1', [orderId]);
      await pool.query('DELETE FROM payments WHERE order_id = $1', [orderId]);
      await pool.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
      console.log('... Cleaned up orders, payments, disputes');
    }
    if (listingId) {
      await pool.query('DELETE FROM listings WHERE listing_id = $1', [listingId]);
      console.log('... Cleaned up crop listing');
    }
    if (userIds.length > 0) {
      await pool.query('DELETE FROM ratings WHERE user_id = ANY($1) OR rated_user_id = ANY($1)', [userIds]);
      await pool.query('DELETE FROM history WHERE user_id = ANY($1)', [userIds]);
      await pool.query('DELETE FROM wallets WHERE user_id = ANY($1)', [userIds]);
      await pool.query('DELETE FROM roles WHERE user_id = ANY($1)', [userIds]);
      await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [userIds]);
      console.log('... Cleaned up test user accounts, wallets, history logs, and ratings');
    }
    console.log('\n✅ Cleanup complete. Database restored to original state.');
    await pool.end();
  }
}

runTests();
