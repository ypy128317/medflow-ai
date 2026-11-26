FROM node:20-alpine AS frontend
WORKDIR /build
COPY web/package*.json ./web/
RUN cd web && npm ci
COPY web/ ./web/
RUN cd web && npm run build
COPY portal/package*.json ./portal/
RUN cd portal && npm ci
COPY portal/ ./portal/
RUN cd portal && npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 TZ=Asia/Shanghai \
    PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ /app/backend/
COPY --from=frontend /build/web/dist /app/web/dist
COPY --from=frontend /build/portal/dist /app/portal/dist
RUN mkdir -p /data
ENV DATABASE_URL=sqlite:////data/medflow.db
WORKDIR /app/backend
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
