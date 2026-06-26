# AGRIMATE — Backend Documentation

This document provides a detailed technical overview of the AGRIMATE Express.js backend API and PostgreSQL database schema.

---

## 🏛️ Architecture Overview

The backend is built as a lightweight, modular **RESTful API** using the following technology stack:
*   **Runtime**: Node.js
*   **Web Framework**: Express.js
*   **Database**: PostgreSQL (hosted on Supabase)
*   **Database Driver**: `pg` (node-postgres Connection Pool)
*   **Security & Encryption**: `bcryptjs` for hashing passwords
*   **RBAC (Role-Based Access Control)**: Custom middleware validating user identity and roles via headers

---

## 🗄️ Database Configuration & Schema

The database configuration is managed in **[database.js](file:///c:/Users/pc/OneDrive/Desktop/AgriMate%20APP/AgriMate-backend/database.js)**, which initializes a connection pool:

```javascript
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});
```

### Core Entity Tables

#### 1. `users` Table
Stores primary user credentials and profile metadata.
*   `user_id` (SERIAL, PRIMARY KEY): Unique auto-incrementing ID.
*   `username` (VARCHAR(50), UNIQUE, NOT NULL): Holds the user's login username or full name.
*   `phone_number` (VARCHAR(20), UNIQUE, NULL): The user's mobile number.
*   `email` (VARCHAR(255), UNIQUE, NULL): Email address.
*   `pin` (VARCHAR(255), NOT NULL): The encrypted password or PIN hash. *(Resized to 255 chars to safely support full bcrypt hashes)*.
*   `region` (VARCHAR(50), NULL): Registered district or administrative region (e.g. `'Ashanti'`).
*   `is_active` (BOOLEAN, DEFAULT true): Soft delete flag.
*   `created_at` / `updated_at` (TIMESTAMP): Records of row creation and updates.

#### 2. `roles` Table
Assigns marketplace roles to users.
*   `role_id` (SERIAL, PRIMARY KEY)
*   `user_id` (INT, FOREIGN KEY referencing `users(user_id)` ON DELETE CASCADE)
*   `role` (user_role): An ENUM type containing `'farmer'`, `'buyer'`, and `'transporter'`.

#### 3. `listings` Table
Stores crop listings posted by farmers.
*   `listing_id` (SERIAL, PRIMARY KEY)
*   `user_id` (INT, FOREIGN KEY referencing `users(user_id)` ON DELETE CASCADE): The farmer.
*   `crop_name` (VARCHAR(100), NOT NULL): Name of the crop (e.g. `'Maize'`).
*   `quantity` (INT, NOT NULL): Available quantity in bags.
*   `price` (DECIMAL(10,2), NOT NULL): Price per bag in GHS.
*   `grade` (VARCHAR(1), CHECK `'A'`, `'B'`, `'C'`): Crop quality grade.
*   `status` (VARCHAR(20), DEFAULT `'open'`): Listing status (e.g. `'open'`, `'accepted'`, `'in_transit'`, `'delivered'`).
*   `location` (VARCHAR(100), NULL): Location of crop pickup.
*   `image_url` (TEXT, NULL): URL to the crop listing image.
*   `created_at` (TIMESTAMP): Creation time.

#### 4. `orders` Table
Coordinates bids, offers, and purchase orders.
*   `order_id` (SERIAL, PRIMARY KEY)
*   `buyer_id` (INT, FOREIGN KEY referencing `users(user_id)` ON DELETE CASCADE)
*   `listings_id` (INT, FOREIGN KEY referencing `listings(listing_id)` ON DELETE CASCADE)
*   `price` (DECIMAL(10,2)): Offered price per bag.
*   `quantity` (INT): Offered quantity in bags.
*   `status` (VARCHAR(20), DEFAULT `'pending'`): Bid/order status (e.g. `'pending'`, `'accepted'`, `'rejected'`, `'ready_for_pickup'`, `'picked_up'`, `'delivered'`).
*   `pickup_by` (VARCHAR(100)): Target date/time for logistics pickup.
*   `note` (TEXT): Bid notes or quality terms.
*   `created_at` / `updated_at` (TIMESTAMP)

#### 5. `wallets` Table
Maintains users' balance ledgers and escrow safety.
*   `wallet_id` (SERIAL, PRIMARY KEY)
*   `user_id` (INT, UNIQUE, FOREIGN KEY referencing `users(user_id)` ON DELETE CASCADE)
*   `balance` (DECIMAL(10,2), DEFAULT 0.00): Settled withdrawable funds.
*   `escrow_balance` (DECIMAL(10,2), DEFAULT 0.00): Active escrow-locked funds.
*   `created_at` / `updated_at` (TIMESTAMP)

#### 6. `ratings` Table
*   `rating_id` (SERIAL, PRIMARY KEY)
*   `user_id` (INT, FOREIGN KEY referencing `users(user_id)`): The rater.
*   `rated_user_id` (INT, FOREIGN KEY referencing `users(user_id)`): The ratee.
*   `score` (INT, CHECK 1-5)
*   `comment` (TEXT)
*   `reply` (TEXT, NULL): Optional response from the ratee.
*   `created_at` (TIMESTAMP)

#### 7. `disputes` Table
*   `dispute_id` (SERIAL, PRIMARY KEY)
*   `order_id` (INT, FOREIGN KEY referencing `orders(order_id)` ON DELETE CASCADE)
*   `buyer_id` (INT, FOREIGN KEY referencing `users(user_id)` ON DELETE CASCADE): The buyer raising the dispute.
*   `reason` (TEXT): The reason for the dispute.
*   `status` (VARCHAR(20), DEFAULT `'open'`): Dispute status (`'open'`, `'resolved'`, `'refunded'`).
*   `resolved_at` (TIMESTAMP, NULL): Resolution timestamp.
*   `created_at` (TIMESTAMP)

#### 8. `jobs` Table
Coordinates logistics, pickup/delivery status, payouts, and QR code handoffs.
*   `job_id` (SERIAL, PRIMARY KEY)
*   `order_id` (INT, UNIQUE, FOREIGN KEY referencing `orders(order_id)` ON DELETE CASCADE): The associated order.
*   `transporter_id` (INT, FOREIGN KEY referencing `users(user_id)` ON DELETE SET NULL): Assigned driver/transporter.
*   `distance_km` (DECIMAL(10,2)): Estimated pickup-to-delivery distance.
*   `payout` (DECIMAL(10,2)): Distance-based driver payout (e.g. 2 GHS/km).
*   `status` (VARCHAR(20), DEFAULT `'available'`): Logistics status (e.g. `'available'`, `'assigned'`, `'picked_up'`, `'delivered'`).
*   `qr_pickup` (VARCHAR(100)): Random unique token to confirm pickup.
*   `qr_delivery` (VARCHAR(100)): Random unique token to confirm delivery.
*   `created_at` / `updated_at` (TIMESTAMP)

---

## 🔒 Authentication & Role Enforcement Middleware

The backend uses **[authMiddleware.js](file:///c:/Users/pc/OneDrive/Desktop/AgriMate%20APP/AgriMate-backend/middleware/authMiddleware.js)** to authenticate and authorize REST operations.

*   **Authentication**: Expects an `X-User-Id` request header containing the client's database integer user ID.
*   **Role Enforcement**: Utilizes a factory function `requireRole(allowedRole)` to ensure only authenticated users belonging to specific roles (e.g. `'farmer'`, `'buyer'`, `'transporter'`) can access targeted endpoints.

---

## 🔌 API Endpoints & Routes

### 1. General & System Status

#### `GET /`
Returns a simple text greeting.
*   **Response**: `"Welcome to AgriMate API!"`

#### `GET /test-db`
Queries the database to verify active connectivity.
*   **Success Response** (200 OK):
    ```json
    {
      "message": "Database connection is working!",
      "time": "2026-06-26T00:00:00.000Z"
    }
    ```

---

### 2. User Authentication & Registration

#### `POST /api/users/register`
Registers a new user and records their profile and role in a database transaction block.

*   **Request Payload**:
    ```json
    {
      "full_name": "Akosua Mensah",
      "email": "akosua@farm.gh",
      "phone": "0240000000",
      "region": "Ashanti",
      "password": "secure_password",
      "role": "farmer"
    }
    ```
    *Note: Role names are converted to lowercase automatically.*
*   **Success Response** (201 Created):
    ```json
    {
      "message": "User and Role registered successfully!",
      "user": {
        "user_id": 12,
        "username": "Akosua Mensah",
        "email": "akosua@farm.gh",
        "phone_number": "0240000000",
        "region": "Ashanti",
        "role": "farmer"
      }
    }
    ```

#### `POST /api/auth/login`
Authenticates a user against their stored credentials.

*   **Request Payload**:
    ```json
    {
      "identifier": "akosua@farm.gh",
      "pin": "secure_password"
    }
    ```
    *Note: `identifier` accepts `email`, `phone_number`, or `username`.*
*   **Success Response** (200 OK):
    ```json
    {
      "message": "Login successful!",
      "user": {
        "id": 12,
        "username": "Akosua Mensah",
        "phone_number": "0240000000",
        "email": "akosua@farm.gh",
        "region": "Ashanti",
        "role": "farmer"
      }
    }
    ```

---

### 3. Farmer Section Endpoints (`/api/farmer/*`)
*All farmer routes require `X-User-Id` header authentication and `'farmer'` role membership.*

#### `POST /api/farmer/listings`
Creates a crop listing.
*   **Request Body**:
    ```json
    {
      "crop_name": "Maize",
      "quantity": 50,
      "price": 320.00,
      "grade": "A",
      "location": "Offinso",
      "image_url": "http://example.com/maize.jpg"
    }
    ```
*   **Success Response** (201 Created): Returns the listing record from the database.

#### `PUT /api/farmer/listings/:id`
Updates parameters of an owned listing.
*   **Request Body**: Any listing fields (e.g. `price`, `quantity`, `status`).
*   **Success Response** (200 OK): Returns the updated listing record.

#### `DELETE /api/farmer/listings/:id`
Deletes an owned listing.
*   **Success Response** (200 OK): `{"message": "Listing deleted successfully."}`

#### `GET /api/farmer/listings`
Retrieves listings owned by the logged-in farmer.
*   **Query Parameters (Optional)**: `status`, `limit` (default 10), `offset` (default 0).
*   **Success Response** (200 OK): Returns array of listing records.

#### `GET /api/farmer/market-insights`
Calculates average, minimum, and maximum market prices per crop name.
*   **Success Response** (200 OK):
    ```json
    [
      {
        "crop_name": "Maize",
        "average_price": "330.00",
        "minimum_price": "330.00",
        "maximum_price": "330.00",
        "count": "1"
      }
    ]
    ```

#### `GET /api/farmer/offers`
Retrieves buyer bids/offers placed on the farmer's listings.
*   **Success Response** (200 OK): Returns array of offers including buyer name, phone, offer price, quantity, status, and pickup date.

#### `POST /api/farmer/offers/:id/accept`
Accepts a buyer offer. Marks the order and listing status as `'accepted'`, creates a pending payment tracking record, and adds the order value to the farmer's escrow balance.
*   **Success Response** (200 OK): `{"message": "Offer accepted successfully. Funds held in escrow.", "order_id": "1"}`

#### `POST /api/farmer/offers/:id/reject`
Rejects a buyer offer, setting order status to `'rejected'`.
*   **Success Response** (200 OK): `{"message": "Offer rejected successfully."}`

#### `POST /api/farmer/orders/:id/fulfill`
Marks an accepted order as `'ready_for_pickup'`, signaling readiness for transporters.
*   **Success Response** (200 OK): `{"message": "Order marked ready for pickup successfully."}`

#### `GET /api/farmer/wallet`
Retrieves farmer balance and escrow totals. (Creates wallet profiles lazily on first access).
*   **Success Response** (200 OK): Returns wallet metadata.

#### `POST /api/farmer/wallet/withdraw`
Deducts money from the settled balance and records a MTN Mobile Money (MoMo) withdrawal.
*   **Request Body**:
    ```json
    {
      "amount": 150.00,
      "phone": "0240000000"
    }
    ```
*   **Success Response** (200 OK): `{"message": "Withdrawal successful.", "new_balance": 350.00}`

#### `GET /api/farmer/wallet/history`
Returns the farmer's log of activities and transactions from the `history` table.
*   **Success Response** (200 OK): Returns audit array.

#### `GET /api/farmer/ratings`
Retrieves reviews and comments left on the farmer.
*   **Success Response** (200 OK): Returns array of reviews with reviewer names.

#### `POST /api/farmer/ratings/:id/reply`
Posts a response/reply statement to a specific review left on the farmer.
*   **Request Body**: `{"reply": "Thank you for the fast trade!"}`
*   **Success Response** (200 OK): `{"message": "Reply posted successfully.", "rating": {...}}`

#### `GET /api/farmer/ratings/score`
Retrieves the aggregate rating score and count.
*   **Success Response** (200 OK): `{"average_rating": "5.0", "total_ratings": "1"}`

#### `GET /api/farmer/analytics`
Fetches analytical counters regarding the farmer's performance.
*   **Success Response** (200 OK):
    ```json
    {
      "total_listings": 12,
      "total_revenue": 45000.00,
      "average_hours_to_delivery": "2.4"
    }
    ```

---

### 4. Buyer Section Endpoints (`/api/buyer/*`)
*All buyer routes require `X-User-Id` header authentication and `'buyer'` role membership.*

#### `GET /api/buyer/listings`
Discovers active listings posted by farmers.
*   **Query Parameters (Optional)**: `crop_name`, `grade`, `price_min`, `price_max`, `region`, `limit` (default 10), `offset` (default 0).
*   **Success Response** (200 OK): Returns array of active crop listings.

#### `GET /api/buyer/market-insights`
Calculates average, minimum, and maximum market prices per crop name.
*   **Success Response** (200 OK): Identical format to farmer insights endpoint.

#### `POST /api/buyer/offers`
Places a bid (offer) on an active listing.
*   **Request Body**:
    ```json
    {
      "listings_id": 4,
      "price": 325.00,
      "quantity": 40,
      "pickup_by": "Tomorrow at 10am",
      "note": "Pre-funded"
    }
    ```
*   **Success Response** (201 Created): Returns the placed order record.

#### `PUT /api/buyer/offers/:id`
Updates parameters of an owned pending offer.
*   **Request Body**: Any editable fields (e.g. `price`, `quantity`, `pickup_by`, `note`).
*   **Success Response** (200 OK): Returns the updated order record.

#### `DELETE /api/buyer/offers/:id`
Cancels (deletes) a pending offer before farmer acceptance.
*   **Success Response** (200 OK): `{"message": "Offer cancelled successfully."}`

#### `GET /api/buyer/orders`
Retrieves orders placed by the logged-in buyer.
*   **Query Parameters (Optional)**: `status`, `limit` (default 10), `offset` (default 0).
*   **Success Response** (200 OK): Returns array of order records.

#### `POST /api/buyer/orders/:id/fund`
Locks funds into escrow via Mobile Money for an accepted order. Marks payment record status as `'funded'` and order status as `'escrow_funded'`.
*   **Request Body**:
    ```json
    {
      "transaction_id": "MOMO-TX-1004"
    }
    ```
*   **Success Response** (200 OK): `{"message": "Escrow pre-funded successfully.", "order_id": 5, "transaction_id": "MOMO-TX-1004"}`

#### `GET /api/buyer/payments`
Retrieves details of payments funded by the buyer.
*   **Success Response** (200 OK): Returns payment history logs.

#### `POST /api/buyer/ratings`
Submits a rating on a farmer (enforces that a trade history exists between both users).
*   **Request Body**:
    ```json
    {
      "rated_user_id": 10,
      "score": 5,
      "comment": "Superb transaction!"
    }
    ```
*   **Success Response** (201 Created): Returns the ratings record.

#### `GET /api/buyer/farmers/:id`
Retrieves a farmer's profile, including reviews and aggregate rating score.
*   **Success Response** (200 OK): Returns profile metadata, rating summaries, and review records.

#### `POST /api/buyer/orders/:id/dispute`
Raises a dispute on an order. Inserts a record into the `disputes` table and updates order status to `'disputed'`.
*   **Request Body**:
    ```json
    {
      "reason": "Damaged goods delivered"
    }
    ```
*   **Success Response** (201 Created): Returns the created dispute record.

#### `GET /api/buyer/analytics`
Fetches analytics regarding the buyer's trades.
*   **Success Response** (200 OK):
    ```json
    {
      "total_offers": 14,
      "bid_acceptance_rate": "85.7%",
      "total_escrow_funded": 24000.00
    }
    ```

---

### 5. Transporter Section Endpoints (`/api/transporter/*`)
*All transporter routes require `X-User-Id` header authentication and `'transporter'` role membership.*

#### `GET /api/transporter/jobs/available`
Finds available logistics jobs waiting for pickup.
*   **Query Parameters (Optional)**: `region` (filters jobs by the farmer's region).
*   **Success Response** (200 OK):
    ```json
    [
      {
        "job_id": 1,
        "distance_km": "45.50",
        "payout": "91.00",
        "job_status": "available",
        "crop_name": "Maize",
        "grade": "A",
        "pickup_location": "Offinso",
        "farmer_name": "Akosua Mensah",
        "farmer_region": "Ashanti"
      }
    ]
    ```

#### `POST /api/transporter/jobs/:id/claim`
Claims an available logistics job. Links the job to the transporter and transitions job and order status to `'assigned'`.
*   **Success Response** (200 OK):
    ```json
    {
      "message": "Logistics job claimed successfully.",
      "job_id": "1"
    }
    ```

#### `POST /api/transporter/jobs/:id/confirm-pickup`
Confirms crop pickup at the farmer's site by scanning and matching the job's `qr_pickup` string. Transitions job and order status to `'picked_up'`.
*   **Request Body**:
    ```json
    {
      "qr_code": "QR-PICKUP-5-432"
    }
    ```
*   **Success Response** (200 OK):
    ```json
    {
      "message": "Pickup confirmed. Crop is in transit.",
      "job_id": "1"
    }
    ```

#### `POST /api/transporter/jobs/:id/confirm-delivery`
Confirms crop delivery at the buyer's site by scanning and matching the job's `qr_delivery` string. Transitions statuses to `'delivered'`, updates payment status to `'confirmed'`, and triggers Automatic Escrow Release (escrow_balance transferred to settled balance in Farmer's wallet) and Transporter Payout (job payout added to Transporter's wallet balance).
*   **Request Body**:
    ```json
    {
      "qr_code": "QR-DELIVERY-5-876"
    }
    ```
*   **Success Response** (200 OK):
    ```json
    {
      "message": "Delivery confirmed. Escrow released to farmer and payout transferred to transporter.",
      "job_id": "1"
    }
    ```

#### `GET /api/transporter/earnings`
Retrieves logs of completed jobs and payout values.
*   **Success Response** (200 OK):
    ```json
    [
      {
        "job_id": 1,
        "distance_km": "45.50",
        "payout": "91.00",
        "completed_at": "2026-06-26T04:15:00.000Z",
        "crop_name": "Maize",
        "grade": "A",
        "pickup_location": "Offinso"
      }
    ]
    ```

#### `GET /api/transporter/wallet`
Retrieves transporter wallet metadata and withdrawable balance. (Creates wallet profiles lazily on first access).
*   **Success Response** (200 OK):
    ```json
    {
      "wallet_id": 3,
      "user_id": 15,
      "balance": "91.00",
      "escrow_balance": "0.00",
      "created_at": "2026-06-26T04:10:00.000Z",
      "updated_at": "2026-06-26T04:15:00.000Z"
    }
    ```

#### `POST /api/transporter/wallet/withdraw`
Deducts money from the settled balance and initiates a Mobile Money (MoMo) withdrawal.
*   **Request Body**:
    ```json
    {
      "amount": 50.00,
      "phone": "0245555555"
    }
    ```
*   **Success Response** (200 OK):
    ```json
    {
      "message": "Withdrawal successful.",
      "new_balance": 41.00
    }
    ```

#### `POST /api/transporter/ratings`
Submits a rating on a farmer or buyer involved in a completed job.
*   **Request Body**:
    ```json
    {
      "rated_user_id": 12,
      "score": 5,
      "comment": "Good trade!"
    }
    ```
*   **Success Response** (201 Created):
    ```json
    {
      "rating_id": 8,
      "user_id": 15,
      "rated_user_id": 12,
      "score": 5,
      "comment": "Good trade!",
      "reply": null,
      "created_at": "2026-06-26T04:20:00.000Z"
    }
    ```

#### `GET /api/transporter/ratings`
Gets reviews left for this transporter.
*   **Success Response** (200 OK):
    ```json
    [
      {
        "rating_id": 9,
        "score": 5,
        "comment": "Fast and safe delivery!",
        "created_at": "2026-06-26T04:30:00.000Z",
        "reviewer_name": "Akosua Mensah"
      }
    ]
    ```

#### `GET /api/transporter/analytics`
Calculates total completed jobs, total earnings, and average delivery hours.
*   **Success Response** (200 OK):
    ```json
    {
      "total_jobs_completed": 5,
      "total_earnings": 455.00,
      "average_delivery_hours": 1.8
    }
    ```

---

## ⚙️ Environment Variables

The backend relies on the following environment variables defined in your `.env` configuration file:

```ini
PORT=5000                              # The port the Express application runs on
DB_USER=postgres.umtimrvqomvnutsgajub  # Supabase Postgres database user / project ref
DB_HOST=aws-0-eu-west-1.pooler.supabase.com  # Transaction pooler connection host
DB_NAME=postgres                       # Target Postgres database name
DB_PASSWORD=YourPasswordHere           # Supabase database master password
DB_PORT=5432                           # Standard PostgreSQL port
```
