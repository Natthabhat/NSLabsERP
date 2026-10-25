FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-fund --no-audit && mkdir /data /export && chown pwuser:pwuser /data /export
COPY server.mjs ./
USER pwuser
ENV NODE_ENV=production HOME=/home/pwuser
EXPOSE 3020
CMD ["xvfb-run", "-a", "node", "server.mjs"]
