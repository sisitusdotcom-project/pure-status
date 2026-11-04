FROM node:20-bullseye-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev
COPY worker/ ./worker/
CMD ["node", "worker/index.js"]

