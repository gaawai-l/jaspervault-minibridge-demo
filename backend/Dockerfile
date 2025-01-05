# Base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Set environment variables
ENV PORT=8080
ENV ARBITRUM_RPC=https://arb1.arbitrum.io/rpc
ENV BITLAYER_RPC=https://rpc.bitlayer.org
ENV BRIDGE_WALLET_ADDRESS=0x9852513815fd49AdE1C6A6A98851617Ff4a2e8a9
ENV USDT_BITLAYER_ADDRESS=0xfe9f969faf8ad72a83b761138bf25de87eff9dd2
ENV USDT_ARBITRUM_ADDRESS=0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install

# Copy source code
COPY . .

# Build TypeScript
RUN yarn build

# Expose port
EXPOSE 8080

# Start application
CMD ["yarn", "start"] 