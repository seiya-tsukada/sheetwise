FROM node:22-alpine
WORKDIR /app

# 開発サーバーの待ち受け設定（vite.config.ts が参照）。
# コンテナ外からのポート転送を受けるため、コンテナ内では全インターフェースで待ち受ける。
# ホスト側の公開は docker-compose.yml で 127.0.0.1 に限定している。
ENV DEV_SERVER_HOST=0.0.0.0
ENV DEV_SERVER_PORT=5173

# ロックファイルどおりの依存をイメージに焼き込む（レイヤーキャッシュ用に先にコピー）
COPY package.json package-lock.json ./
RUN npm ci

# ソースを同梱（docker compose ではホストのソースをマウントして上書きする）
COPY . .

EXPOSE 5173

# 起動時に依存をロックファイルと同期してから開発サーバーを起動する。
# docker compose では node_modules を名前付きボリュームで保持しているため、
# package.json / package-lock.json の変更は再起動時にここで反映される。
CMD ["sh", "-c", "npm install --no-audit --no-fund && npm run dev"]
