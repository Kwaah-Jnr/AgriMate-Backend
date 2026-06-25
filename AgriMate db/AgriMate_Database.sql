-- 1. Users table
CREATE TABLE users (
	user_id SERIAL PRIMARY KEY,
	username VARCHAR(50) UNIQUE NOT NULL,
	phone_number VARCHAR(20) UNIQUE,
	email VARCHAR(255) UNIQUE,
	pin VARCHAR(4) NOT NULL, -- store hashed PIN
	is_active BOOLEAN DEFAULT TRUE, -- soft delete flag
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- 2. Roles table
CREATE TYPE user_role AS ENUM ('farmer', 'buyer');

CREATE TABLE roles (
	role_id SERIAL PRIMARY KEY,
	user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
	role user_role NOT NULL

);

-- 3. Listings table
CREATE TABLE listings (
	listing_id SERIAL PRIMARY KEY,
	user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
	crop_name VARCHAR(100) NOT NULL,
	quantity INT NOT NULL,
	price DECIMAL(10,2) NOT NULL,
	image_url TEXT,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- 4. Orders table
CREATE TABLE orders (
	order_id SERIAL PRIMARY KEY,
	buyer_id INT REFERENCES users(user_id) ON DELETE CASCADE,
	listings_id INT REFERENCES listings(listing_id) ON DELETE CASCADE,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- 5. Payments table
CREATE TABLE payments(
	payment_id SERIAL PRIMARY KEY,
	order_id INT REFERENCES orders(order_id) ON DELETE CASCADE,
	transaction_id VARCHAR(100) UNIQUE,
	status VARCHAR(20) DEFAULT 'pending',
	confirmed_at TIMESTAMP

);

--6. Ratings table
CREATE TABLE ratings (
	rating_id SERIAL PRIMARY KEY,
	user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
	rated_user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
	score INT CHECK (score BETWEEN 1 AND 5),
	comment TEXT,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- 7. OTP Codes table (for PIN reset)
CREATE TABLE otp_codes (
	otp_id SERIAL PRIMARY KEY,
	user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
	code VARCHAR(6) NOT NULL,
	expires_at TIMESTAMP NOT NULL,
	used BOOLEAN DEFAULT FALSE

);

-- 8. History table (transaction log)
CREATE TABLE history (
	history_id SERIAL PRIMARY KEY,
	user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
	action_type VARCHAR(50) NOT NULL, -- eg. 'order_created', 'payment_confirmed'
	reference_id INT, -- links to order_id, payment_id, rating_id, etc
	description TEXT, -- human-readable summary
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);