# Used only for the local docker-compose setup.
# On EC2 we run the same code directly with Node.js + systemd (no Docker).
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
