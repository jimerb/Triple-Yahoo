FROM node:24-alpine
WORKDIR /app
COPY engine.mjs ./engine.mjs
COPY sounds/dice-on-felt.wav ./sounds/dice-on-felt.wav
COPY experiments/casting ./experiments/casting
ENV HOST=0.0.0.0 PORT=8080
USER node
EXPOSE 8080
CMD ["node", "experiments/casting/server.mjs"]
