FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml ./
COPY src ./src
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir ".[embedded-db,ldap]"

ENV LENS_DATA_DIR=/var/lib/lens
ENV LENS_CACHE_DIR=/var/cache/lens
ENV LENS_LOG_DIR=/var/log/lens
VOLUME ["/var/lib/lens", "/var/cache/lens", "/var/log/lens"]
EXPOSE 8081

CMD ["python", "-m", "uvicorn", "llm_d_lens.api:app", "--host", "0.0.0.0", "--port", "8081"]