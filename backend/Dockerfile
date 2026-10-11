FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/app/data
ENV UPLOAD_DIR=/app/data/uploads

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY support-server.js ./
COPY staff ./staff
RUN mkdir -p /app/data/uploads && chown -R node:node /app

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "support-server.js"]
