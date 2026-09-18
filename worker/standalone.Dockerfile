FROM node:20-alpine
WORKDIR /app
COPY luffytv-proxy-standalone.cjs ./luffytv-proxy-standalone.cjs
ENV PORT=8081
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8081/health || exit 1
CMD ["node", "luffytv-proxy-standalone.cjs"]
