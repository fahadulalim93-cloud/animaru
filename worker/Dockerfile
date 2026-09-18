FROM node:20-alpine
WORKDIR /app
COPY luffytv-proxy.js .
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node", "luffytv-proxy.js"]
