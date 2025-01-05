# Arbitrum-BitLayer Bridge

A cross-chain bridge project for transferring USDT between Arbitrum and BitLayer networks.

## Requirements

- Node.js >= 14
- Yarn

## Project Structure

```
.
├── frontend/    # React frontend application
└── backend/     # Node.js backend service
```

## Configuration

### Backend Configuration (backend/.env)

```env
ARBITRUM_RPC=             # Arbitrum RPC URL
BITLAYER_RPC=            # BitLayer RPC URL
BRIDGE_WALLET_ADDRESS=    # Bridge wallet address
PRIVATE_KEY=             # Bridge wallet private key
USDT_BITLAYER_ADDRESS=   # USDT contract address on BitLayer
USDT_ARBITRUM_ADDRESS=   # USDT contract address on Arbitrum
PORT=3301                # Backend service port
```

### Frontend Configuration (frontend/.env)

```env
REACT_APP_BRIDGE_WALLET_ADDRESS=  # Bridge wallet address
REACT_APP_USDT_ADDRESS=          # USDT contract address
REACT_APP_ARBITRUM_RPC=         # Arbitrum RPC URL
REACT_APP_BITLAYER_RPC=        # BitLayer RPC URL
```

## Installation

Install all dependencies (frontend and backend):

```bash
yarn install
yarn install:all
```

Or install separately:

```bash
# Install frontend dependencies
yarn frontend:install

# Install backend dependencies
yarn backend:install
```

## Running the Project

### Development Environment

Run both frontend and backend:

```bash
yarn dev
```

Run separately:

```bash
# Run frontend (default port: 3000)
yarn frontend

# Run backend (default port: 3301)
yarn backend
```

## Access the Application

- Frontend: http://localhost:3300
- Backend API: http://localhost:3301 