# Zhentan Server

Express backend that handles queue and invoice file I/O. Run this server on a host with a writable filesystem and point the client at it for transactions, queue, execute, and invoices and invoking OpenClaw agent after primary screening by this server

## Setup

1. Install and configure env:

   ```bash
   cd server
   npm install
   cp .env.example .env
   # Edit .env: 
   #            AGENT_PRIVATE_KEY, PIMLICO_API_KEY, ZERION_API_KEY, PORT
   ```

2. Ensure queue files exist and are writable, e.g.:

   ```bash
   mkdir -p data
   echo '{"pending":[]}' > data/pending-queue.json
   echo '{"invoices":[]}' > data/invoice-queue.json
   ```

3. Run:

   ```bash
   npm run dev   # development (tsx watch)
   # or
   npm run build && npm start
   ```

