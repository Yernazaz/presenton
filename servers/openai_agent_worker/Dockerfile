FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Build step if needed, but we use tsx for dev/lite
# For production, we can use tsx too as it's simple agent
CMD ["npm", "start"]
